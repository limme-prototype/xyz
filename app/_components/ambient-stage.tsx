"use client";

import { VideoMeta } from "@/lib/types/player";
import { Button } from "@/components/ui/button";
import { SkipBack, SkipForward, Play, Pause, Maximize2 } from "lucide-react";
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
  onToggleMinimize: () => void;
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
  onToggleMinimize,
  controls,
}: AmbientStageProps) {
  const { posterUrl, isPlaying, onTogglePlay, onNext, onPrev } = controls;

  return (
    <div className="relative w-full select-none">
      {/* 1. Subtle ambient glow */}
      {posterUrl && !isMinimized && (
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
        className={`z-10 overflow-hidden border-border bg-black shadow-xl transition-all duration-300 ${
          isMinimized
            ? "fixed bottom-5 right-5 z-50 w-72 rounded-lg border shadow-2xl sm:w-84"
            : "relative aspect-video w-full border-0 sm:rounded-xl sm:border"
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
              <p className="text-sm font-medium text-white">{playbackError}</p>
              <p className="max-w-sm text-xs text-white/60">
                The public playback server could not load this video. It may be busy, blocked by YouTube,
                or temporarily offline.
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={onRetry} className="h-8 text-xs">
                  Try again
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onSkip} className="h-8 text-xs text-white hover:text-white">
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

        {/* 3. Minimized corner widget */}
        {isMinimized && (
          <div className="flex items-center justify-between border-t border-border bg-card p-2">
            <div className="flex min-w-0 flex-1 flex-col pr-2">
              <span className="truncate text-xs font-medium text-foreground">{meta?.title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onPrev}
                className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              >
                <SkipBack className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={onTogglePlay} className="h-7 w-7 rounded-full bg-foreground text-background hover:bg-foreground/90 hover:text-background">
                {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onNext}
                className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              >
                <SkipForward className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleMinimize}
                className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                title="Expand back to stage"
              >
                <Maximize2 className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
