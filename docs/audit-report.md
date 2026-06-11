# ReachInsta — Technical Audit Report

**Date:** 2026-06-11
**Auditor:** Claude Code automated audit
**Scope:** Full codebase — frontend + backend + infrastructure (read-only; no changes made)

---

## Executive Summary

ReachInsta is a structurally sound MVP with a small, comprehensible codebase. The data layer is clean (parameterized Drizzle throughout, transactions where they matter, sensible indexes), the Paddle webhook does real HMAC signature verification with `timingSafeEqual`, the Apify rotation system is genuinely production-grade for its scale, and the frontend has consistent design tokens, empty states, and loading states that most solo-founder MVPs lack. The RLS migration (`supabase/migrations/20260501000000_enable_rls_security.sql`) is among the best-documented files in the repo.

However, there is one disqualifying finding and a cluster of serious ones. **Plaintext credentials for the production super-admin account (`krishna@techcm.in`) are committed to git in `tests/app.test.ts:4-5`.** Per this audit's own calibration, that caps Security at 2/10 regardless of everything else done right. Beyond that: password-reset codes are brute-forceable (6 digits, no attempt limit, no rate limiting anywhere in the app), `/api/fetch` trusts a client-supplied competitor list (plan-limit bypass that burns your Apify budget), canceled Paddle subscriptions are never downgraded (revenue leak), and users cannot cancel a subscription in-app at all (the button is disabled — a compliance problem for a paid product).

**Verdict: not ready for a public paid launch as-is.** It is 2–4 focused days away. The fixes are small and well-defined — rotate the leaked password, add rate limiting + reset-attempt caps, validate the fetch payload, and finish the cancellation/downgrade path. The architecture does not need to change.

### Overall Score: 5.4 / 10

Launch-ready for a free/invite-only soft launch with ~50 users after fixing the credential leak; **not** ready for paid public marketing until the Critical list below is cleared.

### Category Scores

| Category | Score | Status |
|---|---|---|
| Security & Secrets | 2/10 | 🔴 |
| Auth & Sessions | 5/10 | 🟡 |
| Database | 7/10 | 🟡 |
| API Design | 6/10 | 🟡 |
| Frontend Code | 7/10 | 🟡 |
| Performance | 5/10 | 🟡 |
| Payments | 4/10 | 🔴 |
| Apify Integration | 7/10 | 🟡 |
| Production Readiness | 4/10 | 🔴 |
| UX Polish | 7/10 | 🟡 |

🟢 = 8+, 🟡 = 5–7, 🔴 = <5

---

## Critical Issues (MUST FIX before public launch)

### C1. Plaintext admin credentials committed to git
- **Severity:** Critical
- **Location:** `tests/app.test.ts:4-5`
- **What's wrong:** `FOUNDER = { email: "founder@techcm.in", password: "[REDACTED]" }` and `ADMIN = { email: "krishna@techcm.in", password: "[REDACTED]" }` are committed and tracked. `krishna@techcm.in` is the hardcoded `SUPER_ADMIN_EMAIL` in `server/routes.ts:38` — the account that can assign admin roles to anyone. If this password is (or ever was) the real one, anyone with repo access has super-admin on production. It is in git history permanently even if removed now.
- **Fix:** (1) Rotate both passwords immediately. (2) Move test credentials to env vars (`TEST_USER_EMAIL`/`TEST_USER_PASSWORD`) read in the test file. (3) Use dedicated throwaway test accounts that don't exist in production, never the super-admin. History rewrite is optional if the password is rotated.
- **Effort:** 30 minutes.

