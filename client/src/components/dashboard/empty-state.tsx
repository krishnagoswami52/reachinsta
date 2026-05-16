import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  footnote?: string;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, footnote, className }: EmptyStateProps) {
  return (
    <div className={cn(
      "bg-bg-surface border border-border-subtle rounded-lg py-20 px-8 text-center",
      className
    )}>
      <div className="w-12 h-12 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-center mx-auto mb-6">
        <Icon className="w-5 h-5 text-text-muted" strokeWidth={1.5} />
      </div>

      <h2 className="font-tight font-bold text-[28px] tracking-tighter-2 text-text-primary mb-3">
        {title}
      </h2>

      <p className="text-[15px] text-text-secondary max-w-[440px] mx-auto leading-relaxed mb-8">
        {description}
      </p>

      {action && (
        <button
          className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] px-5 py-3 rounded-md inline-flex items-center gap-2 transition-all hover:-translate-y-0.5"
          onClick={action.onClick}
          data-testid="button-empty-action"
        >
          {action.label}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}

      {footnote && (
        <p className="font-mono text-[11px] text-text-muted mt-6 italic">{footnote}</p>
      )}
    </div>
  );
}
