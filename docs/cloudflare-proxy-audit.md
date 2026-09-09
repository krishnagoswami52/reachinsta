# Cloudflare Proxy Compatibility Audit

**Date:** 2026-09-03
**Scope:** Enabling the Cloudflare proxy (orange cloud) on `reachinsta.com` and `www.reachinsta.com` A records.
**Type:** Read-only. No code, config, DB, or DNS changes were made.

---

## Executive Summary

| Item | Finding |
|---|---|
| Current SSL setup | Traefik terminating TLS with a Let's Encrypt cert (apex + www SAN), HTTP→HTTPS **308** at the proxy |
| Recommended Cloudflare SSL mode | **Full (Strict)** — the origin already presents a valid publicly-trusted chain |
| Compatibility level | **Needs changes** — one code change required before enabling, one ops change strongly advised |
| Risk if enabled as-is today | **Medium-High** — not an outage, but rate limiting and abuse controls silently break |

**The blocking issue is not SSL. It's IP attribution.** The app resolves the client IP via
`app.set("trust proxy", 1)` — exactly one proxy hop, which is correct for the current
Traefik-only chain. Cloudflare inserts a second hop. `req.ip` will resolve to a
**Cloudflare edge IP** rather than the visitor, and seven rate limiters plus signup-abuse
tracking are keyed on it.

Nothing about this fails loudly. The site will look fine while legitimate users get locked
out of login and signup, and the analytics IP column fills with Cloudflare addresses.

**Recommendation: do not flip the orange cloud until `CF-Connecting-IP` is read.** It is a
small, well-contained change (one helper, ~5 call sites).

There is also a **prerequisite the plan does not account for**: the domain is not on
Cloudflare DNS yet. This is a nameserver migration, not a toggle.

---

## Current Infrastructure

### DNS (live, verified via 8.8.8.8)

| Record | Value |
|---|---|
| `reachinsta.com` A | `72.61.245.33` |
| `www.reachinsta.com` A | `72.61.245.33` (A record, not CNAME) |
| **NS** | `ns07.domaincontrol.com`, `ns08.domaincontrol.com` — **GoDaddy** |
| MX | `smtp.google.com` (pref 1) — Google Workspace |
| SPF | `v=spf1 include:_spf.google.com ~all` |
| DKIM | `google._domainkey` present |
| DMARC | **absent** |

> **`reachinsta.co` is a separate domain** (also GoDaddy NS, full Google MX set). All
> support addresses in the app are `krishna@reachinsta.co`. Proxying `.com` does not touch it.

### TLS (verified via `openssl s_client`)

```
subject  : CN=reachinsta.com
SAN      : DNS:reachinsta.com, DNS:www.reachinsta.com
issuer   : C=US, O=Let's Encrypt, CN=YR1
notBefore: Aug 31 16:35:08 2026 GMT
notAfter : Nov 29 16:35:07 2026 GMT
chain    : reachinsta.com -> Let's Encrypt YR1 -> ISRG Root YR
Verify return code: 0 (ok)
TLS 1.2 and TLS 1.3 both negotiate; ALPN offers h2
```

The origin is fully ready for **Full (Strict)**: publicly-trusted chain, both hostnames
covered, modern TLS, HTTP/2.

### Certificate renewal mechanism — inferred, and it matters

Direct evidence from port 80:

```
GET http://reachinsta.com/                              -> 308 Permanent Redirect -> https://reachinsta.com/
GET http://reachinsta.com/.well-known/acme-challenge/x  -> 404 Not Found  (no redirect, no X-Powered-By)
```

The challenge path is **exempted from the 308** and answered by something that is not
Express. That is Traefik's built-in ACME **HTTP-01 challenge handler** bound to the `:80`
entrypoint. So renewal depends on Let's Encrypt reaching the origin over plain HTTP on
port 80. See W1 below.

### Not verifiable from this machine

