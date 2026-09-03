/**
 * Cloudflare Turnstile server-side validation.
 * Uses TURNSTILE_SECRET_KEY from env — no SDK dependency.
 * API reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * This is an ADDITIONAL bot-detection layer in front of registration. It does
 * not replace email verification or the per-IP rate limiters, both of which
 * still run.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cap the outbound call. Without this a hung siteverify request holds the
 * registration request open for as long as Node's default socket timeout,
 * and the user sees a spinner rather than an error they can act on.
 */
const VERIFY_TIMEOUT_MS = 10_000;

export type TurnstileFailureCode = "TURNSTILE_FAILED" | "TURNSTILE_EXPIRED";

export type TurnstileResult =
  | { success: true }
  | { success: false; code: TurnstileFailureCode };

type SiteverifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  challenge_ts?: string;
};

/**
 * "This token was valid once, but is no longer usable" — a signup page left
 * open past the 300-second token lifetime, or a retry that reused a token an
 * earlier attempt already spent. Cloudflare reports both as one code.
 *
 * Worth separating from an outright forgery: the user did nothing wrong and
 * only needs a fresh challenge, so the client resets the widget and says so
 * rather than telling them verification "failed".
 */
const EXPIRED_CODES = new Set(["timeout-or-duplicate"]);

export function isTurnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

/**
 * Verify a Turnstile token with Cloudflare.
 *
 * Fails CLOSED: a network error, a timeout, or a malformed response all reject
 * the signup. The whole point of the check is that it cannot be skipped by
 * making it fail, and registration is not so time-critical that degrading open
 * is worth the hole.
 *
 * The one deliberate exception is local development with no secret configured,
 * where failing closed would make it impossible to sign up at all. Production
 * never takes that path — a missing secret there rejects every registration,
 * which is why server/index.ts logs turnstile in its startup env check.
 *
 * @param remoteIp The client IP as resolved by Express (`trust proxy` is set to
 *   1, so this is the real client address, not Traefik's). Optional per the API,
 *   and passed through as-is; a null just omits it.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Turnstile] TURNSTILE_SECRET_KEY not configured — rejecting registration");
      return { success: false, code: "TURNSTILE_FAILED" };
    }
    console.warn("[Turnstile] TURNSTILE_SECRET_KEY not set — skipping verification (development only)");
    return { success: true };
  }

  if (!token) {
    console.warn("[Turnstile] Missing token on registration attempt");
    return { success: false, code: "TURNSTILE_FAILED" };
  }

  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token);
  if (remoteIp) form.append("remoteip", remoteIp);

  let data: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[Turnstile] siteverify returned HTTP ${res.status}`);
      return { success: false, code: "TURNSTILE_FAILED" };
    }

    data = (await res.json()) as SiteverifyResponse;
  } catch (error) {
    console.error("[Turnstile] siteverify request failed:", error);
    return { success: false, code: "TURNSTILE_FAILED" };
  }

  if (!data.success) {
    const codes = data["error-codes"] ?? [];
    console.warn("[Turnstile] Verification failed:", codes);

    // A bad secret is our misconfiguration, not a bot. Log it loudly — it
    // otherwise looks identical to every real user suddenly failing the check.
    if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
      console.error("[Turnstile] TURNSTILE_SECRET_KEY is invalid — check the dashboard key pair");
    }

    if (codes.some((c) => EXPIRED_CODES.has(c))) {
      return { success: false, code: "TURNSTILE_EXPIRED" };
    }
    return { success: false, code: "TURNSTILE_FAILED" };
  }

  return { success: true };
}
