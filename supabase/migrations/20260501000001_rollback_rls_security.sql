-- =============================================================
-- Rollback: 20260501000001_rollback_rls_security.sql
-- Date: 2026-05-01
-- Reverses: 20260501000000_enable_rls_security.sql
-- =============================================================
--
-- WARNING: Running this rollback re-exposes all 12 tables to
-- unauthenticated PostgREST API access via the Supabase anon key.
-- Only run this in an emergency or during a planned migration rollback.
--
-- After rollback, immediately restrict access via Supabase Dashboard:
-- Authentication → Policies → disable anon access per table.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- TIER 1 — USER-OWNED TABLES
-- Drop policies first, then disable RLS
-- -------------------------------------------------------------

-- 1. users
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_update_own"  ON users;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 2. profiles
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON profiles;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 3. sessions (no policies to drop)
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;

-- 4. email_verification_tokens (no policies to drop)
ALTER TABLE email_verification_tokens DISABLE ROW LEVEL SECURITY;

-- 5. password_reset_tokens (no policies to drop)
ALTER TABLE password_reset_tokens DISABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- TIER 2 — BACKEND-ONLY TABLES (no policies to drop)
-- -------------------------------------------------------------

-- 6. apify_keys
ALTER TABLE apify_keys DISABLE ROW LEVEL SECURITY;

-- 7. fetch_runs
ALTER TABLE fetch_runs DISABLE ROW LEVEL SECURITY;

-- 8. raw_payloads
ALTER TABLE raw_payloads DISABLE ROW LEVEL SECURITY;

-- 9. jobs
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;

-- 10. reels
ALTER TABLE reels DISABLE ROW LEVEL SECURITY;

-- 11. competitor_stats
ALTER TABLE competitor_stats DISABLE ROW LEVEL SECURITY;

-- 12. competitors
ALTER TABLE competitors DISABLE ROW LEVEL SECURITY;

COMMIT;
