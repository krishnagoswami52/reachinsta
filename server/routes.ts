import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import subscriptionRouter from "./routes/subscription";
import { z } from "zod";
import { planLimits, type PlanType, type RoleType } from "@shared/schema";
import {
  MAX_CONCURRENT_JOBS,
  estimateQueueWaitSeconds,
  estimatedCostForPlan,
  planForPriority,
  priorityForPlan,
  queuePositionMessage,
} from "@shared/queue";
import { fetchLimiter } from "./middleware/rate-limit";
import { messageForCode } from "./utils/errorMessages";

const addCompetitorSchema = z.object({
  username: z.string().min(1).max(30).regex(/^[a-zA-Z0-9._@]+$/),
});

const bulkAddCompetitorSchema = z.object({
  usernames: z.array(z.string().min(1).max(30)).min(1).max(100),
});

const fetchDataSchema = z.object({
  timeRangeDays: z.number().refine((v) => [7, 14, 28].includes(v), {
    message: "Time range must be 7, 14, or 28 days",
  }),
  competitors: z
    .array(z.string().min(1).max(30).regex(/^[a-zA-Z0-9._@]+$/))
    .min(1)
    .max(100)
    .optional(),
});

const updatePlanSchema = z.object({
  plan: z.enum(["free", "plus", "pro"]),
});

