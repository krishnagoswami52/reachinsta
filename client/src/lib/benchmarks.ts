/**
 * Real benchmarks calculated from production competitor data.
 *
 * These are NOT generic industry numbers — they are percentiles computed from
 * actual reels in the ReachInsta database (n=2,397 valid reels, filter matches
 * the analytics page: views > 0 AND ER <= 30%).
 *
 * Re-calculate quarterly with: node scripts/compute-benchmarks.mjs
 * Last updated: 2026-08-05
 */

export const BENCHMARKS = {
  engagementRate: {
    p10: 0.77,
    p25: 1.43,
    median: 2.24,
    p75: 3.22,
    p90: 4.48,
  },
  views: {
    p25: 26_771,
    median: 89_056,
    p75: 241_584,
    p90: 700_401,
  },
  // views / likes — lower is better
  viewToLikeRatio: {
    median: 48.7,
    p25Good: 35.0,
  },
  viralScore: {
    median: 4.27,
    p90: 5.17,
  },
  // Highest avg views among DURATION_BUCKETS (60s+: 557K, runner-up 31-45s: 504K)
  bestDurationBucket: "60s+",
} as const;

export type BenchmarkTier = "excellent" | "good" | "average" | "below";

export const TIER_LABELS: Record<BenchmarkTier, string> = {
  excellent: "Top 10%",
  good: "Above average",
  average: "Around median",
  below: "Below median",
};

export function classifyER(erPct: number): BenchmarkTier {
  if (erPct >= BENCHMARKS.engagementRate.p90) return "excellent";
  if (erPct >= BENCHMARKS.engagementRate.p75) return "good";
  if (erPct >= BENCHMARKS.engagementRate.median) return "average";
  return "below";
}

export function classifyViews(views: number): BenchmarkTier {
  if (views >= BENCHMARKS.views.p90) return "excellent";
  if (views >= BENCHMARKS.views.p75) return "good";
  if (views >= BENCHMARKS.views.median) return "average";
  return "below";
}

export function getERContext(erPct: number): string {
  const m = BENCHMARKS.engagementRate.median;
  return {
    excellent: `Top 10% of tracked reels (median ${m}%)`,
    good: `Above the tracked median of ${m}%`,
    average: `Around the tracked median of ${m}%`,
    below: `Below the tracked median of ${m}%`,
  }[classifyER(erPct)];
}

export function getViewsContext(views: number): string {
  const m = BENCHMARKS.views.median;
  return {
    excellent: `Top 10% of tracked reels (median ${m.toLocaleString()})`,
    good: `Above the tracked median of ${m.toLocaleString()}`,
    average: `Around the tracked median of ${m.toLocaleString()}`,
    below: `Below the tracked median of ${m.toLocaleString()}`,
  }[classifyViews(views)];
}
