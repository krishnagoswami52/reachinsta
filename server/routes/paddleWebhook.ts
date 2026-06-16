import { Router, raw } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { processedWebhookEvents } from "@shared/schema";
import type { PlanType } from "@shared/schema";

// Reject events whose signature timestamp is more than this far from now (in
// either direction). Blunts replay of captured webhook payloads.
const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

const router = Router();

// ─── Signature verification ──────────────────────────────────────────────────

function verifyPaddleSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  try {
    // Header format: "ts=1234567890;h1=<hex>"
    const parts = Object.fromEntries(
      signatureHeader.split(";").map((p) => p.split("=") as [string, string]),
    );
    const { ts, h1 } = parts;
    if (!ts || !h1) return false;

    const signedPayload = `${ts}:${rawBody.toString("utf8")}`;
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(h1, "hex");
    if (expectedBuf.length !== actualBuf.length) return false;

    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

// ─── Plan ID → PlanType mapping (server-side) ────────────────────────────────

function getPlanFromPriceId(priceId: string): PlanType | null {
  const plusPrice = process.env.VITE_PADDLE_PRICE_PLUS;
  const proPrice = process.env.VITE_PADDLE_PRICE_PRO;
  if (plusPrice && priceId === plusPrice) return "plus";
  if (proPrice && priceId === proPrice) return "pro";
  return null;
}

// ─── Profile lookup helper ────────────────────────────────────────────────────

async function resolveProfile(customerId: string, customData: any) {
  // Primary: look up by Paddle customer ID (already stored from a previous event)
  let profile = await storage.getProfileByPaddleCustomerId(customerId);
  if (profile) return profile;

  // Fallback: use user_id from customData (set during checkout.open)
  const userId: string | undefined = customData?.user_id;
  if (userId) {
    profile = await storage.getProfile(userId);
  }
  return profile;
}

// ─── Health-check GET ─────────────────────────────────────────────────────────

router.get("/api/webhooks/paddle", (_req, res) => {
  res.json({ ok: true, message: "Paddle webhook endpoint is live" });
});

// ─── Webhook POST ─────────────────────────────────────────────────────────────

router.post("/api/webhooks/paddle", raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Paddle Webhook] PADDLE_WEBHOOK_SECRET not set");
    return res.sendStatus(500);
  }

  const signatureHeader = req.headers["paddle-signature"] as string | undefined;
  if (!signatureHeader) {
    console.warn("[Paddle Webhook] Missing Paddle-Signature header");
    return res.sendStatus(400);
  }

  const rawBody = req.body as Buffer;

  if (!verifyPaddleSignature(rawBody, signatureHeader, webhookSecret)) {
    console.warn("[Paddle Webhook] Signature verification failed");
    return res.sendStatus(401);
  }

  // Timestamp freshness — the `ts` in the (already-verified) signature header is
  // the value Paddle signed, so it can't be forged. Reject anything outside the
  // tolerance window to defeat replay of a captured payload.
  const sigTs = Object.fromEntries(
    signatureHeader.split(";").map((p) => p.split("=") as [string, string]),
  ).ts;
  const eventTimestamp = parseInt(sigTs ?? "", 10);
  if (!Number.isFinite(eventTimestamp)) {
    console.warn("[Paddle Webhook] Missing/invalid signature timestamp");
    return res.sendStatus(400);
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - eventTimestamp;
  if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) {
    console.warn(`[Paddle Webhook] Rejecting stale event: age=${ageSeconds}s`);
    return res.status(401).json({ message: "Webhook timestamp too old" });
  }
  if (ageSeconds < -TIMESTAMP_TOLERANCE_SECONDS) {
    console.warn(`[Paddle Webhook] Rejecting future event: age=${ageSeconds}s`);
    return res.status(401).json({ message: "Webhook timestamp in future" });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }

  const eventType: string = event.event_type ?? event.type ?? "";
  const eventId: string | undefined = event.event_id;
  const data = event.data ?? {};
  console.log(`[Paddle Webhook] ${eventType}`, { eventId, subscriptionId: data.id, customerId: data.customer_id });

  // Idempotency — skip events we've already applied (Paddle retries / replays).
  if (eventId) {
    const alreadyProcessed = await db
      .select()
      .from(processedWebhookEvents)
      .where(eq(processedWebhookEvents.eventId, eventId))
      .limit(1);
    if (alreadyProcessed.length > 0) {
      console.log(`[Paddle Webhook] Duplicate event, already processed: ${eventId} (${eventType})`);
      return res.status(200).json({ ok: true, deduped: true });
    }
  } else {
    console.warn(`[Paddle Webhook] Event has no event_id (${eventType}); processing without dedup`);
  }

  try {
    await handlePaddleEvent(eventType, data);

    // Record only after the handler actually completed. onConflictDoNothing
    // covers the race where two copies of the same event pass the SELECT above.
    if (eventId) {
      await db
        .insert(processedWebhookEvents)
        .values({ eventId, eventType })
        .onConflictDoNothing();
    }
  } catch (err) {
    console.error(`[Paddle Webhook] Handler error for ${eventType} (event_id=${eventId}):`, err);
    // Return 500 so Paddle retries per its schedule, instead of silently
    // dropping the event. Handlers apply absolute state, so a retry is safe.
    return res.status(500).json({ message: "Handler failed, will be retried" });
  }

  return res.sendStatus(200);
});

