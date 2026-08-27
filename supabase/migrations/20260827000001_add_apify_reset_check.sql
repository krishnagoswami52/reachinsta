-- H2 follow-up: per-key renewal tracking for the Apify key pool.
--
-- Additive and idempotent. Nothing here changes a key's budget or its
-- is_exhausted flag.
--
-- The reset job no longer fires on a calendar day. Apify anchors each
-- account's credit cycle to its own signup date — across this pool the cycles
-- start on the 27th, 30th, 12th and 1st — so the job now polls each retired
-- key for its real cycle and resets it when that cycle turns over.
--
-- monthly_reset_at (added in 20260827000000) still records the last reset and
-- is what stops a key being credited twice inside one cycle. This column
-- records the last time a key was LOOKED AT, whatever the outcome, so a run
-- that holds every key still leaves evidence it ran and the poll can be seen
-- to be alive without reading logs.

ALTER TABLE apify_keys ADD COLUMN IF NOT EXISTS last_reset_check_at TIMESTAMP;
