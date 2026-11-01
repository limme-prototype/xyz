"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  DEFAULT_VIDEO_ID,
  XYZ_CATALOG_VIDEOS,
  XyzVideo,
  getXyzEmbedUrl,
  parseHlsUrl,
  parseXyzUrl,
} from "@/lib/xyz";
import { VideoMeta } from "@/lib/types/player";
import { createPlaybackSession, isPlaybackSessionCurrent } from "@/lib/playback-session";
import { useAudioKeepalive, ensureAudioContext } from "@/lib/hooks/use-audio-keepalive";
import { useMediaSession } from "@/lib/hooks/use-media-session";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { useHls } from "@/lib/hooks/use-hls";
import { preloadShaka, useShaka } from "@/lib/hooks/use-shaka";
import { preconnect } from "react-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { SPRING, type HeroOrigin } from "@/lib/motion";
import { SiteHeader, type SiteHeaderHandle } from "./site-header";
import { AmbientStage } from "./ambient-stage";
import { HeroFlight } from "./hero-flight";
import { VideoDetails } from "./video-details";
import { ChipBar, HomeFeed, SearchResults, UpNextList } from "./video-list";
import { DEFAULT_SECTION_ID } from "@/lib/content/sections";
import { Input } from "@/components/ui/input";
import { X, Check, Eye, EyeOff } from "lucide-react";

interface PlaybackOptionProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
}

/** iOS form cell: whole row is the tap target, radio is the indicator. */
function PlaybackOption({ name, value, checked, onChange, title, detail }: PlaybackOptionProps) {
  return (
    <label className="interactive flex cursor-pointer items-start gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--ios-separator)] p-[var(--space-3)] transition-colors hover:bg-[var(--ios-fill-4)] has-[:checked]:border-[var(--ios-blue)] has-[:checked]:bg-[rgba(10,132,255,0.10)]">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="mt-0.5 flex size-[1.3125rem] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--ios-separator-opaque)] bg-[var(--ios-fill-3)] transition-colors peer-checked:border-[var(--ios-blue)] peer-checked:bg-[var(--ios-blue)] peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ios-blue)]/60">
        <Check className="size-3 text-white opacity-0 transition-opacity" strokeWidth={3} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body leading-tight tracking-[var(--tracking-body)]">{title}</span>
        <span className="text-footnote leading-snug tracking-[var(--tracking-footnote)] text-[var(--ios-label-2)]">
          {detail}
        </span>
      </span>
    </label>
  );
}

function getFallbackMeta(id: string): VideoMeta | null {
  const found = XYZ_CATALOG_VIDEOS.find((v) => v.id === id);
  if (!found) return null;
  return {
    id: found.id,
    title: found.title,
    authorName: found.channel,
    authorUrl: found.channelUrl,
    thumbnailUrl: found.thumbnailUrl,
    duration: found.duration,
    description: found.description,
    views: found.views,
    uploadedAt: found.uploadedAt,
  };
}

type PlaybackMode = "native" | "embed";

const PLAYBACK_MODE_KEY = "xyz_playback_mode";
const API_KEY_STORAGE = "xyz_api_key";
export const YOUTUBE_API_KEY = /^AIza[0-9A-Za-z_-]{35}$/;
export type HomeContentMode = "default" | "youtube";
export type HomeValidationState = "idle" | "checking" | "ready" | "error";

export function getHomeContentMode(apiKey: string, validationState: HomeValidationState, serverConfigured = false): HomeContentMode {
  return serverConfigured || (validationState !== "idle" && YOUTUBE_API_KEY.test(apiKey.trim())) ? "youtube" : "default";
}

/** Set from settings; sent as a header (never in the URL) so the server can use the user's own quota. */
let userApiKey = "";

function apiHeaders(): HeadersInit | undefined {
  return userApiKey ? { "x-youtube-api-key": userApiKey } : undefined;
}

interface SectionPage {
  items: XyzVideo[];
  nextPageToken: string | null;
}

async function fetchSection(id: string, pageToken?: string): Promise<SectionPage | null> {
  const qs = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
  try {
    const res = await fetch(`/api/xyz/sections/${encodeURIComponent(id)}${qs}`, { headers: apiHeaders() });
    const data = res.ok ? await res.json() : null;
    return Array.isArray(data?.items) ? { items: data.items, nextPageToken: data.nextPageToken ?? null } : null;
  } catch {
    return null;
  }
}

const MEDIA_ORIGINS_KEY = "xyz_media_origins";

function manifestPath(id: string): string {
  return `/api/xyz/manifest/${id}`;
}

/** Opens TLS connections to the media servers early; segments are the first thing fetched there. */
function preconnectMedia(origins: unknown) {
  if (!Array.isArray(origins)) return;
  for (const origin of origins) {
    if (typeof origin === "string" && /^https:\/\/[^/]+$/.test(origin)) preconnect(origin, { crossOrigin: "anonymous" });
  }
}

function readSetting(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

async function fetchVideos(url: string): Promise<{ videos: XyzVideo[] | null; errorCode: string | null }> {
  try {
    const res = await fetch(url, { headers: apiHeaders() });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        videos: null,
        errorCode: typeof data?.code === "string" ? data.code : "search_error",
      };
    }
    return Array.isArray(data?.results)
      ? { videos: data.results as XyzVideo[], errorCode: null }
      : { videos: null, errorCode: "invalid_response" };
  } catch {
    return { videos: null, errorCode: "network_error" };
  }
}

function searchErrorMessage(code: string): string {
  switch (code) {
    case "invalid_api_key":
      return "YouTube rejected the configured API key. Check that it is valid and enabled for YouTube Data API v3.";
    case "quota_exceeded":
      return "The YouTube API quota has been reached. Try again after the quota resets.";
    case "network_error":
      return "Search is temporarily unavailable. Check your connection and try again.";
    default:
      return "Search could not be completed. Please try again.";
  }
}

