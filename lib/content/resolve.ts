import { XYZ_CATALOG_VIDEOS, type XyzVideo } from "@/lib/xyz";
import { stripBlockedUrls } from "@/lib/media-guard";
import { formatDuration, formatViews, timeAgo } from "@/lib/providers/format";
import { fetchInvidiousJson, normalizeInvidiousVideo, type InvidiousVideoItem } from "@/lib/providers/invidious";
import { fetchChannelFeed, type RssVideo } from "@/lib/providers/youtube-rss";
import {
  QuotaExceededError,
  channelUploads,
  mostPopular,
  videosById,
  type DataApiVideo,
} from "@/lib/providers/youtube-data";
import type { Section, SectionSource } from "./sections";

export type SectionOrigin = "seed" | "rss" | "youtube" | "invidious";

export interface SectionResult {
  id: string;
  label: string;
  items: XyzVideo[];
  origin: SectionOrigin;
  nextPageToken: string | null;
}

interface Options {
  apiKey?: string;
  pageToken?: string;
  now?: number;
}

/** Shorter than this is treated as a Short and left out of lists. */
const SHORT_MAX_SECONDS = 60;
const DESCRIPTION_MAX = 300;

function baseVideo(id: string): Pick<XyzVideo, "id" | "thumbnailUrl" | "channelUrl" | "category"> {
  return { id, thumbnailUrl: `/api/xyz/thumb/${id}`, channelUrl: "", category: "Music" };
}

function cleanDescription(text: string): string {
  return stripBlockedUrls(text).replace(/\s+\n/g, "\n").trim().slice(0, DESCRIPTION_MAX);
}

function fromRss(v: RssVideo, now: number, details?: DataApiVideo): XyzVideo {
  return {
    ...baseVideo(v.id),
    title: v.title,
    channel: v.author,
    views: formatViews(details?.views ?? v.views),
    uploadedAt: timeAgo(v.published, now),
    duration: details ? formatDuration(details.durationSeconds ?? undefined) : "Video",
    description: cleanDescription(v.description),
  };
}

function fromDataApi(v: DataApiVideo, now: number): XyzVideo {
  return {
    ...baseVideo(v.id),
    title: v.title,
    channel: v.author,
    views: v.liveNow ? "Live" : formatViews(v.views),
    uploadedAt: v.liveNow ? "" : timeAgo(v.published, now),
    duration: v.liveNow ? "LIVE" : formatDuration(v.durationSeconds ?? undefined),
    description: cleanDescription(v.description),
  };
}

function isShortVideo(v: DataApiVideo): boolean {
  return !v.liveNow && v.durationSeconds !== null && v.durationSeconds > 0 && v.durationSeconds < SHORT_MAX_SECONDS;
}

async function fromChannels(channelIds: string[], { apiKey, now = Date.now() }: Options) {
  const feeds = await Promise.all(channelIds.map(fetchChannelFeed));
  const seen = new Set<string>();
  const entries = feeds
    .flat()
    .filter((v) => !v.isShort && !seen.has(v.id) && seen.add(v.id))
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));

  // With a key, one videos.list call per 50 ids adds durations and drops Shorts the feed didn't flag.
  let details = new Map<string, DataApiVideo>();
  if (apiKey && entries.length > 0) {
    try {
      details = new Map((await videosById(entries.map((e) => e.id), apiKey)).map((d) => [d.id, d]));
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) throw err;
    }
  }
  const items = entries
    .filter((e) => {
      const d = details.get(e.id);
      return !d || !isShortVideo(d);
    })
    .map((e) => fromRss(e, now, details.get(e.id)));
  return { items, origin: "rss" as const, nextPageToken: null };
}

async function fromUploads(channelId: string, { apiKey, pageToken, now = Date.now() }: Options) {
  if (!apiKey) return null;
  try {
    const page = await channelUploads(channelId, apiKey, pageToken);
    if (page.ids.length === 0) return null;
    const videos = await videosById(page.ids, apiKey);
    return {
      items: videos.filter((v) => !isShortVideo(v)).map((v) => fromDataApi(v, now)),
      origin: "youtube" as const,
      nextPageToken: page.nextPageToken,
    };
  } catch (err) {
    if (err instanceof QuotaExceededError) return null;
    throw err;
  }
}

async function fromChart(regionCode: string, categoryId: string | undefined, { apiKey, now = Date.now() }: Options) {
  if (!apiKey) return null;
  try {
    const videos = await mostPopular(regionCode, apiKey, categoryId);
    return {
      items: videos.filter((v) => !isShortVideo(v)).map((v) => fromDataApi(v, now)),
      origin: "youtube" as const,
      nextPageToken: null,
    };
  } catch (err) {
    if (err instanceof QuotaExceededError) return null;
    throw err;
  }
}

async function fromSearch(query: string) {
  const result = await fetchInvidiousJson<InvidiousVideoItem[]>(`/api/v1/search?q=${encodeURIComponent(query)}`, {
    accept: (d) => Array.isArray(d) && d.length > 0,
  });
  const items = (result?.data ?? [])
    .filter((i) => i.type === "video" && Boolean(i.videoId))
    .slice(0, 30)
    .map((i) => ({ ...normalizeInvidiousVideo(i), description: cleanDescription(i.description ?? "") }));
  return { items, origin: "invidious" as const, nextPageToken: null };
}

async function fromSource(source: SectionSource, options: Options) {
  switch (source.kind) {
    case "seed":
      return { items: XYZ_CATALOG_VIDEOS, origin: "seed" as const, nextPageToken: null };
    case "channels":
      return fromChannels(source.channelIds, options);
    case "uploads":
      return fromUploads(source.channelId, options);
    case "chart":
      return fromChart(source.regionCode, source.categoryId, options);
    case "search":
      return fromSearch(source.query);
  }
}

/**
 * Builds a section's list: its primary source, then its fallback, then the bundled seed so the
 * UI is never empty. Paging (pageToken) only applies to the primary source.
 */
export async function resolveSection(section: Section, options: Options = {}): Promise<SectionResult> {
  const attempts: SectionSource[] = [section.source];
  if (section.fallback && !options.pageToken) attempts.push(section.fallback);

  for (const source of attempts) {
    try {
      const result = await fromSource(source, source === section.source ? options : { ...options, pageToken: undefined });
      if (result && result.items.length > 0) {
        return { id: section.id, label: section.label, ...result };
      }
    } catch {
      // try the next source
    }
  }
  return {
    id: section.id,
    label: section.label,
    items: options.pageToken ? [] : XYZ_CATALOG_VIDEOS,
    origin: "seed",
    nextPageToken: null,
  };
}