### C2. Password-reset codes are brute-forceable → account takeover
- **Severity:** Critical
- **Location:** `server/replit_integrations/auth/customAuth.ts:337-370` (`/api/auth/reset-password`), `server/services/email.ts:14-17` (`generateCode`)
- **What's wrong:** Reset codes are 6 digits (1,000,000 combinations), valid for 1 hour, and there is **no rate limiting and no attempt counter** on the verify side. The throttle (`canResendPasswordReset`) only limits *sending* codes, not *guessing* them. An attacker who triggers a reset for a victim's email can hammer `/api/auth/reset-password` with codes; at a modest 300 req/s, the keyspace is covered within the validity window. Same gap exists on `/api/auth/verify-email`, which looks codes up globally (any user's code matches — `email.ts:77-80`).
- **Fix:** Add a `failed_attempts` column (or in-token attempt count) and invalidate the token after 5 wrong guesses; add `express-rate-limit` on all `/api/auth/*` routes (e.g., 10/min per IP). Both are small changes.
- **Effort:** 2–3 hours.

### C3. `/api/fetch` trusts a client-supplied competitor list — plan bypass + budget burn
- **Severity:** Critical (cost + abuse)
- **Location:** `server/routes.ts:16-21` (`fetchDataSchema`), `server/routes.ts:227-237`
- **What's wrong:** `competitors: z.array(z.string()).optional()` has no max length, no username-format validation, and is **never checked against the user's stored competitor list**. A free-plan user (5-competitor limit) can POST `{"timeRangeDays": 7, "competitors": [...500 arbitrary usernames]}` and the worker will happily send all of them to Apify (`server/worker.ts:25-26` uses `fetchRun.competitorUsernames` verbatim). This bypasses `maxCompetitors` entirely and drains your $50 shared Apify budget.
- **Fix:** Either drop the `competitors` field from the API (the server already falls back to stored competitors), or intersect it with `storage.getCompetitors(userId)` and apply the same regex as `addCompetitorSchema`. Cap array length at `profile.maxCompetitors`.
- **Effort:** 1 hour.

### C4. Canceled subscriptions are never downgraded — revenue leak
- **Severity:** Critical (revenue)
- **Location:** `server/routes/paddleWebhook.ts:206-225` (`handleSubscriptionCanceled`); confirmed by grep — nothing in the codebase ever compares `currentPeriodEnd` to now
- **What's wrong:** The canceled handler sets `subscriptionStatus: "canceled"` but deliberately keeps `plan`, `maxCompetitors`, `monthlyFetchLimit`, etc. at paid values ("do NOT downgrade yet"). In Paddle Billing, `subscription.canceled` fires **when the cancellation takes effect** (i.e., at period end for a scheduled cancel) — so "yet" never comes. No cron, worker, or request-path check ever downgrades expired plans. A user who pays once and cancels keeps Pro limits forever.
- **Fix:** Simplest: downgrade to free limits inside `handleSubscriptionCanceled` (the event already fires at the right time for scheduled cancels). Belt-and-braces: in `/api/profile` (where you already do the monthly fetch reset, `server/routes.ts:76-82`), add: if `subscriptionStatus === "canceled" && currentPeriodEnd < now && plan !== "free"` → apply free `planLimits`.
- **Effort:** 1–2 hours.

### C5. No in-app subscription cancellation
- **Severity:** Critical (compliance/trust)
- **Location:** `client/src/pages/billing.tsx:148-154` — `<Button disabled>Cancel (coming soon)</Button>`; no server route calls Paddle's cancel API (`PADDLE_API_KEY` is in env but unused in code)
- **What's wrong:** You can take money but the user has no way to stop the charge. For a public paid product this is a chargeback magnet and violates consumer-protection expectations in most markets (and Paddle's merchant obligations).
- **Fix:** Add `POST /api/billing/cancel` that calls Paddle's `POST /subscriptions/{id}/cancel` with `effective_from: "next_billing_period"`, wire the button to it. The webhook you already handle (`subscription.updated` with `scheduled_change`) does the rest.
- **Effort:** Half a day.

### C6. No rate limiting anywhere in the application
- **Severity:** High
- **Location:** Entire server — `express-rate-limit` is not in `package.json` dependencies (it appears only in the build allowlist, `script/build.ts:16`)
- **What's wrong:** Login brute force, registration spam (each registration sends a Resend email — your email quota is attackable), forgot-password email bombing, and C2 above are all unthrottled. The only throttles are in-memory per-user send-cooldowns (`email.ts:19-21`) which reset on restart.
- **Fix:** `npm i express-rate-limit`; strict limiter on `/api/auth/*` (10/min/IP), generous global limiter (300/min/IP). Single instance, so the memory store is fine.
- **Effort:** 1–2 hours.

---

## Important Issues (FIX SOON after launch)

