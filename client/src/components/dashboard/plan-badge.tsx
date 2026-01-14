import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanType } from "@shared/schema";

interface PlanBadgeProps {
  plan: PlanType;
  className?: string;
}

export function PlanBadge({ plan, className }: PlanBadgeProps) {
  const variants: Record<PlanType, { label: string; className: string }> = {
    free: {
      label: "Free",
      className: "bg-muted text-muted-foreground border-muted-border",
    },
    plus: {
      label: "Plus",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    },
    pro: {
      label: "Pro",
      className: "bg-primary/10 text-primary border-primary/20",
    },
  };

  const { label, className: variantClass } = variants[plan];

  return (
    <Badge 
      variant="outline" 
      className={cn(variantClass, className)}
      data-testid={`badge-plan-${plan}`}
    >
      {label}
    </Badge>
  );
}
