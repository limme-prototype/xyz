"use client";

import { useEffect } from "react";
import { VideoMeta } from "@/lib/types/player";
import { Button } from "@/components/ui/button";
import { SkipBack, SkipForward, Play, Pause, Maximize2, X } from "lucide-react";
import { PlayerControls, type PlayerControlsProps } from "./player-controls";

export interface StreamVideoEvents {
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onDurationChange: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onVolumeChange: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onLoadStart: () => void;
  onWaiting: () => void;
  onSeeking: () => void;
  onCanPlay: () => void;
  onPlaying: () => void;
  onSeeked: () => void;
}

interface AmbientStageProps {
  meta: VideoMeta | null;
  stageRef: React.RefObject<HTMLDivElement | null>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** YouTube embed URL, or null when playing natively (the iframe must not load on blocked networks). */
  embedUrl: string | null;
  /** True when the <video> element (HLS or DASH) is the playback surface. */
  videoActive: boolean;
  streamEvents: StreamVideoEvents;
  playbackError: string | null;
  onRetry: () => void;
  onSkip: () => void;
  onIframeLoad: () => void;
  isMinimized: boolean;
  isHidden?: boolean;
  viewType?: "watch" | "home" | "search";
  onToggleMinimize: () => void;
  onClose?: () => void;
  controls: PlayerControlsProps;
}

