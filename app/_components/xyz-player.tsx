"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_VIDEO_ID,
  XYZ_CATALOG_VIDEOS,
  XyzVideo,
  getXyzEmbedUrl,
  getXyzWatchUrl,
  parseXyzUrl,
} from "@/lib/xyz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  X,
  Settings2,
  Copy,
  Check,
  Minimize2,
  Maximize2,
  SkipForward,
  SkipBack,
  Play,
  Loader2,
  ChevronDown,
} from "lucide-react";

interface VideoMeta {
  id: string;
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  duration: string;
  description: string;
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
  };
}

// Web Audio Keep-Alive for continuous background tab playback
let audioCtxInstance: AudioContext | null = null;
let silentOscInstance: OscillatorNode | null = null;
let silentGainInstance: GainNode | null = null;

function ensureAudioContext() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioCtxInstance) {
      audioCtxInstance = new AudioCtx();
    }

    if (audioCtxInstance.state === "suspended") {
      audioCtxInstance.resume().catch(() => {});
    }

    if (!silentOscInstance && audioCtxInstance.state === "running") {
      silentGainInstance = audioCtxInstance.createGain();
      silentGainInstance.gain.setValueAtTime(0.00001, audioCtxInstance.currentTime);

      silentOscInstance = audioCtxInstance.createOscillator();
      silentOscInstance.frequency.setValueAtTime(440, audioCtxInstance.currentTime);
      silentOscInstance.connect(silentGainInstance);
      silentGainInstance.connect(audioCtxInstance.destination);
      silentOscInstance.start();
    }
  } catch {
    // Ignore if audio context cannot be initialized without gesture
  }
}

