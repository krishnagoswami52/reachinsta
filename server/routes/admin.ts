import { Router } from "express";
import { pool } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireAdmin } from "../middleware/adminAuth";
import { planPrices } from "@shared/pricing";

/**
 * Admin analytics API — STRICTLY READ-ONLY.
 *
 * Every statement below is a SELECT. Nothing here writes, updates or deletes,
 * and nothing here touches pricing, plans or subscription state. The plan
 * amounts used for MRR are a read-only mirror of client/src/lib/plans.ts.
 *
 * Mounted at /api/admin (see server/index.ts). Sibling of the existing
 * /api/admin/users management routes in server/routes.ts — no path overlap.
 */
const router = Router();

// Monthly USD amount per paid plan, read from shared/pricing.ts. Changing those
// numbers changes a dashboard figure, never what a customer is charged.
const PLAN_MRR: Record<string, number> = { plus: planPrices.plus.usd, pro: planPrices.pro.usd };

// A subscriber is "paying" while active OR canceling (canceling = cancel at
// period end, still paid for the current period).
const PAYING_STATUSES = ["active", "canceling"];

// created_at/updated_at are naive `timestamp` columns holding UTC. node-postgres
// would parse them as *local* time, shifting every rendered clock by the
// server's offset — so serialise them with an explicit Z instead.
const utc = (col: string, alias: string) =>
  `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ${alias}`;

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

