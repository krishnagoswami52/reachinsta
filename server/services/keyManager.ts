import { readFileSync } from "fs";
import { join } from "path";
import { storage } from "../storage";
import type { ApifyKey, PlanType } from "@shared/schema";
import { KEY_BUDGET_FLOOR, minKeyBudgetForPlan } from "@shared/queue";

const TOTAL_BUDGET_PER_KEY = "5.0000"; // $5 free credits per Apify account
export const POST_COST_PER_ITEM = 0.0027;    // $2.70 / 1000 posts
export const PROFILE_COST_PER_ITEM = 0.0013; // $1.30 / 1000 profiles

export function maskToken(token: string): string {
  if (!token || token.length < 16) return token;
  return `${token.slice(0, 12)}...${token.slice(-4)}`;
}

export async function initApifyKeys(): Promise<void> {
  const filePath = join(process.cwd(), "apify_api.txt");
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    console.warn("[KeyManager] apify_api.txt not found, skipping key initialization");
    return;
  }

  const tokens = [
    ...new Set(
      content
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.startsWith("apify_api_")),
    ),
  ];

  console.log(`[KeyManager] Seeding ${tokens.length} Apify token(s)...`);

  for (const token of tokens) {
    await storage.upsertApifyKey({ token, totalBudget: TOTAL_BUDGET_PER_KEY });
  }

  const allKeys = await storage.getAllApifyKeys();
  const active = allKeys.filter((k) => !k.isExhausted);
  const totalRemaining = allKeys.reduce(
    (sum, k) => sum + (parseFloat(k.totalBudget) - parseFloat(k.usedBudget)),
    0,
  );

  console.log(`[KeyManager] Seeding complete. ${tokens.length} tokens available.`);
  console.log(
    `[KeyManager] Rotation pool initialized with ${active.length} healthy token(s). $${totalRemaining.toFixed(4)} total remaining budget.`,
  );
}

export async function getBestKey(): Promise<string> {
  const key = await storage.getBestApifyKey();
  if (!key) {
    throw new Error("[KeyManager] All Apify keys exhausted — no budget remaining");
  }
  const remaining = parseFloat(key.totalBudget) - parseFloat(key.usedBudget);
  console.log(`[KeyManager] Selected key ${maskToken(key.token)} ($${remaining.toFixed(4)} remaining)`);
  return key.token;
}

export function remainingBudget(key: ApifyKey): number {
  return parseFloat(key.totalBudget) - parseFloat(key.usedBudget);
}

/**
 * Tokens held by an actor call that is running right now, in this process.
 *
 * Selection prefers a token nobody else is using, which is what actually turns
 * five parallel workers into five parallel Apify tokens. Purely an
 * optimisation: if every viable key is busy the preference is dropped rather
 * than blocking the fetch, and the set is process-local so a crash cannot leak
 * a permanent reservation.
 */
const inFlightTokens = new Set<string>();

export function markTokenInFlight(token: string): void {
  inFlightTokens.add(token);
}

export function releaseToken(token: string): void {
  inFlightTokens.delete(token);
}

/**
 * Pick the Apify key that should fund a fetch for `plan`.
 *
 * Two independent decisions:
 *
 * 1. *Which keys are eligible.* Preferred floor is MIN_KEY_BUDGET[plan] — a
 *    28-day pro fetch aims at a fat key, a 7-day free fetch at a nearly-spent
 *    one. When nothing clears that bar we fall back to KEY_BUDGET_FLOOR rather
 *    than failing the fetch: the thresholds express preference, and a real
 *    fetch costs cents (see ESTIMATED_APIFY_COST), so a $2 key funds a pro run
 *    perfectly well.
 *
 * 2. *Which of those to take.* free -> lowest remaining, so small credits get
 *    consumed before they expire at month end; pro -> highest remaining, so
 *    the biggest fetch has the most headroom; plus -> the middle of the range,
 *    leaving both ends free for the other two.
 *
 * `excludeTokens` carries the keys this fetch has already burned through
 * during rotation, so a retry never re-picks a token that just failed.
 */
