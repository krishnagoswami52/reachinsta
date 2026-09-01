/**
 * Remove the synthetic accounts left in production by our own test runs
 * (docs/signup-security-audit.md, recommendation 15).
 *
 * Two cohorts, both created by us against the live endpoint:
 *   - `%@reachinsta-test.local`       — tests/load/03-auth-flow.js (k6), which
 *     defaults to BASE_URL=https://reachinsta.com and was run on 2026-06-07.
 *   - `%@reachinsta-lifecycle.test`   — scripts/sub-lifecycle-test.ts leftovers.
 *
 * They inflate "587 users" to nearly 3x the real number and will distort every
 * launch-day metric. The cleanup SQL was already written, unrun, in
 * tests/load/03-auth-flow.js:8-9.
 *
 * SAFETY
 * ------
 * The email-domain match alone is not treated as sufficient. Every candidate is
 * re-checked against exclusion rules and any row that trips one is REFUSED, not
 * silently skipped — if a supposedly synthetic account turns out to have real
 * usage, that is a finding, not a row to delete quietly:
 *   - never fetched            (no fetch_runs, fetches_used = 0)
 *   - never paid               (no paddle subscription / customer id, plan free)
 *   - no real profile data     (see SYNTHETIC_NAMES below, no profile image)
 *   - not on the protected list (admins, the paying customer, the rescued user)
 *   - created on or before 2026-06-08
 *
 * On "no real profile data": every one of these rows DOES carry a first and
 * last name, so a bare "has a name" rule refuses all 385. The names are
 * fixtures hardcoded in our own test scripts - `Load Test<4 hex>` from
 * tests/load/03-auth-flow.js:48, `Sub Test` from
 * scripts/sub-lifecycle-test.ts:253, `Sub State` from
 * scripts/sub-state-test.ts:98. Matching one of those EXACTLY is therefore
 * evidence OF synthesis. Any other name is real data and protects the row.
 *
 * DRY RUN BY DEFAULT. Deletion requires --execute.
 *
 *   npx tsx scripts/cleanup-synthetic-accounts.ts
 *   npx tsx scripts/cleanup-synthetic-accounts.ts --execute
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

const EXECUTE = process.argv.includes("--execute");
const INCLUDE_QUARANTINED = process.argv.includes("--include-quarantined");

const SYNTHETIC_DOMAINS = ["%@reachinsta-test.local", "%@reachinsta-lifecycle.test"];

/** Never deletable, whatever else the data says. */
const PROTECTED_EMAILS = [
  "krishna@techcm.in",
  "krishnagoswami52@gmail.com",
  "krishna@reachinsta.co",
  "ben@crownpointdigital.com",
  "yulkakadran@gmail.com",
];

/**
 * Anything created after this needs a human decision, synthetic-looking or not.
 * Rows past it are quarantined into their own tier rather than deleted.
 */
const CREATED_BEFORE = "2026-06-09 00:00:00";

/**
 * Name fixtures hardcoded in our own test scripts. Matching one EXACTLY is
 * evidence the row is synthetic; any other name is real profile data and
 * protects the row.
 *   Load Test<4 hex>  tests/load/03-auth-flow.js:48
 *   Sub Test          scripts/sub-lifecycle-test.ts:253
 *   Sub State         scripts/sub-state-test.ts:98
 */
const SYNTHETIC_NAMES: { first: string; last: RegExp }[] = [
  { first: "Load", last: /^Test[0-9a-f]{4}$/ },
  { first: "Sub", last: /^Test$/ },
  { first: "Sub", last: /^State$/ },
];

function isSyntheticName(first: unknown, last: unknown): boolean {
  return SYNTHETIC_NAMES.some(
    (f) => first === f.first && typeof last === "string" && f.last.test(last),
  );
}

function h(title: string) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

