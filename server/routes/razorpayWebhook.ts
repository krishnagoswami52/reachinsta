import { Router, raw } from "express";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { processedWebhookEvents } from "@shared/schema";
import type { Profile } from "@shared/schema";
import {
  getNote,
  getPlanFromRazorpayPlanId,
  getSubscription,
  unixToDate,
  verifyWebhookSignature,
  type RazorpaySubscription,
} from "../lib/razorpay";

// Razorpay retries failed deliveries for up to 24h and does not sign a
// timestamp, so there is no freshness window here (unlike Paddle). Replays are
// stopped by the event-ID dedup against processed_webhook_events instead.

const router = Router();

// ─── Profile lookup helper ────────────────────────────────────────────────────

async function resolveProfile(sub: RazorpaySubscription): Promise<Profile | undefined> {
  // Primary: the subscription ID we stored at checkout verification.
  const profile = await storage.getProfileByRazorpaySubscriptionId(sub.id);
  if (profile) return profile;

  // Fallback: user_id written into notes by /api/razorpay/create-subscription.
  // Covers a webhook that lands before the checkout handler's verify call.
  const userId = getNote(sub, "user_id");
  return userId ? storage.getProfile(userId) : undefined;
}

// ─── State sync (shared with the checkout verify endpoint) ────────────────────

/**
 * Writes a Razorpay subscription's current state onto the profile. Always fed
 * a freshly fetched subscription, never the webhook snapshot, so events that
 * arrive out of order or late can't roll the profile back.
 */
export async function applyRazorpaySubscription(profile: Profile, sub: RazorpaySubscription) {
  // An event for an older subscription (e.g. the cancel of a sub the user
  // replaced) must not touch the current one.
  if (profile.razorpaySubscriptionId && profile.razorpaySubscriptionId !== sub.id) {
    console.log(`[Razorpay] Ignoring ${sub.id} (${sub.status}) — userId=${profile.id} is on ${profile.razorpaySubscriptionId}`);
    return;
  }

  const periodEnd = unixToDate(sub.current_end);

  switch (sub.status) {
    case "authenticated":
    case "active": {
      const plan = getPlanFromRazorpayPlanId(sub.plan_id);
      if (!plan) {
        // Never grant a plan from notes alone — they're set by our server but
        // a plan ID we don't recognise means env and dashboard disagree.
        console.error(`[Razorpay] Unknown plan_id ${sub.plan_id} on ${sub.id}; profile not updated`);
        return;
      }
      if (profile.subscriptionStatus === "active" && profile.paddleSubscriptionId) {
        console.error(`[Razorpay] DOUBLE SUBSCRIPTION userId=${profile.id}: Paddle ${profile.paddleSubscriptionId} + Razorpay ${sub.id}`);
      }
      // A cancel the user scheduled keeps the sub "active" at Razorpay until
      // the cycle ends — don't let a later sync flip it back to active here.
      const stillCanceling =
        profile.subscriptionStatus === "canceling" && profile.razorpaySubscriptionId === sub.id;

      await storage.updateProfileSubscription(profile.id, {
        paymentProvider: "razorpay",
        razorpaySubscriptionId: sub.id,
        plan,
        currentPeriodEnd: periodEnd,
        ...(stillCanceling
          ? {}
          : { subscriptionStatus: "active", cancelAtPeriodEnd: false, cancelAt: null }),
      });
      console.log(`[Razorpay] Active → userId=${profile.id} plan=${plan}${stillCanceling ? " (cancel still scheduled)" : ""}`);
      return;
    }

    case "pending":
      // A renewal charge failed; Razorpay is retrying. Keep access meanwhile.
      await storage.updateProfileSubscription(profile.id, { subscriptionStatus: "past_due" });
      console.log(`[Razorpay] Pending → userId=${profile.id} past_due`);
      return;

    case "halted":
      // Retries exhausted, Razorpay stopped charging. Access runs to the end
      // of the last paid cycle, then the daily cron downgrades. If the
      // customer fixes payment, Razorpay re-activates and the case above runs.
      await storage.updateProfileSubscription(profile.id, {
        subscriptionStatus: "canceling",
        cancelAtPeriodEnd: true,
        cancelAt: periodEnd ?? new Date(),
      });
      console.log(`[Razorpay] Halted → userId=${profile.id} accessUntil=${(periodEnd ?? new Date()).toISOString()}`);
      return;

    case "cancelled":
    case "completed":
    case "expired":
      await applyCanceledState(profile.id, periodEnd);
      return;

    case "paused":
      await storage.updateProfileSubscription(profile.id, {
        subscriptionStatus: "paused",
        cancelAtPeriodEnd: false,
        cancelAt: null,
      });
      console.log(`[Razorpay] Paused → userId=${profile.id}`);
      return;

    case "created":
      // Checkout opened but never paid — nothing to record.
      return;
  }
}

