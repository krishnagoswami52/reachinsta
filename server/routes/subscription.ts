import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { cancelSubscription, removeScheduledCancel } from "../lib/paddle";
import { cancelSubscriptionAtCycleEnd } from "../lib/razorpay";

const router = Router();

/**
 * POST /api/subscription/cancel
 * Schedules cancellation at period end via Paddle or Razorpay (whichever bills the user).
 * User keeps paid access until currentPeriodEnd; the daily cron downgrades after.
 */
router.post("/api/subscription/cancel", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;

    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const isRazorpay = profile.billingProvider === "razorpay";
    const subscriptionId = isRazorpay ? profile.razorpaySubscriptionId : profile.paddleSubscriptionId;

    if (!subscriptionId) {
      return res.status(400).json({
        message: "No active subscription to cancel",
        code: "NO_SUBSCRIPTION",
      });
    }

    if (profile.subscriptionStatus === "canceling" || profile.subscriptionStatus === "canceled") {
      return res.status(400).json({
        message: "Subscription is already canceled or scheduled to cancel",
        code: "ALREADY_CANCELED",
      });
    }

    if (isRazorpay) {
      const rzpSub = await cancelSubscriptionAtCycleEnd(subscriptionId);
      const cancelAt = rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : profile.currentPeriodEnd;

      await storage.updateProfileSubscription(userId, {
        subscriptionStatus: "canceling",
        cancelAtPeriodEnd: true,
        cancelAt,
      });

      console.log(`[Subscription] User ${userId} canceled Razorpay ${subscriptionId}, access until ${cancelAt?.toISOString()}`);

      return res.json({
        message: "Subscription canceled. You keep access until the end of your billing period.",
        cancelAt,
      });
    }

    const sub = await cancelSubscription(subscriptionId);

    const cancelAt = sub.scheduled_change?.effective_at
      ? new Date(sub.scheduled_change.effective_at)
      : sub.current_billing_period?.ends_at
        ? new Date(sub.current_billing_period.ends_at)
        : profile.currentPeriodEnd;

    await storage.updateProfileSubscription(userId, {
      subscriptionStatus: "canceling",
      cancelAtPeriodEnd: true,
      cancelAt,
    });

    console.log(`[Subscription] User ${userId} canceled ${profile.paddleSubscriptionId}, access until ${cancelAt?.toISOString()}`);

    res.json({
      message: "Subscription canceled. You keep access until the end of your billing period.",
      cancelAt,
    });
  } catch (error) {
    console.error("[Subscription cancel] Error:", error);
    res.status(500).json({ message: "Failed to cancel subscription. Please try again or contact support." });
  }
});

/**
 * POST /api/subscription/resume
 * Removes a scheduled cancellation before the period ends.
 */
router.post("/api/subscription/resume", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;

    const profile = await storage.getProfile(userId);

    // Razorpay has no API to undo a cancel_at_cycle_end, so the user re-subscribes
    // once the current period ends instead.
    if (profile?.billingProvider === "razorpay") {
      return res.status(400).json({
        message: "This subscription can't be resumed. You can subscribe again from the pricing page once it ends.",
        code: "RESUME_NOT_SUPPORTED",
      });
    }

    if (!profile?.paddleSubscriptionId) {
      return res.status(400).json({
        message: "No subscription found",
        code: "NO_SUBSCRIPTION",
      });
    }

    if (profile.subscriptionStatus !== "canceling") {
      return res.status(400).json({
        message: "Subscription is not scheduled to cancel",
        code: "NOT_CANCELING",
      });
    }

    await removeScheduledCancel(profile.paddleSubscriptionId);

    await storage.updateProfileSubscription(userId, {
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      cancelAt: null,
    });

    console.log(`[Subscription] User ${userId} resumed ${profile.paddleSubscriptionId}`);

    res.json({ message: "Subscription resumed. You will not be downgraded." });
  } catch (error) {
    console.error("[Subscription resume] Error:", error);
    res.status(500).json({ message: "Failed to resume subscription. Please try again or contact support." });
  }
});

export default router;
