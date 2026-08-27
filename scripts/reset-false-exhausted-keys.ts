/**
 * One-off: return keys to the pool that were retired without being spent.
 *
 *   npx tsx scripts/reset-false-exhausted-keys.ts            (dry run, default)
 *   npx tsx scripts/reset-false-exhausted-keys.ts --apply
 *
 * isBudgetError() used to match the bare substring "insufficient", so an
 * "insufficient permissions" or "insufficient data returned from Instagram"
 * response retired the key that produced it. That matching is fixed
 * (server/services/keyManager.ts) and a daily job now polls each retired key
 * for its own renewal date (server/jobs/reset-apify-keys.ts).
 *
 * The local remaining figure is not trusted as evidence here. It is our own
 * accounting — cost-per-item multiplied by item count, never reset when the
 * real cycle rolls over — and the whole reason these keys are suspect is that
 * our bookkeeping disagreed with reality. So every candidate is checked
 * against the account itself via server/services/apifyAccount.ts, and the
 * reset writes Apify's figures rather than ours.
 *
 * A key is only reset when Apify confirms it holds more than the selection
 * floor. Anything that cannot be verified — a dead token, a network failure —
 * is left retired, because a retired key with credit costs throughput while a
 * live key without credit costs a user's fetch.
 *
 * Now that the daily job (server/jobs/reset-apify-keys.ts) polls each key's
 * own renewal date, this script is only needed for the backlog it was written
 * for: keys retired before that job existed, whose cycle had already turned
 * over. The job will reach them on its next run regardless — this is the way
 * to do it immediately, and to see the reasoning per key first.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const { KEY_BUDGET_FLOOR } = await import("../shared/queue");
const { maskToken } = await import("../server/services/keyManager");
const { fetchApifyAccountUsage } = await import("../server/services/apifyAccount");

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
  cycle?: string;
  verdict: Verdict;
  note?: string;
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
        const usage = await fetchApifyAccountUsage(row.token);
        check.apifyUsed = usage.usedUsd;
        check.apifyRemaining = usage.remainingUsd;
        check.limit = usage.limitUsd;
        check.cycle =
          `${usage.cycleStart.toISOString().slice(0, 10)} -> ` +
          `${usage.cycleEnd.toISOString().slice(0, 10)}`;
        check.verdict = usage.remainingUsd > KEY_BUDGET_FLOOR ? "reset" : "keep";
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
        console.log(`   cycle:     ${check.cycle}`);
        console.log(
          `   apify:     $${check.apifyRemaining!.toFixed(4)} remaining ` +
            `($${check.apifyUsed!.toFixed(4)} of $${check.limit!.toFixed(2)} spent this cycle)`,
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
      // monthly_reset_at is stamped for the same reason the daily job stamps
      // it: if this key is retired again inside the cycle it was just credited
      // for, the job's same-cycle guard must see that it has already had its
      // allowance and hold it until the cycle really turns over.
      await pool.query(
        `UPDATE apify_keys
            SET is_exhausted        = false,
                used_budget         = $1,
                total_budget        = $2,
                last_error_at       = NULL,
                monthly_reset_at    = NOW(),
                last_reset_check_at = NOW(),
                updated_at          = NOW()
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
