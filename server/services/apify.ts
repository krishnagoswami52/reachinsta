import { ApifyClient } from 'apify-client';
import { storage } from "../storage";
import type { FetchRun, InsertReel, InsertCompetitorStats } from "@shared/schema";
import { getBestKey, isBudgetError, markExhausted, maskToken, recordUsage } from "./keyManager";

const INSTAGRAM_SCRAPER_ACTOR_ID = "shu8hvrXbJbY3Eb9W";
const FOLLOWERS_SCRAPER_ACTOR_ID = "7RQ4RlfRihUhflQtJ";
const MAX_KEY_ATTEMPTS = 10; // max keys to try before giving up

async function runActorWithRotation<T>(
  fn: (client: ApifyClient) => Promise<T>,
): Promise<{ result: T; token: string }> {
  let lastError: Error = new Error("No Apify keys available");

  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
    const token = await getBestKey();
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

    console.log(`[KeyManager] Using token ${maskToken(token)} for fetch (attempt ${attempt + 1})`);

    try {
      const result = await fn(client);
      console.log(`[KeyManager] Fetch succeeded with token ${maskToken(token)}`);
      return { result, token };
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

export async function processApifyFetch(
  fetchRun: FetchRun,
  usernames: string[]
): Promise<void> {
  console.log(`Starting Apify fetch for run ${fetchRun.id} with ${usernames.length} usernames: ${usernames.join(', ')}`);

  await storage.updateFetchRun(fetchRun.id, {
    status: "running",
    startedAt: new Date(),
  });

  try {
    const directUrls = usernames.map(username => `https://www.instagram.com/${username}`);

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
      searchType: "hashtag",
      searchLimit: 1,
      addParentData: false,
    };

    const { result: postsRun, token: postsToken } = await runActorWithRotation((client) =>
      client.actor(INSTAGRAM_SCRAPER_ACTOR_ID).call(reelsInput)
    );
    console.log(`Instagram Scraper run completed with status: ${postsRun.status}`);

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

    console.log(`Parsed ${reelsToInsert.length} valid posts to insert (skipped ${pinnedCount} pinned posts)`);

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
        const { result: followersRun, token: followersToken } = await runActorWithRotation((client) =>
          client.actor(FOLLOWERS_SCRAPER_ACTOR_ID).call(followersInput)
        );
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
    });

    console.log(`Fetch run ${fetchRun.id} completed successfully with ${reelsToInsert.length} posts`);

  } catch (error: any) {
    console.error(`Fetch run ${fetchRun.id} failed:`, error.message);
    await storage.updateFetchRun(fetchRun.id, {
      status: "failed",
      errorMessage: error.message,
    });
    throw error;
  }
}
