import { TIER_LABELS, type BenchmarkTier } from "@/lib/benchmarks";

export const TIER_STYLES: Record<BenchmarkTier, string> = {
  excellent: "bg-mint/15 text-mint border-mint/30",
  good: "bg-mint/10 text-mint border-mint/20",
  average: "bg-bg-elevated text-text-secondary border-border-subtle",
  below: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

/** Inline benchmark pill — no context line. Used inside dense tables. */
export function TierPill({ tier }: { tier: BenchmarkTier }) {
  return (
    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${TIER_STYLES[tier]}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}

/** Stacked badge + explanation line. Used under KPI card values. */
export function TierBadge({ tier, context }: { tier: BenchmarkTier; context: string }) {
  return (
    <div className="mt-2">
      <TierPill tier={tier} />
      <p className="font-mono text-[10px] text-text-muted mt-1.5">{context}</p>
    </div>
  );
}
