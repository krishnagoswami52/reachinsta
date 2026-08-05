// READ-ONLY timezone diagnostic for reels.posted_at (Phase 1.5 audit)
// Ground truth: raw_payloads.payload holds original Apify items with UTC ISO timestamps.
// If posted_at was stored as IST wall-clock, offset vs payload timestamp = +05:30.
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL not set"); process.exit(1); }
const ssl = connectionString.includes("supabase.co") ? { rejectUnauthorized: false } : undefined;
const pool = new Pool({ connectionString, ssl });

async function q(label, sql) {
  try {
    const res = await pool.query(sql);
    console.log(`\n=== ${label} ===`);
    console.table(res.rows);
    return res.rows;
  } catch (e) {
    console.log(`\n=== ${label} === FAILED: ${e.message}`);
    return null;
  }
}

try {
  await q("DB session context", `
    SELECT current_setting('TimeZone') AS db_session_tz,
           NOW() AS now_tz,
           NOW()::text AS now_text,
           LOCALTIMESTAMP::text AS localtimestamp_text`);

  await q("Payload shape check", `
    SELECT actor, jsonb_typeof(payload) AS payload_type,
           CASE WHEN jsonb_typeof(payload) = 'array' THEN jsonb_array_length(payload) ELSE NULL END AS items,
           created_at::text AS created_at_raw
    FROM raw_payloads ORDER BY created_at DESC LIMIT 5`);

  await q("Raw posted_at strings — recent high-view reels", `
    SELECT username,
           posted_at::text AS raw_stored,
           extract(hour from posted_at) AS db_hour,
           extract(dow from posted_at) AS dow,
           views
    FROM reels
    WHERE posted_at IS NOT NULL AND views > 100000
    ORDER BY posted_at DESC LIMIT 15`);

  // THE decisive query: stored wall-clock minus Apify's UTC instant, per fetch run.
  // offset = 0        -> stored as UTC wall time
  // offset = 05:30:00 -> stored as IST wall time
  await q("GROUND TRUTH: posted_at minus Apify payload timestamp (per offset)", `
    WITH items AS (
      SELECT rp.fetch_run_id,
             elem->>'url' AS url,
             elem->>'timestamp' AS apify_ts
      FROM raw_payloads rp,
           jsonb_array_elements(rp.payload) elem
      WHERE jsonb_typeof(rp.payload) = 'array'
        AND elem->>'timestamp' IS NOT NULL
    )
    SELECT (r.posted_at - (i.apify_ts::timestamptz AT TIME ZONE 'UTC')) AS stored_minus_utc,
           COUNT(*) AS reels,
           MIN(r.posted_at)::text AS earliest_posted,
           MAX(r.posted_at)::text AS latest_posted
    FROM reels r
    JOIN items i ON i.url = r.reel_url AND i.fetch_run_id = r.fetch_run_id
    GROUP BY 1
    ORDER BY 2 DESC`);

  await q("GROUND TRUTH by fetch run (era detection)", `
    WITH items AS (
      SELECT rp.fetch_run_id,
             elem->>'url' AS url,
             elem->>'timestamp' AS apify_ts
      FROM raw_payloads rp,
           jsonb_array_elements(rp.payload) elem
      WHERE jsonb_typeof(rp.payload) = 'array'
        AND elem->>'timestamp' IS NOT NULL
    )
    SELECT r.fetch_run_id,
           fr.created_at::text AS fetch_created_at,
           COUNT(*) AS matched_reels,
           MIN(r.posted_at - (i.apify_ts::timestamptz AT TIME ZONE 'UTC')) AS min_offset,
           MAX(r.posted_at - (i.apify_ts::timestamptz AT TIME ZONE 'UTC')) AS max_offset
    FROM reels r
    JOIN items i ON i.url = r.reel_url AND i.fetch_run_id = r.fetch_run_id
    JOIN fetch_runs fr ON fr.id = r.fetch_run_id
    GROUP BY r.fetch_run_id, fr.created_at
    ORDER BY fr.created_at`);

  await q("Sample side-by-side (5 reels)", `
    WITH items AS (
      SELECT rp.fetch_run_id, elem->>'url' AS url, elem->>'timestamp' AS apify_ts
      FROM raw_payloads rp, jsonb_array_elements(rp.payload) elem
      WHERE jsonb_typeof(rp.payload) = 'array' AND elem->>'timestamp' IS NOT NULL
    )
    SELECT r.username,
           i.apify_ts AS apify_utc,
           r.posted_at::text AS stored,
           (r.posted_at - (i.apify_ts::timestamptz AT TIME ZONE 'UTC')) AS diff
    FROM reels r
    JOIN items i ON i.url = r.reel_url AND i.fetch_run_id = r.fetch_run_id
    WHERE r.views > 100000
    ORDER BY r.posted_at DESC LIMIT 5`);

  await q("Hour-of-day distribution (as stored)", `
    SELECT extract(hour from posted_at) AS hour,
           COUNT(*) AS reel_count,
           ROUND(AVG(views)) AS avg_views
    FROM reels
    WHERE posted_at IS NOT NULL
    GROUP BY 1 ORDER BY 1`);

  await q("Reel coverage of ground-truth join", `
    WITH items AS (
      SELECT rp.fetch_run_id, elem->>'url' AS url
      FROM raw_payloads rp, jsonb_array_elements(rp.payload) elem
      WHERE jsonb_typeof(rp.payload) = 'array'
    )
    SELECT (SELECT COUNT(*) FROM reels WHERE posted_at IS NOT NULL) AS total_reels,
           COUNT(DISTINCT r.id) AS matched_to_payload
    FROM reels r JOIN items i ON i.url = r.reel_url AND i.fetch_run_id = r.fetch_run_id`);
} finally {
  await pool.end();
}
