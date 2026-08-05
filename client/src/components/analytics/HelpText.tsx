import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HelpTextProps {
  title: string;
  description: string;
  formula?: string;
  benchmark?: string;
}

export function HelpText({ title, description, formula, benchmark }: HelpTextProps) {
  // Controlled open so a tap toggles the tooltip on touch devices,
  // while onOpenChange keeps normal hover/focus behavior on desktop.
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-text-muted hover:text-mint focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/50 transition-colors shrink-0"
          aria-label={`Learn about ${title}`}
        >
          <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs bg-bg-elevated border border-border-subtle p-3 space-y-2">
        <p className="font-tight font-semibold text-[13px] text-text-primary">{title}</p>
        <p className="text-[12px] text-text-muted leading-relaxed">{description}</p>
        {formula && (
          <div className="text-[12px] text-text-muted border-t border-border-subtle pt-2">
            <span className="font-medium text-text-primary">Formula: </span>
            <code className="font-mono text-mint">{formula}</code>
          </div>
        )}
        {benchmark && (
          <div className="text-[12px] border-t border-border-subtle pt-2">
            <span className="font-medium text-text-primary">Benchmark: </span>
            <span className="text-mint">{benchmark}</span>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
