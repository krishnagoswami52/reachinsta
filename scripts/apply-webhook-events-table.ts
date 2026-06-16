// One-off: create processed_webhook_events table (additive, idempotent).
// Targeted DDL instead of `drizzle-kit push` to avoid touching other objects
// on the shared Supabase DB (schema has drifted from drizzle in places).
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
      CREATE TABLE IF NOT EXISTS processed_webhook_events (
        event_id VARCHAR PRIMARY KEY,
        event_type VARCHAR NOT NULL,
        processed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS processed_webhook_events_processed_at_idx
        ON processed_webhook_events (processed_at);`);
    const check = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='processed_webhook_events'
       ORDER BY ordinal_position`);
    console.log("processed_webhook_events columns:", check.rows);
  } catch (e) { console.error("ERROR:", e); process.exitCode = 1; }
  finally { await pool.end(); }
})();
