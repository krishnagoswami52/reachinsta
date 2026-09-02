# Supabase Security Warnings Audit

**Date:** 2026-09-02
**Project:** ReachInsta — `wvqaljqbwmeakljqzzmr`
**Trigger:** Supabase advisor email, 2026-08-31 (`rls_disabled_in_public`, `sensitive_columns_exposed`)
**Scope:** READ-ONLY at time of writing. Every DB session was opened with
`SET default_transaction_read_only = on`. No schema, policy, grant, or row was
modified during the audit. No anon key was obtained or used.

> **STATUS: partially remediated 2026-09-02.** RLS is now enabled on **15/15
> tables** and both `anon` and `authenticated` are confirmed blocked on every one.
> The forensic check found the historical anon access was the owner's own
> spot-check, not an intrusion. See **Remediation Log** at the end of this document
> for what was done, what was verified, and what is still outstanding.

---

## Executive Summary

**Risk level: HIGH.** The warnings are **real and actionable**, not PostgREST noise.

The headline finding is not that a new table was missed. It is that
**`supabase/migrations/20260501000000_enable_rls_security.sql` was never applied to
production.** RLS is disabled on **13 of 15 tables**, including every table the
migration was written to protect.

`docs/audit-report.md:349` listed this as an open question — *"this audit cannot
verify the migration was actually applied to the live Supabase project."* This
audit answers it: **it was not.**

Three facts combine into the risk:

1. **RLS is off** on 13 of 15 public tables — including `users` (`password_hash`),
   `apify_keys` (plaintext API tokens), `sessions` (live session JSONB), and both
   token tables.
2. **`anon` and `authenticated` hold full DML** — `SELECT, INSERT, UPDATE, DELETE,
   TRUNCATE, REFERENCES, TRIGGER` — on **every** table in `public`.
3. **PostgREST is live and internet-reachable.** An unauthenticated probe returns
   `401 {"message":"No API key found in request"}` — the service is running and
   routing; it declines only for a missing key.

With RLS off and full grants in place, the anon key is the **only** thing between
the public internet and read/write access to every row in the database.

**The one thing keeping this from Critical:** the anon key is not published by this
app. There is no `@supabase/*` dependency, no `SUPABASE_ANON_KEY` in `.env`, no
Supabase key in tracked source, and the only browser-shipped vars are the four
`VITE_PADDLE_*` ones. The frontend talks exclusively to Express `/api/*`.

That is a meaningful mitigation but a thin one. Supabase classifies the anon key as
*publishable* — it is displayed on the project dashboard home, routinely pasted into
screenshots, issues, and support threads, and it is a single static JWT that does not
rotate unless the project JWT secret is rotated. **I cannot rule out that it has
already leaked.** Exploitation requires only possession of that one string.

**And the mitigation is one env var away from vanishing.** `SECURITY.md:135` documents:

| Variable | Exposed to browser? | Access level |
|---|---|---|
| `VITE_SUPABASE_ANON_KEY` | **Yes** | PostgREST anon access — safe only because RLS is enabled |

The project's own security documentation instructs shipping the anon key to the
browser, and states a safety condition — *"safe only because RLS is enabled"* — that
**is false in production**. The variable is not currently set (`.env` contains only
the four `VITE_PADDLE_*` vars) and no client code reads it, so this is a latent trap
rather than an active exposure. But anyone following `SECURITY.md` would publish the
anon key in the JS bundle, and with RLS off that converts this finding from
*"exploitable if the key leaks"* to **"world-readable and world-writable, no leak
required."**

**Counter-intuitive result:** the recently added tables are the *correctly configured*
ones. `contact_queries` and `page_views` both have RLS enabled. The exposure is
entirely in the **older, baseline** tables.

---

## Part 1 — Table-by-Table RLS Status

Source: `pg_class.relrowsecurity` / `relforcerowsecurity` joined to `pg_policies`.

