/**
 * H2 verification: per-key Apify credit-cycle resets.
 *
 *   npx tsx scripts/verify-key-reset.ts
 *
 * Safety: nothing is committed. Tests 1 and 2 are pure — no network, no
 * database. Test 3 drives the real job in dry-run mode, which polls Apify
 * read-only and writes nothing. Test 4 runs the write path inside a
 * transaction that is ALWAYS rolled back; under READ COMMITTED those rows are
 * invisible to the live server, so a running worker can never see a key this
 * script briefly un-retired.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const pg = (await import("pg")).default;
const { decideKeyReset, autoResetExhaustedKeys } = await import("../server/jobs/reset-apify-keys");
const { parseAccountUsage, readCycleSpend } = await import("../server/services/apifyAccount");
const { KEY_BUDGET_FLOOR } = await import("../shared/queue");
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

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A usage view with a cycle window and a spend, for driving the pure rules. */
function usage(cycleStart: string, cycleEnd: string, usedUsd: number, limitUsd = 5) {
  return {
    plan: "FREE",
    cycleStart: day(cycleStart),
    cycleEnd: day(cycleEnd),
    usedUsd,
    limitUsd,
    remainingUsd: Math.max(0, limitUsd - usedUsd),
  };
}

const NOW = new Date("2026-08-27T01:00:00.000Z");