export async function getKeyForPlan(
  plan: PlanType,
  excludeTokens: ReadonlySet<string> = new Set(),
): Promise<ApifyKey> {
  const pool = (await storage.getSelectableApifyKeys()).filter((k) => !excludeTokens.has(k.token));

  if (pool.length === 0) {
    throw new Error("[KeyManager] All Apify keys exhausted — no budget remaining");
  }

  const minBudget = minKeyBudgetForPlan(plan);
  let candidates = pool.filter((k) => remainingBudget(k) > minBudget);

  if (candidates.length === 0) {
    candidates = pool.filter((k) => remainingBudget(k) > KEY_BUDGET_FLOOR);
    if (candidates.length === 0) {
      throw new Error(
        `[KeyManager] No Apify key holds more than $${KEY_BUDGET_FLOOR.toFixed(2)} — cannot fund a ${plan} fetch`,
      );
    }
    console.warn(
      `[KeyManager] No key above the $${minBudget.toFixed(2)} preference for ${plan}; ` +
        `falling back to ${candidates.length} key(s) above $${KEY_BUDGET_FLOOR.toFixed(2)}`,
    );
  }

  // Prefer a token no other worker is holding. Dropped if they all are.
  const free = candidates.filter((k) => !inFlightTokens.has(k.token));
  const chooseFrom = free.length > 0 ? free : candidates;

  const ascending = [...chooseFrom].sort((a, b) => remainingBudget(a) - remainingBudget(b));

  let selected: ApifyKey;
  switch (plan) {
    case "pro":
      selected = ascending[ascending.length - 1];
      break;
    case "plus":
      selected = ascending[Math.floor(ascending.length / 2)];
      break;
    default:
      selected = ascending[0];
  }

  console.log(
    `[KeyManager] ${plan} fetch -> key ${maskToken(selected.token)} ` +
      `($${remainingBudget(selected).toFixed(4)} remaining, ${chooseFrom.length} candidate(s)` +
      `${free.length === 0 ? ", all in flight" : ""})`,
  );

  return selected;
}

export function isBudgetError(error: any): boolean {
  if (!error) return false;

  // HTTP status codes are the most reliable signal
  const statusCode =
    error?.statusCode ??
    error?.status ??
    error?.response?.status ??
    error?.cause?.statusCode;

  if (statusCode === 402) return true;

  // Collect all message text from every location Apify may use
  const messageParts = [
    error?.message,
    error?.error?.message,
    error?.response?.data?.error?.message,
    error?.response?.data?.message,
    error?.cause?.message,
    typeof error === "string" ? error : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const budgetPhrases = [
    "monthly usage limit reached",
    "monthly usage hard limit",
    "usage limit exceeded",
    "usage hard limit exceeded",
    "reached your plan limit",
    "reached the limit",
    "exceeded the limit",
    "limit for your current plan",
    "insufficient credit",
    "insufficient platform credit",
    "payment required",
    "account has been limited",
    "platform usage credits",
    "monthly platform usage",
    "you have exceeded",
    "quota exceeded",
    "out of credit",
    "no credit",
    "credit limit",
    "account is suspended",
    "insufficient",
  ];

  return budgetPhrases.some((phrase) => messageParts.includes(phrase));
}

export async function recordUsage(
  token: string,
  postCount: number,
  profileCount: number,
): Promise<void> {
  const cost = postCount * POST_COST_PER_ITEM + profileCount * PROFILE_COST_PER_ITEM;
  if (cost > 0) {
    const remaining = await storage.recordApifyKeyUsage(token, cost);
    console.log(
      `[KeyManager] Recorded $${cost.toFixed(4)} usage for key ${maskToken(token)} (${postCount} posts + ${profileCount} profiles)`,
    );

    // Retire a key that is genuinely spent, so selection stops offering it a
    // fetch it cannot fund. This is the honest case — the budget really is
    // gone — as opposed to the error-string matching in isBudgetError, which
    // has retired healthy keys before (docs/fetch-flow-audit.md H3).
    if (remaining !== undefined && remaining < KEY_BUDGET_FLOOR) {
      await markExhausted(token);
      console.warn(
        `[KeyManager] Key ${maskToken(token)} auto-retired: $${remaining.toFixed(4)} left, ` +
          `below the $${KEY_BUDGET_FLOOR.toFixed(2)} floor`,
      );
    }
  }
}

export async function markExhausted(token: string): Promise<void> {
  await storage.markApifyKeyExhausted(token);
  console.log(`[KeyManager] Marked key ${maskToken(token)} as exhausted`);
}
