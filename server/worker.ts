import { storage } from "./storage";
import { processApifyFetch } from "./services/apify";

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;

async function processJob(jobId: string): Promise<void> {
  const job = await storage.claimJob(jobId);
  if (!job) {
    console.log(`Job ${jobId} was already claimed or doesn't exist`);
    return;
  }

  console.log(`Processing job ${job.id} (attempt ${job.attempts + 1}/${MAX_ATTEMPTS})`);

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

    if (attempts < MAX_ATTEMPTS) {
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

  const tick = async () => {
    await pollForJobs();
    setTimeout(tick, POLL_INTERVAL_MS);
  };

  tick();
}
