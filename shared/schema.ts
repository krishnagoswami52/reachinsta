import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, numeric, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const planTypes = ["free", "plus", "pro"] as const;
export type PlanType = typeof planTypes[number];

export const roleTypes = ["user", "admin"] as const;
export type RoleType = typeof roleTypes[number];

export const fetchStatusTypes = ["queued", "running", "merging", "analyzing", "completed", "failed"] as const;
export type FetchStatusType = typeof fetchStatusTypes[number];

export const jobStatusTypes = ["queued", "running", "completed", "failed"] as const;
export type JobStatusType = typeof jobStatusTypes[number];

export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey(),
  email: text("email"),
  role: text("role").$type<RoleType>().default("user").notNull(),
  plan: text("plan").$type<PlanType>().default("free").notNull(),
  maxCompetitors: integer("max_competitors").default(5).notNull(),
  monthlyFetchLimit: integer("monthly_fetch_limit").default(1).notNull(),
  timeRangeMaxDays: integer("time_range_max_days").default(7).notNull(),
  csvExport: boolean("csv_export").default(false).notNull(),
  fetchesUsed: integer("fetches_used").default(0).notNull(),
  fetchesResetAt: timestamp("fetches_reset_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const competitors = pgTable("competitors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("competitors_user_username_idx").on(table.userId, table.username),
]);

export const fetchRuns = pgTable("fetch_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  timeRangeDays: integer("time_range_days").notNull(),
  status: text("status").$type<FetchStatusType>().default("queued").notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("fetch_runs_user_idx").on(table.userId),
  index("fetch_runs_status_idx").on(table.status),
]);

export const reels = pgTable("reels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fetchRunId: varchar("fetch_run_id").notNull().references(() => fetchRuns.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  reelUrl: text("reel_url").notNull(),
  views: bigint("views", { mode: "number" }).default(0).notNull(),
  likes: bigint("likes", { mode: "number" }).default(0).notNull(),
  comments: bigint("comments", { mode: "number" }).default(0).notNull(),
  durationSeconds: integer("duration_seconds").default(0).notNull(),
  postedAt: timestamp("posted_at"),
  engagementRate: numeric("engagement_rate", { precision: 10, scale: 6 }).default("0").notNull(),
  viralScore: numeric("viral_score", { precision: 10, scale: 4 }).default("0").notNull(),
}, (table) => [
  index("reels_fetch_run_idx").on(table.fetchRunId),
  index("reels_username_idx").on(table.username),
  index("reels_views_idx").on(table.views),
]);

export const competitorStats = pgTable("competitor_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fetchRunId: varchar("fetch_run_id").notNull().references(() => fetchRuns.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  followers: bigint("followers", { mode: "number" }),
  reelsCount: integer("reels_count").default(0).notNull(),
  avgViews: numeric("avg_views", { precision: 15, scale: 2 }).default("0").notNull(),
  avgEngagementRate: numeric("avg_engagement_rate", { precision: 10, scale: 6 }).default("0").notNull(),
  topReelViews: bigint("top_reel_views", { mode: "number" }).default(0).notNull(),
});

export const rawPayloads = pgTable("raw_payloads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fetchRunId: varchar("fetch_run_id").notNull().references(() => fetchRuns.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  fetchRunId: varchar("fetch_run_id").notNull().references(() => fetchRuns.id, { onDelete: "cascade" }),
  type: text("type").default("fetch_apify").notNull(),
  status: text("status").$type<JobStatusType>().default("queued").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("jobs_status_idx").on(table.status),
]);

export const profilesRelations = relations(profiles, ({ many }) => ({
  competitors: many(competitors),
  fetchRuns: many(fetchRuns),
  jobs: many(jobs),
}));

export const competitorsRelations = relations(competitors, ({ one }) => ({
  profile: one(profiles, {
    fields: [competitors.userId],
    references: [profiles.id],
  }),
}));

export const fetchRunsRelations = relations(fetchRuns, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [fetchRuns.userId],
    references: [profiles.id],
  }),
  reels: many(reels),
  competitorStats: many(competitorStats),
  rawPayloads: many(rawPayloads),
  jobs: many(jobs),
}));

export const reelsRelations = relations(reels, ({ one }) => ({
  fetchRun: one(fetchRuns, {
    fields: [reels.fetchRunId],
    references: [fetchRuns.id],
  }),
}));

export const competitorStatsRelations = relations(competitorStats, ({ one }) => ({
  fetchRun: one(fetchRuns, {
    fields: [competitorStats.fetchRunId],
    references: [fetchRuns.id],
  }),
}));

export const rawPayloadsRelations = relations(rawPayloads, ({ one }) => ({
  fetchRun: one(fetchRuns, {
    fields: [rawPayloads.fetchRunId],
    references: [fetchRuns.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  profile: one(profiles, {
    fields: [jobs.userId],
    references: [profiles.id],
  }),
  fetchRun: one(fetchRuns, {
    fields: [jobs.fetchRunId],
    references: [fetchRuns.id],
  }),
}));

export const insertProfileSchema = createInsertSchema(profiles).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertCompetitorSchema = createInsertSchema(competitors).omit({
  id: true,
  createdAt: true,
});

export const insertFetchRunSchema = createInsertSchema(fetchRuns).omit({
  id: true,
  createdAt: true,
});

export const insertReelSchema = createInsertSchema(reels).omit({
  id: true,
});

export const insertCompetitorStatsSchema = createInsertSchema(competitorStats).omit({
  id: true,
});

export const insertRawPayloadSchema = createInsertSchema(rawPayloads).omit({
  id: true,
  createdAt: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = typeof competitors.$inferSelect;

export type InsertFetchRun = z.infer<typeof insertFetchRunSchema>;
export type FetchRun = typeof fetchRuns.$inferSelect;

export type InsertReel = z.infer<typeof insertReelSchema>;
export type Reel = typeof reels.$inferSelect;

export type InsertCompetitorStats = z.infer<typeof insertCompetitorStatsSchema>;
export type CompetitorStats = typeof competitorStats.$inferSelect;

export type InsertRawPayload = z.infer<typeof insertRawPayloadSchema>;
export type RawPayload = typeof rawPayloads.$inferSelect;

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

export const planLimits: Record<PlanType, { maxCompetitors: number; monthlyFetchLimit: number; timeRangeMaxDays: number; csvExport: boolean }> = {
  free: { maxCompetitors: 5, monthlyFetchLimit: 1, timeRangeMaxDays: 7, csvExport: false },
  plus: { maxCompetitors: 50, monthlyFetchLimit: 2, timeRangeMaxDays: 28, csvExport: false },
  pro: { maxCompetitors: 100, monthlyFetchLimit: 4, timeRangeMaxDays: 28, csvExport: true },
};

export const durationBuckets = [
  { label: "0-10s", min: 0, max: 10 },
  { label: "11-20s", min: 11, max: 20 },
  { label: "21-30s", min: 21, max: 30 },
  { label: "31-45s", min: 31, max: 45 },
  { label: "46-60s", min: 46, max: 60 },
  { label: "60s+", min: 61, max: Infinity },
];