SSH to `root@srv1518093.hstgr.cloud` is denied (`publickey,password` — no key is configured
here), so the following were **not** confirmed and are stated as inference from external
behaviour only:

- Traefik version and container labels
- `docker-compose.yml` (it lives on the VPS at `~/reachinsta`, not in this repo)
- `acme.json` path and permissions
- **`forwardedHeaders.trustedIPs`** — the single most useful unknown; see the IP section

To close these gaps, run on the VPS:

```bash
cd ~/reachinsta && cat docker-compose.yml
docker inspect reachinsta --format '{{json .Config.Labels}}' | tr ',' '\n' | grep -i traefik
docker exec traefik traefik version
docker inspect traefik --format '{{json .Args}}'   # entrypoints, certresolver, forwardedHeaders
```

---

## Code Analysis

### Hard-coded URLs — clean

| Location | Value | Impact |
|---|---|---|
| `client/src/pages/admin-metrics.tsx:468` | `https://reachinsta.com/?utm_source=producthunt...` | None — an outbound share link in the admin UI |

No other absolute production URLs in `server/`, `client/`, or `shared/`. There is **no
`APP_URL` / `BASE_URL` / `PUBLIC_URL` env var** — `.env.example` contains no URL, domain, or
origin setting at all. Everything the app emits is relative. This is the ideal starting
position for putting a proxy in front.

### CORS — not applicable

`grep -rn "cors" server/ --include="*.ts"` returns **nothing**. There is no CORS middleware
and no `Access-Control-*` handling. The API is same-origin only, served by the same Express
process as the SPA. Cloudflare does not change the origin the browser sees, so **there is no
CORS impact**. No whitelist to update.

### Cookies — compatible, no change needed

`server/replit_integrations/auth/customAuth.ts:47-53`

```
httpOnly : true
secure   : process.env.NODE_ENV === "production"
sameSite : "lax"
domain   : (not set — host-only cookie)
```

- `secure` stays correct: Cloudflare→Traefik runs over HTTPS in Full mode, so
  `X-Forwarded-Proto: https` is preserved, and the flag is a hard boolean in production
  regardless.
- `sameSite: lax` is unaffected — Cloudflare is not a cross-site context.
- **No `domain` attribute** is set, which is the safe choice: the cookie stays host-only.
  Note this means a session on `reachinsta.com` is *not* shared with `www.reachinsta.com`.
  That is already true today and Cloudflare does not change it — but if you add a Cloudflare
  redirect rule normalising www→apex, users mid-session on the "wrong" host will appear
  logged out once. Worth knowing, not blocking.

`clearCookie` is called twice at logout with `secure: false` and `secure: true`
(`customAuth.ts:165-166, 178-179`) to cover both spellings. That remains correct.

### Trust proxy — **this is the problem**

Set to `1` in two places:

- `server/replit_integrations/auth/customAuth.ts:79` — `app.set("trust proxy", 1)`
- `server/replit_integrations/auth/replitAuth.ts:64` — same

`trust proxy = 1` means "trust exactly one hop closest to the app". Today the chain is
`client → Traefik → Express` — one hop — so `req.ip` correctly resolves to the visitor.

Adding Cloudflare makes it `client → Cloudflare → Traefik → Express` — two hops. Express
still skips only one, so `req.ip` lands on the **Cloudflare edge IP**.

The code comments explicitly document the current assumption and warn against breaking it:

> `server/middleware/rate-limit.ts:8-11`
> "The app sits behind Traefik. `app.set("trust proxy", 1)` is configured … so `req.ip`
> resolves to the real client IP from X-Forwarded-For. **Do NOT remove that setting or every
> request will look like it comes from the proxy and share one limit bucket.**"

Adding Cloudflare produces precisely the failure that comment warns about, without anyone
removing the setting.

### Empirical verification (5 read-only GETs against production)

Using the limiter's own `RateLimit-Remaining` header as an oracle:

