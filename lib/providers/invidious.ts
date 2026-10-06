import type { XyzVideo } from "@/lib/xyz";
import { formatDuration } from "./format";
import { getHealthyInstances, SERVER_USER_AGENT } from "./instances";

/** A video item as returned by Invidious search, trending, channel and playlist endpoints. */
export interface InvidiousVideoItem {
  liveNow?: boolean;
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  viewCountText?: string;
  viewCount?: number;
  publishedText?: string;
  lengthSeconds?: number;
  description?: string;
}

export function normalizeInvidiousVideo(item: InvidiousVideoItem): XyzVideo {
  return {
    id: item.videoId || "",
    title: item.title || "",
    channel: item.author || "Creator",
    // No youtube.com links: users of this app may be on networks where YouTube is blocked.
    channelUrl: "",
    views: item.liveNow ? "Live" : item.viewCountText || (item.viewCount ? `${item.viewCount} views` : ""),
    uploadedAt: item.liveNow ? "" : item.publishedText || "",
    duration: formatDuration(item.lengthSeconds),
    category: "General",
    thumbnailUrl: item.videoId ? `/api/xyz/thumb/${item.videoId}` : "",
    description: item.description || "",
  };
}

/** GETs a JSON API path from the first healthy instance that answers with usable data. */
export async function fetchInvidiousJson<T>(
  path: string,
  { timeoutMs = 4500, accept }: { timeoutMs?: number; accept?: (data: unknown) => boolean } = {}
): Promise<{ data: T; instance: string } | null> {
  // Ask for English text: instances otherwise localise dates and view counts to their own region.
  const localized = `${path}${path.includes("?") ? "&" : "?"}hl=en`;
  for (const instance of await getHealthyInstances()) {
    try {
      const res = await fetch(`${instance}${localized}`, {
        headers: { Accept: "application/json", "User-Agent": SERVER_USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      // Some instances answer 200 with an empty body or a bot-check HTML page.
      const text = await res.text();
      if (!text) continue;
      const data = JSON.parse(text) as unknown;
      if (accept && !accept(data)) continue;
      return { data: data as T, instance };
    } catch {
      // try next instance
    }
  }
  return null;
}

export interface InvidiousComment {
  commentId?: string;
  author?: string;
  authorThumbnails?: { url?: string }[];
  authorThumbnail?: string;
  authorIsChannelOwner?: boolean;
  verified?: boolean;
  content?: string;
  published?: number;
  publishedText?: string;
  likeCount?: number;
  isPinned?: boolean;
  isEdited?: boolean;
  creatorHeart?: unknown;
  replies?: { replyCount?: number; continuation?: string };
}

export interface CommentItem {
  id: string;
  author: string;
  avatarUrl: string;
  isOwner: boolean;
  isPinned: boolean;
  isEdited: boolean;
  hearted: boolean;
  text: string;
  publishedText: string;
  likeCount: number;
  replyCount: number;
  repliesContinuation: string | null;
}

/** Routes YouTube avatar images (yt3.ggpht.com) through our thumbnail proxy. */
export function proxiedAvatarUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url, "https://yt3.ggpht.com");
    if (!/(^|\.)ggpht\.com$|(^|\.)googleusercontent\.com$/.test(parsed.hostname)) return "";
    return `/api/xyz?avatar=${encodeURIComponent(parsed.pathname.replace(/^\//, ""))}`;
  } catch {
    return "";
  }
}

export function normalizeComment(c: InvidiousComment): CommentItem {
  const avatar = c.authorThumbnail ?? c.authorThumbnails?.[c.authorThumbnails.length - 1]?.url;
  return {
    id: c.commentId ?? "",
    author: c.author ?? "",
    avatarUrl: proxiedAvatarUrl(avatar),
    isOwner: Boolean(c.authorIsChannelOwner),
    isPinned: Boolean(c.isPinned),
    isEdited: Boolean(c.isEdited),
    hearted: Boolean(c.creatorHeart),
    // Plain text only: rendering instance-provided HTML would be an XSS vector.
    text: c.content ?? "",
    publishedText: c.publishedText ?? "",
    likeCount: typeof c.likeCount === "number" ? c.likeCount : 0,
    replyCount: c.replies?.replyCount ?? 0,
    repliesContinuation: c.replies?.continuation ?? null,
  };
}
