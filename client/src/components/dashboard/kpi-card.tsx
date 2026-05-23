import { cn, formatNumber } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon?: LucideIcon;
  highlight?: boolean;
  className?: string;
}

export function KPICard({ title, value, subtitle, trend, icon: Icon, highlight, className }: KPICardProps) {
  const formattedValue = typeof value === "number" ? formatNumber(value) : value;

  return (
    <div className={cn(
      "bg-bg-surface border border-border-subtle rounded-lg p-4 lg:p-5 hover:border-border-soft transition-colors",
      className
    )}>
      <div className="flex items-center gap-1.5 mb-2 lg:mb-3">
        {Icon && <Icon className="w-3.5 h-3.5 text-text-muted shrink-0" strokeWidth={1.5} />}
        <span className="font-mono text-[9px] lg:text-[10px] uppercase tracking-wider text-text-muted truncate">
          {title}
        </span>
      </div>
      <div className={cn(
        "font-mono text-[24px] lg:text-[32px] font-medium tracking-tight tabular-nums leading-none",
        highlight ? "text-mint" : "text-text-primary"
      )}>
        {formattedValue}
      </div>
      {subtitle && (
        <p className="font-mono text-[10px] lg:text-[11px] text-text-muted mt-1.5">{subtitle}</p>
      )}
      {trend !== undefined && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium mt-2",
          trend > 0 && "text-mint",
          trend < 0 && "text-danger",
          trend === 0 && "text-text-muted"
        )}>
          {trend > 0 && <TrendingUp className="w-3 h-3" />}
          {trend < 0 && <TrendingDown className="w-3 h-3" />}
          {trend === 0 && <Minus className="w-3 h-3" />}
          <span>{trend > 0 ? "+" : ""}{trend.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
