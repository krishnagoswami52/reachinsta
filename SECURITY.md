# Security Architecture — ReachInsta

## Database Access Model

ReachInsta uses **Supabase PostgreSQL** with two distinct access paths:

| Path | Client | Role | RLS Applied? |
|---|---|---|---|
| Backend Express API | `node-postgres` pool | `postgres` (superuser) | **No** — superusers bypass RLS |
| Supabase PostgREST REST API | `@supabase/supabase-js` (anon key) | `anon` / `authenticated` | **Yes** — RLS enforced |

The frontend makes **no direct database calls**. All data flows through `/api/*` Express endpoints.
The PostgREST REST API (`https://[project].supabase.co/rest/v1/`) is enabled by default on all
Supabase projects — RLS is the only barrier between it and your data.

---

## Row Level Security (RLS) Policy Map

RLS is enabled on all 12 tables. Applied in migration `20260501000000_enable_rls_security.sql`.

### Auth note

This app uses **custom authentication** (Express sessions + bcrypt), not Supabase Auth. The
`auth.uid()` function requires a Supabase JWT token, which custom auth does not issue. As a result,
`auth.uid()` returns `NULL` for all PostgREST requests — the Tier 1 policies below effectively
block all PostgREST access until Supabase Auth is adopted.

---

### Tier 1 — User-Scoped Tables

Policies written with `auth.uid()` for forward-compatibility with Supabase Auth.
**Current behavior:** PostgREST access is blocked (auth.uid() = NULL).

| Table | SELECT | UPDATE | INSERT | DELETE | User-ref column |
|---|---|---|---|---|---|
| `users` | own row | own row | blocked | blocked | `id` |
| `profiles` | own row | own row | blocked | blocked | `id` |
| `sessions` | blocked | blocked | blocked | blocked | *(no user_id)* |
| `email_verification_tokens` | blocked | blocked | blocked | blocked | `user_id` |
| `password_reset_tokens` | blocked | blocked | blocked | blocked | `user_id` |

**Why sessions/token tables are fully blocked even though they're "user data":**
- `sessions`: No `user_id` column — no policy is possible
- `email_verification_tokens` / `password_reset_tokens`: The `token_hash` column is a cryptographic
  secret. Exposing it via PostgREST would enable token forgery / account takeover regardless of
  row-level filtering. These tables must remain backend-only.

---

### Tier 2 — Backend-Only Tables

RLS enabled with **no policies** — full lockdown. Only accessible via the backend direct connection
(which bypasses RLS as the `postgres` superuser).

| Table | PostgREST access | Risk if exposed |
|---|---|---|
| `apify_keys` | **BLOCKED** | Plaintext API keys in `token` column — credit theft |
| `fetch_runs` | **BLOCKED** | Job records including error messages |
| `raw_payloads` | **BLOCKED** | Raw Apify scrape data (large JSON) |
| `jobs` | **BLOCKED** | Internal job queue state |
| `reels` | **BLOCKED** | Scraped Instagram metrics |
| `competitor_stats` | **BLOCKED** | Aggregated competitor analytics |
| `competitors` | **BLOCKED** | User's tracked competitor accounts |

---

## apify_keys Table — Special Handling

The `apify_keys` table is an **internal infrastructure table**, not user data. It stores a shared
pool of ~10 Apify API accounts used for credit-based rotation.

**Current state:** The `token` column contains plaintext API key strings.

**Recommended improvement (medium priority):** Move the actual key values to environment variables
(`APIFY_KEY_1`, `APIFY_KEY_2`, ... `APIFY_KEY_N`) and keep only metadata in the database:

```sql
-- Proposed leaner schema for apify_keys
CREATE TABLE apify_keys (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  key_ref     text NOT NULL UNIQUE,  -- opaque reference (e.g. "key_1"), NOT the actual key
  total_budget numeric(10,4) NOT NULL DEFAULT 5.0000,
  used_budget  numeric(10,4) NOT NULL DEFAULT 0.0000,
  is_exhausted boolean NOT NULL DEFAULT false,
  last_used_at  timestamptz,
  last_error_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

The backend `keyManager.ts` would resolve `key_ref` → actual token via `process.env[key_ref.toUpperCase()]`.
A database breach would then expose only metadata, not usable credentials.

---

## Adding New Tables — Checklist

Every new table **must** have RLS enabled before it goes to production.

```sql
-- Required for every new table:
ALTER TABLE your_new_table ENABLE ROW LEVEL SECURITY;