| # | Table | RLS | Forced | Policies | Rows | Status |
|---|-------|-----|--------|----------|------|--------|
| 1 | `apify_keys` | ❌ OFF | no | 0 | 10 | **EXPOSED — plaintext API tokens** |
| 2 | `users` | ❌ OFF | no | 0 | 207 | **EXPOSED — password hashes, emails, IPs** |
| 3 | `sessions` | ❌ OFF | no | 0 | 23 | **EXPOSED — live session JSONB** |
| 4 | `email_verification_tokens` | ❌ OFF | no | 0 | 207 | **EXPOSED — token hashes** |
| 5 | `password_reset_tokens` | ❌ OFF | no | 0 | 1 | **EXPOSED — token hashes** |
| 6 | `profiles` | ❌ OFF | no | 0 | 207 | **EXPOSED — emails, Paddle/billing state** |
| 7 | `competitors` | ❌ OFF | no | 0 | 254 | EXPOSED — user business data |
| 8 | `fetch_runs` | ❌ OFF | no | 0 | 146 | EXPOSED — user business data |
| 9 | `jobs` | ❌ OFF | no | 0 | 146 | EXPOSED — internal queue |
| 10 | `reels` | ❌ OFF | no | 0 | 3499 | EXPOSED — scraped data |
| 11 | `competitor_stats` | ❌ OFF | no | 0 | 653 | EXPOSED — scraped data |
| 12 | `raw_payloads` | ❌ OFF | no | 0 | 248 | EXPOSED — raw Apify JSON |
| 13 | `processed_webhook_events` | ❌ OFF | no | 0 | 18 | EXPOSED — webhook idempotency keys |
| 14 | `contact_queries` | ✅ ON | no | 0 | 5 | **Deny-all — correct** |
| 15 | `page_views` | ✅ ON | no | 0 | 1109 | **Deny-all — correct** |

- **Without RLS (dangerous): 13**
- **With RLS, zero policies (deny-all, safe): 2** — `contact_queries`, `page_views`
- **With RLS + policies (properly configured): 0**

**Zero policies exist anywhere in the `public` schema** (`pg_policies` returns empty).
The `users_select_own` / `profiles_update_own` policies defined in the migration are
not present in production. Nothing was partially applied — the migration simply never ran.

`relforcerowsecurity` is `false` everywhere, which is fine: the backend connects as
`postgres`, which holds `rolbypassrls = true`, so RLS is bypassed by the app either way.

---

## Part 2 — Sensitive Column Analysis

13 sensitive columns across 8 tables. **9 of 13 sit in tables with RLS off.**

| Table | Column | Type | RLS | What leaks if PostgREST is reached |
|-------|--------|------|-----|-------------------------------------|
| `apify_keys` | `token` | text | ❌ **OFF** | **Plaintext Apify API keys** — 10 keys. Full spend of the credit pool and arbitrary actor runs on your account. |
| `users` | `password_hash` | text | ❌ **OFF** | bcrypt hashes for 207 accounts — offline cracking, credential stuffing against reused passwords. |
| `users` | `email` | varchar | ❌ **OFF** | Full customer email list (207). |
| `users` | `ip_address` | varchar | ❌ **OFF** | Registration IPs — PII; added 2026-09-02. |
| `users` | `email_verified` | boolean | ❌ **OFF** | Writable → self-verify any account (anon holds UPDATE). |
| `profiles` | `email` | text | ❌ **OFF** | Duplicate email list + plan/Paddle subscription state. |
| `sessions` | `sess` | jsonb | ❌ **OFF** | **Live session payloads including user identity — direct session hijack for 23 active sessions.** |
| `email_verification_tokens` | `token_hash` | text | ❌ **OFF** | Verification-token forgery (207 rows). |
| `password_reset_tokens` | `token_hash` | text | ❌ **OFF** | **Account-takeover path** without access to the victim's inbox. |
| `contact_queries` | `email` | varchar | ✅ ON | Protected. |
| `contact_queries` | `ip_address` | varchar | ✅ ON | Protected. |
| `page_views` | `ip_address` | varchar | ✅ ON | Protected. |
| `page_views` | `session_id` | varchar | ✅ ON | Protected. |

