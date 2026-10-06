import dns from "node:dns";
import { NextRequest, NextResponse } from "next/server";
import { XYZ_CATALOG_VIDEOS, XyzVideo, parseXyzUrl } from "@/lib/xyz";
import { fetchInvidiousJson, normalizeInvidiousVideo, type InvidiousVideoItem } from "@/lib/providers/invidious";
import { formatDuration, parseDurationIso } from "@/lib/providers/format";
import { fetchThumbnail } from "@/lib/providers/thumbnail";

try {
  dns.setDefaultResultOrder?.("ipv4first");
} catch {
  // ignore in runtimes without node:dns
}

type ProviderItem = InvidiousVideoItem;

interface GoogleSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    description?: string;
  };
}

interface GoogleVideoItem {
  id?: string;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

const SERVER_FETCH_HEADERS = {
  "Accept": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

const USER_API_KEY_HEADER = "x-youtube-api-key";
const YOUTUBE_API_KEY = /^AIza[0-9A-Za-z_-]{35}$/;

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, max-age=300",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Every response of this route depends on its query string, and some CDNs (Netlify) leave query
 * parameters out of the cache key, so a shared copy would be served for every query. Cache in the
 * browser only. Cacheable-by-CDN endpoints use path parameters instead (thumb, manifest, sections).
 */
const DEPLOYMENT_RESPONSE_HEADERS = {
  "Cache-Control": "private, max-age=300",
  "X-Content-Type-Options": "nosniff",
};

const normalizeProviderItem = normalizeInvidiousVideo;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const thumb = searchParams.get("thumb")?.trim();
  const suggest = searchParams.get("suggest")?.trim();
  const feed = searchParams.get("feed")?.trim();
  const related = searchParams.get("related")?.trim();
  const query = searchParams.get("q")?.trim();
  const rawIdOrUrl = searchParams.get("id") ?? searchParams.get("url");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const avatar = searchParams.get("avatar")?.trim();
  // A user's own key arrives in a header (never the query string, which leaks into logs and CDN caches).
  const headerKey = request.headers.get(USER_API_KEY_HEADER)?.trim() ?? "";
  const userApiKey = YOUTUBE_API_KEY.test(headerKey) ? headerKey : null;
  const apiKey = userApiKey ?? process.env.XYZ_API_KEY;
  // Responses fetched with a personal key are not shared through the CDN.
  const responseHeaders = userApiKey ? PRIVATE_RESPONSE_HEADERS : DEPLOYMENT_RESPONSE_HEADERS;

  // 0a. Comment author avatars (yt3.ggpht.com path only; host is fixed so this cannot be used as an open proxy)
  if (avatar !== undefined) {
    if (!/^[A-Za-z0-9_\-=.\/]{1,300}$/.test(avatar) || avatar.includes("..")) {
      return new NextResponse("Invalid avatar", { status: 400 });
    }
    try {
      const res = await fetch(`https://yt3.ggpht.com/${avatar}`, {
        headers: { "User-Agent": SERVER_FETCH_HEADERS["User-Agent"], Accept: "image/*" },
        signal: AbortSignal.timeout(2500),
      });
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.startsWith("image/")) {
        return new NextResponse(await res.arrayBuffer(), {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    } catch {
      // fall through to 404
    }
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
  }

  // 0b. Legacy `?thumb=` URLs (old clients). New URLs use /api/xyz/thumb/:id, which the CDN can cache.
  if (thumb) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(thumb)) {
      return new NextResponse("Invalid video ID", { status: 400 });
    }
    const image = await fetchThumbnail(thumb);
    return new NextResponse(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": image.found ? "private, max-age=86400" : "private, max-age=300",
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
          { headers: responseHeaders }
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
        { headers: responseHeaders }
      );
    }
    return NextResponse.json(
      { suggestions: [] },
      { headers: responseHeaders }
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
            thumbnailUrl: `/api/xyz/thumb/${i.id}`,
            description: i.snippet.description || "",
          }));
          return NextResponse.json(
            { results: videos, live: true },
            { headers: responseHeaders }
          );
        }
      } catch {
        // fallback to providers below
      }
    }

    const trendingType = page === 1 ? "Music" : page === 2 ? "Default" : "Gaming";
    const trending = await fetchInvidiousJson<ProviderItem[]>(`/api/v1/trending?type=${trendingType}`, {
      timeoutMs: 4000,
      accept: (d) => Array.isArray(d) && d.length > 0,
    });
    if (trending) {
      const videos = trending.data
        .filter((i) => Boolean(i.videoId))
        .slice(0, 20)
        .map(normalizeProviderItem);

      if (videos.length > 0) {
        return NextResponse.json(
          {
            results: videos,
            live: true,
            page,
            hasMore: page < 4,
          },
          { headers: responseHeaders }
        );
      }
    }

    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;
    const fallbackResults = XYZ_CATALOG_VIDEOS.slice(startIndex, startIndex + pageSize);

    return NextResponse.json(
      {
        results: fallbackResults,
        live: false,
        page,
        hasMore: startIndex + pageSize < XYZ_CATALOG_VIDEOS.length,
      },
      { headers: responseHeaders }
    );
  }

  // 3. Related / Up Next Recommendations for a Video
  if (related) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(related)) {
      return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
    }

    const details = await fetchInvidiousJson<{ recommendedVideos?: ProviderItem[] }>(
      `/api/v1/videos/${related}`,
      { timeoutMs: 4000, accept: (d) => Array.isArray((d as { recommendedVideos?: unknown })?.recommendedVideos) }
    );
    const videos = (details?.data.recommendedVideos ?? [])
      .filter((i) => Boolean(i.videoId))
      .slice(0, 20)
      .map(normalizeProviderItem);

    if (videos.length > 0) {
      return NextResponse.json(
        { results: videos, live: true },
        { headers: responseHeaders }
      );
    }

    const fallback = XYZ_CATALOG_VIDEOS.filter((v) => v.id !== related);
    return NextResponse.json(
      { results: fallback, live: false },
      { headers: responseHeaders }
    );
  }

  // 4. Universal Search. Without a personal key, Invidious goes first: YouTube Data API search.list
  // is capped at 100 calls/day per project on the shared server key. With the user's own key, YouTube goes first.
  if (query) {
    const invidiousSearch = async () => {
      const search = await fetchInvidiousJson<ProviderItem[]>(
        `/api/v1/search?q=${encodeURIComponent(query)}&page=${page}`,
        { accept: (d) => Array.isArray(d) && d.length > 0 }
      );
      const searchVideos = (search?.data ?? [])
        .filter((item) => item.type === "video" && Boolean(item.videoId))
        .slice(0, 20)
        .map(normalizeProviderItem);
      return searchVideos.length > 0
        ? NextResponse.json(
            { results: searchVideos, live: true, page, hasMore: searchVideos.length >= 10 },
            { headers: responseHeaders }
          )
        : null;
    };

    if (!userApiKey) {
      const fromInvidious = await invidiousSearch();
      if (fromInvidious) return fromInvidious;
    }

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
          const rawItems = (apiData.items || []) as GoogleSearchItem[];
          const items = rawItems.filter((item) => Boolean(item.id?.videoId));
          const videoIds = items
            .map((i) => i.id?.videoId)
            .filter((id): id is string => Boolean(id))
            .join(",");

          const detailsMap = new Map<string, { duration?: string; views?: string }>();
          if (videoIds) {
            try {
              const detailRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`,
                { headers: SERVER_FETCH_HEADERS, signal: AbortSignal.timeout(3500) }
              );
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                const detailItems = (detailData.items || []) as GoogleVideoItem[];
                for (const v of detailItems) {
                  if (v.id) {
                    detailsMap.set(v.id, {
                      duration: parseDurationIso(v.contentDetails?.duration),
                      views: v.statistics?.viewCount
                        ? `${parseInt(v.statistics.viewCount, 10).toLocaleString()} views`
                        : undefined,
                    });
                  }
                }
              }
            } catch {
              // ignore detail enrichment error
            }
          }

          const liveVideos = items.map((item) => {
            const vid = item.id?.videoId || "";
            const det = detailsMap.get(vid);
            return {
              id: vid,
              title: item.snippet?.title || "Video",
              channel: item.snippet?.channelTitle || "Creator",
              channelUrl: item.snippet?.channelId
                ? `https://www.youtube.com/channel/${item.snippet.channelId}`
                : "",
              views: det?.views || "Google Result",
              uploadedAt: item.snippet?.publishedAt
                ? new Date(item.snippet.publishedAt).toLocaleDateString()
                : "",
              duration: det?.duration || "Video",
              category: "General",
              thumbnailUrl: `/api/xyz/thumb/${vid}`,
              description: item.snippet?.description || "",
            };
          });

          return NextResponse.json(
            { results: liveVideos, live: true, page, hasMore: Boolean(apiData.nextPageToken) },
            { headers: responseHeaders }
          );
        }
      } catch {
        // Fallback to providers below
      }
    }

    if (userApiKey) {
      const fromInvidious = await invidiousSearch();
      if (fromInvidious) return fromInvidious;
    }

    const qLower = query.toLowerCase();
    const allMatched = XYZ_CATALOG_VIDEOS.filter(
      (video) =>
        video.title.toLowerCase().includes(qLower) ||
        video.channel.toLowerCase().includes(qLower) ||
        video.category.toLowerCase().includes(qLower) ||
        video.description.toLowerCase().includes(qLower)
    );
    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;
    const results = allMatched.slice(startIndex, startIndex + pageSize);

    return NextResponse.json(
      {
        results,
        live: false,
        page,
        hasMore: startIndex + pageSize < allMatched.length,
        hasApiKey: Boolean(apiKey),
      },
      { headers: responseHeaders }
    );
  }

  // 5. Single Video Metadata
  if (!rawIdOrUrl) {
    return NextResponse.json(
      { error: "Missing 'id', 'url', 'q', 'feed', or 'suggest' parameter" },
      { status: 400, headers: responseHeaders }
    );
  }

  const parseResult = parseXyzUrl(rawIdOrUrl);
  if (!parseResult.ok) {
    return NextResponse.json(
      { error: parseResult.error },
      { status: 400, headers: responseHeaders }
    );
  }

  const videoId = parseResult.videoId;
  const known = XYZ_CATALOG_VIDEOS.find((v) => v.id === videoId);

  // 1. Try YouTube oEmbed
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const embedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
      {
        headers: SERVER_FETCH_HEADERS,
        signal: AbortSignal.timeout(3500),
      }
    );

    if (embedRes.ok) {
      const data = await embedRes.json();
      return NextResponse.json(
        {
          id: videoId,
          title: data.title ?? known?.title ?? "Video",
          authorName: data.author_name ?? known?.channel ?? "Creator",
          authorUrl: data.author_url ?? known?.channelUrl ?? "",
          thumbnailUrl: `/api/xyz/thumb/${videoId}`,
          views: known?.views ?? "",
          uploadedAt: known?.uploadedAt ?? "",
          duration: known?.duration ?? "Video",
          description:
            known?.description ??
            (data.title ? `${data.title} by ${data.author_name || "Creator"}` : ""),
        },
        { headers: responseHeaders }
      );
    }
  } catch {
    // continue to fallbacks below
  }

  // 2. Try Google API if key is present
  if (apiKey) {
    try {
      const gRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`,
        { headers: SERVER_FETCH_HEADERS, signal: AbortSignal.timeout(3500) }
      );
      if (gRes.ok) {
        const gData = await gRes.json();
        const item = gData.items?.[0];
        if (item) {
          return NextResponse.json(
            {
              id: videoId,
              title: item.snippet?.title || "Video",
              authorName: item.snippet?.channelTitle || "Creator",
              authorUrl: item.snippet?.channelId
                ? `https://www.youtube.com/channel/${item.snippet.channelId}`
                : "",
              thumbnailUrl: `/api/xyz/thumb/${videoId}`,
              views: item.statistics?.viewCount
                ? `${parseInt(item.statistics.viewCount, 10).toLocaleString()} views`
                : "",
              uploadedAt: item.snippet?.publishedAt
                ? new Date(item.snippet.publishedAt).toLocaleDateString()
                : "",
              duration: parseDurationIso(item.contentDetails?.duration),
              description: item.snippet?.description || "",
            },
            { headers: responseHeaders }
          );
        }
      }
    } catch {
      // continue to next fallback
    }
  }

  // 3. Try Invidious provider bases
  const provider = await fetchInvidiousJson<ProviderItem & { authorUrl?: string }>(
    `/api/v1/videos/${videoId}`,
    { timeoutMs: 3000, accept: (d) => Boolean((d as ProviderItem)?.title) }
  );
  if (provider) {
    const pData = provider.data;
    return NextResponse.json(
      {
        id: videoId,
        title: pData.title,
        authorName: pData.author || "Creator",
        authorUrl: pData.authorUrl ? `https://www.youtube.com${pData.authorUrl}` : "",
        thumbnailUrl: `/api/xyz/thumb/${videoId}`,
        views: pData.viewCountText || (pData.viewCount ? `${pData.viewCount} views` : ""),
        uploadedAt: pData.publishedText || "",
        duration: formatDuration(pData.lengthSeconds),
        description: pData.description || "",
      },
      { headers: responseHeaders }
    );
  }

  // 4. Try known catalog video
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
      { headers: responseHeaders }
    );
  }

  // 5. Safe graceful fallback response (Never error out on valid video IDs!)
  return NextResponse.json(
    {
      id: videoId,
      title: "YouTube Video",
      authorName: "Creator",
      authorUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `/api/xyz/thumb/${videoId}`,
      views: "",
      uploadedAt: "",
      duration: "Video",
      description: "",
    },
    { headers: responseHeaders }
  );
}
