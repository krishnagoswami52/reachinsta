# Contact Form Audit Report

> **Type:** READ-ONLY investigation — no code, DB, or config was modified
> **Date:** 2026-08-31
> **Scope:** `client/src/pages/contact.tsx`, `server/`, `shared/schema.ts`, `supabase/migrations/`
> **Branch:** `main` @ `7002fdf`

---

## Executive Summary

There is exactly **one** contact form in the codebase — `client/src/pages/contact.tsx`, served at
`/contact` — and it never talks to the backend at all. On submit it builds a `mailto:` URL and
assigns it to `window.location.href` (`contact.tsx:20-21`), then unconditionally flips to a success
screen. There is no `fetch`, no `/api/contact` endpoint anywhere in `server/`, no `contact_queries`
(or equivalent) table in `shared/schema.ts`, and no contact email template. The chain does not break
in the middle — it never starts.

The practical consequence is that every query depends on the visitor's own machine having a working
`mailto:` handler *and* on them manually pressing send in that client. On desktop Chrome without a
default mail app configured — the common case for webmail-only users — the navigation does nothing
visible, yet React still renders **"Your mail client is open."** (`contact.tsx:161`). The `try/catch`
that would set an error is effectively dead code: assigning an unhandled protocol to
`window.location.href` does not throw, so `setError` is unreachable in practice. Nothing is logged,
nothing is stored, and there is no way to know a lead was lost. To the page's credit, the helper copy
at `contact.tsx:151-154` does tell the user what will happen, so this is lossy rather than deceptive
— but it is still lossy, which is the wrong property to carry into a Product Hunt launch.

