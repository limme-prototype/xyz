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
import { useAudioKeepalive, ensureAudioContext } from "@/lib/hooks/use-audio-keepalive";
import { useMediaSession } from "@/lib/hooks/use-media-session";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { useHls } from "@/lib/hooks/use-hls";
import { preloadShaka, useShaka } from "@/lib/hooks/use-shaka";
import { preconnect } from "react-dom";
import { SiteHeader, type SiteHeaderHandle } from "./site-header";
import { AmbientStage } from "./ambient-stage";
import { VideoDetails } from "./video-details";
import { ChipBar, SearchResults, UpNextList } from "./video-list";
import { DEFAULT_SECTION_ID } from "@/lib/content/sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

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
const YOUTUBE_API_KEY = /^AIza[0-9A-Za-z_-]{35}$/;

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
    const res = await fetch(`/api/xyz/sections/${encodeURIComponent(id)}${qs}`);
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

async function fetchVideos(url: string): Promise<XyzVideo[] | null> {
  try {
    const res = await fetch(url, { headers: apiHeaders() });
    const data = res.ok ? await res.json() : null;
    return Array.isArray(data?.results) ? (data.results as XyzVideo[]) : null;
  } catch {
    return null;
  }
}

interface XyzPlayerProps {
  initialVideoId?: string;
}

type View = { type: "watch" } | { type: "search"; query: string; results: XyzVideo[]; loading: boolean };