(async () => {
  try {
    h("BEFORE");
    const totals = (
      await db.execute(sql`
        SELECT
          COUNT(*)::int                                                          AS users,
          COUNT(*) FILTER (WHERE email LIKE '%@reachinsta-test.local')::int      AS loadtest,
          COUNT(*) FILTER (WHERE email LIKE '%@reachinsta-lifecycle.test')::int  AS lifecycle
        FROM users`)
    ).rows[0] as any;
    const profileCount = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM profiles`)).rows[0] as any;
    console.log(`users rows            : ${totals.users}`);
    console.log(`  @reachinsta-test.local     : ${totals.loadtest}`);
    console.log(`  @reachinsta-lifecycle.test : ${totals.lifecycle}`);
    console.log(`  genuine (remainder)        : ${totals.users - totals.loadtest - totals.lifecycle}`);
    console.log(`profiles rows         : ${profileCount.n}`);

    // ---------------------------------------------------------------
    // Every candidate, annotated with the evidence for and against.
    // ---------------------------------------------------------------
    const candidates = (
      await db.execute(sql`
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.profile_image_url,
          u.email_verified,
          u.created_at,
          u.ip_address,
          p.plan,
          p.role,
          p.subscription_status,
          p.paddle_subscription_id,
          p.paddle_customer_id,
          p.fetches_used,
          (SELECT COUNT(*)::int FROM fetch_runs   fr WHERE fr.user_id = u.id) AS fetch_runs,
          (SELECT COUNT(*)::int FROM competitors  c  WHERE c.user_id  = u.id) AS competitors
        FROM users u
        LEFT JOIN profiles p ON p.id = u.id
        WHERE u.email LIKE '%@reachinsta-test.local'
           OR u.email LIKE '%@reachinsta-lifecycle.test'
        ORDER BY u.created_at`)
    ).rows as any[];

    h(`CANDIDATES (${candidates.length})`);

    const refused: { email: string; why: string[] }[] = [];
    const quarantined: any[] = [];
    const deletable: any[] = [];

    for (const c of candidates) {
      const why: string[] = [];
      if (PROTECTED_EMAILS.includes(String(c.email).toLowerCase())) why.push("on the protected list");
      if (c.fetch_runs > 0) why.push(`has ${c.fetch_runs} fetch run(s)`);
      if (c.competitors > 0) why.push(`tracks ${c.competitors} competitor(s)`);
      if ((c.fetches_used ?? 0) > 0) why.push(`fetches_used = ${c.fetches_used}`);
      if (c.paddle_subscription_id || c.paddle_customer_id) why.push("has Paddle payment history");
      if (c.plan && c.plan !== "free") why.push(`on the ${c.plan} plan`);
      if (c.role && c.role !== "user") why.push(`role = ${c.role}`);
      if (c.profile_image_url) why.push("has a profile image");
      if ((c.first_name || c.last_name) && !isSyntheticName(c.first_name, c.last_name)) {
        why.push(`has a real name (${[c.first_name, c.last_name].filter(Boolean).join(" ")})`);
      }

      if (why.length) {
        refused.push({ email: c.email, why });
      } else if (new Date(c.created_at) >= new Date(CREATED_BEFORE)) {
        // Clean on every usage test, but newer than the cutoff the brief set.
        // Never deleted without an explicit decision.
        quarantined.push(c);
      } else {
        deletable.push(c);
      }
    }

    // -------- proof that these are bots, not people --------
    const stats = (
      await db.execute(sql`
        SELECT
          MIN(created_at)                                        AS first_seen,
          MAX(created_at)                                        AS last_seen,
          COUNT(*) FILTER (WHERE email_verified IS TRUE)::int     AS verified,
          COUNT(*) FILTER (WHERE first_name IS NOT NULL
                             OR last_name IS NOT NULL)::int       AS with_names,
          COUNT(DISTINCT SUBSTRING(email FROM '@(.*)$'))::int     AS domains
        FROM users
        WHERE email LIKE '%@reachinsta-test.local'
           OR email LIKE '%@reachinsta-lifecycle.test'`)
    ).rows[0] as any;

    console.log(`created between       : ${stats.first_seen}  ..  ${stats.last_seen}`);
    console.log(`ever verified an email: ${stats.verified}`);
    console.log(`with any real name    : ${stats.with_names}`);
    console.log(`distinct email domains: ${stats.domains}`);
    console.log(`with any fetch run    : ${candidates.filter((c) => c.fetch_runs > 0).length}`);
    console.log(`with any competitor   : ${candidates.filter((c) => c.competitors > 0).length}`);
    console.log(`with a profile row    : ${candidates.filter((c) => c.plan !== null).length}`);
    console.log(`with payment history  : ${candidates.filter((c) => c.paddle_customer_id || c.paddle_subscription_id).length}`);

    h("SAMPLE — 10 oldest candidates");
    for (const c of candidates.slice(0, 10)) {
      console.log(
        `  ${String(c.email).padEnd(52)} created=${c.created_at} verified=${c.email_verified} name=${c.first_name ?? "-"}/${c.last_name ?? "-"} plan=${c.plan ?? "(no profile)"} fetches=${c.fetch_runs}`,
      );
    }
    h("SAMPLE — 10 newest candidates");
    for (const c of candidates.slice(-10)) {
      console.log(
        `  ${String(c.email).padEnd(52)} created=${c.created_at} verified=${c.email_verified} name=${c.first_name ?? "-"}/${c.last_name ?? "-"} plan=${c.plan ?? "(no profile)"} fetches=${c.fetch_runs}`,
      );
    }

    h("SIGNUPS PER HOUR — the whole cohort, to show the burst shape");
    const hours = (
      await db.execute(sql`
        SELECT DATE_TRUNC('hour', created_at) AS hour, COUNT(*)::int AS n
        FROM users
        WHERE email LIKE '%@reachinsta-test.local'
           OR email LIKE '%@reachinsta-lifecycle.test'
        GROUP BY 1 ORDER BY 1`)
    ).rows as any[];
    for (const r of hours) console.log(`  ${r.hour}  ${String(r.n).padStart(4)} signups`);

    if (refused.length) {
      h(`REFUSED (${refused.length}) — matched the domain but tripped an exclusion`);
      for (const r of refused) console.log(`  ${r.email}\n      ${r.why.join("; ")}`);
      console.log("\nThese are NOT deleted. Each one needs a human decision.");
    } else {
      h("REFUSED (0)");
      console.log("Every candidate passed every usage, payment and profile-data check.");
    }

    if (quarantined.length) {
      h(`QUARANTINED (${quarantined.length}) - clean, but created after the 2026-06-08 cutoff`);
      const qFirst = quarantined[0];
      const qLast = quarantined[quarantined.length - 1];
      console.log(`  created ${qFirst.created_at}  ..  ${qLast.created_at}`);
      console.log(`  They pass every other rule - no fetch, no competitor, no payment, no profile`);
      console.log(`  row, test-fixture names - but the brief's "nothing created after June 8 2026"`);
      console.log(`  rule covers them, and the two rules disagree. NOT deleted by default.`);
      console.log(`  Add --include-quarantined to delete them as well.`);
    }

    // ---------------------------------------------------------------
    h("PLAN");
    const toDelete = INCLUDE_QUARANTINED ? [...deletable, ...quarantined] : deletable;
    // Bound as ONE Postgres array literal, not a JS array: drizzle's sql``
    // spreads an array into separate placeholders, which ANY() then reads as a
    // record. Ids are gen_random_uuid() values, so the check below is a
    // tripwire, not escaping - anything that is not a UUID means the query
    // above returned something unexpected, and the right move is to stop.
    const ids = toDelete.map((d) => String(d.id));
    if (ids.some((id) => !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id))) {
      throw new Error("Refusing to proceed: a candidate id is not a UUID");
    }
    const idArray = `{${ids.join(",")}}`;
    const related = (
      await db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM profiles                  WHERE id      = ANY(${idArray}::text[])) AS profiles,
          (SELECT COUNT(*)::int FROM competitors               WHERE user_id = ANY(${idArray}::text[])) AS competitors,
          (SELECT COUNT(*)::int FROM email_verification_tokens WHERE user_id = ANY(${idArray}::text[])) AS verif_tokens,
          (SELECT COUNT(*)::int FROM password_reset_tokens     WHERE user_id = ANY(${idArray}::text[])) AS reset_tokens,
          (SELECT COUNT(*)::int FROM page_views                WHERE user_id = ANY(${idArray}::text[])) AS page_views,
          (SELECT COUNT(*)::int FROM sessions   WHERE sess->>'userId' = ANY(${idArray}::text[]))        AS sessions`)
    ).rows[0] as any;

    console.log(`users to delete       : ${toDelete.length}` +
      (INCLUDE_QUARANTINED && quarantined.length ? ` (${deletable.length} + ${quarantined.length} quarantined)` : ""));
    console.log(`  profiles            : ${related.profiles}`);
    console.log(`  competitors         : ${related.competitors}`);
    console.log(`  verification tokens : ${related.verif_tokens}`);
    console.log(`  reset tokens        : ${related.reset_tokens}`);
    console.log(`  page_views (nulled) : ${related.page_views}`);
    console.log(`  sessions            : ${related.sessions}`);
    console.log(`\nusers ${totals.users} -> ${totals.users - toDelete.length}`);

    if (!EXECUTE) {
      h("DRY RUN — nothing was written");
      console.log("Re-run with --execute to perform the deletion inside a transaction.");
      if (quarantined.length && !INCLUDE_QUARANTINED) {
        console.log("Add --include-quarantined to include the post-cutoff rows above.");
      }
      return;
    }

    // ---------------------------------------------------------------
    h("EXECUTING");
    await db.execute(sql`BEGIN`);
    try {
      await db.execute(sql`DELETE FROM sessions WHERE sess->>'userId' = ANY(${idArray}::text[])`);
      await db.execute(sql`DELETE FROM competitors WHERE user_id = ANY(${idArray}::text[])`);
      await db.execute(sql`DELETE FROM email_verification_tokens WHERE user_id = ANY(${idArray}::text[])`);
      await db.execute(sql`DELETE FROM password_reset_tokens WHERE user_id = ANY(${idArray}::text[])`);
      // page_views.user_id is ON DELETE SET NULL — the pageview stays as
      // anonymous traffic, which is what it was. Nulled explicitly so the
      // intent is visible rather than relying on the constraint.
      await db.execute(sql`UPDATE page_views SET user_id = NULL WHERE user_id = ANY(${idArray}::text[])`);
      await db.execute(sql`DELETE FROM profiles WHERE id = ANY(${idArray}::text[])`);
      const del = await db.execute(sql`DELETE FROM users WHERE id = ANY(${idArray}::text[])`);
      console.log(`deleted ${del.rowCount} users`);
      await db.execute(sql`COMMIT`);
    } catch (e) {
      await db.execute(sql`ROLLBACK`);
      throw e;
    }

    h("AFTER");
    const after = (
      await db.execute(sql`
        SELECT
          COUNT(*)::int                                                          AS users,
          COUNT(*) FILTER (WHERE email LIKE '%@reachinsta-test.local')::int      AS loadtest,
          COUNT(*) FILTER (WHERE email LIKE '%@reachinsta-lifecycle.test')::int  AS lifecycle
        FROM users`)
    ).rows[0] as any;
    const afterProfiles = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM profiles`)).rows[0] as any;
    const orphans = (
      await db.execute(sql`SELECT COUNT(*)::int AS n FROM profiles p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.id)`)
    ).rows[0] as any;

    console.log(`users rows            : ${totals.users} -> ${after.users}`);
    console.log(`  @reachinsta-test.local     : ${totals.loadtest} -> ${after.loadtest}`);
    console.log(`  @reachinsta-lifecycle.test : ${totals.lifecycle} -> ${after.lifecycle}`);
    console.log(`profiles rows         : ${profileCount.n} -> ${afterProfiles.n}`);
    console.log(`orphaned profiles     : ${orphans.n}`);
    console.log(
      after.users === totals.users - toDelete.length && orphans.n === 0
        ? "\nOK — counts reconcile."
        : "\nWARNING — counts do not reconcile. Investigate before trusting metrics.",
    );
  } catch (e) {
    console.error("ERROR:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