| Request | `RateLimit-Remaining` |
|---|---|
| baseline #1 | 99 |
| baseline #2 | 98 |
| `X-Forwarded-For: 1.2.3.4` #1 | 97 |
| `X-Forwarded-For: 1.2.3.4` #2 | 96 |
| `CF-Connecting-IP: 9.9.9.9` | 95 |

The counter decrements **unbroken across all five**. Confirms two things:

1. Spoofed `X-Forwarded-For` does **not** move the bucket — the current setup is correct and
   not client-spoofable. Good hygiene today.
2. `CF-Connecting-IP` is **completely ignored** — nothing in the stack reads it yet.

### IP handling — current baseline (read-only DB query)

| Table | Rows sampled | Distinct IPs | NULL | Private (172./10.) |
|---|---|---|---|---|
| `page_views.ip_address` | last 1000 | **608** | 0 | 21 |
| `users.ip_address` | 215 (all) | 10 | 203 | 0 |
| `contact_queries.ip_address` | 5 (all) | 2 | 0 | — |

608 distinct IPs per 1000 page views is a healthy real-visitor distribution. **This is what
collapses** — after proxying, expect that number to drop to roughly the count of Cloudflare
edge IPs serving your traffic (typically single digits to low tens).

`page_views.country` is populated **0 out of 500** rows, because `tracking.ts` reads
`req.headers["cf-ipcountry"]`, which does not exist without Cloudflare in front. (See N-note
below — this one actually improves.)

### Three distinct IP-reading code paths

| Path | Location | Behaviour with Cloudflare |
|---|---|---|
| `req.ip` (Express, `trust proxy=1`) | `customAuth.ts:73`, `contact.ts:55`, `rate-limit.ts:108,167` + 6 default keyGenerators | **Breaks** → Cloudflare edge IP |
| `req.headers["x-forwarded-for"].split(",")[0]` | `tracking.ts:76-80` | Stays *approximately* right (leftmost = client) but becomes **client-spoofable** |
| `req.headers["cf-ipcountry"]` | `tracking.ts:82` | **Starts working** (currently always null) |

> On `tracking.ts`: taking XFF`[0]` is the leftmost entry, which under Cloudflare is the real
> client. But Cloudflare *appends* to a client-supplied `X-Forwarded-For` rather than
> replacing it, so a visitor sending their own XFF header poisons the leftmost value. Today
> Traefik's sanitisation makes this moot (proven by the test above). Under Cloudflare it
> becomes a live analytics-integrity hole. Switching this line to `CF-Connecting-IP` fixes it
> and is strictly better than the status quo.

---

## Compatibility Issues Found

### Critical — fix before enabling the proxy

**C1. `req.ip` resolves to a Cloudflare edge IP; seven rate limiters key on it.**

`server/middleware/rate-limit.ts`. Limiters using the default (IP) key generator:

| Limiter | Budget | Endpoint | Effect when shared across a Cloudflare PoP |
|---|---|---|---|
| `contactLimiter` | **3 / hour** | `POST /api/contact` | 3 contact submissions per hour *for everyone behind that edge IP* |
| `passwordResetRequestLimiter` | **3 / hour** | `/api/auth/forgot-password` | 3 password resets per hour, globally per PoP |
| `registerLimiter` | **5 / hour** | `/api/auth/register` | **5 signups per hour, total** — a launch-day killer |
| `passwordResetCodeLimiter` | 5 / 15 min | `/api/auth/reset-password` | 5 code attempts per PoP |
| `changePasswordLimiter` | 5 / hour | `/api/auth/change-password` | Shared bucket |
| `authLimiter` | 10 / 15 min | `/api/auth/login` | 10 login attempts per 15 min per PoP |
| `apiLimiter` | 100 / min | all `/api/*` | Shared across every unauthenticated visitor on that edge IP |

