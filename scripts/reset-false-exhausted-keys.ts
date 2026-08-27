/**
 * One-off: return keys to the pool that were retired without being spent.
 *
 *   npx tsx scripts/reset-false-exhausted-keys.ts            (dry run, default)
 *   npx tsx scripts/reset-false-exhausted-keys.ts --apply
 *
 * isBudgetError() used to match the bare substring "insufficient", so an
 * "insufficient permissions" or "insufficient data returned from Instagram"
 * response retired the key that produced it. That matching is fixed
 * (server/services/keyManager.ts) and a monthly job now clears the flag
 * (server/jobs/reset-apify-keys.ts), but neither helps the keys already
 * retired: the monthly job only fires on the 1st, and these have been out of
 * the pool for weeks.
 *
 * The local remaining figure is not trusted as evidence here. It is our own
 * accounting — cost-per-item multiplied by item count — and the whole reason
 * these keys are suspect is that our bookkeeping disagreed with reality. So
 * every candidate is checked against the Apify API for what the account has
 * actually spent this month, using the same two endpoints as
 * scripts/apify-audit.ts, and the reset writes Apify's figure rather than
 * ours.
 *
 * A key is only reset when Apify confirms it holds more than the selection
 * floor. Anything that cannot be verified — a dead token, a network failure —
 * is left retired, because a retired key with credit costs throughput while a
 * live key without credit costs a user's fetch.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const { KEY_BUDGET_FLOOR } = await import("../shared/queue");
const { maskToken } = await import("../server/services/keyManager");

const apply = process.argv.includes("--apply");

const pg = (await import("pg")).default;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

type Verdict = "reset" | "keep" | "unverifiable";

interface Check {
  id: string;
  token: string;
  dbRemaining: number;
  apifyRemaining?: number;
  apifyUsed?: number;
  limit?: number;
  verdict: Verdict;
  note?: string;
}

/**
 * What Apify says this account has left this month.
 *
 * Mirrors scripts/apify-audit.ts: /users/me for the plan and its ceiling,
 * /users/me/usage/monthly for the spend. monthlyServiceUsage arrives as
 * either an array of service rows or an object keyed by service name
 * depending on the account, so both shapes are handled.
 */
async function apifyRemaining(token: string): Promise<{ used: number; limit: number }> {
  const auth = { Authorization: `Bearer ${token}` };

  const userRes = await fetch("https://api.apify.com/v2/users/me", { headers: auth });
  if (!userRes.ok) throw new Error(`GET /users/me -> HTTP ${userRes.status}`);
  const planRaw = ((await userRes.json()) as any)?.data?.plan;

  const usageRes = await fetch("https://api.apify.com/v2/users/me/usage/monthly", {
    headers: auth,
  });
  if (!usageRes.ok) throw new Error(`GET /users/me/usage/monthly -> HTTP ${usageRes.status}`);
  const usage = ((await usageRes.json()) as any)?.data;

  let used = 0;
  const msu = usage?.monthlyServiceUsage;
  if (Array.isArray(msu)) {
    used = msu.find((s: any) => s.serviceName === "TOTAL")?.priceUsd ?? usage?.usdSpent ?? 0;
  } else if (msu && typeof msu === "object") {
    const total = (msu as any).TOTAL;
    used =
      total?.priceUsd ??
      Object.values(msu as Record<string, any>).reduce(
        (sum: number, v: any) => sum + (v?.priceUsd ?? 0),
        0,
      );
  } else {
    used = usage?.usdSpent ?? 0;
  }

  const planLimits: Record<string, number> = { FREE: 5, PERSONAL: 49, TEAM: 499 };
  const planId =
    typeof planRaw === "object" && planRaw !== null ? (planRaw.id ?? planRaw.tier ?? "FREE") : (planRaw ?? "FREE");
  const limit =
    (typeof planRaw === "object" && planRaw?.maxMonthlyUsageUsd) || planLimits[planId] || 5;

  return { used, limit };
}

