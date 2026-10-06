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
  Play,
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

export function XyzPlayer() {
  const [activeVideoId, setActiveVideoId] = useState<string>(DEFAULT_VIDEO_ID);
  const [inputVal, setInputVal] = useState<string>("");
  const [meta, setMeta] = useState<VideoMeta | null>(() =>
    getFallbackMeta(DEFAULT_VIDEO_ID)
  );
  const [error, setError] = useState<string>("");

  // Search & autocomplete
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<XyzVideo[] | null>(null);
  const [searchQueryLabel, setSearchQueryLabel] = useState<string>("");
  const [autoplay, setAutoplay] = useState(true);
  const [isAutoplay, setIsAutoplay] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);

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

  function sendPlayerCommand(func: string, args: unknown[] = []) {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({
          event: "command",
          func,
          args,
        }),
        "*"
      );
    } catch {
      // ignore
    }
  }

  function playNextVideo() {
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

  function handleSelectVideo(video: XyzVideo) {
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

    // If player instance is already loaded, seamlessly advance without recreating iframe
    if (playerRef.current?.loadVideoById) {
      try {
        playerRef.current.loadVideoById(video.id);
      } catch {
        // fallback
      }
    } else {
      setTimeout(() => {
        sendPlayerCommand("loadVideoById", [video.id]);
        sendPlayerCommand("playVideo");
      }, 100);
    }

    if (typeof window !== "undefined" && !isMinimized) {
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      .then((res) => {
        if (!res.ok) throw new Error("Video not found");
        return res.json();
      })
      .then((data: VideoMeta) => {
        if (!ignore) {
          setMeta(data);
        }
      })
      .catch((err: Error) => {
        if (!ignore) {
          const fallback = getFallbackMeta(activeVideoId);
          if (!fallback) {
            setError(err.message || "Failed to load video details");
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

  // Dual-layer Autoplay Detection: postMessage listener for ended events
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        // 1. onStateChange event: info 0 = ENDED
        if (data?.event === "onStateChange" && data?.info === 0) {
          if (isAutoplayRef.current) {
            playNextVideoRef.current();
          }
        }

        // 2. infoDelivery event: playerState 0 = ENDED
        if (data?.event === "infoDelivery" && data?.info?.playerState === 0) {
          if (isAutoplayRef.current) {
            playNextVideoRef.current();
          }
        }
      } catch {
        // ignore non-json messages
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // IFrame load handshake to start playback & subscribe to events
  function handleIframeLoad() {
    sendPlayerCommand("listening");
    sendPlayerCommand("addEventListener", ["onStateChange"]);
    sendPlayerCommand("addEventListener", ["infoDelivery"]);

    if (autoplay || isAutoplayRef.current) {
      setTimeout(() => {
        sendPlayerCommand("playVideo");
      }, 250);
    }
  }

  // Load IFrame API script for native event handling
  useEffect(() => {
    if (typeof window === "undefined") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).YT) {
      const existing = document.getElementById("xyz-iframe-api");
      if (!existing) {
        const tag = document.createElement("script");
        tag.id = "xyz-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        const first = document.getElementsByTagName("script")[0];
        first?.parentNode?.insertBefore(tag, first);
      }
    }
  }, []);

  // Attach native YT.Player to iframe if available
  useEffect(() => {
    let isMounted = true;

    function setupPlayer() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!iframeRef.current || !(window as any).YT?.Player) return;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        playerRef.current = new (window as any).YT.Player(iframeRef.current, {
          events: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onReady: (event: any) => {
              if (!isMounted) return;
              if (autoplay || isAutoplayRef.current) {
                try {
                  event.target.playVideo();
                } catch {
                  // ignore
                }
              }
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onStateChange: (event: any) => {
              if (!isMounted) return;
              // 0 = YT.PlayerState.ENDED
              if (event.data === 0 && isAutoplayRef.current) {
                playNextVideoRef.current();
              }
            },
          },
        });
      } catch {
        // player might already be initialized
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).YT?.Player) {
      setupPlayer();
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (window as any).onYouTubeIframeAPIReady;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        setupPlayer();
      };
    }

    return () => {
      isMounted = false;
    };
  }, [activeVideoId, autoplay]);

  async function executeSearch(query: string) {
    setIsSuggestOpen(false);
    const q = query.trim();
    if (!q) return;

    // Direct link or ID
    const parseRes = parseXyzUrl(q);
    if (parseRes.ok) {
      setActiveVideoId(parseRes.videoId);
      setMeta(getFallbackMeta(parseRes.videoId));
      setError("");
      setAutoplay(true);
      setSearchResults(null);
      setSearchQueryLabel("");
      return;
    }

    // Live search
    try {
      const keyParam = savedApiKey
        ? `&key=${encodeURIComponent(savedApiKey)}`
        : "";
      const res = await fetch(
        `/api/xyz?q=${encodeURIComponent(q)}${keyParam}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          setSearchResults(data.results);
          setSearchQueryLabel(q);
          setError("");
          handleSelectVideo(data.results[0]);
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
      setError("");
      handleSelectVideo(matched[0]);
    } else {
      setError(`No videos found matching "${q}".`);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    executeSearch(inputVal);
  }

  function handleSelectSuggestion(s: string) {
    setInputVal(s);
    executeSearch(s);
  }

  function clearSearchFilter() {
    setSearchQueryLabel("");
    setInputVal("");
    setError("");
    fetch(`/api/xyz?feed=trending`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.results?.length) {
          setSearchResults(data.results);
        } else {
          setSearchResults(null);
        }
      })
      .catch(() => {
        setSearchResults(null);
      });
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4">
      {/* 1. Simple Search Bar */}
      <div ref={searchContainerRef} className="relative w-full">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search or paste link... (press / to focus)"
              value={inputVal}
              onFocus={() => {
                if (suggestions.length > 0) setIsSuggestOpen(true);
              }}
              onChange={(e) => {
                const val = e.target.value;
                setInputVal(val);
                if (error) setError("");
                if (val.trim().length < 2 || val.trim().startsWith("http")) {
                  setSuggestions([]);
                  setIsSuggestOpen(false);
                }
              }}
              className="h-9 pl-9 pr-8"
              aria-label="Search video or enter link"
            />
            {inputVal && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => {
                  setInputVal("");
                  setSuggestions([]);
                  setIsSuggestOpen(false);
                }}
                aria-label="Clear input"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Button type="submit" size="sm" className="h-9 px-3.5 font-medium">
            Search
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
            onClick={openSettings}
            title="Search Settings"
            aria-label="Settings"
          >
            <Settings2 className="size-4" />
          </Button>
        </form>

        {/* Simple Autocomplete List */}
        {isSuggestOpen && suggestions.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            role="listbox"
          >
            {suggestions.map((item, index) => (
              <div
                key={`${item}-${index}`}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                role="option"
                aria-selected={false}
                onClick={() => handleSelectSuggestion(item)}
              >
                <Search className="size-3 text-muted-foreground" />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="pt-2 text-center text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* 2. Video Player Frame & Controls */}
      <div className="flex flex-col gap-3">
        {/* Placeholder when minimized */}
        {isMinimized ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
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
        ) : null}

        {/* Video Player Box (dockable when minimized) */}
        <div
          className={
            isMinimized
              ? "fixed bottom-5 right-5 z-50 flex w-72 sm:w-80 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl transition-all duration-200"
              : "relative aspect-video w-full overflow-hidden rounded-md border border-border bg-black shadow-sm"
          }
        >
          <div className="relative aspect-video w-full bg-black">
            <iframe
              ref={iframeRef}
              key={activeVideoId}
              onLoad={handleIframeLoad}
              className="h-full w-full border-0"
              src={getXyzEmbedUrl(activeVideoId, autoplay)}
              title={meta?.title ?? "Video"}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          {/* Mini-player dock bar */}
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

        {/* Minimal info & Action strip below video */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-0.5">
          <div className="flex flex-col min-w-0">
            <h1 className="truncate text-sm font-medium text-foreground">
              {meta?.title ?? "Loading..."}
            </h1>
            <p className="text-xs text-muted-foreground">
              {meta?.authorName ?? "Creator"}
              {meta?.duration ? ` • ${meta.duration}` : ""}
            </p>
          </div>

          {/* Action buttons: Next, Autoplay toggle, Minimize screen, Copy Link */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={playNextVideo}
              className="h-7 gap-1 px-2 text-xs"
              title="Play next video in queue"
            >
              <SkipForward className="size-3" />
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
              className="h-7 gap-1 px-2 text-xs"
              title="Toggle automatic playback of next video"
            >
              <Play className={`size-3 ${isAutoplay ? "fill-current" : ""}`} />
              <span>Autoplay: {isAutoplay ? "On" : "Off"}</span>
            </Button>

            <Button
              type="button"
              variant={isMinimized ? "secondary" : "outline"}
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-7 gap-1 px-2 text-xs"
              title="Minimize screen to corner (Press 'm')"
            >
              {isMinimized ? (
                <Maximize2 className="size-3" />
              ) : (
                <Minimize2 className="size-3" />
              )}
              <span>{isMinimized ? "Restore" : "Minimize"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="h-7 gap-1 px-2 text-xs"
              title="Copy link"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 3. Simple List (Queue / Search Results) */}
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {searchQueryLabel ? `Results for "${searchQueryLabel}"` : "Up Next & Recommended"}
            </span>
            <span className="text-xs text-muted-foreground">
              ({displayedVideos.length})
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setSearchQueryLabel("Trending");
                fetch(`/api/xyz?feed=trending`)
                  .then((res) => (res.ok ? res.json() : null))
                  .then((data) => {
                    if (data?.results?.length) {
                      setSearchResults(data.results);
                    }
                  });
              }}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Trending
            </button>
            {searchResults && (
              <>
                <span className="text-muted-foreground/30">&bull;</span>
                <button
                  type="button"
                  onClick={clearSearchFilter}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>

        <div className="divide-y divide-border/40 rounded-md border border-border bg-card">
          {displayedVideos.map((video) => {
            const isActive = video.id === activeVideoId;
            return (
              <div
                key={video.id}
                onClick={() => handleSelectVideo(video)}
                className={`flex items-center gap-3 p-2.5 transition-colors cursor-pointer hover:bg-muted/40 ${
                  isActive ? "bg-muted/60" : ""
                }`}
              >
                {/* Compact thumbnail */}
                <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={video.thumbnailUrl || `/api/xyz?thumb=${video.id}`}
                    alt={video.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      if (!target.dataset.fallbackTried) {
                        target.dataset.fallbackTried = "1";
                        target.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
                      }
                    }}
                  />
                </div>

                {/* Video Info */}
                <div className="flex flex-1 flex-col min-w-0">
                  <p
                    className="truncate text-xs font-medium text-foreground"
                    title={video.title}
                  >
                    {video.title}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {video.channel}
                  </p>
                </div>

                {/* Duration & status */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {video.duration}
                  </span>
                  {isActive && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                      Playing
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                Settings
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
                  className="text-xs text-muted-foreground"
                >
                  Custom API Key (optional)
                </label>
                <Input
                  id="search-key-input"
                  type="text"
                  placeholder="Enter key..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="h-8 text-xs"
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
    </div>
  );
}
