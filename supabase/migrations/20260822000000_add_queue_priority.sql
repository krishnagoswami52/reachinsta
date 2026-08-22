-- H1: concurrency + priority queue.
--
-- Additive only. Every statement is idempotent so it can be replayed safely,
-- and nothing here rewrites a terminal row: completed and failed history is
-- left exactly as it is.

-- ── jobs: scheduling class + cost attribution ────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 3;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_apify_cost NUMERIC(10,4);

-- apify_keys.id is a VARCHAR uuid in this database (not the INTEGER the
-- original spec assumed), so the FK column matches that type.
-- ON DELETE SET NULL: losing a retired key must not delete job history.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apify_key_id VARCHAR;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_apify_key_id_fkey'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_apify_key_id_fkey
      FOREIGN KEY (apify_key_id) REFERENCES apify_keys(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backs the priority-queue pop. Partial: only queued rows are ever ordered by
-- this, and the queued set is tiny compared to the completed history.
CREATE INDEX IF NOT EXISTS idx_jobs_priority_queue
  ON jobs (priority ASC, created_at ASC)
  WHERE status = 'queued';

-- ── fetch_runs: two-layer errors ─────────────────────────────────────────────
-- error_message becomes user-facing copy; the technical classification moves
-- to internal_error_code. See server/utils/errorMessages.ts.
ALTER TABLE fetch_runs ADD COLUMN IF NOT EXISTS internal_error_code VARCHAR(50);

-- ── Backfill priority for work that is still in flight ───────────────────────
-- Only queued/running rows. Terminal jobs keep the default 3; their priority
-- is meaningless and rewriting them would churn 120 rows of history for
-- nothing.
UPDATE jobs j
SET priority = CASE p.plan
                 WHEN 'pro'  THEN 1
                 WHEN 'plus' THEN 2
                 ELSE 3
               END
FROM profiles p
WHERE p.id = j.user_id
  AND j.status IN ('queued', 'running')
  AND j.priority = 3;
