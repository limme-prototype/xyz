/**
 * Every list shown in the "Up next" filter tabs. Plain data, safe to import on client and server.
 *
 * Source kinds:
 * - `seed`: the curated catalog bundled with the app (instant, never fails).
 * - `channels`: newest uploads from YouTube channel RSS feeds (free, no API key), merged and sorted.
 * - `uploads`: a channel's full upload history via the YouTube Data API (needs XYZ_API_KEY).
 * - `chart`: YouTube's most-popular chart for a region/category (needs XYZ_API_KEY).
 * - `search`: a search through the Invidious instances.
 *
 * A section tries `source` first and `fallback` if that yields nothing.
 */
export type SectionSource =
  | { kind: "seed" }
  | { kind: "channels"; channelIds: string[] }
  | { kind: "uploads"; channelId: string }
  | { kind: "chart"; regionCode: string; categoryId?: string }
  | { kind: "search"; query: string };

export interface Section {
  id: string;
  label: string;
  source: SectionSource;
  fallback?: SectionSource;
}

const ARTISTS = {
  vannda: "UCrmidtzX3ZPVxYRjTI6V6tA",
  tena: "UCHxwBcGj5uwU6kw3g7DR7jg",
  hengPitou: "UCTjAygFmUTpADi9cNKayFgw",
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
    fallback: { kind: "search", query: "khmer song" },
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
  { id: "music", label: "Music", source: { kind: "search", query: "khmer and english hits songs" } },
  { id: "learning", label: "Learning", source: { kind: "search", query: "learn english conversation programming" } },
  { id: "coding", label: "Coding", source: { kind: "search", query: "programming tutorial full course" } },
  { id: "science", label: "Science", source: { kind: "search", query: "veritasium science education" } },
  { id: "lofi", label: "Lo-fi", source: { kind: "search", query: "lofi hip hop english khmer beats" } },
];

export const DEFAULT_SECTION_ID = "all";

export function findSection(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}
