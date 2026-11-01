/**
 * Every list shown in the "Up next" filter tabs. Plain data, safe to import on client and server.
 *
 * Source kinds:
 * - `seed`: the curated catalog bundled with the app (instant, never fails).
 * - `channels`: newest uploads from YouTube channel RSS feeds (free, no API key), merged and sorted.
 * - `uploads`: a channel's full upload history via the YouTube Data API (needs XYZ_API_KEY).
 * - `chart`: YouTube's most-popular chart for a region/category (needs XYZ_API_KEY).
 * - `search`: YouTube Data API search with a key, otherwise Invidious.
 *
 * A section tries `source` first and `fallback` if that yields nothing.
 */
export type SectionSource =
  | { kind: "seed" }
  | { kind: "channels"; channelIds: string[]; matchTerms?: string[] }
  | { kind: "uploads"; channelId: string }
  | { kind: "chart"; regionCode: string; categoryId?: string }
  | { kind: "search"; query: string; order?: "relevance" | "date" | "viewCount"; regionCode?: string };

export interface Section {
  id: string;
  label: string;
  source: SectionSource;
  fallback?: SectionSource | SectionSource[];
}

const ARTISTS = {
  vannda: "UCrmidtzX3ZPVxYRjTI6V6tA",
  tena: "UCHxwBcGj5uwU6kw3g7DR7jg",
  hengPitou: "UCTjAygFmUTpADi9cNKayFgw",
} as const;

// Curated YouTube channels keep topic lists useful when public search is unavailable or quota-limited.
const CHANNELS = {
  freeCodeCamp: "UC8butISFwT-Wl7EV0hUK0BQ",
  fireship: "UCsBjURrPoezykLs9EqgamOA",
  networkChuck: "UC9x0AN7BWHpCDHSm9NiJFJQ",
  googleCloudTech: "UCJS9pqu9BzkAMNTmzNMNhvg",
  ibmTechnology: "UCKWaEZ-_VweaEx1j62do_vQ",
  tedEd: "UCsooa4yRKGN_zEE8iknghZA",
  veritasium: "UCHnyfMqiRRG1u-2MsSQLbXA",
  lofiGirl: "UCSJ4gkVC6NrvII8umztf0Ow",
} as const;

export const SECTIONS: Section[] = [
  { id: "all", label: "All", source: { kind: "seed" } },
  {
    id: "new-khmer",
    label: "New Khmer",
    source: { kind: "channels", channelIds: Object.values(ARTISTS) },
  },
  {
    id: "trending-kh",
    label: "Trending KH",
    source: { kind: "chart", regionCode: "KH", categoryId: "10" },
    fallback: [{ kind: "search", query: "khmer song" }, { kind: "channels", channelIds: Object.values(ARTISTS) }],
  },
  {
    id: "vannda",
    label: "VannDa",
    source: { kind: "uploads", channelId: ARTISTS.vannda },
    fallback: { kind: "channels", channelIds: [ARTISTS.vannda] },
  },
  {
    id: "tena",
    label: "Tena",
    source: { kind: "uploads", channelId: ARTISTS.tena },
    fallback: { kind: "channels", channelIds: [ARTISTS.tena] },
  },
  {
    id: "heng-pitou",
    label: "Heng Pitou",
    source: { kind: "uploads", channelId: ARTISTS.hengPitou },
    fallback: { kind: "channels", channelIds: [ARTISTS.hengPitou] },
  },
  { id: "music", label: "Music", source: { kind: "search", query: "khmer and english music videos" }, fallback: { kind: "channels", channelIds: Object.values(ARTISTS) } },
  { id: "new-songs", label: "New Songs", source: { kind: "search", query: "new official music video song", order: "date", regionCode: "KH" }, fallback: { kind: "channels", channelIds: Object.values(ARTISTS) } },
  { id: "technology", label: "Technology", source: { kind: "search", query: "technology news AI gadgets explained", order: "date" }, fallback: { kind: "channels", channelIds: [CHANNELS.ibmTechnology, CHANNELS.googleCloudTech, CHANNELS.fireship], matchTerms: ["technology", "tech", "AI", "artificial intelligence", "machine learning", "computer", "chip", "robot", "gadget", "software", "hardware", "cloud", "coding", "programming", "developer", "device", "digital"] } },
  { id: "learning", label: "Learning", source: { kind: "search", query: "educational lessons how to learn", order: "relevance" }, fallback: { kind: "channels", channelIds: [CHANNELS.tedEd, CHANNELS.freeCodeCamp] } },
  { id: "coding", label: "Coding", source: { kind: "search", query: "programming coding tutorial course", order: "date" }, fallback: { kind: "channels", channelIds: [CHANNELS.freeCodeCamp, CHANNELS.fireship], matchTerms: ["code", "coding", "program", "python", "javascript", "typescript", "developer", "software", "web", "react", "linux", "course", "tutorial", "programming"] } },
  { id: "security", label: "Security", source: { kind: "search", query: "cybersecurity information security tutorial", order: "date" }, fallback: { kind: "channels", channelIds: [CHANNELS.ibmTechnology, CHANNELS.networkChuck], matchTerms: ["security", "cyber", "hack", "vulnerability", "privacy", "malware", "network", "threat", "attack", "password", "secure", "encryption"] } },
  { id: "deployment", label: "Cloud & Deployment", source: { kind: "search", query: "cloud deployment DevOps Docker Kubernetes tutorial", order: "date" }, fallback: { kind: "channels", channelIds: [CHANNELS.googleCloudTech, CHANNELS.ibmTechnology], matchTerms: ["cloud", "deploy", "devops", "docker", "kubernetes", "k8s", "aws", "azure", "terraform", "container", "infrastructure", "server", "pipeline", "gcp", "platform engineering"] } },
  { id: "science", label: "Science", source: { kind: "search", query: "science explained experiments discoveries", order: "relevance" }, fallback: { kind: "channels", channelIds: [CHANNELS.veritasium, CHANNELS.tedEd], matchTerms: ["science", "physics", "chemistry", "biology", "space", "experiment", "universe", "quantum", "engineering", "earth", "animal", "brain", "energy"] } },
  { id: "lofi", label: "Lo-fi", source: { kind: "search", query: "lofi hip hop beats study chill music" }, fallback: { kind: "channels", channelIds: [CHANNELS.lofiGirl] } },
];

export const DEFAULT_SECTION_ID = "all";

export function findSection(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}
