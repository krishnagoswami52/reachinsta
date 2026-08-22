import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, bigserial, numeric, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { User } from "./models/auth";
import { users } from "./models/auth";

export * from "./models/auth";

export const planTypes = ["free", "plus", "pro"] as const;
export type PlanType = typeof planTypes[number];

export const roleTypes = ["user", "admin"] as const;
export type RoleType = typeof roleTypes[number];

export const subscriptionStatusTypes = ["free", "active", "canceling", "past_due", "canceled", "paused"] as const;
export type SubscriptionStatusType = typeof subscriptionStatusTypes[number];

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
  // Paddle subscription fields
  subscriptionStatus: text("subscription_status").$type<SubscriptionStatusType>().default("free").notNull(),
  paddleCustomerId: text("paddle_customer_id").unique(),
  paddleSubscriptionId: text("paddle_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  cancelAt: timestamp("cancel_at"),
  periodResetAt: timestamp("period_reset_at"),
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
  competitorUsernames: text("competitor_usernames").array(),
  status: text("status").$type<FetchStatusType>().default("queued").notNull(),
  // User-facing copy only. Anything technical belongs in internalErrorCode —
  // see server/utils/errorMessages.ts.
  errorMessage: text("error_message"),
  // Developer-facing classification of the failure (APIFY_TIMEOUT, ...).
  // Never rendered to end users; surfaced in the admin dashboard.
  internalErrorCode: varchar("internal_error_code", { length: 50 }),
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
  engagementRate: numeric("engagement_rate", { precision: 20, scale: 10 }).default("0").notNull(),
  viralScore: numeric("viral_score", { precision: 20, scale: 6 }).default("0").notNull(),
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
  avgViews: numeric("avg_views", { precision: 20, scale: 2 }).default("0").notNull(),
  avgEngagementRate: numeric("avg_engagement_rate", { precision: 20, scale: 10 }).default("0").notNull(),
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
  // Scheduling class derived from the owner's plan at enqueue time:
  // 1 = pro, 2 = plus, 3 = free. Lower is served first, ties break FIFO.
  // Frozen at creation on purpose — a plan change mid-queue must not reorder
  // work that other users are already waiting behind.
  priority: integer("priority").default(3).notNull(),
  // Expected Apify spend for this fetch, for cost attribution and key sizing.
  estimatedApifyCost: numeric("estimated_apify_cost", { precision: 10, scale: 4 }),
  // Which key from the rotation pool actually ran this job.
  apifyKeyId: varchar("apify_key_id").references(() => apifyKeys.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("jobs_status_idx").on(table.status),
  // Backs the priority-queue pop: ORDER BY priority, created_at over the
  // queued rows only.
  index("jobs_priority_queue_idx").on(table.priority, table.createdAt),
]);

export const apifyKeys = pgTable("apify_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  totalBudget: numeric("total_budget", { precision: 10, scale: 4 }).default("5.0000").notNull(),
  usedBudget: numeric("used_budget", { precision: 10, scale: 4 }).default("0.0000").notNull(),
  isExhausted: boolean("is_exhausted").default(false).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  lastErrorAt: timestamp("last_error_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertApifyKeySchema = createInsertSchema(apifyKeys).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertApifyKey = typeof apifyKeys.$inferInsert;
export type ApifyKey = typeof apifyKeys.$inferSelect;

// First-party page-view log. Additive, analytics-only: nothing in the product
// reads this table — it exists solely for the admin dashboard (/admin/metrics).
// Written best-effort by server/middleware/tracking.ts; a failed insert never
// affects the response.
export const pageViews = pgTable("page_views", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  path: varchar("path", { length: 500 }).notNull(),
  referrer: varchar("referrer", { length: 500 }),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 45 }),
  // users.id is a varchar uuid, so this FK is varchar (not the integer the
  // original spec assumed).
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  sessionId: varchar("session_id", { length: 100 }),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  country: varchar("country", { length: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("page_views_created_at_idx").on(table.createdAt),
  index("page_views_user_id_idx").on(table.userId),
  index("page_views_utm_source_idx").on(table.utmSource),
  index("page_views_path_idx").on(table.path),
  index("page_views_session_id_idx").on(table.sessionId),
]);

export type InsertPageView = typeof pageViews.$inferInsert;
export type PageView = typeof pageViews.$inferSelect;

// Idempotency log for Paddle webhooks. One row per successfully-processed
// event_id; the webhook handler skips any event_id already present here so
// Paddle retries / replays don't apply a state change twice.
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  eventId: varchar("event_id").primaryKey(), // Paddle's evt_xxx
  eventType: varchar("event_type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
}, (table) => [
  index("processed_webhook_events_processed_at_idx").on(table.processedAt),
]);

export type ProcessedWebhookEvent = typeof processedWebhookEvents.$inferSelect;

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

export type InsertProfile = typeof profiles.$inferInsert;
export type Profile = typeof profiles.$inferSelect;

export type InsertCompetitor = typeof competitors.$inferInsert;
export type Competitor = typeof competitors.$inferSelect;

export type InsertFetchRun = typeof fetchRuns.$inferInsert;
export type FetchRun = typeof fetchRuns.$inferSelect;

export type InsertReel = typeof reels.$inferInsert;
export type Reel = typeof reels.$inferSelect;

export type InsertCompetitorStats = typeof competitorStats.$inferInsert;
export type CompetitorStats = typeof competitorStats.$inferSelect;

export type InsertRawPayload = typeof rawPayloads.$inferInsert;
export type RawPayload = typeof rawPayloads.$inferSelect;

export type InsertJob = typeof jobs.$inferInsert;
export type Job = typeof jobs.$inferSelect;

export const planLimits: Record<PlanType, { maxCompetitors: number; monthlyFetchLimit: number; timeRangeMaxDays: number; csvExport: boolean }> = {
  free: { maxCompetitors: 5, monthlyFetchLimit: 1, timeRangeMaxDays: 7, csvExport: false },
  plus: { maxCompetitors: 50, monthlyFetchLimit: 2, timeRangeMaxDays: 14, csvExport: false },
  pro: { maxCompetitors: 100, monthlyFetchLimit: 4, timeRangeMaxDays: 28, csvExport: true },
};

/**
 * Shape returned by GET /api/auth/user — User fields (minus passwordHash)
 * merged with subscription fields from the profiles table.
 */
export type SanitizedUser = Omit<User, "passwordHash"> & {
  plan: PlanType;
  subscriptionStatus: SubscriptionStatusType;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
};

export const durationBuckets = [
  { label: "0-10s", min: 0, max: 10 },
  { label: "11-20s", min: 11, max: 20 },
  { label: "21-30s", min: 21, max: 30 },
  { label: "31-45s", min: 31, max: 45 },
  { label: "46-60s", min: 46, max: 60 },
  { label: "60s+", min: 61, max: Infinity },
];
