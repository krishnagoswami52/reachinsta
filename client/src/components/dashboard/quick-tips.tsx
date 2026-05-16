import { Lightbulb } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { Reel, CompetitorStats } from "@shared/schema";

interface QuickTipsProps {
  reels: Reel[];
  stats: CompetitorStats[];
  timeRangeDays: number;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function QuickTips({ reels, stats, timeRangeDays }: QuickTipsProps) {
  if (reels.length === 0) return null;

  const tips: string[] = [];

  const hourData = Array.from({ length: 24 }, (_, hour) => {
    const hourReels = reels.filter(r => {
      if (!r.postedAt) return false;
      return new Date(r.postedAt).getHours() === hour;
    });
    const avgER = hourReels.length > 0
      ? hourReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / hourReels.length
      : 0;
    return { hour, avgER, count: hourReels.length };
  }).filter(h => h.count > 0);

  if (hourData.length > 0) {
    const bestHour = hourData.reduce((best, curr) => curr.avgER > best.avgER ? curr : best);
    tips.push(`Post around ${bestHour.hour}:00 - engagement is strongest at this hour.`);
  }

  const dayData = DAYS.map((day, index) => {
    const dayReels = reels.filter(r => {
      if (!r.postedAt) return false;
      return new Date(r.postedAt).getDay() === index;
    });
    const avgER = dayReels.length > 0
      ? dayReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / dayReels.length
      : 0;
    return { day, avgER, count: dayReels.length };
  }).filter(d => d.count > 0);

  if (dayData.length > 0) {
    const bestDay = dayData.reduce((best, curr) => curr.avgER > best.avgER ? curr : best);
    tips.push(`${bestDay.day} performs best - try uploading on this day.`);
  }

  const durationBuckets = [
    { label: "15-30s", min: 15, max: 30 },
    { label: "30-45s", min: 30, max: 45 },
    { label: "45-60s", min: 45, max: 60 },
    { label: "60-90s", min: 60, max: 90 },
  ];

  const bucketPerformance = durationBuckets.map(bucket => {
    const bucketReels = reels.filter(r =>
      r.durationSeconds >= bucket.min && r.durationSeconds < bucket.max
    );
    const avgViews = bucketReels.length > 0
      ? bucketReels.reduce((sum, r) => sum + r.views, 0) / bucketReels.length
      : 0;
    return { ...bucket, avgViews, count: bucketReels.length };
  }).filter(b => b.count >= 2);

  if (bucketPerformance.length > 0) {
    const bestDuration = bucketPerformance.reduce((best, curr) =>
      curr.avgViews > best.avgViews ? curr : best
    );
    tips.push(`Keep reels near ${bestDuration.label} - this length gets more views.`);
  }

  const avgER = reels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / reels.length * 100;
  const avgViews = reels.reduce((sum, r) => sum + r.views, 0) / reels.length;
  tips.push(`Typical reels get about ${formatNumber(Math.round(avgViews))} views; strong ER is ~${avgER.toFixed(2)}%.`);

  const reelsWithLikes = reels.filter(r => r.likes > 0);
  if (reelsWithLikes.length > 0) {
    const avgVR = reelsWithLikes.reduce((sum, r) => sum + (r.views / r.likes), 0) / reelsWithLikes.length;
    tips.push(`Aim for view-to-like ratio below ${avgVR.toFixed(1)} (lower is better).`);
  }

  const topReel = reels.reduce((best, curr) => curr.views > best.views ? curr : best);
  tips.push(`Highest-viewed reel: ${formatNumber(topReel.views)} views by @${topReel.username}. Study why it worked.`);

  if (hourData.length > 3) {
    const worstHour = hourData.reduce((worst, curr) => curr.avgER < worst.avgER ? curr : worst);
    tips.push(`Avoid low-engagement hours like ${worstHour.hour}:00 when possible.`);
  }

  if (reelsWithLikes.length > 0) {
    const vrValues = reelsWithLikes.map(r => r.views / r.likes);
    const medianVR = vrValues.sort((a, b) => a - b)[Math.floor(vrValues.length / 2)];
    tips.push(`If VR is above ~${medianVR.toFixed(1)}, the reel may feel un-engaging - improve hooks or calls to action.`);
  }

  tips.push("Start tagging formats (tutorial, meme, story) to see what works.");

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-4 h-4 text-mint" strokeWidth={1.5} />
          <h3 className="font-tight font-semibold text-[16px] text-text-primary">Quick Tips — Last {timeRangeDays} days</h3>
        </div>
        <p className="font-mono text-[11px] text-text-muted">Plain-language insights based on recent data.</p>
      </div>
      <ul className="space-y-3">
        {tips.map((tip, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="font-mono text-[11px] text-mint mt-0.5 shrink-0">→</span>
            <span className="font-mono text-[12px] text-text-secondary leading-relaxed">{tip}</span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[10px] text-text-muted mt-6 pt-4 border-t border-border-subtle">
        Numbers update in real-time after each fetch. No cache.
      </p>
    </div>
  );
}