export function XyzPlayer({ initialVideoId = DEFAULT_VIDEO_ID }: XyzPlayerProps) {
  useAudioKeepalive();

  // Consistent SSR & Client initial state using server-passed initialVideoId
  const [activeVideoId, setActiveVideoId] = useState<string>(initialVideoId);
  const [meta, setMeta] = useState<VideoMeta | null>(() => getFallbackMeta(initialVideoId));
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAutoplay, setIsAutoplay] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [queue, setQueue] = useState<XyzVideo[]>(XYZ_CATALOG_VIDEOS);
  const [activeChip, setActiveChip] = useState<string>(DEFAULT_SECTION_ID);
  const [listLoading, setListLoading] = useState<boolean>(false);
  const [listNextPage, setListNextPage] = useState<string | null>(null);
  const [listLoadingMore, setListLoadingMore] = useState<boolean>(false);
  const [view, setView] = useState<View>({ type: "watch" });

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
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("native");
  const [dashUrls, setDashUrls] = useState<string[] | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Settings
  const [tempPlaybackMode, setTempPlaybackMode] = useState<PlaybackMode>("native");
  const [apiKey, setApiKey] = useState<string>("");
  const [tempApiKey, setTempApiKey] = useState<string>("");

  const headerRef = useRef<SiteHeaderHandle>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeVideoIdRef = useRef(activeVideoId);
  const initialVideoIdRef = useRef(initialVideoId);
  const isAutoplayRef = useRef(isAutoplay);
  const videoActiveRef = useRef<boolean>(true);
  const streamUrlStateRef = useRef<string | null>(null);
  const playbackModeRef = useRef<PlaybackMode>("native");
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

  // The <video> element is the playback surface for HLS streams and for native (DASH) mode.
  const videoActive = Boolean(streamUrl) || playbackMode === "native";

  // The key only applies to the YouTube player; the built-in player never relies on Google.
  useEffect(() => {
    userApiKey = playbackMode === "embed" ? apiKey : "";
  }, [playbackMode, apiKey]);

  useEffect(() => {
    videoActiveRef.current = videoActive;
    playbackModeRef.current = playbackMode;
  }, [videoActive, playbackMode]);

  // Load persisted settings after hydration (server render always assumes native mode).
  useEffect(() => {
    const storedMode = readSetting(PLAYBACK_MODE_KEY);
    const storedKey = readSetting(API_KEY_STORAGE);
    const timer = setTimeout(() => {
      if (storedMode === "embed") setPlaybackMode("embed");
      if (YOUTUBE_API_KEY.test(storedKey)) setApiKey(storedKey);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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
  const loadNativeSources = useCallback((id: string) => {
    // One request: the server picks a working instance and returns the validated manifest
    // (CDN-cached), so the player starts without a separate "find sources" round trip.
    setIsBuffering(true);
    setDashUrls([manifestPath(id)]);
  }, []);

  const loadMeta = useCallback((id: string) => {
    fetch(`/api/xyz?id=${id}`, { headers: apiHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || data.error || activeVideoIdRef.current !== id) return;
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

  const playVideoById = useCallback(
    (id: string, known?: XyzVideo) => {
      ensureAudioContext();
      setActiveVideoId(id);
      activeVideoIdRef.current = id;
      setStreamUrl(null);
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
      loadMeta(id);

      if (playbackModeRef.current === "native") {
        loadNativeSources(id);
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
    [sendPlayerCommand, resetPlaybackState, loadNativeSources, loadMeta]
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
    setPlaybackError(null);
    if (dashUrls) shaka.retry();
    else loadNativeSources(activeVideoIdRef.current);
  }, [dashUrls, shaka, loadNativeSources]);

  // Entering native mode (initial load or settings change) resolves sources for the current video;
  // leaving it hands playback back to the iframe.
  useEffect(() => {
    if (streamUrlStateRef.current) return;
    const timer = setTimeout(() => {
      if (playbackMode === "native") loadNativeSources(activeVideoIdRef.current);
      else setDashUrls(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [playbackMode, loadNativeSources]);

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

  // Warm-up on load: Shaka's chunk, and connections to the media servers (last known first).
  useEffect(() => {
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
  }, []);

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
    onToggleMini: () => setIsMinimized((prev) => !prev),
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
        setHasStarted(true);
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
      onPlaying: () => setIsBuffering(false),
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
    setActiveChip(sectionId);
    setListNextPage(null);
    const requestId = ++listRequestRef.current;
    if (sectionId === DEFAULT_SECTION_ID) {
      setListLoading(false);
      setQueue(XYZ_CATALOG_VIDEOS);
      return;
    }
    setListLoading(true);
    void fetchSection(sectionId).then((page) => {
      if (requestId !== listRequestRef.current) return;
      setListLoading(false);
      setQueue(page && page.items.length > 0 ? page.items : XYZ_CATALOG_VIDEOS);
      setListNextPage(page?.nextPageToken ?? null);
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
        return [...prev, ...page.items.filter((v) => !seen.has(v.id))];
      });
      setListNextPage(page.nextPageToken);
    });
  };

  const handleSearch = (input: string) => {
    const hls = parseHlsUrl(input);
    if (hls) {
      setView({ type: "watch" });
      playStream(hls);
      return;
    }
    const parsed = parseXyzUrl(input);
    if (parsed.ok) {
      setView({ type: "watch" });
      playVideoById(parsed.videoId);
      return;
    }
    const requestId = ++listRequestRef.current;
    setView({ type: "search", query: input, results: [], loading: true });
    window.scrollTo({ top: 0 });
    void fetchVideos(`/api/xyz?q=${encodeURIComponent(input)}`).then((results) => {
      if (requestId !== listRequestRef.current) return;
      setView({ type: "search", query: input, results: results ?? [], loading: false });
    });
  };

  const openFromSearch = (video: XyzVideo) => {
    if (view.type === "search") {
      setQueue(view.results);
      setActiveChip("");
    }
    setView({ type: "watch" });
    window.scrollTo({ top: 0 });
    playVideoById(video.id, video);
  };

  const handleOpenSettings = () => {
    setTempPlaybackMode(playbackMode);
    setTempApiKey(apiKey);
    setShowSettings(true);
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const key = tempApiKey.trim();
    if (tempPlaybackMode === "embed" && key && !YOUTUBE_API_KEY.test(key)) {
      showToast("That doesn't look like a YouTube API key");
      return;
    }
    try {
      localStorage.setItem(PLAYBACK_MODE_KEY, tempPlaybackMode);
      if (tempPlaybackMode === "embed") {
        if (key) localStorage.setItem(API_KEY_STORAGE, key);
        else localStorage.removeItem(API_KEY_STORAGE);
      }
    } catch {}
    if (tempPlaybackMode === "embed") setApiKey(key);
    setPlaybackMode(tempPlaybackMode);
    setShowSettings(false);
    showToast(tempPlaybackMode === "native" ? "Using built-in player" : "Using YouTube player");
  };

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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader
        ref={headerRef}
        onSearch={handleSearch}
        onOpenSettings={handleOpenSettings}
        onHome={() => setView({ type: "watch" })}
      />

      {view.type === "search" && (
        <SearchResults query={view.query} videos={view.results} loading={view.loading} onSelect={openFromSearch} />
      )}

      {/* Watch page stays mounted during search so playback continues (shown as a mini player). */}
      <main
        id="main"
        className={
          view.type === "search"
            ? "contents"
            : "mx-auto grid w-full max-w-[1754px] grid-cols-1 gap-x-6 gap-y-4 pb-12 sm:px-6 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_1fr]"
        }
      >
        <div className="lg:col-start-1 lg:row-start-1">
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
            isMinimized={isMinimized || view.type === "search"}
            onToggleMinimize={() => {
              if (view.type === "search") setView({ type: "watch" });
              else setIsMinimized((prev) => !prev);
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
              <h2 className="mb-2 font-display text-lg font-semibold">Up next</h2>
              {upNext}
            </aside>

          </>
        )}
      </main>

      {/* Settings Dialog */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            className="w-full max-w-sm rounded-xl bg-popover p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3">
              <h3 id="settings-title" className="text-base font-medium">Settings</h3>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={saveSettings} className="flex flex-col gap-4 pt-2">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Playback</legend>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="playback-mode"
                    className="mt-1"
                    checked={tempPlaybackMode === "native"}
                    onChange={() => setTempPlaybackMode("native")}
                  />
                  <span>
                    Built-in player
                    <span className="block text-xs text-muted-foreground">Works where YouTube is blocked.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="playback-mode"
                    className="mt-1"
                    checked={tempPlaybackMode === "embed"}
                    onChange={() => setTempPlaybackMode("embed")}
                  />
                  <span>
                    YouTube player
                    <span className="block text-xs text-muted-foreground">Needs access to YouTube.</span>
                  </span>
                </label>
              </fieldset>

              {tempPlaybackMode === "embed" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="api-key-input" className="text-sm font-medium">
                    YouTube API key <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    id="api-key-input"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="AIza..."
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    className="h-9 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Used for search and video details.</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" className="rounded-[10px]" onClick={() => setShowSettings(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="rounded-[10px]">
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border bg-popover px-4 py-2.5 text-sm shadow-2xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
