import { ApifyClient } from 'apify-client';
import { storage } from "../storage";
import type { FetchRun, InsertReel, InsertCompetitorStats, PlanType } from "@shared/schema";
import {
  getKeyForPlan,
  isBudgetError,
  markExhausted,
  markTokenInFlight,
  maskToken,
  recordUsage,
  releaseToken,
} from "./keyManager";
import { handleError } from "../utils/errorMessages";

const INSTAGRAM_SCRAPER_ACTOR_ID = "shu8hvrXbJbY3Eb9W";
const FOLLOWERS_SCRAPER_ACTOR_ID = "7RQ4RlfRihUhflQtJ";
const MAX_KEY_ATTEMPTS = 10; // max keys to try before giving up

/**
 * Wall-clock ceiling on a single Apify actor run. See docs/fetch-flow-audit.md (C2).
 *
 * `timeout` is enforced by Apify: it aborts the run server-side, which is what
 * actually stops us paying for a runaway actor. `waitSecs` is enforced locally
 * and is deliberately a little longer, so that when a run does hit the ceiling
 * we observe Apify's own TIMED-OUT status rather than giving up first and
 * leaving the run orphaned on their side.
 *
 * Without these, `.call()` waits indefinitely (apify-client's documented
 * default) and a single hung run pins the worker forever.
 */
const APIFY_RUN_TIMEOUT_SECS = 600; // 10 minutes, enforced by Apify
const APIFY_WAIT_SECS = APIFY_RUN_TIMEOUT_SECS + 30; // local wait, with grace

/** Apify run states that mean "this run is over, one way or another". */
const TERMINAL_RUN_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT", "TIMING-OUT"]);

/**
 * A fetch that exceeded its time budget.
 *
 * The worker treats this as terminal rather than retrying: another attempt
 * would re-pay for the same slow actor and hold the worker for another full
 * timeout window. The user's fetch credit is refunded instead.
 */
export class FetchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchTimeoutError";
  }
}

/**
 * apify-client's waitForFinish RESOLVES with the run when waitSecs elapses —
 * it does not throw. Left unchecked, a timed-out run therefore flows straight
 * on to listItems() and yields a partial or empty dataset that we would store
 * as a successful fetch. Every actor call must pass through this.
 */
function assertRunFinished(run: { status?: string; id?: string }, actorLabel: string): void {
  const status = run?.status ?? "UNKNOWN";

  if (status === "SUCCEEDED") return;

  if (!TERMINAL_RUN_STATUSES.has(status)) {
    throw new FetchTimeoutError(
      `${actorLabel} did not finish within ${APIFY_WAIT_SECS}s (run ${run?.id ?? "?"} still ${status}). Timed out.`,
    );
  }

  if (status === "TIMED-OUT" || status === "TIMING-OUT") {
    throw new FetchTimeoutError(
      `${actorLabel} exceeded its ${APIFY_RUN_TIMEOUT_SECS}s limit on Apify (run ${run?.id ?? "?"}).`,
    );
  }

  // FAILED / ABORTED are ordinary failures — retryable, so not a timeout error.
  throw new Error(`${actorLabel} finished with status ${status} (run ${run?.id ?? "?"}).`);
}

/**
 * Run one actor call, rotating through the key pool on budget failures.
 *
 * The key is now chosen for the requesting user's plan rather than always
 * taking the fattest token, and it is flagged in-flight for the duration so
 * concurrent workers land on different tokens. `tried` makes rotation
 * monotonic: a token that just failed is never offered again for this call,
 * which matters now that selection is plan-shaped and could otherwise keep
 * returning the same "best for free" key.
 */