// ─── Event dispatcher ─────────────────────────────────────────────────────────

async function handlePaddleEvent(eventType: string, data: any) {
  switch (eventType) {
    case "subscription.activated":
    case "subscription.created":
      await handleSubscriptionActivated(data);
      break;

    case "subscription.updated":
      await handleSubscriptionUpdated(data);
      break;

    case "subscription.canceled":
      await handleSubscriptionCanceled(data);
      break;

    case "subscription.paused":
      await handleSubscriptionPaused(data);
      break;

    case "subscription.resumed":
      await handleSubscriptionResumed(data);
      break;

    case "transaction.completed":
      // Payment received — ensure plan is active (handles failed→recovered path)
      await handleTransactionCompleted(data);
      break;

    default:
      // Unhandled event — ignore silently
      break;
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleSubscriptionActivated(data: any) {
  const profile = await resolveProfile(data.customer_id, data.custom_data);
  if (!profile) {
    console.warn("[Paddle Webhook] subscription.activated: profile not found", { customerId: data.customer_id });
    return;
  }

  const priceId: string = data.items?.[0]?.price?.id ?? "";
  const plan = getPlanFromPriceId(priceId) ?? "free";
  const periodEnd = data.current_billing_period?.ends_at
    ? new Date(data.current_billing_period.ends_at)
    : null;

  await storage.updateProfileSubscription(profile.id, {
    paddleCustomerId: data.customer_id,
    paddleSubscriptionId: data.id,
    subscriptionStatus: "active",
    plan,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    cancelAt: null,
  });

  console.log(`[Paddle Webhook] Activated → userId=${profile.id} plan=${plan}`);
}

async function handleSubscriptionUpdated(data: any) {
  const profile = await resolveProfile(data.customer_id, data.custom_data);
  if (!profile) {
    console.warn("[Paddle Webhook] subscription.updated: profile not found", { customerId: data.customer_id });
    return;
  }

  const priceId: string = data.items?.[0]?.price?.id ?? "";
  const plan = getPlanFromPriceId(priceId);
  const periodEnd = data.current_billing_period?.ends_at
    ? new Date(data.current_billing_period.ends_at)
    : undefined;

  // A scheduled cancel means the user keeps paid access until effective_at —
  // mark as "canceling" so the cron can downgrade once that date passes
  const cancelScheduled = data.scheduled_change?.action === "cancel";

  if (data.status === "canceled") {
    // Paddle reports canceled via subscription.updated too — same path as subscription.canceled
    await applyCanceledState(profile.id, data);
    return;
  }

  // Map Paddle status → our status
  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    paused: "paused",
    trialing: "active",
  };
  const subscriptionStatus = cancelScheduled ? "canceling" : (statusMap[data.status] ?? "active");

  await storage.updateProfileSubscription(profile.id, {
    paddleCustomerId: data.customer_id,
    paddleSubscriptionId: data.id,
    subscriptionStatus,
    ...(plan ? { plan } : {}),
    ...(periodEnd !== undefined ? { currentPeriodEnd: periodEnd } : {}),
    cancelAtPeriodEnd: cancelScheduled,
    cancelAt: cancelScheduled && data.scheduled_change?.effective_at
      ? new Date(data.scheduled_change.effective_at)
      : null,
  });

  console.log(`[Paddle Webhook] Updated → userId=${profile.id} status=${subscriptionStatus} plan=${plan ?? "unchanged"}`);
}

async function handleSubscriptionCanceled(data: any) {
  const profile = await resolveProfile(data.customer_id, data.custom_data);
  if (!profile) {
    console.warn("[Paddle Webhook] subscription.canceled: profile not found", { customerId: data.customer_id });
    return;
  }

  await applyCanceledState(profile.id, data);
}

/**
 * Shared logic for a subscription reported as canceled (via subscription.canceled
 * OR subscription.updated with status=canceled).
 *
 * - Period already over (or unknown) → downgrade to free immediately.
 * - Period still running (immediate-cancel edge case) → mark "canceling" so the
 *   daily cron downgrades once the period ends. User keeps what they paid for.
 */
async function applyCanceledState(userId: string, data: any) {
  const periodEnd = data.current_billing_period?.ends_at
    ? new Date(data.current_billing_period.ends_at)
    : null;
  const now = new Date();

  if (!periodEnd || periodEnd <= now) {
    await storage.updateProfileSubscription(userId, {
      plan: "free",
      subscriptionStatus: "canceled",
      paddleSubscriptionId: null,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      currentPeriodEnd: null,
    });
    console.log(`[Paddle Webhook] Canceled → userId=${userId} downgraded to free (period ended)`);
  } else {
    await storage.updateProfileSubscription(userId, {
      subscriptionStatus: "canceling",
      cancelAtPeriodEnd: true,
      cancelAt: periodEnd,
      currentPeriodEnd: periodEnd,
    });
    console.log(`[Paddle Webhook] Canceled → userId=${userId} accessUntil=${periodEnd.toISOString()}`);
  }
}

async function handleSubscriptionPaused(data: any) {
  const profile = await resolveProfile(data.customer_id, data.custom_data);
  if (!profile) return;

  await storage.updateProfileSubscription(profile.id, {
    subscriptionStatus: "paused",
    cancelAtPeriodEnd: false,
    cancelAt: null,
  });

  console.log(`[Paddle Webhook] Paused → userId=${profile.id}`);
}

async function handleSubscriptionResumed(data: any) {
  const profile = await resolveProfile(data.customer_id, data.custom_data);
  if (!profile) return;

  const periodEnd = data.current_billing_period?.ends_at
    ? new Date(data.current_billing_period.ends_at)
    : null;

  await storage.updateProfileSubscription(profile.id, {
    subscriptionStatus: "active",
    cancelAtPeriodEnd: false,
    cancelAt: null,
    currentPeriodEnd: periodEnd,
  });

  console.log(`[Paddle Webhook] Resumed → userId=${profile.id}`);
}

async function handleTransactionCompleted(data: any) {
  // Only handle subscription-related transactions
  const subscriptionId: string | undefined = data.subscription_id;
  if (!subscriptionId) return;

  const customerId: string = data.customer_id;
  const profile = await resolveProfile(customerId, data.custom_data);
  if (!profile) return;

  // Re-activate in case the subscription was past_due
  if (profile.subscriptionStatus === "past_due") {
    await storage.updateProfileSubscription(profile.id, {
      subscriptionStatus: "active",
    });
    console.log(`[Paddle Webhook] Transaction recovered past_due → userId=${profile.id}`);
  }
}

export default router;
