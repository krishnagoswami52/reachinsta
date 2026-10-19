import { Button } from '@/components/ui/button';
import { PLANS } from '@/lib/plans';
import { useCheckout } from '@/hooks/use-checkout';
import { cn } from '@/lib/utils';

interface Props {
  planId: 'plus' | 'pro';
  /** Pass the user's current plan so we can show "Current Plan" state */
  currentPlan?: string;
  className?: string;
  children?: React.ReactNode;
  variant?: 'default' | 'outline';
}

export function UpgradeButton({
  planId,
  currentPlan,
  className,
  children,
  variant = 'default',
}: Props) {
  const { startCheckout, loading, ready } = useCheckout();

  const plan = PLANS[planId];
  const isCurrentPlan = currentPlan === planId;

  if (isCurrentPlan) {
    return (
      <Button disabled variant="outline" className={cn('w-full', className)}>
        Current Plan
      </Button>
    );
  }

  return (
    <Button
      onClick={() => startCheckout(planId)}
      disabled={loading || !ready}
      variant={variant}
      className={cn('w-full', className)}
    >
      {loading ? 'Opening checkout…' : (children ?? `Upgrade to ${plan.name}`)}
    </Button>
  );
}
