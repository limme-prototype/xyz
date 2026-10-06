import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertNoBlockedUrls, findBlockedUrls, isBlockedHost } from "../lib/media-guard";
import {
  KNOWN_INSTANCES,
  filterDirectory,
  isUsableManifest,
  manifestUrl,
  resetInstanceCache,
} from "../lib/providers/instances";
import { normalizeComment, proxiedAvatarUrl } from "../lib/providers/invidious";

const PROXIED_MPD = `<?xml version="1.0"?><MPD><Period><AdaptationSet mimeType="audio/mp4"><Representation>
<BaseURL>/companion/videoplayback?expire=1&amp;ip=1.2.3.4&amp;itag=140</BaseURL></Representation></AdaptationSet></Period></MPD>`;
const DIRECT_MPD = `<MPD><BaseURL>https://rr1---sn-abc.googlevideo.com/videoplayback?itag=140</BaseURL></MPD>`;

describe("media guard", () => {
  it.each([
    "www.youtube.com",
    "youtube-nocookie.com",
    "i.ytimg.com",
    "rr3---sn-a5mekn6d.googlevideo.com",
    "yt3.ggpht.com",
    "lh3.googleusercontent.com",
    "youtu.be",
  ])("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each(["invidious.f5.si", "jp1-cmp.invidious.f5.si", "notyoutube.com.example.org", "xyz.vercel.app"])(
    "allows %s",
    (host) => {
      expect(isBlockedHost(host)).toBe(false);
    }
  );

  it("finds blocked URLs deep inside payloads and ignores relative ones", () => {
    const payload = {
      ok: "/api/xyz/thumb/dQw4w9WgXcQ",
      nested: [{ avatar: "https://yt3.ggpht.com/abc=s88" }],
      text: "see https://invidious.f5.si/watch?v=x",
    };
    expect(findBlockedUrls(payload)).toEqual(["https://yt3.ggpht.com/abc=s88"]);
    expect(() => assertNoBlockedUrls(payload)).toThrow(/yt3\.ggpht\.com/);
    expect(assertNoBlockedUrls({ a: "/relative" })).toEqual({ a: "/relative" });
  });
});

describe("instance registry", () => {
  it("builds proxied DASH manifest URLs", () => {
    expect(manifestUrl("https://invidious.f5.si", "jNQXAC9IVRw")).toBe(
      "https://invidious.f5.si/api/manifest/dash/id/jNQXAC9IVRw?local=true"
    );
  });

  it("keeps only https instances that advertise API and CORS", () => {
    const directory = [
      ["a.example", { type: "https", uri: "https://a.example", api: true, cors: true }],
      ["b.example", { type: "https", uri: "https://b.example", api: false, cors: false }],
      ["c.onion", { type: "onion", uri: "http://c.onion", api: true, cors: true }],
      ["d.example", { type: "https", uri: "https://d.example/", api: true, cors: null }],
      ["bad", { type: "https", uri: "not a url", api: true, cors: true }],
    ];
    expect(filterDirectory(directory)).toEqual(["https://a.example"]);
    expect(filterDirectory({ not: "an array" })).toEqual([]);
  });

  it("accepts only CORS-enabled manifests whose segments stay on the instance", () => {
    expect(isUsableManifest(PROXIED_MPD, "*")).toBe(true);
    expect(isUsableManifest(PROXIED_MPD, null)).toBe(false);
    expect(isUsableManifest(DIRECT_MPD, "*")).toBe(false);
    expect(isUsableManifest("<html>Making sure you're not a bot!</html>", "*")).toBe(false);
  });
});

describe("comments normalisation", () => {
  it("returns plain text and proxies avatars through our origin", () => {
    const item = normalizeComment({
      commentId: "c1",
      author: "@SanDiegoZoo",
      authorThumbnail: "https://yt3.ggpht.com/i8Rq=s88-c-k-c0x00ffffff-no-rj",
      content: "We're so honored <script>alert(1)</script>",
      likeCount: 4800000,
      isPinned: true,
      creatorHeart: { creatorName: "@jawed" },
      replies: { replyCount: 985, continuation: "Eg0SC2" },
    });
    expect(item).toMatchObject({
      id: "c1",
      avatarUrl: "/api/xyz?avatar=i8Rq%3Ds88-c-k-c0x00ffffff-no-rj",
      isPinned: true,
      hearted: true,
      replyCount: 985,
      repliesContinuation: "Eg0SC2",
    });
    expect(findBlockedUrls(item)).toEqual([]);
  });

  it("drops avatars from unexpected hosts", () => {
    expect(proxiedAvatarUrl("https://evil.example/a.png")).toBe("");
    expect(proxiedAvatarUrl(undefined)).toBe("");
  });
});

