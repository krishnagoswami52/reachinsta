-- H2: monthly reset tracking for the Apify key pool.
--
-- Additive and idempotent. Nothing here changes a key's budget or its
-- is_exhausted flag — it only adds the column the monthly auto-reset job
-- needs to tell "already reset this cycle" from "due for a reset".
--
-- Background: is_exhausted was set by error-string matching that fired on
-- phrases like "insufficient permissions", and once set it never cleared.
-- Apify free-tier credit renews on the 1st UTC, so the flag outlived the
-- condition and the pool shrank permanently. server/jobs/reset-apify-keys.ts
-- clears it on the 1st; this column stops it clearing the same key twice in
-- one cycle (the job can run again after a restart on the same day).

ALTER TABLE apify_keys ADD COLUMN IF NOT EXISTS monthly_reset_at TIMESTAMP;

-- Backfill: keys retired before this column existed have never been reset, so
-- NULL is already the correct value. Left alone deliberately — a NULL here is
-- what makes the first monthly run pick them up.
