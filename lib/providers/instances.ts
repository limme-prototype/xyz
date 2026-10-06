/**
 * Registry of public Invidious instances that can stream to browsers which cannot reach YouTube.
 *
 * An instance qualifies only if its DASH manifest (`local=true`) is served with CORS and every
 * segment URL stays on the instance (proxied), never pointing at googlevideo.com.
 * Verified 2026-10-06: invidious.f5.si (redirects to its companion host jp1-cmp.invidious.f5.si).
 */
import { unstable_cache } from "next/cache";

export const KNOWN_INSTANCES = ["https://invidious.f5.si"];

export const PROBE_VIDEO_ID = "jNQXAC9IVRw";

const INSTANCE_DIRECTORY = "https://api.invidious.io/instances.json?sort_by=health";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 6000;

export const SERVER_USER_AGENT = "xyz-player/1.0 (+personal; low-volume)";

type DirectoryEntry = [string, { type?: string; uri?: string; api?: boolean | null; cors?: boolean | null }];

export function manifestUrl(instance: string, videoId: string): string {
  return `${instance}/api/manifest/dash/id/${videoId}?local=true`;
}

/** Picks https instances that advertise both API and CORS from the api.invidious.io directory. */
export function filterDirectory(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  const out: string[] = [];
  for (const entry of entries as DirectoryEntry[]) {
    const info = entry?.[1];
    if (info?.type !== "https" || info.api !== true || info.cors !== true || !info.uri) continue;
    try {
      const url = new URL(info.uri);
      if (url.protocol === "https:") out.push(url.origin);
    } catch {
      // skip malformed
    }
  }
  return out;
}

/** A manifest is usable when it is CORS-readable and keeps all media on the instance. */
export function isUsableManifest(body: string, allowOrigin: string | null): boolean {
  if (allowOrigin !== "*") return false;
  if (!body.includes("<MPD")) return false;
  if (!/<BaseURL>/.test(body)) return false;
  return !/<BaseURL>\s*https?:\/\/[^<]*googlevideo\.com/i.test(body);
}

/**
 * Returns the URL the browser should load for a video's manifest.
 *
 * Instances usually 302 to their companion host, but the redirect response itself carries no
 * CORS header, so browsers refuse to follow it. We follow it server-side and hand out the final
 * (CORS-enabled) companion URL instead.
 */
export async function resolveManifestUrl(instance: string, videoId: string): Promise<string | null> {
  const url = manifestUrl(instance, videoId);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": SERVER_USER_AGENT },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      const target = new URL(location, url);
      return target.protocol === "https:" ? target.toString() : null;
    }
    // Some servers reject HEAD; a non-redirect answer means the instance serves the manifest itself.
    return res.ok || res.status === 405 ? url : null;
  } catch {
    return null;
  }
}

/**
 * Where each instance's manifests really live (its companion host), as a template with `{id}`.
 * Learned from the first redirect so later videos skip the extra HEAD round trip.
 */
const manifestTemplates = new Map<string, string>();

function rememberTemplate(instance: string, url: string, videoId: string) {
  manifestTemplates.set(instance, url.replace(videoId, "{id}"));
}

/** Origin that serves an instance's manifests and media segments (for preconnect hints). */
export function mediaOrigin(instance: string): string | null {
  const template = manifestTemplates.get(instance);
  try {
    return template ? new URL(template).origin : null;
  } catch {
    return null;
  }
}

/** Rewrites every <BaseURL> to an absolute URL so the manifest works when served from our origin. */
export function absolutizeManifest(xml: string, manifestUrl: string): string {
  return xml.replace(/<BaseURL>([^<]*)<\/BaseURL>/g, (whole, raw: string) => {
    try {
      const resolved = new URL(raw.replace(/&amp;/g, "&").trim(), manifestUrl).toString();
      return `<BaseURL>${resolved.replace(/&/g, "&amp;")}</BaseURL>`;
    } catch {
      return whole;
    }
  });
}