**Worst three, in order:** `apify_keys.token` (direct financial loss, no user
interaction), `sessions.sess` (immediate account takeover of anyone logged in),
`users.password_hash` (credential compromise with blast radius beyond this product).

Note that exposure is not read-only. `anon` holds `UPDATE` and `DELETE` on all of
these, so the same access permits flipping `email_verified`, rewriting
`profiles.plan` to grant free Pro, or `TRUNCATE`-ing the database.

---

## Part 3 — PostgREST Exposure Risk

**Is PostgREST enabled?** Yes, and reachable from the public internet. Verified
without credentials:

```
GET https://wvqaljqbwmeakljqzzmr.supabase.co/rest/v1/           → HTTP 401
GET https://wvqaljqbwmeakljqzzmr.supabase.co/rest/v1/users?...  → {"message":"No API key found in request",
                                                                   "hint":"No `apikey` request header or url param was found."}
```

The service is running and routing requests. It rejected these solely for a missing
API key. **No anon key was used and no data was retrieved** — the grant and RLS state
below is conclusive on its own, so pulling live rows would have added nothing but risk.

**What `anon` and `authenticated` can access.** Both roles hold identical, complete
privileges on all 15 tables:

```
SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
```

This is Supabase's stock configuration — `anon` is *expected* to hold table grants,
because **RLS is the intended enforcement layer**. With RLS off, the grants are the
whole story. Supabase's `rls_disabled_in_public` lint exists precisely for this state.

**Default privileges make this self-perpetuating.** `pg_default_acl` shows:

```
postgres → tables: {anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
```

`arwdDxtm` is all privileges. **Every future table created by `postgres` in `public`
automatically grants full DML to `anon`** unless RLS is enabled on it explicitly.
This is why the problem recurs with each new table rather than staying fixed.

**Real vs theoretical.**

- *Theoretical* — that RLS is off and grants are wide: **confirmed fact**, measured directly.
- *Real* — whether anyone can exploit it today: **gated entirely on possession of the
  anon key.** That key is not published by this application. It is, however, a static
  publishable credential that Supabase surfaces in the dashboard and that never rotates
  on its own. There is no second control behind it.

**Not exposed:** `pg_graphql` is not installed (extensions present:
`pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`), so the
`graphql_public` schema is inert. GraphQL is not an additional vector.

---

## Part 4 — Recent Additions Review

The premise that recent additions caused this does **not** hold. They are the
best-configured tables in the database.

| Addition | Migration | RLS | Sensitive columns | Verdict |
|----------|-----------|-----|-------------------|---------|
| `contact_queries` | `20260901000000` | ✅ **ON** (0 policies, deny-all) | `email`, `ip_address` | **Correct.** Migration enables RLS explicitly and documents why. |
| `users.ip_address` | `20260902000000` | ❌ inherits `users` — **OFF** | `ip_address` (PII) | Column is fine; the *table* was never protected. The migration's stated assumption — *"`users` already has RLS configured by 20260501000000"* — is **false in production**. |
| `apify_keys.last_reset_check_at` | `20260827000001` | ❌ inherits `apify_keys` — **OFF** | none (timestamp) | Column harmless. Table holds plaintext tokens and is unprotected. |
| `page_views` | `20260819000000` | ✅ **ON** | `ip_address`, `session_id` | **Correct.** Both the migration and `scripts/apply-page-views-table.ts` enable RLS. |
| `processed_webhook_events` | (webhook events) | ❌ **OFF** | none | Not covered by any RLS migration. |

**One genuinely misleading document:** `20260902000000_add_users_ip_address.sql`
asserts under its `RLS` heading that `users` is already protected. It is not. The
migration is otherwise correct and additive — the claim is simply inherited from an
assumption nobody verified.

---

## Part 5 — Comparison With Baseline Tables & Root Cause

**Does the codebase historically enable RLS?** Yes — in *intent*. The May 2026
migration is thorough, covers 12 tables, and `docs/audit-report.md:206` calls it
*"among the best-documented files in the repo."* The security model it describes is
sound. **It was written and never executed.**

