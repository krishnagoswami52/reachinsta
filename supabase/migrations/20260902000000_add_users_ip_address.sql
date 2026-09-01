-- =============================================================
-- Migration: 20260902000000_add_users_ip_address.sql
-- Date: 2026-09-02
-- =============================================================
--
-- PURPOSE
-- -------
-- Record the IP address a `users` row was registered from.
--
-- Today the signup IP is not stored anywhere (docs/signup-security-audit.md,
-- V5). A schema-wide search finds IP columns only on `page_views` and
-- `contact_queries`, and `page_views` is not a substitute: it fires on page
-- loads, so a caller that talks to the API directly — which is exactly the
-- attacker worth catching — leaves no trace at all.
--
-- Without this column there is no way to answer "how many accounts came from
-- this IP", to enforce a per-IP account cap, or to clean up after an abuse
-- burst. It is cheap now and impossible retroactively: the 367 accounts the
-- k6 load test created against production on 2026-06-07 can never be
-- attributed to their source.
--
-- VARCHAR(45) matches page_views.ip_address and contact_queries.ip_address —
-- 45 characters is the longest possible textual IPv6 address (an IPv4-mapped
-- form such as ::ffff:255.255.255.255). The server normalises that mapped
-- prefix away before writing, so stored values are plain IPv4 or plain IPv6
-- and group correctly in a GROUP BY.
--
-- SAFETY
-- ------
-- Purely ADDITIVE and IDEMPOTENT:
--   * adds one nullable column to `users`, nothing else
--   * no default, no backfill, no rewrite of existing rows
--   * every existing row keeps ip_address = NULL, which is the honest value:
--     we genuinely do not know where those 587 accounts came from
--   * no constraint, so no registration can fail because of this column
--
-- RLS
-- ---
-- `users` already has RLS configured by 20260501000000_enable_rls_security.sql.
-- Adding a column does not change policies. The backend connects as the
-- `postgres` superuser over a direct pg connection and bypasses RLS.
--
-- REVERSIBILITY
-- -------------
--   ALTER TABLE public.users DROP COLUMN IF EXISTS ip_address;
--
-- =============================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

COMMENT ON COLUMN public.users.ip_address IS
  'Client IP captured at registration (req.ip, X-Forwarded-For aware). NULL for rows created before 2026-09-02. Abuse investigation and per-IP account caps only.';

-- Supports the per-IP account count that a future cap and any post-hoc abuse
-- investigation both need. Partial: NULL means "unknown", never a group.
CREATE INDEX IF NOT EXISTS users_ip_address_idx
  ON public.users (ip_address)
  WHERE ip_address IS NOT NULL;

COMMIT;
