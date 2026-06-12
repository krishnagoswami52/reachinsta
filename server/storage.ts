import { eq, desc, and, sql, count } from "drizzle-orm";
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
  resetPasswordAtomic(userId: string, tokenHash: string, newPasswordHash: string): Promise<{ success: boolean; error?: string }>;
  
  getProfile(id: string): Promise<Profile | undefined>;
  upsertProfile(profile: InsertProfile): Promise<Profile>;
  getAllProfiles(): Promise<Profile[]>;
  updateProfile(id: string, updates: Partial<InsertProfile>): Promise<Profile | undefined>;
  getProfileByPaddleCustomerId(customerId: string): Promise<Profile | undefined>;
  updateProfileSubscription(userId: string, data: {
    paddleCustomerId?: string;
    paddleSubscriptionId?: string | null;
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
  getQueuedJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined>;
  claimJob(jobId: string): Promise<Job | undefined>;

  // Apify key management
  upsertApifyKey(data: { token: string; totalBudget?: string }): Promise<ApifyKey>;
  getBestApifyKey(): Promise<ApifyKey | undefined>;
  recordApifyKeyUsage(token: string, cost: number): Promise<void>;
  markApifyKeyExhausted(token: string): Promise<void>;
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
  ): Promise<{ success: boolean; error?: string }> {
    return await db.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.userId, userId),
          eq(passwordResetTokens.tokenHash, tokenHash),
          sql`${passwordResetTokens.usedAt} IS NULL`,
          sql`${passwordResetTokens.expiresAt} > NOW()`
        ))
        .for("update");

      if (!token) {
        const [expiredOrUsed] = await tx
          .select()
          .from(passwordResetTokens)
          .where(and(
            eq(passwordResetTokens.userId, userId),
            eq(passwordResetTokens.tokenHash, tokenHash),
          ));

        if (!expiredOrUsed) {
          return { success: false, error: "Invalid reset code" };
        }
        if (expiredOrUsed.usedAt) {
          return { success: false, error: "This reset code has already been used" };
        }
        return { success: false, error: "This reset code has expired" };
      }

      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, token.id));

      await tx
        .update(users)
        .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
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

  async updateProfileSubscription(
    userId: string,
    data: {
      paddleCustomerId?: string;
      paddleSubscriptionId?: string | null;
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

  async getQueuedJobs(): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(jobs.createdAt)
      .limit(10);
  }

  async getJob(id: string): Promise<Job | undefined> {
    const [result] = await db.select().from(jobs).where(eq(jobs.id, id));
    return result;
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

  async getBestApifyKey(): Promise<ApifyKey | undefined> {
    const [result] = await db
      .select()
      .from(apifyKeys)
      .where(eq(apifyKeys.isExhausted, false))
      .orderBy(desc(sql`${apifyKeys.totalBudget}::numeric - ${apifyKeys.usedBudget}::numeric`))
      .limit(1);
    return result;
  }

  async recordApifyKeyUsage(token: string, cost: number): Promise<void> {
    await db
      .update(apifyKeys)
      .set({
        usedBudget: sql`${apifyKeys.usedBudget}::numeric + ${cost.toFixed(4)}::numeric`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(apifyKeys.token, token));
  }

  async markApifyKeyExhausted(token: string): Promise<void> {
    await db
      .update(apifyKeys)
      .set({ isExhausted: true, lastErrorAt: new Date(), updatedAt: new Date() })
      .where(eq(apifyKeys.token, token));
  }

  async getAllApifyKeys(): Promise<ApifyKey[]> {
    return await db.select().from(apifyKeys).orderBy(desc(sql`${apifyKeys.totalBudget}::numeric - ${apifyKeys.usedBudget}::numeric`));
  }
}

export const storage = new DatabaseStorage();