/**
 * Same rule as the Paddle webhook: period already over → downgrade now;
 * period still running → "canceling" and the daily cron downgrades later.
 */
async function applyCanceledState(userId: string, periodEnd: Date | null) {
  if (!periodEnd || periodEnd <= new Date()) {
    await storage.updateProfileSubscription(userId, {
      plan: "free",
      subscriptionStatus: "canceled",
      paymentProvider: null,
      razorpaySubscriptionId: null,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      currentPeriodEnd: null,
    });
    console.log(`[Razorpay] Canceled → userId=${userId} downgraded to free (period ended)`);
  } else {
    await storage.updateProfileSubscription(userId, {
      subscriptionStatus: "canceling",
      cancelAtPeriodEnd: true,
      cancelAt: periodEnd,
      currentPeriodEnd: periodEnd,
    });
    console.log(`[Razorpay] Canceled → userId=${userId} accessUntil=${periodEnd.toISOString()}`);
  }
}

// ─── Health-check GET ─────────────────────────────────────────────────────────

router.get("/api/webhooks/razorpay", (_req, res) => {
  res.json({ ok: true, message: "Razorpay webhook endpoint is live" });
});

// ─── Webhook POST ─────────────────────────────────────────────────────────────

router.post("/api/webhooks/razorpay", raw({ type: "application/json" }), async (req, res) => {
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
  const eventId = req.headers["x-razorpay-event-id"] as string | undefined;
  const snapshot: RazorpaySubscription | undefined = event.payload?.subscription?.entity;
  console.log(`[Razorpay Webhook] ${eventType}`, { eventId, subscriptionId: snapshot?.id });

  // Only subscription events change plan state; payment.*, order.* etc. are acked and ignored.
  if (!eventType.startsWith("subscription.") || !snapshot?.id) {
    return res.sendStatus(200);
  }

  // Idempotency — Razorpay redelivers on any non-2xx and on timeouts.
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
  } else {
    console.warn(`[Razorpay Webhook] Event has no x-razorpay-event-id (${eventType}); processing without dedup`);
  }

  try {
    const profile = await resolveProfile(snapshot);
    if (!profile) {
      console.warn(`[Razorpay Webhook] ${eventType}: profile not found`, { subscriptionId: snapshot.id });
    } else {
      // Fetch current state rather than trusting the (possibly stale) snapshot.
      const sub = await getSubscription(snapshot.id);
      await applyRazorpaySubscription(profile, sub);
    }

    if (eventId) {
      await db
        .insert(processedWebhookEvents)
        .values({ eventId, eventType })
        .onConflictDoNothing();
    }
  } catch (err) {
    console.error(`[Razorpay Webhook] Handler error for ${eventType} (event_id=${eventId}):`, err);
    // 500 → Razorpay retries. Handlers apply absolute state, so a retry is safe.
    return res.status(500).json({ message: "Handler failed, will be retried" });
  }

  return res.sendStatus(200);
});

export default router;
