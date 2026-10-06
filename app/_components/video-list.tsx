"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
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
 * Filter tabs: text with an accent underline. The row scrolls sideways when it overflows: by
 * mouse wheel, by the edge arrows, or by touch; the selected tab is kept in view.
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
    scrollerRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    el?.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className="relative border-b border-border">
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Filter videos"
        onScroll={updateEdges}
        className="flex gap-5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map(({ id, label }) => {
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(id)}
              className={`-mb-px shrink-0 border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors cursor-pointer ${
                selected
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {edges.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-14 items-center bg-gradient-to-r from-background via-background/90 to-transparent">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Scroll filters left"
            onClick={() => scrollBy(-1)}
            className="pointer-events-auto -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>
      )}
      {edges.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-14 items-center justify-end bg-gradient-to-l from-background via-background/90 to-transparent">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Scroll filters right"
            onClick={() => scrollBy(1)}
            className="pointer-events-auto -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
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
  if (loading) {
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
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet. Pick another filter.</p>;
  }

  return (
    <ol className="flex flex-col pt-2">
      {videos.map((video, idx) => {
        const active = video.id === activeId;
        return (
          <li key={`${video.id}-${idx}`}>
            <button
              type="button"
              onClick={() => onSelect(video)}
              aria-current={active ? "true" : undefined}
              className={`group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors cursor-pointer ${
                active ? "bg-brand/10" : "hover:bg-secondary"
              }`}
            >
              <span className="flex w-5 shrink-0 justify-center font-display text-sm font-semibold tabular-nums text-muted-foreground">
                {active ? <EqualizerMark /> : idx + 1}
              </span>
              <span className="relative aspect-[16/10] w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={video.thumbnailUrl || `/api/xyz/thumb/${video.id}`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {active && <span aria-hidden="true" className="absolute inset-0 rounded-lg ring-2 ring-inset ring-brand" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={`line-clamp-2 text-sm font-medium leading-5 ${active ? "text-brand" : "text-foreground"}`}
                >
                  {video.title}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {isLive(video)
                    ? "Live"
                    : (hasDuration(video) ? [video.duration, video.views] : [video.views, video.uploadedAt])
                        .filter(Boolean)
                        .join(" · ")}
                </span>
              </span>
            </button>
          </li>
        );
      })}
      {hasMore && onLoadMore && (
        <li className="pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-medium text-muted-foreground transition-colors hover:border-brand/60 hover:text-foreground disabled:opacity-60 cursor-pointer"
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

/** Card for the search grid. The first result is rendered larger as the top match. */
function VideoCard({ video, featured, onSelect }: { video: XyzVideo; featured: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex h-full w-full flex-col gap-3 text-left cursor-pointer ${featured ? "sm:col-span-2 lg:row-span-2" : ""}`}
    >
      <span className="relative block aspect-video w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-border transition-shadow group-hover:ring-2 group-hover:ring-brand/70 group-focus-visible:ring-2 group-focus-visible:ring-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={video.thumbnailUrl || `/api/xyz/thumb/${video.id}`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25"
        >
          <span className="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-brand text-primary-foreground opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
            <Play className="size-5 translate-x-px fill-current" />
          </span>
        </span>
        <DurationPill video={video} className="absolute left-2.5 top-2.5" />
      </span>
      <span className="flex flex-col gap-1 px-0.5">
        <span
          className={`line-clamp-2 font-display font-semibold leading-snug text-foreground ${
            featured ? "text-xl sm:text-2xl" : "text-base"
          }`}
        >
          {video.title}
        </span>
        <span className="text-xs text-muted-foreground">{metaLine(video)}</span>
        {featured && video.description && (
          <span className="mt-1 line-clamp-3 max-w-prose text-sm leading-6 text-muted-foreground">
            {video.description}
          </span>
        )}
      </span>
    </button>
  );
}

/** Search page: a heading with the query, then a card grid led by the top match. */
export function SearchResults({
  query,
  videos,
  loading,
  onSelect,
}: {
  query: string;
  videos: XyzVideo[];
  loading: boolean;
  onSelect: (video: XyzVideo) => void;
}) {
  return (
    <section aria-labelledby="search-heading" className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 id="search-heading" className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {query}
        </h1>
        {!loading && videos.length > 0 && (
          <span className="shrink-0 text-sm text-muted-foreground">{videos.length} videos</span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={`flex flex-col gap-3 ${i === 0 ? "sm:col-span-2 lg:row-span-2" : ""}`}>
              <div className="aspect-video w-full animate-pulse rounded-2xl bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          No videos match &ldquo;{query}&rdquo;. Try fewer or different words.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map((video, idx) => (
            <li key={`${video.id}-${idx}`} className={idx === 0 ? "sm:col-span-2 lg:row-span-2" : ""}>
              <VideoCard video={video} featured={idx === 0} onSelect={() => onSelect(video)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