### I1. Paddle webhook: no replay protection, no idempotency
- **Severity:** High · `server/routes/paddleWebhook.ts:10-30, 95-102`
- Signature is verified correctly, but the `ts` field is parsed and never checked for freshness, and `event_id` is never deduplicated. A captured webhook (e.g., from logs) can be replayed indefinitely — replaying an old `subscription.activated` re-upgrades a canceled account. Also, handler errors return 200 (line 99-102), so Paddle never retries — failed events are silently lost with only a console.error.
- **Fix:** Reject if `|now - ts| > 5 min`; store processed `event_id`s in a small table; return 500 on handler failure so Paddle retries.
- **Effort:** 2–3 hours.

### I2. Fetch quota: race condition and no refund on failure
- **Severity:** Medium · `server/routes.ts:223-256`
- `fetchesUsed` is read, compared, then written non-atomically — two concurrent requests both pass the check (free plan: limit 1, get 2). And if the fetch run fails permanently after 3 retries (`worker.ts:63-76`), the consumed fetch is never refunded — a free user's entire month dies on one Apify outage.
- **Fix:** Atomic guard: `UPDATE profiles SET fetches_used = fetches_used + 1 WHERE id = $1 AND fetches_used < monthly_fetch_limit RETURNING *` — 404/403 if no row. Decrement on permanent failure.
- **Effort:** 2 hours.

