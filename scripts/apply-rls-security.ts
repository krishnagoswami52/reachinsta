// One-off: enable Row Level Security across the public schema (idempotent).
// Applies supabase/migrations/20260501000000_enable_rls_security.sql, which was
// written on 2026-05-01 but never run — docs/supabase-security-audit.md found
// RLS off on 13 of 15 tables in production, because that migration was the only
// one without an apply script and SECURITY.md left it as a manual SQL-editor paste.
//
// Also covers processed_webhook_events, which postdates the migration and is not
// named in it. Together that takes the schema to 15/15.
//
// The backend connects as `postgres`, which holds rolbypassrls = true, so this is
// invisible to the app — it only closes anonymous PostgREST (Supabase REST API)
// access. Verified before running: SELECT rolbypassrls FROM pg_roles → true.
//
//   npx tsx scripts/apply-rls-security.ts          # apply
//   npx tsx scripts/apply-rls-security.ts --check  # report only, change nothing
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
const pg = (await import("pg")).default;

const CHECK_ONLY = process.argv.includes("--check");

// Tier 1 — user-owned. Policies use auth.uid() for forward-compatibility with
// Supabase Auth. This app uses Express sessions, so auth.uid() is NULL and these
// match no rows today: effectively deny-all until Supabase Auth is adopted.
const TIER_1_WITH_POLICIES = ["users", "profiles"] as const;

// Tier 1 (lockdown) + Tier 2 — RLS on, no policies. Deny-all for anon and
// authenticated; the backend bypasses RLS entirely.
const LOCKDOWN = [
  "sessions",
  "email_verification_tokens",
  "password_reset_tokens",
  "apify_keys",
  "fetch_runs",
  "raw_payloads",
  "jobs",
  "reels",
  "competitor_stats",
  "competitors",
  // Not in the 2026-05-01 migration — created later, never covered.
  "processed_webhook_events",
] as const;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

const report = async (label: string) => {
  const { rows } = await pool.query(
    `SELECT c.relname AS table_name, c.relrowsecurity AS rls,
            (SELECT count(*) FROM pg_policies p
              WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
     ORDER BY c.relrowsecurity ASC, c.relname`);
  const on = rows.filter(r => r.rls).length;
  console.log(`\n=== ${label} — RLS enabled on ${on}/${rows.length} tables ===`);
  for (const r of rows) {
    console.log(`  ${r.rls ? "ON " : "OFF"}  ${String(r.table_name).padEnd(28)} policies=${r.policies}`);
  }
  return { on, total: rows.length };
};

(async () => {
  try {
    // Confirm the backend really does bypass RLS before changing anything.
    const { rows: [role] } = await pool.query(
      `SELECT current_user AS usr,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls`);
    console.log(`Connected as "${role.usr}" (rolbypassrls=${role.bypassrls})`);
    if (!role.bypassrls) {
      throw new Error(
        `Refusing to apply: current_user "${role.usr}" does not have BYPASSRLS. ` +
        `Enabling RLS would lock the application out of its own tables.`);
    }

    const before = await report("BEFORE");

    if (CHECK_ONLY) {
      console.log("\n--check given: nothing was modified.");
      return;
    }

    // One transaction: either the whole schema is protected or nothing changes.
    await pool.query("BEGIN");

    for (const t of TIER_1_WITH_POLICIES) {
      await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      // Idempotent: drop first so a re-run cannot fail on an existing policy.
      await pool.query(`DROP POLICY IF EXISTS "${t}_select_own" ON public.${t};`);
      await pool.query(`DROP POLICY IF EXISTS "${t}_update_own" ON public.${t};`);
      await pool.query(
        `CREATE POLICY "${t}_select_own" ON public.${t}
           FOR SELECT TO authenticated USING (auth.uid()::text = id);`);
      await pool.query(
        `CREATE POLICY "${t}_update_own" ON public.${t}
           FOR UPDATE TO authenticated
           USING (auth.uid()::text = id) WITH CHECK (auth.uid()::text = id);`);
      console.log(`  enabled RLS + 2 policies on ${t}`);
    }

    for (const t of LOCKDOWN) {
      await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      console.log(`  enabled RLS (deny-all) on ${t}`);
    }

    await pool.query("COMMIT");

    const after = await report("AFTER");
    console.log(
      `\nRLS: ${before.on}/${before.total} -> ${after.on}/${after.total} tables.` +
      (after.on === after.total ? " All tables protected." : " *** NOT all tables protected ***"));
    if (after.on !== after.total) process.exitCode = 1;
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch { /* no open transaction */ }
    console.error("ERROR (rolled back):", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
