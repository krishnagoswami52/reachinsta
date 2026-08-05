import { BENCHMARKS } from "./benchmarks";

/**
 * Tooltip copy for every metric on the analytics page.
 * Formulas describe the ACTUAL implementation (see server/services/apify.ts
 * and client/src/lib/utils.ts) — keep them in sync if the math changes.
 * Benchmarks come from real production percentiles (lib/benchmarks.ts).
 */
export const METRIC_HELP = {
  totalReels: {
    title: "Total Reels Tracked",
    description:
      "Number of competitor reels captured in this fetch. Reels with unreliable data (no view count, or impossible engagement) are excluded from all averages.",
  },
  totalViews: {
    title: "Total Views",
    description: "Combined view count across all tracked reels in this fetch.",
  },
  avgViews: {
    title: "Average Views per Reel",
    description:
      "Typical reach per reel in your niche. Compare your own reels against this number.",
    formula: "total views ÷ reels",
    benchmark: `Median: ${BENCHMARKS.views.median.toLocaleString()} | Top 10%: ${BENCHMARKS.views.p90.toLocaleString()}+`,
  },
  avgER: {
    title: "Average Engagement Rate",
    description:
      "How engaged competitor audiences are on average. Higher = more loyal, active followers.",
    formula: "(likes + comments) ÷ views × 100",
    benchmark: `Median: ${BENCHMARKS.engagementRate.median}% | Top 10%: ${BENCHMARKS.engagementRate.p90}%+`,
  },
  topViews: {
    title: "Top Views",
    description:
      "The single highest-viewed reel among tracked competitors. Anything 5x+ the average is viral territory.",
  },
  er: {
    title: "Engagement Rate (ER)",
    description:
      "Share of viewers who liked or commented. Higher = the content resonated.",
    formula: "(likes + comments) ÷ views × 100",
    benchmark: `Median: ${BENCHMARKS.engagementRate.median}% | Top 10%: ${BENCHMARKS.engagementRate.p90}%+`,
  },
  vr: {
    title: "View-to-Like Ratio (VR)",
    description:
      "How many views it takes to earn one like. Lower = more engaging content.",
    formula: "views ÷ likes",
    benchmark: `Median: ${BENCHMARKS.viewToLikeRatio.median} | Good: below ${BENCHMARKS.viewToLikeRatio.p25Good}`,
  },
  viralScore: {
    title: "Viral Score",
    description:
      "Log-scale score combining views, likes, and comments so mega-viral reels don't drown out everything else.",
    formula: "0.7·log(views) + 0.2·log(likes) + 0.1·log(comments)",
    benchmark: `Median: ${BENCHMARKS.viralScore.median} | Top 10%: ${BENCHMARKS.viralScore.p90}+`,
  },
  viewsHeatmap: {
    title: "Views Heatmap",
    description:
      "Which day/hour combinations get the most views in your niche. Darker cell = higher average views. Times are your local time.",
  },
  engagementHeatmap: {
    title: "Engagement Heatmap",
    description:
      "Which day/hour combinations get the highest engagement rate. Darker cell = more engaged audience. Times are your local time.",
  },
  erByHour: {
    title: "Avg ER by Upload Hour",
    description:
      "Average engagement rate for reels posted at each hour of the day (your local time). Tall bars = your niche's audience is active.",
  },
  erByWeekday: {
    title: "Avg ER by Weekday",
    description:
      "Average engagement rate by day of the week. Shows which days your niche's audience engages most.",
  },
  avgViewsByDuration: {
    title: "Avg Views by Duration",
    description:
      "Average views per reel, grouped by video length. Use it to pick your ideal reel duration.",
    benchmark: `Best bucket in tracked data: ${BENCHMARKS.bestDurationBucket}`,
  },
  durationPerformance: {
    title: "Duration Performance",
    description:
      "Same duration buckets, ranked by average views. The highlighted best bucket is your target length.",
    benchmark: `Best bucket in tracked data: ${BENCHMARKS.bestDurationBucket}`,
  },
  durationScatter: {
    title: "Duration vs Views",
    description:
      "Each dot is one reel (top 100 by viral score). Where dots cluster high = the duration sweet spot. Brighter dots = higher engagement.",
  },
  vrDistribution: {
    title: "View-to-Like Ratio Distribution",
    description:
      "How many reels fall into each VR range. Lower VR = more engaged viewers.",
    formula: "views ÷ likes",
    benchmark: `Median: ${BENCHMARKS.viewToLikeRatio.median} | Good: below ${BENCHMARKS.viewToLikeRatio.p25Good}`,
  },
  topCreatorsByER: {
    title: "Top Creators by Avg ER",
    description:
      "Creators ranked by average engagement rate across their reels. Small accounts with high ER often outperform big accounts with low ER.",
    benchmark: `Median ER: ${BENCHMARKS.engagementRate.median}%`,
  },
  competitorLeaderboard: {
    title: "Competitor Leaderboard",
    description:
      "Competitors ranked by average views per reel — consistency, not one lucky viral hit.",
    benchmark: `Median avg views: ${BENCHMARKS.views.median.toLocaleString()}`,
  },
} as const;
