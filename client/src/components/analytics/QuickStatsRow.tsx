import { Clock, Timer, CalendarDays } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { formatHour, type AnalyticsTab, type InsightFacts } from "@/lib/insights";

interface QuickStatsRowProps {
  facts: InsightFacts;
  onNavigate: (tab: AnalyticsTab) => void;
}

interface QuickStat {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  linkLabel: string;
  tab: AnalyticsTab;
}

function QuickStatCard({ stat, onNavigate }: { stat: QuickStat; onNavigate: (tab: AnalyticsTab) => void }) {
  const Icon = stat.icon;
  return (
    <div
      className="bg-bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-soft transition-colors flex flex-col"
      data-testid={`quick-stat-${stat.key}`}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <Icon className="w-3.5 h-3.5 text-mint" strokeWidth={1.5} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{stat.label}</span>
      </div>
      <div className="font-mono text-[26px] font-medium text-text-primary tracking-tight">{stat.value}</div>
      <p className="font-mono text-[11px] text-text-muted mt-1">{stat.sub}</p>
      <button
        type="button"
        onClick={() => onNavigate(stat.tab)}
        className="font-mono text-[11px] text-mint hover:text-mint-hover mt-4 text-left transition-colors"
        data-testid={`quick-stat-link-${stat.key}`}
      >
        {stat.linkLabel} →
      </button>
    </div>
  );
}

export function QuickStatsRow({ facts, onNavigate }: QuickStatsRowProps) {
  const stats: QuickStat[] = [];

  if (facts.bestHour) {
    stats.push({
      key: "best-time",
      icon: Clock,
      label: "best time",
      value: formatHour(facts.bestHour.hour),
      sub: `${facts.bestHour.avgER.toFixed(2)}% avg ER · local time`,
      linkLabel: "See timing",
      tab: "timing",
    });
  }

  if (facts.bestDuration) {
    stats.push({
      key: "best-duration",
      icon: Timer,
      label: "best duration",
      value: facts.bestDuration.label,
      sub: `${formatNumber(Math.round(facts.bestDuration.avgViews))} avg views`,
      linkLabel: "See duration",
      tab: "duration",
    });
  }

  if (facts.bestWeekday) {
    stats.push({
      key: "best-day",
      icon: CalendarDays,
      label: "best day",
      value: facts.bestWeekday.day,
      sub: `${facts.bestWeekday.avgER.toFixed(2)}% avg ER`,
      linkLabel: "See timing",
      tab: "timing",
    });
  }

  if (stats.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <QuickStatCard key={stat.key} stat={stat} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