describe("GET /api/xyz/stream", () => {
  beforeEach(() => resetInstanceCache());
  afterEach(() => vi.unstubAllGlobals());

  it("returns proxied manifests from healthy instances only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://api.invidious.io/")) {
          return Response.json([
            ["good.example", { type: "https", uri: "https://good.example", api: true, cors: true }],
            ["direct.example", { type: "https", uri: "https://direct.example", api: true, cors: true }],
          ]);
        }
        // Instances redirect manifest requests to their companion host.
        if (init?.method === "HEAD") {
          const companion = url.replace("https://", "https://cmp.");
          return new Response(null, { status: 302, headers: { location: companion } });
        }
        const body = url.includes("direct.example") ? DIRECT_MPD : PROXIED_MPD;
        return new Response(body, { headers: { "access-control-allow-origin": "*" } });
      })
    );

    const { GET } = await import("../app/api/xyz/stream/route");
    const res = await GET(new Request("http://localhost/api/xyz/stream?id=jNQXAC9IVRw"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sources).toEqual([
      ...KNOWN_INSTANCES.map((instance) => ({
        instance,
        manifestUrl: manifestUrl(instance, "jNQXAC9IVRw").replace("https://", "https://cmp."),
      })),
      {
        instance: "https://good.example",
        manifestUrl: "https://cmp.good.example/api/manifest/dash/id/jNQXAC9IVRw?local=true",
      },
    ]);
    expect(findBlockedUrls(data)).toEqual([]);
  });

  it("reports unplayable when the instance cannot extract the video", async () => {
    // Redirect works, but the companion answers 500 (no CORS) — as public companions often do.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) =>
        init?.method === "HEAD"
          ? new Response(null, { status: 302, headers: { location: "https://cmp.example/m.mpd" } })
          : new Response("Internal Server Error", { status: 500 })
      )
    );
    const { GET } = await import("../app/api/xyz/stream/route");
    const res = await GET(new Request("http://localhost/api/xyz/stream?id=dQw4w9WgXcQ"));
    expect(await res.json()).toEqual({ id: "dQw4w9WgXcQ", playable: false, sources: [] });
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it("rejects invalid video IDs", async () => {
    const { GET } = await import("../app/api/xyz/stream/route");
    const res = await GET(new Request("http://localhost/api/xyz/stream?id=../../etc"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/xyz search with a personal API key", () => {
  const KEY = "AIza" + "a".repeat(35);
  beforeEach(() => resetInstanceCache());
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(calls: string[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("googleapis.com/youtube/v3/search")) {
          return Response.json({ items: [{ id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "From YouTube" } }] });
        }
        if (url.includes("googleapis.com/youtube/v3/videos")) return Response.json({ items: [] });
        if (url.includes("/api/v1/search")) {
          return Response.json([{ type: "video", videoId: "jNQXAC9IVRw", title: "From Invidious" }]);
        }
        return new Response("", { status: 503 });
      })
    );
  }

  it("uses the header key and asks YouTube first, without CDN caching", async () => {
    const calls: string[] = [];
    stubFetch(calls);
    const { GET } = await import("../app/api/xyz/route");
    const req = new Request("http://localhost/api/xyz?q=rick", { headers: { "x-youtube-api-key": KEY } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.results[0].title).toBe("From YouTube");
    expect(calls.some((c) => c.includes("/api/v1/search"))).toBe(false);
    expect(calls.find((c) => c.includes("googleapis"))).toContain(`key=${KEY}`);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("ignores malformed keys and keeps Invidious first", async () => {
    const calls: string[] = [];
    stubFetch(calls);
    vi.stubEnv("XYZ_API_KEY", "");
    const { GET } = await import("../app/api/xyz/route");
    const req = new Request("http://localhost/api/xyz?q=rick", { headers: { "x-youtube-api-key": "not-a-key" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req as any);
    const data = await res.json();

    expect(data.results[0].title).toBe("From Invidious");
    expect(calls.some((c) => c.includes("googleapis"))).toBe(false);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    vi.unstubAllEnvs();
  });
});

describe("GET /api/xyz/manifest/:id", () => {
  beforeEach(() => resetInstanceCache());
  afterEach(() => vi.unstubAllGlobals());

  function stubCompanion(calls: { url: string; method: string }[], failIds: string[] = []) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url.startsWith("https://api.invidious.io/")) return Response.json([]);
        if (method === "HEAD") {
          return new Response(null, { status: 302, headers: { location: url.replace("https://invidious.f5.si/api", "https://cmp.f5.example/companion/api") } });
        }
        if (failIds.some((id) => url.includes(id))) return new Response("Internal Server Error", { status: 500 });
        return new Response(PROXIED_MPD, { headers: { "access-control-allow-origin": "*" } });
      })
    );
  }

  it("serves the validated manifest with absolute segment URLs on the companion host", async () => {
    const calls: { url: string; method: string }[] = [];
    stubCompanion(calls);
    const { GET } = await import("../app/api/xyz/manifest/[id]/route");
    const res = await GET(new Request("http://localhost/api/xyz/manifest/dQw4w9WgXcQ"), { params: Promise.resolve({ id: "dQw4w9WgXcQ" }) });
    const xml = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/dash+xml");
    expect(res.headers.get("cache-control")).toContain("s-maxage=1800");
    expect(xml).toContain("<BaseURL>https://cmp.f5.example/companion/videoplayback?expire=1&amp;ip=1.2.3.4&amp;itag=140</BaseURL>");
    expect(findBlockedUrls(xml)).toEqual([]);
  });

  it("reuses the learned companion host instead of re-resolving the redirect", async () => {
    const calls: { url: string; method: string }[] = [];
    stubCompanion(calls);
    const { GET } = await import("../app/api/xyz/manifest/[id]/route");
    await GET(new Request("http://localhost/api/xyz/manifest/dQw4w9WgXcQ"), { params: Promise.resolve({ id: "dQw4w9WgXcQ" }) });
    const before = calls.length;
    await GET(new Request("http://localhost/api/xyz/manifest/G9rJC-cD_hk"), { params: Promise.resolve({ id: "G9rJC-cD_hk" }) });
    const second = calls.slice(before);

    expect(second.filter((c) => c.method === "HEAD")).toEqual([]);
    expect(second.map((c) => c.url)).toEqual(["https://cmp.f5.example/companion/api/manifest/dash/id/G9rJC-cD_hk?local=true"]);
  });

  it("serves an uncached copy on /fresh for player retries", async () => {
    stubCompanion([]);
    const { GET } = await import("../app/api/xyz/manifest/[id]/fresh/route");
    const res = await GET(new Request("http://localhost/api/xyz/manifest/dQw4w9WgXcQ/fresh"), {
      params: Promise.resolve({ id: "dQw4w9WgXcQ" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 404 when no instance can play the video", async () => {
    stubCompanion([], ["kJQP7kiw5Fk"]);
    const { GET } = await import("../app/api/xyz/manifest/[id]/route");
    const res = await GET(new Request("http://localhost/api/xyz/manifest/kJQP7kiw5Fk"), { params: Promise.resolve({ id: "kJQP7kiw5Fk" }) });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=60");
  });
});

describe("CDN cache keys (Netlify ignores query strings)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never lets the CDN share a response that depends on the query string", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const { GET } = await import("../app/api/xyz/route");
    for (const qs of ["q=lofi", "id=G9rJC-cD_hk", "suggest=lo", "feed=trending", "related=G9rJC-cD_hk", "thumb=G9rJC-cD_hk"]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await GET(new Request(`http://localhost/api/xyz?${qs}`) as any);
      expect(res.headers.get("cache-control"), qs).not.toMatch(/s-maxage|public/);
    }
  });

  it("serves thumbnails by path so the CDN can cache each one separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })));
    const { GET } = await import("../app/api/xyz/thumb/[id]/route");
    const res = await GET(new Request("http://localhost/api/xyz/thumb/G9rJC-cD_hk"), { params: Promise.resolve({ id: "G9rJC-cD_hk" }) });
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("s-maxage=604800");
  });
});