The good news is that almost all the infrastructure a real implementation needs is already built and
proven in this repo: Resend is wired up with a working send-and-catch pattern and two live HTML
templates (`server/services/email.ts`), `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are present in
`.env`, `express-rate-limit` has six configured limiters to copy from, zod validation is the
established route pattern, and there is a clean additive-migration template for adding a new table.
A minimum viable fix is genuinely small — the estimate below is a little over an hour for the
critical path, because there is nothing to design, only pieces to wire together. **One decision is
required before any code is written: which address should receive queries** (three different
addresses currently appear in the repo — see [Open Questions](#open-questions-need-your-decision)).

---

## Current State

### Where Contact Forms Exist

| File | URL / context | Status |
|---|---|---|
| `client/src/pages/contact.tsx` | `/contact` — standalone page | **The only form.** Fully rendered, `mailto:`-based, no backend |
| `client/src/App.tsx:92-93` | Route registration | Works. Hand-rolled `location === "/contact"` check, not a `<Route>` |
| `client/src/pages/landing.tsx:466` | Footer link → `/contact` | Link only, no form |
| `client/src/pages/features.tsx:459` | Footer link → `/contact` | Link only, no form |
| `client/src/pages/privacy.tsx:248` | Footer link → `/contact` | Link only, no form |
| `client/src/pages/terms.tsx:202` | Footer link → `/contact` | Link only, no form |
| `client/src/pages/contact.tsx:257` | Own footer link → `/contact` | Link only (self-referential) |

**Explicitly checked and NOT present:**

- No contact section embedded on the landing page — `landing.tsx` only has bare `mailto:` anchors
  (`landing.tsx:355`, `landing.tsx:372`)
- No contact form in any footer (footers carry a `/contact` link only)
- No contact modal or popup anywhere
- No newsletter / waitlist / lead-capture form. `grep -rn "<form" client/src/` returns 8 forms
  total: contact plus 7 auth/profile forms (verify-email x2, forgot-password, reset-password,
  register, login, profile password change). **Contact is the only public non-auth form.**

`exports.tsx:46-48` has a `button-contact-admin` testid, but that is an upgrade CTA, not a form.

**Direct `mailto:` links to `krishna@reachinsta.co` exist in 8 files** (16 occurrences: contact,
landing, login, profile, terms, privacy, forgot-password, reset-password). These are a genuine
fallback channel and are unaffected by anything below.

### Primary Form Details

- **Location:** `client/src/pages/contact.tsx`
- **URL:** `/contact` (registered `client/src/App.tsx:92-93`; public, no auth gate)
- **Fields:**

  | Field | Type | Required | Notes |
  |---|---|---|---|
  | Name | `<input type="text">` (`:81-88`) | yes — `required` | placeholder "Krishna" |
  | Email | `<input type="email">` (`:94-101`) | yes — `required` | native format check |
  | Subject | `<select>` (`:109-121`) | **no** | Bug report / Feature request / Billing question / Partnership / Other; the empty "Pick a reason…" option is selectable and submits as `""` |
  | Message | `<textarea rows={6}>` (`:128-135`) | yes — `required` | no max length |

  **No** company, phone, or honeypot field.

- **Library:** None. Plain `useState` x 7 (`:7-13`) on a native HTML `<form>`. No react-hook-form,
  no formik, no zod on this page.
- **Validation:** Browser-native only — the `required` attribute on 3 of 4 fields plus
  `type="email"`. No length caps, no trim, no custom messages, no server-side validation (there is
  no server side). The `error` state exists (`:13`) and renders (`:138-140`) but is unreachable in
  practice, see below.
- **Submit target:** **Nowhere.** `handleSubmit` (`:15-28`) constructs
  `mailto:krishna@reachinsta.co?subject=…&body=…` and assigns it to `window.location.href`
  (`:20-21`). There is no `fetch`, no `apiRequest`, no XHR. Zero network requests leave the page.
- **Success behavior:** `setSubmitted(true)` runs on the line immediately after the assignment
  (`:22`) — unconditionally, with no knowledge of whether a mail client actually opened. The user
  sees a confirmation panel reading **"Your mail client is open."** (`:157-174`), plus a fallback
  line pointing at the direct address and a "← Send another" reset button.
- **Loading state:** `submitting` toggles `true` then `false` in a `finally` within the same
  synchronous tick (`:17`, `:26`). The button's "Sending…" label (`:147`) is never meaningfully
  visible.
- **Dead error path:** navigating to an unregistered protocol handler does not throw a catchable JS
  exception, so the `catch` block (`:23-25`) essentially never fires. **A user whose browser has no
  mail handler sees the success screen anyway.**

---

## The Broken Chain

```
User fills form                → OK    renders fine, fields work
User clicks submit             → OK    onSubmit fires, preventDefault called
Form validation runs           → WEAK  browser-native only; Subject not required
Request sent to backend        → FAIL  ◀── CHAIN BREAKS HERE. No fetch exists at all.
Backend endpoint exists        → FAIL  no /api/contact anywhere in server/
Endpoint validates input       → FAIL  n/a
Data saves to database         → FAIL  no contact table in schema
Email notification sent        → FAIL  depends on the USER's mail client + the USER pressing send
Auto-reply sent to user        → FAIL  n/a
User sees confirmation         → WEAK  shows success unconditionally — even when nothing happened
```

**The break is at step 4.** Everything downstream is absent rather than broken. Steps 3 and 10 are
marked WEAK rather than OK because they are present but unreliable: validation is browser-only, and
the confirmation is a false positive whenever the `mailto:` handoff silently fails.

### What actually happens per environment

| Environment | Result |
|---|---|
| Desktop with a configured mail client (Outlook, Mail.app, Thunderbird) | Client opens with a prefilled draft. **User must still press send.** Query arrives only if they do. |
| Desktop, webmail only, no `mailto:` handler | Navigation does nothing, or Chrome/OS shows a protocol-handler prompt. **Query silently lost. Success screen shown anyway.** |
| Mobile browser | Mail app usually opens with the draft. Same manual-send requirement. |
| In-app browser (Instagram, LinkedIn) | `mailto:` is frequently blocked outright. **Query silently lost.** |

Given the audience is Instagram creators arriving largely from mobile and in-app browsers, the
silent-loss cases are plausibly the *majority* of submissions.

### Observability

- **No analytics event fires on submit.** The `trackPageView` middleware
  (`server/middleware/tracking.ts`) records page loads only, explicitly skips `/api/`
  (`tracking.ts:18-29`), and never sees a form submit. A `/contact` **visit** is recorded in
  `page_views`; a **submission** is not.
- No `console.log`, no server log, no DB row. **There is currently no way to know how many queries
  have been lost.**

---

## Existing Infrastructure

### Already there — directly reusable

| Piece | Location | Reuse for contact form |
|---|---|---|
| **Resend client** | `server/services/email.ts:6` — lazily constructed, null-safe when key missing | Import and send the notification + auto-reply |
| **Email send pattern** | `email.ts:44-78` — `resend.emails.send()` in try/catch, warns when unconfigured, returns `{success, error}` | Copy verbatim for a contact template |
| **HTML email template** | `email.ts:48-72`, `email.ts:126-150` — gradient header + white card, inline styles | Copy structure for the query notification |
| **`RESEND_API_KEY`** | present in `.env` and `.env.example` | no new config needed |
| **`RESEND_FROM_EMAIL`** | `.env` → `noreply@updates.reachinsta.co` (sending domain already used in prod) | no new config needed |
| **Rate-limit factory patterns** | `server/middleware/rate-limit.ts` — 6 limiters incl. `passwordResetRequestLimiter` (3/hour/IP), the exact shape a contact limiter wants | Add a `contactLimiter` alongside |
| **Baseline API limiter** | `server/index.ts:51-54` — `apiLimiter` (100/min/IP) already applies to all `/api/*` | A new endpoint is DoS-protected on day one, for free |
| **Zod route validation** | `server/routes.ts:19-50` — schemas declared at module top, parsed in-handler | Add a `contactSchema` in the same style |
| **Drizzle table pattern** | `shared/schema.ts` — `pgTable` + `createInsertSchema`, 10 tables | Add a `contactQueries` table |
| **Storage layer** | `server/storage.ts:56` `IStorage` interface + `:143` `DatabaseStorage` | Add `createContactQuery` / `getContactQueries` |
| **Additive migration template** | `supabase/migrations/20260819000000_add_page_views.sql` — additive, idempotent, `ENABLE ROW LEVEL SECURITY` with no policy (deny-all for PostgREST; backend is superuser and bypasses) | Copy header + RLS convention exactly |
| **Admin router + auth** | `server/routes/admin.ts` mounted at `/api/admin` (`server/index.ts:103`), `requireAdmin` from `server/middleware/adminAuth.ts:16` | Add `GET /api/admin/contact-queries` |
| **Admin UI pattern** | `client/src/pages/admin-metrics.tsx:603-627` — `useQuery` + `fetchAdmin` helper | Add a queries table/section |
| **Client fetch helper** | `client/src/lib/queryClient.ts:10-24` `apiRequest(method, url, data)` with `credentials: "include"` | Wire the form's submit |
| **Error message system** | `server/utils/errorMessages.ts` — user-friendly copy, e.g. `UNKNOWN_ERROR` at `:55` | Reuse for contact failure states |

### Missing — must be built

1. **`POST /api/contact` endpoint** — does not exist. `grep -rni "contact" server/` returns only 3
   hits, all of them copy strings inside error messages (`subscription.ts:58`, `:98`,
   `errorMessages.ts:55`). There is no contact route file.
2. **`contact_queries` table** — `shared/schema.ts` defines 10 tables (`profiles`, `competitors`,
   `fetch_runs`, `reels`, `competitor_stats`, `raw_payloads`, `jobs`, `apify_keys`, `page_views`,
   `processed_webhook_events`). **None** store contact/lead/inquiry data.
3. **Migration** for that table (plus its RLS enable line).
4. **Storage helpers** — no `createContactQuery` in `server/storage.ts`.
5. **Contact email template** — the two existing templates are verification and password reset only.
6. **Destination-address config** — no `CONTACT_EMAIL_TO` (or equivalent) in `.env` / `.env.example`.
7. **Frontend submit rewiring** — replace the `mailto:` handoff with a real `apiRequest` call.
8. **Spam protection specific to a public unauthenticated write** — no honeypot field, no
   contact-specific limiter.
9. **Any observability** — no logging, no analytics event, no admin visibility.

---

## Recommendations

### Quick Fix (~70 min) — stop losing queries

The minimum that makes the form actually work end to end.

1. Add `contactQueries` to `shared/schema.ts` + an additive migration modelled on
   `20260819000000_add_page_views.sql` (columns: `id`, `name`, `email`, `subject`, `message`,
   `ip_address`, `user_agent`, `user_id` nullable FK, `created_at`; `ENABLE ROW LEVEL SECURITY`,
   no policy).
2. Add `POST /api/contact` (new `server/routes/contact.ts`, mounted like `subscriptionRouter`),
   public, zod-validated, with length caps on every field.
3. Insert the row **first**, then send the notification email via the existing Resend client —
   and **do not fail the request if the email send fails**. The DB row is the durable record; the
   email is a convenience. This single ordering choice is what guarantees no query is ever lost
   again, even during a Resend outage.
4. Rewire `contact.tsx:15-28` to `apiRequest("POST", "/api/contact", {...})`, keep a real loading
   state, show a genuine success screen and — importantly — a **real error state** with the direct
   `mailto:` address as the fallback.

**Deliberately deferred from the quick fix:** auto-reply, admin UI, analytics. None of them prevent
data loss.

### Complete Solution (~2 h 30 min) — production-ready

Quick Fix, plus:

- **`contactLimiter`** in `server/middleware/rate-limit.ts` — suggest 5/hour/IP, mirroring
  `passwordResetRequestLimiter`'s shape. Note the in-memory-store caveat documented at
  `rate-limit.ts:10-14` (fine at one container; needs a shared store if ever scaled out).
- **Honeypot field** — hidden input; silently return 200 without persisting when filled. Cheapest
  bot defense available for a public write endpoint.
- **Auto-reply to the submitter** — a third Resend template, sent best-effort, never blocking.
- **Admin view** — `GET /api/admin/contact-queries` behind `requireAdmin`, surfaced in
  `admin-metrics.tsx` using the existing `fetchAdmin` + `useQuery` pattern.
- **Duplicate detection** — reject an identical (email, message) pair inside a short window.
- **Structured logging** on both success and failure, so silent loss becomes impossible.
- **Attach `user_id`** when the submitter happens to be logged in — free context for support.

### Nice-to-Have (later)

- Telegram / Slack push on new query (useful for launch-day response time)
- CRM sync
- Canned response templates in the admin view
- Per-subject routing (billing → one inbox, bugs → another)
- CSV export of queries, reusing the existing `/api/export/*.csv` pattern (`routes.ts:617`)

---

## Estimated Effort

| Task | Time | Priority | Notes |
|---|---|---|---|
| Add DB table + migration | 15 min | **Critical** | Template exists; +5 min over the prompt's estimate for the migration file's safety header |
| Add API endpoint | 20 min | **Critical** | New `server/routes/contact.ts` + zod schema + mount |
| Add email sending | 15 min | **Critical** | Copy the `email.ts` template pattern |
| Update frontend | 20 min | **Critical** | Replace `mailto:` with `apiRequest`; real error state |
| **Quick Fix subtotal** | **~70 min** | | |
| Rate limiting | 10 min | High | One limiter object + one `.use()` |
| Honeypot | 5 min | High | Hidden input + server-side check |
| Auto-reply | 15 min | Medium | Third template |
| Admin view | 30 min | Medium | Endpoint + UI section |
| Duplicate detection | 10 min | Medium | |
| Analytics / logging | 10 min | Low | |
| **Complete Solution total** | **~2 h 30 min** | | |

> The prompt's 30-minute Quick Fix estimate assumed the table could be added instantly. Writing a
> migration in this repo's documented style (safety header, idempotency, RLS note) plus a
> non-lying error state on the frontend is what accounts for the difference. Still a single sitting.

---

## Open Questions (need your decision)

1. **Which address receives queries?** Three appear in the repo, and they disagree:
   - `krishna@reachinsta.co` — what the contact page shows users today (`contact.tsx:20`, `:153`,
     `:166`, `:188`) and what 8 files link to
   - `business@techcm.in` — named in the audit prompt's Quick Fix section
   - `krishna@techcm.in` — `SUPER_ADMIN_EMAIL` in `.env`

   Whatever is chosen should go into a new `CONTACT_EMAIL_TO` env var rather than being hardcoded,
   and the user-facing copy across those 8 files should be reconciled with it.

2. **Keep the `mailto:` fallback in the UI?** Recommended yes — as a secondary link beneath the
   form, not as the submit mechanism. It costs nothing and gives users an escape hatch if the API
   is down.

3. **Should Subject become required?** It is currently optional and submits as `""`
   (`contact.tsx:115`). Making it required improves triage; leaving it optional lowers friction.

4. **Auto-reply before launch, or after?** It is the biggest perceived-quality win for a Product
   Hunt audience, but it is also the piece most likely to trip Resend sending limits or land in
   spam if the domain warm-up is thin.

---

## Constraints (for the future fix)

The fix must be purely additive. Specifically, **do not touch**:

- All C1 + C2 + H1 + H2 audit fixes already applied
- Admin dashboard (`/admin` user management, `/admin/metrics` analytics) — extend only, never modify
- The fetch flow (`/api/fetch`, queue, worker, Apify key rotation)
- Pricing / plans / Paddle subscription state
- Existing auth (sessions, bcrypt, verification and reset token flows)
- The user-friendly error system (`server/utils/errorMessages.ts`)
- The RLS posture established in `20260501000000_enable_rls_security.sql` — a new table must
  `ENABLE ROW LEVEL SECURITY` with no policy, matching the `page_views` precedent
- Paddle webhook body-parser ordering in `server/index.ts:36` — the new router must mount **after**
  `express.json()`, not before

---

## Appendix: Verification Commands Run

```bash
grep -rn "contact" client/src/ --include="*.tsx" --include="*.ts"   # 17 hits — 1 page, rest links
grep -rni "contact" server/ shared/ --include="*.ts"                # 3 hits — all error-copy strings
grep -nE "export const [a-zA-Z]+ = pgTable" shared/schema.ts        # 10 tables, none contact-related
grep -rn "<form" client/src/ --include="*.tsx"                      # 8 forms — contact + 7 auth/profile
grep -rn "mailto:" client/src/                                      # 16 links across 8 files
ls supabase/migrations/                                             # 6 migrations, none contact-related
```

**No files were modified during this audit.** The only write was this report.
