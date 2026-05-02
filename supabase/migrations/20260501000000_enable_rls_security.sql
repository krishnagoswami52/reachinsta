-- =============================================================
-- Migration: 20260501000000_enable_rls_security.sql
-- Date: 2026-05-01
-- =============================================================
--
-- PURPOSE
-- -------
-- Enable Row Level Security (RLS) on all 12 application tables
-- to block unauthorized access via Supabase's PostgREST REST API
-- (https://[project].supabase.co/rest/v1/).
--
-- ARCHITECTURE CONTEXT
-- --------------------
-- The backend uses a DIRECT PostgreSQL connection (node-postgres pool
-- via DATABASE_URL) as the 'postgres' superuser role. PostgreSQL
-- superusers BYPASS RLS unconditionally — backend operations are
-- completely unaffected by this migration.
--
-- The frontend makes NO direct Supabase/PostgREST calls. All data
-- flows through Express /api/* endpoints. These policies guard
-- against unauthenticated PostgREST API abuse using the anon key.
--
-- Paddle webhook handlers: unaffected (direct DB connection).
-- Apify key rotation: unaffected (direct DB connection).
--
-- CUSTOM AUTH NOTE
-- ----------------
-- This app uses custom authentication (Express sessions + bcrypt),
-- NOT Supabase Auth. auth.uid() reads from Supabase JWT tokens,
-- which this app does not issue. Therefore auth.uid() returns NULL
-- for all PostgREST requests — policies using auth.uid() effectively
-- block ALL PostgREST access until Supabase Auth is adopted.
-- The auth.uid() policies below are written to be forward-compatible.
--
-- REVERSIBILITY
-- -------------
-- See 20260501000001_rollback_rls_security.sql
--
-- =============================================================

BEGIN;

-- =============================================================
-- TIER 1 — USER-OWNED TABLES
--
-- Tables that contain a user's own data. Policies are written
-- using auth.uid() for forward-compatibility with Supabase Auth.
--
-- CURRENT BEHAVIOR (custom auth): auth.uid() = NULL → no row
-- matches → PostgREST effectively blocked for all roles.
--
-- FUTURE BEHAVIOR (Supabase Auth): each user sees only their
-- own rows. INSERT/DELETE are intentionally omitted — those
-- operations must go through the backend API.
-- =============================================================

-- -------------------------------------------------------------
-- 1. users
--    PK: id (varchar, gen_random_uuid)
--    User-ref: id (the row IS the user record)
--    Risk: password_hash column — must never be PostgREST-readable
-- -------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id);

CREATE POLICY "users_update_own"
  ON users
  FOR UPDATE
  TO authenticated
  USING  (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- No INSERT policy: user creation handled exclusively by backend auth service
-- No DELETE policy: account deletion must go through backend business logic

-- -------------------------------------------------------------
-- 2. profiles
--    PK: id (varchar) — same ID as users.id
--    User-ref: id
--    Risk: Paddle subscription data (paddle_customer_id, subscription status)
--          Subscription field updates come from Paddle webhooks via backend
--          (direct DB connection → bypasses RLS → unaffected by these policies)
-- -------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id);

CREATE POLICY "profiles_update_own"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING  (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- No INSERT: profile creation is handled by backend auth service
-- No DELETE: profile deletion must go through backend business logic

-- -------------------------------------------------------------
-- 3. sessions (Express connect-pg-simple session store)
--    Columns: sid (PK), sess (jsonb), expire
--    NO user_id column — no meaningful per-user policy is possible.
--    Backend-only: session middleware uses direct DB connection.
--    Full lockdown with no policies.
-- -------------------------------------------------------------
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE sessions IS
  'Express session store (connect-pg-simple). '
  'RLS enabled with NO policies — backend-only via direct PostgreSQL connection. '
  'sess JSONB contains sensitive authentication data including user identity. '
  'No per-user PostgREST policy is possible (no user_id column).';

-- -------------------------------------------------------------
-- 4. email_verification_tokens
--    Columns: id, user_id, token_hash, expires_at, used_at, created_at
--    User-ref: user_id
--    SECURITY: token_hash is a secret. Exposing it via PostgREST enables
--    token forgery — attackers could verify any email without the actual
--    token. Full lockdown required.
-- -------------------------------------------------------------
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE email_verification_tokens IS
  'Email verification token hashes. '
  'RLS enabled with NO policies — backend-only. '
  'token_hash is a cryptographic secret; PostgREST access would enable token forgery.';

-- -------------------------------------------------------------
-- 5. password_reset_tokens
--    Columns: id, user_id, token_hash, expires_at, used_at, created_at
--    User-ref: user_id
--    SECURITY: token_hash is a secret. Exposing it enables account takeover
--    without needing the original reset email. Full lockdown required.
-- -------------------------------------------------------------
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE password_reset_tokens IS
  'Password reset token hashes. '
  'RLS enabled with NO policies — backend-only. '
  'token_hash is a cryptographic secret; PostgREST access would enable account takeover.';


-- =============================================================
-- TIER 2 — BACKEND-ONLY TABLES
--
-- These tables are accessed exclusively via the backend Express API.
-- No PostgREST access. Full lockdown with no policies.
-- The backend (postgres superuser) bypasses RLS and retains full access.
-- =============================================================

-- -------------------------------------------------------------
-- 6. apify_keys  *** CRITICAL — HIGHEST PRIORITY ***
--    Columns: id, token, total_budget, used_budget, is_exhausted,
--             last_used_at, last_error_at, created_at, updated_at
--    User-ref: NONE (shared infrastructure pool)
--
--    RISK: token column contains PLAINTEXT APIFY API KEY STRINGS.
--    Exposing these allows anyone to burn the entire credit budget
--    or use the keys for unauthorized Apify actor runs.
--
--    Access: server/services/keyManager.ts (rotation logic)
--    Load:   server/services/keyManager.ts initApifyKeys() reads apify_api.txt
--
--    FUTURE RECOMMENDATION:
--    Move actual token VALUES to environment variables (APIFY_KEY_1 ... APIFY_KEY_N).
--    Keep only metadata in DB: key_id (opaque reference), total_budget,
--    used_budget, is_exhausted, last_used_at, last_error_at.
--    This limits DB breach impact to metadata, not usable credentials.
-- -------------------------------------------------------------
ALTER TABLE apify_keys ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE apify_keys IS
  'INTERNAL INFRASTRUCTURE — Shared Apify API key pool for credit-based rotation. '
  'token column contains PLAINTEXT API KEY STRINGS. '
  'RLS enabled with NO policies — service-role (backend direct connection) only. '
  'Key rotation logic: server/services/keyManager.ts. '
  'Keys loaded from apify_api.txt via initApifyKeys(). '
  'SECURITY TODO: Move token values to APIFY_KEY_1..N env vars; store only metadata here.';

-- -------------------------------------------------------------
-- 7. fetch_runs
--    Columns: id, user_id, time_range_days, competitor_usernames,
--             status, error_message, started_at, completed_at, created_at
--    User-ref: user_id → profiles.id
-- -------------------------------------------------------------
ALTER TABLE fetch_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE fetch_runs IS
  'Backend-only. Records of Apify data fetch operations, including status and errors. '
  'RLS enabled with NO policies — managed by server/worker.ts and /api/fetch-runs endpoints.';

-- -------------------------------------------------------------
-- 8. raw_payloads
--    Columns: id, fetch_run_id, actor, payload (jsonb), created_at
--    User-ref: fetch_run_id → fetch_runs.user_id (indirect)
--    Contains raw Apify actor responses — potentially large and sensitive.
-- -------------------------------------------------------------
ALTER TABLE raw_payloads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE raw_payloads IS
  'Backend-only. Raw Apify actor JSON response payloads. '
  'RLS enabled with NO policies — written on ingest, never sent directly to frontend. '
  'Indirect user link: raw_payloads.fetch_run_id → fetch_runs.user_id.';

-- -------------------------------------------------------------
-- 9. jobs
--    Columns: id, user_id, fetch_run_id, type, status, attempts,
--             last_error, created_at, updated_at
--    User-ref: user_id, fetch_run_id
-- -------------------------------------------------------------
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE jobs IS
  'Backend-only. Internal job queue for Apify fetch operations. '
  'RLS enabled with NO policies — processed exclusively by server/worker.ts.';

-- -------------------------------------------------------------
-- 10. reels
--     Columns: id, fetch_run_id, username, reel_url, views, likes,
--              comments, duration_seconds, posted_at, engagement_rate,
--              viral_score
--     User-ref: fetch_run_id → fetch_runs.user_id (indirect)
-- -------------------------------------------------------------
ALTER TABLE reels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE reels IS
  'Backend-only. Scraped Instagram reel metrics. '
  'RLS enabled with NO policies — data served to frontend via /api/* endpoints only. '
  'Indirect user link: reels.fetch_run_id → fetch_runs.user_id.';

-- -------------------------------------------------------------
-- 11. competitor_stats
--     Columns: id, fetch_run_id, username, followers, reels_count,
--              avg_views, avg_engagement_rate, top_reel_views
--     User-ref: fetch_run_id → fetch_runs.user_id (indirect)
-- -------------------------------------------------------------
ALTER TABLE competitor_stats ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE competitor_stats IS
  'Backend-only. Aggregated per-competitor statistics. '
  'RLS enabled with NO policies — data served via /api/* endpoints only. '
  'Indirect user link: competitor_stats.fetch_run_id → fetch_runs.user_id.';

-- -------------------------------------------------------------
-- 12. competitors
--     Columns: id, user_id, username, created_at
--     User-ref: user_id → profiles.id
-- -------------------------------------------------------------
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE competitors IS
  'Backend-only. User''s list of tracked Instagram competitor accounts. '
  'RLS enabled with NO policies — managed exclusively via /api/competitors endpoints.';

COMMIT;