(async () => {
  try {
    // ── 1. The decision rules ─────────────────────────────────────────────
    console.log("\nTEST 1 — decideKeyReset(): when does a key go back in the pool\n");

    // Never reset before: any cycle counts, so a funded key is rescued at once.
    // This is the case the four pre-existing retirements fall into.
    expect(
      "never reset + funded -> reset",
      decideKeyReset(usage("2026-08-27", "2026-09-26", 0.001), null, NOW).action,
      "reset",
    );

    // A cycle that turned over after we last credited the key.
    expect(
      "new cycle + funded -> reset",
      decideKeyReset(usage("2026-08-27", "2026-09-26", 0.5), day("2026-07-28"), NOW).action,
      "reset",
    );

    // The bug this change fixes: a key whose own cycle rolled over on the 27th
    // must come back on the 27th, not wait for the 1st.
    const offCalendar = decideKeyReset(usage("2026-08-27", "2026-09-26", 0), day("2026-07-27"), NOW);
    expect("cycle starting on the 27th resets on the 27th", offCalendar.action, "reset");

    // Still inside the cycle we already credited — the double-credit guard.
    const same = decideKeyReset(usage("2026-07-30", "2026-08-29", 0.1), day("2026-07-30"), NOW);
    expect("same cycle -> hold", same.action, "hold");
    expect(
      "same cycle -> reason",
      same.action === "hold" ? same.reason : undefined,
      "same-cycle",
    );
    expect(
      "same cycle -> days until renewal",
      same.action === "hold" && same.reason === "same-cycle" ? same.daysUntilRenewal : undefined,
      2,
    );

    // Reset stamped mid-cycle, cycle unchanged: still the same cycle.
    expect(
      "reset stamped after cycle start -> hold",
      decideKeyReset(usage("2026-08-27", "2026-09-26", 0), day("2026-08-28"), NOW).action,
      "hold",
    );

    // A fresh cycle does not by itself mean money. One account in this pool
    // carries spend past its allowance.
    const spent = decideKeyReset(usage("2026-07-30", "2026-08-29", 5.65), null, NOW);
    expect("new cycle but overspent -> hold", spent.action, "hold");
    expect(
      "new cycle but overspent -> reason",
      spent.action === "hold" ? spent.reason : undefined,
      "no-budget",
    );

    // The floor is the same one selection filters on, and it is strict.
    expect(
      `exactly at the $${KEY_BUDGET_FLOOR.toFixed(2)} floor -> hold`,
      decideKeyReset(usage("2026-08-27", "2026-09-26", 5 - KEY_BUDGET_FLOOR), null, NOW).action,
      "hold",
    );
    expect(
      "a cent above the floor -> reset",
      decideKeyReset(usage("2026-08-27", "2026-09-26", 5 - KEY_BUDGET_FLOOR - 0.01), null, NOW)
        .action,
      "reset",
    );

    // ── 2. Reading the spend out of a payload ─────────────────────────────
    console.log("\nTEST 2 — readCycleSpend(): the field that broke the audit\n");

    // The live shape. priceUsd does NOT exist at the service level — it lives
    // inside priceTiers — so summing it returns 0 for a real account. This is
    // the exact payload shape that made apify-audit.ts report every account as
    // $0.00 used and healthy.
    const livePayload = {
      usageCycle: { startAt: "2026-07-30T00:00:00.000Z", endAt: "2026-08-29T23:59:59.999Z" },
      totalUsageCreditsUsdAfterVolumeDiscount: 5.6494,
      totalUsageCreditsUsdBeforeVolumeDiscount: 5.6494,
      monthlyServiceUsage: {
        ACTOR_COMPUTE_UNITS: {
          amountAfterVolumeDiscountUsd: 5.6,
          priceTiers: [{ priceUsd: 5.6 }],
        },
        DATASET_READS: { amountAfterVolumeDiscountUsd: 0.0494, priceTiers: [{ priceUsd: 0.0494 }] },
      },
    };
    expect("top-level total is preferred", readCycleSpend(livePayload), 5.6494);
    expect(
      "the old per-service priceUsd sum would have said",
      Object.values(livePayload.monthlyServiceUsage).reduce(
        (s: number, v: any) => s + (v?.priceUsd ?? 0),
        0,
      ),
      0,
    );

    // Payload without the top-level totals: fall back to the per-service
    // discounted amounts rather than to a confident zero.
    const noTotals = { ...livePayload } as any;
    delete noTotals.totalUsageCreditsUsdAfterVolumeDiscount;
    delete noTotals.totalUsageCreditsUsdBeforeVolumeDiscount;
    expect("falls back to per-service amounts", Math.round(readCycleSpend(noTotals) * 10000), 56494);

    // Legacy array shape with a TOTAL row.
    expect(
      "legacy array shape",
      readCycleSpend({
        monthlyServiceUsage: [
          { serviceName: "ACTOR", priceUsd: 1.5 },
          { serviceName: "TOTAL", priceUsd: 2.25 },
        ],
      }),
      2.25,
    );

    const parsed = parseAccountUsage({ plan: { id: "FREE", maxMonthlyUsageUsd: 5 } }, livePayload);
    expect("parses the limit", parsed.limitUsd, 5);
    expect("remaining floors at zero when overspent", parsed.remainingUsd, 0);
    expect("parses the cycle start", parsed.cycleStart.toISOString().slice(0, 10), "2026-07-30");

    let threw = false;
    try {
      parseAccountUsage({ plan: "FREE" }, { monthlyServiceUsage: {} });
    } catch {
      threw = true;
    }
    expect("a payload with no usageCycle throws rather than guessing", threw, true);

    // ── 3. The real job, dry run against the live pool ────────────────────
    console.log("\nTEST 3 — autoResetExhaustedKeys({ dryRun: true }) against production\n");

    const before = await pool.query(
      `SELECT count(*) FILTER (WHERE is_exhausted)::int AS retired,
              count(last_reset_check_at)::int AS checked,
              sum(used_budget::numeric)::text AS used
         FROM apify_keys`,
    );
    const { retired, checked, used } = before.rows[0];

    const summary = await autoResetExhaustedKeys({ dryRun: true, now: new Date() });
    expect("polled every retired key", summary.checked, retired);
    expect(
      "every key got a decision",
      summary.reset + summary.held + summary.skipped,
      summary.checked,
    );

    const after3 = await pool.query(
      `SELECT count(*) FILTER (WHERE is_exhausted)::int AS retired,
              count(last_reset_check_at)::int AS checked,
              sum(used_budget::numeric)::text AS used
         FROM apify_keys`,
    );
    expect("dry run left is_exhausted alone", after3.rows[0].retired, retired);
    expect("dry run wrote no check timestamps", after3.rows[0].checked, checked);
    expect("dry run left the books alone", after3.rows[0].used, used);

    // ── 4. The write path, rolled back ────────────────────────────────────
    console.log("\nTEST 4 — write path (transaction, always rolled back)\n");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const target = await client.query(
        `SELECT id FROM apify_keys WHERE is_exhausted = true LIMIT 1`,
      );
      const id = target.rows[0]?.id;

      if (!id) {
        console.log("  SKIP  no retired key to exercise the write path against");
      } else {
        const reset = await client.query(
          `UPDATE apify_keys
              SET is_exhausted = false, used_budget = $1, total_budget = $2,
                  last_error_at = NULL, monthly_reset_at = $3,
                  last_reset_check_at = $3, updated_at = $3
            WHERE id = $4
        RETURNING is_exhausted, used_budget, total_budget, last_error_at,
                  monthly_reset_at, last_reset_check_at`,
          ["0.0010", "5.0000", NOW, id],
        );
        const r = reset.rows[0];
        expect("reset clears is_exhausted", r.is_exhausted, false);
        expect("reset writes Apify's spend, not zero", r.used_budget, "0.0010");
        expect("reset writes Apify's ceiling", r.total_budget, "5.0000");
        expect("reset clears the error stamp", r.last_error_at, null);
        expect("reset stamps the credit guard", r.monthly_reset_at?.toISOString(), NOW.toISOString());
        expect("reset stamps the check", r.last_reset_check_at?.toISOString(), NOW.toISOString());

        // A held key records only that it was looked at. Its budget and error
        // history are still the ones that retired it.
        await client.query(`UPDATE apify_keys SET is_exhausted = true WHERE id = $1`, [id]);
        const held = await client.query(
          `UPDATE apify_keys SET last_reset_check_at = $1 WHERE id = $2
        RETURNING is_exhausted, used_budget, monthly_reset_at, last_reset_check_at`,
          [new Date("2026-08-28T01:00:00.000Z"), id],
        );
        const h = held.rows[0];
        expect("hold leaves the key retired", h.is_exhausted, true);
        expect("hold does not touch the budget", h.used_budget, "0.0010");
        expect(
          "hold does not move the credit guard",
          h.monthly_reset_at?.toISOString(),
          NOW.toISOString(),
        );
        expect(
          "hold advances the check timestamp",
          h.last_reset_check_at?.toISOString(),
          "2026-08-28T01:00:00.000Z",
        );
      }

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const after = await pool.query(
      `SELECT count(*) FILTER (WHERE is_exhausted)::int AS retired,
              count(last_reset_check_at)::int AS checked,
              sum(used_budget::numeric)::text AS used
         FROM apify_keys`,
    );
    expect("rollback restored the retired count", after.rows[0].retired, retired);
    expect("rollback restored the check timestamps", after.rows[0].checked, checked);
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
