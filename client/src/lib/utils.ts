import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toLocaleString();
}

export function formatPercentage(value: number): string {
  return (value * 100).toFixed(2) + "%";
}

export function calculateViralScore(views: number, likes: number, comments: number): number {
  return Math.log10(views + 1) * 0.7 + Math.log10(likes + 1) * 0.2 + Math.log10(comments + 1) * 0.1;
}

export function calculateEngagementRate(views: number, likes: number, comments: number): number {
  return (likes + comments) / Math.max(views, 1);
}

// Single source of truth for duration bucketing — keep every chart/table/tip on the same scheme.
// Bounds are inclusive; durationSeconds is an integer column.
export const DURATION_BUCKETS = [
  { label: "0-10s", min: 0, max: 10 },
  { label: "11-20s", min: 11, max: 20 },
  { label: "21-30s", min: 21, max: 30 },
  { label: "31-45s", min: 31, max: 45 },
  { label: "46-60s", min: 46, max: 60 },
  { label: "60s+", min: 61, max: Infinity },
] as const;

export function getDurationBucket(seconds: number): string {
  const bucket = DURATION_BUCKETS.find(b => seconds >= b.min && seconds <= b.max);
  return bucket ? bucket.label : DURATION_BUCKETS[0].label;
}

export function getTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

/**
 * Age of a timestamp in hours, or null when it cannot be measured.
 *
 * Null covers a missing value and an unparseable one (`new Date("nonsense")`
 * yields NaN, which would otherwise compare false against every threshold and
 * silently behave like "brand new"). A future timestamp — clock skew between
 * the server and the viewer's machine — comes back negative, so a caller
 * testing `>= n` treats it as fresh.
 *
 * Epoch-ms arithmetic, so the result does not depend on either end's timezone.
 */
export function hoursSince(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60);
}

export function parseInstagramUsername(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  
  const urlPattern = /(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9._]+)/;
  const match = trimmed.match(urlPattern);
  if (match) return match[1];
  
  const usernamePattern = /^@?([a-zA-Z0-9._]{1,30})$/;
  const usernameMatch = trimmed.replace("@", "").match(usernamePattern);
  if (usernameMatch) return usernameMatch[1];
  
  return null;
}

export function validateInstagramUsernames(input: string): { valid: string[]; invalid: string[] } {
  const lines = input.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  
  for (const line of lines) {
    const username = parseInstagramUsername(line);
    if (username && !seen.has(username)) {
      valid.push(username);
      seen.add(username);
    } else if (!username) {
      invalid.push(line);
    }
  }
  
  return { valid, invalid };
}
