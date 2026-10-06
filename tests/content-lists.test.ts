import { afterEach, describe, expect, it, vi } from "vitest";
import { findBlockedUrls, stripBlockedUrls } from "../lib/media-guard";
import { formatDuration, formatViews, isoDurationSeconds, timeAgo } from "../lib/providers/format";
import { parseChannelFeed } from "../lib/providers/youtube-rss";
import { resolveSection } from "../lib/content/resolve";
import { SECTIONS, findSection, type Section } from "../lib/content/sections";
import { XYZ_CATALOG_VIDEOS } from "../lib/xyz";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const KEY = "AIza" + "k".repeat(35);
const CH_A = "UCaaaaaaaaaaaaaaaaaaaaaa";
const CH_B = "UCbbbbbbbbbbbbbbbbbbbbbb";

function entry(id: string, published: string, opts: { short?: boolean; views?: number; channel?: string; description?: string } = {}) {
  const path = opts.short ? `shorts/${id}` : `watch?v=${id}`;
  return `<entry>
  <id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><yt:channelId>${opts.channel ?? CH_A}</yt:channelId>
  <title>Song ${id} &amp; friends</title>
  <link rel="alternate" href="https://www.youtube.com/${path}"/>
  <author><name>Artist</name><uri>https://www.youtube.com/channel/${opts.channel ?? CH_A}</uri></author>
  <published>${published}</published>
  <media:group>
    <media:title>Song ${id}</media:title>
    <media:thumbnail url="https://i2.ytimg.com/vi/${id}/hqdefault.jpg" width="480" height="360"/>
    <media:description>${opts.description ?? "Listen now"}</media:description>
    <media:community><media:statistics views="${opts.views ?? 1200}"/></media:community>
  </media:group>
</entry>`;
}

function feed(...entries: string[]) {
  return `<?xml version="1.0"?><feed xmlns:yt="x" xmlns:media="y">${entries.join("")}</feed>`;
}

afterEach(() => vi.unstubAllGlobals());

describe("format helpers", () => {
  it("formats durations including hours", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3 * 3600 + 7)).toBe("3:00:07");
    expect(formatDuration(0)).toBe("Video");
  });

  it("parses ISO-8601 durations", () => {
    expect(isoDurationSeconds("PT4M13S")).toBe(253);
    expect(isoDurationSeconds("PT1H")).toBe(3600);
    expect(isoDurationSeconds("P1DT1S")).toBe(86401);
    expect(isoDurationSeconds("nope")).toBeNull();
  });

  it("formats views and relative time", () => {
    expect(formatViews(4079642)).toBe("4.1M views");
    expect(formatViews(1)).toBe("1 view");
    expect(timeAgo("2026-10-05T11:00:00Z", NOW)).toBe("1 day ago");
    expect(timeAgo("2026-08-10T00:00:00Z", NOW)).toBe("1 month ago");
    expect(timeAgo("bad", NOW)).toBe("");
  });
});

describe("YouTube RSS parsing", () => {
  it("extracts ids, decoded titles, views and flags Shorts", () => {
    const videos = parseChannelFeed(
      feed(entry("aaaaaaaaaaa", "2026-10-05T11:00:13+00:00", { views: 2266 }), entry("bbbbbbbbbbb", "2026-10-01T00:00:00Z", { short: true }))
    );
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({ id: "aaaaaaaaaaa", title: "Song aaaaaaaaaaa & friends", views: 2266, isShort: false, author: "Artist" });
    expect(videos[1].isShort).toBe(true);
  });
});

describe("stripBlockedUrls", () => {
  it("removes YouTube links and keeps others", () => {
    expect(stripBlockedUrls("Watch https://youtu.be/x and https://example.com/a")).toBe("Watch  and https://example.com/a");
  });
});

describe("sections config", () => {
  it("has unique ids and starts with the curated seed", () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SECTIONS[0]).toMatchObject({ id: "all", source: { kind: "seed" } });
    expect(findSection("nope")).toBeUndefined();
  });
});

describe("resolveSection", () => {
  const channels: Section = { id: "t", label: "T", source: { kind: "channels", channelIds: [CH_A, CH_B] } };

  it("merges channel feeds newest-first, drops Shorts and duplicates, and never exposes YouTube URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes(CH_A)) {
          return new Response(
            feed(
              entry("aaaaaaaaaaa", "2026-10-01T00:00:00Z", { description: "Official https://www.youtube.com/@artist" }),
              entry("sssssssssss", "2026-10-05T00:00:00Z", { short: true })
            )
          );
        }
        if (url.includes(CH_B)) {
          return new Response(
            feed(entry("bbbbbbbbbbb", "2026-10-04T00:00:00Z", { channel: CH_B }), entry("aaaaaaaaaaa", "2026-10-01T00:00:00Z"))
          );
        }
        return new Response("", { status: 404 });
      })
    );

    const result = await resolveSection(channels, { now: NOW });
    expect(result.origin).toBe("rss");
    expect(result.items.map((v) => v.id)).toEqual(["bbbbbbbbbbb", "aaaaaaaaaaa"]);
    expect(result.items[0]).toMatchObject({ thumbnailUrl: "/api/xyz/thumb/bbbbbbbbbbb", uploadedAt: "2 days ago", views: "1.2K views" });
    expect(findBlockedUrls(result)).toEqual([]);
  });

  it("uses the Data API for uploads with a key: durations, Shorts filter and paging", async () => {
    const section: Section = { id: "u", label: "U", source: { kind: "uploads", channelId: CH_A } };
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/playlistItems")) {
          return Response.json({
            items: [{ contentDetails: { videoId: "aaaaaaaaaaa" } }, { contentDetails: { videoId: "sssssssssss" } }],
            nextPageToken: "NEXT_1",
          });
        }
        if (url.includes("/videos")) {
          return Response.json({
            items: [
              { id: "aaaaaaaaaaa", snippet: { title: "Long", publishedAt: "2026-10-05T12:00:00Z" }, contentDetails: { duration: "PT4M13S" }, statistics: { viewCount: "4079642" } },
              { id: "sssssssssss", snippet: { title: "Short", publishedAt: "2026-10-05T12:00:00Z" }, contentDetails: { duration: "PT30S" }, statistics: { viewCount: "10" } },
            ],
          });
        }
        return new Response("", { status: 404 });
      })
    );

    const result = await resolveSection(section, { apiKey: KEY, now: NOW });
    expect(result).toMatchObject({ origin: "youtube", nextPageToken: "NEXT_1" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "aaaaaaaaaaa", duration: "4:13", views: "4.1M views", uploadedAt: "1 day ago" });
    expect(calls[0]).toContain("playlistId=UUaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("falls back when the chart has no key or the quota is exhausted", async () => {
    const section: Section = {
      id: "c",
      label: "C",
      source: { kind: "chart", regionCode: "KH", categoryId: "10" },
      fallback: { kind: "channels", channelIds: [CH_A] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("googleapis")) return new Response('{"error":{"errors":[{"reason":"quotaExceeded"}]}}', { status: 403 });
        return new Response(feed(entry("aaaaaaaaaaa", "2026-10-01T00:00:00Z")));
      })
    );

    expect((await resolveSection(section, { now: NOW })).origin).toBe("rss");
    expect((await resolveSection(section, { apiKey: KEY, now: NOW })).origin).toBe("rss");
  });

  it("returns the bundled seed when every source fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const result = await resolveSection(channels, { now: NOW });
    expect(result.origin).toBe("seed");
    expect(result.items).toEqual(XYZ_CATALOG_VIDEOS);
  });
});
