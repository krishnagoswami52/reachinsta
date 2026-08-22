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
 * Absolute floor on remaining budget. A key at or below this is never handed
 * to a fetch, on any plan: the point is to avoid running out of credit
 * mid-actor-run, which costs the whole fetch and not just the shortfall.
 */
export const KEY_BUDGET_FLOOR = 0.3;

/**
 * Minimum remaining budget a key must hold to be a *first choice* for a plan.
 *
 * Only plus sits above the floor. That is what reserves the fat end of the
 * pool for pro: plus is pushed at keys that are merely "good enough", so the
 * richest keys stay available for the biggest fetches. Pro and free filter at
 * the floor itself and are separated by direction alone (below), not by
 * threshold.
 *
 * A plan whose threshold is above the floor falls back to the floor when
 * nothing clears it, rather than failing — a fetch costs cents (see
 * ESTIMATED_APIFY_COST), so a $1 key funds a 14-day run perfectly well.
 */
export const MIN_KEY_BUDGET: Record<PlanType, number> = {
  pro: KEY_BUDGET_FLOOR,
  plus: 2.0,
  free: KEY_BUDGET_FLOOR,
};

/**
 * Which end of the qualifying range each plan takes.
 *
 * pro  -> highest: premium fetches always get the best key available.
 * plus -> lowest of the keys above its threshold: spends "good enough" credit
 *         and leaves the top of the pool for pro.
 * free -> lowest overall: burns small credits before they expire at month end.
 */
export const KEY_SELECTION: Record<PlanType, "highest" | "lowest"> = {
  pro: "highest",
  plus: "lowest",
  free: "lowest",
};

export function keySelectionForPlan(plan: PlanType): "highest" | "lowest" {
  return KEY_SELECTION[plan] ?? KEY_SELECTION.free;
}

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

/**
 * Seconds a job at `position` should expect to wait.
 *
 * Anything that fits in a slot that is free right now starts on the worker's
 * next poll tick, so it has no meaningful queue wait. Past that, each full
 * pass of the pool clears MAX_CONCURRENT_JOBS jobs in roughly one average run.
 */
export function estimateQueueWaitSeconds(position: number, workerSlotsBusy: number): number {
  const slotsFree = Math.max(0, MAX_CONCURRENT_JOBS - workerSlotsBusy);
  if (position <= slotsFree) return 0;
  return Math.ceil((position - slotsFree) / MAX_CONCURRENT_JOBS) * AVG_JOB_SECONDS;
}

/**
 * Copy for the queue card. Deliberately never mentions internals — no key
 * pool, no worker counts, no error strings.
 */
export function queuePositionMessage(
  position: number,
  waitSeconds: number,
  plan: PlanType,
): string {
  if (position === 1) {
    return "You're next — your fetch starts in a moment.";
  }

  const waitMin = Math.max(1, Math.round(waitSeconds / 60));
  const ahead = position - 1;
  const aheadLabel = `${ahead} fetch${ahead === 1 ? "" : "es"} ahead of you`;

  if (plan === "pro") {
    return `#${position} in the priority queue — ${aheadLabel}. Starting in about ${waitMin} min.`;
  }

  return `#${position} in the queue — ${aheadLabel}. About ${waitMin} min to go.`;
}
