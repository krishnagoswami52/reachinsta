// Read-only data quality audit for analytics ER values (Phase 1 audit, temp script)
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL not set"); process.exit(1); }
const ssl = connectionString.includes("supabase.co")
  ? { rejectUnauthorized: false }
  : undefined;
const pool = new Pool({ connectionString, ssl });

async function q(label, sql) {
  const res = await pool.query(sql);
  console.log(`\n=== ${label} ===`);
  console.table(res.rows);
  return res.rows;
}

try {
  await q("Totals", `
    SELECT
      COUNT(*) AS total_reels,
      COUNT(*) FILTER (WHERE views = 0) AS zero_view_reels,
      COUNT(*) FILTER (WHERE views > 0 AND (likes + comments)::float / views * 100 > 15) AS er_over_15,
      COUNT(*) FILTER (WHERE views > 0 AND (likes + comments)::float / views * 100 > 25) AS er_over_25,
      COUNT(*) FILTER (WHERE views > 0 AND (likes + comments)::float / views * 100 > 30) AS er_over_30,
      COUNT(*) FILTER (WHERE posted_at IS NULL) AS null_posted_at
    FROM reels`);

  await q("Top 20 suspicious ER (>15%)", `
    SELECT
      r.username,
      r.views, r.likes, r.comments,
      ROUND(((r.likes + r.comments)::numeric / NULLIF(r.views, 0) * 100), 2) AS computed_er,
      ROUND(r.engagement_rate * 100, 2) AS stored_er_pct,
      r.duration_seconds,
      r.posted_at
    FROM reels r
    WHERE r.views > 0
      AND ((r.likes + r.comments)::float / r.views * 100) > 15
    ORDER BY computed_er DESC
    LIMIT 20`);

  await q("Suspicious ER by account (with follower context)", `
    SELECT
      r.username,
      COUNT(*) AS suspicious_reels,
      MAX(ROUND(((r.likes + r.comments)::numeric / NULLIF(r.views,0) * 100), 2)) AS max_er,
      MIN(r.views) AS min_views, MAX(r.views) AS max_views,
      MAX(cs.followers) AS followers
    FROM reels r
    LEFT JOIN competitor_stats cs
      ON cs.username = r.username AND cs.fetch_run_id = r.fetch_run_id
    WHERE r.views > 0
      AND ((r.likes + r.comments)::float / r.views * 100) > 15
    GROUP BY r.username
    ORDER BY suspicious_reels DESC`);

  await q("Age profile of suspicious reels", `
    SELECT
      CASE
        WHEN posted_at IS NULL THEN 'unknown'
        WHEN posted_at > NOW() - INTERVAL '30 days' THEN '< 30 days'
        WHEN posted_at > NOW() - INTERVAL '90 days' THEN '30-90 days'
        WHEN posted_at > NOW() - INTERVAL '365 days' THEN '90-365 days'
        ELSE '> 1 year'
      END AS age_bucket,
      COUNT(*) AS n
    FROM reels
    WHERE views > 0 AND ((likes + comments)::float / views * 100) > 15
    GROUP BY 1 ORDER BY 2 DESC`);

  await q("Stored ER vs computed ER mismatches", `
    SELECT COUNT(*) AS mismatches
    FROM reels
    WHERE views > 0
      AND ABS(engagement_rate - (likes + comments)::numeric / views) > 0.0001`);

  await q("posted_at column type + sample", `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'reels' AND column_name = 'posted_at'`);

  await q("ER distribution", `
    SELECT
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY engagement_rate)::numeric * 100, 2) AS p50,
      ROUND(PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY engagement_rate)::numeric * 100, 2) AS p90,
      ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY engagement_rate)::numeric * 100, 2) AS p99,
      ROUND(MAX(engagement_rate)::numeric * 100, 2) AS max
    FROM reels WHERE views > 0`);
} catch (e) {
  console.error("Query failed:", e.message);
} finally {
  await pool.end();
}