-- Then add appropriate policies depending on access pattern:

-- Pattern A: User-owned (user accesses own rows via Supabase Auth)
CREATE POLICY "your_table_select_own" ON your_new_table
  FOR SELECT TO authenticated USING (auth.uid()::text = user_id);

-- Pattern B: Backend-only (no PostgREST access at all)
-- Just enable RLS and add NO policies. Add a comment explaining why.
COMMENT ON TABLE your_new_table IS 'Backend-only. No RLS policies intentional.';
```

**Default should be Pattern B (backend-only).** Only add Pattern A if the frontend genuinely
needs to query the table directly via the Supabase client.

---

## Environment Variables — Security Classification

| Variable | Exposed to browser? | Access level |
|---|---|---|
| `DATABASE_URL` | No | Full superuser PostgreSQL access — treat as highest secret |
| `SESSION_SECRET` | No | Express session signing — treat as highest secret |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Bypasses RLS — treat as highest secret (not currently in use) |
| `APIFY_TOKEN` | No | Fallback Apify key |
| `RESEND_API_KEY` | No | Email sending |
| `PADDLE_API_KEY` | No | Payment processing |
| `PADDLE_WEBHOOK_SECRET` | No | Webhook signature validation |
| `VITE_PADDLE_*` | **Yes** | Public Paddle client token and price IDs — safe to expose |
| `VITE_SUPABASE_ANON_KEY` | **Not set — do not set** | Was never used: this app ships no `@supabase/*` client and makes zero PostgREST calls. As of 2026-09-02 `anon` holds no grant in `public`, so the key would grant nothing anyway. |

> The `VITE_SUPABASE_ANON_KEY` row previously read *"safe only because RLS is
> enabled"*. That precondition was false for four months — see
> `docs/supabase-security-audit.md`. RLS is now on for 15/15 tables and the
> `anon`/`authenticated` grants are revoked, but the variable still has no
> purpose here and should stay unset.

---

## Key Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260501000000_enable_rls_security.sql` | Forward migration — enables RLS |
| `supabase/migrations/20260501000001_rollback_rls_security.sql` | Rollback migration |
| `scripts/apply-rls-security.ts` | Applies the RLS migration (`--check` to report only) |
| `supabase/migrations/20260902120000_revoke_public_role_grants.sql` | Revokes anon/authenticated grants + default privileges |
| `scripts/apply-revoke-public-grants.ts` | Applies the revoke migration (`--check` to report only) |
| `docs/supabase-security-audit.md` | 2026-08-31 advisor audit, forensics, and remediation log |
| `scripts/test-rls-policies.js` | RLS test suite against PostgREST API (needs `.env.test`; unused — see below) |
| `server/services/keyManager.ts` | Apify key rotation logic |
| `server/db.ts` | Database connection (direct PostgreSQL, bypasses RLS) |
| `server/services/auth.ts` | Custom auth implementation |

---

## Applying the Migrations

**Both migrations are applied as of 2026-09-02.** Use the scripts, not a manual paste:

```bash
npx tsx scripts/apply-rls-security.ts --check          # report current state only
npx tsx scripts/apply-rls-security.ts                  # enable RLS on all tables
npx tsx scripts/apply-revoke-public-grants.ts --check
npx tsx scripts/apply-revoke-public-grants.ts          # revoke anon/authenticated grants
```

Both are idempotent, run in a single transaction, and refuse to run unless the
connected role has `BYPASSRLS` (without that, enabling RLS would lock the
application out of its own tables).

This replaces the previous instruction to paste the SQL into the Supabase SQL
editor by hand. That manual step is exactly why the RLS migration sat unapplied
from 2026-05-01 until 2026-09-02 while every other migration — each of which had
a `scripts/apply-*.ts` — went out on time. **Any future migration needs an apply
script; a migration file alone does not reach production.**

Do not use `supabase db push` unless you have the Supabase CLI configured — the Drizzle
migration folder (`migrations/`) is separate from Supabase migrations (`supabase/migrations/`).

### Verifying

`scripts/test-rls-policies.js` needs a `.env.test` containing `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` — none of which exist in this
project, and introducing them would reintroduce the keys the audit recommends
against holding. Both apply scripts self-verify instead, and the state can be
confirmed with no credentials at all by impersonating the roles PostgREST uses:

```sql
-- expect: permission denied for table users
BEGIN; SET LOCAL ROLE anon; SELECT 1 FROM public.users LIMIT 1; ROLLBACK;
```
