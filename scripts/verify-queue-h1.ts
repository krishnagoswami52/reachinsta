/**
 * H1 verification: priority queue, concurrency, key selection, queue UI math
 * and the error translation layer.
 *
 *   npx tsx scripts/verify-queue-h1.ts
 *
 * Safety: every test that needs rows of its own creates them inside a
 * transaction that is ALWAYS rolled back. Uncommitted rows are invisible to
 * every other connection under READ COMMITTED, so a live worker can never see
 * a synthetic job — this cannot enqueue real work or spend Apify credit. The
 * only reads against real data are read-only.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const pg = (await import("pg")).default;

const { canStartJob } = await import("../server/worker");
type ActiveSlot = { userId: string; priority: number };
const { chooseKeyForPlan, getKeyForPlan, remainingBudget } = await import(
  "../server/services/keyManager"
);
const { detectErrorCode, getUserFriendlyError } = await import("../server/utils/errorMessages");
const {
  KEY_BUDGET_FLOOR,
  MAX_CONCURRENT_JOBS,
  MIN_KEY_BUDGET,
  estimateQueueWaitSeconds,
  queuePositionMessage,
  planForPriority,
} = await import("../shared/queue");

/**
 * Minimal ApifyKey stand-in: selection only ever reads token/budget fields.
 *
 * The budget is expressed as total minus zero rather than 5.00 minus spend, so
 * remainingBudget() returns the requested figure exactly. Going through a
 * subtraction reintroduces binary-float drift (5 - 4.6 = 0.40000000000000036)
 * that would make the assertions below test IEEE 754, not the selection rules.
 */
function fakeKey(remaining: number, id = `k${remaining}`): any {
  return {
    id,
    token: `apify_api_${id}`,
    totalBudget: remaining.toFixed(4),
    usedBudget: "0.0000",
    isExhausted: false,
  };
}
const rem = (k: any) => remainingBudget(k);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function heading(n: string, title: string) {
  console.log(`\n=== ${n}: ${title} ===`);
}

/** Seed profiles + runs + jobs inside a transaction the caller will roll back. */
async function seedQueue(
  client: any,
  rows: { plan: string; priority: number; minutesAgo: number; label: string }[],
) {
  const ids: Record<string, { userId: string; runId: string; jobId: string }> = {};
  for (const row of rows) {
    const userId = `h1test-${row.label}`;
    await client.query(
      `INSERT INTO profiles (id, email, plan, max_competitors, monthly_fetch_limit, time_range_max_days)
       VALUES ($1, $2, $3, 5, 4, 28)`,
      [userId, `${userId}@example.invalid`, row.plan],
    );
    const run = await client.query(
      `INSERT INTO fetch_runs (user_id, time_range_days, competitor_usernames, status, created_at)
       VALUES ($1, 7, ARRAY['someone'], 'queued', NOW() - ($2 || ' minutes')::interval)
       RETURNING id`,
      [userId, String(row.minutesAgo)],
    );
    const job = await client.query(
      `INSERT INTO jobs (user_id, fetch_run_id, type, status, attempts, priority, created_at)
       VALUES ($1, $2, 'fetch_apify', 'queued', 0, $3, NOW() - ($4 || ' minutes')::interval)
       RETURNING id`,
      [userId, run.rows[0].id, row.priority, String(row.minutesAgo)],
    );
    ids[row.label] = { userId, runId: run.rows[0].id, jobId: job.rows[0].id };
  }
  return ids;
}

