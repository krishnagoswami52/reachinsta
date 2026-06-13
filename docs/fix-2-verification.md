# Fix #2 — Subscription Lifecycle Verification

**Date:** 2026-06-13
**Status:** ✅ FULLY VERIFIED IN SANDBOX

## Verified Behaviors

### 1. Cancel flow
- User clicks "Cancel subscription" on /billing page
- API endpoint POST /api/subscription/cancel succeeds
- Paddle API confirms scheduled cancel at period end
- DB updates: subscription_status='canceling', cancel_at=period_end
- User retains paid plan access until period_end (grace period)

### 2. Resume flow
- User clicks "Resume subscription" while in canceling state
- API endpoint POST /api/subscription/resume succeeds
- Paddle API clears scheduled cancel
- DB updates: subscription_status='active', cancel_at=NULL
- User continues on paid plan as normal

### 3. Cron downgrade (period expiry)
- When cancel_at <= now AND subscription_status='canceling'
- Cron `downgradeExpiredSubscriptions` finds matching users
- For each user: plan='free', subscription_status='canceled'
- Plan-limit columns reset (max_competitors=5, monthly_fetch_limit=1)
- paddle_subscription_id cleared (no longer linked to Paddle)

### 4. Idempotency
- Re-running cron immediately after completion → 0 users downgraded
- Already-downgraded users no longer match the `canceling` filter

## Cron Manual-Run Verification (2026-06-13)

The downgrade cron was triggered manually to verify the period-expiry path
end to end against the Supabase sandbox DB.

### Env-loading root cause (resolved)
The earlier `npx tsx -e` one-liner failed with
`password authentication failed for user "postgres"`. Root cause: the dev
server (`tsx server/index.ts`) loads env via `import 'dotenv/config'`, and
`DATABASE_URL` lives **only** in `.env` (`.env.local` holds only Paddle
overrides). When env isn't loaded, `server/db.ts` falls back to
`postgres://postgres:postgres@localhost:5432/reachinsta`, which fails auth.

Fix: a dedicated runner (`scripts/run-downgrade.ts`) that calls
`dotenv.config()` for `.env` then `.env.local` (override), and **dynamically
imports** the job afterward so `server/db.ts` reads `DATABASE_URL` *after* env
is populated (a static top-level import would be hoisted and run the Pool
constructor before env loads).

### Before (pre-flight)
```
plan:                    plus
subscription_status:     canceling
current_period_end:      2026-06-12T04:30:54Z  (expired)
cancel_at:               2026-06-12T04:30:54Z  (expired)
paddle_subscription_id:  sub_01kv064wgdt6cnzcwrem0q5639
max_competitors:         50
monthly_fetch_limit:     2
```

### Run output
```
[Cron] Downgrading 1 expired subscription(s)
[Cron] Downgraded user a1418fe9-eba8-4ca3-8ad1-f75fad898ee8 (subtest-1781344088153@reachinsta-lifecycle.test) to free
[Manual] ✅ Job complete. Downgraded 1 user(s).
```

### After (post-downgrade)
```
plan:                    free       ← ✅ downgraded
subscription_status:     canceled   ← ✅ finalized
current_period_end:      NULL       ← ✅ cleared
cancel_at:               NULL       ← ✅ cleared
paddle_subscription_id:  NULL       ← ✅ Paddle link removed
max_competitors:         5          ← ✅ reset to free tier
monthly_fetch_limit:     1          ← ✅ reset to free tier
```

### Idempotency (2nd run)
```
[Cron] No expired subscriptions to downgrade
[Manual] ✅ Job complete. Downgraded 0 user(s).
```

## Test Evidence
- Sandbox subscription created: sub_01kv064wgdt6cnzcwrem0q5639
- Test user: subtest-1781344088153@reachinsta-lifecycle.test (id a1418fe9-eba8-4ca3-8ad1-f75fad898ee8)
- Webhook accepted with HTTP 200 (signed payload)
- Full cancel → resume → cancel → downgrade lifecycle verified
- Runner: `scripts/run-downgrade.ts`; read-only check: `scripts/check-user-state.ts`

## Pre-production deployment checklist

- [ ] Production Paddle API key updated with subscription:read, subscription:write, customer:read scopes
- [ ] VPS .env updated with new production PADDLE_API_KEY
- [ ] Production DB migration: ALTER TABLE profiles ADD COLUMN cancel_at TIMESTAMP
- [ ] node-cron registered in server/index.ts (runs at 1 AM UTC daily)
- [ ] Webhook destination URL confirmed: https://reachinsta.com/api/webhooks/paddle
- [ ] Production webhook secret matches code
