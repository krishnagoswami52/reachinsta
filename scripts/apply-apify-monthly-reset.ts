// Applies supabase/migrations/20260827000000_add_apify_monthly_reset.sql.
//
// Targeted, idempotent DDL rather than `drizzle-kit push` — the live Supabase
// schema has drifted from the drizzle definitions in places, and push would
// happily "fix" objects this change has no business touching. Same pattern as
// scripts/apply-queue-priority.ts.
//
// Additive and nullable, so it is safe to run against a live server ahead of
// the deploy: existing code never reads the column, and NULL is the value the
// first monthly reset expects to find.
//
//   npx tsx scripts/apply-apify-monthly-reset.ts
import { config } from "dotenv";
import path from "path";
import { readFileSync } from "fs";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const pg = (await import("pg")).default;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

(async () => {
  try {
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20260827000000_add_apify_monthly_reset.sql"),
      "utf-8",
    );
    await pool.query(sql);
    console.log("Migration applied.");

    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'apify_keys' AND column_name = 'monthly_reset_at'`,
    );
    console.table(rows);

    const state = await pool.query(
      `SELECT count(*)::int AS keys,
              count(*) FILTER (WHERE is_exhausted)::int AS retired,
              count(monthly_reset_at)::int AS ever_reset
         FROM apify_keys`,
    );
    console.table(state.rows);
  } catch (e) {
    console.error("ERROR:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