/** The exact ordering getQueuedJobs() uses. */
const QUEUE_ORDER_SQL = `
  SELECT j.id, j.user_id, j.priority, j.created_at
    FROM jobs j
   WHERE j.status = 'queued' AND j.user_id LIKE 'h1test-%'
   ORDER BY j.priority ASC, j.created_at ASC
   LIMIT $1`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    heading("Test 1", "Priority queue orders paid work ahead of free");
    // Free users queued FIRST, pro LAST — the ordering must still put pro first.
    const seeded = await seedQueue(client, [
      { plan: "free", priority: 3, minutesAgo: 20, label: "free-a" },
      { plan: "free", priority: 3, minutesAgo: 19, label: "free-b" },
      { plan: "plus", priority: 2, minutesAgo: 10, label: "plus-a" },
      { plan: "plus", priority: 2, minutesAgo: 9, label: "plus-b" },
      { plan: "pro", priority: 1, minutesAgo: 1, label: "pro-a" },
    ]);
    const byJobId = new Map(Object.entries(seeded).map(([k, v]) => [v.jobId, k]));

    const ordered = await client.query(QUEUE_ORDER_SQL, [20]);
    const order = ordered.rows.map((r: any) => byJobId.get(r.id));
    check(
      "pro first, then plus by created_at, then free by created_at",
      JSON.stringify(order) === JSON.stringify(["pro-a", "plus-a", "plus-b", "free-a", "free-b"]),
      order.join(" -> "),
    );
    check(
      "pro queued 19 min after free-a still outranks it",
      order.indexOf("pro-a") < order.indexOf("free-a"),
    );
    check(
      "same priority stays FIFO (plus-a before plus-b)",
      order.indexOf("plus-a") < order.indexOf("plus-b"),
    );

    heading("Test 2", "Concurrency: five jobs start at once, not one");
    {
      // Ten distinct users so the per-user cap is not what is being measured.
      const active = new Map<string, ActiveSlot>();
      const candidates = Array.from({ length: 10 }, (_, i) => ({
        id: `job-${i}`,
        userId: `user-${i}`,
        priority: i < 2 ? 1 : 3,
      }));
      let started = 0;
      for (const c of candidates) {
        const d = canStartJob(c, active);
        if (d.start) {
          active.set(c.id, { userId: c.userId, priority: c.priority });
          started++;
        } else if (d.reason === "pool-full") {
          break;
        }
      }
      check(
        `pool fills to ${MAX_CONCURRENT_JOBS} slots`,
        started === MAX_CONCURRENT_JOBS,
        `${started} started`,
      );
      check("6th job waits rather than starting", active.size === MAX_CONCURRENT_JOBS);
    }

    heading("Test 4", "Free users are not starved by a pro-heavy queue");
    {
      const active = new Map<string, ActiveSlot>();
      for (let i = 0; i < 4; i++) active.set(`pro-${i}`, { userId: `pro-user-${i}`, priority: 1 });

      const proDecision = canStartJob({ userId: "pro-user-9", priority: 1 }, active);
      check(
        "a 5th pro job cannot take the reserved slot",
        !proDecision.start && proDecision.reason === "free-slot-reserved",
        proDecision.start ? "started" : proDecision.reason,
      );

      const freeDecision = canStartJob({ userId: "free-user-1", priority: 3 }, active);
      check("a free job DOES take the reserved slot", freeDecision.start);
    }

    heading("Test 4b", "One user cannot monopolise the pool");
    {
      const active = new Map<string, ActiveSlot>();
      active.set("a", { userId: "whale", priority: 1 });
      active.set("b", { userId: "whale", priority: 1 });
      active.set("c", { userId: "whale", priority: 1 });
      const d = canStartJob({ userId: "whale", priority: 1 }, active);
      check(
        "pro user is capped at 3 concurrent",
        !d.start && d.reason === "user-limit",
        d.start ? "started" : d.reason,
      );

      const free = new Map<string, ActiveSlot>([["x", { userId: "solo", priority: 3 }]]);
      const d2 = canStartJob({ userId: "solo", priority: 3 }, free);
      check(
        "free user is capped at 1 concurrent",
        !d2.start && d2.reason === "user-limit",
        d2.start ? "started" : d2.reason,
      );

      const plus = new Map<string, ActiveSlot>([["x", { userId: "p", priority: 2 }]]);
      check("plus user may hold a 2nd slot", canStartJob({ userId: "p", priority: 2 }, plus).start);
    }

    heading("Test 5", "Queue position + wait estimate + messaging");
    {
      const target = seeded["free-a"];
      const ahead = await client.query(
        `SELECT COUNT(*)::int AS n
           FROM jobs
          WHERE status = 'queued' AND user_id LIKE 'h1test-%'
            AND (priority < 3 OR (priority = 3 AND created_at < (SELECT created_at FROM jobs WHERE id = $1)))`,
        [target.jobId],
      );
      const position = ahead.rows[0].n + 1;
      check("free-a reports position 4 (3 paid jobs ahead)", position === 4, `position ${position}`);

      check(
        "idle pool => no wait for a job that fits a free slot",
        estimateQueueWaitSeconds(3, 0) === 0,
      );
      check(
        "saturated pool => one run's wait at position 3",
        estimateQueueWaitSeconds(3, 5) === 63,
        `${estimateQueueWaitSeconds(3, 5)}s`,
      );
      check(
        "position 12 on a saturated pool waits ~3 runs",
        estimateQueueWaitSeconds(12, 5) === 189,
        `${estimateQueueWaitSeconds(12, 5)}s`,
      );

      const proMsg = queuePositionMessage(4, 126, "pro");
      const freeMsg = queuePositionMessage(4, 126, "free");
      const nextMsg = queuePositionMessage(1, 0, "free");
      check("pro copy names the priority queue", proMsg.includes("priority queue"), proMsg);
      check("free copy does not claim priority", !freeMsg.includes("priority"), freeMsg);
      check("position 1 changes the message", nextMsg.includes("next"), nextMsg);
      check(
        "no message leaks internals",
        [proMsg, freeMsg, nextMsg].every((m) => !/apify|key|worker|error|token/i.test(m)),
      );
      check("priority 1 maps back to pro", planForPriority(1) === "pro");
    }

    heading("Test 6", "Zero regression: history untouched");
    {
      const hist = await client.query(
        `SELECT status, COUNT(*)::int AS n FROM fetch_runs
          WHERE user_id NOT LIKE 'h1test-%' GROUP BY status ORDER BY status`,
      );
      const counts: Record<string, number> = Object.fromEntries(
        hist.rows.map((r: any) => [r.status, r.n]),
      );
      check("108 completed runs still present", counts.completed === 108, JSON.stringify(counts));
      check("12 failed runs still present", counts.failed === 12);

      const nonTerminal = await client.query(
        `SELECT COUNT(*)::int AS n FROM fetch_runs
          WHERE user_id NOT LIKE 'h1test-%' AND status NOT IN ('completed','failed')`,
      );
      check(
        "no run left stranded non-terminal",
        nonTerminal.rows[0].n === 0,
        `${nonTerminal.rows[0].n} stranded`,
      );

      const orphans = await client.query(
        `SELECT COUNT(*)::int AS n FROM jobs WHERE user_id NOT LIKE 'h1test-%' AND status = 'running'`,
      );
      check("no orphaned running job (C1 still clean)", orphans.rows[0].n === 0);

      const reels = await client.query(`SELECT COUNT(*)::int AS n FROM reels`);
      check("reels data intact", reels.rows[0].n > 0, `${reels.rows[0].n} reels`);

      const backfill = await client.query(
        `SELECT COUNT(*)::int AS n FROM jobs
          WHERE user_id NOT LIKE 'h1test-%' AND status IN ('completed','failed') AND priority <> 3`,
      );
      check("terminal history was not re-prioritised", backfill.rows[0].n === 0);
    }
  } finally {
    // Never commit. Every synthetic row above disappears here.
    await client.query("ROLLBACK");
    client.release();
  }

  heading("Test 3a", "Key selection rules (constructed pools)");
  {
    check("floor is $0.30", KEY_BUDGET_FLOOR === 0.3, `$${KEY_BUDGET_FLOOR}`);
    check("pro filters at the floor", MIN_KEY_BUDGET.pro === KEY_BUDGET_FLOOR);
    check("free filters at the floor", MIN_KEY_BUDGET.free === KEY_BUDGET_FLOOR);
    check("plus filters at $2.00", MIN_KEY_BUDGET.plus === 2.0);

    // A pool spanning every interesting boundary.
    const mixed = [fakeKey(0.2), fakeKey(0.4), fakeKey(1.9), fakeKey(2.5), fakeKey(4.0)];

    const pro = chooseKeyForPlan(mixed, "pro")!;
    check("pro takes the highest ($4.00)", rem(pro.key) === 4.0, `$${rem(pro.key)}`);
    check("pro never falls back (its threshold is the floor)", pro.usedFallback === false);

    const plus = chooseKeyForPlan(mixed, "plus")!;
    check("plus takes the lowest above $2.00 ($2.50)", rem(plus.key) === 2.5, `$${rem(plus.key)}`);
    check("plus ignores the $1.90 and $0.40 keys", rem(plus.key) > 2.0);
    check("plus did not need the fallback here", plus.usedFallback === false);

    const free = chooseKeyForPlan(mixed, "free")!;
    check("free takes the lowest above the floor ($0.40)", rem(free.key) === 0.4, `$${rem(free.key)}`);

    check(
      "no plan touches the $0.20 key",
      [pro, plus, free].every((c) => rem(c.key) > KEY_BUDGET_FLOOR),
    );

    // Plus fallback: nothing clears $2.00, so it drops to free's set.
    const lean = [fakeKey(0.25), fakeKey(0.5), fakeKey(1.2), fakeKey(1.9)];
    const plusFallback = chooseKeyForPlan(lean, "plus")!;
    check("plus falls back when no key clears $2.00", plusFallback.usedFallback === true);
    check(
      "plus fallback takes the lowest above the floor ($0.50)",
      rem(plusFallback.key) === 0.5,
      `$${rem(plusFallback.key)}`,
    );
    check("plus fallback still skips the $0.25 key", rem(plusFallback.key) > KEY_BUDGET_FLOOR);
    check(
      "plus fallback matches what free would pick",
      plusFallback.key.id === chooseKeyForPlan(lean, "free")!.key.id,
    );
    check(
      "pro on the same lean pool still takes the highest ($1.90)",
      rem(chooseKeyForPlan(lean, "pro")!.key) === 1.9,
    );

    // Nothing above the floor at all -> hard failure for every plan.
    const spent = [fakeKey(0.3), fakeKey(0.29), fakeKey(0.05)];
    check(
      "a pool entirely at/below the floor yields no key, on any plan",
      (["pro", "plus", "free"] as const).every((p) => chooseKeyForPlan(spent, p) === null),
    );
    check("$0.30 exactly is not selectable (strict >)", chooseKeyForPlan([fakeKey(0.3)], "pro") === null);
    check("$0.31 is selectable", chooseKeyForPlan([fakeKey(0.31)], "pro") !== null);

    // In-flight preference still applies on top of the new rules.
    const busy = new Set([fakeKey(0.4).token]);
    const spread = chooseKeyForPlan(mixed, "free", busy)!;
    check(
      "free skips an in-flight key and takes the next lowest ($1.90)",
      rem(spread.key) === 1.9,
      `$${rem(spread.key)}`,
    );
    const allBusy = new Set(mixed.map((k) => k.token));
    const forced = chooseKeyForPlan(mixed, "free", allBusy)!;
    check("preference is dropped when every key is in flight", forced.allInFlight === true);
    check("...and it still returns a usable key", rem(forced.key) === 0.4);
  }

  heading("Test 3b", "Live key pool (read-only) — what production would pick");
  {
    const all = await pool.query(
      `SELECT id, left(token, 14) AS token, (total_budget::numeric - used_budget::numeric)::float8 AS remaining
         FROM apify_keys WHERE is_exhausted = false
        ORDER BY remaining DESC`,
    );
    const remaining = all.rows.map((r: any) => r.remaining);
    console.log(`  pool: ${remaining.map((r: number) => `$${r.toFixed(4)}`).join(", ")}`);

    const proKey = await getKeyForPlan("pro");
    const plusKey = await getKeyForPlan("plus");
    const freeKey = await getKeyForPlan("free");
    const pro = remainingBudget(proKey);
    const plus = remainingBudget(plusKey);
    const free = remainingBudget(freeKey);

    console.log(
      `  pro -> $${pro.toFixed(4)} | plus -> $${plus.toFixed(4)} | free -> $${free.toFixed(4)}`,
    );

    check("pro takes the pool maximum", Math.abs(pro - Math.max(...remaining)) < 1e-6);
    check("free takes the pool minimum", Math.abs(free - Math.min(...remaining)) < 1e-6);

    const abovePlusThreshold = remaining.filter((r: number) => r > MIN_KEY_BUDGET.plus);
    if (abovePlusThreshold.length > 0) {
      check(
        "plus takes the lowest key above $2.00",
        Math.abs(plus - Math.min(...abovePlusThreshold)) < 1e-6,
        `$${plus.toFixed(4)} vs $${Math.min(...abovePlusThreshold).toFixed(4)}`,
      );
    } else {
      check("plus fell back to the floor set", Math.abs(plus - Math.min(...remaining)) < 1e-6);
    }

    check(
      "every selection clears the $0.30 floor",
      [pro, plus, free].every((r) => r > KEY_BUDGET_FLOOR),
    );
    check("pro and free are different keys", proKey.id !== freeKey.id);
  }

  heading("Phase 9", "No technical error text reaches a user");
  {
    const cases: { raw: any; code: string; expect: "message" | "silent" }[] = [
      {
        raw: new Error("Actor: insufficient credit remaining"),
        code: "APIFY_KEY_EXHAUSTED",
        expect: "message",
      },
      {
        raw: Object.assign(new Error("exceeded 600s"), { name: "FetchTimeoutError" }),
        code: "APIFY_TIMEOUT",
        expect: "message",
      },
      {
        raw: new Error("Recovering: worker went away 50724m ago"),
        code: "JOB_RECOVERED",
        expect: "silent",
      },
      {
        raw: new Error("This account is private"),
        code: "INSTAGRAM_PRIVATE_ACCOUNT",
        expect: "message",
      },
      {
        raw: new Error("connect ECONNREFUSED 10.0.0.1:5432"),
        code: "NETWORK_ERROR",
        expect: "message",
      },
      {
        raw: new Error("[KeyManager] All Apify keys exhausted — no budget remaining"),
        code: "APIFY_ALL_KEYS_EXHAUSTED",
        expect: "message",
      },
      { raw: new Error("numeric field overflow"), code: "DATABASE_ERROR", expect: "message" },
      { raw: new Error("something nobody predicted"), code: "UNKNOWN_ERROR", expect: "message" },
    ];

    for (const c of cases) {
      const code = detectErrorCode(c.raw);
      const msg = getUserFriendlyError(c.raw);
      check(`"${String(c.raw.message).slice(0, 34)}" -> ${c.code}`, code === c.code, code);
      if (c.expect === "silent") {
        check("  ...and shows the user nothing", msg === null, JSON.stringify(msg));
      } else {
        check(
          "  ...and shows friendly copy only",
          typeof msg === "string" &&
            msg.length > 0 &&
            !/apify|econnrefused|numeric field|worker went away|insufficient credit|600s|stack/i.test(
              msg,
            ),
          JSON.stringify(msg),
        );
      }
    }

    const stored = await pool.query(
      `SELECT id, error_message FROM fetch_runs
        WHERE error_message IS NOT NULL
          AND (error_message ILIKE '%apify%' OR error_message ILIKE '%econnrefused%'
               OR error_message ILIKE '%recovering%' OR error_message ILIKE '%insufficient%'
               OR error_message ILIKE '%worker went away%' OR error_message ILIKE '%retry %')`,
    );
    console.log(
      `  ${stored.rowCount} pre-existing run(s) hold raw text written before this change:`,
    );
    for (const r of stored.rows.slice(0, 5)) console.log(`     ${r.id}: ${r.error_message}`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

try {
  await main();
} catch (e) {
  console.error("HARNESS ERROR:", e);
  process.exitCode = 1;
} finally {
  await pool.end();
  const { pool: appPool } = await import("../server/db");
  await appPool.end();
}
