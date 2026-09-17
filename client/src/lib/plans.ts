export const PLANS = {
  free: {
    id: 'free' as const,
    name: 'Free',
    price: 0,
    competitors: 5,
    timeRange: 7,
    fetchesPerMonth: 1,
    csvExport: false,
    paddlePriceId: null as null,
  },
  plus: {
    id: 'plus' as const,
    name: 'Plus',
    price: 49,
    competitors: 50,
    // 14, not 28. The server enforces planLimits.plus.timeRangeMaxDays = 14
    // (shared/schema.ts) and rejects anything longer with "Time range not
    // allowed on your plan", so a 28 here advertised a window Plus users
    // could never actually select.
    timeRange: 14,
    fetchesPerMonth: 2,
    csvExport: false,
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_PLUS as string,
  },
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    price: 99,
    competitors: 100,
    timeRange: 28,
    fetchesPerMonth: 4,
    csvExport: true,
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_PRO as string,
  },
} as const;

export type PlanId = keyof typeof PLANS;

/** Price ID se plan ID reverse lookup — Paddle webhook mein useful */
export function getPlanByPriceId(priceId: string): PlanId | null {
  if (priceId === PLANS.plus.paddlePriceId) return 'plus';
  if (priceId === PLANS.pro.paddlePriceId) return 'pro';
  return null;
}

// Startup validation: missing env vars ko warn/throw karo
if (typeof import.meta !== 'undefined' && import.meta.env) {
  const missing: string[] = [];
  if (!import.meta.env.VITE_PADDLE_PRICE_PLUS) missing.push('VITE_PADDLE_PRICE_PLUS');
  if (!import.meta.env.VITE_PADDLE_PRICE_PRO) missing.push('VITE_PADDLE_PRICE_PRO');

  if (missing.length > 0) {
    const msg = `[plans] Missing Paddle env vars: ${missing.join(', ')}. Checkout will not work.`;
    if (import.meta.env.PROD) {
      throw new Error(msg);
    } else {
      console.warn(msg);
    }
  }
}
