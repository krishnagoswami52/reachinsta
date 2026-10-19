// Statuses where a provider subscription still exists and may bill again.
// "canceling" counts: the user has paid through the period end, and a second
// checkout in that window would charge them twice for the same access.
const LIVE_SUBSCRIPTION_STATUSES = ["active", "canceling", "past_due", "paused"];

const PLAN_NAMES: Record<string, string> = { free: "Free", plus: "Plus", pro: "Pro" };

// Minimal profile shape so the client can call these without importing schema.ts.
type SubscriptionFields = {
  plan: string;
  subscriptionStatus: string;
  paddleSubscriptionId: string | null;
  razorpaySubscriptionId: string | null;
  cancelAt: Date | string | null;
  currentPeriodEnd: Date | string | null;
};

/**
 * True when the profile already has a paid subscription with either provider,
 * so a new checkout (Paddle or Razorpay) must be refused. Plans granted by an
 * admin have no subscription ID and don't count.
 */
export function hasLiveSubscription(profile: SubscriptionFields): boolean {
  const hasProviderSub = !!(profile.paddleSubscriptionId || profile.razorpaySubscriptionId);
  return hasProviderSub && LIVE_SUBSCRIPTION_STATUSES.includes(profile.subscriptionStatus);
}

export type CheckoutBlock = {
  code: "SUBSCRIPTION_ENDING" | "ALREADY_SUBSCRIBED";
  message: string;
};

/**
 * Why a new checkout is refused, worded for the state the user is in — an
 * already-canceled plan that is running out its period must not be told to
 * "cancel first". Returns null when checkout is allowed.
 */
export function getCheckoutBlock(profile: SubscriptionFields, targetPlan: string): CheckoutBlock | null {
  if (!hasLiveSubscription(profile)) return null;

  const current = PLAN_NAMES[profile.plan] ?? profile.plan;
  const endsAt = profile.cancelAt ?? profile.currentPeriodEnd;

  if (profile.subscriptionStatus === "canceling") {
    const target = PLAN_NAMES[targetPlan] ?? targetPlan;
    const message = endsAt
      ? `Your ${current} plan is scheduled to end on ${new Date(endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. You can subscribe to ${target} after that date.`
      : `Your ${current} plan ends with your current billing period. You can subscribe to ${target} after that.`;
    return { code: "SUBSCRIPTION_ENDING", message };
  }

  return {
    code: "ALREADY_SUBSCRIBED",
    message: `You already have an active ${current} plan. To change plans, cancel from Billing first.`,
  };
}