router.get("/stats", isAuthenticated, requireAdmin, async (_req, res) => {
  try {
    res.json(await getAdminStats());
  } catch (error) {
    console.error("[Admin] Stats error:", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

router.get("/activity", isAuthenticated, requireAdmin, async (_req, res) => {
  try {
    res.json(await getRecentActivity());
  } catch (error) {
    console.error("[Admin] Activity error:", error);
    res.status(500).json({ message: "Failed to fetch activity" });
  }
});

router.get("/traffic", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const parsed = parseInt(req.query.days as string, 10);
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 7;
    res.json(await getTrafficStats(days));
  } catch (error) {
    console.error("[Admin] Traffic error:", error);
    res.status(500).json({ message: "Failed to fetch traffic" });
  }
});

router.get("/producthunt", isAuthenticated, requireAdmin, async (_req, res) => {
  try {
    res.json(await getProductHuntStats());
  } catch (error) {
    console.error("[Admin] Product Hunt error:", error);
    res.status(500).json({ message: "Failed to fetch Product Hunt stats" });
  }
});

// ==================== HELPER FUNCTIONS (all SELECT-only) ====================

async function getAdminStats() {
  const [
    totalUsers,
    signupsToday,
    signupsWeek,
    signupsMonth,
    activeToday,
    activeWeek,
    fetchesToday,
    fetchesWeek,
    fetchesMonth,
    planBreakdown,
    mrrData,
    churnedMonth,
    viewsToday,
    viewsWeek,
    uniqueVisitorsToday,
    uniqueVisitorsWeek,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS count FROM users`),
    pool.query(`SELECT COUNT(*) AS count FROM users WHERE created_at >= date_trunc('day', NOW())`),
    pool.query(`SELECT COUNT(*) AS count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT COUNT(*) AS count FROM users WHERE created_at >= NOW() - INTERVAL '30 days'`),

    // "Active" = ran a fetch. fetch_runs is this app's activity table.
    pool.query(
      `SELECT COUNT(DISTINCT user_id) AS count FROM fetch_runs
       WHERE created_at >= date_trunc('day', NOW())`,
    ),
    pool.query(
      `SELECT COUNT(DISTINCT user_id) AS count FROM fetch_runs
       WHERE created_at >= NOW() - INTERVAL '7 days'`,
    ),

    pool.query(`SELECT COUNT(*) AS count FROM fetch_runs WHERE created_at >= date_trunc('day', NOW())`),
    pool.query(`SELECT COUNT(*) AS count FROM fetch_runs WHERE created_at >= NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT COUNT(*) AS count FROM fetch_runs WHERE created_at >= NOW() - INTERVAL '30 days'`),

    // Plan distribution across every profile.
    pool.query(
      `SELECT plan, subscription_status, COUNT(*) AS count
       FROM profiles GROUP BY plan, subscription_status`,
    ),

    // MRR / paying customers.
    pool.query(
      `SELECT plan, COUNT(*) AS count
       FROM profiles
       WHERE plan IN ('plus', 'pro') AND subscription_status = ANY($1)
       GROUP BY plan`,
      [PAYING_STATUSES],
    ),

    pool.query(
      `SELECT COUNT(*) AS count FROM profiles
       WHERE subscription_status = 'canceled' AND updated_at >= NOW() - INTERVAL '30 days'`,
    ),

    pool.query(`SELECT COUNT(*) AS count FROM page_views WHERE created_at >= date_trunc('day', NOW())`),
    pool.query(`SELECT COUNT(*) AS count FROM page_views WHERE created_at >= NOW() - INTERVAL '7 days'`),
    pool.query(
      `SELECT COUNT(DISTINCT session_id) AS count FROM page_views
       WHERE created_at >= date_trunc('day', NOW()) AND session_id IS NOT NULL`,
    ),
    pool.query(
      `SELECT COUNT(DISTINCT session_id) AS count FROM page_views
       WHERE created_at >= NOW() - INTERVAL '7 days' AND session_id IS NOT NULL`,
    ),
  ]);

  const plans: Record<string, number> = { free: 0, plus: 0, pro: 0 };
  for (const row of planBreakdown.rows) {
    plans[row.plan] = (plans[row.plan] || 0) + num(row.count);
  }

  let mrr = 0;
  let payingCustomers = 0;
  const payingByPlan: Record<string, number> = {};
  for (const row of mrrData.rows) {
    const count = num(row.count);
    payingByPlan[row.plan] = count;
    payingCustomers += count;
    mrr += count * (PLAN_MRR[row.plan] ?? 0);
  }

  return {
    users: {
      total: num(totalUsers.rows[0].count),
      signups_today: num(signupsToday.rows[0].count),
      signups_week: num(signupsWeek.rows[0].count),
      signups_month: num(signupsMonth.rows[0].count),
      active_today: num(activeToday.rows[0].count),
      active_week: num(activeWeek.rows[0].count),
      free_users: plans.free,
    },
    plans: {
      free: plans.free,
      plus: plans.plus,
      pro: plans.pro,
      paying_by_plan: payingByPlan,
    },
    fetches: {
      today: num(fetchesToday.rows[0].count),
      week: num(fetchesWeek.rows[0].count),
      month: num(fetchesMonth.rows[0].count),
    },
    revenue: {
      paying_customers: payingCustomers,
      mrr,
      arr: mrr * 12,
      churned_this_month: num(churnedMonth.rows[0].count),
    },
    traffic: {
      visitors_today: num(viewsToday.rows[0].count),
      visitors_week: num(viewsWeek.rows[0].count),
      unique_visitors_today: num(uniqueVisitorsToday.rows[0].count),
      unique_visitors_week: num(uniqueVisitorsWeek.rows[0].count),
    },
    timestamp: new Date().toISOString(),
  };
}

async function getRecentActivity() {
  const [signups, fetches, upgrades] = await Promise.all([
    pool.query(
      `SELECT u.id, u.email, COALESCE(p.plan, 'free') AS plan, u.email_verified,
              ${utc('u.created_at', 'created_at')}
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       ORDER BY u.created_at DESC
       LIMIT 10`,
    ),

    pool.query(
      `SELECT f.id,
              f.user_id,
              u.email,
              COALESCE(array_length(f.competitor_usernames, 1), 0) AS competitors_count,
              f.time_range_days,
              f.status,
              f.internal_error_code,
              ${utc('f.created_at', 'created_at')}
       FROM fetch_runs f
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC
       LIMIT 10`,
    ),

    pool.query(
      `SELECT p.id,
              COALESCE(p.email, u.email) AS email,
              p.plan,
              p.subscription_status,
              ${utc('p.updated_at', 'updated_at')}
       FROM profiles p
       LEFT JOIN users u ON u.id = p.id
       WHERE p.plan IN ('plus', 'pro')
       ORDER BY p.updated_at DESC
       LIMIT 10`,
    ),
  ]);

  return {
    signups: signups.rows,
    fetches: fetches.rows,
    upgrades: upgrades.rows,
  };
}

// Referrer -> channel. Kept in SQL so grouping happens in the DB.
const SOURCE_CASE = `
  CASE
    WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
    WHEN referrer LIKE '%producthunt.com%' THEN 'Product Hunt'
    WHEN referrer LIKE '%google.%' THEN 'Google'
    WHEN referrer LIKE '%twitter.com%' OR referrer LIKE '%x.com%' THEN 'Twitter/X'
    WHEN referrer LIKE '%linkedin.com%' THEN 'LinkedIn'
    WHEN referrer LIKE '%reddit.com%' THEN 'Reddit'
    WHEN referrer LIKE '%facebook.com%' THEN 'Facebook'
    WHEN referrer LIKE '%instagram.com%' THEN 'Instagram'
    WHEN referrer LIKE '%youtube.com%' THEN 'YouTube'
    ELSE 'Other'
  END`;

async function getTrafficStats(days: number) {
  const since = `NOW() - make_interval(days => $1::int)`;

  const [dailyVisitors, topPages, trafficSources, utmSources, topCountries, peakHours] =
    await Promise.all([
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
                COUNT(*) AS total_views,
                COUNT(DISTINCT session_id) AS unique_visitors
         FROM page_views
         WHERE created_at >= ${since}
         GROUP BY 1
         ORDER BY 1 ASC`,
        [days],
      ),

      pool.query(
        `SELECT path,
                COUNT(*) AS views,
                COUNT(DISTINCT session_id) AS unique_visitors
         FROM page_views
         WHERE created_at >= ${since}
         GROUP BY path
         ORDER BY views DESC
         LIMIT 20`,
        [days],
      ),

      pool.query(
        `SELECT ${SOURCE_CASE} AS source,
                COUNT(*) AS visits,
                COUNT(DISTINCT session_id) AS unique_visitors
         FROM page_views
         WHERE created_at >= ${since}
         GROUP BY source
         ORDER BY visits DESC`,
        [days],
      ),

      pool.query(
        `SELECT utm_source AS source,
                COUNT(*) AS visits,
                COUNT(DISTINCT session_id) AS unique_visitors
         FROM page_views
         WHERE created_at >= ${since} AND utm_source IS NOT NULL
         GROUP BY utm_source
         ORDER BY visits DESC
         LIMIT 20`,
        [days],
      ),

      pool.query(
        `SELECT COALESCE(country, 'Unknown') AS country,
                COUNT(*) AS visits,
                COUNT(DISTINCT session_id) AS unique_visitors
         FROM page_views
         WHERE created_at >= ${since}
         GROUP BY 1
         ORDER BY visits DESC
         LIMIT 10`,
        [days],
      ),

      pool.query(
        `SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
                COUNT(*) AS visits
         FROM page_views
         WHERE created_at >= ${since}
         GROUP BY hour
         ORDER BY hour`,
        [days],
      ),
    ]);

  return {
    days,
    daily_visitors: dailyVisitors.rows,
    top_pages: topPages.rows,
    traffic_sources: trafficSources.rows,
    utm_sources: utmSources.rows,
    top_countries: topCountries.rows,
    peak_hours: peakHours.rows,
  };
}

