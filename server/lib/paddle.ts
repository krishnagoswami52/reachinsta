/**
 * Minimal Paddle Billing REST API client (server-side).
 * Uses PADDLE_API_KEY + PADDLE_ENVIRONMENT from env — no SDK dependency.
 * API reference: https://developer.paddle.com/api-reference/subscriptions
 */

export type PaddleSubscription = {
  id: string;
  status: "active" | "canceled" | "past_due" | "paused" | "trialing";
  scheduled_change: {
    action: "cancel" | "pause" | "resume";
    effective_at: string;
    resume_at: string | null;
  } | null;
  current_billing_period: {
    starts_at: string;
    ends_at: string;
  } | null;
};

function getBaseUrl(): string {
  const env = process.env.PADDLE_ENVIRONMENT ?? "sandbox";
  return env === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

async function paddleRequest<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    throw new Error("PADDLE_API_KEY is not set");
  }

  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = json?.error?.detail ?? json?.error?.code ?? res.statusText;
    throw new Error(`Paddle API ${method} ${path} failed (${res.status}): ${detail}`);
  }

  return json.data as T;
}

/** Schedules a cancel at the end of the current billing period. */
export async function cancelSubscription(subscriptionId: string): Promise<PaddleSubscription> {
  return paddleRequest<PaddleSubscription>(
    "POST",
    `/subscriptions/${subscriptionId}/cancel`,
    { effective_from: "next_billing_period" },
  );
}

/** Removes a scheduled cancel (resume before period end). */
export async function removeScheduledCancel(subscriptionId: string): Promise<PaddleSubscription> {
  return paddleRequest<PaddleSubscription>(
    "PATCH",
    `/subscriptions/${subscriptionId}`,
    { scheduled_change: null },
  );
}

export async function getSubscription(subscriptionId: string): Promise<PaddleSubscription> {
  return paddleRequest<PaddleSubscription>("GET", `/subscriptions/${subscriptionId}`);
}
