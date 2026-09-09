# Signup Security Audit

> **Type:** READ-ONLY investigation — no code, config, or data was modified
> **Date:** 2026-09-01
> **Scope:** `/api/auth/register` and everything reachable from a fresh account
> **Branch:** `main` @ `2b3efb7`
> **Production queries:** all `SELECT`, run against the live Supabase DB

---

## Executive Summary

**Overall protection level: D**

Signup has real, competent building blocks — bcrypt at 12 rounds, zod validation,
case-normalised unique emails, a working email-verification flow, an IP rate limiter,
and constant-time login. What it does not have is any barrier between "a script POSTs
JSON" and "Krishna's Apify balance goes down."

The single finding that sets the grade: **email verification is enforced only in the
React client.** `isAuthenticated` (`customAuth.ts:400-425`) checks the session and
nothing else. `/api/fetch` sits behind exactly that guard. Registration hands back a
live session cookie on the same response that dispatches the verification email
(`customAuth.ts:70-96`), so a bot never needs to receive mail at all — register, add a
competitor, fetch. Nothing in the server path consults `users.email_verified` before
spending money.

The rate limiter bounds this but does not stop it. `authLimiter` allows 10 requests per
IP per 15 minutes, which is **960 accounts per day from a single IP** — worth $76.80 of
Apify spend against a pool that currently holds **$42.03**. One unblocked residential IP
can drain the entire remaining balance in under 14 hours; the worker's own throughput
ceiling (5 concurrent × 63s average) puts the true floor at **roughly 2 hours** of
wall-clock if the attacker parallelises account creation.

This is not hypothetical. On **2026-06-07 between 16:28 and 17:08 UTC, 367 accounts were
created through the production endpoint in 40 minutes** — the k6 load test in
`tests/load/03-auth-flow.js`, whose default `BASE_URL` is `https://reachinsta.com`. Rate
limiting did not exist yet (`a279932`, 2026-06-16, nine days later). The load test is
therefore an accidental but complete proof-of-concept of the mass-registration attack,
executed successfully against production. The only reason it cost nothing is that
`upsertProfile` was not yet part of registration, so those 367 accounts have no profile
row and `/api/fetch` rejects them with "Profile not found". **That accident is no longer
protective** — registration creates the profile today.

The good news is that the live data is clean. Of 202 genuine users, 192 are verified
(95%), there is not a single plus-aliased or bot-prefixed address, and **no unverified
account has ever run a fetch.** There is no evidence of a real attack to date. The
exposure is entirely forward-looking, and Product Hunt is exactly the event that
attracts it.

---

## Current Protections

Everything below was verified in code, not assumed.

| Protection | Where | Assessment |
|---|---|---|
| IP rate limit on register | `customAuth.ts:60`, `rate-limit.ts:25` | **Present but loose.** 10 req / 15 min / IP |
| Input validation | `registerSchema`, `shared/models/auth.ts:57` | Email format + password ≥ 8 chars. No max length on either |
| Password hashing | `services/auth.ts:8` | bcrypt, 12 rounds. Solid |
| Duplicate-account prevention | `storage.ts:150,163` | `email.toLowerCase()` on **both** lookup and insert, plus a DB unique constraint. Correct — case-variant duplicates are genuinely impossible |
| Email verification flow | `services/email.ts:29`, `customAuth.ts:181` | 6-digit code, SHA-256 hashed, 24h expiry, one-per-user (old tokens deleted). Well built — **but not enforced anywhere on the server** |
| Account enumeration defence | `services/auth.ts:13,46` | Dummy bcrypt compare on login so timing does not leak whether an email exists. Genuinely thoughtful |
| Fetch spend caps (per user) | `routes.ts:245`, `schema.ts:342` | Free = 1 fetch/month, 5 competitors, 7-day range |
| Competitor ownership check | `routes.ts:256-270` | Client-supplied handles must be a subset of tracked ones — blocks burning budget on arbitrary accounts |
| Apify key floor | `shared/queue.ts:57` | `KEY_BUDGET_FLOOR = $0.30` prevents dying mid-run. Protects *a run*, not the *pool* |
| Baseline API limiter | `index.ts:51` | 100 req/min/IP across `/api/` |

---

## Vulnerabilities

### V1 — Email verification is client-side only *(Critical)*

`isAuthenticated` resolves the session, loads the user, attaches `req.user`, and calls
`next()`. It never reads `user.emailVerified`. The gate lives in `client/src/App.tsx:54`,
which is a redirect in a React router — irrelevant to anything speaking HTTP directly.

Consequence: `POST /api/auth/register` → session cookie → `POST /api/competitors` →
`POST /api/fetch`. Real Apify spend, no mailbox required. Registration explicitly does not
fail when the verification email fails to send (`customAuth.ts:84-88`) — it logs a warning
and returns the session anyway.

