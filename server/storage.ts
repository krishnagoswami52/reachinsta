import { eq, desc, and, sql, count } from "drizzle-orm";
import { db } from "./db";
import {
  profiles, competitors, fetchRuns, reels, competitorStats, rawPayloads, jobs,
  type Profile, type InsertProfile,
  type Competitor, type InsertCompetitor,
  type FetchRun, type InsertFetchRun,
  type Reel, type InsertReel,
  type CompetitorStats, type InsertCompetitorStats,
  type RawPayload, type InsertRawPayload,
  type Job, type InsertJob,
  planLimits,
  type PlanType,
} from "@shared/schema";
import { users, type User, type UpsertUser } from "@shared/models/auth";

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  
  getProfile(id: string): Promise<Profile | undefined>;
  upsertProfile(profile: InsertProfile): Promise<Profile>;
  getAllProfiles(): Promise<Profile[]>;
  updateProfile(id: string, updates: Partial<InsertProfile>): Promise<Profile | undefined>;
  
  getCompetitors(userId: string): Promise<Competitor[]>;
  getCompetitorCount(userId: string): Promise<number>;
  addCompetitor(competitor: InsertCompetitor): Promise<Competitor>;
  addCompetitors(competitors: InsertCompetitor[]): Promise<Competitor[]>;
  removeCompetitor(id: string, userId: string): Promise<boolean>;
  
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
    const result = await db
      .delete(competitors)
      .where(and(eq(competitors.id, id), eq(competitors.userId, userId)))
      .returning();
    return result.length > 0;
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
}

export const storage = new DatabaseStorage();
