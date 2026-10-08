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
  category: "Music" | "Coding" | "Lo-Fi" | "Tech" | "Science" | "Gaming" | "Entertainment" | "Learning" | "General";
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
  // --- KHMER SONGS (Tena, VannDa, Suly Pheng, Heng Pitou, Baramey) ---
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
    id: "3Ei8Jlc22Uc",
    title: "Tena - រាហ៊ូចាប់ច័ន្ទ (Reahoo Chab Chan) [Official MV]",
    channel: "Tena Khimphun",
    channelUrl: "https://www.youtube.com/@Tena_Khimphun",
    views: "18M views",
    uploadedAt: "2 years ago",
    duration: "4:04",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/3Ei8Jlc22Uc",
    description: "Tena - Reahoo Chab Chan. Official music video by Tena Khimphun.",
  },
  {
    id: "1yhRviwg0UY",
    title: "Tena - ស្តាយ​ក្រោយ​ ft Tena90s",
    channel: "Tena Khimphun",
    channelUrl: "https://www.youtube.com/@Tena_Khimphun",
    views: "14M views",
    uploadedAt: "1 year ago",
    duration: "3:57",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/1yhRviwg0UY",
    description: "Tena - Sday Kroy ft Tena90s. Official music video by Tena Khimphun.",
  },
  {
    id: "iDPSm-temwE",
    title: "Tena - 72 ម៉ោង​ Feat Narik",
    channel: "Tena Khimphun",
    channelUrl: "https://www.youtube.com/@Tena_Khimphun",
    views: "12M views",
    uploadedAt: "1 year ago",
    duration: "4:25",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/iDPSm-temwE",
    description: "Tena - 72 Maong (72 Hours) feat Narik. Official music video.",
  },
  {
    id: "iw8igAmrg24",
    title: "Tena - ប្រពន្ធ​កំសត់​",
    channel: "Tena Khimphun",
    channelUrl: "https://www.youtube.com/@Tena_Khimphun",
    views: "9.8M views",
    uploadedAt: "1 year ago",
    duration: "4:08",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/iw8igAmrg24",
    description: "Tena - Propun Komsot. Official music video by Tena Khimphun.",
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
    id: "Cpo3DmbdCxs",
    title: "VANNDA - សង្រ្កាន្តស្គាល់ស្នេហ៍ (SANGKRAN MAGIC) [OFFICIAL MUSIC VIDEO]",
    channel: "VannDa Official",
    channelUrl: "https://www.youtube.com/@vannda",
    views: "28M views",
    uploadedAt: "2 years ago",
    duration: "4:53",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/Cpo3DmbdCxs",
    description: "VANNDA - Sangkran Magic. Official music video produced by Baramey Production.",
  },
  {
    id: "NOSnCDUoOio",
    title: "VANNDA - DO YOU (OFFICIAL VIDEO)",
    channel: "VannDa Official",
    channelUrl: "https://www.youtube.com/@vannda",
    views: "24M views",
    uploadedAt: "2 years ago",
    duration: "3:42",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/NOSnCDUoOio",
    description: "VANNDA - DO YOU. Official music video produced by Baramey Production.",
  },
  {
    id: "Jbt5dRYFOPo",
    title: "VANNDA - BABY MAMA (OFFICIAL MUSIC VIDEO)",
    channel: "VannDa Official",
    channelUrl: "https://www.youtube.com/@vannda",
    views: "35M views",
    uploadedAt: "2 years ago",
    duration: "4:03",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/Jbt5dRYFOPo",
    description: "VANNDA - BABY MAMA. Official music video produced by Baramey Production.",
  },
  {
    id: "0jSgcE-sxeo",
    title: "VANNDA - BLUE STORY (OFFICIAL VIDEO)",
    channel: "VannDa Official",
    channelUrl: "https://www.youtube.com/@vannda",
    views: "20M views",
    uploadedAt: "3 years ago",
    duration: "4:05",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/0jSgcE-sxeo",
    description: "VANNDA - BLUE STORY. Official music video produced by Baramey Production.",
  },
  {
    id: "dXITrblyQCs",
    title: "VANNDA - អាមុំបងអើយ (BAD LIL BOO) [OFFICIAL MUSIC VIDEO]",
    channel: "VannDa Official",
    channelUrl: "https://www.youtube.com/@vannda",
    views: "16M views",
    uploadedAt: "1 year ago",
    duration: "4:16",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/dXITrblyQCs",
    description: "VANNDA - Bad Lil Boo. Official music video produced by Baramey Production.",
  },
  {
    id: "mkTrbmr9TOg",
    title: "Suly Pheng - ខកខាន (Missed) feat. KZ [Official MV]",
    channel: "Suly Pheng",
    channelUrl: "https://www.youtube.com/@sulypheng",
    views: "32M views",
    uploadedAt: "2 years ago",
    duration: "5:46",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/mkTrbmr9TOg",
    description: "Suly Pheng - ខកខាន (Missed) feat. KZ. Official music video.",
  },
  {
    id: "AJT0wfncukE",
    title: "Suly Pheng - បើមានគេល្អជាងបង If Only - (feat. KZ) [Official MV]",
    channel: "Suly Pheng",
    channelUrl: "https://www.youtube.com/@sulypheng",
    views: "19M views",
    uploadedAt: "2 years ago",
    duration: "4:53",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/AJT0wfncukE",
    description: "Suly Pheng - If Only feat KZ. Official music video.",
  },
  {
    id: "tfVb3fq4NmE",
    title: "Suly Pheng X Pich Solikah - សិប្បនិម្មិត - Open Wound [MV]",
    channel: "Suly Pheng",
    channelUrl: "https://www.youtube.com/@sulypheng",
    views: "15M views",
    uploadedAt: "1 year ago",
    duration: "4:46",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/tfVb3fq4NmE",
    description: "Suly Pheng X Pich Solikah - Open Wound. Official music video.",
  },
  {
    id: "F2Jafrr4lhM",
    title: "Heng Pitu - ទីបំផុត Finally (Official MV)",
    channel: "Heng Pitou",
    channelUrl: "https://www.youtube.com/@HengPitou",
    views: "21M views",
    uploadedAt: "3 years ago",
    duration: "8:25",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/F2Jafrr4lhM",
    description: "Heng Pitu - Finally. Official music video.",
  },
  {
    id: "RWFyQlQC4Pw",
    title: "គេបានអូន បងបានរូបថត | Heng Pitou [ OFFICIAL VIDEO ]",
    channel: "Heng Pitou",
    channelUrl: "https://www.youtube.com/@HengPitou",
    views: "17M views",
    uploadedAt: "3 years ago",
    duration: "4:00",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/RWFyQlQC4Pw",
    description: "Heng Pitou - គេបានអូន បងបានរូបថត. Official music video.",
  },
  {
    id: "e1U1pp-rPyY",
    title: "Baramey Crew - ក្រមុំបារមី (feat. Sou Siryka, Sophia Kao & Laura Mam)",
    channel: "Baramey Official",
    channelUrl: "https://www.youtube.com/@BarameyOfficial",
    views: "11M views",
    uploadedAt: "2 years ago",
    duration: "3:42",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/e1U1pp-rPyY",
    description: "Baramey Crew - Kromom Baramey feat Sou Siryka, Sophia Kao & Laura Mam. Official video.",
  },

  // --- ENGLISH HIT SONGS ---
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
  {
    id: "rYEDA3JcQqw",
    title: "Adele - Rolling in the Deep (Official Music Video)",
    channel: "Adele",
    channelUrl: "https://www.youtube.com/@Adele",
    views: "2.3B views",
    uploadedAt: "13 years ago",
    duration: "3:53",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/rYEDA3JcQqw",
    description: "Official music video for Rolling in the Deep by Adele.",
  },
  {
    id: "nfs8NYg7yQM",
    title: "Charlie Puth - Attention [Official Video]",
    channel: "Charlie Puth",
    channelUrl: "https://www.youtube.com/@CharliePuth",
    views: "1.5B views",
    uploadedAt: "7 years ago",
    duration: "3:51",
    category: "Music",
    thumbnailUrl: "/api/xyz/thumb/nfs8NYg7yQM",
    description: "Official music video for Attention by Charlie Puth.",
  },

  // --- ENGLISH PROGRAMMING & TECH LEARNING ---
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
    id: "W6NZfCO5SIk",
    title: "JavaScript Course for Beginners – Your First Step to Web Development",
    channel: "Programming with Mosh",
    channelUrl: "https://www.youtube.com/@programmingwithmosh",
    views: "4.8M views",
    uploadedAt: "3 years ago",
    duration: "48:17",
    category: "Coding",
    thumbnailUrl: "/api/xyz/thumb/W6NZfCO5SIk",
    description: "JavaScript Tutorial for Beginners: Learn JavaScript in 1 hour.",
  },
  {
    id: "rfscVS0vtbw",
    title: "Learn Python - Full Course for Beginners [Tutorial]",
    channel: "freeCodeCamp.org",
    channelUrl: "https://www.youtube.com/@freecodecamp",
    views: "42M views",
    uploadedAt: "5 years ago",
    duration: "4:26:52",
    category: "Coding",
    thumbnailUrl: "/api/xyz/thumb/rfscVS0vtbw",
    description: "This course will give you a full introduction into all of the core concepts in Python.",
  },
  {
    id: "zOjov-2OZ0E",
    title: "Introduction to Programming and Computer Science - Full Course",
    channel: "freeCodeCamp.org",
    channelUrl: "https://www.youtube.com/@freecodecamp",
    views: "3.5M views",
    uploadedAt: "4 years ago",
    duration: "1:59:09",
    category: "Coding",
    thumbnailUrl: "/api/xyz/thumb/zOjov-2OZ0E",
    description: "In this course, you will learn the basics of computer programming and computer science.",
  },
  {
    id: "gmuTjeQUbTM",
    title: "Harvard CS50 – Full Computer Science University Course",
    channel: "freeCodeCamp.org",
    channelUrl: "https://www.youtube.com/@freecodecamp",
    views: "8.1M views",
    uploadedAt: "1 year ago",
    duration: "24:29:14",
    category: "Coding",
    thumbnailUrl: "/api/xyz/thumb/gmuTjeQUbTM",
    description: "CS50 is an open-course computer science course taught at Harvard University.",
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

  // --- ENGLISH SCIENCE & MATH LEARNING ---
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
    id: "pTn6Ewhb27k",
    title: "Why No One Has Measured The Speed Of Light",
    channel: "Veritasium",
    channelUrl: "https://www.youtube.com/@veritasium",
    views: "22M views",
    uploadedAt: "3 years ago",
    duration: "19:05",
    category: "Science",
    thumbnailUrl: "/api/xyz/thumb/pTn6Ewhb27k",
    description: "The speed of light in one direction has never been measured. Here is why.",
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
    id: "TDoGrbpJJ14",
    title: "Bacteria - Biology - Khan Academy",
    channel: "Khan Academy",
    channelUrl: "https://www.youtube.com/@khanacademy",
    views: "1.9M views",
    uploadedAt: "8 years ago",
    duration: "18:26",
    category: "Learning",
    thumbnailUrl: "/api/xyz/thumb/TDoGrbpJJ14",
    description: "Introduction to bacteria, prokaryotes, and basic microbiology on Khan Academy.",
  },
  {
    id: "Hmwvj9X4GNY",
    title: "Parts of a cell - Biology - Khan Academy",
    channel: "Khan Academy",
    channelUrl: "https://www.youtube.com/@khanacademy",
    views: "2.4M views",
    uploadedAt: "8 years ago",
    duration: "21:04",
    category: "Learning",
    thumbnailUrl: "/api/xyz/thumb/Hmwvj9X4GNY",
    description: "Parts of a cell including cell membrane, cytoplasm, organelles, and nucleus by Khan Academy.",
  },

  // --- LANGUAGE LEARNING (KHMER & ENGLISH) ---
  {
    id: "Tl6i_kIlUPk",
    title: "Master Khmer: 1 Hour of Essential Lessons for Beginners!",
    channel: "Rean Khmer - Learn Khmer",
    channelUrl: "https://www.youtube.com/@reankhmer",
    views: "1.1M views",
    uploadedAt: "2 years ago",
    duration: "58:48",
    category: "Learning",
    thumbnailUrl: "/api/xyz/thumb/Tl6i_kIlUPk",
    description: "Master Khmer with essential lessons for beginners: greetings, numbers, and common vocabulary.",
  },
  {
    id: "xyIXp8PDS-8",
    title: "80 Daily Cambodian Phrases You Should Know",
    channel: "Khmer Lesson",
    channelUrl: "https://www.youtube.com/@khmerlesson",
    views: "850K views",
    uploadedAt: "3 years ago",
    duration: "27:27",
    category: "Learning",
    thumbnailUrl: "/api/xyz/thumb/xyIXp8PDS-8",
    description: "80 most common daily Cambodian phrases for communication and practical conversation.",
  },
  {
    id: "rYhhFDU3_-c",
    title: "Cambodian Words & Phrases You Must Know",
    channel: "Khmer Lesson",
    channelUrl: "https://www.youtube.com/@khmerlesson",
    views: "520K views",
    uploadedAt: "2 years ago",
    duration: "5:57",
    category: "Learning",
    thumbnailUrl: "/api/xyz/thumb/rYhhFDU3_-c",
    description: "Essential Cambodian words and daily phrases for everyday life.",
  },
  {
    id: "v07kPyPkLYw",
    title: "30 Minutes of Real English Conversation You'll Actually Use",
    channel: "Speak English with David & Alice",
    channelUrl: "https://www.youtube.com/@speakenglish",
    views: "3.2M views",
    uploadedAt: "1 year ago",
    duration: "29:20",
    category: "Learning",
    thumbnailUrl: "/api/xyz/thumb/v07kPyPkLYw",
    description: "Practice real natural English conversation for intermediate and daily life speaking.",
  },
  {
    id: "QXVzmzhxWWc",
    title: "Improve your English Grammar in One Hour | Basic English Grammar",
    channel: "linguamarina",
    channelUrl: "https://www.youtube.com/@linguamarina",
    views: "7.8M views",
    uploadedAt: "3 years ago",
    duration: "1:03:12",
    category: "Learning",
    thumbnailUrl: "/api/xyz/thumb/QXVzmzhxWWc",
    description: "Complete 1-hour English grammar crash course covering tenses, verbs, prepositions, and sentence structures.",
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
