import { describe, expect, it } from "vitest";
import {
  XYZ_CATALOG_VIDEOS,
  DEFAULT_VIDEO_ID,
  getXyzEmbedUrl,
  parseXyzUrl,
  parseHlsUrl,
} from "../lib/xyz";

const id = "dQw4w9WgXcQ";

describe("parseXyzUrl", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${id}`, id],
    [`https://youtu.be/${id}?si=abc`, id],
    [`https://www.youtube.com/shorts/${id}`, id],
    [`https://www.youtube.com/live/${id}?feature=share`, id],
    [`https://www.youtube.com/embed/${id}`, id],
    [`youtube.com/watch?v=${id}&t=4s`, id],
    [id, id], // Direct 11-character video ID
  ])("extracts an ID from %s", (url, expected) => {
    expect(parseXyzUrl(url)).toEqual({ ok: true, videoId: expected });
  });

  it.each([
    "",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com",
    "javascript:alert(1)",
  ])("rejects %s", (url) => {
    expect(parseXyzUrl(url).ok).toBe(false);
  });
});

describe("getXyzEmbedUrl", () => {
  it("builds a privacy-enhanced embed URL without autoplay", () => {
    const url = getXyzEmbedUrl(id);
    expect(url).toContain(`youtube-nocookie.com/embed/${id}`);
    expect(url).toContain("autoplay=0");
  });

  it("builds an embed URL with autoplay enabled", () => {
    const url = getXyzEmbedUrl(id, true);
    expect(url).toContain(`youtube-nocookie.com/embed/${id}`);
    expect(url).toContain("autoplay=1");
  });
});

describe("XYZ_CATALOG_VIDEOS and DEFAULT_VIDEO_ID", () => {
  it("includes DEFAULT_VIDEO_ID in catalog", () => {
    const found = XYZ_CATALOG_VIDEOS.find((v) => v.id === DEFAULT_VIDEO_ID);
    expect(found).toBeDefined();
    expect(found?.category).toBe("Music");
  });

  it("does not ship placeholder videos in the default list", () => {
    const ids = XYZ_CATALOG_VIDEOS.map((v) => v.id);
    expect(ids).not.toContain("dQw4w9WgXcQ");
    expect(ids).not.toContain("6bapv24Zz1E");
    expect(ids).not.toContain("jfKfPfyJRdk");
  });

  it("only ships regular videos (live streams can't play in the built-in player)", () => {
    for (const v of XYZ_CATALOG_VIDEOS) expect(v.duration).not.toBe("LIVE");
  });

  it("has valid video IDs in all catalog items", () => {
    XYZ_CATALOG_VIDEOS.forEach((v) => {
      expect(v.id).toHaveLength(11);
      expect(v.thumbnailUrl).toContain(v.id);
    });
  });
});

describe("headless embed + HLS", () => {
  it("disables native YouTube chrome so custom controls are the only UI", () => {
    const url = getXyzEmbedUrl(id);
    expect(url).toContain("controls=0");
    expect(url).toContain("disablekb=1");
    expect(url).toContain("enablejsapi=1");
  });

  it.each([
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "http://cdn.example.com/live/index.M3U8?token=abc",
  ])("accepts HLS manifest %s", (url) => {
    expect(parseHlsUrl(url)).not.toBeNull();
  });

  it.each([
    "https://example.com/video.mp4",
    "javascript:alert(1).m3u8",
    "not a url",
    "dQw4w9WgXcQ",
  ])("rejects non-HLS input %s", (url) => {
    expect(parseHlsUrl(url)).toBeNull();
  });
});
