// One-off: add users.ip_address (additive, idempotent).
// Targeted DDL instead of `drizzle-kit push` to avoid touching other objects
// on the shared Supabase DB (schema has drifted from drizzle in places).
// Mirrors supabase/migrations/20260902000000_add_users_ip_address.sql.
//
// MUST run before the matching server code deploys — storage.createUser now
// writes ip_address on every registration, and an INSERT naming a column that
// does not exist fails the whole signup.
//
//   npx tsx scripts/apply-users-ip-address.ts
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
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);`);
    await pool.query(`
      COMMENT ON COLUMN users.ip_address IS
        'Client IP captured at registration (req.ip, X-Forwarded-For aware). NULL for rows created before 2026-09-02. Abuse investigation and per-IP account caps only.';`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS users_ip_address_idx
        ON users (ip_address) WHERE ip_address IS NOT NULL;`);

    const cols = await pool.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='users' AND column_name='ip_address'`);
    console.log("users.ip_address:", cols.rows);

    const idx = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND tablename='users' AND indexname='users_ip_address_idx'`);
    console.log("index:", idx.rows);

    const counts = await pool.query(
      `SELECT COUNT(*) AS total, COUNT(ip_address) AS with_ip FROM users`);
    console.log("rows:", counts.rows[0]);
  } catch (e) { console.error("ERROR:", e); process.exitCode = 1; }
  finally { await pool.end(); }
})();