**Root cause: no automated migration application.** Two independent signals:

1. **`supabase_migrations.schema_migrations` does not exist.** The Supabase CLI has
   never applied anything to this project. `supabase/migrations/` is documentation,
   not a pipeline.
2. **Every migration has a bespoke `scripts/apply-*.ts` — except the RLS one:**

   | Migration | Apply script |
   |-----------|--------------|
   | `add_page_views` | ✅ `apply-page-views-table.ts` (enables RLS at line 45) |
   | `add_queue_priority` | ✅ `apply-queue-priority.ts` |
   | `add_apify_monthly_reset` | ✅ `apply-apify-monthly-reset.ts` |
   | `add_apify_reset_check` | ✅ `apply-apify-reset-check.ts` |
   | `add_users_ip_address` | ✅ `apply-users-ip-address.ts` |
   | `add_webhook_events_table` | ✅ `apply-webhook-events-table.ts` |
   | **`enable_rls_security`** | ❌ **none** |

`SECURITY.md:154-168` requires it to be **pasted by hand into the Supabase SQL
editor**. That manual step was never performed. Tables whose creation script happened
to include `ENABLE ROW LEVEL SECURITY` inline (`page_views`, `contact_queries`) are
protected; the 13 that depended on the manual paste are not.

**Verification tooling already exists and has never been run against production:**
`scripts/test-rls-policies.js` (10 KB, dated 2026-05-01) needs a `.env.test` with
`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. None of those
variables exist in `.env`.

**Inconsistency summary:** the gap is not between old and new tables. It is between
*migrations that self-applied via a script* and *the one that required a human to
remember*.

---

## Recommendations

### Critical — fix immediately

1. **Apply `20260501000000_enable_rls_security.sql` to production.** Closes 12 of the
   13 gaps. The backend connects as `postgres` (`rolbypassrls = true`), so **the app is
   unaffected** — this is the migration's central design claim and it is confirmed:
   `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'postgres'` → `true`.
2. **Enable RLS on `processed_webhook_events`** — no migration covers it.
   `ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;`
3. **Treat the Apify tokens as potentially compromised.** 10 plaintext keys have sat in
   an unprotected table behind a publishable key for an unknown period. Rotating them is
   cheap; assuming they are clean is not. Cross-check spend against
   `scripts/apify-audit.ts` for anomalies.

### High priority

4. **Rotate the anon key** (Supabase → Settings → API → rotate JWT secret) *after*
   RLS is on. Any copy that leaked before today stops working. Coordinate: this
   invalidates the service-role key too.
5. **Revoke the blanket grants.** RLS is the right control, but `anon` holding
   `TRUNCATE` on `users` has no legitimate purpose. Since the app makes zero PostgREST
   calls, `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` is
   defensible and gives defence in depth.
6. **Fix the default privileges** so new tables stop inheriting full anon DML:
   `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;`
   Without this, the next table repeats the problem.
7. **Correct the false claim** in `20260902000000_add_users_ip_address.sql` once RLS is
   actually applied, so the record matches reality.
8. **Do not set `VITE_SUPABASE_ANON_KEY` until RLS is on.** `SECURITY.md:135` presents
   it as browser-safe on a precondition that does not currently hold. Either apply RLS
   first, or amend the row — as written it is an instruction to publish the anon key of
   a database with no row-level protection.

### Nice to have

8. **Write `scripts/apply-rls-security.ts`**, matching the six existing apply scripts,
   so this stops depending on someone remembering a manual paste.
9. **Run `scripts/test-rls-policies.js`** against production post-fix — it exists and
   has never been used.
10. **Consider disabling the Data API entirely** (Supabase → Settings → API → exposed
    schemas). This app has no Supabase SDK and makes no PostgREST calls; the entire
    attack surface is optional. This is the strongest single fix.
11. **Move `apify_keys.token` values to environment variables**, keeping only metadata
    in the DB — already recommended in the May migration's own `SECURITY TODO`.

### False positives / non-issues

- **`contact_queries` and `page_views` flagged for sensitive columns**: both have RLS
  enabled with zero policies (deny-all). Supabase's linter flags the *column pattern*,
  not the effective access. **No action needed.**
- **RLS with zero policies is not a misconfiguration.** For backend-only tables it is
  the correct, strictest setting: deny-all to PostgREST, full access to the
  BYPASSRLS backend role.
- **`relforcerowsecurity = false`** is correct and should stay. Setting it would apply
  RLS to the table owner and could break backend queries.

---

## Fix Approach

No new migration file is needed for the main fix — the SQL already exists and is
correct. What is missing is execution.

| Issue | Fix | Mechanism |
|-------|-----|-----------|
| 12 tables without RLS | Apply the existing migration | Supabase SQL editor, or a new `scripts/apply-rls-security.ts` |
| `processed_webhook_events` | One `ALTER TABLE` | Add to the apply script |
| Anon holds full DML | `REVOKE ALL ... FROM anon, authenticated` | New migration |
| Future tables inherit grants | `ALTER DEFAULT PRIVILEGES ... REVOKE` | Same new migration |
| Anon key may have leaked | Rotate JWT secret | Supabase dashboard |
| Apify tokens possibly exposed | Rotate 10 keys | Apify console + `apify_api.txt` reload |
| Manual-application fragility | Add the missing apply script | New file in `scripts/` |
| `SECURITY.md` says the anon key is browser-safe | Amend the row, or apply RLS first | Doc edit |

**Suggested order:** apply RLS → verify with `test-rls-policies.js` → revoke grants and
default privileges → rotate anon key → rotate Apify tokens.

**Expected app impact: none.** The backend bypasses RLS via `rolbypassrls`, the
frontend makes no PostgREST calls, and no `@supabase/*` package is installed. The
blast radius of applying this is limited to PostgREST clients, of which this project
has zero.

---

## Method & Limitations

**Verified directly against production** (read-only): RLS flags, policy count, table
grants, role attributes, default ACLs, column inventory, row counts, installed
extensions, PostgREST reachability without credentials.

**Not verified:**

- **Whether the anon key has actually leaked.** Unknowable from here. The
  recommendations assume it may have.
- **Whether the Data API is enabled for the `public` schema specifically.** An
  unauthenticated request is rejected before schema resolution, so the `401` proves the
  service is reachable but not which schemas are exposed. Two strong indicators say
  `public` is exposed: Supabase exposes it by default, and Supabase's own advisor
  raised `rls_disabled_in_public`, a lint that only fires for PostgREST-exposed schemas.
  Confirmable in one click: Settings → API → Exposed schemas.
- **Exact table attribution for the two email warnings.** Supabase's advisor email
  summarises. `rls_disabled_in_public` maps to all 13 unprotected tables;
  the sensitive-column warning most plausibly points at `users` (`password_hash`,
  `email`, `ip_address`) and/or `apify_keys` (`token`). The precise list is in
  Dashboard → Advisors → Security. The remediation is identical either way.
- **Whether exploitation has already occurred.** Detecting that would need PostgREST
  request logs (Supabase → Logs → API), which is worth reviewing given the exposure
  window is unbounded — the tables have been unprotected since creation.

---

# Remediation Log — 2026-09-02

## Step 1 — Compromise check: **no intrusion found**

`pg_stat_statements` retains statistics since **2026-04-26** and holds **816 of 5000**
slots, so nothing has been evicted — absence of evidence here is meaningful.

**The `anon` role did read five tables via PostgREST**, all within a 2m05s window:

| Time (UTC) | Table | Calls |
|---|---|---|
| 2026-04-30 14:16:28 | `apify_keys` | 1 |
| 2026-04-30 14:17:52 | `users` | 1 |
| 2026-04-30 14:18:12 | `reels` | 1 |
| 2026-04-30 14:18:25 | `competitors` | 1 |
| 2026-04-30 14:18:33 | `profiles` | 1 |

Inter-query gaps shrink 84s → 20s → 13s → 8s: human-paced, not scripted. The RLS
migration is dated 2026-05-01 and `scripts/test-rls-policies.js` was created
2026-05-01 00:31 IST — roughly 4¾ hours *after* these probes — and the migration
singles out `apify_keys` as `*** CRITICAL — HIGHEST PRIORITY ***`, the first table
probed. **The owner confirmed this was his own manual spot-check**, which is what
prompted the migration to be written. Not an intrusion.

Corroborating checks, all clean:

- **Zero writes ever** by `anon` or `authenticated` — no INSERT/UPDATE/DELETE/TRUNCATE
  anywhere in the retained history.
- **No anon activity since 2026-04-30** — four months quiet.
- One admin account (`krishna@techcm.in`), as expected.
- **0** users verified without consuming a verification token — no self-verification abuse.
- All 10 Apify tokens intact: 46 chars, `apify_` prefix, $5 budgets, $50 total.
- Non-free plans without a Paddle subscription are all owner-controlled accounts
  (`techcm.in`, `techcm.co`, `krishnagoswami.219`, `founder@techcm.in`). The two real
  paying customers both have Paddle IDs and `active` status.
- No unexpected tables, views, or functions; `public` contains zero functions.

**Caveat:** row volume read on 2026-04-30 is unknowable. PostgREST wraps results in a
single `json_agg` row, so `rows: 1` is one wrapper — the body could have held 1 record
or all 207. The `LIMIT` parameter value is not retained.

## Step 2 — RLS applied: **2/15 → 15/15**

Applied via the new `scripts/apply-rls-security.ts`, which fills the gap identified in
Part 5: it is the apply script the RLS migration never had. It mirrors
`20260501000000_enable_rls_security.sql` and additionally covers
`processed_webhook_events`, which postdates that migration.

Safety properties: refuses to run unless `current_user` has `BYPASSRLS` (so it cannot
lock the app out of its own tables); runs in a single transaction; idempotent
(`DROP POLICY IF EXISTS` before create); `--check` flag reports without modifying.

| | Before | After |
|---|---|---|
| RLS enabled | 2/15 | **15/15** |
| `users` / `profiles` | 0 policies | 2 policies each (`select_own`, `update_own`) |
| 11 backend-only tables | RLS off | RLS on, 0 policies (deny-all) |

## Step 3 — App verified working

**Backend unaffected — 15/15 read, 15/15 write.** Every table was read, and an
`UPDATE` was executed inside a transaction that was always rolled back. `postgres`
holds `rolbypassrls = true`, exactly as the migration's design assumed.

**`anon` and `authenticated` now blocked on 15/15 tables.** Verified by impersonating
each role with `SET LOCAL ROLE` — the same mechanism PostgREST uses after validating a
JWT — inside a read-only, rolled-back transaction. Every table returned 0 rows.

**Live production confirmed healthy** after the change: `/`, `/api/health`, `/login`,
`/pricing`, `/contact` all HTTP 200; `/api/auth/user` correctly 401s unauthenticated.
`page_views` recorded **7 writes in the following 15 minutes**, 23 live sessions
survived, and normal traffic (a signup at 03:23, a fetch run at 04:16) continued
throughout. The application never noticed.

## Still outstanding

| Item | Status |
|---|---|
| Revoke `anon`/`authenticated` grants + default privileges | **Not done** — awaiting decision |
| Disable the Data API entirely | **Not done** — dashboard-only, owner's call |
| Rotate the anon key | **Not needed** on current evidence (access was the owner's) |
| Rotate Apify tokens | **Not needed** on current evidence; tokens verified intact |
| Run `scripts/test-rls-policies.js` | **Blocked** — needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.test`, none of which exist. The `SET LOCAL ROLE` test above covers the same ground without credentials. |
| Correct `SECURITY.md:135` (`VITE_SUPABASE_ANON_KEY` "safe only because RLS is enabled") | Precondition now true, but the variable should still not be set — the app has no use for it |
| Correct the false RLS claim in `20260902000000_add_users_ip_address.sql` | Now true in production; comment no longer misleading |
