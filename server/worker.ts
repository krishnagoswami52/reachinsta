import { storage } from "./storage";
import { processApifyFetch, FetchTimeoutError } from "./services/apify";
import { MAX_CONCURRENT_JOBS, planForPriority } from "@shared/queue";
import type { Job } from "@shared/schema";

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;

/**
 * How many queued rows to look at per tick.
 *
 * Wider than the number of free slots on purpose: candidates get skipped by
 * the fairness gates below, and if the window were exactly the slot count a
 * run of skipped jobs would leave the pool idle with work waiting. Still
 * bounded, so a 500-deep queue does not turn every tick into a large read.
 */
const CANDIDATE_WINDOW = MAX_CONCURRENT_JOBS * 4;

/**
 * Jobs this process is running right now, keyed by job id.
 *
 * The authoritative record of a claim is the database (claimJob is an atomic
 * CAS), but the pool needs a synchronous, in-process count to decide how many
 * more jobs it may start within a single tick — a DB round-trip per decision
 * would race with itself.
 */
const activeJobs = new Map<string, { userId: string; priority: number }>();

/**
 * Stuck-job recovery.
 *
 * A job is "stuck" when it sits in status="running" with no heartbeat for
 * STUCK_JOB_THRESHOLD_MS. Because getQueuedJobs() only ever looks at
 * status="queued", such a row was previously invisible forever — the run stayed
 * non-terminal, the user's dashboard polled indefinitely and their fetch button
 * stayed disabled. See docs/fetch-flow-audit.md (C1).
 *
 * The threshold has to clear the longest legitimate run. A live worker
 * heartbeats every HEARTBEAT_INTERVAL_MS, so healthy long runs keep their
 * updated_at fresh and are never swept regardless of how long they take.
 */
const STUCK_JOB_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes without a heartbeat
const STUCK_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // sweep every 5 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

/** Claim a queued job and run it. Used by the degraded single-job fallback. */
async function processJob(jobId: string): Promise<void> {
  const job = await storage.claimJob(jobId);
  if (!job) {
    console.log(`Job ${jobId} was already claimed or doesn't exist`);
    return;
  }
  await runClaimedJob(job);
}

/**
 * Run a job that has already been claimed.
 *
 * Split out from processJob so the pool can claim first (which is what makes a
 * slot count meaningful) and only then hand the work off to run concurrently.
 */
