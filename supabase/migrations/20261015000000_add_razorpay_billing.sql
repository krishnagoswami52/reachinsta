-- =============================================================
-- Migration: 20261015000000_add_razorpay_billing.sql
-- Date: 2026-10-15
-- =============================================================
--
-- PURPOSE
-- -------
-- India pricing (₹399 Plus / ₹999 Pro) is billed through Razorpay, while
-- everyone else stays on Paddle (USD). A profile now needs to record which
-- gateway bills it and, for Razorpay, the subscription id the webhook and the
-- cancel route look it up by.
--
--   billing_provider          'paddle' | 'razorpay'. NULL on every existing
--                             row; the app reads NULL as Paddle, which is
--                             true for every subscriber that exists today.
--   razorpay_subscription_id  Razorpay "sub_..." id, unique like
--                             paddle_customer_id.
--
-- ORDER
-- -----
-- Run this BEFORE deploying the code that reads these columns. Drizzle selects
-- every column of `profiles` by name, so the new build fails every profile
-- read until the columns exist.
--
-- SAFETY
-- ------
-- Purely ADDITIVE and IDEMPOTENT:
--   * two nullable columns + one unique constraint on `profiles`
--   * no default, no backfill, no existing row or column touched
--
-- REVERSIBILITY
-- -------------
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_razorpay_subscription_id_unique;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS razorpay_subscription_id;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS billing_provider;
--
-- =============================================================

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_provider TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_razorpay_subscription_id_unique'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_razorpay_subscription_id_unique UNIQUE (razorpay_subscription_id);
  END IF;
END $$;

COMMIT;
