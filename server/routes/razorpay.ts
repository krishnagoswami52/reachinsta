import { Router, raw } from "express";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { processedWebhookEvents } from "@shared/schema";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  createSubscription,
  getRazorpayPlanId,
  getSubscription,
  isRazorpayConfigured,
  subscriptionUserId,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  type RazorpaySubscription,
} from "../lib/razorpay";
import { applyRazorpaySubscription } from "../services/razorpayBilling";

// Statuses where the user is already paying for a plan, on either gateway.
const SUBSCRIBED_STATUSES = ["active", "canceling", "past_due", "paused"];

// ─── Checkout (JSON routes, mounted after express.json) ──────────────────────

export const razorpayRouter = Router();

/**
 * POST /api/razorpay/subscription  { plan: "plus" | "pro" }
 * Creates a Razorpay subscription for the logged-in user and returns what the
 * browser needs to open Razorpay Checkout on it.
 */
razorpayRouter.post("/api/razorpay/subscription", isAuthenticated, async (req: any, res) => {
  try {
    const userId: string = req.user.claims.sub;
    const plan = req.body?.plan;
    if (plan !== "plus" && plan !== "pro") {
      return res.status(400).json({ message: "Invalid plan" });
    }

    const planId = getRazorpayPlanId(plan);
    if (!isRazorpayConfigured() || !planId) {
      return res.status(503).json({
        message: "Payments in INR aren't available yet. Please try again later.",
        code: "RAZORPAY_NOT_CONFIGURED",
      });
    }

    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // One live subscription per user. Without this a second checkout would
    // start a second recurring charge alongside the first.
    if (profile.plan !== "free" && SUBSCRIBED_STATUSES.includes(profile.subscriptionStatus)) {
      return res.status(409).json({
        message: "You already have a subscription. To switch plans, email krishna@reachinsta.co and we'll move you over.",
        code: "ALREADY_SUBSCRIBED",
      });
    }

    const sub = await createSubscription({ planId, userId, plan });
    console.log(`[Razorpay] Created ${sub.id} for userId=${userId} plan=${plan}`);

    res.json({ subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("[Razorpay] Create subscription error:", error);
    res.status(500).json({ message: "Couldn't start checkout. Please try again." });
  }
});

/**
 * POST /api/razorpay/verify
 * { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
 * Called by Checkout's success handler. Verifies the signature, then applies
 * the subscription right away so the user doesn't wait on the webhook.
 */
razorpayRouter.post("/api/razorpay/verify", isAuthenticated, async (req: any, res) => {
  try {
    const userId: string = req.user.claims.sub;
    const paymentId = req.body?.razorpay_payment_id;
    const subscriptionId = req.body?.razorpay_subscription_id;
    const signature = req.body?.razorpay_signature;

    if (typeof paymentId !== "string" || typeof subscriptionId !== "string" || typeof signature !== "string") {
      return res.status(400).json({ message: "Missing payment details" });
    }

    if (!verifyCheckoutSignature({ paymentId, subscriptionId, signature })) {
      console.warn(`[Razorpay] Checkout signature mismatch for userId=${userId} sub=${subscriptionId}`);
      return res.status(400).json({ message: "Payment could not be verified" });
    }

    const sub = await getSubscription(subscriptionId);
    if (subscriptionUserId(sub) !== userId) {
      console.warn(`[Razorpay] ${subscriptionId} belongs to another user (caller ${userId})`);
      return res.status(403).json({ message: "Subscription does not belong to this account" });
    }

    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // A valid signature means the first payment went through, even if
    // Razorpay hasn't flipped the subscription past "created" yet.
    await applyRazorpaySubscription(profile, {
      ...sub,
      status: sub.status === "created" ? "authenticated" : sub.status,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[Razorpay] Verify error:", error);
    res.status(500).json({ message: "Payment received but activation failed. It will update shortly; contact support if not." });
  }
});

// ─── Webhook (raw body, mounted BEFORE express.json) ─────────────────────────

export const razorpayWebhookRouter = Router();

razorpayWebhookRouter.get("/api/webhooks/razorpay", (_req, res) => {
  res.json({ ok: true, message: "Razorpay webhook endpoint is live" });
});

razorpayWebhookRouter.post("/api/webhooks/razorpay", raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET not set");
    return res.sendStatus(500);
  }

  const signature = req.headers["x-razorpay-signature"] as string | undefined;
  if (!signature) {
    console.warn("[Razorpay Webhook] Missing X-Razorpay-Signature header");
    return res.sendStatus(400);
  }

  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody) || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    console.warn("[Razorpay Webhook] Signature verification failed");
    return res.sendStatus(401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }

  const eventType: string = event.event ?? "";
  const headerEventId = req.headers["x-razorpay-event-id"] as string | undefined;
  // Prefixed so it can never collide with a Paddle event id in the shared table.
  const eventId = headerEventId ? `razorpay:${headerEventId}` : undefined;
  const sub: Pick<RazorpaySubscription, "id" | "status" | "notes"> | undefined = event.payload?.subscription?.entity;
  console.log(`[Razorpay Webhook] ${eventType}`, { eventId, subscriptionId: sub?.id, status: sub?.status });

  // Only subscription events carry state we act on.
  if (!eventType.startsWith("subscription.") || !sub?.id) {
    return res.sendStatus(200);
  }

  if (eventId) {
    const alreadyProcessed = await db
      .select()
      .from(processedWebhookEvents)
      .where(eq(processedWebhookEvents.eventId, eventId))
      .limit(1);
    if (alreadyProcessed.length > 0) {
      console.log(`[Razorpay Webhook] Duplicate event, already processed: ${eventId} (${eventType})`);
      return res.status(200).json({ ok: true, deduped: true });
    }
  }

  try {
    let profile = await storage.getProfileByRazorpaySubscriptionId(sub.id);
    if (!profile) {
      const userId = subscriptionUserId(sub);
      if (userId) profile = await storage.getProfile(userId);
    }

    if (!profile) {
      console.warn("[Razorpay Webhook] Profile not found", { subscriptionId: sub.id });
    } else {
      // Razorpay doesn't guarantee delivery order, so the payload may be older
      // than what we've already applied. Treat the event as a nudge and apply
      // the subscription's live state instead.
      const live = await getSubscription(sub.id);
      await applyRazorpaySubscription(profile, live);
    }

    if (eventId) {
      await db
        .insert(processedWebhookEvents)
        .values({ eventId, eventType })
        .onConflictDoNothing();
    }
  } catch (err) {
    console.error(`[Razorpay Webhook] Handler error for ${eventType} (event_id=${eventId}):`, err);
    // 500 so Razorpay retries; handlers apply absolute state, so a retry is safe.
    return res.status(500).json({ message: "Handler failed, will be retried" });
  }

  return res.sendStatus(200);
});
