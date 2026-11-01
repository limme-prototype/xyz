"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { VideoMeta } from "@/lib/types/player";
import { Button } from "@/components/ui/button";
import { SkipBack, SkipForward, Play, Pause, Maximize2, X } from "lucide-react";
import { PlayerControls, type PlayerControlsProps } from "./player-controls";
import { AnimatePresence, animate, motion, useMotionValue, type PanInfo } from "motion/react";
import { SPRING, project } from "@/lib/motion";

/** A downward flick faster than this dismisses the player. */
const DISMISS_VELOCITY = 500;

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
  /** True while <HeroFlight> is flying into this box. The stage must sit still
      at its destination, or the proxy would be chasing a moving target. */
  heroLanding?: boolean;
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
  heroLanding = false,
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
    /* offsetHeight, not getBoundingClientRect: the layout projection scales the
       node with a transform while it morphs, and the clearance must not jitter. */
    const publish = () => root.style.setProperty("--mini-clear", `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--mini-clear");
    };
  }, [isMinimized, isHidden, stageRef]);

  /* ── Mini player: free placement inside the viewport ─────────────
     Position lives entirely in x/y transforms, never in left/top, so the
     interaction is compositor-only and can be grabbed mid-flight. The travel
     box is an element, not arithmetic: motion clamps against its rect, which
     keeps working through resize and orientation changes for free. */
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const edgeRef = useRef<HTMLDivElement | null>(null);
  const draggable = isMinimized && !isHidden;

  /* Undo/undock is owned by the layout projection; a leftover drag offset
     would be added on top of it and fling the player off screen. Layout effect,
     so the offset is gone before anything measures the settled stage box. */
  useLayoutEffect(() => {
    x.set(0);
    y.set(0);
  }, [isMinimized, x, y]);

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const el = stageRef.current;
    const edge = edgeRef.current;
    if (!el || !edge) return;

    if (info.velocity.y > DISMISS_VELOCITY && y.get() > 8) {
      // Slide the rest of the way off the bottom edge, then let the parent hide
      // the node — the stage must never unmount, or playback dies with it.
      animate(y, window.innerHeight, { duration: 0.22, ease: "easeOut" });
      dismissTimer.current = setTimeout(() => onClose?.(), 200);
      return;
    }

    const c = edge.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    // The docked rect is the painted one minus the offset we have already moved.
    const minX = c.left - (r.left - x.get());
    const maxX = c.right - (r.left - x.get() + width);
    const minY = c.top - (r.top - y.get());
    const maxY = c.bottom - (r.top - y.get() + height);

    const settle = (value: typeof x, from: number, velocity: number, min: number, max: number) => {
      // Snap to whichever edge the *projected* endpoint is nearer, so a small
      // flick can travel a long way — but never past a bound.
      const projected = Math.min(max, Math.max(min, project(from, velocity)));
      const nearest = Math.abs(projected - min) <= Math.abs(projected - max) ? min : max;
      animate(value, nearest, { ...SPRING.move, velocity });
    };
    settle(x, x.get(), info.velocity.x, minX, maxX);
    settle(y, y.get(), info.velocity.y, minY, maxY);
  };

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


      {/* 2. Stage: uncropped 16:9 surface + our own controls.
          Permanently mounted — minimise and dismiss are className-driven so the
          <video>/<iframe> node survives navigating away. The box morphs by
          layout projection (transform only), never by animating width/height. */}
      {draggable && (
        // The box the mini player may travel in. Inset by the same 20px it docks at.
        <div ref={edgeRef} aria-hidden="true" className="pointer-events-none fixed inset-5 z-0" />
      )}

      <motion.div
        ref={stageRef}
        layout={!isHidden && !heroLanding}
        drag={draggable}
        dragMomentum={false}
        dragElastic={0.15}
        dragConstraints={draggable ? edgeRef : false}
        onDragEnd={onDragEnd}
        style={{ x, y }}
        transition={SPRING.move}
        className={`${isHidden ? "hidden" : ""} overflow-hidden border-border bg-black shadow-2xl ${
          isMinimized
            ? "fixed bottom-4 left-4 z-50 w-60 max-w-[calc(100vw-2rem)] cursor-grab touch-none rounded-[var(--radius-xl)] border border-[var(--ios-separator)] sm:bottom-5 sm:left-5 sm:w-88"
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

          <AnimatePresence>
            {playbackError && !isMinimized && (
              <motion.div
                className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SPRING.ui}
              >
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
              </motion.div>
            )}
          </AnimatePresence>

          {isMinimized ? (
            <button
              type="button"
              aria-label={isPlaying ? "Pause" : "Play"}
              onClick={onTogglePlay}
              className="absolute inset-0 z-20 cursor-grab active:cursor-grabbing"
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
                  className="hidden truncate text-caption-2 leading-snug text-[var(--ios-label-2)] sm:block"
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
                  className="interactive tap-compact hidden size-8 rounded-full text-[var(--ios-label-2)] hover:bg-[var(--ios-fill-4)] hover:text-[var(--ios-label)] sm:inline-flex"
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
                  className="interactive tap-compact hidden size-8 rounded-full text-[var(--ios-label-2)] hover:bg-[var(--ios-fill-4)] hover:text-[var(--ios-label)] sm:inline-flex"
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
      </motion.div>
    </div>
  );
}
