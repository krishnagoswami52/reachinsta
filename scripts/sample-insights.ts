// Print the Overview insights the app would generate for a real fetch (read-only).
// Run with: npx tsx scripts/sample-insights.ts [fetchRunId]
//
// Imports the SAME generator the UI uses (client/src/lib/insights.ts) and applies
// the same Sprint 1 validity filter as analytics.tsx, so the output here is what
// Krishna sees on the Overview tab.
import "dotenv/config";
import pg from "pg";
import { computeInsightFacts, generateInsights, formatHour } from "../client/src/lib/insights";
import type { Reel } from "../shared/schema";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL not set"); process.exit(1); }
const ssl = connectionString.includes("supabase.co") ? { rejectUnauthorized: false } : undefined;
const pool = new Pool({ connectionString, ssl });

try {
  const requestedId = process.argv[2];
  const run = requestedId
    ? await pool.query(
        `SELECT id, time_range_days, created_at FROM fetch_runs WHERE id = $1`, [requestedId])
    : await pool.query(
        `SELECT id, time_range_days, created_at FROM fetch_runs
         WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1`);

  if (run.rows.length === 0) { console.error("No completed fetch run found"); process.exit(1); }
  const { id, time_range_days, created_at } = run.rows[0];

  const { rows } = await pool.query(
    `SELECT username, views, likes, comments, engagement_rate, duration_seconds, posted_at
     FROM reels WHERE fetch_run_id = $1`, [id]);

  // Mirrors the validReels filter in client/src/pages/analytics.tsx
  const reels = rows
    .map(r => ({
      username: r.username,
      views: Number(r.views),
      likes: Number(r.likes),
      comments: Number(r.comments),
      engagementRate: String(r.engagement_rate),
      durationSeconds: Number(r.duration_seconds),
      postedAt: r.posted_at,
    }))
    .filter(r => r.views > 0 && parseFloat(r.engagementRate) <= 0.30) as unknown as Reel[];

  console.log(`Fetch ${id}  (${time_range_days}d, ${new Date(created_at).toISOString().slice(0, 10)})`);
  console.log(`${rows.length} reels, ${reels.length} valid after filter\n`);

  const facts = computeInsightFacts(reels);
  console.log("── FACTS ──────────────────────────────────────────────");
  console.log(`median views : ${Math.round(facts.medianViews).toLocaleString()}`);
  console.log(`avg ER       : ${facts.avgER.toFixed(2)}%`);
  console.log(`best hour    : ${facts.bestHour ? `${formatHour(facts.bestHour.hour)} (${facts.bestHour.avgER.toFixed(2)}% ER, n=${facts.bestHour.count})` : "— not enough data"}`);
  console.log(`best weekday : ${facts.bestWeekday ? `${facts.bestWeekday.day} (${facts.bestWeekday.avgER.toFixed(2)}% ER, n=${facts.bestWeekday.count})` : "— not enough data"}`);
  console.log(`best length  : ${facts.bestDuration ? `${facts.bestDuration.label} (${Math.round(facts.bestDuration.avgViews).toLocaleString()} avg views, n=${facts.bestDuration.count})` : "— not enough data"}`);
  console.log(`top creator  : ${facts.topCreator ? `@${facts.topCreator.username} (${Math.round(facts.topCreator.avgViews).toLocaleString()} avg views, n=${facts.topCreator.reelCount})` : "— not enough data"}`);

  console.log("\n── INSIGHTS PANEL ─────────────────────────────────────");
  const insights = generateInsights(facts);
  if (insights.length === 0) console.log("(no insights — empty dataset)");
  for (const insight of insights) {
    console.log(`\n${insight.icon}  [${insight.priority}] ${insight.headline}`);
    console.log(`    ${insight.detail}`);
    if (insight.action) console.log(`    → ${insight.action.label} (${insight.action.tab} tab)`);
  }
  console.log();
} finally {
  await pool.end();
}
