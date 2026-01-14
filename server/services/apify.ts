import { storage } from "../storage";
import type { FetchRun, InsertReel, InsertCompetitorStats } from "@shared/schema";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const INSTAGRAM_SCRAPER_ACTOR_ID = process.env.APIFY_INSTAGRAM_SCRAPER_ACTOR_ID || "shu8hvrXbJbY3Eb9W";
const FOLLOWERS_SCRAPER_ACTOR_ID = process.env.APIFY_FOLLOWERS_SCRAPER_ACTOR_ID || "7RQ4RlfRihUhflQtJ";

const APIFY_BASE_URL = "https://api.apify.com/v2";

interface ApifyRunResult {
  id: string;
  status: string;
  defaultDatasetId: string;
}

interface InstagramReelData {
  ownerUsername?: string;
  username?: string;
  owner?: { username?: string };
  url?: string;
  shortCode?: string;
  id?: string;
  videoUrl?: string;
  displayUrl?: string;
  videoPlayCount?: number;
  videoViewCount?: number;
  playCount?: number;
  viewCount?: number;
  likesCount?: number;
  likes?: number;
  commentsCount?: number;
  comments?: number;
  videoDuration?: number;
  duration?: number;
  timestamp?: string;
  takenAtTimestamp?: number;
  takenAt?: string;
  type?: string;
  productType?: string;
}

interface FollowersData {
  userName?: string;
  username?: string;
  followersCount?: number;
  followers?: number;
}

