import { Lightbulb } from "lucide-react";
import { HelpText } from "@/components/analytics/HelpText";
import { METRIC_HELP } from "@/lib/metric-help";
import type { AnalyticsTab, Insight } from "@/lib/insights";

interface InsightsPanelProps {
  insights: Insight[];
  timeRangeDays: number;
  onNavigate: (tab: AnalyticsTab) => void;
}

export function InsightsPanel({ insights, timeRangeDays, onNavigate }: InsightsPanelProps) {
  if (insights.length === 0) return null;

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-4 h-4 text-mint" strokeWidth={1.5} />
          <h3 className="font-tight font-semibold text-[16px] text-text-primary">
            Insights — last {timeRangeDays} days
          </h3>
          <HelpText {...METRIC_HELP.autoInsights} />
        </div>
        <p className="font-mono text-[11px] text-text-muted">
          Generated from this fetch. Numbers change with the data.
        </p>
      </div>

      <div className="space-y-3">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="flex items-start gap-3 p-4 rounded-lg bg-bg-elevated border border-border-subtle"
            data-testid={`insight-${insight.id}`}
          >
            <span className="text-[18px] leading-none mt-0.5 shrink-0" aria-hidden="true">
              {insight.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-tight font-medium text-[14px] text-text-primary">
                {insight.headline}
              </p>
              <p className="font-mono text-[12px] text-text-secondary leading-relaxed mt-1">
                {insight.detail}
              </p>
              {insight.action && (
                <button
                  type="button"
                  onClick={() => onNavigate(insight.action!.tab)}
                  className="font-mono text-[11px] text-mint hover:text-mint-hover mt-2.5 inline-flex items-center gap-1 transition-colors"
                  data-testid={`insight-link-${insight.action.tab}`}
                >
                  {insight.action.label} →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
