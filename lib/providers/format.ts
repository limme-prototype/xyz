/** Display helpers shared by every video source (Invidious, YouTube RSS, YouTube Data API). */

export function formatDuration(totalSec?: number): string {
  if (typeof totalSec !== "number" || !Number.isFinite(totalSec) || totalSec <= 0) return "Video";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = String(Math.floor(totalSec % 60)).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** ISO-8601 duration (`PT1H2M3S`, as returned by the YouTube Data API) to seconds; null if unparseable. */
export function isoDurationSeconds(iso?: string): number | null {
  const match = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, d = "0", h = "0", m = "0", s = "0"] = match;
  return Number(d) * 86400 + Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export function parseDurationIso(iso?: string): string {
  return formatDuration(isoDurationSeconds(iso) ?? undefined);
}

export function formatViews(count?: number | null): string {
  if (typeof count !== "number" || !Number.isFinite(count)) return "";
  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(count);
  return `${compact} ${count === 1 ? "view" : "views"}`;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago" style text for an ISO date; empty string when the date is invalid. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, (now - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}
