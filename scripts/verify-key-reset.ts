/**
 * H2 verification: the monthly Apify key reset.
 *
 *   npx tsx scripts/verify-key-reset.ts
 *
 * Safety: nothing is committed. The date-gate tests call the real
 * autoResetKeysMonthly() on days it refuses to act, so they cannot write. The
 * write tests run inside a transaction that is ALWAYS rolled back — under READ
 * COMMITTED those rows are invisible to the live server, so a running worker
 * can never see a key this script briefly un-retired.
 *
 * The write tests execute SQL that mirrors storage.resetExhaustedApifyKeys()
 * rather than calling it: storage holds its own pooled connection and has no
 * way to be handed this script's transaction, and calling it directly would
 * commit against production. The two are kept in step by the assertion below
 * that the predicate selects exactly the rows the live table says it should.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const pg = (await import("pg")).default;
const { autoResetKeysMonthly } = await import("../server/jobs/reset-apify-keys");
const { pool: appPool } = await import("../server/db");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  if (Object.is(actual, expected)) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}  (expected ${String(expected)}, got ${String(actual)})`);
    failed++;
  }
}

const RESET_SQL = `
  UPDATE apify_keys
     SET is_exhausted     = false,
         used_budget      = '0.0000',
         last_error_at    = NULL,
         monthly_reset_at = $2,
         updated_at       = $2
   WHERE is_exhausted = true
     AND (monthly_reset_at IS NULL OR monthly_reset_at < $1)
  RETURNING id, left(token, 16) AS tok, total_budget, used_budget,
            is_exhausted, last_error_at, monthly_reset_at`;

const DAYS_25_MS = 25 * 24 * 60 * 60 * 1000;

(async () => {
  try {
    const before = await pool.query(
      `SELECT count(*) FILTER (WHERE is_exhausted)::int AS exhausted,
              count(*)::int AS total,
              sum(used_budget::numeric)::text AS used
         FROM apify_keys`,
    );
    const { exhausted, total, used } = before.rows[0];
    console.log(`\nPool: ${total} key(s), ${exhausted} retired, $${used} charged in total\n`);

    // ── 1. The date gate ──────────────────────────────────────────────────
    console.log("TEST 1 — only the 1st UTC triggers a reset\n");

    for (const day of ["2026-08-27", "2026-08-31", "2026-09-02", "2026-09-15"]) {
      const n = await autoResetKeysMonthly(new Date(`${day}T01:00:00Z`));
      expect(`${day} is a no-op`, n, 0);
    }

    // 00:30 UTC on the 1st is still the 1st; 23:30 on the last day is not.
    // Boundary matters because the cron fires at 01:00 UTC and node-cron's
    // timezone handling is the only thing keeping that from drifting a day.
    const lateOnLastDay = await autoResetKeysMonthly(new Date("2026-08-31T23:30:00Z"));
    expect("31st 23:30 UTC is a no-op", lateOnLastDay, 0);

    const afterGate = await pool.query(
      `SELECT count(*) FILTER (WHERE is_exhausted)::int AS exhausted FROM apify_keys`,
    );
    expect("no-op days wrote nothing", afterGate.rows[0].exhausted, exhausted);

    // ── 2. The reset itself, rolled back ──────────────────────────────────
    console.log("\nTEST 2 — reset behaviour (transaction, always rolled back)\n");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const firstOfMonth = new Date("2026-09-01T01:00:00Z");
      const cutoff = new Date(firstOfMonth.getTime() - DAYS_25_MS);

      const first = await client.query(RESET_SQL, [cutoff, firstOfMonth]);
      expect("resets every retired key", first.rowCount, exhausted);

      const allClean = first.rows.every(
        (r: any) =>
          r.is_exhausted === false &&
          parseFloat(r.used_budget) === 0 &&
          r.last_error_at === null &&
          r.monthly_reset_at !== null,
      );
      expect("each reset row is back in service with a full budget", allClean, true);

      for (const r of first.rows) {
        console.log(
          `        ${r.tok}...  is_exhausted=false  used=$${r.used_budget}  ` +
            `of $${r.total_budget}  monthly_reset_at=${r.monthly_reset_at.toISOString().slice(0, 10)}`,
        );
      }

      const selectable = await client.query(
        `SELECT count(*)::int AS n FROM apify_keys WHERE is_exhausted = false`,
      );
      expect("whole pool is selectable again", selectable.rows[0].n, total);

      // A restart on the 1st runs the cron job again. monthly_reset_at is the
      // only thing standing between that and a second free $5 per key.
      const rerun = await client.query(RESET_SQL, [cutoff, firstOfMonth]);
      expect("same-day rerun resets nothing", rerun.rowCount, 0);

      // A month later the cutoff has moved past monthly_reset_at, so a key
      // retired again in the meantime is eligible again.
      const nextMonth = new Date("2026-10-01T01:00:00Z");
      await client.query(`UPDATE apify_keys SET is_exhausted = true WHERE id = $1`, [
        first.rows[0].id,
      ]);
      const nextCycle = await client.query(RESET_SQL, [
        new Date(nextMonth.getTime() - DAYS_25_MS),
        nextMonth,
      ]);
      expect("next month's run picks the key up again", nextCycle.rowCount, 1);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const after = await pool.query(
      `SELECT count(*) FILTER (WHERE is_exhausted)::int AS exhausted,
              sum(used_budget::numeric)::text AS used
         FROM apify_keys`,
    );
    expect("rollback restored the retired count", after.rows[0].exhausted, exhausted);
    expect("rollback restored the charged budget", after.rows[0].used, used);

    console.log(`\n  Passed: ${passed}   Failed: ${failed}\n`);
    if (failed > 0) process.exitCode = 1;
  } catch (e) {
    console.error("ERROR:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
    await appPool.end();
  }
})();
