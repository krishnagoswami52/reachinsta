import crypto from "crypto";
import { eq, asc, desc, and, or, lt, isNull, sql, count } from "drizzle-orm";
import { db } from "./db";
import {
  profiles, competitors, fetchRuns, reels, competitorStats, rawPayloads, jobs, apifyKeys,
  type Profile, type InsertProfile,
  type Competitor, type InsertCompetitor,
  type FetchRun, type InsertFetchRun,
  type Reel, type InsertReel,
  type CompetitorStats, type InsertCompetitorStats,
  type RawPayload, type InsertRawPayload,
  type Job, type InsertJob,
  type ApifyKey,
  planLimits,
  type PlanType,
  type PaymentProviderType,
} from "@shared/schema";
import { users, emailVerificationTokens, passwordResetTokens, type User, type UpsertUser } from "@shared/models/auth";

export type VerificationToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date | null;
};

/** Result of a password-reset attempt, including brute-force tracking signals. */
export type ResetPasswordResult = {
  success: boolean;
  error?: string;
  /** True when the user is temporarily blocked after too many failed attempts. */
  blocked?: boolean;
  /** Remaining attempts before the code is blocked (only on a wrong-code miss). */
  remaining?: number;
};

/** Max wrong-code submissions before a reset code is blocked. */
const MAX_RESET_ATTEMPTS = 5;
/** How long a code stays blocked after exhausting attempts. */
const RESET_BLOCK_MS = 60 * 60 * 1000; // 1 hour

/**
 * Constant-time comparison of two SHA-256 hex digests. Avoids leaking, via
 * response timing, how many leading characters of a guessed code hashed to the
 * stored value. Both inputs are fixed-length (64 hex chars / 32 bytes).
 */
function timingSafeHexEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUserEmailVerified(userId: string, verified: boolean): Promise<User | undefined>;
  updateUserEmail(userId: string, email: string): Promise<User | undefined>;
  updateUser(userId: string, updates: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }): Promise<User | undefined>;
  
  createVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<VerificationToken>;
  getVerificationTokenByHash(tokenHash: string): Promise<VerificationToken | undefined>;
  markVerificationTokenUsed(tokenId: string): Promise<void>;
  deleteVerificationTokensForUser(userId: string): Promise<void>;
  verifyEmailAtomic(tokenHash: string): Promise<{ success: boolean; error?: string; userId?: string }>;

  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<VerificationToken>;
  deletePasswordResetTokensForUser(userId: string): Promise<void>;
  resetPasswordAtomic(userId: string, tokenHash: string, newPasswordHash: string): Promise<ResetPasswordResult>;
  
  getProfile(id: string): Promise<Profile | undefined>;
  upsertProfile(profile: InsertProfile): Promise<Profile>;
  getAllProfiles(): Promise<Profile[]>;
  updateProfile(id: string, updates: Partial<InsertProfile>): Promise<Profile | undefined>;
  getProfileByPaddleCustomerId(customerId: string): Promise<Profile | undefined>;
  getProfileByRazorpaySubscriptionId(subscriptionId: string): Promise<Profile | undefined>;
  updateProfileSubscription(userId: string, data: {
    paddleCustomerId?: string;
    paddleSubscriptionId?: string | null;
    razorpaySubscriptionId?: string | null;
    paymentProvider?: PaymentProviderType | null;
    subscriptionStatus?: string;
    plan?: string;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    cancelAt?: Date | null;
    fetchesUsed?: number;
    periodResetAt?: Date | null;
  }): Promise<void>;
  
  getCompetitors(userId: string): Promise<Competitor[]>;
  getCompetitorCount(userId: string): Promise<number>;
  addCompetitor(competitor: InsertCompetitor): Promise<Competitor>;
  addCompetitors(competitors: InsertCompetitor[]): Promise<Competitor[]>;
  removeCompetitor(id: string, userId: string): Promise<boolean>;
  removeAllCompetitors(userId: string): Promise<void>;
  
  createFetchRun(run: InsertFetchRun): Promise<FetchRun>;
  getFetchRun(id: string): Promise<FetchRun | undefined>;
  getLatestFetchRun(userId: string): Promise<FetchRun | undefined>;
  getAllFetchRuns(userId: string): Promise<FetchRun[]>;
  updateFetchRun(id: string, updates: Partial<FetchRun>): Promise<FetchRun | undefined>;
  
  createReels(reelsList: InsertReel[]): Promise<Reel[]>;
  getReelsByFetchRun(fetchRunId: string): Promise<Reel[]>;
  
  createCompetitorStats(stats: InsertCompetitorStats[]): Promise<CompetitorStats[]>;
  getCompetitorStatsByFetchRun(fetchRunId: string): Promise<CompetitorStats[]>;
  
  createRawPayload(payload: InsertRawPayload): Promise<RawPayload>;
  
  createJob(job: InsertJob): Promise<Job>;
  getQueuedJobs(limit?: number): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  getJobByFetchRun(fetchRunId: string): Promise<Job | undefined>;
  countJobsAheadInQueue(priority: number, createdAt: Date): Promise<number>;
  countRunningJobs(): Promise<number>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined>;
  claimJob(jobId: string): Promise<Job | undefined>;
  getStuckJobs(staleBeforeMs: number): Promise<Job[]>;
  touchJob(jobId: string): Promise<void>;
  setJobApifyKey(jobId: string, apifyKeyId: string): Promise<void>;
  requeueStuckJob(jobId: string, attempts: number, lastError: string): Promise<Job | undefined>;
  failStuckJob(jobId: string, attempts: number, lastError: string): Promise<Job | undefined>;
  refundFetchCredit(userId: string): Promise<boolean>;

  // Apify key management
  upsertApifyKey(data: { token: string; totalBudget?: string }): Promise<ApifyKey>;
  getBestApifyKey(): Promise<ApifyKey | undefined>;
  getSelectableApifyKeys(): Promise<ApifyKey[]>;
  recordApifyKeyUsage(token: string, cost: number): Promise<number | undefined>;
  markApifyKeyExhausted(token: string): Promise<void>;
  getExhaustedApifyKeys(): Promise<ApifyKey[]>;
  resetApifyKeyForNewCycle(
    id: string,
    budget: { usedUsd: number; limitUsd: number },
    now: Date,
  ): Promise<void>;
  markApifyKeyResetChecked(id: string, now: Date): Promise<void>;
  getAllApifyKeys(): Promise<ApifyKey[]>;
}

export class DatabaseStorage implements IStorage {
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async createUser(user: UpsertUser): Promise<User> {
    const [result] = await db
      .insert(users)
      .values({
        ...user,
        email: user.email.toLowerCase(),
      })
      .returning();
    return result;
  }

  async updateUserEmailVerified(userId: string, verified: boolean): Promise<User | undefined> {
    const [result] = await db
      .update(users)
      .set({ emailVerified: verified, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return result;
  }

  async updateUserEmail(userId: string, email: string): Promise<User | undefined> {
    const [result] = await db
      .update(users)
      .set({ email: email.toLowerCase(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return result;
  }

  async updateUser(userId: string, updates: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }): Promise<User | undefined> {
    const [result] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return result;
  }

  async createVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<VerificationToken> {
    const [result] = await db
      .insert(emailVerificationTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return result;
  }

  async getVerificationTokenByHash(tokenHash: string): Promise<VerificationToken | undefined> {
    const [result] = await db
      .select()
      .from(emailVerificationTokens)
      .where(and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        sql`${emailVerificationTokens.usedAt} IS NULL`,
        sql`${emailVerificationTokens.expiresAt} > NOW()`
      ));
    return result;
  }

  async markVerificationTokenUsed(tokenId: string): Promise<void> {
    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, tokenId));
  }
  
  async verifyEmailAtomic(tokenHash: string): Promise<{ success: boolean; error?: string; userId?: string }> {
    return await db.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          sql`${emailVerificationTokens.usedAt} IS NULL`,
          sql`${emailVerificationTokens.expiresAt} > NOW()`
        ))
        .for("update");
      
      if (!token) {
        const [expiredOrUsed] = await tx
          .select()
          .from(emailVerificationTokens)
          .where(eq(emailVerificationTokens.tokenHash, tokenHash));
        
        if (!expiredOrUsed) {
          return { success: false, error: "Invalid verification code" };
        }
        if (expiredOrUsed.usedAt) {
          return { success: false, error: "This verification code has already been used" };
        }
        return { success: false, error: "This verification code has expired" };
      }
      
      await tx
        .update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(emailVerificationTokens.id, token.id));
      