(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT id, token, total_budget, used_budget,
              (total_budget::numeric - used_budget::numeric)::float8 AS remaining,
              last_error_at
         FROM apify_keys
        WHERE is_exhausted = true
        ORDER BY remaining DESC`,
    );

    console.log(`\nMode: ${apply ? "APPLY" : "DRY RUN"}`);

    if (rows.length === 0) {
      console.log("No keys are marked exhausted. Nothing to do.\n");
      return;
    }

    console.log(
      `${rows.length} key(s) marked exhausted. Selection floor is ` +
        `$${KEY_BUDGET_FLOOR.toFixed(2)} — a key must hold more than that to be worth returning.\n`,
    );

    const checks: Check[] = [];

    for (const row of rows) {
      const check: Check = {
        id: row.id,
        token: row.token,
        dbRemaining: row.remaining,
        verdict: "unverifiable",
      };

      try {
        const { used, limit } = await apifyRemaining(row.token);
        const remaining = Math.max(0, limit - used);
        check.apifyUsed = used;
        check.apifyRemaining = remaining;
        check.limit = limit;
        check.verdict = remaining > KEY_BUDGET_FLOOR ? "reset" : "keep";
      } catch (err: any) {
        check.note = err?.message ?? "unknown error";
      }

      checks.push(check);

      console.log(`${maskToken(row.token)}`);
      console.log(
        `   retired:  ${row.last_error_at ? new Date(row.last_error_at).toISOString().slice(0, 10) : "unknown"}`,
      );
      console.log(`   our books: $${check.dbRemaining.toFixed(4)} remaining`);
      if (check.verdict === "unverifiable") {
        console.log(`   apify:     unreachable — ${check.note}`);
        console.log(`   verdict:   SKIP (cannot verify; stays retired)`);
      } else {
        console.log(
          `   apify:     $${check.apifyRemaining!.toFixed(4)} remaining ` +
            `($${check.apifyUsed!.toFixed(4)} of $${check.limit!.toFixed(2)} used this month)`,
        );
        console.log(
          check.verdict === "reset"
            ? `   verdict:   RESET — funded, was retired in error`
            : `   verdict:   KEEP RETIRED — genuinely at or below the floor`,
        );
      }
      console.log("");
    }

    const toReset = checks.filter((c) => c.verdict === "reset");
    const keep = checks.filter((c) => c.verdict === "keep");
    const skipped = checks.filter((c) => c.verdict === "unverifiable");
    const recovered = toReset.reduce((sum, c) => sum + c.apifyRemaining!, 0);

    console.log(
      `Summary: ${toReset.length} to reset ($${recovered.toFixed(2)} back in the pool), ` +
        `${keep.length} genuinely spent, ${skipped.length} unverifiable.`,
    );

    if (!apply) {
      console.log("Nothing was written. Re-run with --apply.\n");
      return;
    }

    for (const c of toReset) {
      // used_budget is set from Apify's own spend figure, not ours. Remaining
      // is derived from it everywhere (total - used), so writing the spend is
      // what makes the local books agree with the account again.
      const used = Math.min(c.apifyUsed!, c.limit!).toFixed(4);
      await pool.query(
        `UPDATE apify_keys
            SET is_exhausted  = false,
                used_budget   = $1,
                total_budget  = $2,
                last_error_at = NULL,
                updated_at    = NOW()
          WHERE id = $3`,
        [used, c.limit!.toFixed(4), c.id],
      );
      console.log(
        `Reset ${maskToken(c.token)} — $${c.apifyRemaining!.toFixed(4)} available (used $${used} of $${c.limit!.toFixed(2)})`,
      );
    }

    const after = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE NOT is_exhausted)::int AS selectable,
              sum(total_budget::numeric - used_budget::numeric) FILTER (WHERE NOT is_exhausted)::text AS pool
         FROM apify_keys`,
    );
    const { total, selectable, pool: poolLeft } = after.rows[0];
    console.log(`\nPool: ${selectable}/${total} keys selectable, $${poolLeft} available.\n`);
  } catch (e) {
    console.error("ERROR:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
    const { pool: appPool } = await import("../server/db");
    await appPool.end();
  }
})();
