import { Button } from "@/components/ui/button";
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
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 28, label: "28 days" },
];

export function TimeRangeSelector({ value, onChange, maxDays, disabled }: TimeRangeSelectorProps) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/50 p-1">
      {ranges.map((range) => {
        const isLocked = range.days > maxDays;
        const isSelected = value === range.days;
        
        const button = (
          <Button
            key={range.days}
            variant="ghost"
            size="sm"
            disabled={disabled || isLocked}
            onClick={() => onChange(range.days)}
            className={cn(
              "relative px-4",
              isSelected && "bg-background shadow-sm",
              isLocked && "opacity-50"
            )}
            data-testid={`button-range-${range.days}`}
          >
            {range.label}
            {isLocked && <Lock className="w-3 h-3 ml-1" />}
          </Button>
        );
        
        if (isLocked) {
          return (
            <Tooltip key={range.days}>
              <TooltipTrigger asChild>
                {button}
              </TooltipTrigger>
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
