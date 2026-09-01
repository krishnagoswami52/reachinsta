import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

/**
 * Rate limiters for ReachInsta.
 *
 * NOTES:
 * - The app sits behind Traefik. `app.set("trust proxy", 1)` is configured in
 *   server/replit_integrations/auth/customAuth.ts, so `req.ip` resolves to the
 *   real client IP from X-Forwarded-For. Do NOT remove that setting or every
 *   request will look like it comes from the proxy and share one limit bucket.
 * - The default in-memory store is used. That is correct for a single Node
 *   instance (one Docker container). If you ever scale horizontally, swap in a
 *   shared store (e.g. rate-limit-redis) so limits are enforced across instances.
 * - IP-based limiters intentionally rely on the library's default keyGenerator,
 *   which normalises IPv6 correctly. Custom keyGenerators that return a raw
 *   `req.ip` throw an IPv6 validation error in express-rate-limit v8.
 */

/**
 * Authentication endpoints (login, register).
 * Strict — blunts password spraying / brute force.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many authentication attempts. Try again in 15 minutes.",
    code: "AUTH_RATE_LIMITED",
  },
});

/**
 * Password reset REQUEST endpoint (/forgot-password).
 * Stricter — prevents email bombing / reset-code flooding.
 */
export const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many password reset requests. Try again in 1 hour.",
    code: "RESET_REQUEST_RATE_LIMITED",
  },
});

/**
 * Password reset CODE submission (/reset-password).
 * Network-layer defense against brute-forcing the 6-digit code.
 * Backed up by DB-tracked per-user attempt blocking (see storage.resetPasswordAtomic).
 */
export const passwordResetCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 code attempts per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many code attempts. Try again in 15 minutes.",
    code: "RESET_CODE_RATE_LIMITED",
  },
});

/**
 * /api/fetch (expensive Apify calls). Keyed by authenticated user when
 * available, falling back to client IP. isAuthenticated runs before this
 * limiter, so req.user.claims.sub is populated for logged-in users.
 */
export const fetchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // 2 fetches per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Please wait before triggering another fetch.",
    code: "FETCH_RATE_LIMITED",
  },
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.claims?.sub;
    return userId ?? ipKeyGenerator(req.ip ?? "");
  },
});

/**
 * General API baseline limiter. Generous — only catches egregious abuse / DoS.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests. Slow down.",
    code: "RATE_LIMITED",
  },
});

/**
 * change-password endpoint (already behind auth — extra paranoia).
 */
export const changePasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 password changes per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many password change attempts. Try again later.",
    code: "PASSWORD_CHANGE_RATE_LIMITED",
  },
});

/**
 * Public contact form (POST /api/contact).
 * Unauthenticated and it sends an email on every success, so keep it tight:
 * a real person needs one submission, not three. Matches the
 * passwordResetRequestLimiter budget for the same reason (email bombing).
 */
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 submissions per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many messages sent. Try again in an hour, or email krishna@reachinsta.co directly.",
    code: "CONTACT_RATE_LIMITED",
  },
});
