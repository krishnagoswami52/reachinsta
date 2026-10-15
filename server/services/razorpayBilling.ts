import type { Profile } from "@shared/schema";
import { storage } from "../storage";
import { getPlanFromRazorpayPlanId, type RazorpaySubscription } from "../lib/razorpay";

/**
 * Applies a Razorpay subscription's current state to a profile. Shared by the
 * checkout-verify route (so the plan unlocks the moment checkout closes) and
 * the webhook (renewals, failures, cancellations). Every write is absolute
 * state, so applying the same subscription twice is harmless.
 */
export async function applyRazorpaySubscription(profile: Profile, sub: RazorpaySubscription): Promise<void> {
  const plan = getPlanFromRazorpayPlanId(sub.plan_id);
  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000) : null;
  const isCurrentSub = profile.razorpaySubscriptionId === sub.id;

  switch (sub.status) {
    case "authenticated":
    case "active": {
      // Cancelled at cycle end: Razorpay keeps the subscription "active" until
      // the cycle runs out, so don't let a late event undo our "canceling".
      if (isCurrentSub && profile.subscriptionStatus === "canceling") {
        await storage.updateProfileSubscription(profile.id, {
          ...(plan ? { plan } : {}),
          ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
        });
        return;
      }
      if (!plan) {
        // Unknown plan id: don't hand out a plan we can't identify, but don't
        // throw either — a retry won't make the id known.
        console.error(`[Razorpay] Unknown plan_id ${sub.plan_id} on ${sub.id}; check RAZORPAY_PLAN_PLUS/PRO`);
        return;
      }
      await storage.updateProfileSubscription(profile.id, {
        billingProvider: "razorpay",
        razorpaySubscriptionId: sub.id,
        subscriptionStatus: "active",
        plan,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        cancelAt: null,
      });
      console.log(`[Razorpay] Active → userId=${profile.id} plan=${plan} sub=${sub.id}`);
      return;
    }

    case "pending":
    case "halted":
      // Renewal charge failed (pending = retrying, halted = retries exhausted).
      // Same treatment as Paddle past_due: keep the plan, flag the account.
      if (!isCurrentSub) return;
      await storage.updateProfileSubscription(profile.id, { subscriptionStatus: "past_due" });
      console.log(`[Razorpay] ${sub.status} → userId=${profile.id} past_due`);
      return;

    case "paused":
      if (!isCurrentSub) return;
      await storage.updateProfileSubscription(profile.id, {
        subscriptionStatus: "paused",
        cancelAtPeriodEnd: false,
        cancelAt: null,
      });
      return;

    case "cancelled":
    case "completed":
    case "expired": {
      // Ignore the end of a subscription the user is no longer on.
      if (!isCurrentSub) return;
      const now = new Date();
      if (!periodEnd || periodEnd <= now) {
        await storage.updateProfileSubscription(profile.id, {
          plan: "free",
          subscriptionStatus: "canceled",
          razorpaySubscriptionId: null,
          billingProvider: null,
          cancelAtPeriodEnd: false,
          cancelAt: null,
          currentPeriodEnd: null,
        });
        console.log(`[Razorpay] Ended → userId=${profile.id} downgraded to free`);
      } else {
        // Ended mid-cycle: keep what they paid for; the daily cron downgrades.
        await storage.updateProfileSubscription(profile.id, {
          subscriptionStatus: "canceling",
          cancelAtPeriodEnd: true,
          cancelAt: periodEnd,
          currentPeriodEnd: periodEnd,
        });
        console.log(`[Razorpay] Ended → userId=${profile.id} accessUntil=${periodEnd.toISOString()}`);
      }
      return;
    }

    default:
      // "created": checkout opened but never paid. Nothing to do.
      return;
  }
}