### V2 — Register and login share one rate-limit bucket *(High)*

`authLimiter` is a single `express-rate-limit` instance applied to both
`/api/auth/register` and `/api/auth/login`. One counter covers both. This is wrong in
both directions: 10/15min is far too generous for account *creation*, and a burst of
signups from a shared corporate or campus NAT will lock legitimate users out of *login*.
On a Product Hunt launch day, office and mobile-carrier NATs are the normal case.

### V3 — No CAPTCHA anywhere *(High)*

Grepped for `captcha`, `turnstile`, `hcaptcha`, `recaptcha`, `botd`, `fingerprint`
across `server/`, `client/src`, `shared/`, and `package.json`. Zero hits. The only
honeypot in the codebase is the one on the contact form (`routes/contact.ts:39`) — the
signup form has none.

### V4 — Disposable email addresses are fully accepted *(High)*

No blocklist, no MX check, no domain validation beyond zod's `.email()`. `temp-mail.org`,
`10minutemail`, `mailinator`, and every alias service work today. Combined with V1 this
barely matters — an attacker does not need a working mailbox at all — but it matters the
moment V1 is fixed, because it is the fallback path.

### V5 — Signup IP is never recorded *(High)*

`users` has no IP column. A schema-wide search for IP-like columns returns exactly two:
`page_views.ip_address` and `contact_queries.ip_address`. There is no way to answer "how
many accounts came from this IP", to enforce a per-IP account cap, or to clean up after
an attack. The `page_views` join is not a substitute — it only fires on page loads, so a
pure-API attacker leaves no trace at all. Today it correlates a single IP (`127.0.0.1`,
my own local testing) with more than one user.

### V6 — Registration is an outbound email cannon *(High)*

Every registration sends a Resend email to an attacker-chosen address. At 960
registrations/day/IP that is 960 unsolicited emails/day from
`noreply@updates.reachinsta.co` — to third-party victims, on Krishna's sending domain,
right at launch. Two aggravating factors:

- `/api/auth/resend-verification` (`customAuth.ts:181`) and `/api/auth/change-email`
  (`customAuth.ts:216`) carry **no rate-limit middleware at all** — only a 60-second
  in-memory per-user throttle. Each new account is its own bucket, so one account = 1
  email/minute = 1,440/day to arbitrary addresses via `change-email`.
- The throttle maps (`email.ts:24,26`) are plain in-process `Map`s. They reset on every
  deploy and are not shared across instances.

Domain reputation damage is slower to undo than an Apify top-up, and it would also break
password resets for real customers.

### V7 — No aggregate spend circuit breaker *(High)*

`KEY_BUDGET_FLOOR` protects an individual run from dying mid-flight. Nothing watches the
pool total and nothing halts free-plan fetches when the balance falls. The pool holds
**$42.03** of $50 across 10 keys; `ESTIMATED_APIFY_COST.free = $0.08` means **525 free
fetches drain it to zero**, and there is no alert on the way down.

### V8 — No cooldown before the first fetch *(Medium)*

A profile is created inside the registration handler with `fetchesUsed = 0` and
`monthlyFetchLimit = 1`. The account's one paid-for action is available milliseconds
after signup. `fetchLimiter` (2/min) is keyed by user id, so it does nothing against many
accounts each fetching once.

### V9 — Gmail aliases are distinct accounts *(Low)*

Lowercasing is done; dot- and plus-normalisation is not. `k@gmail.com`,
`k+1@gmail.com`, and `k.r.i@gmail.com` are three accounts delivering to one inbox — three
free fetches per month per real mailbox, and it survives a verification requirement.
Worth noting that **zero genuine users currently use plus-aliasing**, so enforcing this
would break nobody today.

### V10 — Unbounded string inputs *(Low)*

`registerSchema` sets no `.max()` on email, password, firstName, or lastName. The DB
columns are unbounded `varchar`/`text`. A 10 MB `firstName` is accepted up to Express's
100 KB JSON default — bounded by luck rather than intent, and bcrypt on a huge password
is CPU-expensive.

---

## Attack Scenarios

### Scenario A — Budget drain (the realistic one)

An attacker sees the Product Hunt post and scripts the three-call sequence. No CAPTCHA to
solve, no mailbox to read, no browser to drive.

| Vector | Accounts/day | Fetches | Apify cost |
|---|---|---|---|
| 1 IP, respecting the limiter | 960 | 960 | $76.80 |
| 1 IP, capped by the **$42.03 pool** | 525 | 525 | **$42.03 — pool empty** |
| 5 rotating IPs | 4,800 | — | pool empty in ~2.6h |
| Worker throughput ceiling (5 × 63s) | — | ~285/h | **pool empty in ~1.8h minimum** |

