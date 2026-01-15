import { ApifyClient } from 'apify-client';
import { storage } from "../storage";
import type { FetchRun, InsertReel, InsertCompetitorStats } from "@shared/schema";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const INSTAGRAM_SCRAPER_ACTOR_ID = "shu8hvrXbJbY3Eb9W";
const FOLLOWERS_SCRAPER_ACTOR_ID = "7RQ4RlfRihUhflQtJ";

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
  if (!APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN is not configured");
  }

  console.log(`Starting Apify fetch for run ${fetchRun.id} with ${usernames.length} usernames: ${usernames.join(', ')}`);

  const client = new ApifyClient({ token: APIFY_TOKEN });

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

    const run = await client.actor(INSTAGRAM_SCRAPER_ACTOR_ID).call(reelsInput);
    console.log(`Instagram Scraper run completed with status: ${run.status}`);

    const { items: postsData } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Got ${postsData.length} items from Instagram Scraper`);

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

      const views = item.videoPlayCount || item.videoViewCount || 0;
      const likes = item.likesCount || 0;
      const comments = item.commentsCount || 0;
      const durationSeconds = item.videoDuration ? Math.round(item.videoDuration) : 0;

      const engagementRate = views > 0 ? (likes + comments) / views : (likes > 0 ? 1 : 0);
      const viralScore =
        Math.log10(views + 1) * 0.7 +
        Math.log10(likes + 1) * 0.2 +
        Math.log10(comments + 1) * 0.1;

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

    const uniqueUsernames = [...userStatsMap.keys()];
    let followersMap = new Map<string, number>();

    if (uniqueUsernames.length > 0) {
      console.log(`Fetching followers for ${uniqueUsernames.length} usernames...`);
      
      try {
        const followersInput = { usernames: uniqueUsernames };
        const followersRun = await client.actor(FOLLOWERS_SCRAPER_ACTOR_ID).call(followersInput);
        const { items: followersData } = await client.dataset(followersRun.defaultDatasetId).listItems();

        console.log(`Got ${followersData.length} follower records`);

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

    for (const [username, stats] of userStatsMap) {
      const avgViews = stats.views.length > 0 
        ? stats.views.reduce((a, b) => a + b, 0) / stats.views.length 
        : 0;
      const avgEngagement = stats.engagements.length > 0
        ? stats.engagements.reduce((a, b) => a + b, 0) / stats.engagements.length
        : 0;

      competitorStatsToInsert.push({
        fetchRunId: fetchRun.id,
        username,
        followers: followersMap.get(username) || null,
        reelsCount: stats.views.length,
        avgViews: avgViews.toFixed(2),
        avgEngagementRate: avgEngagement.toFixed(6),
        topReelViews: stats.topViews,
      });
    }

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
