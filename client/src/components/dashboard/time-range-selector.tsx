import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

interface TimeRangeSelectorProps {
  value: number;
  onChange: (days: number) => void;
  maxDays: number;
  disabled?: boolean;
}

const ranges = [
  { days: 7,  label: "7 days"  },
  { days: 14, label: "14 days" },
  { days: 28, label: "28 days" },
];

export function TimeRangeSelector({ value, onChange, maxDays, disabled }: TimeRangeSelectorProps) {
  return (
    <div className="inline-flex bg-bg-surface border border-border-subtle rounded-md p-1">
      {ranges.map((range) => {
        const isLocked   = range.days > maxDays;
        const isSelected = value === range.days;

        const button = (
          <button
            key={range.days}
            disabled={disabled || isLocked}
            onClick={() => onChange(range.days)}
            className={cn(
              "px-3 py-1.5 text-[13px] font-medium rounded transition-colors inline-flex items-center gap-1",
              isSelected
                ? "bg-bg-elevated text-text-primary"
                : "text-text-secondary hover:text-text-primary",
              isLocked && "opacity-50 cursor-not-allowed"
            )}
            data-testid={`button-range-${range.days}`}
          >
            {range.label}
            {isLocked && <Lock className="w-3 h-3" />}
          </button>
        );

        if (isLocked) {
          return (
            <Tooltip key={range.days}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>
                <p>Upgrade your plan to access {range.days}-day range</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return button;
      })}
    </div>
  );
}
