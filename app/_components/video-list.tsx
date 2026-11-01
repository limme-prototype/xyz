"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import type { HeroOrigin } from "@/lib/motion";
import type { XyzVideo } from "@/lib/xyz";
import { SECTIONS } from "@/lib/content/sections";

function isLive(video: XyzVideo) {
  return /^live/i.test(video.views) || video.duration === "LIVE";
}

function metaLine(video: XyzVideo) {
  if (isLive(video)) return "Streaming now";
  return [video.views, video.uploadedAt].filter(Boolean).join(" · ");
}

function hasDuration(video: XyzVideo) {
  return Boolean(video.duration) && video.duration !== "Video" && !isLive(video);
}

function DurationPill({ video, className = "" }: { video: XyzVideo; className?: string }) {
  if (isLive(video)) {
    return (
      <span
        className={`flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Live
      </span>
    );
  }
  if (!hasDuration(video)) return null;
  return (
    <span
      className={`rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur ${className}`}
    >
      {video.duration}
    </span>
  );
}

function EqualizerMark() {
  return (
    <span aria-hidden="true" className="flex h-3.5 items-end gap-[2px]">
      {[0, 0.2, 0.4].map((delay) => (
        <span key={delay} className="eq-bar h-full w-[3px] rounded-sm bg-brand" style={{ animationDelay: `${delay}s` }} />
      ))}
    </span>
  );
}

/**
 * Filter tabs: the active pill slides between options. The row scrolls sideways when it overflows
 * by mouse wheel, edge arrows, or touch; the selected tab is kept in view.
 */
export function ChipBar({ active, onSelect }: { active: string; onSelect: (chip: string) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateEdges();
    // Vertical wheel scrolls the row sideways (needs a non-passive listener to stop page scroll).
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [updateEdges]);

  useEffect(() => {
    const container = scrollerRef.current;
    const activeChip = container?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (container && activeChip) {
      const chipLeft = activeChip.offsetLeft;
      const chipRight = chipLeft + activeChip.offsetWidth;
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;
      if (chipLeft < scrollLeft) {
        container.scrollTo({ left: chipLeft - 8, behavior: "smooth" });
      } else if (chipRight > scrollLeft + containerWidth) {
        container.scrollTo({ left: chipRight - containerWidth + 8, behavior: "smooth" });
      }
    }
  }, [active]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    el?.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      {edges.left && (
        <button
          type="button"
          aria-label="Scroll filters left"
          onClick={() => scrollBy(-1)}
          className="interactive tap-compact flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--ios-label-2)] transition-colors hover:bg-white/10 hover:text-[var(--ios-label)] cursor-pointer"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      <MotionConfig reducedMotion="user">
        <LayoutGroup id="discover-filters">
          <div
            ref={scrollerRef}
            role="group"
            aria-label="Filter videos"
            onScroll={updateEdges}
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth px-1 py-[var(--space-2)] [scroll-padding-inline:0.25rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {SECTIONS.map(({ id, label }) => {
              const selected = active === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(id)}
                  className={`interactive tap-compact relative isolate shrink-0 cursor-pointer rounded-full px-[1.125rem] py-[0.375rem] font-medium transition-colors ${
                    selected
                      ? "text-[var(--ios-bg)]"
                      : "text-[var(--ios-label-2)] hover:bg-white/10 hover:text-[var(--ios-label)]"
                  }`}
                  style={{ fontSize: "var(--text-footnote)", letterSpacing: "var(--tracking-footnote)" }}
                >
                  {selected && (
                    <motion.span
                      layoutId="active-filter"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-[var(--ios-label)]"
                      style={{ borderRadius: 9999 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </MotionConfig>

      {edges.right && (
        <button
          type="button"
          aria-label="Scroll filters right"
          onClick={() => scrollBy(1)}
          className="interactive tap-compact flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--ios-label-2)] transition-colors hover:bg-white/10 hover:text-[var(--ios-label)] cursor-pointer"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * "Up next" as a numbered play queue: position, compact frame, title. The playing item swaps
 * its number for a live equalizer.
 */
export function UpNextList({
  videos,
  activeId,
  loading,
  onSelect,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  videos: XyzVideo[];
  activeId: string;
  loading: boolean;
  onSelect: (video: XyzVideo) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  if (loading && videos.length === 0) {
    return (
      <div className="flex flex-col gap-1 pt-2" aria-busy="true" aria-label="Loading videos">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="h-4 w-5 animate-pulse rounded bg-muted" />
            <div className="aspect-[16/10] w-24 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return <p className="py-8 text-center text-subhead text-[var(--ios-label-2)]">Nothing here yet. Pick another filter.</p>;
  }

  return (
    <ol className={`flex flex-col pt-1 sm:pt-2 transition-opacity duration-200 ${loading ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
      {videos.map((video, idx) => {
        const active = video.id === activeId;
        return (
          <motion.li
            key={`${video.id}-${idx}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.32,
              delay: Math.min(idx * 0.02, 0.16),
            }}
          >
            <motion.button
              type="button"
              onClick={() => onSelect(video)}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", bounce: 0, duration: 0.2 }}
              aria-current={active ? "true" : undefined}
              className={`interactive group flex w-full items-center gap-3 rounded-[var(--radius-md)] p-2 text-left transition-colors cursor-pointer ${
                active
                  ? "bg-[rgba(10,132,255,0.12)]"
                  : "hover:bg-[var(--ios-fill-4)]"
              }`}
            >
              <span className="flex w-5 shrink-0 justify-center font-display text-footnote font-semibold tabular-nums text-[var(--ios-label-3)]">
                {active ? <EqualizerMark /> : idx + 1}
              </span>
              <span className="relative aspect-[16/10] w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={video.thumbnailUrl || `/api/xyz/thumb/${video.id}`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {active && <span aria-hidden="true" className="absolute inset-0 rounded-lg ring-2 ring-inset ring-brand" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className="line-clamp-2 font-medium leading-[1.3] transition-colors group-hover:text-[var(--ios-blue)]"
                  style={{
                    fontSize: "var(--text-callout)",
                    color: active ? "var(--ios-blue)" : "var(--ios-label)",
                    letterSpacing: "var(--tracking-callout)",
                  }}
                >
                  {video.title}
                </span>
                <span
                  className="truncate"
                  style={{ fontSize: "var(--text-caption-1)", color: "var(--ios-label-2)", letterSpacing: "var(--tracking-caption)" }}
                >
                  {isLive(video)
                    ? "Live"
                    : (hasDuration(video) ? [video.duration, video.views] : [video.views, video.uploadedAt])
                        .filter(Boolean)
                        .join(" · ")}
                </span>
              </span>
            </motion.button>
          </motion.li>
        );
      })}
      {hasMore && onLoadMore && (
        <li className="pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="interactive flex h-[var(--space-tap)] w-full items-center justify-center gap-[var(--space-2)] rounded-full border border-[var(--ios-separator)] text-callout font-medium text-[var(--ios-label-2)] transition-colors hover:border-brand/60 hover:text-foreground disabled:opacity-60 cursor-pointer"
          >
            {loadingMore && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-brand" />
            )}
            {loadingMore ? "Loading" : "Load more"}
          </button>
        </li>
      )}
    </ol>
  );
}

/** Card for the search and home grid. The first result is rendered larger as the top match. */
export function VideoCard({
  video,
  featured,
  selected = false,
  hero = true,
  onSelect,
}: {
  video: XyzVideo;
  featured: boolean;
  selected?: boolean;
  /** False for a duplicate id in the same feed: only the first can fly. */
  hero?: boolean;
  onSelect: (origin: HeroOrigin) => void;
}) {
  const thumbRef = useRef<HTMLImageElement>(null);

  const select = () => {
    const r = thumbRef.current?.getBoundingClientRect();
    onSelect(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
  };

  return (
    <motion.button
      type="button"
      onClick={select}
      aria-pressed={selected}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "tween", duration: 0.18, ease: "easeOut" }}
      className="group flex h-full w-full flex-col gap-3 text-left cursor-pointer focus-visible:rounded-[var(--radius-lg)] outline-none"
    >
      <span
        className={`relative block aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] bg-muted shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition-shadow duration-200 ease-out group-hover:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.65)] ${
          selected
            ? "ring-2 ring-[var(--ios-blue)]"
            : "ring-1 ring-[var(--ios-separator)] group-hover:ring-2 group-hover:ring-[var(--ios-blue)]/80 group-focus-visible:ring-2 group-focus-visible:ring-[var(--ios-blue)]"
        }`}
      >
        {/* The card's own frame; on select its rect is handed to <HeroFlight>. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={hero ? thumbRef : undefined}
          src={video.thumbnailUrl || `/api/xyz/thumb/${video.id}`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 ease-out motion-reduce:transition-none group-hover:scale-[1.025] group-focus-visible:scale-[1.025]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/20 via-transparent to-black/10 opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="flex h-11 w-11 scale-90 items-center justify-center rounded-full bg-black/65 text-white opacity-0 shadow-lg transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
            <Play className="size-4.5 translate-x-px fill-current text-white" />
          </span>
        </span>
        <DurationPill video={video} className="absolute left-2.5 top-2.5" />
      </span>
      <span className="flex min-w-0 flex-col gap-1 px-0.5">
        <span
          className={`line-clamp-2 font-display font-semibold leading-snug text-foreground transition-colors group-hover:text-[var(--ios-blue)] ${
            featured
              ? "text-title-2 sm:text-title-1 tracking-[var(--tracking-title-2)] sm:tracking-[var(--tracking-title-1)]"
              : "text-callout tracking-[var(--tracking-callout)]"
          }`}
        >
          {video.title}
        </span>
        <span className="text-footnote text-[var(--ios-label-2)]">{metaLine(video)}</span>
        {featured && video.description && (
          <span className="line-clamp-2 text-subhead leading-relaxed tracking-[var(--tracking-subhead)] text-[var(--ios-label-2)]">
            {video.description}
          </span>
        )}
      </span>
    </motion.button>
  );
}

/** Search page: a heading with the query, then a card grid led by the top match. */
export function SearchResults({
  query,
  videos,
  loading,
  error,
  activeVideoId,
  onSelect,
  onRetry,
}: {
  query: string;
  videos: XyzVideo[];
  loading: boolean;
  error: string | null;
  activeVideoId?: string;
  onSelect: (video: XyzVideo, origin: HeroOrigin) => void;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="search-heading" className="mx-auto w-full max-w-[1400px] px-4 pb-[calc(var(--mini-clear,0px)+var(--space-5)+var(--space-4))] pt-6 sm:px-6">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 id="search-heading" className="min-w-0 truncate font-display text-title-1 font-bold tracking-[var(--tracking-title-1)]">
          {query}
        </h1>
        {!loading && videos.length > 0 && (
          <span className="shrink-0 text-subhead text-[var(--ios-label-2)]">{videos.length} videos</span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={`flex flex-col gap-3 ${i === 0 ? "sm:col-span-2 lg:row-span-2" : ""}`}>
              <div className="aspect-video w-full animate-pulse rounded-[var(--radius-lg)] bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center" role="alert">
          <p className="text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="interactive rounded-full border border-[var(--ios-separator)] px-[var(--space-5)] py-[var(--space-2)] text-callout font-medium text-foreground transition-colors hover:border-brand/70 hover:bg-secondary cursor-pointer"
          >
            Retry search
          </button>
        </div>
      ) : videos.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          No videos match &ldquo;{query}&rdquo;. Try fewer or different words.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map((video, idx) => (
            <motion.li
              key={`${video.id}-${idx}`}
              className={idx === 0 ? "sm:col-span-2 lg:row-span-2" : ""}
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                type: "tween",
                duration: 0.22,
                ease: "easeOut",
                delay: Math.min(idx * 0.015, 0.1),
              }}
            >
              <VideoCard
                video={video}
                featured={idx === 0}
                selected={video.id === activeVideoId}
                hero={videos.findIndex((v) => v.id === video.id) === idx}
                onSelect={(origin) => onSelect(video, origin)}
              />
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Home feed: chip tabs and a quiet card grid without a rotating banner. */
export function HomeFeed({
  videos,
  activeChip,
  onSelectChip,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onSelectVideo,
  sourceLabel,
  emptyMessage,
  activeVideoId,
  emptyIsError = false,
}: {
  videos: XyzVideo[];
  activeChip: string;
  onSelectChip: (chip: string) => void;
  loading: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSelectVideo: (video: XyzVideo, origin: HeroOrigin) => void;
  sourceLabel?: string;
  emptyMessage?: string;
  activeVideoId?: string;
  emptyIsError?: boolean;
}) {
  const [filterVisible, setFilterVisible] = useState(true);

  useEffect(() => {
    let ticking = false;
    let lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    let accumulatedDelta = 0;
    const hideThreshold = 16;
    const revealThreshold = 12;

    const updateScrollDir = () => {
      const scrollY = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      // Always show when near the top (and during top bounce)
      if (scrollY < 60) {
        setFilterVisible(true);
        accumulatedDelta = 0;
        lastScrollY = scrollY;
        ticking = false;
        return;
      }

      // Avoid erratic toggle when bouncing at the bottom of the page
      if (scrollY >= maxScroll - 24) {
        ticking = false;
        return;
      }

      const delta = scrollY - lastScrollY;
      lastScrollY = scrollY;

      if (delta > 0) {
        // Scrolling downward through content
        if (accumulatedDelta < 0) accumulatedDelta = 0;
        accumulatedDelta += delta;
        if (accumulatedDelta > hideThreshold) {
          setFilterVisible(false);
        }
      } else if (delta < 0) {
        // Scrolling back upward: immediately reset downward momentum and accumulate upward travel
        if (accumulatedDelta > 0) accumulatedDelta = 0;
        accumulatedDelta += delta;
        if (accumulatedDelta < -revealThreshold) {
          setFilterVisible(true);
        }
      }

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section aria-labelledby="home-heading" className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 pb-[calc(var(--mini-clear,0px)+var(--space-5)+var(--space-4))] pt-4 sm:px-6">
      {sourceLabel && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {sourceLabel}
          </span>
        </div>
      )}

      <MotionConfig reducedMotion="user">
        <motion.div
          data-filter-bar="true"
          className="sticky top-[calc(var(--nav-height)+var(--space-3))] z-30 -mx-4 px-4 sm:-mx-6 sm:px-6"
          animate={{
            y: filterVisible ? 0 : -12,
            opacity: filterVisible ? 1 : 0,
            scale: filterVisible ? 1 : 0.98,
          }}
          transition={{
            type: "spring",
            bounce: 0,
            duration: 0.3,
          }}
          style={{
            pointerEvents: filterVisible ? "auto" : "none",
          }}
        >
          <div className="flex flex-col gap-1.5">
            <div className="w-fit max-w-full rounded-full glass-regular px-1 shadow-[0_6px_20px_rgba(0,0,0,0.24)]">
              <ChipBar active={activeChip} onSelect={onSelectChip} />
            </div>
            {loading && (
              <div className="h-0.5 w-36 overflow-hidden rounded-full bg-[var(--ios-fill-3)] ml-2" aria-hidden="true">
                <div className="h-full w-1/3 animate-indeterminate rounded-full bg-[var(--ios-blue)]" />
              </div>
            )}
          </div>
        </motion.div>
      </MotionConfig>

      {loading && videos.length === 0 ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={`flex flex-col gap-3 ${i === 0 ? "sm:col-span-2 lg:row-span-2" : ""}`}>
              <div className="aspect-video w-full animate-pulse rounded-[var(--radius-lg)] bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="py-20 text-center" role={emptyIsError ? "alert" : "status"}>
          <p className="text-callout text-[var(--ios-label-2)]">{emptyMessage ?? "No videos found for this topic. Try another category."}</p>
        </div>
      ) : (
        <>
          <motion.ul
            key={activeChip}
            className={`grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 transition-opacity duration-200 ${loading ? "opacity-50 pointer-events-none" : "opacity-100"}`}
          >
            {videos.map((video, idx) => (
              <motion.li
                key={`${video.id}-${idx}`}
                className={idx === 0 ? "sm:col-span-2 lg:row-span-2" : ""}
                initial={{ opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: "tween",
                  duration: 0.22,
                  ease: "easeOut",
                  delay: Math.min(idx * 0.015, 0.1),
                }}
              >
                <VideoCard
                  video={video}
                  featured={idx === 0}
                  selected={video.id === activeVideoId}
                  hero={videos.findIndex((v) => v.id === video.id) === idx}
                  onSelect={(origin) => onSelectVideo(video, origin)}
                />
              </motion.li>
            ))}
          </motion.ul>

          {hasMore && onLoadMore && (
            <div className="flex justify-center pt-8">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="interactive flex h-[var(--space-tap)] items-center gap-[var(--space-2)] rounded-full border border-[var(--ios-separator)] px-[var(--space-6)] text-callout font-medium text-foreground transition-colors hover:border-brand/70 hover:bg-secondary disabled:opacity-60 cursor-pointer"
              >
                {loadingMore && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-brand" />
                )}
                {loadingMore ? "Loading more videos..." : "Load more videos"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
