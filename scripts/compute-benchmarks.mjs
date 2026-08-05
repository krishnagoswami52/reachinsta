// Recalculate analytics benchmarks from production data (read-only).
// Run with: node scripts/compute-benchmarks.mjs
// Paste the printed values into client/src/lib/benchmarks.ts
//
// Filters match the Sprint 1 client-side aggregation filter:
// views > 0 AND engagement_rate <= 0.30
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL not set"); process.exit(1); }
const ssl = connectionString.includes("supabase.co") ? { rejectUnauthorized: false } : undefined;
const pool = new Pool({ connectionString, ssl });

const VALID = "views > 0 AND engagement_rate <= 0.30";

try {
  const er = await pool.query(`
    SELECT
      ROUND(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY engagement_rate * 100)::numeric, 2) AS p10,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY engagement_rate * 100)::numeric, 2) AS p25,
      ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY engagement_rate * 100)::numeric, 2) AS median,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY engagement_rate * 100)::numeric, 2) AS p75,
      ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY engagement_rate * 100)::numeric, 2) AS p90
    FROM reels WHERE ${VALID}`);
  console.log("engagementRate (%):"); console.table(er.rows);

  const views = await pool.query(`
    SELECT
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY views)) AS p25,
      ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY views)) AS median,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY views)) AS p75,
      ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY views)) AS p90
    FROM reels WHERE ${VALID}`);
  console.log("views:"); console.table(views.rows);

  const vr = await pool.query(`
    SELECT
      ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY views::float / likes)::numeric, 1) AS median,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY views::float / likes)::numeric, 1) AS p25_good
    FROM reels WHERE ${VALID} AND likes > 0`);
  console.log("viewToLikeRatio (lower = better):"); console.table(vr.rows);

  const viral = await pool.query(`
    SELECT
      ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY viral_score)::numeric, 2) AS median,
      ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY viral_score)::numeric, 2) AS p90
    FROM reels WHERE ${VALID}`);
  console.log("viralScore:"); console.table(viral.rows);

  // Duration buckets — MUST match DURATION_BUCKETS in client/src/lib/utils.ts
  const duration = await pool.query(`
    SELECT
      CASE
        WHEN duration_seconds <= 10 THEN '0-10s'
        WHEN duration_seconds <= 20 THEN '11-20s'
        WHEN duration_seconds <= 30 THEN '21-30s'
        WHEN duration_seconds <= 45 THEN '31-45s'
        WHEN duration_seconds <= 60 THEN '46-60s'
        ELSE '60s+'
      END AS bucket,
      COUNT(*) AS reel_count,
      ROUND(AVG(views)) AS avg_views,
      ROUND(AVG(engagement_rate * 100)::numeric, 2) AS avg_er
    FROM reels WHERE ${VALID}
    GROUP BY 1
    ORDER BY MIN(duration_seconds)`);
  console.log("duration buckets:"); console.table(duration.rows);

  const total = await pool.query(`SELECT COUNT(*) AS n FROM reels WHERE ${VALID}`);
  console.log(`Sample size: ${total.rows[0].n} reels (as of ${new Date().toISOString().slice(0, 10)})`);
} finally {
  await pool.end();
}
