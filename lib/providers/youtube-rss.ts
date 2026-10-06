import { SERVER_USER_AGENT } from "./instances";

/**
 * YouTube channel Atom feeds: free, keyless, no quota. Each feed has the channel's 15 newest
 * uploads with title, publish date and view count. Fetched server-side only.
 */
export interface RssVideo {
  id: string;
  channelId: string;
  author: string;
  title: string;
  published: string;
  views: number | null;
  description: string;
  isShort: boolean;
}

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function tag(entry: string, name: string): string {
  const match = entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

export function parseChannelFeed(xml: string): RssVideo[] {
  const videos: RssVideo[] = [];
  for (const [entry] of xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
    const id = tag(entry, "yt:videoId");
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    const views = entry.match(/<media:statistics\s+views="(\d+)"/)?.[1];
    videos.push({
      id,
      channelId: tag(entry, "yt:channelId"),
      author: tag(entry, "name"),
      title: tag(entry, "title"),
      published: tag(entry, "published"),
      views: views ? Number(views) : null,
      description: tag(entry, "media:description"),
      // Shorts link to /shorts/ instead of /watch in the feed.
      isShort: /<link[^>]+href="https:\/\/www\.youtube\.com\/shorts\//.test(entry),
    });
  }
  return videos;
}

export async function fetchChannelFeed(channelId: string): Promise<RssVideo[]> {
  if (!CHANNEL_ID.test(channelId)) return [];
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      headers: { "User-Agent": SERVER_USER_AGENT, Accept: "application/atom+xml" },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? parseChannelFeed(await res.text()) : [];
  } catch {
    return [];
  }
}
