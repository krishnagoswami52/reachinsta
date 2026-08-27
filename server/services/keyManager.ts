import { readFileSync } from "fs";
import { join } from "path";
import { storage } from "../storage";
import type { ApifyKey, PlanType } from "@shared/schema";
import { KEY_BUDGET_FLOOR, keySelectionForPlan, minKeyBudgetForPlan } from "@shared/queue";

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

export interface KeyChoice {
  key: ApifyKey;
  /** True when the plan's own threshold matched nothing and the floor was used. */
  usedFallback: boolean;
  /** How many keys were in contention after filtering. */
  candidateCount: number;
  /** True when every candidate was already held by another worker. */
  allInFlight: boolean;
}

/**
 * Choose the key that should fund a fetch, from a given pool.
 *
 * Pure and exported so the rules can be tested against constructed pools —
 * including the ones production does not currently contain, like "nothing
 * clears the plus threshold" and "every key is under the floor".
 *
 * Three decisions, in order:
 *
 * 1. *The floor.* Nothing at or below KEY_BUDGET_FLOOR is ever eligible, on
 *    any plan. Running out of credit part-way through an actor run loses the
 *    whole fetch, not just the shortfall, so the floor is a hard filter rather
 *    than a preference.
 *
 * 2. *The plan's threshold.* Only plus sits above the floor, which is what
 *    keeps the rich end of the pool free for pro. If nothing clears it, plus
 *    falls back to the floor — the same set free draws from — rather than
 *    failing a fetch that costs cents.
 *
 * 3. *The direction.* pro takes the highest remaining, plus and free the
 *    lowest of whatever qualified. Pro and free filter identically and are
 *    separated by this step alone.
 *
 * Returns null only when the pool holds nothing above the floor — the caller
 * turns that into APIFY_ALL_KEYS_EXHAUSTED.
 */
export function chooseKeyForPlan(
  pool: readonly ApifyKey[],
  plan: PlanType,
  inFlight: ReadonlySet<string> = new Set(),
): KeyChoice | null {
  const aboveFloor = pool.filter((k) => remainingBudget(k) > KEY_BUDGET_FLOOR);
  if (aboveFloor.length === 0) return null;

  const threshold = minKeyBudgetForPlan(plan);
  const preferred = pool.filter((k) => remainingBudget(k) > threshold);

  const usedFallback = preferred.length === 0;
  const candidates = usedFallback ? aboveFloor : preferred;

  // Prefer a token no other worker is holding, so parallel fetches spread
  // across the pool. Dropped rather than blocking when they are all busy.
  const idle = candidates.filter((k) => !inFlight.has(k.token));
  const chooseFrom = idle.length > 0 ? idle : candidates;

  const ascending = [...chooseFrom].sort((a, b) => remainingBudget(a) - remainingBudget(b));
  const key =
    keySelectionForPlan(plan) === "highest" ? ascending[ascending.length - 1] : ascending[0];

  return {
    key,
    usedFallback,
    candidateCount: chooseFrom.length,
    allInFlight: idle.length === 0,
  };
}

/**
 * Pick the Apify key that should fund a fetch for `plan`.
 *
 * `excludeTokens` carries the keys this fetch has already burned through
 * during rotation, so a retry never re-picks a token that just failed.
 */
export async function getKeyForPlan(
  plan: PlanType,
  excludeTokens: ReadonlySet<string> = new Set(),
): Promise<ApifyKey> {
  const pool = (await storage.getSelectableApifyKeys()).filter((k) => !excludeTokens.has(k.token));
  const choice = chooseKeyForPlan(pool, plan, inFlightTokens);

  if (!choice) {
    // Phrased so detectErrorCode maps it to APIFY_ALL_KEYS_EXHAUSTED and the
    // user is told we are at capacity, not shown a budget figure.
    throw new Error(
      `[KeyManager] All Apify keys exhausted — no key holds more than ` +
        `$${KEY_BUDGET_FLOOR.toFixed(2)} (${pool.length} key(s) in pool)`,
    );
  }

  if (choice.usedFallback) {
    console.warn(
      `[KeyManager] No key above the $${minKeyBudgetForPlan(plan).toFixed(2)} ${plan} threshold; ` +
        `falling back to the $${KEY_BUDGET_FLOOR.toFixed(2)} floor (${choice.candidateCount} candidate(s))`,
    );
  }

  console.log(
    `[KeyManager] ${plan} fetch -> ${keySelectionForPlan(plan)} of ${choice.candidateCount} ` +
      `key(s) above $${(choice.usedFallback ? KEY_BUDGET_FLOOR : minKeyBudgetForPlan(plan)).toFixed(2)}: ` +
      `${maskToken(choice.key.token)} ($${remainingBudget(choice.key).toFixed(4)} remaining` +
      `${choice.allInFlight ? ", all in flight" : ""})`,
  );

  return choice.key;
}

