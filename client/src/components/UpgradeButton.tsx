import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadPaddle, openCheckout } from '@/lib/paddle';
import { PLANS } from '@/lib/plans';
import { useAuth } from '@/hooks/use-auth';
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
  const { user } = useAuth();
  const [paddleReady, setPaddleReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const plan = PLANS[planId];
  const isCurrentPlan = currentPlan === planId;

  useEffect(() => {
    loadPaddle()
      .then(() => setPaddleReady(true))
      .catch((err) => console.error('[Paddle] Load failed:', err));
  }, []);

  const handleClick = () => {
    // Unauthenticated → send to register, with ?next=/pricing so they return after signup
    if (!user) {
      window.location.href = '/register?next=/pricing';
      return;
    }
    if (!plan.paddlePriceId) {
      console.error('[Paddle] No price ID configured for plan:', planId);
      return;
    }
    setLoading(true);
    try {
      openCheckout({
        priceId: plan.paddlePriceId,
        userId: user.id,
        userEmail: user.email,
      });
    } catch (err) {
      console.error('[Paddle] Checkout open failed:', err);
      setLoading(false);
      return;
    }
    // Paddle overlay takes over — reset loading after overlay opens
    setTimeout(() => setLoading(false), 2000);
  };

  if (isCurrentPlan) {
    return (
      <Button disabled variant="outline" className={cn('w-full', className)}>
        Current Plan
      </Button>
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading || (!!user && !paddleReady)}
      variant={variant}
      className={cn('w-full', className)}
    >
      {loading ? 'Opening checkout…' : (children ?? `Upgrade to ${plan.name}`)}
    </Button>
  );
}
