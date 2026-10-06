export type ParseResult =
  | { ok: true; videoId: string }
  | { ok: false; error: string };

export interface XyzVideo {
  id: string;
  title: string;
  channel: string;
  channelUrl: string;
  views: string;
  uploadedAt: string;
  duration: string;
  category: "Music" | "Coding" | "Lo-Fi" | "Tech" | "Science" | "Gaming" | "Entertainment" | "General";
  thumbnailUrl: string;
  description: string;
}

export type CatalogVideo = XyzVideo;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export const DEFAULT_VIDEO_ID = "G9rJC-cD_hk";

export const XYZ_CATALOG_VIDEOS: XyzVideo[] = [
  {
    id: "G9rJC-cD_hk",
    title: "Tena - បងក្រ Feat. YCN Rakhie",
    channel: "Tena Khimphun",
    channelUrl: "https://www.youtube.com/@Tena_Khimphun",
    views: "48M views",
    uploadedAt: "2 years ago",
    duration: "3:58",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/G9rJC-cD_hk",
    description: "Tena - បងក្រ (Bong Kro) feat. YCN Rakhie. Official music video by Tena Khimphun.",
  },
  {
    id: "ABY94Ch2nVs",
    title: "Tena - ស្ទាវខេត្ត Steav Khet ft Van Chesda , Glomyy Vincent",
    channel: "Tena Khimphun",
    channelUrl: "https://www.youtube.com/@Tena_Khimphun",
    views: "22M views",
    uploadedAt: "1 year ago",
    duration: "4:12",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/ABY94Ch2nVs",
    description: "Tena - Steav Khet ft Van Chesda, Glomyy Vincent. Official music video.",
  },
  {
    id: "rvje5oblrLw",
    title: "VannDa - Time To Rise feat. Master Kong Nay",
    channel: "VannDa Official",
    channelUrl: "https://www.youtube.com/@vannda",
    views: "125M views",
    uploadedAt: "3 years ago",
    duration: "4:36",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/rvje5oblrLw",
    description: "VannDa - Time To Rise featuring Master Kong Nay. Official music video produced by Baramey Production.",
  },
  {
    id: "0e3GPea1Tyg",
    title: "$456,000 Squid Game In Real Life!",
    channel: "MrBeast",
    channelUrl: "https://www.youtube.com/@MrBeast",
    views: "650M views",
    uploadedAt: "3 years ago",
    duration: "25:41",
    category: "Entertainment",
    thumbnailUrl: "/api/xyz/thumb/0e3GPea1Tyg",
    description: "Real life Squid Game with 456 people competing for $456,000! Every set recreated in real life.",
  },
  {
    id: "cuHDQhDhvPE",
    title: "Next.js in 100 Seconds",
    channel: "Fireship",
    channelUrl: "https://www.youtube.com/@Fireship",
    views: "1.2M views",
    uploadedAt: "2 years ago",
    duration: "2:24",
    category: "Coding",
    thumbnailUrl: "/api/xyz/thumb/cuHDQhDhvPE",
    description: "Next.js is a full-stack React framework that makes building web applications fast and easy.",
  },
  {
    id: "U9t-slLl30E",
    title: "Apple Vision Pro Review: Tomorrow's Tech Today!",
    channel: "Marques Brownlee",
    channelUrl: "https://www.youtube.com/@mkbhd",
    views: "19M views",
    uploadedAt: "1 year ago",
    duration: "37:50",
    category: "Tech",
    thumbnailUrl: "/api/xyz/thumb/U9t-slLl30E",
    description: "Apple Vision Pro is here. The good, the bad, and everything in between reviewed by MKBHD.",
  },
  {
    id: "kqtD5dpn9C8",
    title: "Python for Beginners - Full Course [Programming Tutorial]",
    channel: "Programming with Mosh",
    channelUrl: "https://www.youtube.com/@programmingwithmosh",
    views: "38M views",
    uploadedAt: "5 years ago",
    duration: "1:00:15",
    category: "Coding",
    thumbnailUrl: "/api/xyz/thumb/kqtD5dpn9C8",
    description: "Python tutorial for beginners - Learn Python for machine learning and web development.",
  },
  {
    id: "bHIhgxav9LY",
    title: "The Simplest Math Problem No One Can Solve - Collatz Conjecture",
    channel: "Veritasium",
    channelUrl: "https://www.youtube.com/@veritasium",
    views: "36M views",
    uploadedAt: "3 years ago",
    duration: "22:08",
    category: "Science",
    thumbnailUrl: "/api/xyz/thumb/bHIhgxav9LY",
    description: "The Collatz Conjecture is the simplest math problem that no one can solve.",
  },
  {
    id: "kJQP7kiw5Fk",
    title: "Luis Fonsi - Despacito ft. Daddy Yankee",
    channel: "Luis Fonsi",
    channelUrl: "https://www.youtube.com/@LuisFonsi",
    views: "8.5B views",
    uploadedAt: "7 years ago",
    duration: "4:41",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/kJQP7kiw5Fk",
    description: "Luis Fonsi - Despacito featuring Daddy Yankee. Official music video.",
  },
  {
    id: "JGwWNGJdvx8",
    title: "Ed Sheeran - Shape of You (Official Music Video)",
    channel: "Ed Sheeran",
    channelUrl: "https://www.youtube.com/@EdSheeran",
    views: "6.2B views",
    uploadedAt: "7 years ago",
    duration: "4:23",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/JGwWNGJdvx8",
    description: "The official music video for Ed Sheeran - Shape of You.",
  },
  {
    id: "h6fcK_fRYaI",
    title: "The Last Human on Earth - Kurzgesagt",
    channel: "Kurzgesagt - In a Nutshell",
    channelUrl: "https://www.youtube.com/@kurzgesagt",
    views: "14M views",
    uploadedAt: "2 years ago",
    duration: "10:37",
    category: "Science",
    thumbnailUrl: "/api/xyz/thumb/h6fcK_fRYaI",
    description: "What will the last day of humanity look like? A science animation by Kurzgesagt.",
  },
  {
    id: "21X5lGlDOfg",
    title: "NASA James Webb Space Telescope First Deep Field Image",
    channel: "NASA",
    channelUrl: "https://www.youtube.com/@NASA",
    views: "8.1M views",
    uploadedAt: "2 years ago",
    duration: "5:12",
    category: "Science",
    thumbnailUrl: "/api/xyz/thumb/21X5lGlDOfg",
    description: "NASA's James Webb Space Telescope reveals the deepest and sharpest infrared image of the distant universe.",
  },
  {
    id: "7wtfhZwyrcc",
    title: "Imagine Dragons - Believer (Official Music Video)",
    channel: "Imagine Dragons",
    channelUrl: "https://www.youtube.com/@ImagineDragons",
    views: "2.6B views",
    uploadedAt: "7 years ago",
    duration: "3:36",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/7wtfhZwyrcc",
    description: "Official music video for Believer by Imagine Dragons.",
  },
];

