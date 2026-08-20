import { storage } from "./storage";
import { processApifyFetch, FetchTimeoutError } from "./services/apify";

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;

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

async function processJob(jobId: string): Promise<void> {
  const job = await storage.claimJob(jobId);
  if (!job) {
    console.log(`Job ${jobId} was already claimed or doesn't exist`);
    return;
  }

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

    await processApifyFetch(fetchRun, usernames);

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

async function pollForJobs(): Promise<void> {
  try {
    const jobs = await storage.getQueuedJobs();

    for (const job of jobs) {
      await processJob(job.id);
    }
  } catch (error) {
    console.error("Error polling for jobs:", error);
  }
}

export async function startWorker(): Promise<void> {
  console.log("Starting background worker...");
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
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
