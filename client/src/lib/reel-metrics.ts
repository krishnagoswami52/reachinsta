import type { Reel } from "@shared/schema";

/**
 * Which reels count toward a headline metric.
 *
 * Two kinds of row are excluded:
 *
 *  - **Zero views.** A reel with no views is a scrape failure (Apify returned
 *    no `videoPlayCount`), not a reel nobody watched. It carries ER = 0, so
 *    leaving it in drags every average toward zero.
 *  - **ER above 30%.** Not organically achievable; it means the view count
 *    came back broken while likes/comments did not.
 *
 * This lived only in the Analytics page, so the Dashboard and Analytics
 * rendered different totals for the *same* fetch run — and the Dashboard
 * pushes users straight at Analytics with a pulsing CTA, so the numbers
 * visibly changed under them. Both now import this.
 *
 * Note that `server/services/apify.ts` no longer stores photos and carousels
 * at all, so for runs fetched after that change the zero-view case is rare.
 * The guard stays because it also catches genuine scrape failures on reels,
 * and because historical runs still hold those rows.
 */
export const MAX_PLAUSIBLE_ENGAGEMENT_RATE = 0.30;

export function isValidReel(reel: Reel): boolean {
  if (reel.views <= 0) return false;
  return parseFloat(String(reel.engagementRate)) <= MAX_PLAUSIBLE_ENGAGEMENT_RATE;
}

export function filterValidReels(reels: Reel[]): Reel[] {
  return reels.filter(isValidReel);
}

export interface ReelAggregates {
  totalViews: number;
  avgViews: number;
  avgEngagement: number;
  topViews: number;
  count: number;
}

/** Headline aggregates over an already-filtered list. */
export function computeReelAggregates(validReels: Reel[]): ReelAggregates {
  const count = validReels.length;
  const totalViews = validReels.reduce((sum, r) => sum + r.views, 0);
  return {
    totalViews,
    avgViews: count > 0 ? totalViews / count : 0,
    avgEngagement: count > 0
      ? validReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / count
      : 0,
    topViews: count > 0 ? Math.max(...validReels.map((r) => r.views)) : 0,
    count,
  };
}