### I3. Stuck jobs are never recovered; Apify calls have no timeout
- **Severity:** Medium · `server/worker.ts`, `server/services/apify.ts:142-149`
- If the process crashes mid-job, the job stays `running` forever (only `queued` jobs are polled — `storage.ts:497-504`) and the user's fetch run shows "running" eternally. `client.actor(...).call()` has no `timeout` or `waitSecs`, so a hung actor hangs the entire worker loop (jobs are processed sequentially in-process).
- **Fix:** On startup and/or each poll, re-queue jobs `running` for > 15 min; pass `waitSecs`/`timeout` to `.call()`. Also check `postsRun.status === "SUCCEEDED"` before trusting the dataset (`apify.ts:145` logs it but doesn't act on it).
- **Effort:** Half a day.

### I4. Sessions survive password change/reset
- **Severity:** Medium · `customAuth.ts:265-298, 337-370`
- Changing or resetting a password does not destroy other sessions. After a reset (i.e., the account was possibly compromised), the attacker's existing session keeps working for up to 7 days.
- **Fix:** `DELETE FROM sessions WHERE sess->>'userId' = $1` after password change/reset.
- **Effort:** 1 hour.

### I5. Account enumeration via register and forgot-password throttle
- **Severity:** Medium · `customAuth.ts:94-96` (409 "Email already registered"), `customAuth.ts:317-322` (429 only fires for existing emails)
- Login is correctly generic, and forgot-password's 200 is correctly generic — but the 409 on register and the 429-vs-200 distinction on forgot-password both reveal whether an email is registered. The register one is a common product tradeoff; the 429 leak is just a bug (move the throttle check before the user lookup, keyed by email string).
- **Effort:** 1 hour.

### I6. CI deploys to production with zero quality gate
- **Severity:** Medium · `.github/workflows/deploy.yml`
- Every push to `main` builds and deploys. No `tsc`, no tests, no lint run anywhere in CI. The Playwright suite exists (`tests/app.test.ts`) but is never executed automatically.
- **Fix:** Add a job before deploy: `npm ci && npm run check`. Even just typecheck would have real value.
- **Effort:** 1 hour.

### I7. API response bodies are logged wholesale
- **Severity:** Medium · `server/index.ts:54-78`
- Every `/api` JSON response — user emails, names, profile data — is serialized into stdout logs. That's PII in plaintext logs, plus log noise that will hide real errors. Also `server/index.ts:92`: the error handler responds and then `throw err` — a known Replit-template anti-pattern that produces double-handled errors in the default handler.
- **Fix:** Log method/path/status/duration only; delete the `throw err`.
- **Effort:** 30 minutes.

### I8. Fake analytics on the dashboard
- **Severity:** Medium (product integrity) · `client/src/pages/dashboard.tsx:262-268`
- "Best Posting Windows" displays hardcoded strings (`"Monday 9:00 AM"`, etc.) labeled "High engagement window" as if computed from data. The data to compute this honestly exists (`postedAt` per reel; the heatmap chart already uses it). Shipping fabricated numbers in an analytics product is the kind of thing a paying customer screenshots.
- **Fix:** Compute top-3 hour/day buckets by average ER from `reels`, or remove the panel.
- **Effort:** 2–3 hours to do it for real.

### I9. No error tracking, trivial health check, no graceful shutdown
- **Severity:** Medium · `server/index.ts:81-83, 105-121`
- `/api/health` returns `{status:'ok'}` without touching the DB — it will report healthy while Postgres is down. No Sentry (or similar), so production errors exist only in container stdout. No SIGTERM handler — `docker compose up --force-recreate` on every deploy kills in-flight requests and mid-job Apify fetches.
- **Fix:** Health: `SELECT 1` against the pool. Sentry free tier: ~1 hour. SIGTERM: close server, let in-flight job finish, exit.
- **Effort:** Half a day total.

### I10. Frontend bundle: 973 KB JS, no code splitting, 2 MB PNG logo
- **Severity:** Medium · `dist/` build output; `client/src/App.tsx:10-28` (all 19 pages eagerly imported); `client/src/pages/verify-email.tsx:10` (imports the 2,082 KB `ChatGPT_Image_...png` as a logo)
- First paint of the marketing landing page pays for recharts, the admin panel, and every dashboard chart. The verify-email logo alone is 2 MB — larger than the entire JS bundle.
- **Fix:** `React.lazy` per route (wouter supports it cleanly) and compress the logo to a ~10 KB WebP/SVG. Should roughly halve landing-page weight.
- **Effort:** Half a day.

---

## Nice-to-Have Improvements (TECHNICAL DEBT)

| # | Issue | Location | Effort |
|---|---|---|---|
| N1 | Apify tokens stored plaintext in DB and `apify_api.txt` (already documented as TODO in `SECURITY.md:74-95`) — move to `APIFY_KEY_N` env vars, keep metadata in DB | `server/services/keyManager.ts:14-50` | half day |
| N2 | CSV injection: fields not quoted/escaped; `@`-prefixed usernames become Excel formulas; commas in data break columns | `server/routes.ts:506-519, 547-557` | 1h |
| N3 | `users` and `profiles` are parallel identity tables with duplicated `email` and **no FK between them**; role/email drift is possible | `shared/models/auth.ts:16`, `shared/schema.ts:24` | half day |
| N4 | Admin user list does N+1 competitor counts and returns all profiles unpaginated | `server/routes.ts:385-399` | 2h |
| N5 | No tokenHash/userId indexes and no FKs on `email_verification_tokens` / `password_reset_tokens`; no cleanup of expired rows | `shared/models/auth.ts:28-44` | 1h |
| N6 | `raw_payloads` stores full Apify JSON per fetch forever — unbounded growth; add retention (e.g., delete > 30 days) | `shared/schema.ts:99-105` | 1h |
| N7 | Avatar stored as base64 data-URL in `users.profile_image_url` (up to ~2 MB), returned on every `/api/auth/user` call | `replit_integrations/auth/routes.ts:11,32` | defer until it hurts |
| N8 | Drizzle `db:push` with no migration history; Supabase migrations folder is separate and manual — schema drift risk with a second environment | `drizzle.config.ts`, `SECURITY.md:154-161` | half day |
| N9 | Dead "Contact Admin to Upgrade" button (no onClick) — and it contradicts the self-serve Paddle flow that exists | `client/src/pages/exports.tsx:44-49` | 15min |
| N10 | No React error boundary — a render error white-screens the app; no 500 page | `client/src/App.tsx` | 2h |
| N11 | Accessibility: 2 `aria-label`/`alt` attributes across all pages; charts have no text alternatives | `client/src/pages/*` | ongoing |
| N12 | No `helmet`/CSP headers; `GET /api/logout` performs a state change | `server/index.ts`, `customAuth.ts:143-154` | 1h |
| N13 | Docker: `EXPOSE 3000` but server defaults to port 5000; no `HEALTHCHECK`; `docker-compose.yml` lives only on the VPS (unversioned infra) | `Dockerfile:35`, `server/index.ts:105` | 1h |
| N14 | No README. `replit.md` is the closest thing and is stale (project no longer on Replit) | repo root | 2h |
| N15 | `unknown price id → plan "free"` silently downgrades on env misconfig — log loudly instead | `paddleWebhook.ts:151` | 15min |
| N16 | Billing success toast can fire while profile still says "free" (webhook race) — shows "Welcome to Free!" | `client/src/pages/billing.tsx:31-38` | 1h |

---

## Category Deep Dives

### 1. Security & Secrets Management — Score 2/10

**Top 3 Strengths:**
1. No secrets in git *history* for `.env`/`apify_api.txt` — verified with `git log --all` across all 75 commits; `.gitignore` covers all env files and the token file (`.gitignore:9-14, 53-54`).
2. Webhook signature verification is done right: raw body captured before `express.json()` (`server/index.ts:28-30`), HMAC-SHA256 over `ts:body`, constant-time compare (`paddleWebhook.ts:10-30`).
3. Drizzle parameterizes everything — zero string-concatenated SQL anywhere; React's default escaping is never bypassed in app code (the single `dangerouslySetInnerHTML` is shadcn's chart CSS injector, `components/ui/chart.tsx:81`, with controlled input).

