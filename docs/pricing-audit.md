# Pricing Audit — Razorpay + price drop (Phase 1)

Date: 2026-10-19 · Branch: `feat/razorpay-pricing-update` (from `main` @ 64fe066)

## 1. Every place a price is shown or used

| # | File | Line | What | Reads `PLANS`? |
|---|------|------|------|----------------|
| 1 | `client/src/lib/plans.ts` | 15, 29 | `price: 49` / `price: 99` — the existing source of truth | — |
| 2 | `client/src/components/PricingSection.tsx` | 86 | `${plan.price}/month` (used by `/pricing`) | yes |
| 3 | `client/src/pages/billing.tsx` | 162 | `${plan.price}` current-plan card | yes |
| 4 | `client/src/pages/landing.tsx` | 301, 322, 340 | `$0`, `$49`, `$99` hardcoded | **no** |
| 5 | `client/src/pages/landing.tsx` | 305-308, 326-329, 344-347 | feature lists (5/50/100 competitors, 7/14/28 days, 1/2/4 fetches) hardcoded | **no** |
| 6 | `client/src/pages/profile.tsx` | 308 | `"$0" / "$49" / "$99"` hardcoded | **no** |
| 7 | `client/src/pages/profile.tsx` | 312-314 | feature lists hardcoded | **no** |
| 8 | `client/src/pages/terms.tsx` | 104 | "Free ($0), Plus ($49/mo), and Pro ($99/mo)" + "provider acts as merchant of record" | no (legal copy) |
| 9 | `client/src/pages/refund.tsx` | 103-104 | "Plus ($49/mo)", "Pro ($99/mo)" | no (legal copy) |
| 10 | `client/src/pages/admin-metrics.tsx` | 332 | Copy: "MRR uses … Plus $49/mo, Pro $99/mo" | no |
| 11 | `server/routes/admin.ts` | 21 | `PLAN_MRR = { plus: 49, pro: 99 }` — MRR calculation | no (server) |

