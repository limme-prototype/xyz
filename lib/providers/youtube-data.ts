import { isoDurationSeconds } from "./format";

/**
 * YouTube Data API v3, server-side only. Every call used here costs 1 quota unit
 * (10,000 units/day free). search.list is deliberately never used: it is capped at 100 calls/day.
 */
const API = "https://www.googleapis.com/youtube/v3";

export interface DataApiVideo {
  id: string;
  title: string;
  author: string;
  published: string;
  description: string;
  views: number | null;
  durationSeconds: number | null;
  liveNow: boolean;
}

export class QuotaExceededError extends Error {}

interface VideoResource {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; publishedAt?: string; description?: string; liveBroadcastContent?: string };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

async function get<T>(path: string, params: Record<string, string>, key: string): Promise<T | null> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key }).toString()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.status === 403) {
      const body = await res.text();
      if (/quotaExceeded|dailyLimitExceeded/.test(body)) throw new QuotaExceededError("YouTube API quota exceeded");
      return null;
    }
    return res.ok ? ((await res.json()) as T) : null;
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
    return null;
  }
}

function toVideo(v: VideoResource): DataApiVideo | null {
  if (!v.id) return null;
  return {
    id: v.id,
    title: v.snippet?.title ?? "",
    author: v.snippet?.channelTitle ?? "",
    published: v.snippet?.publishedAt ?? "",
    description: v.snippet?.description ?? "",
    views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
    durationSeconds: isoDurationSeconds(v.contentDetails?.duration),
    liveNow: v.snippet?.liveBroadcastContent === "live",
  };
}

/** Full details for up to 50 ids per call (durations, views). Order follows `ids`. */
export async function videosById(ids: string[], key: string): Promise<DataApiVideo[]> {
  const out: DataApiVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await get<{ items?: VideoResource[] }>(
      "videos",
      { part: "snippet,contentDetails,statistics", id: chunk.join(","), maxResults: "50" },
      key
    );
    const byId = new Map((data?.items ?? []).map((v) => [v.id, v]));
    for (const id of chunk) {
      const v = byId.get(id);
      const video = v ? toVideo(v) : null;
      if (video) out.push(video);
    }
  }
  return out;
}

/** A channel's upload history, newest first, via its uploads playlist (UC… → UU…). */
export async function channelUploads(
  channelId: string,
  key: string,
  pageToken?: string
): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const params: Record<string, string> = {
    part: "contentDetails",
    playlistId: `UU${channelId.slice(2)}`,
    maxResults: "50",
  };
  if (pageToken) params.pageToken = pageToken;
  const data = await get<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>(
    "playlistItems",
    params,
    key
  );
  return {
    ids: (data?.items ?? []).map((i) => i.contentDetails?.videoId).filter((id): id is string => Boolean(id)),
    nextPageToken: data?.nextPageToken ?? null,
  };
}

/** YouTube's most-popular chart for a region (and optional category, e.g. "10" = Music). */
export async function mostPopular(regionCode: string, key: string, categoryId?: string): Promise<DataApiVideo[]> {
  const params: Record<string, string> = {
    part: "snippet,contentDetails,statistics",
    chart: "mostPopular",
    regionCode,
    maxResults: "50",
  };
  if (categoryId) params.videoCategoryId = categoryId;
  const data = await get<{ items?: VideoResource[] }>("videos", params, key);
  return (data?.items ?? []).map(toVideo).filter((v): v is DataApiVideo => v !== null);
}