**Top 3 Issues:**
1. **Committed super-admin credentials** — `tests/app.test.ts:4-5` (see C1). Per calibration, this alone caps the score at 2. Without it, this category is roughly a 7.
2. No rate limiting on anything (C6) and brute-forceable 6-digit reset codes (C2) — combined, a practical account-takeover path.
3. No security headers (no helmet/CSP/HSTS); response-body logging puts PII in logs (I7).

**Recommendation:** Rotate the leaked password today, then C2/C6 this week. The rest of the security posture is genuinely decent — this is a discipline failure, not an architecture failure.

### 2. Authentication & Session Management — Score 5/10

**Top 3 Strengths:**
1. Postgres-backed sessions (`connect-pg-simple`) with `httpOnly`, `secure` in production, `sameSite: "lax"`, 7-day TTL (`customAuth.ts:27-48`) — survives restarts, correct flags.
2. bcrypt cost 12 (`services/auth.ts:6`), reset/verification codes stored as SHA-256 hashes with expiry and **atomic, one-time consumption** under `SELECT ... FOR UPDATE` transactions (`storage.ts:172-211, 233-280`).
3. Login errors are generic ("Invalid email or password"), forgot-password returns the same 200 whether the email exists or not (`customAuth.ts:312-315`), and change-password requires the current password (`customAuth.ts:285-288`).

**Top 3 Issues:**
1. Reset-code brute force (C2) — undermines the otherwise-careful token design.
2. Sessions not invalidated on password change/reset (I4).
3. Enumeration via register 409 and the forgot-password 429 path (I5); send-throttles are in-memory `Map`s that reset on every deploy (`email.ts:19-21`).

**Recommendation:** Attempt-cap on codes + auth rate limiting + session invalidation. ~1 day total, takes this to a 7-8.

### 3. Database Schema & Queries — Score 7/10

**Top 3 Strengths:**
1. Sensible schema: FKs with `onDelete: "cascade"` on all child tables, unique composite index on `(user_id, username)` for competitors, indexes on the actual hot paths — `fetch_runs(user_id, status)`, `reels(fetch_run_id, username, views)`, `jobs(status)`, `sessions(expire)` (`shared/schema.ts:51-119`).
2. RLS enabled on all 12 tables with a defensible policy model and exemplary documentation of *why* (`supabase/migrations/20260501000000_...sql`); a PostgREST test script exists (`scripts/test-rls-policies.js`). Caveat: this audit cannot verify the migration was actually applied to the live Supabase project — run the test script to confirm.
3. Atomic patterns where they matter: `claimJob` uses conditional UPDATE (`storage.ts:520-527`), token consumption is transactional, bigint/numeric types sized for Instagram-scale numbers with overflow guards.

**Top 3 Issues:**
1. `users` ↔ `profiles` split-brain: same ID, duplicated email, no FK, role lives in `profiles` while identity lives in `users` (N3). Admin-promotion logic is duplicated in two places (`routes.ts:55-74` and `routes.ts:352-383`) with slightly different behavior.
2. Read-modify-write on `fetchesUsed` (I2) — the one quota that costs you real money is the one updated non-atomically.
3. No pagination on `getAllProfiles`, `getAllFetchRuns`, `getReelsByFetchRun` (`storage.ts:310-312, 428-434`); fine at 50 users, a problem at 5,000. Token tables lack indexes and any cleanup of expired rows (N5).