export function AmbientStage({
  meta,
  stageRef,
  iframeRef,
  videoRef,
  embedUrl,
  videoActive,
  streamEvents,
  playbackError,
  onRetry,
  onSkip,
  onIframeLoad,
  isMinimized,
  isHidden = false,
  viewType = "watch",
  onToggleMinimize,
  onClose,
  controls,
}: AmbientStageProps) {
  const { posterUrl, isPlaying, currentTime, duration, onTogglePlay, onNext, onPrev } = controls;

  /* The minimized stage is position:fixed, so it cannot push content aside on
     its own. Publish its height and let the feeds reserve the space. */
  useEffect(() => {
    const el = stageRef.current;
    const root = document.documentElement;
    if (!isMinimized || !el || isHidden) {
      root.style.removeProperty("--mini-clear");
      return;
    }
    const publish = () => root.style.setProperty("--mini-clear", `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--mini-clear");
    };
  }, [isMinimized, isHidden, stageRef]);

  return (
    <div
      className={
        viewType !== "watch"
          ? "contents select-none"
          : "relative aspect-video w-full select-none"
      }
    >
      {/* 0. Watch stage backdrop / placeholder when docked to mini player */}
      {viewType === "watch" && isMinimized && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-[var(--ios-separator)] glass-thin text-[var(--ios-label-2)] p-6 text-center select-none">
          <p className="text-callout font-medium text-[var(--ios-label-2)]">Playing in mini player</p>
          <p className="text-footnote text-[var(--ios-label-2)] mt-1">Click the expand button in the corner to restore</p>
        </div>
      )}
      {/* 1. Subtle ambient glow (watch view only) */}
      {posterUrl && !isMinimized && !isHidden && viewType === "watch" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 z-0 hidden overflow-hidden rounded-2xl opacity-20 blur-3xl sm:block transition-opacity duration-700"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={posterUrl} alt="" className="h-full w-full scale-110 object-cover saturate-150" />
        </div>
      )}


      {/* 2. Stage: uncropped 16:9 surface + our own controls */}
      <div
        ref={stageRef}
        className={`${isHidden ? "hidden" : ""} overflow-hidden border-border bg-black shadow-2xl transition-[width,height,border-radius,box-shadow] duration-250 ease-out ${
          isMinimized
            ? "fixed bottom-5 left-5 z-50 w-80 max-w-[calc(100vw-2.5rem)] rounded-[var(--radius-xl)] border border-[var(--ios-separator)] shadow-2xl animate-mini-in sm:w-88"
            : "relative z-10 aspect-video w-full border-0 sm:rounded-[var(--radius-xl)] sm:border sm:border-[var(--ios-separator-opaque)]"
        }`}
      >
        <div className={`relative w-full bg-black ${isMinimized ? "aspect-video" : "h-full"}`}>
          {/* YouTube (headless), only in embed mode. Kept mounted so audio/state survive mode switches. */}
          {embedUrl && (
            <iframe
              ref={iframeRef}
              key="xyz-persistent-player"
              onLoad={onIframeLoad}
              className={`pointer-events-none h-full w-full border-0 ${videoActive ? "invisible" : ""}`}
              src={embedUrl}
              title={meta?.title ?? "Video"}
              tabIndex={-1}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            />
          )}

          {/* Native playback: DASH via Shaka (proxied by an Invidious instance) or HLS via hls.js */}
          {videoActive && (
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full bg-black object-contain"
              playsInline
              crossOrigin="anonymous"
              {...streamEvents}
            />
          )}

          {playbackError && !isMinimized && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
              <p className="text-callout font-medium text-white">{playbackError}</p>
              <p className="max-w-sm text-footnote text-white/70">
                The public playback server could not load this video. It may be busy, blocked by YouTube,
                or temporarily offline.
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={onRetry} className="h-8 text-footnote">
                  Try again
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onSkip} className="h-8 text-footnote text-white hover:text-white">
                  Skip to next
                </Button>
              </div>
            </div>
          )}

          {isMinimized ? (
            <button
              type="button"
              aria-label={isPlaying ? "Pause" : "Play"}
              onClick={onTogglePlay}
              className="absolute inset-0 z-20 cursor-pointer"
            />
          ) : (
            <PlayerControls {...controls} />
          )}
        </div>

        {/* 3. Minimized iOS-style mini player */}
        {isMinimized && (
          <div className="relative rounded-b-[var(--radius-xl)] glass-chrome">
            {/* Slim playback progress bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden bg-[var(--ios-fill-3)]">
              <div
                className="h-full bg-[var(--ios-label)] transition-all duration-200"
                style={{
                  width: `${duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%`,
                }}
              />
            </div>

            <div className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] pt-[calc(var(--space-2)+2px)]">
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className="truncate text-footnote font-medium leading-tight text-[var(--ios-label)]"
                  style={{ letterSpacing: "var(--tracking-footnote)" }}
                  title={meta?.title}
                >
                  {meta?.title ?? "Playing"}
                </span>
                <span
                  className="truncate text-caption-2 leading-snug text-[var(--ios-label-2)]"
                  style={{ letterSpacing: "var(--tracking-caption)" }}
                >
                  {meta?.authorName ? meta.authorName : isPlaying ? "Playing" : "Paused"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onPrev}
                  className="interactive tap-compact size-8 rounded-full text-[var(--ios-label-2)] hover:bg-[var(--ios-fill-4)] hover:text-[var(--ios-label)]"
                  title="Previous"
                >
                  <SkipBack className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onTogglePlay}
                  className="interactive tap-compact size-9 rounded-full bg-[var(--ios-label)] text-[var(--ios-bg)] hover:bg-[var(--ios-label)]/85 hover:text-[var(--ios-bg)]"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current ml-0.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onNext}
                  className="interactive tap-compact size-8 rounded-full text-[var(--ios-label-2)] hover:bg-[var(--ios-fill-4)] hover:text-[var(--ios-label)]"
                  title="Next"
                >
                  <SkipForward className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleMinimize}
                  className="interactive tap-compact size-8 rounded-full text-[var(--ios-label-2)] hover:bg-[var(--ios-fill-4)] hover:text-[var(--ios-label)]"
                  title="Expand back to stage"
                >
                  <Maximize2 className="size-4" />
                </Button>
                {onClose && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="interactive tap-compact size-8 rounded-full text-[var(--ios-label-3)] hover:bg-[var(--ios-fill-4)] hover:text-[var(--ios-red)]"
                    title="Close mini player"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