// "This page view came from Product Hunt" — unqualified and pv-qualified forms.
const PH_PREDICATE = `(utm_source ILIKE 'producthunt%' OR referrer LIKE '%producthunt.com%')`;
const PH_PREDICATE_PV = `(pv.utm_source ILIKE 'producthunt%' OR pv.referrer LIKE '%producthunt.com%')`;

async function getProductHuntStats() {
  const [phVisitors, phSignups, phConversions, phDaily] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total_visits,
              COUNT(DISTINCT session_id) AS unique_visitors
       FROM page_views
       WHERE ${PH_PREDICATE}`,
    ),

    // Signups attributed to PH: the user was seen on a PH-referred page view
    // no later than an hour after creating their account.
    pool.query(
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       INNER JOIN page_views pv ON pv.user_id = u.id
       WHERE ${PH_PREDICATE_PV}
         AND pv.created_at <= u.created_at + INTERVAL '1 hour'`,
    ),

    pool.query(
      `SELECT COALESCE(p.plan, 'free') AS plan, COUNT(*) AS count
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE EXISTS (
         SELECT 1 FROM page_views pv
         WHERE pv.user_id = u.id
           AND ${PH_PREDICATE_PV}
       )
       GROUP BY 1`,
    ),

    pool.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
              COUNT(*) AS visits,
              COUNT(DISTINCT session_id) AS unique_visitors
       FROM page_views
       WHERE ${PH_PREDICATE}
       GROUP BY 1
       ORDER BY 1 ASC
       LIMIT 30`,
    ),
  ]);

  const totalVisits = num(phVisitors.rows[0].total_visits);
  const uniqueVisitors = num(phVisitors.rows[0].unique_visitors);
  const signups = num(phSignups.rows[0].count);

  const conversionRate = uniqueVisitors > 0 ? ((signups / uniqueVisitors) * 100).toFixed(2) : "0.00";

  const plans = phConversions.rows.map((row) => ({
    plan: row.plan as string,
    count: num(row.count),
    revenue: num(row.count) * (PLAN_MRR[row.plan] ?? 0),
  }));

  return {
    total_visits: totalVisits,
    unique_visitors: uniqueVisitors,
    signups,
    conversion_rate: conversionRate,
    plans,
    total_revenue: plans.reduce((sum, row) => sum + row.revenue, 0),
    daily: phDaily.rows,
  };
}

export default router;
