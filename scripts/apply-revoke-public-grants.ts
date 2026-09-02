// One-off: revoke anon/authenticated grants in `public` and clear the default
// privileges that keep re-granting them to every new table (idempotent).
// Mirrors supabase/migrations/20260902120000_revoke_public_role_grants.sql.
//
// Defence in depth behind the RLS applied in ffdf500. The app ships no
// @supabase/* client and makes zero PostgREST calls, so these grants have no
// legitimate purpose — see docs/supabase-security-audit.md.
//
//   npx tsx scripts/apply-revoke-public-grants.ts          # apply
//   npx tsx scripts/apply-revoke-public-grants.ts --check  # report only
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
const pg = (await import("pg")).default;

const CHECK_ONLY = process.argv.includes("--check");
const ROLES = ["anon", "authenticated"] as const;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

const report = async (label: string) => {
  const { rows: grants } = await pool.query(
    `SELECT grantee, count(DISTINCT table_name)::int AS tables, count(*)::int AS grant_rows
     FROM information_schema.table_privileges
     WHERE table_schema='public' AND grantee IN ('anon','authenticated','postgres','service_role')
     GROUP BY grantee ORDER BY grantee`);
  const { rows: defaults } = await pool.query(
    `SELECT d.defaclrole::regrole::text AS grantor,
            CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences'
                 WHEN 'f' THEN 'functions' WHEN 'T' THEN 'types' END AS objtype,
            d.defaclacl::text AS acl
     FROM pg_default_acl d
     WHERE d.defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
     ORDER BY grantor, objtype`);

  console.log(`\n=== ${label} ===`);
  console.log("  table grants in public:");
  for (const g of grants) {
    console.log(`    ${String(g.grantee).padEnd(15)} ${String(g.tables).padStart(2)} tables, ${g.grant_rows} grant rows`);
  }
  console.log("  default privileges (by grantor):");
  for (const d of defaults) {
    const exposed = /\b(anon|authenticated)=/.test(d.acl);
    console.log(`    ${exposed ? "LEAKS " : "clean "} ${String(d.grantor).padEnd(16)} ${String(d.objtype).padEnd(10)} ${d.acl}`);
  }
  return { grants, defaults };
};

(async () => {
  try {
    const { rows: [me] } = await pool.query(
      `SELECT current_user AS usr,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls`);
    console.log(`Connected as "${me.usr}" (rolbypassrls=${me.bypassrls})`);
    if (!me.bypassrls) {
      throw new Error(`Refusing to run: "${me.usr}" lacks BYPASSRLS; it would revoke its own access.`);
    }

    await report("BEFORE");
    if (CHECK_ONLY) { console.log("\n--check given: nothing was modified."); return; }

    await pool.query("BEGIN");
    for (const role of ROLES) {
      // Part A — existing objects.
      for (const obj of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
        await pool.query(`REVOKE ALL PRIVILEGES ON ALL ${obj} IN SCHEMA public FROM ${role};`);
      }
      // Part B — future objects. Only affects THIS role's defaults as grantor;
      // supabase_admin's own defaults are not alterable from here (documented
      // in the migration header).
      for (const obj of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
        await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ${obj} FROM ${role};`);
      }
      console.log(`  revoked existing + default privileges from ${role}`);
    }
    await pool.query("COMMIT");

    const after = await report("AFTER");

    // Assertions — fail loudly rather than reporting a false success.
    const leftover = after.grants.filter(g => g.grantee === "anon" || g.grantee === "authenticated");
    const backend  = after.grants.filter(g => g.grantee === "postgres" || g.grantee === "service_role");
    const postgresDefaultsLeak = after.defaults
      .filter(d => d.grantor === "postgres" && /\b(anon|authenticated)=/.test(d.acl));

    console.log("\n=== ASSERTIONS ===");
    console.log(`  anon/authenticated table grants remaining : ${leftover.length} ${leftover.length === 0 ? "OK" : "*** FAIL ***"}`);
    console.log(`  postgres/service_role grants intact       : ${backend.length}/2 ${backend.length === 2 ? "OK" : "*** FAIL ***"}`);
    console.log(`  postgres default-privilege leaks          : ${postgresDefaultsLeak.length} ${postgresDefaultsLeak.length === 0 ? "OK" : "*** FAIL ***"}`);

    const residual = after.defaults.filter(d => d.grantor !== "postgres" && /\b(anon|authenticated)=/.test(d.acl));
    if (residual.length) {
      console.log(`\n  NOTE: ${residual.length} default-privilege entries remain under grantor(s) ` +
        `${[...new Set(residual.map(r => r.grantor))].join(", ")} — not alterable as postgres. ` +
        `Only applies to tables created by that role in public. See migration header.`);
    }

    if (leftover.length || backend.length !== 2 || postgresDefaultsLeak.length) process.exitCode = 1;
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch { /* nothing open */ }
    console.error("ERROR (rolled back):", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
