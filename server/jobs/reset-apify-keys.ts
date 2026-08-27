import { storage } from "../storage";
import { maskToken } from "../services/keyManager";

/**
 * Days that must pass since a key's last monthly reset before it is eligible
 * again. Guards the case the cron cannot: the job runs daily and only acts on
 * the 1st UTC, but a container restart on that day runs it a second time, and
 * a second reset would hand the same key another fresh $5 of accounting on
 * top of what it had already been credited.
 *
 * 25 rather than 28: February is 28 days, and a job that fires at 01:00 on
 * the 1st is comparing against a timestamp written at 01:00 on the previous
 * 1st, so the shortest real gap is exactly 28 days. 25 leaves room for clock
 * skew and a late run without ever letting two resets land in one cycle.
 */
const MIN_DAYS_BETWEEN_RESETS = 25;

/**
 * Return the pool's retired keys to service at the start of each Apify
 * billing month.
 *
 * Apify free-tier credit renews on the 1st UTC. is_exhausted did not: it was
 * set once and never cleared, so a key retired in July was still retired in
 * August with a full $5 behind it. Combined with the loose error matching
 * this change accompanies (see isBudgetError), the pool only ever shrank.
 *
 * The reset zeroes used_budget rather than writing a remaining figure,
 * because remaining is derived (total_budget - used_budget) everywhere else
 * in the codebase and a written figure would immediately disagree with it.
 *
 * Idempotent in two ways: it no-ops on all but one day of the month, and
 * monthly_reset_at stops a same-day rerun. Safe to call on every boot.
 *
 * `now` is injectable so the date gate can be tested without waiting for the
 * 1st.
 */
export async function autoResetKeysMonthly(now: Date = new Date()): Promise<number> {
  if (now.getUTCDate() !== 1) {
    return 0;
  }

  console.log("[KeyManager] Monthly reset day — checking exhausted keys...");

  const cutoff = new Date(now.getTime() - MIN_DAYS_BETWEEN_RESETS * 24 * 60 * 60 * 1000);
  const reset = await storage.resetExhaustedApifyKeys(cutoff, now);

  if (reset.length === 0) {
    console.log("[KeyManager] No keys needed reset");
    return 0;
  }

  for (const key of reset) {
    console.log(`[KeyManager] Reset ${maskToken(key.token)} — $${key.totalBudget} available again`);
  }
  console.log(`[KeyManager] Auto-reset ${reset.length} key(s) for the new month`);

  return reset.length;
}