`fetchLimiter` and `emailActionLimiter` key on user ID first and only fall back to IP, so
authenticated traffic is safe. **Everything on the unauthenticated path — signup, login,
password reset, contact — is not.**

The tightest budgets sit on exactly the endpoints a launch needs working. `registerLimiter`
at 5/hour is the one to worry about: if a Product Hunt burst arrives through one Cloudflare
PoP, the sixth signup of the hour gets a 429.

**C2. Signup abuse tracking records the wrong IP.**

`customAuth.ts:73` `clientIp()` → stored in `users.ip_address`. The column exists to make
per-IP signup counts possible (per its own docstring). Post-proxy it stores Cloudflare
addresses, so the duplicate-signup signal is destroyed — and worse, it looks like hundreds of
accounts from one IP, which will mislead any future abuse rule built on it.

**Fix for both:** read `CF-Connecting-IP` when present, fall back to `req.ip`.

```ts
// single helper, used by clientIp(), contact.ts, and the limiter keyGenerators
const cf = req.headers["cf-connecting-ip"];
const ip = (typeof cf === "string" && cf) || req.ip || req.socket.remoteAddress || "";
```

Note for the limiters specifically: `express-rate-limit` v8 throws an IPv6 validation error
on a raw string key, so any custom `keyGenerator` must wrap the result in `ipKeyGenerator(...)`
— the same pattern already used at `rate-limit.ts:108` and `:167`.

`CF-Connecting-IP` is safe to trust **only** once the origin is reachable only via Cloudflare
(see W3), because any direct-to-origin caller can forge it. This is also why it must be read
as a *preference over* `req.ip`, not a blind override, and why W3 is paired with this fix
rather than optional.

---

### Warnings — need attention, not necessarily before flipping

**W1. Let's Encrypt renewal path changes, and fails silently.**

Traefik is using the **HTTP-01** challenge on port 80 (evidenced by the un-redirected 404 on
`/.well-known/acme-challenge/`). Once proxied, Let's Encrypt's validator reaches Cloudflare,
not your origin.

In practice this *usually still works*: Cloudflare forwards plain HTTP to origin `:80` in Full
mode, and exempts `/.well-known/acme-challenge/` from "Always Use HTTPS". But it is the most
fragile link in the chain, and the failure mode is bad:

- Cert expires **Nov 29, 2026**; Traefik will attempt renewal around **Oct 30, 2026**.
- If it fails, nothing alerts you.
- Under **Full (Strict)**, an expired origin cert is a **hard site outage**.
- Under **Full**, Cloudflare ignores origin cert validity, so the site stays up and the
  problem hides until something else surfaces it.

**Durable fix (recommended):** install a **Cloudflare Origin Certificate** (free, 15-year
validity) on Traefik and drop the Let's Encrypt resolver for these hostnames. It removes the
renewal dependency entirely and is fully compatible with Full (Strict).
**Alternative:** switch Traefik's resolver to a **DNS-01** challenge against the Cloudflare
API, which is immune to proxy state.

Either way, verify renewal well before late October rather than discovering it at expiry.

**W2. Do not use Cloudflare SSL mode "Flexible" — it will produce an infinite redirect loop.**

Flexible means Cloudflare talks to the origin over plain **HTTP on :80**. Traefik answers
every non-ACME `:80` request with `308 → https://reachinsta.com/`. Cloudflare follows that
back to itself, and loops until it errors.

Verified directly:

```
curl -I http://reachinsta.com      -> 308, Location: https://reachinsta.com/
curl -I http://www.reachinsta.com  -> 308, Location: https://www.reachinsta.com/
```

This is the single fastest way to take the site down. **Use Full (Strict).**

Reassuringly, the loop risk is *only* at the Traefik layer — there is **no HTTPS redirect, no
`helmet`, and no HSTS in application code** (grep for `helmet|hsts|Strict-Transport|req.secure|
x-forwarded-proto` in `server/` returns nothing but two unrelated `res.redirect("/")` calls
after logout). So there is no second, hidden redirect source to untangle.

