import dns from "node:dns";
import { NextRequest, NextResponse } from "next/server";
import { XYZ_CATALOG_VIDEOS, XyzVideo, parseXyzUrl } from "@/lib/xyz";

try {
  dns.setDefaultResultOrder?.("ipv4first");
} catch {
  // ignore in runtimes without node:dns
}

interface ThumbnailItem {
  url?: string;
}

interface ProviderItem {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  authorUrl?: string;
  viewCountText?: string;
  viewCount?: number;
  publishedText?: string;
  lengthSeconds?: number;
  description?: string;
  videoThumbnails?: ThumbnailItem[];
}

const PROVIDER_BASES = [
  "https://invidious.f5.si",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
];

const SERVER_FETCH_HEADERS = {
  "Accept": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

const DEPLOYMENT_RESPONSE_HEADERS = {
  "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
  "X-Content-Type-Options": "nosniff",
};

function formatDuration(totalSec?: number): string {
  if (typeof totalSec !== "number" || totalSec <= 0) return "Video";
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function parseDurationIso(iso?: string): string {
  if (!iso) return "Video";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "Video";
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeProviderItem(item: ProviderItem): XyzVideo {
  const duration = formatDuration(item.lengthSeconds);
  const videoId = item.videoId || "";
  const thumb = videoId
    ? `/api/xyz?thumb=${videoId}`
    : (item.videoThumbnails?.[0]?.url || "");

  return {
    id: videoId,
    title: item.title || "",
    channel: item.author || "Creator",
    channelUrl: item.authorUrl ? `https://www.youtube.com${item.authorUrl}` : "",
    views: item.viewCountText || (item.viewCount ? `${item.viewCount} views` : ""),
    uploadedAt: item.publishedText || "",
    duration,
    category: "General",
    thumbnailUrl: thumb,
    description: item.description || "",
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const thumb = searchParams.get("thumb")?.trim();
  const suggest = searchParams.get("suggest")?.trim();
  const feed = searchParams.get("feed")?.trim();
  const related = searchParams.get("related")?.trim();
  const query = searchParams.get("q")?.trim();
  const rawIdOrUrl = searchParams.get("id") ?? searchParams.get("url");

  const apiKey = searchParams.get("key")?.trim() || process.env.XYZ_API_KEY;

  // 0. Server-Proxied Thumbnail with Deployment Headers & Aggressive Caching
  if (thumb) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(thumb)) {
      return new NextResponse("Invalid video ID", { status: 400 });
    }

    const candidateUrls = [
      `https://invidious.nerdvpn.de/vi/${thumb}/mqdefault.jpg`,
      `https://inv.nadeko.net/vi/${thumb}/mqdefault.jpg`,
      `https://i.ytimg.com/vi/${thumb}/mqdefault.jpg`,
      `https://img.youtube.com/vi/${thumb}/mqdefault.jpg`,
    ];

    for (const url of candidateUrls) {
      try {
        const imgRes = await fetch(url, {
          headers: {
            "User-Agent": SERVER_FETCH_HEADERS["User-Agent"],
            Accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(2500),
        });

        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const buffer = await imgRes.arrayBuffer();
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control":
                "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }
      } catch {
        // try next candidate
      }
    }

    // High quality SVG fallback placeholder if upstream CDN unreachable
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" fill="none"><rect width="320" height="180" fill="#18181b"/><path d="M140 70L190 90L140 110V70Z" fill="#71717a"/><text x="160" y="145" text-anchor="middle" fill="#71717a" font-family="system-ui, -apple-system, sans-serif" font-size="12">xyz</text></svg>`;

    return new NextResponse(fallbackSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // 1. Live Autocomplete Suggestions
  if (suggest) {
    try {
      const suggestUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(
        suggest
      )}`;
      const res = await fetch(suggestUrl, {
        headers: SERVER_FETCH_HEADERS,
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        const suggestions: string[] = Array.isArray(data?.[1])
          ? (data[1] as string[]).slice(0, 8)
          : [];

        return NextResponse.json(
          { suggestions },
          { headers: DEPLOYMENT_RESPONSE_HEADERS }
        );
      }
    } catch {
      const fallback = XYZ_CATALOG_VIDEOS.filter(
        (v) =>
          v.title.toLowerCase().includes(suggest.toLowerCase()) ||
          v.channel.toLowerCase().includes(suggest.toLowerCase())
      ).map((v) => v.title);
      return NextResponse.json(
        { suggestions: fallback.slice(0, 5) },
        { headers: DEPLOYMENT_RESPONSE_HEADERS }
      );
    }
    return NextResponse.json(
      { suggestions: [] },
      { headers: DEPLOYMENT_RESPONSE_HEADERS }
    );
  }

  // 2. Feed: Real-time Trending
  if (feed === "trending") {
    if (apiKey) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&chart=mostPopular&maxResults=20&key=${apiKey}`;
        const res = await fetch(url, {
          headers: SERVER_FETCH_HEADERS,
          signal: AbortSignal.timeout(4500),
        });
        if (res.ok) {
          const data = await res.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const videos: XyzVideo[] = (data.items || []).map((i: any) => ({
            id: i.id,
            title: i.snippet.title,
            channel: i.snippet.channelTitle,
            channelUrl: `https://www.youtube.com/channel/${i.snippet.channelId}`,
            views: i.statistics?.viewCount ? `${i.statistics.viewCount} views` : "Trending",
            uploadedAt: new Date(i.snippet.publishedAt).toLocaleDateString(),
            duration: parseDurationIso(i.contentDetails?.duration),
            category: "General",
            thumbnailUrl: `/api/xyz?thumb=${i.id}`,
            description: i.snippet.description || "",
          }));
          return NextResponse.json(
            { results: videos, live: true },
            { headers: DEPLOYMENT_RESPONSE_HEADERS }
          );
        }
      } catch {
        // fallback to providers below
      }
    }

    for (const base of PROVIDER_BASES) {
      try {
        const res = await fetch(`${base}/api/v1/trending?type=Music`, {
          headers: SERVER_FETCH_HEADERS,
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const rawItems = data as ProviderItem[];
            const videos = rawItems
              .filter((i) => Boolean(i.videoId))
              .slice(0, 20)
              .map(normalizeProviderItem);

            if (videos.length > 0) {
              return NextResponse.json(
                { results: videos, live: true },
                { headers: DEPLOYMENT_RESPONSE_HEADERS }
              );
            }
          }
        }
      } catch {
        // try next provider
      }
    }

    return NextResponse.json(
      { results: XYZ_CATALOG_VIDEOS, live: false },
      { headers: DEPLOYMENT_RESPONSE_HEADERS }
    );
  }

  // 3. Related / Up Next Recommendations for a Video
  if (related) {
    for (const base of PROVIDER_BASES) {
      try {
        const res = await fetch(`${base}/api/v1/videos/${encodeURIComponent(related)}`, {
          headers: SERVER_FETCH_HEADERS,
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          const recommended = data.recommendedVideos;
          if (Array.isArray(recommended) && recommended.length > 0) {
            const rawItems = recommended as ProviderItem[];
            const videos = rawItems
              .filter((i) => Boolean(i.videoId))
              .slice(0, 20)
              .map(normalizeProviderItem);

            if (videos.length > 0) {
              return NextResponse.json(
                { results: videos, live: true },
                { headers: DEPLOYMENT_RESPONSE_HEADERS }
              );
            }
          }
        }
      } catch {
        // try next provider
      }
    }

    const fallback = XYZ_CATALOG_VIDEOS.filter((v) => v.id !== related);
    return NextResponse.json(
      { results: fallback, live: false },
      { headers: DEPLOYMENT_RESPONSE_HEADERS }
    );
  }

  // 4. Universal Search
  if (query) {
    if (apiKey) {
      try {
        const searchEndpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&type=video&q=${encodeURIComponent(
          query
        )}&key=${apiKey}`;
        const apiRes = await fetch(searchEndpoint, {
          headers: SERVER_FETCH_HEADERS,
          signal: AbortSignal.timeout(5000),
        });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const liveVideos = (apiData.items || []).map((item: any) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            channelUrl: `https://www.youtube.com/channel/${item.snippet.channelId}`,
            views: "Live Result",
            uploadedAt: new Date(item.snippet.publishedAt).toLocaleDateString(),
            duration: "Video",
            category: "General",
            thumbnailUrl: `/api/xyz?thumb=${item.id.videoId}`,
            description: item.snippet.description || "",
          }));
          return NextResponse.json(
            { results: liveVideos, live: true },
            { headers: DEPLOYMENT_RESPONSE_HEADERS }
          );
        }
      } catch {
        // Fallback to providers below
      }
    }

    for (const base of PROVIDER_BASES) {
      try {
        const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(query)}`, {
          headers: SERVER_FETCH_HEADERS,
          signal: AbortSignal.timeout(4500),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const rawItems = data as ProviderItem[];
            const videos = rawItems
              .filter(
                (item): item is ProviderItem & { videoId: string; title: string } =>
                  item.type === "video" && Boolean(item.videoId)
              )
              .slice(0, 20)
              .map(normalizeProviderItem);

            if (videos.length > 0) {
              return NextResponse.json(
                { results: videos, live: true },
                { headers: DEPLOYMENT_RESPONSE_HEADERS }
              );
            }
          }
        }
      } catch {
        // Try next provider
      }
    }

    const qLower = query.toLowerCase();
    const results = XYZ_CATALOG_VIDEOS.filter(
      (video) =>
        video.title.toLowerCase().includes(qLower) ||
        video.channel.toLowerCase().includes(qLower) ||
        video.category.toLowerCase().includes(qLower) ||
        video.description.toLowerCase().includes(qLower)
    );

    return NextResponse.json(
      {
        results,
        live: false,
        hasApiKey: Boolean(apiKey),
      },
      { headers: DEPLOYMENT_RESPONSE_HEADERS }
    );
  }

  // 5. Single Video Metadata
  if (!rawIdOrUrl) {
    return NextResponse.json(
      { error: "Missing 'id', 'url', 'q', 'feed', or 'suggest' parameter" },
      { status: 400, headers: DEPLOYMENT_RESPONSE_HEADERS }
    );
  }

  const parseResult = parseXyzUrl(rawIdOrUrl);
  if (!parseResult.ok) {
    return NextResponse.json(
      { error: parseResult.error },
      { status: 400, headers: DEPLOYMENT_RESPONSE_HEADERS }
    );
  }

  const videoId = parseResult.videoId;
  const known = XYZ_CATALOG_VIDEOS.find((v) => v.id === videoId);

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const embedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
      {
        headers: SERVER_FETCH_HEADERS,
        signal: AbortSignal.timeout(4000),
      }
    );

    if (!embedRes.ok) {
      if (known) {
        return NextResponse.json(
          {
            id: known.id,
            title: known.title,
            authorName: known.channel,
            authorUrl: known.channelUrl,
            thumbnailUrl: known.thumbnailUrl,
            views: known.views,
            uploadedAt: known.uploadedAt,
            duration: known.duration,
            description: known.description,
          },
          { headers: DEPLOYMENT_RESPONSE_HEADERS }
        );
      }
      return NextResponse.json(
        { error: "Video not found" },
        { status: embedRes.status, headers: DEPLOYMENT_RESPONSE_HEADERS }
      );
    }

    const data = await embedRes.json();

    return NextResponse.json(
      {
        id: videoId,
        title: data.title ?? known?.title ?? "Video",
        authorName: data.author_name ?? known?.channel ?? "Creator",
        authorUrl: data.author_url ?? known?.channelUrl ?? "",
        thumbnailUrl: `/api/xyz?thumb=${videoId}`,
        views: known?.views ?? "Featured",
        uploadedAt: known?.uploadedAt ?? "",
        duration: known?.duration ?? "Video",
        description:
          known?.description ??
          `${data.title} by ${data.author_name}`,
      },
      { headers: DEPLOYMENT_RESPONSE_HEADERS }
    );
  } catch {
    if (known) {
      return NextResponse.json(
        {
          id: known.id,
          title: known.title,
          authorName: known.channel,
          authorUrl: known.channelUrl,
          thumbnailUrl: known.thumbnailUrl,
          views: known.views,
          uploadedAt: known.uploadedAt,
          duration: known.duration,
          description: known.description,
        },
        { headers: DEPLOYMENT_RESPONSE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: "Failed to load video" },
      { status: 502, headers: DEPLOYMENT_RESPONSE_HEADERS }
    );
  }
}
