-- =============================================================
-- Migration: 20260819000000_add_page_views.sql
-- Date: 2026-08-19
-- =============================================================
--
-- PURPOSE
-- -------
-- Add the `page_views` table: a first-party, self-hosted page-view log that
-- backs the admin analytics dashboard (/admin/metrics). Replaces the need for
-- an external analytics vendor before the Product Hunt launch.
--
-- SAFETY
-- ------
-- Purely ADDITIVE and IDEMPOTENT:
--   * creates one new table + its indexes, nothing else
--   * touches no existing table, column, constraint, policy or row
--   * no product code path reads this table — it is admin-read-only
--
-- RLS
-- ---
-- Follows 20260501000000_enable_rls_security.sql: the backend connects as the
-- `postgres` superuser over a direct pg connection and BYPASSES RLS, so
-- enabling RLS here only blocks anonymous PostgREST (Supabase REST API) access.
-- No policy is created => deny-all for the anon/authenticated roles.
--
-- REVERSIBILITY
-- -------------
--   DROP TABLE IF EXISTS public.page_views;
--
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.page_views (
  id            BIGSERIAL PRIMARY KEY,
  path          VARCHAR(500) NOT NULL,
  referrer      VARCHAR(500),
  user_agent    TEXT,
  ip_address    VARCHAR(45),
  -- users.id is a varchar uuid in this schema (not an integer)
  user_id       VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  session_id    VARCHAR(100),
  utm_source    VARCHAR(100),
  utm_medium    VARCHAR(100),
  utm_campaign  VARCHAR(100),
  country       VARCHAR(3),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_views_created_at_idx  ON public.page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_user_id_idx     ON public.page_views (user_id);
CREATE INDEX IF NOT EXISTS page_views_utm_source_idx  ON public.page_views (utm_source);
CREATE INDEX IF NOT EXISTS page_views_path_idx        ON public.page_views (path);
CREATE INDEX IF NOT EXISTS page_views_session_id_idx  ON public.page_views (session_id);

-- Block PostgREST/anon access (backend is superuser and unaffected).
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

COMMIT;
