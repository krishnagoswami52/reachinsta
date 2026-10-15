import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PLANS } from '@/lib/plans';
import { checkoutErrorMessage, preloadCheckout, startCheckout } from '@/lib/checkout';
import { useAuth } from '@/hooks/use-auth';
import { useCurrency } from '@/hooks/use-currency';
import { useToast } from '@/hooks/use-toast';
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
  const currency = useCurrency();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const plan = PLANS[planId];
  const isCurrentPlan = currentPlan === planId;

  useEffect(() => {
    if (user) preloadCheckout(currency);
  }, [user, currency]);

  const handleClick = async () => {
    // Unauthenticated → send to register, with ?next=/pricing so they return after signup
    if (!user) {
      window.location.href = '/register?next=/pricing';
      return;
    }
    setLoading(true);
    try {
      await startCheckout({ planId, currency, user });
    } catch (err) {
      console.error('[Checkout] Failed to start:', err);
      toast({
        title: "Couldn't open checkout",
        description: checkoutErrorMessage(err),
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }
    // Paddle's overlay takes over / Razorpay's modal has closed by now
    setTimeout(() => setLoading(false), currency === 'INR' ? 0 : 2000);
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
      disabled={loading}
      variant={variant}
      className={cn('w-full', className)}
    >
      {loading ? 'Opening checkout…' : (children ?? `Upgrade to ${plan.name}`)}
    </Button>
  );
}
