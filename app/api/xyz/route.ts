import { NextRequest, NextResponse } from "next/server";
import { XYZ_CATALOG_VIDEOS, parseXyzUrl } from "@/lib/xyz";

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
}

const SEARCH_PROVIDERS = [
  "https://invidious.f5.si/api/v1/search",
  "https://inv.nadeko.net/api/v1/search",
  "https://invidious.nerdvpn.de/api/v1/search",
];

const SERVER_FETCH_HEADERS = {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

const DEPLOYMENT_RESPONSE_HEADERS = {
  "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const suggest = searchParams.get("suggest")?.trim();
  const query = searchParams.get("q")?.trim();
  const rawIdOrUrl = searchParams.get("id") ?? searchParams.get("url");

  // 1. Live Autocomplete Suggestions (using standard chrome provider without yt client params)
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
      const fallback = XYZ_CATALOG_VIDEOS.filter((v) =>
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

  // 2. Real-time Search query (Full live search list across all videos)
  if (query) {
    const apiKey =
      searchParams.get("key")?.trim() ||
      process.env.XYZ_API_KEY;

    // A. If custom API key is provided, query official API
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
            thumbnailUrl:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.medium?.url ||
              `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
            description: item.snippet.description,
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

    // B. Live Universal Search via fast providers (no API key required)
    for (const providerUrl of SEARCH_PROVIDERS) {
      try {
        const res = await fetch(`${providerUrl}?q=${encodeURIComponent(query)}`, {
          headers: SERVER_FETCH_HEADERS,
          signal: AbortSignal.timeout(4500),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const rawItems = data as ProviderItem[];
            const videos = rawItems
              .filter((item): item is ProviderItem & { videoId: string; title: string } => item.type === "video" && Boolean(item.videoId))
              .slice(0, 20)
              .map((item) => {
                const totalSec = typeof item.lengthSeconds === "number" ? item.lengthSeconds : 0;
                const minutes = Math.floor(totalSec / 60);
                const seconds = String(totalSec % 60).padStart(2, "0");
                const duration = totalSec > 0 ? `${minutes}:${seconds}` : "Video";

                return {
                  id: item.videoId,
                  title: item.title,
                  channel: item.author || "Creator",
                  channelUrl: item.authorUrl ? `https://www.youtube.com${item.authorUrl}` : "",
                  views: item.viewCountText || (item.viewCount ? `${item.viewCount} views` : "Popular"),
                  uploadedAt: item.publishedText || "Recent",
                  duration,
                  category: "General",
                  thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
                  description: item.description || `${item.title} by ${item.author || "Creator"}`,
                };
              });

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

    // C. Fallback: Search local catalog
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

  // 3. Single Video Metadata Resolution
  if (!rawIdOrUrl) {
    return NextResponse.json(
      { error: "Missing 'id', 'url', 'q', or 'suggest' parameter" },
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
        thumbnailUrl:
          data.thumbnail_url ??
          known?.thumbnailUrl ??
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
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