**W3. The origin stays directly reachable, which undoes most of the benefit.**

`72.61.245.33` currently resolves publicly and is in DNS history permanently. After proxying,
anyone who knows it can bypass Cloudflare entirely — skipping the WAF, the DDoS protection,
and the rate limits you just fixed. It also means `CF-Connecting-IP` is forgeable by a direct
caller.

Firewall the VPS to accept :80/:443 **only from Cloudflare's published IP ranges**
(`https://www.cloudflare.com/ips/`), or use `cloudflared`. Without this, C1's fix is
trust-on-faith.

**W4. Nameserver migration is a prerequisite, and it is the riskiest step here.**

The plan assumes the records are already in Cloudflare. They are not — `reachinsta.com` is
delegated to **GoDaddy** (`ns07/ns08.domaincontrol.com`). Cloudflare's free plan requires
**full nameserver delegation**; per-record proxying via CNAME setup is Business-plan-only.

So this is not "flip a toggle" — it is "move all DNS to Cloudflare, then flip a toggle".
Cloudflare's scan usually imports records correctly, but **verify these before changing
nameservers at the registrar**, because a miss takes down *email*, not just the site:

- `MX → smtp.google.com` (pref 1) — **Google Workspace. Losing this loses mail.**
- `TXT @ → v=spf1 include:_spf.google.com ~all`
- `TXT google._domainkey → v=DKIM1; k=rsa; p=MIIBIjANBg...` (long value, split across two
  strings — confirm it imports as one record, this is a common truncation point)
- `A @ → 72.61.245.33`, `A www → 72.61.245.33`
- Any Google site-verification TXT

MX and TXT records are never proxied, so the orange cloud itself poses no email risk — the
risk is entirely in the migration.

**W5. Never let Cloudflare cache `/api/*`.**

Cloudflare's default rules cache by file extension, and `/api/profile` has none, so the
default configuration is safe. But `express.static` serves everything with
`Cache-Control: public, max-age=0` and **API JSON responses carry no `Cache-Control` header at
all** (verified: `GET /api/webhooks/paddle` returns none).

That means a "Cache Everything" page rule — a very common performance tweak — would have
nothing telling it to stop, and could serve one authenticated user's `/api/profile` JSON to
another. Add an explicit **Cache Rule: bypass cache for `/api/*`** as a guardrail before
anyone is tempted to enable aggressive caching.

**W6. Bot Fight Mode can break the Paddle webhook.**

`POST /api/webhooks/paddle` (`server/routes/paddleWebhook.ts:72`) is a server-to-server call
from Paddle's infrastructure. Cloudflare's Bot Fight Mode / managed challenges can issue a JS
challenge to non-browser POSTs. Paddle cannot solve one — it sees a 403 and the subscription
event is lost.

Mitigations, in order of preference:

1. **The URL does not change**, so nothing needs updating in the Paddle dashboard. Good.
2. Add a **WAF skip rule** for `/api/webhooks/*` (skip Bot Fight Mode + managed challenge).
3. Leave Bot Fight Mode **off** initially.

The endpoint is already well-defended on its own — HMAC signature verification plus a
timestamp replay window (`paddleWebhook.ts:87-109`) — so exempting it from Cloudflare's bot
checks does not weaken it meaningfully.

Also note `server/index.ts:50-53` already exempts `/webhooks/` from `apiLimiter`, so
Cloudflare is the only new thing that could throttle it.

---

### Nice-to-have — after enabling

- **N1. CDN caching is currently near-useless.** `serveStatic` (`server/static.ts:14`) uses
  bare `express.static` with no `maxAge`, so even content-hashed Vite bundles under `/assets/`
  ship `Cache-Control: public, max-age=0`. Cloudflare will revalidate on every request. Set a
  long `maxAge` on `/assets/` (they are hash-named, so it is safe) or add a Cloudflare Cache
  Rule with an Edge TTL override. Without this you get the WAF and DDoS benefits but
  essentially none of the CDN speed benefit.