Not found: `dashboard.tsx` has **no** price (its upgrade nudge already reads competitors/days from `PLANS`). No email template mentions a price. `shared/schema.ts` does not validate prices (only feature limits in `planLimits`). Excluded false positives: `terms.tsx:137` ("99% uptime"), `server/services/apifyAccount.ts` (Apify's own plans).

## 2. What actually decides the amount charged

The UI number is only a label. **Paddle charges whatever is on the price object** referenced by `VITE_PADDLE_PRICE_PLUS` / `VITE_PADDLE_PRICE_PRO`. Changing `plans.ts` to `$15` without changing those prices in Paddle means checkout still charges $49/$99. Options: create new $15/$29 prices in Paddle and swap the env vars (build-time `VITE_` vars → Dockerfile ARG + GitHub secret, not the VPS `.env`), or edit the existing prices' amounts in the Paddle dashboard. The server also maps price IDs → plan via the same env vars (`server/routes/paddleWebhook.ts:41`), so a swap must update both.

## 3. Current Paddle/billing architecture (what Razorpay must fit into)

- **Auth**: `isAuthenticated` from `server/replit_integrations/auth`; user ID is `req.user.claims.sub`. There is no `requireAuth` / `req.user.id` as the spec assumes.
- **Profile writes**: go through `storage.updateProfileSubscription()`, which also resets the derived limit columns (`maxCompetitors`, `monthlyFetchLimit`, `timeRangeMaxDays`, `csvExport`). The spec's direct `db.update(profiles).set({ plan })` would change the plan but **leave the limits at Free values**.
- **Status values**: `free | active | canceling | past_due | canceled | paused`. The spec writes `'cancelled'` (two L's), which isn't a valid status, and treats Razorpay's `subscription.cancelled` as immediate, whereas our model is `canceling` + `cancelAt`, with the daily cron (`server/jobs/downgrade-expired.ts`) doing the downgrade.
- **Webhook pattern**: the Paddle router is mounted **before** `express.json()` and uses `express.raw()` so the HMAC is computed over the exact bytes, with `timingSafeEqual` and replay protection via `processed_webhook_events`. The spec's Razorpay handler HMACs `JSON.stringify(req.body)` (re-serialised, so it won't match reliably) and uses `!==` compare. It should copy the Paddle pattern and dedupe on Razorpay's `x-razorpay-event-id` header.
- **Cancel/resume**: `/api/subscription/cancel|resume` and the billing page only know about `paddleSubscriptionId`. Razorpay subscribers would have no way to cancel from the app unless these branch on the provider.
- **Cron**: the downgrade job clears `paddleSubscriptionId` only; needs to clear the Razorpay ID too.
- **Schema changes**: the repo uses `drizzle-kit push` (no migration files). Per earlier notes, the local `.env` points at the production DB, so the two new columns (`payment_provider`, `razorpay_subscription_id`) would be pushed straight to prod. Both are nullable, so it's safe, but it is still a prod change.
- **CSP**: no Content-Security-Policy is set, so the Razorpay `checkout.js` script tag won't be blocked.
- **`razorpay` npm package**: not installed yet.

## 4. Razorpay credentials check

| Var | State |
|-----|-------|
| `RAZORPAY_KEY_ID` / `VITE_RAZORPAY_KEY_ID` | set, `rzp_test_…`, authenticates OK |
| `RAZORPAY_KEY_SECRET` | set |
| `RAZORPAY_WEBHOOK_SECRET` | set |
| `RAZORPAY_PLAN_PLUS` / `RAZORPAY_PLAN_PRO` | set, but **"ID invalid or not found"** for the test keys |

`GET /v1/plans` with the test keys returns **0 plans**. The plan IDs were most likely created in **Live** mode, so they don't exist in Test mode. **Blocker for Phase 4/6:** create ₹799 and ₹1,499 monthly plans in Test mode and put those IDs in `.env`; keep the live IDs for after KYC.

## 5. Spec issues to resolve before building

1. **Feature limits drift.** The spec's `PLANS` block says Plus = **30** competitors and Pro = **8** fetches. The code and server (`planLimits`) say Plus = **50** and Pro = **4**. The spec also says "all features remain same". Keeping the current values unless told otherwise.
2. **Existing paying subscribers** at $49/$99: Paddle keeps charging them the old amount unless they are migrated. Decision needed: migrate them to $15/$29, or leave them as they are.
3. **Location detection order bug.** In the spec, timezone/language are checked *before* the URL override and the stored preference, so an India-timezone user who picks USD gets flipped back to INR. The explicit choice (URL, then localStorage) should win, and auto-detection should only be the fallback.
4. **PPP leakage.** Anyone can toggle to INR. That's acceptable at this scale (Razorpay mostly takes Indian payment methods, and international cards are off unless enabled), but worth knowing about.
5. **`total_count: 12`** ends the Razorpay subscription after 12 months. Suggest a larger count (e.g. 120) so it behaves like an open-ended monthly plan, the way Paddle does.
6. **Double subscription.** Nothing stops a user with an active Paddle sub from also buying through Razorpay, or the other way round. The create-subscription endpoint should refuse if the profile already has an active sub with either provider.
7. **Legal copy.** `terms.tsx` says the payment provider is the merchant of record. That's true for Paddle but not for Razorpay, where ReachInsta itself is the seller, which brings GST/invoicing obligations. Terms, refund and privacy need a Razorpay mention, and you should confirm GST-inclusive pricing with your CA.
8. **Admin MRR** (`server/routes/admin.ts:21`) is a flat USD table. With INR subscribers it needs per-provider amounts (e.g. INR converted at a fixed rate, or reported separately).
9. **Deploy step** says `git push origin main`. Per the standing workflow, I commit on the feature branch and you review before anything is pushed or merged.
10. **`alert()`** in the spec's checkout handler should use the app's existing toast.

## 6. Files Phase 2+ will touch

`client/src/lib/plans.ts`, `PricingSection.tsx`, `UpgradeButton.tsx`, `landing.tsx`, `profile.tsx`, `billing.tsx`, `terms.tsx`, `refund.tsx`, `admin-metrics.tsx`, new `client/src/lib/locationDetection.ts`, `client/index.html`; `shared/schema.ts`, `server/storage.ts`, `server/index.ts`, `server/routes/admin.ts`, `server/routes/subscription.ts`, `server/jobs/downgrade-expired.ts`, new `server/routes/razorpay.ts`.
