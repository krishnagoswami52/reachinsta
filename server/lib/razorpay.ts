/**
 * Minimal Razorpay Subscriptions REST client (server-side).
 * Uses RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET from env — no SDK dependency,
 * same approach as server/lib/paddle.ts. Test vs live is decided by the key
 * pair itself (rzp_test_… / rzp_live_…), so there is no environment switch.
 * API reference: https://razorpay.com/docs/api/payments/subscriptions/
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { PlanType } from "@shared/schema";

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status:
    | "created" | "authenticated" | "active" | "pending" | "halted"
    | "cancelled" | "completed" | "expired" | "paused";
  current_start: number | null; // unix seconds
  current_end: number | null;   // unix seconds
  ended_at: number | null;
  has_scheduled_changes: boolean;
  change_scheduled_at: number | null;
  notes: Record<string, string> | [] | null;
};

const BASE_URL = "https://api.razorpay.com/v1";

// Customer-facing subscriptions run for this many monthly cycles. Razorpay
// requires a finite count; 120 (10 years) behaves as open-ended in practice.
const TOTAL_BILLING_CYCLES = 120;

async function razorpayRequest<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = json?.error?.description ?? json?.error?.code ?? res.statusText;
    throw new Error(`Razorpay API ${method} ${path} failed (${res.status}): ${detail}`);
  }

  return json as T;
}

// ─── Plan ID ↔ PlanType ───────────────────────────────────────────────────────

export function getRazorpayPlanId(plan: "plus" | "pro"): string | undefined {
  return plan === "plus" ? process.env.RAZORPAY_PLAN_PLUS : process.env.RAZORPAY_PLAN_PRO;
}

export function getPlanFromRazorpayPlanId(planId: string): PlanType | null {
  if (planId && planId === process.env.RAZORPAY_PLAN_PLUS) return "plus";
  if (planId && planId === process.env.RAZORPAY_PLAN_PRO) return "pro";
  return null;
}

/** notes come back as [] when empty, so normalise before reading. */
export function getNote(sub: RazorpaySubscription, key: string): string | undefined {
  const notes = sub.notes;
  return notes && !Array.isArray(notes) ? notes[key] : undefined;
}

// ─── Signatures ───────────────────────────────────────────────────────────────

function safeEqualHex(expectedHex: string, actualHex: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    if (expected.length === 0 || expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Checkout handler signature: HMAC-SHA256(key_secret, "<payment_id>|<subscription_id>"). */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(webhook_secret, <raw request body>). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function createSubscription(
  planId: string,
  notes: { user_id: string; plan: "plus" | "pro" },
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: planId,
    total_count: TOTAL_BILLING_CYCLES,
    customer_notify: 1,
    notes,
  });
}

export async function getSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>("GET", `/subscriptions/${subscriptionId}`);
}

/** Schedules a cancel at the end of the current billing cycle. */
export async function cancelSubscriptionAtCycleEnd(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "POST",
    `/subscriptions/${subscriptionId}/cancel`,
    { cancel_at_cycle_end: 1 },
  );
}

export function unixToDate(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}