async function fetchYouTubeHome(key?: string): Promise<{ videos: XyzVideo[] | null; errorCode: string | null; origin: string | null }> {
  try {
    const headers = key ? { "x-youtube-api-key": key } : undefined;
    const res = await fetch("/api/xyz?feed=trending&regionCode=KH&videoCategoryId=10", { headers });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { videos: null, errorCode: typeof data?.code === "string" ? data.code : "youtube_api_error", origin: typeof data?.origin === "string" ? data.origin : null };
    return { videos: Array.isArray(data?.results) ? (data.results as XyzVideo[]) : null, errorCode: null, origin: typeof data?.origin === "string" ? data.origin : null };
  } catch {
    return { videos: null, errorCode: "network_error", origin: null };
  }
}

function youtubeHomeMessage(code: string): string {
  switch (code) {
    case "invalid_api_key":
      return "YouTube rejected this API key. Check that it is valid and enabled for YouTube Data API v3.";
    case "quota_exceeded":
      return "This YouTube API key has reached its quota. Try again after the quota resets.";
    case "network_error":
      return "YouTube discovery is temporarily unavailable. Check your connection and retry.";
    default:
      return "YouTube discovery failed. Check the API key restrictions and try again.";
  }
}

interface XyzPlayerProps {
  initialVideoId?: string;
  initialHasVideoQuery?: boolean;
}

type View =
  | { type: "home" }
  | { type: "watch" }
  | { type: "search"; query: string; results: XyzVideo[]; loading: boolean; error: string | null };

