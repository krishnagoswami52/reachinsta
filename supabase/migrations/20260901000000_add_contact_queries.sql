-- =============================================================
-- Migration: 20260901000000_add_contact_queries.sql
-- Date: 2026-09-01
-- =============================================================
--
-- PURPOSE
-- -------
-- Add the `contact_queries` table: durable storage for every submission from
-- the public contact form at /contact. Until now that form only built a
-- `mailto:` URL, so a query was lost whenever the visitor had no mail client
-- (see docs/contact-form-audit.md). The row is written first, the notification
-- email second — so a Resend outage costs a notification, never a lead.
--
-- SAFETY
-- ------
-- Purely ADDITIVE and IDEMPOTENT:
--   * creates one new table + its indexes, nothing else
--   * touches no existing table, column, constraint, policy or row
--   * no existing code path reads or writes this table
--
-- RLS
-- ---
-- Follows 20260501000000_enable_rls_security.sql: the backend connects as the
-- `postgres` superuser over a direct pg connection and BYPASSES RLS, so
-- enabling RLS here only blocks anonymous PostgREST (Supabase REST API) access.
-- No policy is created => deny-all for the anon/authenticated roles. That
-- matters more here than elsewhere: these rows carry visitor email addresses.
--
-- REVERSIBILITY
-- -------------
--   DROP TABLE IF EXISTS public.contact_queries;
--
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_queries (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  company     VARCHAR(200),
  message     TEXT NOT NULL,
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  -- Triage state for later, by hand in SQL. Nothing in the app reads or
  -- writes this yet — query management is deliberately out of scope.
  status      VARCHAR(20) NOT NULL DEFAULT 'new',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_queries_created_at_idx ON public.contact_queries (created_at DESC);
CREATE INDEX IF NOT EXISTS contact_queries_email_idx      ON public.contact_queries (email);
CREATE INDEX IF NOT EXISTS contact_queries_status_idx     ON public.contact_queries (status);

-- Block PostgREST/anon access (backend is superuser and unaffected).
ALTER TABLE public.contact_queries ENABLE ROW LEVEL SECURITY;

COMMIT;