**Recommendation:** Fix the atomic quota update now; schedule the users/profiles consolidation for a quiet week — it touches auth, admin, and webhooks.

### 4. API Design & Error Handling — Score 6/10

**Top 3 Strengths:**
1. Uniform error shape `{ message }` with mostly-correct status codes (400 validation / 401 auth / 403 plan limits / 404 ownership / 409 duplicate — e.g., `routes.ts:107-134`).
2. Zod validation on the major mutation routes with constrained inputs (username regex `routes.ts:8-10`, bounded bulk size, enum'd plans/roles).
3. Ownership checks are consistent — every fetch-run access verifies `fetchRun.userId !== userId` (`routes.ts:300-302, 499-502`), competitor deletes are scoped by `(id, userId)` (`storage.ts:392-398`).

**Top 3 Issues:**
1. The `/api/fetch` competitors-array hole (C3) — the one validation gap that matters most.
2. Several auth routes skip Zod for ad-hoc checks (`change-email`, `verify-email`, `change-password` — `customAuth.ts:156-298`), and `GET /api/logout` mutates state.
3. Error-handler rethrow (`index.ts:92`) and full response-body logging (I7); CSV builder does no escaping (N2).

**Recommendation:** Fix C3 immediately; standardize on Zod for the remaining auth routes when touched next.

### 5. Frontend Code Quality — Score 7/10

**Top 3 Strengths:**
1. Real component decomposition: dashboard is composed of 15+ focused components (`components/dashboard/`, `components/dashboard/charts/`), not a monolith; `data-testid` discipline throughout supports the Playwright suite.
2. Server state handled properly via React Query — smart conditional polling that switches to 3s only while a fetch is in flight (`pages/dashboard.tsx:38-45`), invalidations after mutations, `staleTime: Infinity` default with explicit overrides where freshness matters (`hooks/use-auth.ts:42-46`).
3. TypeScript is genuinely clean on the client — 3 `any` occurrences total across `client/src` (vs. 43 on the server, mostly `req: any`); shared types imported from `@shared/schema` end-to-end.

**Top 3 Issues:**
1. No code splitting — all 19 pages eagerly imported (`App.tsx:10-28`), producing a 973 KB bundle (I10).
2. `AppRouter` is a hand-rolled if-chain with redirect logic repeated 6 times (`App.tsx:49-168`) — works, but every new route is a chance to miss an email-verification guard.
3. Accessibility is nearly absent: 2 `aria-label`/`alt` attributes across all pages; no error boundary, so one render bug white-screens the SPA (N10, N11).

**Recommendation:** Route-level `React.lazy` is the highest-value hour you can spend here.

### 6. Performance & Scalability — Score 5/10

**Top 3 Strengths:**
1. Aggressive client caching (`staleTime: Infinity`) means most navigation does zero network requests; polling is conditional, not constant.
2. Server bundle via esbuild with dependency bundling for cold-start (`script/build.ts`), multi-stage Docker keeps the image lean.
3. Apify result processing is single-pass with sane bounds (caps, `Number.isFinite` guards — `services/apify.ts:213-235`).

**Top 3 Issues:**
1. 973 KB JS + 2 MB PNG (I10) — your landing page (the marketing asset) carries the entire dashboard's weight.
2. Worker runs in-process and processes jobs **sequentially with no timeout** (I3) — one slow Apify run queues everyone behind it; a crash strands jobs forever. Acceptable single-instance, but it's also why you can't horizontally scale this container (the worker would double-poll... actually `claimJob` is atomic, so it would mostly work — but sessions' in-memory throttle maps wouldn't).
3. `raw_payloads` unbounded growth (N6); default pg pool of 10 with no tuning (fine for now; revisit past ~200 active users).

**Recommendation:** Code-split + compress the logo now; job timeout + stale-job recovery next; ignore pool tuning until you have traffic.

### 7. Payment & Subscription Flow — Score 4/10

**Top 3 Strengths:**
1. Signature verification is textbook (raw body before JSON parser, HMAC, constant-time compare) — better than many funded startups' webhook handlers.
2. Plan mapping is server-authoritative: price-ID → plan resolved server-side (`paddleWebhook.ts:34-40`), and `updateProfileSubscription` derives all limit columns from `planLimits` on plan change (`storage.ts:355-365`) — the client can't grant itself limits.
3. Good event coverage: activated/created/updated/canceled/paused/resumed/transaction.completed including the past_due-recovery path (`paddleWebhook.ts:256-272`); `custom_data.user_id` fallback handles first-webhook-before-customer-id-stored.

**Top 3 Issues:**
1. **No downgrade ever happens** (C4) and **no cancellation exists** (C5) — the subscription lifecycle is only half-built. Money in, no path out.
2. No idempotency/replay protection, and handler errors swallowed with a 200 (I1).
3. Renewal doesn't reset usage: `transaction.completed` only fixes past_due; `fetchesUsed` resets on calendar-month boundaries via `/api/profile` (`routes.ts:76-82`), which misaligns with Paddle billing periods — a user who subscribes on the 20th gets a reset on the 1st. Minor revenue/fairness wrinkle, plus the billing-page success-toast race (N16).

**Recommendation:** This is the weakest *product-complete* area. Budget a full day: cancel endpoint + downgrade-at-period-end + event_id dedupe.

### 8. Apify Integration (Critical Path) — Score 7/10

**Top 3 Strengths:**
1. Rotation/failover is well-engineered: budget-ranked key selection via SQL (`storage.ts:546-554`), `isBudgetError` covers 402 + ~20 quota phrases across every error-shape Apify uses (`keyManager.ts:62-112`), exhausted keys marked and skipped, masked tokens in all logs, and a test-injection hook (`APIFY_TEST_FORCE_BUDGET_ERROR`) that lets you rehearse failover safely. This matches the validated state in project memory.
2. Cost tracking per fetch with published per-item rates (`keyManager.ts:5-7, 114-126`) plus an independent reconciliation script against the real Apify API (`scripts/apify-audit.ts`) — DB drift is detectable.
3. Defensive parsing: error items skipped, pinned posts excluded, missing usernames/URLs handled, NaN/overflow clamped, date-window re-filtered server-side after the scraper's looser `onlyPostsNewerThan` (`apify.ts:166-257`); follower-fetch failure degrades gracefully instead of failing the run (`apify.ts:301-304`).

**Top 3 Issues:**
1. No timeout on `actor.call()` and no stale-job recovery (I3) — the failure mode isn't budget exhaustion (handled) but a hang (unhandled).
2. Run status unchecked: `postsRun.status` is logged but a FAILED/ABORTED run with a partial dataset is treated as success (`apify.ts:145-150`).
3. The free-tier enforcement gap is upstream (C3): the rotation system faithfully spends budget on whatever usernames it's handed.
4. *(Bonus)* `recordUsage` only fires on success — a run that burns Apify credit then throws during DB insert under-counts budget; and concurrent runs could double-select the same "best" key (harmless single-worker).

**Recommendation:** Add `waitSecs`/timeout + status check (2 hours) and this is an 8.

### 9. Production Readiness — Score 4/10

**Top 3 Strengths:**
1. Multi-stage Dockerfile with prod-only deps in the final stage and GHA layer caching (`Dockerfile`, `deploy.yml:33-34`); image tagged by SHA for rollback.
2. Startup env presence check (`server/index.ts:10-17`) — logs which secrets are missing without printing values.
3. Real test assets exist: a 23-scenario Playwright suite with screenshots, k6 load-test scripts (`tests/load/`), and the RLS/Apify verification scripts — more than most MVPs have.

**Top 3 Issues:**
1. CI/CD has zero quality gate (I6) — the Playwright suite is decoration if it never runs; `npm run check` (tsc) isn't even invoked.
2. No error tracking, health check doesn't check anything, no graceful shutdown, console.log-only logging (I9, I7).
3. No README or runbook (`replit.md` is stale); `docker-compose.yml` exists only on the VPS — your production topology is unversioned (N13, N14). Backups: not configured in-repo; Supabase free-tier dailies may cover you, but verify and write it down.

**Recommendation:** One day: typecheck gate in CI + Sentry + real health check + SIGTERM handler + a README with deploy/rollback/restore steps. This is the cheapest category to improve.

### 10. UX & Product Polish — Score 7/10

**Top 3 Strengths:**
1. Empty states are thoughtful and ubiquitous — every page handles no-competitors/no-data with distinct copy and a next action (`dashboard.tsx:200-220`, `exports.tsx:66-71`); microcopy has a consistent voice ("Your competitors won't be notified. Pinky promise.").
2. Loading and in-progress states are genuinely complete: fetch-status stepper with cancel, skeleton spinners, disabled-with-tooltip explaining *why* the fetch button is disabled (`dashboard.tsx:149-174`) — that tooltip pattern is better than most production SaaS.
3. Design-token discipline: custom Tailwind tokens (`text-text-primary`, `bg-bg-surface`, `border-border-subtle`, `mint`) used consistently across all 19 pages — the dark theme has no half-converted pages; plan-limit feedback (usage bars, upgrade nudges) is everywhere it should be.

**Top 3 Issues:**
1. Fake "Best Posting Windows" data (I8) — polish that actively undermines trust in an analytics product.
2. Dead "Contact Admin to Upgrade" button (N9) and the disabled Cancel button (C5) — two places where the UI promises something the product doesn't do.
3. No error boundary / 500 handling (N10); accessibility near-zero (N11); the email-verification page ships a 2 MB logo (I10).

**Recommendation:** Fix the two dishonest UI elements before launch — they're hours of work and they're the kind of thing early users screenshot.

---

## Launch Readiness Verdict

**Ready for:**
- Private beta / invite-only free tier (after C1 password rotation — that one is unconditional)
- Demoing to users, collecting feedback, dogfooding
- Soft launch to ~50 users on the free plan

**NOT ready for:**
- Public paid launch (C4 + C5: subscriptions can't be canceled and never downgrade — you will get chargebacks)
- Any marketing push that attracts adversarial attention (C2 + C6: unthrottled auth with brute-forceable reset codes)
- Posting the repo or giving contractor access without rotating credentials (C1)
- Scaling past ~200 users without I2/I3 (quota races, stuck jobs) and pagination

**Specific blockers:**
1. C1 — rotate `krishna@techcm.in` / `founder@techcm.in` passwords, de-hardcode test credentials (30 min)
2. C2 + C6 — rate limiting + reset-attempt cap (3–4 hours)
3. C3 — validate `/api/fetch` competitors payload (1 hour)
4. C4 + C5 — subscription downgrade + cancellation (1–1.5 days)

Total to clear all blockers: **roughly 2–3 focused days.**

**Suggested 30-day post-launch priorities:**
1. Webhook idempotency + replay protection, and atomic fetch-quota updates (I1, I2) — money-path correctness
2. Sentry + real health check + CI typecheck gate + SIGTERM (I6, I9) — so you find out about problems before users do
3. Job timeout + stale-job recovery (I3) — the most likely "my fetch is stuck forever" support ticket
4. Code splitting + logo compression (I10) — landing-page speed is marketing
5. Replace the fake posting windows with real computation (I8)

---

## What This Audit Cannot Verify

- **Whether the RLS migration is applied** to the live Supabase project — the SQL is in the repo, but application is manual (`SECURITY.md:154-168`). Run `node scripts/test-rls-policies.js` against production to confirm.
- **Whether the leaked test password matches the live production password** for those accounts. Treat it as if it does.
- **Live infra state**: the VPS `docker-compose.yml`, reverse proxy/TLS config, Supabase backup settings, and Paddle dashboard configuration (production vs sandbox price IDs) are all outside the repo.
- **Market fit, pricing competitiveness, and UI intuitiveness** — code audits don't measure these; real user sessions do.
- **Whether Instagram/Apify ToS exposure is acceptable** — scraping-based products carry platform risk no code review can score.

---

## Compared to Industry Standards

**Above standard for a 1-person founder build.** The webhook signature handling, atomic token consumption, RLS documentation, Apify failover design, and frontend state management are things many seed-stage teams with 3 engineers get wrong. The empty-state and loading-state coverage is better than typical YC-demo-day product quality.

**At standard for a typical pre-seed/YC-application codebase** in structure: monolithic Express + React, in-process job queue, push-to-deploy. That's the right architecture for this stage — no points off for not having microservices you don't need.

**Below standard in operational discipline**, and this is the honest gap: credentials in the test file, no CI gate, no error tracking, no rate limiting, and an incomplete payment lifecycle. Linear or Cal.com at MVP stage would not have shipped a disabled Cancel button on a live paid product. The difference between this codebase and a fundable-quality one is not the architecture — it's about one week of unglamorous hardening work, most of which is itemized above with file and line numbers.