export function XyzPlayer() {
  const [activeVideoId, setActiveVideoId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    }
    return DEFAULT_VIDEO_ID;
  });
  const [inputVal, setInputVal] = useState<string>("");
  const [meta, setMeta] = useState<VideoMeta | null>(() =>
    getFallbackMeta(DEFAULT_VIDEO_ID)
  );
  const [error, setError] = useState<string>("");

  // Search & autocomplete
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestIndex, setSelectedSuggestIndex] = useState<number>(-1);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<XyzVideo[] | null>(null);
  const [searchQueryLabel, setSearchQueryLabel] = useState<string>("");
  const [searchPage, setSearchPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [autoplay, setAutoplay] = useState(true);
  const [isAutoplay, setIsAutoplay] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [origin] = useState<string>(() =>
    typeof window !== "undefined" ? window.location.origin : ""
  );

  const initialEmbedIdRef = useRef(activeVideoId);
  const iframeLoadedRef = useRef(false);
  const initialEmbedUrl = useRef(
    getXyzEmbedUrl(initialEmbedIdRef.current, true, origin)
  ).current;

  // Unlock AudioContext on first user interaction anywhere on page
  useEffect(() => {
    const unlockAudio = () => {
      ensureAudioContext();
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  // Settings for custom API key
  const [savedApiKey, setSavedApiKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("xyz_api_key") || "";
    } catch {
      return "";
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastEndedTriggerRef = useRef<number>(0);

  // Keep refs updated to prevent stale closures in event listeners
  const isAutoplayRef = useRef(isAutoplay);
  useEffect(() => {
    isAutoplayRef.current = isAutoplay;
  }, [isAutoplay]);

  const activeVideoIdRef = useRef(activeVideoId);
  useEffect(() => {
    activeVideoIdRef.current = activeVideoId;
  }, [activeVideoId]);

  const displayedVideos = searchResults ?? XYZ_CATALOG_VIDEOS;
  const displayedVideosRef = useRef(displayedVideos);
  useEffect(() => {
    displayedVideosRef.current = displayedVideos;
  }, [displayedVideos]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function sendIframeMessage(msg: Record<string, unknown>) {
    try {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    } catch {
      // ignore
    }
  }

  function sendPlayerCommand(func: string, args: unknown[] = []) {
    sendIframeMessage({
      event: "command",
      func,
      args,
    });
  }

  function sendPlayerHandshake() {
    sendIframeMessage({ event: "listening" });
    sendPlayerCommand("addEventListener", ["onStateChange"]);
    sendPlayerCommand("addEventListener", ["infoDelivery"]);
  }

  const sendPlayerCommandRef = useRef(sendPlayerCommand);
  useEffect(() => {
    sendPlayerCommandRef.current = sendPlayerCommand;
  });

  const sendPlayerHandshakeRef = useRef(sendPlayerHandshake);
  useEffect(() => {
    sendPlayerHandshakeRef.current = sendPlayerHandshake;
  });

  function playNextVideo() {
    ensureAudioContext();
    const list = displayedVideosRef.current;
    if (!list.length) return;
    const currentIndex = list.findIndex((v) => v.id === activeVideoIdRef.current);
    const nextIndex =
      currentIndex >= 0 && currentIndex + 1 < list.length ? currentIndex + 1 : 0;
    const nextVideo = list[nextIndex];
    if (nextVideo) {
      handleSelectVideo(nextVideo);
      showToast(`Playing next: ${nextVideo.title}`);
    }
  }

  const playNextVideoRef = useRef(playNextVideo);
  useEffect(() => {
    playNextVideoRef.current = playNextVideo;
  });

  function playPrevVideo() {
    ensureAudioContext();
    const list = displayedVideosRef.current;
    if (!list.length) return;
    const currentIndex = list.findIndex((v) => v.id === activeVideoIdRef.current);
    const prevIndex =
      currentIndex > 0 ? currentIndex - 1 : list.length - 1;
    const prevVideo = list[prevIndex];
    if (prevVideo) {
      handleSelectVideo(prevVideo);
      showToast(`Playing: ${prevVideo.title}`);
    }
  }

  const playPrevVideoRef = useRef(playPrevVideo);
  useEffect(() => {
    playPrevVideoRef.current = playPrevVideo;
  });

  function handleSelectVideo(video: XyzVideo) {
    ensureAudioContext();
    setActiveVideoId(video.id);
    setMeta({
      id: video.id,
      title: video.title,
      authorName: video.channel,
      authorUrl: video.channelUrl,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      description: video.description,
    });
    setError("");
    setAutoplay(true);
    setShowFullDesc(false);
    setIsMinimized(false);

    // Immediately load & play video in persistent player (no iframe destruction)
    sendPlayerHandshake();
    sendPlayerCommand("loadVideoById", [video.id, 0]);
    sendPlayerCommand("playVideo");

    // Multi-stage trigger to ensure playback starts smoothly even on slow networks
    setTimeout(() => {
      sendPlayerHandshake();
      sendPlayerCommand("loadVideoById", [video.id, 0]);
      sendPlayerCommand("playVideo");
    }, 200);
    setTimeout(() => {
      sendPlayerCommand("playVideo");
    }, 600);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("v", video.id);
      window.history.replaceState({}, "", url.toString());
      if (document.visibilityState === "visible") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }

  // Keyboard shortcut: '/' to focus search, 'Escape' to dismiss, 'm' to toggle minimize
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput = ["INPUT", "TEXTAREA"].includes(
        document.activeElement?.tagName || ""
      );

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        if (isSuggestOpen) {
          setIsSuggestOpen(false);
          searchInputRef.current?.blur();
        } else if (isMinimized) {
          setIsMinimized(false);
        }
      } else if (e.key.toLowerCase() === "m" && !isInput) {
        e.preventDefault();
        setIsMinimized((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSuggestOpen, isMinimized]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Autocomplete debounce
  useEffect(() => {
    const trimmed = inputVal.trim();
    if (trimmed.length < 2 || trimmed.startsWith("http")) {
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/xyz?suggest=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.suggestions?.length) {
            setSuggestions(data.suggestions);
            setIsSuggestOpen(true);
          } else {
            setSuggestions([]);
            setIsSuggestOpen(false);
          }
        })
        .catch(() => {
          setSuggestions([]);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [inputVal]);

  // Load video metadata
  useEffect(() => {
    let ignore = false;

    fetch(`/api/xyz?id=${activeVideoId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: VideoMeta | null) => {
        if (!ignore && data?.title) {
          setMeta(data);
          setError("");
        }
      })
      .catch(() => {
        if (!ignore) {
          const fallback =
            getFallbackMeta(activeVideoId) ||
            displayedVideosRef.current.find((v) => v.id === activeVideoId);
          if (fallback) {
            setMeta({
              id: fallback.id,
              title: fallback.title,
              authorName:
                "authorName" in fallback
                  ? (fallback as VideoMeta).authorName
                  : (fallback as XyzVideo).channel || "Creator",
              authorUrl:
                "authorUrl" in fallback
                  ? (fallback as VideoMeta).authorUrl
                  : (fallback as XyzVideo).channelUrl || "",
              thumbnailUrl: fallback.thumbnailUrl,
              duration: fallback.duration || "Video",
              description: fallback.description || "",
            });
          }
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeVideoId]);

  // Load live recommendations dynamically for the current track
  useEffect(() => {
    let ignore = false;

    if (!searchQueryLabel) {
      fetch(`/api/xyz?related=${activeVideoId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data?.results?.length) {
            setSearchResults(data.results);
          }
        })
        .catch(() => {});
    }

    return () => {
      ignore = true;
    };
  }, [activeVideoId, searchQueryLabel]);

  // MediaSession API for OS background controls (taskbar, lock screen, keyboard multimedia keys)
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: meta?.title || "xyz Player",
        artist: meta?.authorName || "xyz",
        album: "xyz Player",
        artwork: [
          {
            src: meta?.thumbnailUrl || `/api/xyz?thumb=${activeVideoId}`,
            sizes: "512x512",
            type: "image/jpeg",
          },
          {
            src: `https://i.ytimg.com/vi/${activeVideoId}/hqdefault.jpg`,
            sizes: "480x360",
            type: "image/jpeg",
          },
        ],
      });

      navigator.mediaSession.setActionHandler("play", () => {
        sendPlayerCommandRef.current("playVideo");
        try {
          navigator.mediaSession.playbackState = "playing";
        } catch {}
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        sendPlayerCommandRef.current("pauseVideo");
        try {
          navigator.mediaSession.playbackState = "paused";
        } catch {}
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        playNextVideoRef.current();
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        playPrevVideoRef.current();
      });

      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          sendPlayerCommandRef.current("seekTo", [details.seekTime, true]);
        }
      });
    } catch {
      // ignore
    }
  }, [meta, activeVideoId]);

  // Synchronize browser tab title like YouTube
  useEffect(() => {
    if (typeof document !== "undefined") {
      if (meta?.title) {
        document.title = `${meta.title} - xyz`;
      } else {
        document.title = "xyz - Video Player";
      }
    }
  }, [meta?.title]);

  // Comprehensive Autoplay Detection & Event Handling
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        // 1. Ready event: Handshake & immediate play if autoplay active
        if (data?.event === "onReady" || data?.info === "onReady") {
          sendPlayerHandshakeRef.current();
          if (
            activeVideoIdRef.current &&
            activeVideoIdRef.current !== initialEmbedIdRef.current
          ) {
            sendPlayerCommandRef.current("loadVideoById", [
              activeVideoIdRef.current,
              0,
            ]);
          }
          if (isAutoplayRef.current) {
            sendPlayerCommandRef.current("playVideo");
          }
        }

        // 2. Extract player state
        const playerState =
          data?.event === "onStateChange"
            ? data?.info
            : data?.event === "infoDelivery"
            ? data?.info?.playerState
            : undefined;

        // 1 = PLAYING
        if (playerState === 1) {
          ensureAudioContext();
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            try {
              navigator.mediaSession.playbackState = "playing";
            } catch {}
          }
        }

        // 2 = PAUSED
        if (playerState === 2) {
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            try {
              navigator.mediaSession.playbackState = "paused";
            } catch {}
          }
        }

        // 0 = ENDED (advance to next video)
        if (playerState === 0) {
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            try {
              navigator.mediaSession.playbackState = "none";
            } catch {}
          }
          if (isAutoplayRef.current) {
            const now = Date.now();
            if (now - lastEndedTriggerRef.current > 2000) {
              lastEndedTriggerRef.current = now;
              playNextVideoRef.current();
            }
          }
        }

        // 5 = CUED: start playing if autoplay enabled
        if (playerState === 5 && isAutoplayRef.current) {
          sendPlayerCommandRef.current("playVideo");
        }

        // 3. Fallback: duration-based ended check
        if (data?.event === "infoDelivery" && data?.info) {
          const { currentTime, duration } = data.info;
          if (
            typeof currentTime === "number" &&
            typeof duration === "number" &&
            duration > 5 &&
            currentTime >= duration - 0.7
          ) {
            if (isAutoplayRef.current) {
              const now = Date.now();
              if (now - lastEndedTriggerRef.current > 2000) {
                lastEndedTriggerRef.current = now;
                playNextVideoRef.current();
              }
            }
          }
        }
      } catch {
        // ignore non-json messages
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Periodic heartbeat while autoplay is enabled to guarantee sync
  useEffect(() => {
    if (!isAutoplay) return;

    const timer = setInterval(() => {
      sendPlayerHandshakeRef.current();
      sendPlayerCommandRef.current("getCurrentTime");
      sendPlayerCommandRef.current("getDuration");
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoplay, activeVideoId]);

  // IFrame load handshake to start playback & subscribe to events
  function handleIframeLoad() {
    iframeLoadedRef.current = true;
    sendPlayerHandshake();
    if (
      activeVideoIdRef.current &&
      activeVideoIdRef.current !== initialEmbedIdRef.current
    ) {
      sendPlayerCommand("loadVideoById", [activeVideoIdRef.current, 0]);
    }
    if (autoplay || isAutoplayRef.current) {
      sendPlayerCommand("playVideo");
      setTimeout(() => {
        sendPlayerCommand("playVideo");
      }, 300);
      setTimeout(() => {
        sendPlayerCommand("playVideo");
      }, 800);
    }
  }

  async function executeSearch(query: string) {
    setIsSuggestOpen(false);
    setSelectedSuggestIndex(-1);
    setError("");
    searchInputRef.current?.blur();
    const q = query.trim();
    if (!q) return;

    // Direct link: only parse if input looks like a URL
    const isUrl =
      /^https?:\/\//i.test(q) ||
      q.includes("youtube.com") ||
      q.includes("youtu.be");

    if (isUrl) {
      const parseRes = parseXyzUrl(q);
      if (parseRes.ok) {
        const fallbackMeta =
          getFallbackMeta(parseRes.videoId) ||
          displayedVideosRef.current.find((v) => v.id === parseRes.videoId);
        const directVideo: XyzVideo = {
          id: parseRes.videoId,
          title: fallbackMeta?.title || "Video",
          channel:
            fallbackMeta && "authorName" in fallbackMeta
              ? (fallbackMeta as VideoMeta).authorName
              : (fallbackMeta as XyzVideo)?.channel || "Creator",
          channelUrl:
            fallbackMeta && "authorUrl" in fallbackMeta
              ? (fallbackMeta as VideoMeta).authorUrl
              : (fallbackMeta as XyzVideo)?.channelUrl || "",
          duration: fallbackMeta?.duration || "Video",
          views: "",
          uploadedAt: "",
          category: "General",
          thumbnailUrl: `/api/xyz?thumb=${parseRes.videoId}`,
          description: fallbackMeta?.description || "",
        };
        handleSelectVideo(directVideo);
        setError("");
        setSearchResults(null);
        setSearchQueryLabel("");
        setSearchPage(1);
        setHasMore(false);
        return;
      }
    }

    setSearchPage(1);
    setHasMore(true);

    // Live search
    try {
      const keyParam = savedApiKey
        ? `&key=${encodeURIComponent(savedApiKey)}`
        : "";
      const res = await fetch(
        `/api/xyz?q=${encodeURIComponent(q)}&page=1${keyParam}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          setSearchResults(data.results);
          setSearchQueryLabel(q);
          setHasMore(data.hasMore ?? data.results.length >= 8);
          setError("");
          handleSelectVideo(data.results[0]);
          showToast(`Playing: ${data.results[0].title}`);
          return;
        }
      }
    } catch {
      // ignore
    }

    // Fallback catalog search
    const qLower = q.toLowerCase();
    const matched = XYZ_CATALOG_VIDEOS.filter(
      (v) =>
        v.title.toLowerCase().includes(qLower) ||
        v.channel.toLowerCase().includes(qLower) ||
        v.description.toLowerCase().includes(qLower)
    );

    if (matched.length > 0) {
      setSearchResults(matched);
      setSearchQueryLabel(q);
      setHasMore(false);
      setError("");
      handleSelectVideo(matched[0]);
      showToast(`Playing: ${matched[0].title}`);
    } else {
      setError(`No videos found matching "${q}".`);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const queryToSearch =
      isSuggestOpen &&
      selectedSuggestIndex >= 0 &&
      selectedSuggestIndex < suggestions.length
        ? suggestions[selectedSuggestIndex]
        : inputVal;
    setIsSuggestOpen(false);
    setSelectedSuggestIndex(-1);
    setError("");
    searchInputRef.current?.blur();
    executeSearch(queryToSearch);
  }

  function handleSelectSuggestion(s: string) {
    setInputVal(s);
    setIsSuggestOpen(false);
    setSelectedSuggestIndex(-1);
    setError("");
    searchInputRef.current?.blur();
    executeSearch(s);
  }

  // Scroll active suggestion into view when navigating with arrow keys
  useEffect(() => {
    if (selectedSuggestIndex >= 0) {
      const el = document.getElementById(`suggest-item-${selectedSuggestIndex}`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedSuggestIndex]);

  function clearSearchFilter() {
    setSearchQueryLabel("");
    setInputVal("");
    setError("");
    setSearchPage(1);
    setHasMore(true);
    fetch(`/api/xyz?related=${activeVideoId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.results?.length) {
          setSearchResults(data.results);
          setHasMore(data.hasMore ?? false);
        } else {
          setSearchResults(null);
        }
      })
      .catch(() => {
        setSearchResults(null);
      });
  }

  async function loadMoreVideos() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = searchPage + 1;

    try {
      const keyParam = savedApiKey
        ? `&key=${encodeURIComponent(savedApiKey)}`
        : "";
      const endpoint =
        searchQueryLabel && searchQueryLabel !== "Trending"
          ? `/api/xyz?q=${encodeURIComponent(searchQueryLabel)}&page=${nextPage}${keyParam}`
          : `/api/xyz?feed=trending&page=${nextPage}${keyParam}`;

      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        const incoming: XyzVideo[] = data?.results || [];
        if (incoming.length > 0) {
          const currentList = displayedVideosRef.current || [];
          const existingIds = new Set(currentList.map((v) => v.id));
          const freshItems = incoming.filter((v) => !existingIds.has(v.id));

          if (freshItems.length > 0) {
            setSearchResults((prev) => [...(prev ?? XYZ_CATALOG_VIDEOS), ...freshItems]);
            setSearchPage(nextPage);
            setHasMore(data.hasMore ?? incoming.length >= 8);
            showToast(`Loaded ${freshItems.length} more videos`);
          } else {
            setHasMore(false);
            showToast("No more videos available");
          }
        } else {
          setHasMore(false);
          showToast("No more videos available");
        }
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }

  function handleCopyLink() {
    const url = getXyzWatchUrl(activeVideoId);
    navigator.clipboard.writeText(url);
    setCopied(true);
    showToast("Link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  function openSettings() {
    setTempApiKey(savedApiKey);
    setShowSettings(true);
  }

  function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const cleanKey = tempApiKey.trim();
    setSavedApiKey(cleanKey);
    try {
      if (cleanKey) {
        localStorage.setItem("xyz_api_key", cleanKey);
      } else {
        localStorage.removeItem("xyz_api_key");
      }
    } catch {
      // ignore
    }
    setShowSettings(false);
    showToast(cleanKey ? "Key saved" : "Default search restored");
  }

  return (
    <>
      {/* 1. Sticky Header with Search Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
          {/* Sticky Search Bar & Suggestions */}
          <div ref={searchContainerRef} className="relative flex-1 max-w-md sm:max-w-xl md:max-w-2xl">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 sm:gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground sm:left-3 sm:size-4" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search Google YouTube / xyz... (press /)"
                  value={inputVal}
                  onFocus={() => {
                    if (suggestions.length > 0) setIsSuggestOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" && isSuggestOpen && suggestions.length > 0) {
                      e.preventDefault();
                      const nextIdx =
                        selectedSuggestIndex < suggestions.length - 1
                          ? selectedSuggestIndex + 1
                          : 0;
                      setSelectedSuggestIndex(nextIdx);
                      if (suggestions[nextIdx]) {
                        setInputVal(suggestions[nextIdx]);
                      }
                      return;
                    }
                    if (e.key === "ArrowUp" && isSuggestOpen && suggestions.length > 0) {
                      e.preventDefault();
                      const prevIdx =
                        selectedSuggestIndex > 0
                          ? selectedSuggestIndex - 1
                          : suggestions.length - 1;
                      setSelectedSuggestIndex(prevIdx);
                      if (suggestions[prevIdx]) {
                        setInputVal(suggestions[prevIdx]);
                      }
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const queryToSearch =
                        isSuggestOpen &&
                        selectedSuggestIndex >= 0 &&
                        selectedSuggestIndex < suggestions.length
                          ? suggestions[selectedSuggestIndex]
                          : inputVal;
                      setIsSuggestOpen(false);
                      setSelectedSuggestIndex(-1);
                      setError("");
                      searchInputRef.current?.blur();
                      executeSearch(queryToSearch);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setIsSuggestOpen(false);
                      setSelectedSuggestIndex(-1);
                      searchInputRef.current?.blur();
                      return;
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInputVal(val);
                    setSelectedSuggestIndex(-1);
                    if (error) setError("");
                    if (val.trim().length < 2 || val.trim().startsWith("http")) {
                      setSuggestions([]);
                      setIsSuggestOpen(false);
                    }
                  }}
                  className="h-9 pl-8 pr-7 text-xs sm:pl-9 sm:pr-8 sm:text-sm"
                  aria-label="Search video or enter link"
                  aria-autocomplete="list"
                  aria-expanded={isSuggestOpen}
                />
                {inputVal && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => {
                      setInputVal("");
                      setSuggestions([]);
                      setSelectedSuggestIndex(-1);
                      setIsSuggestOpen(false);
                    }}
                    aria-label="Clear input"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Button type="submit" size="sm" className="h-9 px-3 text-xs sm:text-sm font-medium">
                Search
              </Button>
            </form>

            {/* Autocomplete Suggestions Dropdown */}
            {isSuggestOpen && suggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                role="listbox"
              >
                {suggestions.map((item, index) => {
                  const isSelected = selectedSuggestIndex === index;
                  return (
                    <div
                      key={`${item}-${index}`}
                      id={`suggest-item-${index}`}
                      onMouseDown={(e) => {
                        // Prevent search input from blurring before click completes
                        e.preventDefault();
                      }}
                      className={`flex cursor-pointer items-center justify-between rounded-sm px-2.5 py-1.5 text-xs transition-colors ${
                        isSelected
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-foreground hover:bg-muted/60"
                      }`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setSelectedSuggestIndex(index)}
                      onClick={() => handleSelectSuggestion(item)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Search className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{item}</span>
                      </div>
                      {isSelected && (
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0 pl-2">
                          ↵ Enter
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">/</span> to search
            </kbd>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              onClick={openSettings}
              title="Search Settings"
              aria-label="Settings"
            >
              <Settings2 className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main" className="flex-1 py-4 sm:py-6">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          {error && (
            <div
              className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-center text-xs text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Main Layout: Sticky Video Preview Player + Controls + Video Listing at Bottom */}
          <div className="flex flex-col gap-6">
            {/* 1. Sticky Video Preview Player */}
            <div className="sticky top-14 z-30 bg-background/95 backdrop-blur py-2">
              {isMinimized && (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Playing in corner mini-player</span>
                  </div>
                  <p className="max-w-md truncate text-sm font-medium text-foreground">
                    {meta?.title ?? "Video"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsMinimized(false)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Maximize2 className="size-3.5" />
                    <span>Restore to full screen</span>
                  </Button>
                </div>
              )}

              <div
                className={
                  isMinimized
                    ? "fixed bottom-5 right-5 z-50 flex w-72 sm:w-84 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl transition-all duration-200"
                    : "relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-sm"
                }
              >
                <div className={isMinimized ? "relative aspect-video w-full bg-black" : "h-full w-full"}>
                  <iframe
                    ref={iframeRef}
                    key="xyz-persistent-player"
                    onLoad={handleIframeLoad}
                    className="h-full w-full border-0"
                    src={initialEmbedUrl}
                    title={meta?.title ?? "Video"}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>

                {isMinimized && (
                  <div className="flex items-center justify-between border-t border-border bg-card p-2.5">
                    <div className="flex min-w-0 flex-1 flex-col pr-2">
                      <p className="truncate text-xs font-medium text-foreground">
                        {meta?.title}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {meta?.authorName}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={playPrevVideo}
                        title="Previous video"
                      >
                        <SkipBack className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={playNextVideo}
                        title="Next video"
                      >
                        <SkipForward className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setIsMinimized(false)}
                        title="Restore player"
                      >
                        <Maximize2 className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setIsMinimized(false)}
                        title="Close mini-player"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Video Info & Actions */}
            <div className="flex flex-col gap-3">
              <h1 className="text-base sm:text-lg lg:text-xl font-semibold tracking-tight text-foreground leading-snug">
                {meta?.title ?? "Loading..."}
              </h1>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {meta?.authorName ?? "Creator"}
                  </p>
                  {meta?.duration && (
                    <p className="text-xs text-muted-foreground">
                      Duration: {meta.duration}
                    </p>
                  )}
                </div>

                {/* Actions: Prev, Next, Autoplay, Minimize, Copy */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={playPrevVideo}
                    className="h-8 gap-1.5 px-2.5 text-xs font-normal"
                    title="Play previous video in queue"
                  >
                    <SkipBack className="size-3.5" />
                    <span>Prev</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={playNextVideo}
                    className="h-8 gap-1.5 px-2.5 text-xs font-normal"
                    title="Play next video in queue"
                  >
                    <SkipForward className="size-3.5" />
                    <span>Next</span>
                  </Button>

                  <Button
                    type="button"
                    variant={isAutoplay ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      const nextState = !isAutoplay;
                      setIsAutoplay(nextState);
                      showToast(nextState ? "Autoplay enabled" : "Autoplay paused");
                    }}
                    className="h-8 gap-1.5 px-2.5 text-xs font-normal"
                    title="Toggle automatic playback of next video"
                  >
                    <Play className={`size-3.5 ${isAutoplay ? "fill-current" : ""}`} />
                    <span>Autoplay: {isAutoplay ? "On" : "Off"}</span>
                  </Button>

                  <Button
                    type="button"
                    variant={isMinimized ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="h-8 gap-1.5 px-2.5 text-xs font-normal"
                    title="Minimize screen to corner (Press 'm')"
                  >
                    {isMinimized ? (
                      <Maximize2 className="size-3.5" />
                    ) : (
                      <Minimize2 className="size-3.5" />
                    )}
                    <span>{isMinimized ? "Restore" : "Minimize"}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                    className="h-8 gap-1.5 px-2.5 text-xs font-normal"
                    title="Copy link"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
              </div>

              {/* Collapsible description */}
              {meta?.description && (
                <div
                  onClick={() => setShowFullDesc((prev) => !prev)}
                  className="mt-1 cursor-pointer rounded-xl border border-border/60 bg-muted/30 p-3.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between pb-1 font-medium text-foreground">
                    <span>Description</span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {showFullDesc ? "Show less" : "Show more"}
                    </span>
                  </div>
                  <p
                    className={`leading-relaxed ${
                      showFullDesc ? "whitespace-pre-line" : "line-clamp-2"
                    }`}
                  >
                    {meta.description}
                  </p>
                </div>
              )}
            </div>

            {/* 3. Video Listing at Bottom (Old Style) */}
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {searchQueryLabel ? `Results for "${searchQueryLabel}"` : "Queue"}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    ({displayedVideos.length})
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQueryLabel("Trending");
                      setSearchPage(1);
                      setHasMore(true);
                      fetch(`/api/xyz?feed=trending&page=1`)
                        .then((res) => (res.ok ? res.json() : null))
                        .then((data) => {
                          if (data?.results?.length) {
                            setSearchResults(data.results);
                            setHasMore(data.hasMore ?? true);
                          }
                        });
                    }}
                    className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  >
                    Trending
                  </button>
                  {searchResults && (
                    <>
                      <span className="text-muted-foreground/30">&bull;</span>
                      <button
                        type="button"
                        onClick={clearSearchFilter}
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      >
                        Reset
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Videos list in divide-y container */}
              <div className="divide-y divide-border/40 rounded-xl border border-border bg-card/40 overflow-hidden shadow-sm">
                {displayedVideos.map((video, idx) => {
                  const isActive = video.id === activeVideoId;
                  const activeIdx = displayedVideos.findIndex(
                    (v) => v.id === activeVideoId
                  );
                  const isNext =
                    (activeIdx >= 0 && idx === activeIdx + 1) ||
                    (activeIdx === displayedVideos.length - 1 && idx === 0);

                  return (
                    <div
                      key={`${video.id}-${idx}`}
                      onClick={() => handleSelectVideo(video)}
                      className={`group flex items-center justify-between gap-3 sm:gap-4 p-2.5 sm:p-3 transition-colors cursor-pointer hover:bg-muted/50 ${
                        isActive ? "bg-muted/70" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Compact 16:9 Thumbnail with duration overlay */}
                        <div className="relative aspect-video w-24 sm:w-32 shrink-0 overflow-hidden rounded-md bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={video.thumbnailUrl || `/api/xyz?thumb=${video.id}`}
                            alt={video.title}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              if (!target.dataset.fallbackTried) {
                                target.dataset.fallbackTried = "1";
                                target.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
                              }
                            }}
                          />
                          {video.duration && (
                            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 font-mono text-[9px] sm:text-[10px] leading-none text-white">
                              {video.duration}
                            </span>
                          )}
                        </div>

                        {/* Title & Channel */}
                        <div className="flex flex-col min-w-0">
                          <p
                            className="line-clamp-2 text-xs sm:text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-snug"
                            title={video.title}
                          >
                            {video.title}
                          </p>
                          <p className="truncate text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                            {video.channel}
                          </p>
                        </div>
                      </div>

                      {/* Status badge / duration */}
                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        {isActive ? (
                          <Badge
                            variant="secondary"
                            className="gap-1 text-[10px] sm:text-xs px-2 py-0.5 font-normal bg-foreground/10 text-foreground"
                          >
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Playing
                          </Badge>
                        ) : isNext && isAutoplay ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] sm:text-xs px-2 py-0.5 font-normal text-muted-foreground border-border/60"
                          >
                            Up Next
                          </Badge>
                        ) : (
                          <span className="hidden sm:inline font-mono text-xs text-muted-foreground/70">
                            {video.duration}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load more data */}
              {hasMore ? (
                <div className="flex justify-center pt-2 pb-6">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoadingMore}
                    onClick={loadMoreVideos}
                    className="h-9 w-full max-w-xs gap-2 px-6 text-xs font-normal text-muted-foreground hover:text-foreground"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Loading more videos...</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-3.5" />
                        <span>Load more videos</span>
                      </>
                    )}
                  </Button>
                </div>
              ) : displayedVideos.length > 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground/60">
                  You&apos;ve reached the end of the list
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {/* 4. Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-medium text-foreground">
                Search Settings
              </h3>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setShowSettings(false)}
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={saveSettings} className="flex flex-col gap-3 pt-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="search-key-input"
                  className="text-xs font-medium text-foreground"
                >
                  Google YouTube Data API v3 Key (optional)
                </label>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Enter your Google API key to query YouTube&apos;s official v3 API directly. Without an API key, xyz automatically uses built-in public mirrors.
                </p>
                <Input
                  id="search-key-input"
                  type="password"
                  placeholder="AIzaSy..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="h-8 text-xs">
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Minimal Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md">
          {toast}
        </div>
      )}
    </>
  );
}
