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
import { Search, X, Settings2, Copy, Check } from "lucide-react";

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
  const [autoplay, setAutoplay] = useState(false);
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  // Keyboard shortcut: '/' to focus search, 'Escape' to dismiss suggestions
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement !== searchInputRef.current &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setIsSuggestOpen(false);
        searchInputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

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
    setSearchResults(null);
    setSearchQueryLabel("");
    setInputVal("");
    setError("");
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

  const displayedVideos = searchResults ?? XYZ_CATALOG_VIDEOS;

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
              placeholder="Search or paste link..."
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

          <Button type="submit" size="sm" className="h-9 px-3.5">
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

      {/* 2. Video Player Frame */}
      <div className="flex flex-col gap-3">
        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-black shadow-sm">
          <iframe
            key={activeVideoId}
            className="h-full w-full border-0"
            src={getXyzEmbedUrl(activeVideoId, autoplay)}
            title={meta?.title ?? "Video"}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Minimal info line */}
        <div className="flex items-center justify-between gap-3 px-0.5">
          <div className="flex flex-col min-w-0">
            <h1 className="truncate text-sm font-medium text-foreground">
              {meta?.title ?? "Loading..."}
            </h1>
            <p className="text-xs text-muted-foreground">
              {meta?.authorName ?? "Creator"}
              {meta?.duration ? ` • ${meta.duration}` : ""}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="h-7 gap-1.5 px-2.5 text-xs shrink-0"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            <span>{copied ? "Copied" : "Copy link"}</span>
          </Button>
        </div>
      </div>

      {/* 3. Simple List */}
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {searchQueryLabel ? `Results for "${searchQueryLabel}"` : "Queue"}
            </span>
            <span className="text-xs text-muted-foreground">
              ({displayedVideos.length})
            </span>
          </div>

          {searchResults && (
            <button
              type="button"
              onClick={clearSearchFilter}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Reset
            </button>
          )}
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
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
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

