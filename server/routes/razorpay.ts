import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { hasLiveSubscription } from "@shared/subscription";
import {
  cancelScheduledChanges,
  cancelSubscriptionAtCycleEnd,
  createSubscription,
  getNote,
  getRazorpayPlanId,
  getSubscription,
  unixToDate,
  verifyCheckoutSignature,
} from "../lib/razorpay";
import { applyRazorpaySubscription } from "./razorpayWebhook";

const router = Router();

/**
 * POST /api/razorpay/create-subscription  { planId: "plus" | "pro" }
 * Creates a Razorpay subscription for the checkout modal to authorise.
 * The publishable key ID is returned with it, so the client needs no
 * build-time Razorpay env var.
 */
router.post("/api/razorpay/create-subscription", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const planId = req.body?.planId;

    if (planId !== "plus" && planId !== "pro") {
      return res.status(400).json({ message: "Invalid plan", code: "INVALID_PLAN" });
    }

    const razorpayPlanId = getRazorpayPlanId(planId);
    if (!razorpayPlanId || !process.env.RAZORPAY_KEY_ID) {
      console.error("[Razorpay] RAZORPAY_PLAN_PLUS / RAZORPAY_PLAN_PRO / RAZORPAY_KEY_ID not set");
      return res.status(503).json({ message: "INR checkout is temporarily unavailable." });
    }

    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (hasLiveSubscription(profile)) {
      return res.status(409).json({
        message: "You already have an active subscription. Manage it from the Billing page.",
        code: "ALREADY_SUBSCRIBED",
      });
    }

    const sub = await createSubscription(razorpayPlanId, { user_id: userId, plan: planId });
    console.log(`[Razorpay] Created ${sub.id} for userId=${userId} plan=${planId}`);

    res.json({ subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("[Razorpay create-subscription] Error:", error);
    res.status(500).json({ message: "Couldn't start checkout. Please try again." });
  }
});

/**
 * POST /api/razorpay/verify-payment
 *   { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
 * Called by the checkout success handler so the plan unlocks immediately
 * instead of waiting for the webhook. The webhook applies the same state, so
 * whichever lands second is a no-op.
 */
router.post("/api/razorpay/verify-payment", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body ?? {};

    if (
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_subscription_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    if (!verifyCheckoutSignature(razorpay_payment_id, razorpay_subscription_id, razorpay_signature)) {
      console.warn(`[Razorpay] Bad checkout signature from userId=${userId} for ${razorpay_subscription_id}`);
      return res.status(401).json({ message: "Payment verification failed", code: "BAD_SIGNATURE" });
    }

    const sub = await getSubscription(razorpay_subscription_id);

    // The signature proves Razorpay issued this payment, not that it belongs
    // to the caller — check the owner we stamped at creation.
    if (getNote(sub, "user_id") !== userId) {
      console.warn(`[Razorpay] userId=${userId} tried to claim ${sub.id} owned by ${getNote(sub, "user_id")}`);
      return res.status(403).json({ message: "This payment belongs to a different account" });
    }

    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    await applyRazorpaySubscription(profile, sub);

    const updated = await storage.getProfile(userId);
    res.json({ status: "success", plan: updated?.plan, subscriptionStatus: updated?.subscriptionStatus });
  } catch (error) {
    console.error("[Razorpay verify-payment] Error:", error);
    res.status(500).json({
      message: "We couldn't confirm your payment yet. If you were charged, your plan will update within a few minutes.",
    });
  }
});

/**
 * POST /api/razorpay/cancel-subscription
 * Schedules cancellation at the end of the current cycle. User keeps paid
 * access until then; the daily cron (or the subscription.cancelled webhook)
 * downgrades after.
 */
router.post("/api/razorpay/cancel-subscription", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;

    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (profile.paymentProvider !== "razorpay" || !profile.razorpaySubscriptionId) {
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

    const sub = await cancelSubscriptionAtCycleEnd(profile.razorpaySubscriptionId);
    const cancelAt = unixToDate(sub.current_end) ?? profile.currentPeriodEnd;

    await storage.updateProfileSubscription(userId, {
      subscriptionStatus: "canceling",
      cancelAtPeriodEnd: true,
      cancelAt,
    });

    console.log(`[Razorpay] User ${userId} canceled ${profile.razorpaySubscriptionId}, access until ${cancelAt?.toISOString()}`);

    res.json({
      message: "Subscription canceled. You keep access until the end of your billing period.",
      cancelAt,
    });
  } catch (error) {
    console.error("[Razorpay cancel-subscription] Error:", error);
    res.status(500).json({ message: "Failed to cancel subscription. Please try again or contact support." });
  }
});

/**
 * POST /api/razorpay/resume-subscription
 * Tries to remove a scheduled cycle-end cancel. Razorpay doesn't document
 * whether that's possible, so a rejection is reported to the user as
 * "can't be resumed" rather than a generic failure.
 */
router.post("/api/razorpay/resume-subscription", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;

    const profile = await storage.getProfile(userId);
    if (profile?.paymentProvider !== "razorpay" || !profile.razorpaySubscriptionId) {
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

    try {
      await cancelScheduledChanges(profile.razorpaySubscriptionId);
    } catch (err) {
      console.warn(`[Razorpay] Resume rejected for ${profile.razorpaySubscriptionId}:`, err);
      return res.status(409).json({
        message: "This subscription can't be resumed. You keep access until the end of your billing period and can subscribe again after that.",
        code: "RESUME_UNSUPPORTED",
      });
    }

    const sub = await getSubscription(profile.razorpaySubscriptionId);
    if (sub.status !== "active" && sub.status !== "authenticated") {
      return res.status(409).json({
        message: "This subscription can't be resumed. You can subscribe again once it ends.",
        code: "RESUME_UNSUPPORTED",
      });
    }

    await storage.updateProfileSubscription(userId, {
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      cancelAt: null,
      currentPeriodEnd: unixToDate(sub.current_end) ?? profile.currentPeriodEnd,
    });

    console.log(`[Razorpay] User ${userId} resumed ${profile.razorpaySubscriptionId}`);

    res.json({ message: "Subscription resumed. You will not be downgraded." });
  } catch (error) {
    console.error("[Razorpay resume-subscription] Error:", error);
    res.status(500).json({ message: "Failed to resume subscription. Please try again or contact support." });
  }
});

export default router;