async function runClaimedJob(job: Job): Promise<void> {
  console.log(`Processing job ${job.id} (attempt ${job.attempts + 1}/${MAX_ATTEMPTS})`);

  // Keep updated_at fresh for as long as we hold this job, so the stuck-job
  // sweep can tell "still working" apart from "worker died". Cleared in the
  // finally block below — a job with no live owner stops heartbeating within
  // one interval.
  const heartbeat = setInterval(() => {
    storage.touchJob(job.id).catch((err) => {
      console.error(`[Worker] Heartbeat failed for job ${job.id}:`, err);
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const fetchRun = await storage.getFetchRun(job.fetchRunId);
    if (!fetchRun) {
      throw new Error(`Fetch run ${job.fetchRunId} not found`);
    }

    let usernames: string[] = [];

    // Use competitors from fetch run if available, otherwise fetch from storage
    if (fetchRun.competitorUsernames && fetchRun.competitorUsernames.length > 0) {
      usernames = fetchRun.competitorUsernames;
    } else {
      const competitors = await storage.getCompetitors(job.userId);
      usernames = competitors.map((c) => c.username);
    }

    if (usernames.length === 0) {
      throw new Error("No competitors to fetch");
    }

    // The job's frozen priority is the same classification the queue ordered
    // by, so key selection and scheduling always agree on which plan this job
    // belongs to — even if the profile changed after it was enqueued.
    const plan = planForPriority(job.priority);

    await processApifyFetch(fetchRun, usernames, {
      plan,
      onKeySelected: async (keyId) => {
        // Attribution only — a failure here must never sink a live fetch.
        try {
          await storage.setJobApifyKey(job.id, keyId);
        } catch (err) {
          console.error(`[Worker] Could not record Apify key for job ${job.id}:`, err);
        }
      },
    });

    await storage.updateJob(job.id, {
      status: "completed",
      attempts: job.attempts + 1,
    });

    console.log(`Job ${job.id} completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Job ${job.id} failed:`, errorMessage);

    const attempts = job.attempts + 1;

    // A timeout means Apify was given its full budgeted wall-clock and still
    // did not finish. Retrying re-pays for the same slow actor run and would
    // occupy the worker for another full timeout window, so timeouts are
    // terminal. The user gets their credit back instead. See audit C2.
    const isTimeout = error instanceof FetchTimeoutError;

    if (isTimeout) {
      await storage.updateJob(job.id, {
        status: "failed",
        attempts,
        lastError: errorMessage,
      });

      await storage.updateFetchRun(job.fetchRunId, {
        status: "failed",
        errorMessage,
      });

      const refunded = await storage.refundFetchCredit(job.userId);
      console.warn(
        `[Worker] Job ${job.id} timed out — marked failed without retry. ` +
          `Credit refunded to ${job.userId}: ${refunded}`,
      );
    } else if (attempts < MAX_ATTEMPTS) {
      await storage.updateJob(job.id, {
        status: "queued",
        attempts,
        lastError: errorMessage,
      });

      await storage.updateFetchRun(job.fetchRunId, {
        status: "queued",
        errorMessage: `Retry ${attempts}/${MAX_ATTEMPTS}: ${errorMessage}`,
      });

      console.log(`Job ${job.id} will be retried (attempt ${attempts + 1}/${MAX_ATTEMPTS})`);
    } else {
      await storage.updateJob(job.id, {
        status: "failed",
        attempts,
        lastError: errorMessage,
      });

      await storage.updateFetchRun(job.fetchRunId, {
        status: "failed",
        errorMessage,
      });

      console.log(`Job ${job.id} failed permanently after ${MAX_ATTEMPTS} attempts`);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Recover jobs abandoned by a dead worker.
 *
 * Requeue is preferred over failing: the user still wants their data, and the
 * existing attempts/retry accounting carries over so a job that keeps dying
 * cannot loop forever. Only once attempts are exhausted is the job failed, and
 * in that case the fetch credit is refunded — the user never got a result.
 */
async function recoverStuckJobs(): Promise<void> {
  let stuck;
  try {
    stuck = await storage.getStuckJobs(STUCK_JOB_THRESHOLD_MS);
  } catch (error) {
    console.error("[Worker] Stuck-job sweep failed to query:", error);
    return;
  }

  if (stuck.length === 0) return;

  console.warn(
    `[Worker] Stuck-job sweep found ${stuck.length} job(s) with no heartbeat for ` +
      `${STUCK_JOB_THRESHOLD_MS / 60000}m: ${stuck.map((j) => j.id).join(", ")}`,
  );

  for (const job of stuck) {
    const staleForMs = Date.now() - new Date(job.updatedAt).getTime();
    const staleMins = Math.round(staleForMs / 60000);
    const reason = `Recovered after worker went away (no heartbeat for ${staleMins}m)`;

    try {
      if (job.attempts + 1 < MAX_ATTEMPTS) {
        // The CAS inside requeueStuckJob returns undefined if the row is no
        // longer "running" — i.e. the original worker finished it between our
        // SELECT and our UPDATE. Skipping is the correct outcome there.
        const requeued = await storage.requeueStuckJob(job.id, job.attempts + 1, reason);
        if (!requeued) {
          console.log(`[Worker] Stuck job ${job.id} resolved itself before recovery — skipped`);
          continue;
        }

        await storage.updateFetchRun(job.fetchRunId, {
          status: "queued",
          errorMessage: `Recovering: ${reason}`,
        });

        console.warn(
          `[Worker] Requeued stuck job ${job.id} (run ${job.fetchRunId}, ` +
            `attempt ${job.attempts + 2}/${MAX_ATTEMPTS}, stale ${staleMins}m)`,
        );
      } else {
        const failed = await storage.failStuckJob(job.id, job.attempts + 1, reason);
        if (!failed) {
          console.log(`[Worker] Stuck job ${job.id} resolved itself before recovery — skipped`);
          continue;
        }

        await storage.updateFetchRun(job.fetchRunId, {
          status: "failed",
          errorMessage: reason,
        });

        const refunded = await storage.refundFetchCredit(job.userId);
        console.warn(
          `[Worker] Stuck job ${job.id} exhausted ${MAX_ATTEMPTS} attempts — failed. ` +
            `Credit refunded to ${job.userId}: ${refunded}`,
        );
      }
    } catch (error) {
      // One bad row must not abort the sweep for the rest.
      console.error(`[Worker] Failed to recover stuck job ${job.id}:`, error);
    }
  }
}

/**
 * Fill any free slot in the pool from the head of the priority queue.
 *
 * Returns as soon as the work is launched — it does not wait for it. That is
 * the whole point: the previous implementation awaited each job in a for-loop,
 * so a 63s average run serialised into a ~30 minute wait for the 30th user
 * (docs/fetch-flow-audit.md, scenario 7).
 */
async function scheduleFromQueue(): Promise<void> {
  if (activeJobs.size >= MAX_CONCURRENT_JOBS) return;

  const candidates = await storage.getQueuedJobs(CANDIDATE_WINDOW);
  if (candidates.length === 0) return;

  for (const candidate of candidates) {
    if (activeJobs.size >= MAX_CONCURRENT_JOBS) break;
    if (activeJobs.has(candidate.id)) continue;

    // claimJob is a CAS on status='queued', so a job cannot be started twice
    // even if two ticks (or two processes) reach it together.
    const job = await storage.claimJob(candidate.id);
    if (!job) continue;

    // Recorded before the first await inside the job so the slot count is
    // correct for every later decision in this same tick.
    activeJobs.set(job.id, { userId: job.userId, priority: job.priority });

    console.log(
      `[Worker] Started job ${job.id} (priority ${job.priority}) — ` +
        `${activeJobs.size}/${MAX_CONCURRENT_JOBS} slots busy`,
    );

    void runClaimedJob(job)
      .catch((err) => console.error(`[Worker] Job ${job.id} threw out of its handler:`, err))
      .finally(() => {
        activeJobs.delete(job.id);
        console.log(
          `[Worker] Freed slot for job ${job.id} — ${activeJobs.size}/${MAX_CONCURRENT_JOBS} busy`,
        );
      });
  }
}

/**
 * Last-resort path when the pool scheduler itself fails.
 *
 * Keeps the pre-pool behaviour available: claim one job, run it to completion,
 * return. Slower, but a queue that drains slowly beats a queue that stops.
 */
async function runSingleJobFallback(): Promise<void> {
  try {
    const [job] = await storage.getQueuedJobs(1);
    if (!job) return;
    console.warn(`[Worker] Pool scheduling failed — running job ${job.id} sequentially`);
    await processJob(job.id);
  } catch (error) {
    console.error("[Worker] Single-job fallback also failed:", error);
  }
}

async function pollForJobs(): Promise<void> {
  try {
    await scheduleFromQueue();
  } catch (error) {
    console.error("Error polling for jobs:", error);
    await runSingleJobFallback();
  }
}

export async function startWorker(): Promise<void> {
  console.log("Starting background worker...");
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`Concurrency: ${MAX_CONCURRENT_JOBS} parallel slot(s)`);
  console.log(`Max attempts: ${MAX_ATTEMPTS}`);
  console.log(
    `Stuck-job sweep: every ${STUCK_SWEEP_INTERVAL_MS / 60000}m, ` +
      `threshold ${STUCK_JOB_THRESHOLD_MS / 60000}m, heartbeat ${HEARTBEAT_INTERVAL_MS / 1000}s`,
  );

  const tick = async () => {
    await pollForJobs();
    setTimeout(tick, POLL_INTERVAL_MS);
  };

  // Runs on its own timer rather than inside the poll loop: pollForJobs blocks
  // for the whole duration of a fetch, so a sweep chained to it would not run
  // while the worker is busy — exactly when recovery matters most.
  const sweep = async () => {
    await recoverStuckJobs();
    setTimeout(sweep, STUCK_SWEEP_INTERVAL_MS);
  };

  tick();
  sweep();
}
