// Statuses where a provider subscription still exists and may bill again.
// "canceling" counts: the user has paid through the period end, and a second
// checkout in that window would charge them twice for the same access.
const LIVE_SUBSCRIPTION_STATUSES = ["active", "canceling", "past_due", "paused"];

/**
 * True when the profile already has a paid subscription with either provider,
 * so a new checkout (Paddle or Razorpay) must be refused. Plans granted by an
 * admin have no subscription ID and don't count.
 *
 * Takes a minimal shape so the client can call it without importing schema.ts.
 */
export function hasLiveSubscription(profile: {
  subscriptionStatus: string;
  paddleSubscriptionId: string | null;
  razorpaySubscriptionId: string | null;
}): boolean {
  const hasProviderSub = !!(profile.paddleSubscriptionId || profile.razorpaySubscriptionId);
  return hasProviderSub && LIVE_SUBSCRIPTION_STATUSES.includes(profile.subscriptionStatus);
}
