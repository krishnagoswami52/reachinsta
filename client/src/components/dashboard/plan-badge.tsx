import { cn } from "@/lib/utils";
import type { PlanType } from "@shared/schema";

interface PlanBadgeProps {
  plan: PlanType;
  className?: string;
}

export function PlanBadge({ plan, className }: PlanBadgeProps) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border",
        plan === "pro"
          ? "bg-mint-dim text-mint border-mint/30"
          : "bg-bg-elevated text-text-muted border-border-subtle",
        className,
      )}
      data-testid={`badge-plan-${plan}`}
    >
      // {plan}
    </span>
  );
}
