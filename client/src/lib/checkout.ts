import type { Currency } from '@shared/pricing';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { loadPaddle, openCheckout } from '@/lib/paddle';
import { loadRazorpay, openRazorpayCheckout } from '@/lib/razorpay';
import { PLANS } from '@/lib/plans';

/** Warms up the checkout script for this currency so the click opens instantly. */
export function preloadCheckout(currency: Currency): void {
  const load = currency === 'INR' ? loadRazorpay : loadPaddle;
  load().catch((err) => console.error(`[Checkout] ${currency} preload failed:`, err));
}

/** apiRequest throws "<status>: <json body>"; pull out the server's message. */
export function checkoutErrorMessage(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error)).replace(/^\d+:\s*/, '');
  try {
    return JSON.parse(raw).message ?? raw;
  } catch {
    return raw;
  }
}

/**
 * Starts checkout for a paid plan: Razorpay for INR (India), Paddle for USD.
 * Resolves once the checkout UI is open (Paddle) or closed (Razorpay); throws
 * with a user-facing message when checkout can't start.
 */
export async function startCheckout(params: {
  planId: 'plus' | 'pro';
  currency: Currency;
  user: { id: string; email: string | null; firstName?: string | null; lastName?: string | null };
}): Promise<void> {
  const { planId, currency, user } = params;
  const plan = PLANS[planId];

  if (currency === 'INR') {
    await loadRazorpay();
    const res = await apiRequest('POST', '/api/razorpay/subscription', { plan: planId });
    const { subscriptionId, keyId } = (await res.json()) as { subscriptionId: string; keyId: string };

    const payment = await openRazorpayCheckout({
      keyId,
      subscriptionId,
      planName: plan.name,
      userEmail: user.email ?? '',
      userName: [user.firstName, user.lastName].filter(Boolean).join(' '),
    });
    if (!payment) return; // closed without paying

    try {
      await apiRequest('POST', '/api/razorpay/verify', payment);
    } catch (err) {
      // The payment went through; the webhook will still activate the plan.
      console.error('[Razorpay] Verify failed, relying on webhook:', err);
    }
    queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    window.location.href = '/account/billing?success=true';
    return;
  }

  if (!plan.paddlePriceId) {
    throw new Error('Checkout is not configured for this plan yet.');
  }
  await loadPaddle();
  openCheckout({ priceId: plan.paddlePriceId, userId: user.id, userEmail: user.email ?? '' });
}
