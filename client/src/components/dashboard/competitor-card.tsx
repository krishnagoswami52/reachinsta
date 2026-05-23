import { formatNumber } from "@/lib/utils";
import { ExternalLink, Users, Play, TrendingUp, Zap } from "lucide-react";
import type { CompetitorStats } from "@shared/schema";

interface CompetitorCardProps {
  stats: CompetitorStats;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function CompetitorCard({ stats, isSelected, onSelect }: CompetitorCardProps) {
  const engagementPct = (parseFloat(String(stats.avgEngagementRate)) * 100).toFixed(2);
  const isHighEngagement = parseFloat(engagementPct) >= 3;

  const initials = stats.username.slice(0, 2).toUpperCase();

  return (
    <div
      className={`bg-bg-surface border rounded-lg p-6 hover:border-border-soft transition-colors cursor-pointer ${
        isSelected ? "border-mint" : "border-border-subtle"
      }`}
      onClick={onSelect}
      data-testid={`competitor-card-${stats.username}`}
    >
      {/* Top: avatar + handle + external link */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-border-soft to-border-subtle flex items-center justify-center text-[13px] font-semibold border border-border-subtle text-text-secondary">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[15px] text-text-primary">@{stats.username}</span>
              <a
                href={`https://instagram.com/${stats.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-mint transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
              </a>
            </div>
            {stats.followers ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Users className="w-3 h-3 text-text-muted" strokeWidth={1.5} />
                <span className="font-mono text-[11px] text-text-muted">
                  {formatNumber(stats.followers)} followers
                </span>
              </div>
            ) : (
              <span className="font-mono text-[11px] text-text-muted">Followers unknown</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-bg-base border border-border-subtle rounded-md px-2.5 py-3 min-w-0">
          <div className="flex items-center gap-1 mb-1.5">
            <Play className="w-3 h-3 text-text-muted shrink-0" strokeWidth={1.5} />
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted truncate">reels</span>
          </div>
          <div className="font-mono text-[18px] font-medium text-text-primary tabular-nums leading-none">{stats.reelsCount}</div>
        </div>

        <div className="bg-bg-base border border-border-subtle rounded-md px-2.5 py-3 min-w-0">
          <div className="flex items-center gap-1 mb-1.5">
            <TrendingUp className="w-3 h-3 text-text-muted shrink-0" strokeWidth={1.5} />
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted truncate">avg views</span>
          </div>
          <div className="font-mono text-[18px] font-medium text-text-primary tabular-nums leading-none">
            {formatNumber(parseFloat(String(stats.avgViews)))}
          </div>
        </div>

        <div className="bg-bg-base border border-border-subtle rounded-md px-2.5 py-3 min-w-0">
          <div className="flex items-center gap-1 mb-1.5">
            <Zap className="w-3 h-3 text-text-muted shrink-0" strokeWidth={1.5} />
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted truncate">eng</span>
          </div>
          <div className={`font-mono text-[18px] font-medium tabular-nums leading-none ${isHighEngagement ? "text-mint" : "text-text-primary"}`}>
            {engagementPct}%
          </div>
        </div>
      </div>

      {/* Top reel footer */}
      {stats.topReelViews > 0 && (
        <div className="pt-4 border-t border-border-subtle flex items-center justify-between">
          <span className="text-[12px] text-text-secondary">Top Reel</span>
          <span className="font-mono text-[13px] text-text-primary">{formatNumber(stats.topReelViews)} views</span>
        </div>
      )}
    </div>
  );
}
