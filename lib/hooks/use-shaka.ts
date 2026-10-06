"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type ShakaModule = typeof import("shaka-player/dist/shaka-player.dash");
type ShakaPlayer = InstanceType<ShakaModule["default"]["Player"]>;

let shakaModule: Promise<ShakaModule> | null = null;

/**
 * The previous player's teardown. destroy() is async and detaches the <video>, so a new player
 * must wait for it, or the old teardown wipes the new stream (blank video after switching).
 */
let pendingDestroy: Promise<unknown> = Promise.resolve();

/** Starts downloading the Shaka chunk ahead of the first play (call when the page is idle). */
export function preloadShaka(): Promise<ShakaModule> {
  shakaModule ??= import("shaka-player/dist/shaka-player.dash");
  return shakaModule;
}

/**
 * The uncached variant of a manifest URL, so a retry skips any CDN copy. Our manifests use a
 * `/fresh` path (query strings are not part of every CDN's cache key, e.g. Netlify's).
 */
function freshUrl(url: string): string {
  if (url.startsWith("/api/xyz/manifest/") && !url.includes("?")) return `${url}/fresh`;
  return `${url}${url.includes("?") ? "&" : "?"}fresh=1`;
}

export interface QualityOption {
  height: number;
  label: string;
}

export interface ShakaState {
  qualities: QualityOption[];
  /** Selected height, or null for adaptive (auto). */
  quality: number | null;
  setQuality: (height: number | null) => void;
  /** Re-runs the full source ladder (used by the "retry" button after all sources failed). */
  retry: () => void;
}

interface Options {
  autoplay: boolean;
  onError: (message: string) => void;
  onRecovered?: () => void;
}

/**
 * Plays DASH manifests with Shaka Player (lazy-loaded, DASH-only build).
 *
 * Failure ladder: each manifest URL gets one reload (fresh signed segment URLs, resuming at the
 * current position), then the next instance is tried. When every source fails, `onError` fires.
 */
export function useShaka(
  videoRef: RefObject<HTMLVideoElement | null>,
  manifestUrls: string[] | null,
  { autoplay, onError, onRecovered }: Options
): ShakaState {
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [quality, setQualityState] = useState<number | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  const playerRef = useRef<ShakaPlayer | null>(null);
  const callbacks = useRef({ autoplay, onError, onRecovered });

  useEffect(() => {
    callbacks.current = { autoplay, onError, onRecovered };
  }, [autoplay, onError, onRecovered]);

  const sourcesKey = manifestUrls?.join("|") ?? "";

  useEffect(() => {
    const video = videoRef.current;
    const urls = sourcesKey ? sourcesKey.split("|") : [];
    if (!video || urls.length === 0) return;

    let cancelled = false;
    let player: ShakaPlayer | null = null;
    // Each source is attempted twice: initial load + one fresh reload (new signed segment URLs).
    const attempts = urls.flatMap((u) => [u, freshUrl(u)]);
    let index = 0;
    let loading = false;

    const refreshQualities = () => {
      if (!player) return;
      const heights = new Set<number>();
      for (const t of player.getVariantTracks()) if (t.height) heights.add(t.height);
      setQualities(
        [...heights].sort((a, b) => b - a).map((h) => ({ height: h, label: `${h}p` }))
      );
    };

    const loadCurrent = async (startTime: number | null) => {
      if (!player || cancelled || loading) return;
      loading = true;
      try {
        // Passing the MIME type stops Shaka from sending a HEAD request to sniff it.
        await player.load(attempts[index], startTime, "application/dash+xml");
        if (cancelled) return;
        refreshQualities();
        if (index > 0) callbacks.current.onRecovered?.();
        if (callbacks.current.autoplay) video.play().catch(() => {});
      } catch {
        if (!cancelled) await advance();
      } finally {
        loading = false;
      }
    };

    const advance = async () => {
      index += 1;
      if (index >= attempts.length) {
        callbacks.current.onError("This video can't be played right now");
        return;
      }
      const resumeAt = video.currentTime > 0 ? video.currentTime : null;
      loading = false;
      await loadCurrent(resumeAt);
    };

    Promise.all([preloadShaka(), pendingDestroy.catch(() => {})]).then(async ([{ default: shaka }]) => {
      if (cancelled) return;
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        callbacks.current.onError("This browser cannot play adaptive streams");
        return;
      }
      player = new shaka.Player();
      playerRef.current = player;
      await player.attach(video);
      if (cancelled) return;
      player.configure({
        // Start around 480p instead of trusting the browser's network hint (it often reports a fast
        // link, making the first segments 1080p+); ABR steps up once real throughput is measured.
        abr: { useNetworkInformation: false, defaultBandwidthEstimate: 1_000_000 },
        streaming: {
          // Keep load on volunteer instances modest.
          bufferingGoal: 30,
          // Start playing after 1s of buffer (YouTube manifests ask for 1.5s via minBufferTime).
          rebufferingGoal: 1,
          retryParameters: { maxAttempts: 2, baseDelay: 500, backoffFactor: 2, timeout: 20000 },
        },
        manifest: {
          dash: { ignoreMinBufferTime: true },
          // The source ladder above already retries with a fresh manifest; don't double up.
          retryParameters: { maxAttempts: 1, baseDelay: 500, backoffFactor: 2, timeout: 15000 },
        },
      });
      player.addEventListener("error", (event) => {
        const detail = (event as unknown as { detail?: { severity?: number } }).detail;
        // severity 2 === shaka.util.Error.Severity.CRITICAL
        if (detail?.severity === 2 && !loading) {
          console.warn("[xyz] playback error", (detail as { code?: number }).code);
          void advance();
        }
      });
      player.addEventListener("variantchanged", refreshQualities);
      player.addEventListener("trackschanged", refreshQualities);
      await loadCurrent(null);
    });

    return () => {
      cancelled = true;
      setQualities([]);
      setQualityState(null);
      playerRef.current = null;
      if (player) pendingDestroy = player.destroy();
    };
  }, [videoRef, sourcesKey, attemptKey]);

  const setQuality = useCallback((height: number | null) => {
    const player = playerRef.current;
    if (!player) return;
    if (height === null) {
      player.configure({ abr: { enabled: true } });
    } else {
      const track = player
        .getVariantTracks()
        .filter((t) => t.height === height)
        .sort((a, b) => b.bandwidth - a.bandwidth)[0];
      if (!track) return;
      player.configure({ abr: { enabled: false } });
      player.selectVariantTrack(track, true);
    }
    setQualityState(height);
  }, []);

  const retry = useCallback(() => setAttemptKey((k) => k + 1), []);

  return { qualities, quality, setQuality, retry };
}
