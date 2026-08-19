// One-off: create the page_views table (additive, idempotent).
// Targeted DDL instead of `drizzle-kit push` to avoid touching other objects
// on the shared Supabase DB (schema has drifted from drizzle in places).
// Mirrors supabase/migrations/20260819000000_add_page_views.sql.
//
//   npx tsx scripts/apply-page-views-table.ts
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
const pg = (await import("pg")).default;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS page_views (
        id            BIGSERIAL PRIMARY KEY,
        path          VARCHAR(500) NOT NULL,
        referrer      VARCHAR(500),
        user_agent    TEXT,
        ip_address    VARCHAR(45),
        user_id       VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        session_id    VARCHAR(100),
        utm_source    VARCHAR(100),
        utm_medium    VARCHAR(100),
        utm_campaign  VARCHAR(100),
        country       VARCHAR(3),
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );`);

    for (const [name, cols] of [
      ["page_views_created_at_idx", "created_at DESC"],
      ["page_views_user_id_idx", "user_id"],
      ["page_views_utm_source_idx", "utm_source"],
      ["page_views_path_idx", "path"],
      ["page_views_session_id_idx", "session_id"],
    ] as const) {
      await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON page_views (${cols});`);
    }

    // Deny-all for PostgREST/anon; backend is superuser and bypasses RLS.
    await pool.query(`ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;`);

    const check = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='page_views'
       ORDER BY ordinal_position`);
    console.log("page_views columns:", check.rows);
  } catch (e) { console.error("ERROR:", e); process.exitCode = 1; }
  finally { await pool.end(); }
})();