async function runActor(actorId: string, input: any): Promise<ApifyRunResult> {
  const response = await fetch(`${APIFY_BASE_URL}/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to start Apify actor: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.data;
}

async function waitForRun(runId: string, maxWaitMs: number = 480000): Promise<ApifyRunResult> {
  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    
    if (!response.ok) {
      throw new Error(`Failed to check run status: ${response.status}`);
    }

    const data = await response.json();
    const run = data.data;

    if (run.status === "SUCCEEDED") {
      return run;
    }

    if (run.status === "FAILED" || run.status === "ABORTED" || run.status === "TIMED-OUT") {
      throw new Error(`Apify run failed with status: ${run.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Apify run timed out");
}

async function getDatasetItems<T>(datasetId: string): Promise<T[]> {
  const response = await fetch(
    `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status}`);
  }

  return response.json();
}

function parseReelData(item: InstagramReelData, username: string): Partial<InsertReel> | null {
  const reelUrl = item.url || 
    (item.shortCode ? `https://instagram.com/reel/${item.shortCode}` : null) ||
    (item.id ? `https://instagram.com/reel/${item.id}` : null);
  
  if (!reelUrl) return null;

  const views = item.videoPlayCount || item.videoViewCount || item.playCount || item.viewCount || 0;
  const likes = item.likesCount || item.likes || 0;
  const comments = item.commentsCount || item.comments || 0;
  const durationSeconds = item.videoDuration || item.duration ? Math.round(item.videoDuration || item.duration || 0) : 0;

  let postedAt: Date | null = null;
  if (item.timestamp) {
    postedAt = new Date(item.timestamp);
  } else if (item.takenAtTimestamp) {
    postedAt = new Date(item.takenAtTimestamp * 1000);
  } else if (item.takenAt) {
    postedAt = new Date(item.takenAt);
  }

  const engagementRate = views > 0 ? (likes + comments) / views : 0;
  const viralScore =
    Math.log10(views + 1) * 0.7 +
    Math.log10(likes + 1) * 0.2 +
    Math.log10(comments + 1) * 0.1;

  const itemUsername = item.ownerUsername || item.username || item.owner?.username || username;

  return {
    username: itemUsername.toLowerCase(),
    reelUrl,
    views,
    likes,
    comments,
    durationSeconds,
    postedAt,
    engagementRate: engagementRate.toFixed(6),
    viralScore: viralScore.toFixed(4),
  };
}

export async function processApifyFetch(
  fetchRun: FetchRun,
  usernames: string[]
): Promise<void> {
  if (!APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN is not configured");
  }

  console.log(`Starting Apify fetch for run ${fetchRun.id} with ${usernames.length} usernames`);

  await storage.updateFetchRun(fetchRun.id, {
    status: "running",
    startedAt: new Date(),
  });

  const directUrls = usernames.map(username => `https://www.instagram.com/${username}`);
  
  const reelsInput = {
    directUrls: directUrls,
    resultsType: "posts",
    resultsLimit: 200,
    searchType: "hashtag",
    searchLimit: 1,
    addParentData: false,
  };

  console.log("Starting Instagram Scraper actor...");
  const reelsRun = await runActor(INSTAGRAM_SCRAPER_ACTOR_ID, reelsInput);
  console.log(`Instagram Scraper run started: ${reelsRun.id}`);

  const completedReelsRun = await waitForRun(reelsRun.id);
  console.log("Instagram Scraper completed");

  const reelsData = await getDatasetItems<InstagramReelData>(completedReelsRun.defaultDatasetId);
  console.log(`Got ${reelsData.length} items from Instagram Scraper`);
  
  if (reelsData.length > 0) {
    console.log("Sample item structure:", JSON.stringify(reelsData[0], null, 2).slice(0, 1000));
  }

  await storage.createRawPayload({
    fetchRunId: fetchRun.id,
    actor: "instagram_scraper",
    payload: reelsData as any,
  });

  await storage.updateFetchRun(fetchRun.id, { status: "merging" });

  const uniqueUsernames = [...new Set(
    reelsData
      .map((item) => (item.ownerUsername || item.username || "").toLowerCase())
      .filter(Boolean)
  )];

  let followersMap = new Map<string, number>();

  if (uniqueUsernames.length > 0) {
    console.log(`Fetching followers for ${uniqueUsernames.length} usernames...`);
    
    const followersInput = {
      usernames: uniqueUsernames,
    };

    try {
      const followersRun = await runActor(FOLLOWERS_SCRAPER_ACTOR_ID, followersInput);
      const completedFollowersRun = await waitForRun(followersRun.id);
      const followersData = await getDatasetItems<FollowersData>(completedFollowersRun.defaultDatasetId);

      await storage.createRawPayload({
        fetchRunId: fetchRun.id,
        actor: "followers_scraper",
        payload: followersData as any,
      });

      for (const item of followersData) {
        const username = (item.userName || item.username || "").toLowerCase();
        const followers = item.followersCount || item.followers || 0;
        if (username) {
          followersMap.set(username, followers);
        }
      }

      console.log(`Got followers for ${followersMap.size} usernames`);
    } catch (error) {
      console.error("Failed to fetch followers, continuing without:", error);
    }
  }

  await storage.updateFetchRun(fetchRun.id, { status: "analyzing" });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - fetchRun.timeRangeDays);

  const reelsToInsert: InsertReel[] = [];
  const userStatsMap = new Map<string, {
    views: number[];
    engagements: number[];
    topViews: number;
  }>();

  for (const item of reelsData) {
    const username = (item.ownerUsername || item.username || "").toLowerCase();
    if (!username) continue;

    const parsed = parseReelData(item, username);
    if (!parsed || !parsed.reelUrl) continue;

    if (parsed.postedAt && parsed.postedAt < cutoffDate) continue;

    reelsToInsert.push({
      fetchRunId: fetchRun.id,
      username: parsed.username!,
      reelUrl: parsed.reelUrl,
      views: parsed.views!,
      likes: parsed.likes!,
      comments: parsed.comments!,
      durationSeconds: parsed.durationSeconds!,
      postedAt: parsed.postedAt,
      engagementRate: parsed.engagementRate!,
      viralScore: parsed.viralScore!,
    });

    if (!userStatsMap.has(username)) {
      userStatsMap.set(username, { views: [], engagements: [], topViews: 0 });
    }
    const stats = userStatsMap.get(username)!;
    const views = parsed.views || 0;
    const engagement = parseFloat(parsed.engagementRate || "0");
    stats.views.push(views);
    stats.engagements.push(engagement);
    stats.topViews = Math.max(stats.topViews, views);
  }

  if (reelsToInsert.length > 0) {
    await storage.createReels(reelsToInsert);
    console.log(`Inserted ${reelsToInsert.length} reels`);
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

  console.log(`Fetch run ${fetchRun.id} completed successfully`);
}