async function runActorWithRotation<T>(
  plan: PlanType,
  fn: (client: ApifyClient) => Promise<T>,
): Promise<{ result: T; token: string; keyId: string }> {
  let lastError: Error = new Error("No Apify keys available");
  const tried = new Set<string>();

  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
    let key;
    try {
      key = await getKeyForPlan(plan, tried);
    } catch (error: any) {
      throw tried.size > 0 ? lastError : error;
    }
    const token = key.token;
    tried.add(token);
    const client = new ApifyClient({ token });

    // Test hook: inject a budget error for a specific token via env flag.
    // Safe to leave in code — only fires when APIFY_TEST_FORCE_BUDGET_ERROR is set.
    if (process.env.APIFY_TEST_FORCE_BUDGET_ERROR === token) {
      const fakeErr = new Error("monthly usage limit reached");
      console.warn(`[KeyManager] APIFY_TEST_FORCE_BUDGET_ERROR active — injecting budget error for ${maskToken(token)}`);
      if (isBudgetError(fakeErr)) {
        console.warn(`[KeyManager] Token ${maskToken(token)} hit budget limit. Marking exhausted, rotating to next.`, { error: fakeErr.message });
        await markExhausted(token);
        lastError = fakeErr;
        continue;
      }
    }

    console.log(`[KeyManager] Using token ${maskToken(token)} for ${plan} fetch (attempt ${attempt + 1})`);

    markTokenInFlight(token);
    try {
      const result = await fn(client);
      console.log(`[KeyManager] Fetch succeeded with token ${maskToken(token)}`);
      return { result, token, keyId: key.id };
    } catch (error: any) {
      if (isBudgetError(error)) {
        console.warn(
          `[KeyManager] Token ${maskToken(token)} hit budget limit. Marking exhausted, rotating to next.`,
          { error: error?.message?.slice(0, 200) },
        );
        await markExhausted(token);
        lastError = error;
        continue;
      }
      console.error(
        `[KeyManager] Token ${maskToken(token)} failed with NON-budget error.`,
        { error: error?.message?.slice(0, 200), statusCode: error?.statusCode },
      );
      throw error;
    } finally {
      releaseToken(token);
    }
  }

  throw lastError;
}

interface InstagramPostData {
  id?: string;
  shortCode?: string;
  url?: string;
  type?: string;
  productType?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  ownerId?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  commentsCount?: number;
  likesCount?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  videoDuration?: number;
  timestamp?: string;
  displayUrl?: string;
  videoUrl?: string;
  alt?: string;
  locationName?: string;
  firstComment?: string;
  latestComments?: any[];
  dimensionsHeight?: number;
  dimensionsWidth?: number;
  images?: string[];
  inputUrl?: string;
  isPinned?: boolean;
  /**
   * Present on ~11% of scraped items. Instagram's collaborators for a post —
   * the non-owner creators it also appears on. Not used for filtering today
   * (a collab is attributed to its owner and nobody else), but declared so the
   * field is not silently dropped if we later want to credit co-produced reels
   * to both parties.
   */
  coauthorProducers?: { username?: string }[];
}

interface FollowerData {
  userName?: string;
  username?: string;
  followersCount?: number;
  followers?: number;
  fullName?: string;
  biography?: string;
  postsCount?: number;
  followsCount?: number;
}

export interface ProcessFetchOptions {
  /**
   * Plan the fetch is being run for. Drives which Apify key funds it — a
   * 28-day pro fetch is steered at a fat key, a 7-day free fetch at a
   * nearly-spent one. Defaults to "free" so any existing caller keeps working.
   */
  plan?: PlanType;
  /** Called with the key id as soon as one is committed to, for attribution. */
  onKeySelected?: (keyId: string) => void | Promise<void>;
}

