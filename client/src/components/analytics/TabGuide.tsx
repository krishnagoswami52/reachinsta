import type { AnalyticsTab } from "@/lib/insights";

const DESTINATIONS: { tab: AnalyticsTab; title: string; description: string }[] = [
  { tab: "creators", title: "Creators", description: "Compare competitors, drill into individuals" },
  { tab: "timing", title: "Timing", description: "Full posting time heatmaps" },
  { tab: "duration", title: "Duration", description: "Reel length performance analysis" },
  { tab: "reels", title: "Reels", description: "Top viral reels + rankings" },
];

/** Overview footer: tells the user which tab holds what, one click away. */
export function TabGuide({ onNavigate }: { onNavigate: (tab: AnalyticsTab) => void }) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">
        // deep dive
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DESTINATIONS.map(({ tab, title, description }) => (
          <button
            key={tab}
            type="button"
            onClick={() => onNavigate(tab)}
            className="text-left p-3 rounded-lg bg-bg-elevated border border-border-subtle hover:border-mint/40 transition-colors"
            data-testid={`tab-guide-${tab}`}
          >
            <p className="font-tight font-medium text-[14px] text-text-primary">{title} →</p>
            <p className="font-mono text-[11px] text-text-muted mt-1 leading-relaxed">{description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
