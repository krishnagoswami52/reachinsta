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

export function getDurationBucket(seconds: number): string {
  if (seconds <= 10) return "0-10s";
  if (seconds <= 20) return "11-20s";
  if (seconds <= 30) return "21-30s";
  if (seconds <= 45) return "31-45s";
  if (seconds <= 60) return "46-60s";
  return "60s+";
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