export const CATALOG_VIDEOS = XYZ_CATALOG_VIDEOS;

function validId(value: string | null): value is string {
  return Boolean(value && VIDEO_ID.test(value));
}

export function parseXyzUrl(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Paste a video link or enter a video ID." };

  if (validId(raw)) {
    return { ok: true, videoId: raw };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "Enter a valid video URL." };
  }

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return { ok: false, error: "Only supported video links are allowed." };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;

  if (host === "youtu.be" || host === "www.youtu.be") {
    candidate = segments[0] ?? null;
  } else if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v");
  } else if (["shorts", "embed", "live"].includes(segments[0] ?? "")) {
    candidate = segments[1] ?? null;
  }

  if (!validId(candidate)) {
    return {
      ok: false,
      error: "This link does not contain a valid 11-character video ID.",
    };
  }

  return { ok: true, videoId: candidate };
}

export function getXyzEmbedUrl(videoId: string, autoplay = false, origin?: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error("Invalid video ID");
  // Headless embed: all native chrome is disabled; the app renders its own controls
  // and drives playback through the IFrame postMessage API (enablejsapi=1).
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    controls: "0",
    disablekb: "1",
    fs: "0",
    rel: "0",
    iv_load_policy: "3",
    cc_load_policy: "1",
    playsinline: "1",
    enablejsapi: "1",
  });
  if (origin) {
    params.set("origin", origin);
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/** Returns the URL if the input is an http(s) HLS manifest (.m3u8), otherwise null. */
export function parseHlsUrl(input: string): string | null {
  const raw = input.trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return /\.m3u8$/i.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export const getEmbedUrl = getXyzEmbedUrl;

export function getXyzWatchUrl(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error("Invalid video ID");
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export const getWatchUrl = getXyzWatchUrl;