/**
 * Phrases that mean "this account is out of money", and only that.
 *
 * Every entry has to be specific enough that no non-budget Apify error can
 * contain it. The bare word "insufficient" used to be on this list and is the
 * reason four healthy keys were retired holding $2.33-$4.71: it matched
 * "insufficient permissions" and "insufficient data" (docs/fetch-flow-audit.md
 * H2/H3). Same for the old "reached the limit" / "exceeded the limit" /
 * "you have exceeded" entries, which match concurrency and result-count
 * errors word for word. Anything added here must name credit, budget, quota,
 * or payment explicitly.
 */
const BUDGET_ERROR_PHRASES = [
  // Apify's own monthly-usage wording
  "monthly usage limit reached",
  "monthly usage hard limit",
  "usage limit exceeded",
  "usage hard limit exceeded",
  "reached your plan limit",
  "limit for your current plan",
  "platform usage credits",
  "monthly platform usage",
  "account has been limited",
  // Credit / balance
  "insufficient credit",
  "insufficient credits",
  "insufficient platform credit",
  "insufficient balance",
  "insufficient funds",
  "out of credit",
  "no credit remaining",
  "no credits remaining",
  "credit limit",
  "account credit is depleted",
  // Budget / quota
  "budget exceeded",
  "quota exceeded",
  "quota exhausted",
  // Payment
  "payment required",
  // Account state that rotation should route around the same way
  "account is suspended",
] as const;

/** Apify error `type` values that mean the account cannot pay for the run. */
const BUDGET_ERROR_TYPES = ["insufficient-credits", "account-blocked-for-budget"] as const;

/**
 * Is this error the account running out of Apify credit?
 *
 * A true here retires the key from the rotation pool, so a false positive
 * costs the pool a healthy key until the next monthly reset. That asymmetry
 * is why matching is phrase-precise rather than keyword-loose: a missed
 * budget error just fails one fetch and the key retires on its own the next
 * time recordUsage() charges it below the floor.
 *
 * Three independent signals, cheapest first: HTTP 402, a known Apify error
 * `type`, then the message text.
 */
export function isBudgetError(error: any): boolean {
  if (!error) return false;

  // HTTP status codes are the most reliable signal
  const statusCode =
    error?.statusCode ??
    error?.status ??
    error?.response?.status ??
    error?.cause?.statusCode;

  if (statusCode === 402) return true;

  // Structured error type, when Apify sends one — no string matching involved
  const type =
    error?.type ??
    error?.error?.type ??
    error?.response?.data?.error?.type ??
    error?.cause?.type;

  if (typeof type === "string" && (BUDGET_ERROR_TYPES as readonly string[]).includes(type)) {
    return true;
  }

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

  return BUDGET_ERROR_PHRASES.some((phrase) => messageParts.includes(phrase));
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
    // <= not <, so the retire condition is the exact complement of the
    // "> floor" selection filter. A key sitting precisely on the floor is
    // unselectable, and leaving it in the pool would strand it there.
    if (remaining !== undefined && remaining <= KEY_BUDGET_FLOOR) {
      await markExhausted(token);
      console.warn(
        `[KeyManager] Key ${maskToken(token)} auto-retired: $${remaining.toFixed(4)} left, ` +
          `at or below the $${KEY_BUDGET_FLOOR.toFixed(2)} floor`,
      );
    }
  }
}

export async function markExhausted(token: string): Promise<void> {
  await storage.markApifyKeyExhausted(token);
  console.log(`[KeyManager] Marked key ${maskToken(token)} as exhausted`);
}