const updateLimitsSchema = z.object({
  maxCompetitors: z.number().int().min(1).max(1000).optional(),
  monthlyFetchLimit: z.number().int().min(0).max(100).optional(),
  timeRangeMaxDays: z.number().refine((v) => [7, 14, 28].includes(v)).optional(),
  csvExport: z.boolean().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
if (!SUPER_ADMIN_EMAIL) {
  throw new Error("SUPER_ADMIN_EMAIL env var is required");
}
const ADMIN_EMAILS: string[] = [SUPER_ADMIN_EMAIL];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  app.use(subscriptionRouter);

  app.get("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.claims.email;
      
      let profile = await storage.getProfile(userId);
      
      if (!profile) {
        const normalizedEmail = email?.toLowerCase() || null;
        const isAdmin = !!normalizedEmail && ADMIN_EMAILS.includes(normalizedEmail);
        profile = await storage.upsertProfile({
          id: userId,
          email: normalizedEmail,
          role: isAdmin ? "admin" : "user",
          plan: isAdmin ? "pro" : "free",
        });
      } else {
        const normalizedEmail = (email || profile.email || "").toLowerCase();
        const isAdminEmail = !!normalizedEmail && ADMIN_EMAILS.includes(normalizedEmail);

        if (isAdminEmail && profile.role !== "admin") {
          profile =
            (await storage.updateProfile(userId, {
              role: "admin",
            })) || profile;
        }
      }
      
      if (profile.fetchesResetAt && new Date() >= profile.fetchesResetAt) {
        const nextReset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
        profile = await storage.updateProfile(userId, {
          fetchesUsed: 0,
          fetchesResetAt: nextReset,
        }) || profile;
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/competitors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const competitors = await storage.getCompetitors(userId);
      res.json(competitors);
    } catch (error) {
      console.error("Error fetching competitors:", error);
      res.status(500).json({ message: "Failed to fetch competitors" });
    }
  });

  app.post("/api/competitors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const parseResult = addCompetitorSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Invalid input" });
      }
      const { username } = parseResult.data;
      
      const profile = await storage.getProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      const currentCount = await storage.getCompetitorCount(userId);
      if (currentCount >= profile.maxCompetitors) {
        return res.status(403).json({ message: "Competitor limit reached. Upgrade your plan." });
      }
      
      const competitor = await storage.addCompetitor({
        userId,
        username: username.toLowerCase().replace("@", ""),
      });
      
      res.json(competitor);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "Competitor already exists" });
      }
      console.error("Error adding competitor:", error);
      res.status(500).json({ message: "Failed to add competitor" });
    }
  });

  app.post("/api/competitors/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const parseResult = bulkAddCompetitorSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Invalid input" });
      }
      const { usernames } = parseResult.data;
      
      const profile = await storage.getProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      const currentCount = await storage.getCompetitorCount(userId);
      const availableSlots = profile.maxCompetitors - currentCount;
      
      if (availableSlots <= 0) {
        return res.status(403).json({ message: "Competitor limit reached. Upgrade your plan." });
      }
      
      const toAdd = usernames
        .slice(0, availableSlots)
        .map((u: string) => ({
          userId,
          username: u.toLowerCase().replace("@", ""),
        }));
      
      const added = await storage.addCompetitors(toAdd);
      res.json({ added: added.length, skipped: usernames.length - added.length });
    } catch (error) {
      console.error("Error adding competitors:", error);
      res.status(500).json({ message: "Failed to add competitors" });
    }
  });

  app.delete("/api/competitors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(`[DELETE /api/competitors] Removing all competitors for user: ${userId}`);
      await storage.removeAllCompetitors(userId);
      console.log(`[DELETE /api/competitors] Successfully removed all competitors for user: ${userId}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing all competitors:", error);
      res.status(500).json({ message: "Failed to remove competitors" });
    }
  });

  app.delete("/api/competitors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      const removed = await storage.removeCompetitor(id, userId);
      if (!removed) {
        return res.status(404).json({ message: "Competitor not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing competitor:", error);
      res.status(500).json({ message: "Failed to remove competitor" });
    }
  });

  app.post("/api/fetch", isAuthenticated, fetchLimiter, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const parseResult = fetchDataSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Invalid input" });
      }
      const { timeRangeDays, competitors: providedCompetitors } = parseResult.data;
      
      const profile = await storage.getProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      if (timeRangeDays > profile.timeRangeMaxDays) {
        return res.status(403).json({ message: "Time range not allowed on your plan" });
      }
      
      if (profile.fetchesUsed >= profile.monthlyFetchLimit) {
        return res.status(403).json({ message: "Monthly fetch limit reached" });
      }
      
      const trackedCompetitors = await storage.getCompetitors(userId);
      if (trackedCompetitors.length === 0) {
        return res.status(400).json({ message: "Add competitors first" });
      }

      let competitorUsernames: string[];

      if (providedCompetitors && providedCompetitors.length > 0) {
        // Client-supplied usernames must be a subset of the user's tracked
        // competitors — otherwise anyone could burn Apify budget on arbitrary handles
        const tracked = new Set(trackedCompetitors.map((c) => c.username));
        const requested = Array.from(
          new Set(providedCompetitors.map((u) => u.toLowerCase().replace("@", "")))
        );
        const notOwned = requested.filter((u) => !tracked.has(u));
        if (notOwned.length > 0) {
          return res.status(403).json({
            message: "Some requested competitors are not in your tracked list",
            code: "COMPETITOR_NOT_OWNED",
          });
        }
        competitorUsernames = requested;
      } else {
        competitorUsernames = trackedCompetitors.map((c) => c.username);
      }

      if (competitorUsernames.length > profile.maxCompetitors) {
        return res.status(403).json({
          message: "Competitor count exceeds your plan limit. Upgrade to fetch more.",
          code: "PLAN_LIMIT_COMPETITORS",
        });
      }
      
      const fetchRun = await storage.createFetchRun({
        userId,
        timeRangeDays,
        competitorUsernames,
        status: "queued",
      });
      
      // Scheduling class is frozen here, from the plan the user holds at the
      // moment they enqueue. Deriving it later would let a mid-queue upgrade
      // reorder work other users are already waiting behind.
      await storage.createJob({
        userId,
        fetchRunId: fetchRun.id,
        type: "fetch_apify",
        status: "queued",
        attempts: 0,
        priority: priorityForPlan(profile.plan),
        estimatedApifyCost: estimatedCostForPlan(profile.plan).toFixed(4),
      });
      
      await storage.updateProfile(userId, {
        fetchesUsed: profile.fetchesUsed + 1,
      });
      
      res.json(fetchRun);
    } catch (error) {
      console.error("Error creating fetch:", error);
      res.status(500).json({ message: "Failed to create fetch" });
    }
  });

  /**
   * Live queue telemetry for one fetch run.
   *
   * Registered ahead of /api/fetch/:id so the literal path is not swallowed by
   * the parameterised route.
   *
   * Takes run_id (what the dashboard already holds, and what every other fetch
   * route keys on); job_id is accepted as an alias for the underlying work
   * item. Everything it returns is derived — no new state, and no change to
   * the shape of POST /api/fetch.
   */
  app.get("/api/fetch/queue-position", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const runId = typeof req.query.run_id === "string" ? req.query.run_id : undefined;
      const jobId = typeof req.query.job_id === "string" ? req.query.job_id : undefined;

      if (!runId && !jobId) {
        return res.status(400).json({ message: "run_id or job_id is required" });
      }

      const job = runId
        ? await storage.getJobByFetchRun(runId)
        : await storage.getJob(jobId!);

      if (!job || job.userId !== userId) {
        return res.status(404).json({ message: "Fetch run not found" });
      }

      const profile = await storage.getProfile(userId);
      const plan: PlanType = profile?.plan ?? "free";

      // The frozen priority is what the scheduler actually orders by, so the
      // tier it maps to is the honest description of this job's treatment —
      // even if the user's plan changed after they queued.
      const queuePlan = planForPriority(job.priority);

      const workerSlotsBusy = await storage.countRunningJobs();

      if (job.status !== "queued") {
        // running / completed / failed all leave the queue behind.
        const fetchRun = await storage.getFetchRun(job.fetchRunId);
        return res.json({
          status: fetchRun?.status ?? job.status,
          position: 0,
          ahead_of_you: 0,
          estimated_wait_seconds: 0,
          worker_slots_busy: workerSlotsBusy,
          worker_slots_total: MAX_CONCURRENT_JOBS,
          your_priority: plan,
          queue_priority: job.priority,
          message:
            job.status === "running"
              ? "Your fetch is running now."
              : job.status === "completed"
              ? "Fetch complete."
              : "This fetch is no longer in the queue.",
        });
      }

      const ahead = await storage.countJobsAheadInQueue(job.priority, job.createdAt);
      const position = ahead + 1;

      const estimatedWaitSeconds = estimateQueueWaitSeconds(position, workerSlotsBusy);

      res.json({
        status: "queued",
        position,
        ahead_of_you: ahead,
        estimated_wait_seconds: estimatedWaitSeconds,
        worker_slots_busy: workerSlotsBusy,
        worker_slots_total: MAX_CONCURRENT_JOBS,
        your_priority: plan,
        queue_priority: job.priority,
        message: queuePositionMessage(position, estimatedWaitSeconds, queuePlan),
      });
    } catch (error) {
      console.error("Error reading queue position:", error);
      res.status(500).json({ message: "Failed to read queue position" });
    }
  });

  app.get("/api/fetch/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const fetchRuns = await storage.getAllFetchRuns(userId);
      res.json(fetchRuns);
    } catch (error) {
      console.error("Error fetching history:", error);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  app.get("/api/fetch/latest", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const fetchRun = await storage.getLatestFetchRun(userId);
      if (!fetchRun) {
        return res.json(null);
      }
      
      const reels = await storage.getReelsByFetchRun(fetchRun.id);
      const stats = await storage.getCompetitorStatsByFetchRun(fetchRun.id);
      
      res.json({ fetchRun, reels, stats });
    } catch (error) {
      console.error("Error fetching latest:", error);
      res.status(500).json({ message: "Failed to fetch latest run" });
    }
  });

  app.get("/api/fetch/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      const fetchRun = await storage.getFetchRun(id);
      if (!fetchRun || fetchRun.userId !== userId) {
        return res.status(404).json({ message: "Fetch run not found" });
      }
      
      const reels = await storage.getReelsByFetchRun(id);
      const stats = await storage.getCompetitorStatsByFetchRun(id);
      
      res.json({ fetchRun, reels, stats });
    } catch (error) {
      console.error("Error fetching run:", error);
      res.status(500).json({ message: "Failed to fetch run details" });
    }
  });

  app.post("/api/fetch/:id/cancel", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      const fetchRun = await storage.getFetchRun(id);
      if (!fetchRun || fetchRun.userId !== userId) {
        return res.status(404).json({ message: "Fetch run not found" });
      }

      if (fetchRun.status === "completed" || fetchRun.status === "failed") {
        return res.status(400).json({ message: "Fetch has already finished and cannot be cancelled" });
      }

      const queuedJobs = await storage.getQueuedJobs();
      const job = queuedJobs.find((j) => j.fetchRunId === fetchRun.id && j.userId === userId);

      if (job) {
        await storage.updateJob(job.id, {
          status: "failed",
          attempts: job.attempts,
          lastError: "Cancelled by user",
        });
      }

      const updatedFetchRun = await storage.updateFetchRun(fetchRun.id, {
        status: "failed",
        errorMessage: messageForCode("FETCH_CANCELLED"),
        internalErrorCode: "FETCH_CANCELLED",
      });

      res.json(updatedFetchRun || fetchRun);
    } catch (error) {
      console.error("Error cancelling fetch:", error);
      res.status(500).json({ message: "Failed to cancel fetch" });
    }
  });

  const isAdmin = async (req: any, res: any, next: any) => {
    const userId = req.user.claims.sub;
    const email = req.user.claims.email?.toLowerCase();

    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
    const isAdminEmail =
      (!!email && ADMIN_EMAILS.includes(email)) || (!!email && !!superAdminEmail && email === superAdminEmail);

    let profile = await storage.getProfile(userId);

    if (!profile) {
      profile = await storage.upsertProfile({
        id: userId,
        email,
        role: isAdminEmail ? "admin" : "user",
        plan: isAdminEmail ? "pro" : "free",
      });
    } else if (isAdminEmail && profile.role !== "admin") {
      profile = (await storage.updateProfile(userId, {
        role: "admin",
        plan: "pro",
      })) || profile;
    }

    const hasAdminRole = profile.role === "admin";

    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  };

  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const profiles = await storage.getAllProfiles();
      const usersWithCounts = await Promise.all(
        profiles.map(async (profile) => ({
          ...profile,
          competitorsCount: await storage.getCompetitorCount(profile.id),
        }))
      );
      res.json(usersWithCounts);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:id/plan", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const parseResult = updatePlanSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid plan" });
      }
      const { plan } = parseResult.data;
      
      const limits = planLimits[plan as PlanType];
      const profile = await storage.updateProfile(id, {
        plan,
        maxCompetitors: limits.maxCompetitors,
        monthlyFetchLimit: limits.monthlyFetchLimit,
        timeRangeMaxDays: limits.timeRangeMaxDays,
        csvExport: limits.csvExport,
      });
      
      if (!profile) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error updating plan:", error);
      res.status(500).json({ message: "Failed to update plan" });
    }
  });

  app.post("/api/admin/users/:id/limits", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const parseResult = updateLimitsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Invalid input" });
      }
      const { maxCompetitors, monthlyFetchLimit, timeRangeMaxDays, csvExport } = parseResult.data;
      
      const profile = await storage.updateProfile(id, {
        maxCompetitors,
        monthlyFetchLimit,
        timeRangeMaxDays,
        csvExport,
      });
      
      if (!profile) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error updating limits:", error);
      res.status(500).json({ message: "Failed to update limits" });
    }
  });

  app.post("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const parseResult = updateRoleSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const { role } = parseResult.data;
      
      const requestingUser = (req.user.claims.email || "").toLowerCase();
      const isSuperAdmin = requestingUser === SUPER_ADMIN_EMAIL;
      
      if (role === "admin" && !isSuperAdmin) {
        return res.status(403).json({ message: "Only super admin can assign admin role" });
      }
      
      const profile = await storage.updateProfile(id, { role: role as RoleType });
      
      if (!profile) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.get("/api/export/reels.csv", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const runId = req.query.runId as string;
      
      const profile = await storage.getProfile(userId);
      if (!profile?.csvExport && profile?.role !== "admin") {
        return res.status(403).json({ message: "CSV export requires Pro plan" });
      }
      
      const fetchRun = await storage.getFetchRun(runId);
      if (!fetchRun || fetchRun.userId !== userId) {
        return res.status(404).json({ message: "Fetch run not found" });
      }
      
      const reels = await storage.getReelsByFetchRun(runId);
      
      const headers = ["Username", "Reel URL", "Views", "Likes", "Comments", "Duration", "Engagement Rate", "Viral Score", "Posted At"];
      const rows = reels.map((r) => [
        r.username,
        r.reelUrl,
        r.views,
        r.likes,
        r.comments,
        r.durationSeconds,
        r.engagementRate,
        r.viralScore,
        r.postedAt?.toISOString() || "",
      ]);
      
      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=reels-${runId}.csv`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting reels:", error);
      res.status(500).json({ message: "Failed to export reels" });
    }
  });

  app.get("/api/export/competitors.csv", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const runId = req.query.runId as string;
      
      const profile = await storage.getProfile(userId);
      if (!profile?.csvExport && profile?.role !== "admin") {
        return res.status(403).json({ message: "CSV export requires Pro plan" });
      }
      
      const fetchRun = await storage.getFetchRun(runId);
      if (!fetchRun || fetchRun.userId !== userId) {
        return res.status(404).json({ message: "Fetch run not found" });
      }
      
      const stats = await storage.getCompetitorStatsByFetchRun(runId);
      
      const headers = ["Username", "Followers", "Reels Count", "Avg Views", "Avg Engagement Rate", "Top Reel Views"];
      const rows = stats.map((s) => [
        s.username,
        s.followers || 0,
        s.reelsCount,
        s.avgViews,
        s.avgEngagementRate,
        s.topReelViews,
      ]);
      
      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=competitors-${runId}.csv`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting competitors:", error);
      res.status(500).json({ message: "Failed to export competitors" });
    }
  });

  return httpServer;
}