- **N2. No DMARC record** on `reachinsta.com`. Unrelated to Cloudflare, but you will already be
  in the DNS editor. Start with `v=DMARC1; p=none; rua=mailto:...`.
- **N3.** Consider consolidating the two `app.set("trust proxy", 1)` calls (`customAuth.ts:79`,
  `replitAuth.ts:64`) into one place in `server/index.ts`. Two sources of truth for a value
  this load-bearing is how it drifts.

---

## Recommendations

### If enabling the proxy

1. **Cloudflare SSL mode: `Full (Strict)`.** The origin presents a valid, publicly-trusted
   Let's Encrypt chain covering both hostnames. Never `Flexible` (W2). Never `Off`.
2. **Trust proxy: leave at `1`, and do not "fix" this by bumping it to `2`.** `trust proxy = 2`
   would work only while the chain is exactly Cloudflare→Traefik, and it silently becomes
   wrong the moment a hop is added or removed. Read `CF-Connecting-IP` instead — it is
   explicit and hop-count independent.
3. **IP detection: prefer `CF-Connecting-IP`, fall back to `req.ip`.** One shared helper,
   applied at:
   - `customAuth.ts:73` (`clientIp`)
   - `contact.ts:55`
   - `tracking.ts:76-80` (replaces the spoofable XFF`[0]` read)
   - custom `keyGenerator`s on all seven IP-keyed limiters in `rate-limit.ts`, each wrapped in
     `ipKeyGenerator()` for IPv6 normalisation
4. **Paddle webhook URL: no change needed.** Same hostname, same path. Add a WAF skip rule for
   `/api/webhooks/*` (W6).
5. **Lock the origin to Cloudflare IP ranges** (W3) — this is what makes step 3 trustworthy.
6. **Move certificate management to a Cloudflare Origin Certificate** (W1), or verify HTTP-01
   renewal survives before late October.
7. **Add a Cache Rule bypassing `/api/*`** (W5).

Steps 3 and 5 should ship *before* the orange cloud goes on. The rest can follow.

### If NOT enabling the proxy (DNS-only / grey cloud)

Correcting one premise in the brief:

- **Turnstile does not require the proxy.** More to the point, `grep -rn "turnstile"` across
  `server/` and `client/` returns **zero matches** — Turnstile is not implemented at all. When
  you do add it, it is a JS widget plus a server-side `siteverify` call and works on any
  domain regardless of proxy status, or even on non-Cloudflare DNS.
- **DNS speed: yes, and it is independent of the orange cloud.** Cloudflare's anycast
  authoritative DNS is faster than GoDaddy's, and you get it from the nameserver migration
  (W4) alone. Grey-cloud everything and you still get this.

**What you give up by staying grey:**

| Lost | Real impact for you |
|---|---|
| CDN edge caching | Currently minimal anyway — see N1, `max-age=0` on all assets |
| L7 DDoS protection | Real. Single VPS, single Node container, in-memory rate limits that reset on deploy |
| WAF / managed rules | Real but not urgent pre-launch |
| Bot Fight Mode | Would help against Instagram-adjacent scraping interest |
| Origin IP masking | You keep exposing `72.61.245.33` |
| `CF-IPCountry` geo data | `page_views.country` stays 0% populated |

**Verdict for launch:** the honest sequencing is **migrate nameservers to Cloudflare now, keep
both records grey-clouded, ship the `CF-Connecting-IP` change, then flip to orange.**

That decouples the risky, hard-to-reverse step (NS migration, with Google Workspace mail
riding on it) from the easy, instantly-reversible one (the proxy toggle). You get faster DNS
immediately, break nothing, and hold a one-click path to full protection the moment the IP
handling is ready. Flipping orange before the code change buys DDoS protection at the cost of
rate limiting that no longer distinguishes between users.

