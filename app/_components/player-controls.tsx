"use client";

import { useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  Captions,
  CaptionsOff,
  SkipBack,
  SkipForward,
} from "lucide-react";

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

export interface PlayerControlsProps {
  isPlaying: boolean;
  hasStarted: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0-100
  isMuted: boolean;
  rate: number;
  captionsOn: boolean;
  isFullscreen: boolean;
  posterUrl: string | null;
  onToggleMini?: () => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  onRate: (rate: number) => void;
  onToggleCaptions: () => void;
  onToggleFullscreen: () => void;
  onNext: () => void;
  onPrev: () => void;
  /** Available heights for adaptive (DASH) playback; empty hides the quality control. */
  qualities?: number[];
  /** True while the video is resolving, loading or buffering. */
  isLoading?: boolean;
  /** Embed mode: hide YouTube's own pause overlays behind a veil. Native video needs no veil. */
  concealPaused?: boolean;
  /** Selected height, or null for automatic. */
  quality?: number | null;
  onQuality?: (height: number | null) => void;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 cursor-pointer"
    >
      {children}
    </button>
  );
}

/**
 * Custom player chrome rendered above the (headless) video surface.
 * - A full-size "glass" layer captures every click so the underlying YouTube iframe never
 *   receives pointer events (no hover title bar, no native pause screen, no "More videos").
 * - While paused, the frame is blurred behind a single play button, which also covers any
 *   residual branding YouTube renders in its paused state.
 */
export function PlayerControls(props: PlayerControlsProps) {
  const {
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
    onTogglePlay,
    onSeek,
    onVolume,
    onToggleMute,
    onRate,
    onToggleCaptions,
    onToggleFullscreen,
    onNext,
    onPrev,
    onToggleMini,
    qualities = [],
    quality = null,
    onQuality,
    isLoading = false,
    concealPaused = false,
  } = props;

  // Cycle: Auto -> highest -> ... -> lowest -> Auto
  const nextQuality = () => {
    if (!onQuality || qualities.length === 0) return;
    const order: (number | null)[] = [null, ...qualities];
    onQuality(order[(order.indexOf(quality) + 1) % order.length] ?? null);
  };

  const [isActive, setIsActive] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = () => {
    setIsActive(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setIsActive(false), 2500);
  };

  const showChrome = !isPlaying || isActive;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const effectiveVolume = isMuted ? 0 : volume;
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 50 ? Volume1 : Volume2;

  return (
    <div
      className={`absolute inset-0 z-20 select-none ${showChrome ? "cursor-default" : "cursor-none"}`}
      onMouseMove={wake}
      onMouseLeave={() => setIsActive(false)}
    >
      {/* Click glass: blocks all pointer events from reaching the iframe */}
      <button
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onTogglePlay}
        onDoubleClick={onToggleFullscreen}
        className="absolute inset-0 h-full w-full cursor-[inherit] focus-visible:outline-none"
      />

      {/* Before first play: our own poster (hides YouTube's initial title card) */}
      {!hasStarted && posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Embed mode only: veil concealing YouTube's pause suggestions and logos */}
      {!isPlaying && concealPaused && hasStarted && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/95 to-transparent" />
        </div>
      )}

      {/* Center: spinner while loading/buffering, play button before the first frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {isLoading ? (
          <span
            role="status"
            aria-label="Loading video"
            className="h-14 w-14 animate-spin rounded-full border-4 border-white/20 border-t-brand bg-black/40 shadow-[0_0_0_10px_rgba(0,0,0,0.35)]"
          />
        ) : !isPlaying && (!hasStarted || concealPaused) ? (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-xl">
            <Play className="size-7 translate-x-0.5 fill-current" />
          </span>
        ) : null}
      </div>

      {/* Bottom control bar */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-10 transition-opacity duration-300 ${
          showChrome ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Seek bar */}
        <div className="group/seek relative mb-1.5 flex h-4 items-center">
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-all group-hover/seek:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${progress}%` }} />
          </div>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5">
            <span className="hidden sm:contents">
              <IconButton label="Previous (P)" onClick={onPrev}>
                <SkipBack className="size-4" />
              </IconButton>
            </span>
            <button
              type="button"
              aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              onClick={onTogglePlay}
              className="mx-1 flex size-9 items-center justify-center rounded-full bg-white text-black shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 translate-x-px fill-current" />
              )}
            </button>
            <IconButton label="Next (N)" onClick={onNext}>
              <SkipForward className="size-4" />
            </IconButton>

            {/* Volume */}
            <div className="group/vol flex items-center">
              <IconButton label={isMuted ? "Unmute" : "Mute"} onClick={onToggleMute}>
                <VolumeIcon className="size-4" />
              </IconButton>
              <input
                type="range"
                aria-label="Volume"
                min={0}
                max={100}
                value={effectiveVolume}
                onChange={(e) => onVolume(Number(e.target.value))}
                className="h-1 w-0 cursor-pointer accent-white opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus-visible:w-20 focus-visible:opacity-100"
              />
            </div>

            <span className="ml-2 whitespace-nowrap font-mono text-[11px] tabular-nums text-white/80">
              {formatTime(currentTime)} <span className="text-white/40">/ {formatTime(duration)}</span>
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Playback speed"
              onClick={() => onRate(SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] ?? 1)}
              className="h-8 min-w-10 rounded-md px-2 font-mono text-[11px] text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              {rate}x
            </button>
            {qualities.length > 0 && onQuality && (
              <button
                type="button"
                title="Quality"
                onClick={nextQuality}
                className="h-8 min-w-12 rounded-md px-2 font-mono text-[11px] text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                {quality === null ? "Auto" : `${quality}p`}
              </button>
            )}
            <IconButton label={captionsOn ? "Captions off" : "Captions on"} onClick={onToggleCaptions}>
              {captionsOn ? <Captions className="size-4" /> : <CaptionsOff className="size-4 opacity-60" />}
            </IconButton>
            {onToggleMini && (
              <IconButton label="Mini player (I)" onClick={onToggleMini}>
                <PictureInPicture2 className="size-4" />
              </IconButton>
            )}
            <IconButton label={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"} onClick={onToggleFullscreen}>
              {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
