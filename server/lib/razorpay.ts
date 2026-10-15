/**
 * Minimal Razorpay Subscriptions REST client (server-side), the INR twin of
 * server/lib/paddle.ts. Uses RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET — no SDK.
 * API reference: https://razorpay.com/docs/api/payments/subscriptions/
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { PlanType } from "@shared/schema";

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status:
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "cancelled"
    | "completed"
    | "expired"
    | "paused";
  /** Unix seconds. End of the cycle the customer has paid for. */
  current_end: number | null;
  ended_at: number | null;
  notes: Record<string, string> | [] | null;
};

const BASE_URL = "https://api.razorpay.com/v1";

// Monthly cycles to authorise up front. Razorpay requires a finite count;
// 120 = 10 years, effectively "until cancelled".
const TOTAL_BILLING_CYCLES = 120;

export function isRazorpayConfigured(): boolean {
  return !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_PLAN_PLUS &&
    process.env.RAZORPAY_PLAN_PRO
  );
}

/** Razorpay plan id (plan_...) for one of our paid plans. */
export function getRazorpayPlanId(plan: "plus" | "pro"): string | undefined {
  return plan === "plus" ? process.env.RAZORPAY_PLAN_PLUS : process.env.RAZORPAY_PLAN_PRO;
}

export function getPlanFromRazorpayPlanId(planId: string): PlanType | null {
  if (planId && planId === process.env.RAZORPAY_PLAN_PLUS) return "plus";
  if (planId && planId === process.env.RAZORPAY_PLAN_PRO) return "pro";
  return null;
}

async function razorpayRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
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

export async function createSubscription(params: {
  planId: string;
  userId: string;
  plan: "plus" | "pro";
}): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: params.planId,
    total_count: TOTAL_BILLING_CYCLES,
    quantity: 1,
    customer_notify: 1,
    // Read back by the webhook to find the user, like Paddle's custom_data.
    notes: { user_id: params.userId, plan: params.plan },
  });
}

export async function getSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>("GET", `/subscriptions/${subscriptionId}`);
}

/** Stops renewal; the customer keeps access until current_end. */
export async function cancelSubscriptionAtCycleEnd(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>("POST", `/subscriptions/${subscriptionId}/cancel`, {
    cancel_at_cycle_end: 1,
  });
}

/** user_id we stored in notes at creation, if any. */
export function subscriptionUserId(sub: Pick<RazorpaySubscription, "notes">): string | undefined {
  const notes = sub.notes;
  if (!notes || Array.isArray(notes)) return undefined;
  return notes.user_id;
}

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Signature Checkout hands back after the first payment of a subscription. */
export function verifyCheckoutSignature(params: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(`${params.paymentId}|${params.subscriptionId}`)
    .digest("hex");
  return safeEqualHex(expected, params.signature);
}

/** X-Razorpay-Signature on webhooks: HMAC-SHA256 of the raw body. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
