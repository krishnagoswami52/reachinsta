import { apiRequest } from '@/lib/queryClient';

declare global {
  interface Window {
    Razorpay: any;
  }
}

let razorpayLoadPromise: Promise<void> | null = null;

/** Loads checkout.js on first use only — no script tag on pages that never pay in INR. */
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayLoadPromise) return razorpayLoadPromise;

  razorpayLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error('Razorpay not available after script load')));
    script.onerror = () => {
      razorpayLoadPromise = null; // allow a retry on the next click
      reject(new Error('Failed to load Razorpay checkout'));
    };
    document.head.appendChild(script);
  });

  return razorpayLoadPromise;
}

/**
 * Creates the subscription server-side, then opens Razorpay's modal.
 * Resolves once the modal is open; outcome arrives via the callbacks.
 * Throws (apiRequest format "<status>: <json>") if the subscription can't be created.
 */
export async function openRazorpayCheckout(params: {
  planId: 'plus' | 'pro';
  planName: string;
  user: { email?: string | null; firstName?: string | null; lastName?: string | null };
  onDismiss: () => void;
  onVerifyFailed: (message: string) => void;
}) {
  const [res] = await Promise.all([
    apiRequest('POST', '/api/razorpay/create-subscription', { planId: params.planId }),
    loadRazorpay(),
  ]);
  const { subscriptionId, keyId } = (await res.json()) as { subscriptionId: string; keyId: string };

  const checkout = new window.Razorpay({
    key: keyId,
    subscription_id: subscriptionId,
    name: 'ReachInsta',
    description: `${params.planName} plan · monthly`,
    image: `${window.location.origin}/apple-touch-icon.png`,
    prefill: {
      email: params.user.email ?? undefined,
      name: [params.user.firstName, params.user.lastName].filter(Boolean).join(' ') || undefined,
    },
    theme: { color: '#7CFFB2' },
    handler: async (response: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    }) => {
      try {
        await apiRequest('POST', '/api/razorpay/verify-payment', response);
        window.location.href = '/account/billing?success=true';
      } catch (err) {
        // Payment went through at Razorpay; the webhook will still apply it.
        params.onVerifyFailed(
          "Payment received, but we couldn't confirm it yet. Your plan will update within a few minutes — refresh Billing to check.",
        );
      }
    },
    modal: {
      ondismiss: params.onDismiss,
    },
  });

  checkout.open();
}