Cheap residential proxies cost a few dollars per GB, so the "rotating IPs" row is the
default assumption, not the pessimistic one.

**Damage:** $42 of credit, and every paying customer's fetch queued behind free-plan
spam (free jobs are priority 3 and yield to paid work, but 5 busy slots still add ~63s
per position). Recovery means creating new Apify accounts by hand — the pool is 10 free
accounts, not a billable plan, so there is no "just top it up" option.

### Scenario B — Email reputation burn

Same registration loop, victim addresses instead of throwaways. 960 verification emails
per day per IP from `updates.reachinsta.co`, plus 1,440/day/account through the
unlimited `change-email` endpoint. Outcomes: Resend quota exhausted (which silently
breaks password reset for real users — `createAndSendPasswordResetCode` returns
`{success:false}` and the endpoint still reports success to the user), spam complaints
against the sending domain, and possible Resend account suspension mid-launch.

### Scenario C — Metrics poisoning

Cheapest of all and needs no fetch. `/admin/metrics` reports signups/day and PH
conversion; 2,000 fake accounts make launch-day numbers meaningless, and with no signup
IP recorded (V5) there is no way to separate them afterwards except by email pattern
guesswork.

---

## Recommendations

### Critical (before launch)

1. **Enforce `emailVerified` server-side.** Add a `requireVerifiedEmail` middleware next
   to `isAuthenticated` and apply it to `/api/fetch` and `/api/competitors`. This is the
   single highest-value change on the list — it converts "POST some JSON" into "control a
   real mailbox", which defeats Scenario A almost entirely and costs about 15 lines.
   Verify the client already handles a 403 by routing to `/verify-email`.
2. **Split the register limiter off from login.** A dedicated `registerLimiter` at
   ~5/hour/IP. Caps a single IP at 120 accounts/day ($9.60) instead of 960 ($76.80), and
   stops signup bursts from locking real users out of login.
3. **Record the signup IP on `users`.** One additive column, written in the register
   handler from `req.ip` (`trust proxy` is already set). Without it, nothing else on this
   list can be enforced or investigated after the fact. Cheap now, impossible
   retroactively.
4. **Rate-limit `/api/auth/resend-verification` and `/api/auth/change-email`.** They
   currently have no middleware. Reuse `passwordResetRequestLimiter`'s 3/hour shape.

### High priority (this week)

5. **Cloudflare Turnstile on the signup form.** Free, no user interaction in the common
   case, ~30 lines including server-side `siteverify`. The standard answer to scripted
   registration.
6. **Honeypot field on the signup form.** The pattern is already written and tested in
   `routes/contact.ts:39` and `pages/contact.tsx:97` — lift it directly. Catches naive
   bots for near-zero effort and is invisible to users.
7. **Disposable-email blocklist on register.** A static list of the top few hundred
   domains gets most of the value; refuse with a clear message.
8. **Apify pool circuit breaker.** When pool remaining drops below a threshold (say $10),
   stop accepting free-plan fetches and alert. Turns "pool drained overnight" into "free
   tier paused, paying customers unaffected".
9. **Per-IP account cap** (e.g. 3/day), once (3) is in place.

### Nice to have (later)

10. Gmail dot/plus normalisation for dedupe — zero genuine users affected today.
11. `.max()` bounds on every `registerSchema` string.
12. Move the verification/reset throttle maps out of process memory.
13. Short cooldown (or one verified login) before the first fetch is allowed.
14. Admin alert on signup-rate spikes.
15. **Clean up 385 synthetic accounts** — 367 `@reachinsta-test.local` and 18
    `@reachinsta-lifecycle.test`. They inflate "587 users" to nearly 3× the real 202 and
    will distort every launch-day metric. All 367 are unverified, profile-less, and have
    never fetched. The deletion SQL is already written in
    `tests/load/03-auth-flow.js:8-9`.

---

## Existing User Data

Read-only queries against production, 2026-09-01.

### Totals

| Metric | Value |
|---|---|
| `users` rows | 587 |
| — k6 load-test accounts (`@reachinsta-test.local`) | 367 |
| — lifecycle-test accounts (`@reachinsta-lifecycle.test`) | 18 |
| **Genuine users** | **202** |
| Genuine + verified | 192 (95.0%) |
| Genuine signups, last 30 days | 72 |
| Signups, last 7 days | 24 |
| `profiles` rows | 202 |
| `fetch_runs` | 141 (129 completed, 12 failed) |
| Apify pool | 10 keys, $50.00 total, $7.97 used, **$42.03 remaining** |

### Suspicious patterns — findings

