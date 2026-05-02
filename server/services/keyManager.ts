import { readFileSync } from "fs";
import { join } from "path";
import { storage } from "../storage";

const TOTAL_BUDGET_PER_KEY = "5.0000"; // $5 free credits per Apify account
export const POST_COST_PER_ITEM = 0.0027;    // $2.70 / 1000 posts
export const PROFILE_COST_PER_ITEM = 0.0013; // $1.30 / 1000 profiles

export async function initApifyKeys(): Promise<void> {
  const filePath = join(process.cwd(), "apify_api.txt");
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    console.warn("[KeyManager] apify_api.txt not found, skipping key initialization");
    return;
  }

  const tokens = content
    .trim()
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    await storage.upsertApifyKey({ token, totalBudget: TOTAL_BUDGET_PER_KEY });
  }

  const allKeys = await storage.getAllApifyKeys();
  const active = allKeys.filter((k) => !k.isExhausted);
  const totalRemaining = allKeys.reduce(
    (sum, k) => sum + (parseFloat(k.totalBudget) - parseFloat(k.usedBudget)),
    0,
  );

  console.log(
    `[KeyManager] ${tokens.length} keys loaded — ${active.length} active, $${totalRemaining.toFixed(4)} total remaining budget`,
  );
}

export async function getBestKey(): Promise<string> {
  const key = await storage.getBestApifyKey();
  if (!key) {
    throw new Error("[KeyManager] All Apify keys exhausted — no budget remaining");
  }
  const remaining = parseFloat(key.totalBudget) - parseFloat(key.usedBudget);
  console.log(`[KeyManager] Selected key ...${key.token.slice(-8)} ($${remaining.toFixed(4)} remaining)`);
  return key.token;
}

export function isBudgetError(error: any): boolean {
  if (error?.statusCode === 402) return true;
  const msg: string = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("insufficient") ||
    msg.includes("payment required") ||
    msg.includes("no credit") ||
    msg.includes("out of credit") ||
    msg.includes("account is suspended")
  );
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
      `[KeyManager] Recorded $${cost.toFixed(4)} usage for key ...${token.slice(-8)} (${postCount} posts + ${profileCount} profiles)`,
    );
  }
}

export async function markExhausted(token: string): Promise<void> {
  await storage.markApifyKeyExhausted(token);
  console.log(`[KeyManager] Marked key ...${token.slice(-8)} as exhausted`);
}
