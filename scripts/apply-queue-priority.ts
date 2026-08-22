// Applies supabase/migrations/20260822000000_add_queue_priority.sql.
//
// Targeted, idempotent DDL rather than `drizzle-kit push` — the live Supabase
// schema has drifted from the drizzle definitions in places, and push would
// happily "fix" objects this change has no business touching. Same pattern as
// scripts/apply-page-views-table.ts.
//
//   npx tsx scripts/apply-queue-priority.ts
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
      path.resolve(process.cwd(), "supabase/migrations/20260822000000_add_queue_priority.sql"),
      "utf-8",
    );
    await pool.query(sql);
    console.log("Migration applied.");

    const cols = await pool.query(
      `SELECT table_name, column_name, data_type, column_default, is_nullable
         FROM information_schema.columns
        WHERE (table_name = 'jobs' AND column_name IN ('priority','estimated_apify_cost','apify_key_id'))
           OR (table_name = 'fetch_runs' AND column_name = 'internal_error_code')
        ORDER BY table_name, column_name`,
    );
    console.table(cols.rows);

    const idx = await pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'jobs' AND indexname = 'idx_jobs_priority_queue'`,
    );
    console.log("priority index present:", idx.rowCount === 1);

    const dist = await pool.query(
      `SELECT status, priority, COUNT(*)::int AS count FROM jobs GROUP BY status, priority ORDER BY status, priority`,
    );
    console.table(dist.rows);
  } catch (e) {
    console.error("ERROR:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