**No evidence of a real attack.** Specifically:

- **Plus-aliased genuine accounts: 0.** All 367 plus-aliased addresses are the k6 load
  test's own `loadtest+<uid>@reachinsta-test.local` format.
- **Bot/test-prefixed addresses (`bot@`, `test1@`, `spam@`…): 0.**
- **Unverified accounts that ran a fetch: 0.** V1 is exploitable but has not been
  exploited.
- **Synthetic accounts that ran a fetch: 0.**
- **Multi-account IPs:** one — `127.0.0.1`, 3 users. That is my own local testing.
- **Numeric-suffix locals: 101 of 202** — this is *not* a bot signal. It is the ordinary
  `name1990@gmail.com` shape, and these accounts are 95% verified.
- **Domain spread is organic:** gmail.com 155, then a long tail of one-off business
  domains (`dama-agency.com`, `crownpointdigital.com`, `futuraurbana.mx`, …) plus small
  clusters of mail.ru (7) and yandex.ru (4). Exactly what real creator/agency signups
  look like.

### The one anomaly, explained

| Hour (UTC) | Signups |
|---|---|
| 2026-06-07 16:00 | 181 |
| 2026-06-07 17:00 | 186 |
| 2026-06-12 10:00 | 8 |
| every other hour ever | ≤ 6 |

All 367 are `loadtest+<uid>@reachinsta-test.local`, created 16:28–17:08, all unverified,
all profile-less, none ever fetched. This is `tests/load/03-auth-flow.js` run against its
default `BASE_URL` of `https://reachinsta.com`, nine days before rate limiting was
committed (`a279932`, 2026-06-16).

It is worth being blunt about what this record shows: **the mass-registration attack has
already been performed successfully against production, by accident, by us.** 367
accounts, 40 minutes, one machine. The only thing that made it free was a
then-incomplete registration handler that skipped profile creation. That gap is closed
now, so a repeat would cost money.

### Data-hygiene note

Genuine users (202) and `profiles` rows (202) match exactly, which is a good consistency
signal for the current registration path. The 385 synthetic rows are the only real
pollution, and they are trivially identifiable by domain.

---

## Answers to the Specific Questions Asked

| # | Question | Answer |
|---|---|---|
| 1 | Signup endpoint | `POST /api/auth/register`, `server/replit_integrations/auth/customAuth.ts:60`. Session-cookie auth (`express-session` + `connect-pg-simple`), **not** Supabase Auth — Supabase is used purely as Postgres |
| 2 | Rate limiting | Yes — `authLimiter`, 10/15min/IP, **shared with login**. No per-email limit. No global limit beyond `apiLimiter` 100/min/IP |
| 3 | Email verification | Flow exists and works (6-digit code, hashed, 24h). **Not enforced server-side.** Access is instant: the session is issued at registration |
| 4 | Bot protection | **None.** No CAPTCHA, no signup honeypot, no user-agent checks, no bot-detection library |
| 5 | Disposable email blocking | **None.** No blocklist, no MX check, no domain validation |
| 6 | Accounts per IP | Unlimited beyond the shared 10/15min. **Signup IP is not recorded at all**, so no tracking and no fingerprinting |
| 7 | Fetch abuse | A fresh account can fetch **immediately**. No cooldown, no verification gate. Free tier = 1 fetch ≈ $0.08. Only cost protection is the per-key `$0.30` floor — nothing caps aggregate spend |
| 8 | Existing patterns | Clean. 202 genuine users, 95% verified, zero attack indicators. The only spike is our own load test |
| 9 | Cost impact | Pool holds **$42.03**. 525 free fetches drain it. One compliant IP reaches that in ~14h; the worker ceiling puts the floor at ~1.8h with parallel account creation |

### Note on the cost model in the brief

The brief estimated "$80–160 Apify damage possible". The real ceiling is lower than the
low end — **$42.03** — because that is all the credit the pool holds. That is worse news,
not better: the cap is the balance running out, and it is 10 free Apify accounts that
have to be re-created by hand, not a card that can be topped up. The brief's 1,000-bot
scenario over-provisions by roughly 2×; 525 accounts is enough to take the product
offline for free users.

---

## Files Examined

`server/replit_integrations/auth/customAuth.ts` · `server/services/auth.ts` ·
`server/services/email.ts` · `server/middleware/rate-limit.ts` · `server/storage.ts` ·
`server/routes.ts` · `server/index.ts` · `server/services/keyManager.ts` ·
`shared/models/auth.ts` · `shared/schema.ts` · `shared/queue.ts` ·
`client/src/App.tsx` · `client/src/pages/register.tsx` · `tests/load/03-auth-flow.js`

No file was modified. No production data was written, updated, or deleted.
