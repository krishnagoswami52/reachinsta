-- =============================================================
-- Migration: 20260902120000_revoke_public_role_grants.sql
-- Date: 2026-09-02
-- Follows: ffdf500 (RLS enabled on 15/15 tables)
-- =============================================================
--
-- PURPOSE
-- -------
-- Defence in depth behind RLS. docs/supabase-security-audit.md found that
-- `anon` and `authenticated` hold the full stock Supabase grant set —
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER — on every
-- table in `public`. RLS (applied 2026-09-02) already blocks them, but the
-- grants have no legitimate purpose here: this app ships no @supabase/*
-- client and makes zero PostgREST calls. Everything goes through Express
-- /api/* over a direct pg connection as `postgres`.
--
-- Part B matters more than Part A. `pg_default_acl` grants those same
-- privileges on every FUTURE table created in `public`. That is the
-- mechanism that let 13 tables drift unprotected in the first place — each
-- new table silently arrived world-writable and depended on someone
-- remembering to enable RLS. Clearing the defaults ends that pattern.
--
-- SAFETY
-- ------
-- The backend connects as `postgres`, which holds its own direct grants
-- (105 grant rows across 15 tables) plus rolbypassrls = true. Revoking
-- privileges from `anon`/`authenticated` cannot affect it. `service_role`
-- is deliberately left untouched — it is the legitimate admin/API identity.
--
-- Scope actually touched:
--   * 15 tables in `public`
--   * 2 sequences (contact_queries_id_seq, page_views_id_seq)
--   * 0 functions — `public` contains none, so the FUNCTIONS statements are
--     no-ops kept for completeness and future-proofing
--
-- NOT touched: the `auth`, `storage`, `extensions`, `vault` and
-- `graphql_public` schemas. Supabase Auth owns its own grants in `auth` and
-- does not depend on `public`. pg_graphql is not installed, so
-- `graphql_public` is inert.
--
-- KNOWN INCOMPLETENESS — read before assuming this is airtight
-- ------------------------------------------------------------
-- ALTER DEFAULT PRIVILEGES only ever affects the default privileges of the
-- role issuing it. `pg_default_acl` for schema `public` has TWO grantors:
--
--     postgres         -> cleared by this migration
--     supabase_admin   -> NOT cleared; `permission denied to change default
--                         privileges` when attempted as postgres, which is
--                         not a member of supabase_admin
--
-- In practice the `postgres` entry is the one that matters: application
-- tables are created by migrations connecting as `postgres`, so those are
-- the defaults that applied to every table in this schema. A table created
-- by `supabase_admin` in `public` would still grant anon full DML — that
-- only happens via Supabase's own tooling, not this codebase.
--
-- Closing the residual gap needs either the Supabase dashboard/support, or
-- simply removing `public` from the exposed schemas so PostgREST cannot
-- reach it at all (the stronger fix, recommended in the audit).
--
-- REVERSIBILITY
-- -------------
-- To restore the stock Supabase grants:
--
--   GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
--   GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
--
-- Only do that if PostgREST access is genuinely needed; RLS would then be
-- the sole control again.
--
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- PART A — revoke privileges on objects that already exist
-- -------------------------------------------------------------

REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;

REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- -------------------------------------------------------------
-- PART B — stop future objects inheriting those privileges.
-- This is the part that prevents the original failure from recurring.
-- -------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;

COMMIT;
