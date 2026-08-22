/**
 * Queue tuning constants, shared by the worker, the queue-position API and the
 * client-side queue UI so all three agree on what "position 3" actually means.
 *
 * Everything here is additive. Plan capabilities (competitor caps, monthly
 * fetch limits, time-range caps) continue to live in `planLimits` and are not
 * touched — this file only classifies an existing plan for scheduling.
 */
import type { PlanType } from "./schema";

/** Number of fetch jobs the worker pool will run at the same time. */
export const MAX_CONCURRENT_JOBS = 5;

/**
 * Slots held back from paid traffic so a free user is never starved out
 * completely while paying users keep the pool saturated.
 */
export const FREE_USER_RESERVED_SLOTS = 1;

/** Ceiling on how many of the pool's slots a single user may occupy. */
export const PER_USER_CONCURRENCY: Record<PlanType, number> = {
  pro: 3,
  plus: 2,
  free: 1,
};

/** Lower number = served first. Ties break on created_at (FIFO). */
export const QUEUE_PRIORITY: Record<PlanType, number> = {
  pro: 1,
  plus: 2,
  free: 3,
};

/** Inverse of QUEUE_PRIORITY, for reading a plan back off a queued job row. */
export const PLAN_BY_PRIORITY: Record<number, PlanType> = {
  1: "pro",
  2: "plus",
  3: "free",
};

/**
 * Rough Apify spend for one fetch at each plan's time range (7 / 14 / 28 days).
 * Recorded on the job for cost attribution; the authoritative charge is still
 * the per-item usage recorded against the key after the run.
 */
export const ESTIMATED_APIFY_COST: Record<PlanType, number> = {
  pro: 0.4,
  plus: 0.2,
  free: 0.08,
};

/**
 * Preferred minimum remaining budget on the Apify key used for a fetch.
 *
 * These are *preferences*, not hard requirements — a fetch actually costs
 * cents (see ESTIMATED_APIFY_COST), so these thresholds exist to steer big
 * fetches at fat keys and small fetches at nearly-spent keys. When no key
 * clears the bar, selection falls back to KEY_BUDGET_FLOOR while keeping the
 * same per-plan ordering. See docs/h1-concurrency-priority-queue.md.
 */
export const MIN_KEY_BUDGET: Record<PlanType, number> = {
  pro: 5.0,
  plus: 3.0,
  free: 2.0,
};

/** Absolute floor: below this a key cannot fund even a small fetch safely. */
export const KEY_BUDGET_FLOOR = 0.5;

/** Measured mean duration of a completed run (n=97, docs/fetch-flow-audit.md). */
export const AVG_JOB_SECONDS = 63;

export function priorityForPlan(plan: PlanType): number {
  return QUEUE_PRIORITY[plan] ?? QUEUE_PRIORITY.free;
}

export function planForPriority(priority: number): PlanType {
  return PLAN_BY_PRIORITY[priority] ?? "free";
}

export function estimatedCostForPlan(plan: PlanType): number {
  return ESTIMATED_APIFY_COST[plan] ?? ESTIMATED_APIFY_COST.free;
}

export function minKeyBudgetForPlan(plan: PlanType): number {
  return MIN_KEY_BUDGET[plan] ?? MIN_KEY_BUDGET.free;
}

export function perUserConcurrencyLimit(plan: PlanType): number {
  return PER_USER_CONCURRENCY[plan] ?? PER_USER_CONCURRENCY.free;
}
