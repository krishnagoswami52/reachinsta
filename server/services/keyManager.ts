import { readFileSync } from "fs";
import { join } from "path";
import { storage } from "../storage";

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
    await storage.recordApifyKeyUsage(token, cost);
    console.log(
      `[KeyManager] Recorded $${cost.toFixed(4)} usage for key ${maskToken(token)} (${postCount} posts + ${profileCount} profiles)`,
    );
  }
}

export async function markExhausted(token: string): Promise<void> {
  await storage.markApifyKeyExhausted(token);
  console.log(`[KeyManager] Marked key ${maskToken(token)} as exhausted`);
}
