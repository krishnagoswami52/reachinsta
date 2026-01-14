import { Card, CardContent } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon?: LucideIcon;
  className?: string;
}

export function KPICard({ title, value, subtitle, trend, icon: Icon, className }: KPICardProps) {
  const formattedValue = typeof value === "number" ? formatNumber(value) : value;
  
  return (
    <Card className={cn("hover-elevate", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{formattedValue}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend !== undefined && (
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium",
                trend > 0 && "text-green-600 dark:text-green-400",
                trend < 0 && "text-red-600 dark:text-red-400",
                trend === 0 && "text-muted-foreground"
              )}>
                {trend > 0 && <TrendingUp className="w-3 h-3" />}
                {trend < 0 && <TrendingDown className="w-3 h-3" />}
                {trend === 0 && <Minus className="w-3 h-3" />}
                <span>{trend > 0 ? "+" : ""}{trend.toFixed(1)}%</span>
              </div>
            )}
          </div>
          {Icon && (
            <div className="p-3 rounded-lg bg-primary/10">
              <Icon className="w-5 h-5 text-primary" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