/**
 * Fetches and validates a video's manifest on one instance. Returns it only when the instance can
 * actually serve this video: companions often answer 500 (without CORS headers) for videos they fail
 * to extract, which browsers report as a confusing CORS error.
 */
export async function fetchPlayableManifest(
  instance: string,
  videoId: string
): Promise<{ url: string; xml: string } | null> {
  const template = manifestTemplates.get(instance);
  const candidates = template ? [template.replace("{id}", videoId), null] : [null];
  for (const known of candidates) {
    const target = known ?? (await resolveManifestUrl(instance, videoId));
    if (!target) return null;
    try {
      const res = await fetch(target, {
        headers: { "User-Agent": SERVER_USER_AGENT, Origin: "https://xyz.invalid" },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        cache: "no-store",
      });
      const xml = res.ok ? await res.text() : "";
      if (xml && isUsableManifest(xml, res.headers.get("access-control-allow-origin"))) {
        rememberTemplate(instance, target, videoId);
        return { url: target, xml };
      }
      // A failing remembered host may have moved: retry once through the instance's redirect.
      if (!known) return null;
    } catch {
      if (!known) return null;
    }
  }
  return null;
}

export async function resolvePlayableManifest(instance: string, videoId: string): Promise<string | null> {
  return (await fetchPlayableManifest(instance, videoId))?.url ?? null;
}

interface HealthyInstance {
  instance: string;
  template: string | null;
}

async function probe(instance: string): Promise<HealthyInstance | null> {
  const ok = await fetchPlayableManifest(instance, PROBE_VIDEO_ID);
  return ok ? { instance, template: manifestTemplates.get(instance) ?? null } : null;
}

async function discover(): Promise<HealthyInstance[]> {
  let candidates = [...KNOWN_INSTANCES];
  try {
    const res = await fetch(INSTANCE_DIRECTORY, {
      headers: { "User-Agent": SERVER_USER_AGENT },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) candidates = [...new Set([...KNOWN_INSTANCES, ...filterDirectory(await res.json())])];
  } catch {
    // directory unavailable: probe known instances only
  }
  const results = await Promise.all(candidates.map(probe));
  return results.filter((c): c is HealthyInstance => c !== null);
}

/**
 * Discovery shared across serverless invocations through the Next.js Data Cache, so a cold start
 * reuses the last result instead of re-probing every instance (~3s). Empty results throw, which
 * keeps them out of the cache. Outside the Next runtime (tests) it simply runs discovery.
 */
const sharedDiscover = unstable_cache(
  async () => {
    const healthy = await discover();
    if (healthy.length === 0) throw new Error("No healthy instances");
    return healthy;
  },
  ["invidious-healthy-instances-v1"],
  { revalidate: CACHE_TTL_MS / 1000 }
);

async function discoverShared(): Promise<HealthyInstance[]> {
  try {
    return await sharedDiscover();
  } catch (err) {
    if (err instanceof Error && err.message.includes("incrementalCache missing")) return discover();
    return [];
  }
}

let cache: { at: number; instances: string[] } | null = null;
let inflight: Promise<string[]> | null = null;

/**
 * Healthy instances, best first. Falls back to KNOWN_INSTANCES when nothing passes the probe
 * so a transient probe failure does not take playback down entirely.
 */
export async function getHealthyInstances(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.instances;
  inflight ??= discoverShared()
    .then((healthy) => {
      for (const h of healthy) if (h.template) manifestTemplates.set(h.instance, h.template);
      const instances = healthy.length > 0 ? healthy.map((h) => h.instance) : [...KNOWN_INSTANCES];
      // Cache an empty probe result only briefly so recovery is picked up quickly.
      cache = { at: healthy.length > 0 ? Date.now() : Date.now() - CACHE_TTL_MS + 5 * 60 * 1000, instances };
      return instances;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetInstanceCache(): void {
  cache = null;
  inflight = null;
  manifestTemplates.clear();
}
