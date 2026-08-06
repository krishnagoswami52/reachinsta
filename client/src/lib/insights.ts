import { BENCHMARKS, classifyER, TIER_LABELS } from "./benchmarks";
import { DURATION_BUCKETS, formatNumber } from "./utils";
import type { Reel } from "@shared/schema";

/**
 * Auto-generated Overview insights.
 *
 * Everything here is derived from the reels of the selected fetch — nothing is
 * hardcoded. Callers must pass the SAME filtered set the KPI cards use
 * (views > 0 AND ER <= 30%, see analytics.tsx) so the numbers agree.
 *
 * Thin slices are skipped: one lucky reel posted at 3am should never become
 * "post at 3am". The threshold scales with the dataset (see minSampleFor) —
 * 3 reels out of 15 is a signal, 3 reels out of 700 is noise.
 */

export type AnalyticsTab = "creators" | "timing" | "duration" | "reels";

export interface Insight {
  id: string;
  priority: "high" | "medium";
  icon: string;
  headline: string;
  detail: string;
  action?: { label: string; tab: AnalyticsTab };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Never draw a conclusion from fewer reels than this, however small the fetch. */
const MIN_SAMPLE = 3;

/**
 * Minimum reels a slice needs before it can win.
 * `share` is the fraction of an even split across `slices` we demand — so an
 * hour must hold at least half the reels a uniform distribution would give it.
 */
function minSampleFor(total: number, slices: number, share: number): number {
  return Math.max(MIN_SAMPLE, Math.ceil((total / slices) * share));
}

const erOf = (reel: Reel) => parseFloat(String(reel.engagementRate));

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 14 → "2 PM", 0 → "12 AM". Reel timestamps render in the viewer's local time. */
export function formatHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${suffix}`;
}

export interface InsightFacts {
  reelCount: number;
  /** Median views per reel — resistant to a single mega-viral outlier. */
  medianViews: number;
  /** Average engagement rate across all reels, as a percentage. */
  avgER: number;
  bestHour: { hour: number; avgER: number; count: number; multiplier: number } | null;
  bestWeekday: { day: string; avgER: number; count: number } | null;
  bestDuration: { label: string; avgViews: number; count: number } | null;
  topCreator: { username: string; avgViews: number; reelCount: number; multiple: number } | null;
}

export function computeInsightFacts(reels: Reel[]): InsightFacts {
  const empty: InsightFacts = {
    reelCount: 0,
    medianViews: 0,
    avgER: 0,
    bestHour: null,
    bestWeekday: null,
    bestDuration: null,
    topCreator: null,
  };
  if (reels.length === 0) return empty;

  const medianViews = median(reels.map(r => r.views));
  const avgERFraction = reels.reduce((sum, r) => sum + erOf(r), 0) / reels.length;
  const avgER = avgERFraction * 100;

  const dated = reels.filter(r => r.postedAt !== null);
  const minHourSample = minSampleFor(dated.length, 24, 0.5);
  const minDaySample = minSampleFor(dated.length, 7, 0.5);
  const minBucketSample = minSampleFor(reels.length, DURATION_BUCKETS.length, 0.25);

  // Best hour of day by average ER
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const slice = dated.filter(r => new Date(r.postedAt!).getHours() === hour);
    return {
      hour,
      count: slice.length,
      avgER: slice.length > 0 ? (slice.reduce((s, r) => s + erOf(r), 0) / slice.length) * 100 : 0,
    };
  }).filter(h => h.count >= minHourSample);

  const peakHour = hours.length > 0
    ? hours.reduce((best, curr) => (curr.avgER > best.avgER ? curr : best))
    : null;

  const bestHour = peakHour
    ? { ...peakHour, multiplier: avgER > 0 ? peakHour.avgER / avgER : 1 }
    : null;

  // Best weekday by average ER
  const weekdays = DAYS.map((day, index) => {
    const slice = dated.filter(r => new Date(r.postedAt!).getDay() === index);
    return {
      day,
      count: slice.length,
      avgER: slice.length > 0 ? (slice.reduce((s, r) => s + erOf(r), 0) / slice.length) * 100 : 0,
    };
  }).filter(d => d.count >= minDaySample);

  const bestWeekday = weekdays.length > 0
    ? weekdays.reduce((best, curr) => (curr.avgER > best.avgER ? curr : best))
    : null;

  // Best duration bucket by average views
  const buckets = DURATION_BUCKETS.map(bucket => {
    const slice = reels.filter(
      r => r.durationSeconds >= bucket.min && r.durationSeconds <= bucket.max
    );
    return {
      label: bucket.label as string,
      count: slice.length,
      avgViews: slice.length > 0 ? slice.reduce((s, r) => s + r.views, 0) / slice.length : 0,
    };
  }).filter(b => b.count >= minBucketSample);

  const bestDuration = buckets.length > 0
    ? buckets.reduce((best, curr) => (curr.avgViews > best.avgViews ? curr : best))
    : null;

  // Top creator by average views
  const byCreator = new Map<string, Reel[]>();
  for (const reel of reels) {
    const list = byCreator.get(reel.username);
    if (list) list.push(reel);
    else byCreator.set(reel.username, [reel]);
  }

  const creators = Array.from(byCreator.entries())
    .map(([username, list]) => ({
      username,
      reelCount: list.length,
      avgViews: list.reduce((s, r) => s + r.views, 0) / list.length,
    }))
    .filter(c => c.reelCount >= MIN_SAMPLE);

  const leader = creators.length > 0
    ? creators.reduce((best, curr) => (curr.avgViews > best.avgViews ? curr : best))
    : null;

  const topCreator = leader
    ? { ...leader, multiple: medianViews > 0 ? leader.avgViews / medianViews : 0 }
    : null;

  return { reelCount: reels.length, medianViews, avgER, bestHour, bestWeekday, bestDuration, topCreator };
}

export function generateInsights(facts: InsightFacts): Insight[] {
  if (facts.reelCount === 0) return [];

  const insights: Insight[] = [];

  if (facts.bestHour) {
    const { hour, avgER, multiplier, count } = facts.bestHour;
    insights.push({
      id: "best-hour",
      priority: "high",
      icon: "⏰",
      headline: `Post around ${formatHour(hour)} your local time`,
      detail:
        `Reels posted in that hour average ${avgER.toFixed(2)}% ER — ` +
        `${multiplier.toFixed(1)}× the ${facts.avgER.toFixed(2)}% overall average (${count} reels).`,
      action: { label: "See timing details", tab: "timing" },
    });
  }

  if (facts.bestDuration) {
    const { label, avgViews, count } = facts.bestDuration;
    insights.push({
      id: "best-duration",
      priority: "high",
      icon: "⏱️",
      headline: `Aim for ${label} reels`,
      detail:
        `This length averages ${formatNumber(Math.round(avgViews))} views vs a ` +
        `${formatNumber(Math.round(facts.medianViews))} median across all tracked reels (${count} reels).`,
      action: { label: "See duration analysis", tab: "duration" },
    });
  }

  if (facts.topCreator) {
    const { username, avgViews, multiple, reelCount } = facts.topCreator;
    insights.push({
      id: "top-creator",
      priority: "high",
      icon: "🏆",
      headline: `@${username} is dominating`,
      detail:
        `${formatNumber(Math.round(avgViews))} avg views across ${reelCount} reels` +
        `${multiple > 0 ? ` — ${multiple.toFixed(1)}× the niche median` : ""}. Study their content style.`,
      action: { label: "Analyze creators", tab: "creators" },
    });
  }

  if (facts.bestWeekday) {
    const { day, avgER, count } = facts.bestWeekday;
    insights.push({
      id: "best-weekday",
      priority: "medium",
      icon: "📅",
      headline: `${day} performs best`,
      detail:
        `${day} posts average ${avgER.toFixed(2)}% ER vs ${facts.avgER.toFixed(2)}% ` +
        `overall (${count} reels).`,
      action: { label: "See weekday breakdown", tab: "timing" },
    });
  }

  if (facts.avgER > 0) {
    const tier = classifyER(facts.avgER);
    insights.push({
      id: "benchmark",
      priority: "medium",
      icon: "📊",
      headline: `Your niche's median ER is ${BENCHMARKS.engagementRate.median}%`,
      detail:
        `Top 10% of tracked reels hit ${BENCHMARKS.engagementRate.p90}%. These competitors ` +
        `average ${facts.avgER.toFixed(2)}% — ${TIER_LABELS[tier].toLowerCase()}.`,
      action: { label: "See top reels", tab: "reels" },
    });
  }

  // High-priority items first; ties keep generation order.
  return insights
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1))
    .slice(0, 5);
}