      await tx
        .update(users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, token.userId));
      
      return { success: true, userId: token.userId };
    });
  }

  async deleteVerificationTokensForUser(userId: string): Promise<void> {
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
  }

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<VerificationToken> {
    const [result] = await db
      .insert(passwordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return result;
  }

  async deletePasswordResetTokensForUser(userId: string): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
  }

  async resetPasswordAtomic(
    userId: string,
    tokenHash: string,
    newPasswordHash: string,
  ): Promise<ResetPasswordResult> {
    return await db.transaction(async (tx) => {
      // Look the token up by user (not by hash) so a WRONG code still resolves to
      // the pending token and we can count the failed attempt against it. Only one
      // active token exists per user — a new code deletes prior ones — but order
      // by createdAt defensively in case of overlap.
      const [token] = await tx
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, userId))
        .orderBy(desc(passwordResetTokens.createdAt))
        .limit(1)
        .for("update");

      if (!token) {
        return { success: false, error: "Invalid or expired reset code" };
      }

      const now = new Date();

      // Hard block from previously exhausted attempts (checked before anything
      // else so a blocked code cannot be probed further until it's re-requested).
      if (token.blockedUntil && token.blockedUntil > now) {
        return {
          success: false,
          blocked: true,
          error: "Too many failed attempts. Request a new reset code.",
        };
      }

      if (token.usedAt) {
        return { success: false, error: "This reset code has already been used" };
      }
      if (token.expiresAt <= now) {
        return { success: false, error: "This reset code has expired" };
      }

      const matches = timingSafeHexEqual(tokenHash, token.tokenHash);

      if (!matches) {
        const newAttempts = token.attempts + 1;

        if (newAttempts >= MAX_RESET_ATTEMPTS) {
          // Exhausted — block the code for an hour. Keep the row (not marked used)
          // so the block above keeps rejecting probes until it expires or the user
          // requests a fresh code.
          await tx
            .update(passwordResetTokens)
            .set({ attempts: newAttempts, blockedUntil: new Date(now.getTime() + RESET_BLOCK_MS) })
            .where(eq(passwordResetTokens.id, token.id));

          return {
            success: false,
            blocked: true,
            error: "Too many failed attempts. Request a new reset code.",
          };
        }

        await tx
          .update(passwordResetTokens)
          .set({ attempts: newAttempts })
          .where(eq(passwordResetTokens.id, token.id));

        return {
          success: false,
          error: "Invalid or expired reset code",
          remaining: MAX_RESET_ATTEMPTS - newAttempts,
        };
      }

      // Correct code — consume it (one-time use) and set the new password.
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, token.id));

      await tx
        .update(users)
        .set({ passwordHash: newPasswordHash, updatedAt: now })
        .where(eq(users.id, userId));

      return { success: true };
    });
  }

  async getProfile(id: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
    return profile;
  }

  async upsertProfile(profile: InsertProfile): Promise<Profile> {
    const limits = planLimits[profile.plan || "free"];
    const [result] = await db
      .insert(profiles)
      .values({
        ...profile,
        maxCompetitors: profile.maxCompetitors ?? limits.maxCompetitors,
        monthlyFetchLimit: profile.monthlyFetchLimit ?? limits.monthlyFetchLimit,
        timeRangeMaxDays: profile.timeRangeMaxDays ?? limits.timeRangeMaxDays,
        csvExport: profile.csvExport ?? limits.csvExport,
        fetchesResetAt: profile.fetchesResetAt ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email: profile.email,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async getAllProfiles(): Promise<Profile[]> {
    return await db.select().from(profiles);
  }

  async updateProfile(id: string, updates: Partial<InsertProfile>): Promise<Profile | undefined> {
    const [result] = await db
      .update(profiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    return result;
  }

  async getProfileByPaddleCustomerId(customerId: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.paddleCustomerId, customerId));
    return profile;
  }

  async getProfileByRazorpaySubscriptionId(subscriptionId: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.razorpaySubscriptionId, subscriptionId));
    return profile;
  }

  async updateProfileSubscription(
    userId: string,
    data: {
      paddleCustomerId?: string;
      paddleSubscriptionId?: string | null;
      razorpaySubscriptionId?: string | null;
      paymentProvider?: PaymentProviderType | null;
      subscriptionStatus?: string;
      plan?: string;
      currentPeriodEnd?: Date | null;
      cancelAtPeriodEnd?: boolean;
      cancelAt?: Date | null;
      fetchesUsed?: number;
      periodResetAt?: Date | null;
    },
  ): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (data.paddleCustomerId !== undefined) updates.paddleCustomerId = data.paddleCustomerId;
    if (data.paddleSubscriptionId !== undefined) updates.paddleSubscriptionId = data.paddleSubscriptionId;
    if (data.razorpaySubscriptionId !== undefined) updates.razorpaySubscriptionId = data.razorpaySubscriptionId;
    if (data.paymentProvider !== undefined) updates.paymentProvider = data.paymentProvider;
    if (data.subscriptionStatus !== undefined) updates.subscriptionStatus = data.subscriptionStatus;
    if (data.currentPeriodEnd !== undefined) updates.currentPeriodEnd = data.currentPeriodEnd;
    if (data.cancelAtPeriodEnd !== undefined) updates.cancelAtPeriodEnd = data.cancelAtPeriodEnd;
    if (data.cancelAt !== undefined) updates.cancelAt = data.cancelAt;
    if (data.fetchesUsed !== undefined) updates.fetchesUsed = data.fetchesUsed;
    if (data.periodResetAt !== undefined) updates.periodResetAt = data.periodResetAt;

    // When plan changes, also update the derived limit columns
    if (data.plan !== undefined) {
      const newPlan = data.plan as PlanType;
      updates.plan = newPlan;
      if (planLimits[newPlan]) {
        const limits = planLimits[newPlan];
        updates.maxCompetitors = limits.maxCompetitors;
        updates.monthlyFetchLimit = limits.monthlyFetchLimit;
        updates.timeRangeMaxDays = limits.timeRangeMaxDays;
        updates.csvExport = limits.csvExport;
      }
    }

    await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.id, userId));
  }

  async getCompetitors(userId: string): Promise<Competitor[]> {
    return await db.select().from(competitors).where(eq(competitors.userId, userId));
  }

  async getCompetitorCount(userId: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(competitors).where(eq(competitors.userId, userId));
    return result?.count || 0;
  }

  async addCompetitor(competitor: InsertCompetitor): Promise<Competitor> {
    const [result] = await db.insert(competitors).values(competitor).returning();
    return result;
  }

  async addCompetitors(competitorsList: InsertCompetitor[]): Promise<Competitor[]> {
    if (competitorsList.length === 0) return [];
    return await db.insert(competitors).values(competitorsList).returning();
  }

  async removeCompetitor(id: string, userId: string): Promise<boolean> {
    const [result] = await db
      .delete(competitors)
      .where(and(eq(competitors.id, id), eq(competitors.userId, userId)))
      .returning();
    return !!result;
  }

  async removeAllCompetitors(userId: string): Promise<void> {
    console.log(`[Storage] Removing all competitors for userId: ${userId}`);
    await db
      .delete(competitors)
      .where(eq(competitors.userId, userId));
    console.log(`[Storage] Removed all competitors for userId: ${userId}`);
  }

  async createFetchRun(run: InsertFetchRun): Promise<FetchRun> {
    const [result] = await db.insert(fetchRuns).values(run).returning();
    return result;
  }

  async getFetchRun(id: string): Promise<FetchRun | undefined> {
    const [result] = await db.select().from(fetchRuns).where(eq(fetchRuns.id, id));
    return result;
  }

  async getLatestFetchRun(userId: string): Promise<FetchRun | undefined> {
    const [result] = await db
      .select()
      .from(fetchRuns)
      .where(eq(fetchRuns.userId, userId))
      .orderBy(desc(fetchRuns.createdAt))
      .limit(1);
    return result;
  }

  async getAllFetchRuns(userId: string): Promise<FetchRun[]> {
    return db
      .select()
      .from(fetchRuns)
      .where(eq(fetchRuns.userId, userId))
      .orderBy(desc(fetchRuns.createdAt));
  }

  async updateFetchRun(id: string, updates: Partial<FetchRun>): Promise<FetchRun | undefined> {
    const [result] = await db
      .update(fetchRuns)
      .set(updates)
      .where(eq(fetchRuns.id, id))
      .returning();
    return result;
  }

  async createReels(reelsList: InsertReel[]): Promise<Reel[]> {
    if (reelsList.length === 0) return [];
    try {
      return await db.insert(reels).values(reelsList).returning();
    } catch (error: any) {
      if (error.message?.includes('numeric field overflow')) {
        console.error('Numeric overflow error. Sample reel data:', JSON.stringify(reelsList[0], null, 2));
        for (const reel of reelsList) {
          console.error(`Reel ${reel.reelUrl}: views=${reel.views}, likes=${reel.likes}, comments=${reel.comments}, ER=${reel.engagementRate}, VS=${reel.viralScore}`);
        }
      }
      throw error;
    }
  }

  async getReelsByFetchRun(fetchRunId: string): Promise<Reel[]> {
    return await db
      .select()
      .from(reels)
      .where(eq(reels.fetchRunId, fetchRunId))
      .orderBy(desc(reels.viralScore));
  }

  async createCompetitorStats(stats: InsertCompetitorStats[]): Promise<CompetitorStats[]> {
    if (stats.length === 0) return [];
    try {
      return await db.insert(competitorStats).values(stats).returning();
    } catch (error: any) {
      if (error.message?.includes('numeric field overflow')) {
        console.error('Numeric overflow in competitor stats:', JSON.stringify(stats, null, 2));
      }
      throw error;
    }
  }

  async getCompetitorStatsByFetchRun(fetchRunId: string): Promise<CompetitorStats[]> {
    return await db
      .select()
      .from(competitorStats)
      .where(eq(competitorStats.fetchRunId, fetchRunId));
  }

  async createRawPayload(payload: InsertRawPayload): Promise<RawPayload> {
    const [result] = await db.insert(rawPayloads).values(payload).returning();
    return result;
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [result] = await db.insert(jobs).values(job).returning();
    return result;
  }

  /**
   * Pop the head of the priority queue.
   *
   * Ordering is (priority ASC, created_at ASC): a pro user's job outranks a
   * free user's regardless of who queued first, and within one priority it is
   * strict FIFO. Backed by idx_jobs_priority_queue.
   */
  async getQueuedJobs(limit = 10): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(asc(jobs.priority), asc(jobs.createdAt))
      .limit(limit);
  }

  async getJob(id: string): Promise<Job | undefined> {
    const [result] = await db.select().from(jobs).where(eq(jobs.id, id));
    return result;
  }

  /**
   * The work item behind a fetch run.
   *
   * Newest first: a run that was requeued by the stuck-job sweep, or retried,
   * still has exactly one job row, but ordering explicitly keeps this correct
   * if that ever stops being true.
   */
  async getJobByFetchRun(fetchRunId: string): Promise<Job | undefined> {
    const [result] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.fetchRunId, fetchRunId))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    return result;
  }

  /**
   * How many queued jobs would be popped before this one.
   *
   * Mirrors the ORDER BY in getQueuedJobs exactly — anything else would
   * report a position the scheduler does not honour.
   */
  async countJobsAheadInQueue(priority: number, createdAt: Date): Promise<number> {
    const [result] = await db
      .select({ n: count() })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "queued"),
          or(
            lt(jobs.priority, priority),
            and(eq(jobs.priority, priority), lt(jobs.createdAt, createdAt)),
          ),
        ),
      );
    return result?.n ?? 0;
  }

  /** Slots busy across the whole platform, not just this process. */
  async countRunningJobs(): Promise<number> {
    const [result] = await db.select({ n: count() }).from(jobs).where(eq(jobs.status, "running"));
    return result?.n ?? 0;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const [result] = await db
      .update(jobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return result;
  }

  async claimJob(jobId: string): Promise<Job | undefined> {
    const [result] = await db
      .update(jobs)
      .set({ status: "running", updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "queued")))
      .returning();
    return result;
  }

  /**
   * Jobs left in "running" with no heartbeat for longer than `staleBeforeMs`.
   *
   * A live worker heartbeats its job (see touchJob), so anything this returns
   * belongs to a worker that died — typically a deploy or crash mid-fetch.
   * Without this sweep those rows are invisible forever: getQueuedJobs only
   * looks at status="queued".
   */
  async getStuckJobs(staleBeforeMs: number): Promise<Job[]> {
    const cutoff = new Date(Date.now() - staleBeforeMs);
    return await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "running"), lt(jobs.updatedAt, cutoff)))
      .orderBy(jobs.updatedAt)
      .limit(50);
  }

  /**
   * Record which rotation key funded a job.
   *
   * Deliberately does not bump updated_at: that column is the heartbeat the
   * stuck-job sweep reads, and an attribution write must not be mistaken for
   * proof that the worker is alive.
   */
  async setJobApifyKey(jobId: string, apifyKeyId: string): Promise<void> {
    await db.update(jobs).set({ apifyKeyId }).where(eq(jobs.id, jobId));
  }

  /** Heartbeat: proves the owning worker is still alive so the sweep skips it. */
  async touchJob(jobId: string): Promise<void> {
    await db.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, jobId));
  }

  /**
   * running -> queued, conditional on the row still being "running".
   * The CAS means two workers sweeping at once cannot both requeue the same
   * job, and a worker that revives mid-sweep cannot be stolen from.
   */
  async requeueStuckJob(jobId: string, attempts: number, lastError: string): Promise<Job | undefined> {
    const [result] = await db
      .update(jobs)
      .set({ status: "queued", attempts, lastError, updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "running")))
      .returning();
    return result;
  }

  /** running -> failed, same CAS guarantee as requeueStuckJob. */
  async failStuckJob(jobId: string, attempts: number, lastError: string): Promise<Job | undefined> {
    const [result] = await db
      .update(jobs)
      .set({ status: "failed", attempts, lastError, updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "running")))
      .returning();
    return result;
  }

  /**
   * Give back one monthly fetch credit. Clamped at zero so a double refund can
   * never mint quota, and guarded on fetches_used > 0 so the no-op case is
   * reported honestly to the caller.
   */
  async refundFetchCredit(userId: string): Promise<boolean> {
    const result = await db
      .update(profiles)
      .set({
        fetchesUsed: sql`GREATEST(${profiles.fetchesUsed} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(and(eq(profiles.id, userId), sql`${profiles.fetchesUsed} > 0`))
      .returning({ id: profiles.id });
    return result.length > 0;
  }

  // Apify key management

  async upsertApifyKey(data: { token: string; totalBudget?: string }): Promise<ApifyKey> {
    const [result] = await db
      .insert(apifyKeys)
      .values({
        token: data.token,
        totalBudget: data.totalBudget ?? "5.0000",
      })
      .onConflictDoNothing({ target: apifyKeys.token })
      .returning();
    if (result) return result;
    // Already exists — return current row
    const [existing] = await db.select().from(apifyKeys).where(eq(apifyKeys.token, data.token));
    return existing;
  }

  /**
   * Every key still in the rotation, richest first.
   *
   * Selection policy lives in keyManager (it depends on the requesting user's
   * plan); this just hands over the candidate set. Returning the whole pool
   * rather than a single row is what makes it possible to spread five parallel
   * workers across five different tokens.
   */
  async getSelectableApifyKeys(): Promise<ApifyKey[]> {
    return await db
      .select()
      .from(apifyKeys)
      .where(eq(apifyKeys.isExhausted, false))
      .orderBy(desc(sql`${apifyKeys.totalBudget}::numeric - ${apifyKeys.usedBudget}::numeric`));
  }

  async getBestApifyKey(): Promise<ApifyKey | undefined> {
    const [result] = await db
      .select()
      .from(apifyKeys)
      .where(eq(apifyKeys.isExhausted, false))
      .orderBy(desc(sql`${apifyKeys.totalBudget}::numeric - ${apifyKeys.usedBudget}::numeric`))
      .limit(1);
    return result;
  }

  /** Charges a key and reports what it has left, so the caller can retire it. */
  async recordApifyKeyUsage(token: string, cost: number): Promise<number | undefined> {
    const [result] = await db
      .update(apifyKeys)
      .set({
        usedBudget: sql`${apifyKeys.usedBudget}::numeric + ${cost.toFixed(4)}::numeric`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(apifyKeys.token, token))
      .returning({
        remaining: sql<string>`${apifyKeys.totalBudget}::numeric - ${apifyKeys.usedBudget}::numeric`,
      });
    return result ? parseFloat(result.remaining) : undefined;
  }

  async markApifyKeyExhausted(token: string): Promise<void> {
    await db
      .update(apifyKeys)
      .set({ isExhausted: true, lastErrorAt: new Date(), updatedAt: new Date() })
      .where(eq(apifyKeys.token, token));
  }

  /** Every key currently out of the rotation, for the reset job to poll. */
  async getExhaustedApifyKeys(): Promise<ApifyKey[]> {
    return await db
      .select()
      .from(apifyKeys)
      .where(eq(apifyKeys.isExhausted, true))
      .orderBy(desc(apifyKeys.lastErrorAt));
  }

  /**
   * Return one key to the pool because its Apify credit cycle has turned over.
   *
   * Writes Apify's own figures rather than zeroing: used_budget takes the
   * account's real cycle spend and total_budget its real ceiling, so the local
   * books are re-synced to the account instead of merely being made optimistic.
   * Remaining is derived (total - used) in selection, seeding and the admin
   * views, which is why it is not stored.
   *
   * monthly_reset_at is the double-credit guard — the job only resets a key
   * whose cycle started after this timestamp.
   */
  async resetApifyKeyForNewCycle(
    id: string,
    budget: { usedUsd: number; limitUsd: number },
    now: Date,
  ): Promise<void> {
    await db
      .update(apifyKeys)
      .set({
        isExhausted: false,
        usedBudget: budget.usedUsd.toFixed(4),
        totalBudget: budget.limitUsd.toFixed(4),
        lastErrorAt: null,
        monthlyResetAt: now,
        lastResetCheckAt: now,
        updatedAt: now,
      })
      .where(eq(apifyKeys.id, id));
  }

  /**
   * Record that a key was polled and left retired.
   *
   * Deliberately touches nothing but the check timestamp: a held key's budget
   * and error history are still the ones that retired it.
   */
  async markApifyKeyResetChecked(id: string, now: Date): Promise<void> {
    await db
      .update(apifyKeys)
      .set({ lastResetCheckAt: now })
      .where(eq(apifyKeys.id, id));
  }

  async getAllApifyKeys(): Promise<ApifyKey[]> {
    return await db.select().from(apifyKeys).orderBy(desc(sql`${apifyKeys.totalBudget}::numeric - ${apifyKeys.usedBudget}::numeric`));
  }
}

export const storage = new DatabaseStorage();