export function XyzPlayer({ initialVideoId = DEFAULT_VIDEO_ID, initialHasVideoQuery = true }: XyzPlayerProps) {
  useAudioKeepalive();

  // Consistent SSR & Client initial state using server-passed initialVideoId
  const [activeVideoId, setActiveVideoId] = useState<string>(initialVideoId);
  const [meta, setMeta] = useState<VideoMeta | null>(() => getFallbackMeta(initialVideoId));
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAutoplay, setIsAutoplay] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isAutoMinimized, setIsAutoMinimized] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const settingsDialogRef = useRef<HTMLDivElement | null>(null);
  const [queue, setQueue] = useState<XyzVideo[]>(XYZ_CATALOG_VIDEOS);
  const sectionCacheRef = useRef<Map<string, { items: XyzVideo[]; nextPageToken: string | null }>>(
    new Map([[DEFAULT_SECTION_ID, { items: XYZ_CATALOG_VIDEOS, nextPageToken: null }]])
  );
  const [activeChip, setActiveChip] = useState<string>(DEFAULT_SECTION_ID);
  const [listLoading, setListLoading] = useState<boolean>(false);
  const [listNextPage, setListNextPage] = useState<string | null>(null);
  const [listLoadingMore, setListLoadingMore] = useState<boolean>(false);
  const [view, setView] = useState<View>(() => (initialHasVideoQuery ? { type: "watch" } : { type: "home" }));

  // Custom-controls playback state (fed by YouTube infoDelivery or <video> events)
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(100);
  const [rate, setRateState] = useState<number>(1);
  const [captionsOn, setCaptionsOn] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Native (DASH via a proxying Invidious instance) is the default: it never contacts YouTube from the browser.
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("embed");
  const [dashUrls, setDashUrls] = useState<string[] | null>(null);
  const [heroFrom, setHeroFrom] = useState<HeroOrigin>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Settings
  const [tempPlaybackMode, setTempPlaybackMode] = useState<PlaybackMode>("embed");
  const [apiKey, setApiKey] = useState<string>("");
  const [tempApiKey, setTempApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [youtubeValidationState, setYoutubeValidationState] = useState<HomeValidationState>("idle");
  const [serverYoutubeConfigured, setServerYoutubeConfigured] = useState(false);
  const [youtubeHomeVideos, setYoutubeHomeVideos] = useState<XyzVideo[]>([]);
  const [youtubeHomeError, setYoutubeHomeError] = useState<string | null>(null);
  const homeValidationRequestRef = useRef(0);

  const headerRef = useRef<SiteHeaderHandle>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const playbackSessionRef = useRef(createPlaybackSession(initialVideoId, 0));
  const activeVideoIdRef = useRef(activeVideoId);
  const initialVideoIdRef = useRef(initialVideoId);
  const isAutoplayRef = useRef(isAutoplay);
  const videoActiveRef = useRef<boolean>(true);
  const streamUrlStateRef = useRef<string | null>(null);
  const playbackModeRef = useRef<PlaybackMode>("embed");
  const currentTimeRef = useRef<number>(0);
  const lastEndedTriggerRef = useRef<number>(0);
  const iframeLoadedRef = useRef<boolean>(false);
  const listRequestRef = useRef(0);

  useEffect(() => {
    activeVideoIdRef.current = activeVideoId;
  }, [activeVideoId]);

  useEffect(() => {
    isAutoplayRef.current = isAutoplay;
  }, [isAutoplay]);

  useEffect(() => {
    streamUrlStateRef.current = streamUrl;
  }, [streamUrl]);

  const isDismissedRef = useRef(isDismissed);
  useEffect(() => {
    isDismissedRef.current = isDismissed;
  }, [isDismissed]);

  // Auto-minimize on scroll when the player container leaves viewport
  useEffect(() => {
    if (view.type !== "watch") return;
    const el = stageContainerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Trigger minimize only when the player has actually scrolled completely out of the viewport
        if (!entry.isIntersecting && entry.boundingClientRect.top < 64) {
          if (!isDismissedRef.current && (isPlaying || hasStarted)) {
            setIsAutoMinimized(true);
          }
        } else if (entry.isIntersecting) {
          // Scrolled back into view -> expand back and reset dismissed state
          setIsAutoMinimized(false);
          setIsDismissed(false);
        }
      },
      {
        rootMargin: "-64px 0px 0px 0px",
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isPlaying, hasStarted, view.type]);

  // The <video> element is the playback surface for HLS streams and for native (DASH) mode.
  const videoActive = Boolean(streamUrl) || playbackMode === "native";

  // Keep the configured API key available for the server-side discovery layer regardless of playback mode.
  useEffect(() => {
    userApiKey = apiKey;
  }, [apiKey]);

  useEffect(() => {
    videoActiveRef.current = videoActive;
    playbackModeRef.current = playbackMode;
  }, [videoActive, playbackMode]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Track fullscreen changes (Esc, double-click, button)
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Must be identical on server and client to avoid a hydration mismatch (no window access here).
  const [initialEmbedUrl] = useState(() => getXyzEmbedUrl(initialVideoId, false));

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const sendPlayerCommand = useCallback((func: string, args: unknown[] = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "*"
      );
    } catch {
      // ignore
    }
  }, []);

  const sendPlayerHandshake = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening" }),
        "*"
      );
    } catch {
      // ignore
    }
  }, []);

  // Unified playback engine: routes to the <video> element when it is active, otherwise YouTube.
  const engine = useMemo(
    () => ({
      play: () => {
        ensureAudioContext();
        if (videoActiveRef.current) videoRef.current?.play().catch(() => {});
        else sendPlayerCommand("playVideo");
      },
      pause: () => {
        if (videoActiveRef.current) videoRef.current?.pause();
        else sendPlayerCommand("pauseVideo");
      },
      seekTo: (seconds: number) => {
        const target = Math.max(0, seconds);
        if (videoActiveRef.current) {
          if (videoRef.current) videoRef.current.currentTime = target;
        } else {
          sendPlayerCommand("seekTo", [target, true]);
        }
        setCurrentTime(target);
      },
      setVolume: (value: number) => {
        if (videoActiveRef.current) {
          if (videoRef.current) videoRef.current.volume = value / 100;
        } else {
          sendPlayerCommand("setVolume", [value]);
        }
      },
      setMuted: (muted: boolean) => {
        if (videoActiveRef.current) {
          if (videoRef.current) videoRef.current.muted = muted;
        } else {
          sendPlayerCommand(muted ? "mute" : "unMute");
        }
      },
      setRate: (value: number) => {
        if (videoActiveRef.current) {
          if (videoRef.current) videoRef.current.playbackRate = value;
        } else {
          sendPlayerCommand("setPlaybackRate", [value]);
        }
      },
      setCaptions: (on: boolean) => {
        if (videoActiveRef.current) {
          const tracks = videoRef.current?.textTracks;
          if (tracks) {
            for (let i = 0; i < tracks.length; i++) tracks[i].mode = on ? "showing" : "hidden";
          }
        } else {
          sendPlayerCommand(on ? "loadModule" : "unloadModule", ["captions"]);
        }
      },
    }),
    [sendPlayerCommand]
  );

  const resetPlaybackState = useCallback(() => {
    setCurrentTime(0);
    setDuration(0);
    setHasStarted(false);
    setIsBuffering(false);
    setPlaybackError(null);
  }, []);

  /** Resolves DASH manifests for a video from the healthy public instances. */
  const loadNativeSources = useCallback((id: string, session = playbackSessionRef.current) => {
    if (!isPlaybackSessionCurrent(session, id, playbackSessionRef.current.id)) return;
    // One request: the server picks a working instance and returns the validated manifest
    // (CDN-cached), so the player starts without a separate "find sources" round trip.
    setIsBuffering(true);
    setDashUrls([manifestPath(id)]);
  }, []);

  const loadMeta = useCallback((id: string, session = playbackSessionRef.current) => {
    const requestId = session.id;
    fetch(`/api/xyz?id=${id}`, { headers: apiHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || data.error || !isPlaybackSessionCurrent(session, id, playbackSessionRef.current.id)) return;
        if (requestId !== playbackSessionRef.current.id && activeVideoIdRef.current !== id) return;
        setMeta((prev) => ({
          id: data.id || id,
          title: data.title,
          authorName: data.authorName ?? data.channel,
          authorUrl: data.authorUrl ?? data.channelUrl,
          thumbnailUrl: data.thumbnailUrl,
          duration: data.duration,
          description: data.description || prev?.description || "",
          views: data.views || prev?.views,
          uploadedAt: data.uploadedAt || prev?.uploadedAt,
        }));
      })
      .catch(() => {});
  }, []);

  // Details for the first video (server render only knows catalog entries).
  useEffect(() => {
    loadMeta(initialVideoIdRef.current);
  }, [loadMeta]);

  const startPlaybackSession = useCallback((id: string) => {
    const next = createPlaybackSession(id, (playbackSessionRef.current?.attempt ?? 0) + 1);
    playbackSessionRef.current = next;
    return next;
  }, []);

  const playVideoById = useCallback(
    (id: string, known?: XyzVideo, heroOrigin?: HeroOrigin) => {
      ensureAudioContext();
      const session = startPlaybackSession(id);
      setActiveVideoId(id);
      activeVideoIdRef.current = id;
      setHeroFrom(heroOrigin ?? null);
      setStreamUrl(null);
      setIsDismissed(false);
      setIsAutoMinimized(false);
      resetPlaybackState();

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("v", id);
        window.history.replaceState({}, "", url.toString());
      }

      // Show what we already know immediately (from the list item), then refine.
      const fb = getFallbackMeta(id);
      setMeta(
        fb ??
          (known
            ? {
                id,
                title: known.title,
                authorName: known.channel,
                authorUrl: known.channelUrl,
                thumbnailUrl: known.thumbnailUrl,
                duration: known.duration,
                description: known.description,
                views: known.views,
                uploadedAt: known.uploadedAt,
              }
            : null)
      );
      loadMeta(id, session);

      if (playbackModeRef.current === "native") {
        loadNativeSources(id, session);
      } else if (iframeLoadedRef.current) {
        sendPlayerCommand("loadVideoById", [id, 0]);
        sendPlayerCommand("unMute");
        setIsMuted(false);
        if (isAutoplayRef.current) {
          sendPlayerCommand("playVideo");
          setIsPlaying(true);
        }
      }
    },
    [sendPlayerCommand, resetPlaybackState, loadNativeSources, loadMeta, startPlaybackSession]
  );

  // Play a self-hosted HLS (.m3u8) stream through hls.js
  const playStream = useCallback(
    (url: string) => {
      ensureAudioContext();
      sendPlayerCommand("pauseVideo");
      resetPlaybackState();
      setIsPlaying(false);
      setDashUrls(null);
      setStreamUrl(url);
      let title = url;
      let host = "";
      try {
        const parsed = new URL(url);
        host = parsed.host;
        title = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).slice(-2, -1)[0] ?? parsed.pathname);
      } catch {}
      setMeta({
        id: url,
        title: title || "HLS stream",
        authorName: host || "Stream",
        authorUrl: url,
        thumbnailUrl: "",
        duration: "",
        description: "",
      });
    },
    [sendPlayerCommand, resetPlaybackState]
  );

  useHls(videoRef, streamUrl, showToast);

  const onNativeError = useCallback((message: string) => {
    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError(message);
  }, []);
  const onNativeRecovered = useCallback(() => setPlaybackError(null), []);
  const shaka = useShaka(videoRef, streamUrl ? null : dashUrls, {
    autoplay: isAutoplay,
    onError: onNativeError,
    onRecovered: onNativeRecovered,
  });

  const retryPlayback = useCallback(() => {
    const session = startPlaybackSession(activeVideoIdRef.current);
    setPlaybackError(null);
    if (dashUrls) {
      shaka.retry();
      return;
    }
    loadNativeSources(activeVideoIdRef.current, session);
  }, [dashUrls, shaka, loadNativeSources, startPlaybackSession]);

  // Entering native mode (initial load or settings change) resolves sources for the current video;
  // leaving it hands playback back to the iframe.
  useEffect(() => {
    if (streamUrlStateRef.current || view.type !== "watch") return;
    const timer = setTimeout(() => {
      if (playbackMode === "native") loadNativeSources(activeVideoIdRef.current, playbackSessionRef.current);
      else setDashUrls(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [playbackMode, loadNativeSources, view.type]);

  // Read URL search params safely on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v) && v !== initialVideoId) {
      const timer = setTimeout(() => {
        playVideoById(v);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [playVideoById, initialVideoId]);

  // Warm-up on deliberate watch sessions only: no home-page polling or playback setup for browse screens.
  useEffect(() => {
    if (view.type !== "watch") return;
    try {
      preconnectMedia(JSON.parse(readSetting(MEDIA_ORIGINS_KEY) || "[]"));
    } catch {}
    const timer = setTimeout(() => {
      void preloadShaka();
      fetch("/api/xyz/instances")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          preconnectMedia(data?.mediaOrigins);
          if (Array.isArray(data?.mediaOrigins)) localStorage.setItem(MEDIA_ORIGINS_KEY, JSON.stringify(data.mediaOrigins));
        })
        .catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [view.type]);

  // Once a video is playing, quietly fetch the next one's manifest so skipping ahead starts fast
  // (it warms the CDN, and the browser may reuse it for a few minutes).
  useEffect(() => {
    if (!hasStarted || playbackMode !== "native" || streamUrl) return;
    const index = queue.findIndex((v) => v.id === activeVideoId);
    const next = queue[index >= 0 && index < queue.length - 1 ? index + 1 : 0];
    if (!next || next.id === activeVideoId) return;
    const timer = setTimeout(() => {
      fetch(manifestPath(next.id), { priority: "low" }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [hasStarted, playbackMode, streamUrl, queue, activeVideoId]);

  const playNextVideo = useCallback(() => {
    const currentIndex = queue.findIndex((v) => v.id === activeVideoIdRef.current);
    const nextIndex = currentIndex >= 0 && currentIndex < queue.length - 1 ? currentIndex + 1 : 0;
    const nextVideo = queue[nextIndex];
    if (nextVideo) playVideoById(nextVideo.id, nextVideo);
  }, [queue, playVideoById]);

  const playPrevVideo = useCallback(() => {
    const currentIndex = queue.findIndex((v) => v.id === activeVideoIdRef.current);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
    const prevVideo = queue[prevIndex];
    if (prevVideo) playVideoById(prevVideo.id, prevVideo);
  }, [queue, playVideoById]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      if (isMuted && !videoActiveRef.current) {
        engine.setMuted(false);
        setIsMuted(false);
      }
      engine.play();
      setIsPlaying(true);
    }
  }, [isPlaying, isMuted, engine]);

  const toggleMute = useCallback(() => {
    engine.setMuted(!isMuted);
    setIsMuted(!isMuted);
  }, [isMuted, engine]);

  const changeVolume = useCallback(
    (value: number) => {
      engine.setVolume(value);
      setVolumeState(value);
      if (value > 0 && isMuted) {
        engine.setMuted(false);
        setIsMuted(false);
      }
    },
    [engine, isMuted]
  );

  const changeRate = useCallback(
    (value: number) => {
      engine.setRate(value);
      setRateState(value);
    },
    [engine]
  );

  const toggleCaptions = useCallback(() => {
    engine.setCaptions(!captionsOn);
    setCaptionsOn(!captionsOn);
    showToast(captionsOn ? "Captions off" : "Captions on");
  }, [engine, captionsOn, showToast]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      stageRef.current?.requestFullscreen().catch(() => {});
    }
  }, []);

  const toggleMiniPlayer = useCallback(() => {
    setIsDismissed(false);
    if (isAutoMinimized) {
      setIsAutoMinimized(false);
      setIsMinimized(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setIsMinimized((prev) => !prev);
  }, [isAutoMinimized]);

  const seekRelative = useCallback(
    (offsetSeconds: number) => {
      engine.seekTo(currentTimeRef.current + offsetSeconds);
      showToast(offsetSeconds > 0 ? `+${offsetSeconds}s` : `${offsetSeconds}s`);
    },
    [engine, showToast]
  );

  // Keyboard Hotkeys
  useHotkeys({
    onTogglePlay: togglePlay,
    onSeekForward: () => seekRelative(10),
    onSeekBackward: () => seekRelative(-10),
    onNext: playNextVideo,
    onPrev: playPrevVideo,
    onToggleMute: toggleMute,
    onToggleFullscreen: toggleFullscreen,
    onToggleMini: toggleMiniPlayer,
    onOpenCommand: () => headerRef.current?.focusSearch(),
  });

  // MediaSession API integration
  useMediaSession(meta, activeVideoId, {
    onPlay: () => {
      engine.play();
      setIsPlaying(true);
    },
    onPause: () => {
      engine.pause();
      setIsPlaying(false);
    },
    onNext: playNextVideo,
    onPrev: playPrevVideo,
  });

  // Document title sync
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = meta?.title ? `${meta.title} - xyz` : "xyz";
    }
  }, [meta?.title]);

  // postMessage event receiver for YouTube iframe events
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        if (data?.event === "onReady" || data?.info === "onReady") {
          sendPlayerHandshake();
          if (activeVideoIdRef.current && activeVideoIdRef.current !== initialVideoIdRef.current) {
            sendPlayerCommand("loadVideoById", [activeVideoIdRef.current, 0]);
          }
          if (isAutoplayRef.current && !videoActiveRef.current) {
            sendPlayerCommand("playVideo");
            setIsPlaying(true);
          }
        }

        // While the <video> element is active, the (paused) iframe is not the source of truth.
        if (videoActiveRef.current) return;

        // Progress / volume telemetry that drives the custom controls
        if (data?.event === "infoDelivery" && data.info) {
          const info = data.info;
          if (typeof info.currentTime === "number") setCurrentTime(info.currentTime);
          if (typeof info.duration === "number" && info.duration > 0) setDuration(info.duration);
          if (typeof info.volume === "number") setVolumeState(info.volume);
          if (typeof info.muted === "boolean") setIsMuted(info.muted);
          if (typeof info.playbackRate === "number") setRateState(info.playbackRate);
        }

        const playerState =
          data?.event === "onStateChange"
            ? data?.info
            : data?.event === "infoDelivery"
            ? data?.info?.playerState
            : undefined;

        if (playerState === 1) {
          setIsPlaying(true);
          setHasStarted(true);
          setIsBuffering(false);
          ensureAudioContext();
        } else if (playerState === 2) {
          setIsPlaying(false);
        } else if (playerState === 3) {
          setIsBuffering(true);
        } else if (playerState === 0) {
          setIsPlaying(false);
          if (isAutoplayRef.current) {
            const now = Date.now();
            if (now - lastEndedTriggerRef.current > 2000) {
              lastEndedTriggerRef.current = now;
              playNextVideo();
            }
          }
        }
      } catch {
        // ignore non-json messages
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sendPlayerHandshake, sendPlayerCommand, playNextVideo]);

  // <video> events feed the same controls state
  const streamEvents = useMemo(
    () => ({
      onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => setCurrentTime(e.currentTarget.currentTime),
      onDurationChange: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const d = e.currentTarget.duration;
        setDuration(Number.isFinite(d) ? d : 0);
      },
      onPlay: () => {
        setIsPlaying(true);
      },
      onPause: () => setIsPlaying(false),
      onEnded: () => {
        setIsPlaying(false);
        if (isAutoplayRef.current) playNextVideo();
      },
      onVolumeChange: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        setVolumeState(Math.round(e.currentTarget.volume * 100));
        setIsMuted(e.currentTarget.muted);
      },
      onLoadStart: () => setIsBuffering(true),
      onWaiting: () => setIsBuffering(true),
      onSeeking: () => setIsBuffering(true),
      onCanPlay: () => setIsBuffering(false),
      onPlaying: () => {
        setIsBuffering(false);
        setHasStarted(true);
      },
      onSeeked: () => setIsBuffering(false),
    }),
    [playNextVideo]
  );

  // Spinner: while sources resolve (native) and whenever the <video> is loading/buffering.
  const isLoading =
    !playbackError &&
    (isBuffering || (playbackMode === "native" && !streamUrl && dashUrls === null));

  const posterUrl = streamUrl
    ? null
    : meta?.thumbnailUrl || (activeVideoId ? `/api/xyz/thumb/${activeVideoId}` : null);

  /** The stage is a floating mini player rather than the watch surface. */
  const stageMinimized = !isDismissed && (isMinimized || isAutoMinimized || view.type !== "watch");

  const handleIframeLoad = () => {
    iframeLoadedRef.current = true;
    setTimeout(() => {
      sendPlayerHandshake();
      if (activeVideoId !== initialVideoIdRef.current) {
        sendPlayerCommand("loadVideoById", [activeVideoId, 0]);
      }
      if (isAutoplay) {
        sendPlayerCommand("playVideo");
        setIsPlaying(true);
      }
    }, 300);
  };

  const handleCopyLink = () => {
    // Share an in-app link: recipients may be on networks where youtube.com is blocked.
    const appUrl = new URL(window.location.href);
    appUrl.search = "";
    appUrl.searchParams.set("v", activeVideoId);
    const url = streamUrl ?? appUrl.toString();
    navigator.clipboard.writeText(url).catch(() => {});
  };

  const handleSelectChip = (sectionId: string) => {
    const youtubeDiscovery = getHomeContentMode(apiKey, youtubeValidationState, serverYoutubeConfigured) === "youtube";
    setActiveChip(sectionId);

    if (view.type === "home" && typeof window !== "undefined" && window.scrollY > 60) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // 1. Instant cache hit — 0ms switch without tearing down the page
    const cached = youtubeDiscovery && sectionId !== "trending-kh" ? undefined : sectionCacheRef.current.get(sectionId);
    if (cached) {
      setListLoading(false);
      setQueue(cached.items);
      setListNextPage(cached.nextPageToken);
      return;
    }

    // 2. Fetch with gentle in-place loading (keeps current items visible)
    setListNextPage(null);
    const requestId = ++listRequestRef.current;
    setListLoading(true);
    void fetchSection(sectionId).then((page) => {
      if (requestId !== listRequestRef.current) return;
      setListLoading(false);
      const items = page ? page.items : youtubeDiscovery ? [] : XYZ_CATALOG_VIDEOS;
      const nextPageToken = page?.nextPageToken ?? null;
      sectionCacheRef.current.set(sectionId, { items, nextPageToken });
      setQueue(items);
      setListNextPage(nextPageToken);
    });
  };

  const loadMoreSection = () => {
    if (!listNextPage || listLoadingMore) return;
    const requestId = listRequestRef.current;
    setListLoadingMore(true);
    void fetchSection(activeChip, listNextPage).then((page) => {
      setListLoadingMore(false);
      if (requestId !== listRequestRef.current || !page) return;
      setQueue((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        const updated = [...prev, ...page.items.filter((v) => !seen.has(v.id))];
        sectionCacheRef.current.set(activeChip, { items: updated, nextPageToken: page.nextPageToken });
        return updated;
      });
      setListNextPage(page.nextPageToken);
    });
  };

  const searchForQuery = useCallback((input: string, pushHistory = true) => {
    const query = input.trim();
    if (!query) return;
    if (pushHistory) {
      const url = new URL(window.location.href);
      url.searchParams.delete("v");
      url.searchParams.set("q", query);
      window.history.pushState({}, "", url.toString());
    }
    const requestId = ++listRequestRef.current;
    setView({ type: "search", query, results: [], loading: true, error: null });
    window.scrollTo({ top: 0 });
    void fetchVideos(`/api/xyz?q=${encodeURIComponent(query)}`).then(({ videos, errorCode }) => {
      if (requestId !== listRequestRef.current) return;
      setView({
        type: "search",
        query,
        results: videos ?? [],
        loading: false,
        error: errorCode ? searchErrorMessage(errorCode) : null,
      });
    });
  }, []);

  const handleSearch = (input: string) => {
    const hls = parseHlsUrl(input);
    if (hls) {
      listRequestRef.current += 1;
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      url.searchParams.delete("v");
      window.history.pushState({}, "", url.toString());
      setView({ type: "watch" });
      playStream(hls);
      return;
    }
    const parsed = parseXyzUrl(input);
    if (parsed.ok) {
      listRequestRef.current += 1;
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      url.searchParams.set("v", parsed.videoId);
      window.history.pushState({}, "", url.toString());
      setView({ type: "watch" });
      playVideoById(parsed.videoId);
      return;
    }
    searchForQuery(input);
  };

  const openFromSearch = (video: XyzVideo, heroOrigin: HeroOrigin) => {
    if (view.type === "search") {
      setQueue(view.results);
      setActiveChip("");
      const url = new URL(window.location.href);
      url.searchParams.set("q", view.query);
      url.searchParams.set("v", video.id);
      window.history.pushState({}, "", url.toString());
    }
    setView({ type: "watch" });
    window.scrollTo({ top: 0 });
    playVideoById(video.id, video, heroOrigin);
  };

  useEffect(() => {
    if (initialHasVideoQuery) return;
    const query = new URLSearchParams(window.location.search).get("q");
    if (!query) return;
    const timer = setTimeout(() => searchForQuery(query, false), 0);
    return () => clearTimeout(timer);
  }, [initialHasVideoQuery, searchForQuery]);

  useEffect(() => {
    const restoreLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const videoId = params.get("v");
      if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        listRequestRef.current += 1;
        setView({ type: "watch" });
        playVideoById(videoId);
        return;
      }
      const query = params.get("q")?.trim();
      if (query) {
        searchForQuery(query, false);
        return;
      }
      listRequestRef.current += 1;
      setView({ type: "home" });
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [playVideoById, searchForQuery]);

  const handleOpenSettings = () => {
    setTempPlaybackMode(playbackMode);
    setTempApiKey(apiKey);
    setShowApiKey(false);
    setShowSettings(true);
  };

  useEffect(() => {
    if (!showSettings) return;
    const dialog = settingsDialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusTarget = dialog?.querySelector<HTMLElement>("input, button, [tabindex]:not([tabindex='-1'])") ?? null;
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowSettings(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus?.();
    };
  }, [showSettings]);

  const refreshYouTubeHome = (key: string) => {
    if (!key || !YOUTUBE_API_KEY.test(key.trim())) {
      setYoutubeValidationState("idle");
      setYoutubeHomeVideos([]);
      setYoutubeHomeError(key ? "That doesn't look like a valid YouTube API key." : null);
      return;
    }

    userApiKey = key;
    const requestId = ++homeValidationRequestRef.current;
    setYoutubeValidationState("checking");
    setYoutubeHomeError(null);

    void fetchYouTubeHome(key)
      .then(({ videos, errorCode }) => {
        if (requestId !== homeValidationRequestRef.current) return;
        if (!videos) {
          setYoutubeHomeError(youtubeHomeMessage(errorCode ?? "youtube_api_error"));
          setYoutubeValidationState("error");
          setYoutubeHomeVideos([]);
          return;
        }
        if (videos.length === 0) {
          setYoutubeHomeError("YouTube returned no videos for this feed.");
          setYoutubeHomeVideos([]);
          setYoutubeValidationState("ready");
          return;
        }
        setYoutubeHomeError(null);
        setYoutubeHomeVideos(videos);
        setQueue(videos);
        sectionCacheRef.current.set("trending-kh", { items: videos, nextPageToken: null });
        setYoutubeValidationState("ready");
      })
      .catch(() => {
        if (requestId !== homeValidationRequestRef.current) return;
        setYoutubeHomeError("YouTube discovery is temporarily unavailable. Try a different key or retry later.");
        setYoutubeValidationState("error");
        setYoutubeHomeVideos([]);
      });
  };

  // Load persisted settings after hydration; YouTube embed is the default playback surface.
  useEffect(() => {
    const storedMode = readSetting(PLAYBACK_MODE_KEY);
    const storedKey = readSetting(API_KEY_STORAGE);
    const timer = setTimeout(() => {
      if (storedMode === "embed") setPlaybackMode("embed");
      if (YOUTUBE_API_KEY.test(storedKey)) {
        setApiKey(storedKey);
        userApiKey = storedKey;
        setActiveChip("trending-kh");
        setYoutubeValidationState("checking");
        refreshYouTubeHome(storedKey);
      } else {
        void fetchYouTubeHome().then(({ videos, errorCode, origin }) => {
          if (origin !== "youtube") return;
          setServerYoutubeConfigured(true);
          setYoutubeHomeVideos(videos ?? []);
          if (videos) {
            setQueue(videos);
            sectionCacheRef.current.set("trending-kh", { items: videos, nextPageToken: null });
          }
          setActiveChip("trending-kh");
          setYoutubeHomeError(errorCode ? youtubeHomeMessage(errorCode) : null);
          setYoutubeValidationState(errorCode ? "error" : "ready");
        });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const key = tempApiKey.trim();
    if (key && !YOUTUBE_API_KEY.test(key)) {
      setYoutubeValidationState("error");
      setYoutubeHomeError("That doesn't look like a valid YouTube API key.");
      showToast("That doesn't look like a YouTube API key");
      return;
    }
    try {
      localStorage.setItem(PLAYBACK_MODE_KEY, tempPlaybackMode);
      if (key) localStorage.setItem(API_KEY_STORAGE, key);
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch {}
    setApiKey(key);
    userApiKey = key;
    sectionCacheRef.current.clear();
    sectionCacheRef.current.set(DEFAULT_SECTION_ID, { items: XYZ_CATALOG_VIDEOS, nextPageToken: null });
    if (key) setActiveChip("trending-kh");
    else setActiveChip(DEFAULT_SECTION_ID);
    if (!key) {
      homeValidationRequestRef.current += 1;
      setYoutubeHomeVideos([]);
    }
    setYoutubeHomeError(null);
    setYoutubeValidationState(key ? "checking" : "idle");
    if (key) {
      refreshYouTubeHome(key);
    }
    setPlaybackMode(tempPlaybackMode);
    setShowSettings(false);
    showToast(tempPlaybackMode === "native" ? "Using built-in player" : "Using YouTube player");
  };

  const homeMode = getHomeContentMode(apiKey, youtubeValidationState, serverYoutubeConfigured);
  const isYoutubeHomeSection = homeMode === "youtube" && activeChip === "trending-kh";
  const homeVideos = isYoutubeHomeSection ? youtubeHomeVideos : queue;
  const homeLoading = isYoutubeHomeSection ? youtubeValidationState === "checking" : listLoading;
  const homeErrorMessage = isYoutubeHomeSection ? youtubeHomeError : null;

  const upNext = (
    <div className="flex flex-col gap-3">
      <ChipBar active={activeChip} onSelect={handleSelectChip} />
      <UpNextList
        videos={queue}
        activeId={activeVideoId}
        loading={listLoading}
        hasMore={Boolean(listNextPage)}
        loadingMore={listLoadingMore}
        onLoadMore={loadMoreSection}
        onSelect={(video) => {
          playVideoById(video.id, video);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-background text-foreground">
      {heroFrom && posterUrl && !stageMinimized && (
        <HeroFlight
          from={heroFrom}
          targetRef={stageRef}
          src={posterUrl}
          reveal={hasStarted}
          onDone={() => setHeroFrom(null)}
        />
      )}
      <SiteHeader
        ref={headerRef}
        onSearch={handleSearch}
        onOpenSettings={handleOpenSettings}
        onHome={() => {
          listRequestRef.current += 1;
          setView({ type: "home" });
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("v");
            url.searchParams.delete("q");
            window.history.replaceState({}, "", url.pathname);
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      {view.type === "home" && (
        <HomeFeed
          videos={homeVideos}
          activeChip={activeChip}
          onSelectChip={handleSelectChip}
          loading={homeLoading}
          hasMore={isYoutubeHomeSection ? false : Boolean(listNextPage)}
          loadingMore={isYoutubeHomeSection ? false : listLoadingMore}
          onLoadMore={isYoutubeHomeSection ? undefined : loadMoreSection}
          activeVideoId={activeVideoId}
          onSelectVideo={(video, heroOrigin) => {
            setView({ type: "watch" });
            window.scrollTo({ top: 0, behavior: "smooth" });
            playVideoById(video.id, video, heroOrigin);
          }}
          sourceLabel={homeMode === "youtube" ? "YouTube" : undefined}
          emptyMessage={homeErrorMessage ?? undefined}
          emptyIsError={isYoutubeHomeSection && youtubeValidationState === "error"}
        />
      )}

      {view.type === "search" && (
        <SearchResults
          query={view.query}
          videos={view.results}
          loading={view.loading}
          error={view.error}
          activeVideoId={activeVideoId}
          onSelect={openFromSearch}
          onRetry={() => searchForQuery(view.query, false)}
        />
      )}

      {/* Watch page stays mounted during home and search so playback continues (shown as a mini player). */}
      <main
        id="main"
        className={
          view.type !== "watch"
            ? "contents"
            : "mx-auto grid w-full max-w-[1754px] grid-cols-1 gap-x-6 gap-y-3 pb-12 sm:gap-y-4 sm:px-6 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_1fr]"
        }
      >
        <div
          ref={stageContainerRef}
          className={
            view.type !== "watch"
              ? "contents"
              : "lg:col-start-1 lg:row-start-1 aspect-video w-full"
          }
        >
          <AmbientStage
            meta={meta}
            stageRef={stageRef}
            iframeRef={iframeRef}
            videoRef={videoRef}
            embedUrl={playbackMode === "embed" ? initialEmbedUrl : null}
            videoActive={videoActive}
            streamEvents={streamEvents}
            playbackError={playbackError}
            onRetry={retryPlayback}
            onSkip={playNextVideo}
            onIframeLoad={handleIframeLoad}
            isMinimized={stageMinimized}
            heroLanding={heroFrom !== null}
            isHidden={isDismissed || (view.type !== "watch" && !hasStarted && !isPlaying)}
            viewType={view.type}
            onToggleMinimize={() => {
              if (view.type !== "watch") {
                setView({ type: "watch" });
              } else if (isAutoMinimized) {
                // If auto-minimized from scroll, clicking expand scrolls user back up to the video
                window.scrollTo({ top: 0, behavior: "smooth" });
                setIsAutoMinimized(false);
              } else {
                setIsMinimized((prev) => !prev);
              }
            }}
            onClose={() => {
              // YouTube mini player dismiss behavior: pause playback and hide mini player
              engine.pause();
              setIsPlaying(false);
              setIsDismissed(true);
              setIsAutoMinimized(false);
              setIsMinimized(false);
              if (view.type === "watch") {
                setView({ type: "home" });
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("v");
                  window.history.pushState({}, "", url.pathname + url.search);
                }
              }
            }}
            controls={{
              isPlaying,
              hasStarted,
              currentTime,
              duration,
              volume,
              isMuted,
              rate,
              captionsOn,
              isFullscreen,
              posterUrl,
              onTogglePlay: togglePlay,
              onSeek: engine.seekTo,
              onVolume: changeVolume,
              onToggleMute: toggleMute,
              onRate: changeRate,
              onToggleCaptions: toggleCaptions,
              onToggleFullscreen: toggleFullscreen,
              onToggleMini: toggleMiniPlayer,
              onNext: playNextVideo,
              onPrev: playPrevVideo,
              qualities: streamUrl ? [] : shaka.qualities.map((q) => q.height),
              quality: shaka.quality,
              onQuality: shaka.setQuality,
              isLoading,
              concealPaused: !videoActive,
            }}
          />
        </div>

        {view.type === "watch" && (
          <>
            <div className="px-4 sm:px-0 lg:col-start-1 lg:row-start-2">
              <VideoDetails
                meta={meta}
                autoplay={isAutoplay}
                onToggleAutoplay={() => setIsAutoplay((prev) => !prev)}
                onCopyLink={handleCopyLink}
              />
            </div>

            <aside
              aria-label="Up next"
              className="px-4 sm:px-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
            >
              <h2 className="mb-1.5 font-display text-lg font-semibold sm:mb-2">Up next</h2>
              {upNext}
            </aside>

          </>
        )}
      </main>

      {/* Settings Dialog — iOS prominent-modal material (.glass-thick).
          Enters and leaves along the same path: the panel materialises out of
          the scrim and sinks back into it, rather than popping out of existence. */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-[var(--space-4)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING.ui}
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              ref={settingsDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              className="glass-thick w-full max-w-sm rounded-[var(--radius-xl)] p-[var(--space-5)] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.7)]"
              initial={{ opacity: 0.6, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.6, scale: 1.06 }}
              transition={SPRING.sheet}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-[var(--space-3)]">
                <h3
                  id="settings-title"
                  className="text-headline font-semibold tracking-[var(--tracking-headline)]"
                >
                  Settings
                </h3>
                <button
                  type="button"
                  className="interactive tap-compact flex size-9 items-center justify-center rounded-full text-[var(--ios-label-2)] hover:bg-[var(--ios-fill-3)] hover:text-[var(--ios-label)] cursor-pointer"
                  onClick={() => setShowSettings(false)}
                  aria-label="Close settings"
                >
                  <X className="size-4" />
                </button>
              </div>

              <form onSubmit={saveSettings} className="flex flex-col gap-[var(--space-4)] pt-[var(--space-2)]">
                <fieldset className="flex flex-col gap-[var(--space-2)]">
                  <legend className="pb-[var(--space-1)] text-footnote font-semibold uppercase tracking-[0.02em] text-[var(--ios-label-2)]">
                    Playback
                  </legend>
                  <PlaybackOption
                    name="playback-mode"
                    value="native"
                    checked={tempPlaybackMode === "native"}
                    onChange={() => setTempPlaybackMode("native")}
                    title="Built-in player"
                    detail="Works where YouTube is blocked."
                  />
                  <PlaybackOption
                    name="playback-mode"
                    value="embed"
                    checked={tempPlaybackMode === "embed"}
                    onChange={() => setTempPlaybackMode("embed")}
                    title="YouTube player"
                    detail="Needs access to YouTube."
                  />
                </fieldset>

                <fieldset className="flex flex-col gap-[var(--space-2)]">
                  <legend className="pb-[var(--space-1)] text-footnote font-semibold uppercase tracking-[0.02em] text-[var(--ios-label-2)]">
                    Discovery
                  </legend>
                  <label htmlFor="api-key-input" className="text-callout font-medium tracking-[var(--tracking-callout)]">
                    YouTube API key <span className="font-normal text-[var(--ios-label-2)]">(optional)</span>
                  </label>
                  <div className="relative">
                    <Input
                      id="api-key-input"
                      type={showApiKey ? "text" : "password"}
                      autoComplete="new-password"
                      spellCheck={false}
                      placeholder="AIza..."
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      className="bg-[var(--ios-fill-3)] pr-12 font-mono text-callout backdrop-blur-sm"
                    />
                    <button
                      type="button"
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
                      aria-pressed={showApiKey}
                      onClick={() => setShowApiKey((visible) => !visible)}
                      className="interactive tap-compact absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-full text-[var(--ios-label-2)] hover:text-[var(--ios-label)] cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-footnote tracking-[var(--tracking-footnote)] text-[var(--ios-label-2)]">
                    Powers discovery, search, and video details in either playback mode.
                  </p>
                </fieldset>

                <div className="flex items-center justify-end gap-[var(--space-2)] pt-[var(--space-1)]">
                  <button
                    type="button"
                    className="interactive flex h-[var(--space-tap)] items-center justify-center rounded-[var(--radius-md)] px-[var(--space-4)] text-body font-medium tracking-[var(--tracking-body)] text-[var(--ios-blue)] cursor-pointer"
                    onClick={() => setShowSettings(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary interactive cursor-pointer">
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            role="status"
            className="glass-regular fixed bottom-6 left-1/2 z-50 rounded-[var(--radius-lg)] px-[var(--space-4)] py-[var(--space-2)] text-callout tracking-[var(--tracking-callout)] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]"
            initial={{ opacity: 0, x: "-50%", y: 20 }}
            animate={{ opacity: 1, x: "-50%", y: 0 }}
            exit={{ opacity: 0, x: "-50%", y: 20 }}
            transition={SPRING.ui}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