export async function processApifyFetch(
  fetchRun: FetchRun,
  usernames: string[],
  options: ProcessFetchOptions = {}
): Promise<void> {
  const plan: PlanType = options.plan ?? "free";
  console.log(`Starting Apify fetch for run ${fetchRun.id} with ${usernames.length} usernames: ${usernames.join(', ')}`);

  await storage.updateFetchRun(fetchRun.id, {
    status: "running",
    startedAt: new Date(),
  });

  try {
    const directUrls = usernames.map(username => `https://www.instagram.com/${username}`);

    // The allowlist for the parse loop below. `usernames` is what we actually
    // asked Apify for (the fetch run's frozen snapshot); anything the scraper
    // returns under a different owner is a collaboration or tagged post and is
    // not this user's competitor. Normalised the same way the competitors
    // table is written (routes.ts) so the comparison cannot miss on case or a
    // stray "@".
    const requestedUsernames = new Set(
      usernames.map((u) => u.trim().toLowerCase().replace(/^@/, "")),
    );

    const resultsLimitMap: Record<number, number> = {
      7: 11,
      14: 21,
      28: 36,
    };

    const onlyPostsNewerThanMap: Record<number, string> = {
      7: "8 days",
      14: "15 days",
      28: "29 days",
    };

    const resultsLimit = resultsLimitMap[fetchRun.timeRangeDays] || 21;
    const onlyPostsNewerThan = onlyPostsNewerThanMap[fetchRun.timeRangeDays] || "15 days";

    console.log(`Starting Instagram Scraper with ${usernames.length} URLs, limit: ${resultsLimit}, newer than: ${onlyPostsNewerThan}`);

    const reelsInput = {
      directUrls: directUrls,
      resultsType: "posts",
      resultsLimit: resultsLimit,
      onlyPostsNewerThan: onlyPostsNewerThan,
      addParentData: false,
    };

    const { result: postsRun, token: postsToken, keyId: postsKeyId } = await runActorWithRotation(plan, (client) =>
      client.actor(INSTAGRAM_SCRAPER_ACTOR_ID).call(reelsInput, {
        timeout: APIFY_RUN_TIMEOUT_SECS,
        waitSecs: APIFY_WAIT_SECS,
      })
    );
    console.log(`Instagram Scraper run completed with status: ${postsRun.status}`);
    await options.onKeySelected?.(postsKeyId);
    assertRunFinished(postsRun, "Instagram Scraper");

    const { items: postsData } = await new ApifyClient({ token: postsToken })
      .dataset(postsRun.defaultDatasetId)
      .listItems();
    console.log(`Got ${postsData.length} items from Instagram Scraper`);

    await recordUsage(postsToken, postsData.length, 0);

    if (postsData.length > 0) {
      console.log("Sample post data:", JSON.stringify(postsData[0], null, 2).slice(0, 2000));
    }

    await storage.createRawPayload({
      fetchRunId: fetchRun.id,
      actor: "instagram_scraper",
      payload: postsData as any,
    });

    await storage.updateFetchRun(fetchRun.id, { status: "analyzing" });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - fetchRun.timeRangeDays);
    console.log(`Filtering posts from last ${fetchRun.timeRangeDays} days (since ${cutoffDate.toISOString()})`);

    const reelsToInsert: InsertReel[] = [];
    const userStatsMap = new Map<string, {
      views: number[];
      engagements: number[];
      topViews: number;
    }>();

    let pinnedCount = 0;
    let collabSkipped = 0;
    let nonReelSkipped = 0;
    for (const item of postsData as InstagramPostData[]) {
      if ((item as any).error) {
        console.log("Skipping error item:", (item as any).error);
        continue;
      }

      if (item.isPinned === true) {
        pinnedCount++;
        continue;
      }

      const username = (item.ownerUsername || "").toLowerCase();
      if (!username) {
        console.log("Skipping item with no username");
        continue;
      }

      // Collaboration posts appear on BOTH creators' grids but carry a single
      // owner. Scraping @a returns a collab whose ownerUsername is @b, and
      // without this guard @b is stored as if the user tracked them — they get
      // reels, a competitor_stats row, a leaderboard slot and a paid follower
      // lookup. Verified against raw_payloads: 152 of 5241 scraped items carry
      // an owner other than the profile they were scraped from.
      if (!requestedUsernames.has(username)) {
        collabSkipped++;
        continue;
      }

      // `resultsType: "posts"` returns photos and carousels alongside reels.
      // They have no videoPlayCount, so they land as views=0 / ER=0 / 0s rows
      // that drag every average down and inflate the reel count. Only clips are
      // reels. Verified against raw_payloads: every item that lacks
      // productType is an error row, a Sidecar or an Image — no genuine reel
      // is missing the field, so a strict comparison drops nothing real.
      if (item.productType !== "clips") {
        nonReelSkipped++;
        continue;
      }

      const reelUrl = item.url || 
        (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : null) ||
        (item.id ? `https://www.instagram.com/p/${item.id}/` : null);
      
      if (!reelUrl) {
        console.log("Skipping item with no URL:", item.id);
        continue;
      }

      let postedAt: Date | null = null;
      if (item.timestamp) {
        postedAt = new Date(item.timestamp);
      }

      if (postedAt && postedAt < cutoffDate) {
        continue;
      }

      const rawViews = Number(item.videoPlayCount || item.videoViewCount || 0);
      const rawLikes = Number(item.likesCount || 0);
      const rawComments = Number(item.commentsCount || 0);
      const rawDuration = item.videoDuration ? Math.round(Number(item.videoDuration)) : 0;

      const views = Number.isFinite(rawViews) ? Math.max(0, Math.floor(rawViews)) : 0;
      const likes = Number.isFinite(rawLikes) ? Math.max(0, Math.floor(rawLikes)) : 0;
      const comments = Number.isFinite(rawComments) ? Math.max(0, Math.floor(rawComments)) : 0;
      const durationSeconds = Number.isFinite(rawDuration) ? Math.min(Math.max(0, rawDuration), 86400) : 0;

      let engagementRate = views > 0 ? (likes + comments) / views : 0;
      if (!Number.isFinite(engagementRate)) engagementRate = 0;
      engagementRate = Math.min(Math.max(0, engagementRate), 999999999);
      
      let viralScore = 0;
      if (views > 0 || likes > 0 || comments > 0) {
        viralScore = 
          Math.log10(views + 1) * 0.7 +
          Math.log10(likes + 1) * 0.2 +
          Math.log10(comments + 1) * 0.1;
      }
      if (!Number.isFinite(viralScore)) viralScore = 0;
      viralScore = Math.min(Math.max(0, viralScore), 9999999999999);

      reelsToInsert.push({
        fetchRunId: fetchRun.id,
        username,
        reelUrl,
        views,
        likes,
        comments,
        durationSeconds,
        postedAt,
        engagementRate: engagementRate.toFixed(6),
        viralScore: viralScore.toFixed(4),
      });

      if (!userStatsMap.has(username)) {
        userStatsMap.set(username, { views: [], engagements: [], topViews: 0 });
      }
      const stats = userStatsMap.get(username)!;
      stats.views.push(views);
      stats.engagements.push(engagementRate);
      stats.topViews = Math.max(stats.topViews, views);
    }

    console.log(
      `Parsed ${reelsToInsert.length} valid reels to insert ` +
      `(skipped ${pinnedCount} pinned, ${collabSkipped} from non-requested accounts, ${nonReelSkipped} non-reels)`,
    );

    if (reelsToInsert.length > 0) {
      await storage.createReels(reelsToInsert);
      console.log(`Inserted ${reelsToInsert.length} reels`);
    }

    const uniqueUsernames: string[] = [];
    userStatsMap.forEach((_stats, username) => {
      uniqueUsernames.push(username);
    });
    let followersMap = new Map<string, number>();

    if (uniqueUsernames.length > 0) {
      console.log(`Fetching followers for ${uniqueUsernames.length} usernames...`);

      try {
        const followersInput = { usernames: uniqueUsernames };
        const { result: followersRun, token: followersToken } = await runActorWithRotation(plan, (client) =>
          client.actor(FOLLOWERS_SCRAPER_ACTOR_ID).call(followersInput, {
            timeout: APIFY_RUN_TIMEOUT_SECS,
            waitSecs: APIFY_WAIT_SECS,
          })
        );
        assertRunFinished(followersRun, "Followers Scraper");
        const { items: followersData } = await new ApifyClient({ token: followersToken })
          .dataset(followersRun.defaultDatasetId)
          .listItems();

        console.log(`Got ${followersData.length} follower records`);

        await recordUsage(followersToken, 0, followersData.length);

        await storage.createRawPayload({
          fetchRunId: fetchRun.id,
          actor: "followers_scraper",
          payload: followersData as any,
        });

        for (const item of followersData as FollowerData[]) {
          const uname = (item.userName || item.username || "").toLowerCase();
          const followers = item.followersCount || item.followers || 0;
          if (uname) {
            followersMap.set(uname, followers);
          }
        }
      } catch (error) {
        console.error("Failed to fetch followers, continuing without:", error);
      }
    }

    const competitorStatsToInsert: InsertCompetitorStats[] = [];

    userStatsMap.forEach((stats, username) => {
      let avgViews = 0;
      if (stats.views.length > 0) {
        const sumViews = stats.views.reduce((a: number, b: number) => a + b, 0);
        avgViews = sumViews / stats.views.length;
      }
      if (!Number.isFinite(avgViews)) avgViews = 0;
      avgViews = Math.min(Math.max(0, avgViews), 999999999999999999);
      
      let avgEngagement = 0;
      if (stats.engagements.length > 0) {
        const sumEngagement = stats.engagements.reduce((a: number, b: number) => a + b, 0);
        avgEngagement = sumEngagement / stats.engagements.length;
      }
      if (!Number.isFinite(avgEngagement)) avgEngagement = 0;
      avgEngagement = Math.min(Math.max(0, avgEngagement), 999999999);

      const rawFollowers = followersMap.get(username);
      const safeFollowers = rawFollowers && Number.isFinite(rawFollowers) 
        ? Math.max(0, Math.floor(rawFollowers)) 
        : null;
      
      const rawTopViews = stats.topViews || 0;
      const safeTopViews = Number.isFinite(rawTopViews) ? Math.max(0, Math.floor(rawTopViews)) : 0;

      competitorStatsToInsert.push({
        fetchRunId: fetchRun.id,
        username,
        followers: safeFollowers,
        reelsCount: Math.min(stats.views.length, 10000),
        avgViews: avgViews.toFixed(2),
        avgEngagementRate: avgEngagement.toFixed(6),
        topReelViews: safeTopViews,
      });
    });

    if (competitorStatsToInsert.length > 0) {
      await storage.createCompetitorStats(competitorStatsToInsert);
      console.log(`Inserted stats for ${competitorStatsToInsert.length} competitors`);
    }

    await storage.updateFetchRun(fetchRun.id, {
      status: "completed",
      completedAt: new Date(),
      // A run that succeeded must not carry copy from an earlier attempt. A
      // retried or recovered run reaches this point with a stale message
      // still on the row, and "completed" plus an error string is exactly the
      // combination that made a working fetch look broken.
      errorMessage: null,
      internalErrorCode: null,
    });

    console.log(`Fetch run ${fetchRun.id} completed successfully with ${reelsToInsert.length} posts`);

  } catch (error: any) {
    if (error instanceof FetchTimeoutError) {
      console.error(`[Apify] TIMEOUT on fetch run ${fetchRun.id}: ${error.message}`);
    } else {
      console.error(`Fetch run ${fetchRun.id} failed:`, error.message);
    }
    // The raw error keeps travelling — the worker still needs it to decide
    // retry vs. refund, and it is logged in full. Only the translated half is
    // written where a user can read it.
    const { userMessage, internalCode } = handleError(error, `ApifyFetch:${fetchRun.id}`);
    await storage.updateFetchRun(fetchRun.id, {
      status: "failed",
      errorMessage: userMessage,
      internalErrorCode: internalCode,
    });
    throw error;
  }
}