---

## Testing Plan

### Before flipping (while still grey)

1. Confirm every record from W4 exists in the Cloudflare dashboard — **especially MX and the
   two-part DKIM TXT**.
2. Send and receive a test email on `@reachinsta.com` after the NS change propagates.
3. Deploy the `CF-Connecting-IP` change and confirm it is a no-op while grey (the header is
   absent, so the `req.ip` fallback carries it — nothing should regress).

### Immediately after flipping (in order)

1. `curl -sSI https://reachinsta.com` and `https://www.reachinsta.com` — expect `200` and a
   `cf-ray` header. Cert issuer should now be Google Trust Services / Cloudflare, not LE.
2. `curl -sSI http://reachinsta.com` — expect a redirect, **not** a loop or
   `ERR_TOO_MANY_REDIRECTS`.
3. **Log in.** Confirms session cookies survive (`Secure` + `SameSite=Lax` through the edge).
4. **Register a fresh test account.** Then query
   `SELECT ip_address FROM users ORDER BY created_at DESC LIMIT 1` — it must be **your real
   IP**, not a Cloudflare edge address. This is the single most important check.
5. `SELECT country FROM page_views ORDER BY created_at DESC LIMIT 5` — should now be populated.
   Confirms `CF-IPCountry` is arriving.
6. Re-run the rate-limit oracle from this audit:
   `curl -sS -D - -o /dev/null https://reachinsta.com/api/profile | grep -i ratelimit`
   from two different networks (e.g. laptop + phone on cellular). The `RateLimit-Remaining`
   counters must be **independent**. If they share a counter, C1 is not fixed — roll back.
7. **Paddle:** trigger a sandbox subscription event and confirm it lands. Check
   `docker logs reachinsta | grep "Paddle Webhook"`. If it does not arrive, Bot Fight Mode is
   the first suspect (W6).
8. `POST /api/contact` once — confirm it is not already rate-limited by someone else's traffic.
9. `POST /api/fetch` — should return immediately with a queued run (it is queue-based, so
   Cloudflare's 100-second edge timeout is **not** a risk here; verified at
   `routes.ts:226-308`).

### Rollback

**Set the record back to grey (DNS-only) in the Cloudflare dashboard.** Propagates in seconds
to a couple of minutes, since Cloudflare serves the authoritative zone. Traefik and the Let's
Encrypt cert are untouched throughout, so the origin keeps serving valid TLS directly the
instant the proxy steps aside.

This is why the proxy toggle is the *safe* half of this project and the nameserver migration
is the risky half. Rolling back the NS change means waiting on registrar propagation with your
email in the balance.

---

## Constraints and Limitations of This Audit

- Read-only. No code, DB, config, or DNS changes.
- **No VPS access.** SSH to `root@srv1518093.hstgr.cloud` is denied from this machine (no key
  configured). Part 1 of the brief — Traefik version, container labels, `acme.json` location,
  `forwardedHeaders.trustedIPs` — could not be inspected directly. Findings about Traefik are
  **inferred from external HTTP/TLS behaviour** and are labelled as such. The commands to close
  those gaps are listed above.
- Active probes were limited to 8 read-only GETs against production plus three read-only
  `SELECT` queries. No writes.
- One genuinely open question: whether Traefik **overwrites** or **appends** to a
  client-supplied `X-Forwarded-For`. Traefik's default is to strip untrusted `X-Forwarded-*`,
  and the empirical test is consistent with that but cannot distinguish the two cases, because
  `trust proxy=1` lands on the same address either way. **It does not change the conclusion** —
  `req.ip` becomes a Cloudflare edge IP under both. It does matter for whether an XFF-based fix
  would work, which is the second reason to use `CF-Connecting-IP`: that header is not an
  `X-Forwarded-*` header, so Traefik's sanitisation never touches it.
