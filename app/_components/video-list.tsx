"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Flame, HeartCrack, Play, Sparkles, Terminal, X } from "lucide-react";
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

/** Card for the search and home grid. The first result is rendered larger as the top match. */
export function VideoCard({ video, featured, onSelect }: { video: XyzVideo; featured: boolean; onSelect: () => void }) {
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

export interface MemeSlide {
  id: string;
  badge: string;
  icon: "broken-heart" | "flame" | "code" | "sparkles";
  title: string;
  message: string;
  actionText?: string;
  actionChip?: string;
}

export const MEME_SLIDES: MemeSlide[] = [
  {
    id: "meme-crush",
    badge: "HEARTBREAK SURVIVAL",
    icon: "broken-heart",
    title: "Chhop srolanh ke mneak eng tv...",
    message: "ឈប់ស្រឡាញ់គេម្នាក់ឯងទៅ... បើ crush មិនតប chat មកស្ដាប់ចម្រៀង Tena & Suly Pheng បំភ្លេចទុក្ខ ឬរៀន Coding រក $3k/ខែ ឱ្យគេស្ដាយក្រោយវិញ!",
    actionText: "Hear Healing Hits",
    actionChip: "music",
  },
  {
    id: "khmer-flow",
    badge: "FLOW & ENERGY",
    icon: "flame",
    title: "VannDa, Baramey & The New Wave",
    message: "បទល្បីៗមិនទាន់ចេញក្ដៅៗ ស្ដាប់ច្បាស់ត្រចៀកកម្រិត Hi-Fi គ្មាន ad រំខាន ជាមួយ floating mini-player ជាប់អេក្រង់ជានិច្ច។",
    actionText: "Play Khmer Wave",
    actionChip: "new-khmer",
  },
  {
    id: "deep-learning",
    badge: "GRIND & TECH",
    icon: "code",
    title: "Build, Learn & Upgrade Your Career",
    message: "ពី Harvard CS50, Python, React រហូតដល់វិទ្យាសាស្ត្រលំហ។ រៀនដោយផ្តោតអារម្មណ៍ គ្មាន recommendation loop នាំឱ្យវង្វេង។",
    actionText: "Start Learning",
    actionChip: "learning",
  },
  {
    id: "zen-focus",
    badge: "NIGHT PRODUCTIVITY",
    icon: "sparkles",
    title: "Pure Sound, Zero Bullshit",
    message: "xyz player រចនាឡើងសម្រាប់អ្នកចូលចិត្តបទភ្លេង និងចំណេះដឹង។ minimize បានគ្រប់ពេល និង search រកអ្វីក៏ងាយស្រួល។",
    actionText: "Explore Lo-Fi",
    actionChip: "lofi",
  },
];

function SlideIcon({ type }: { type: MemeSlide["icon"] }) {
  switch (type) {
    case "broken-heart":
      return <HeartCrack className="size-5 text-brand" />;
    case "flame":
      return <Flame className="size-5 text-amber-500" />;
    case "code":
      return <Terminal className="size-5 text-emerald-500" />;
    case "sparkles":
      return <Sparkles className="size-5 text-cyan-400" />;
  }
}

export function MemeCarouselBanner({
  slides = MEME_SLIDES,
  onAction,
  onDismiss,
}: {
  slides?: MemeSlide[];
  onAction: (chip: string) => void;
  onDismiss?: () => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const slide = slides[currentIdx] || slides[0];

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [slides.length]);

  const prevSlide = () => setCurrentIdx((prev) => (prev - 1 + slides.length) % slides.length);
  const nextSlide = () => setCurrentIdx((prev) => (prev + 1) % slides.length);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-r from-brand/10 via-background/90 to-card p-4 sm:p-5 shadow-xl backdrop-blur min-h-[106px] sm:min-h-[92px] flex flex-col justify-center">
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card border border-border/80 shadow-md">
            <SlideIcon type={slide.icon} />
          </div>
          <div key={slide.id} className="flex flex-col gap-1 min-w-0 flex-1 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand px-2 py-0.5 font-display text-[10px] font-extrabold tracking-wider text-primary-foreground uppercase shadow-sm shrink-0">
                {slide.badge}
              </span>
              <h3 className="font-display text-sm font-bold text-foreground sm:text-base truncate">
                {slide.title}
              </h3>
            </div>
            <div className="h-10 sm:h-9 flex items-center">
              <p className="text-xs font-normal leading-relaxed text-muted-foreground sm:text-sm line-clamp-2 max-w-2xl">
                {slide.message}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
          {/* Slide dots and nav arrows */}
          <div className="flex items-center gap-1.5 bg-background/50 border border-border/60 rounded-full px-2 py-1 shadow-inner">
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous slide"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <div className="flex items-center gap-1.5 px-1">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    idx === currentIdx ? "w-5 bg-brand" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next slide"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          {slide.actionText && (
            <button
              type="button"
              onClick={() => onAction(slide.actionChip || "music")}
              className="h-8 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition-transform active:scale-95 hover:opacity-90 cursor-pointer shadow-sm flex items-center justify-center"
            >
              {slide.actionText}
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss banner"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer shadow-sm"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Home feed: banner alert, chip tabs, and card grid matching search page layout with featured hero card. */
export function HomeFeed({
  videos,
  activeChip,
  onSelectChip,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onSelectVideo,
}: {
  videos: XyzVideo[];
  activeChip: string;
  onSelectChip: (chip: string) => void;
  loading: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSelectVideo: (video: XyzVideo) => void;
}) {
  const [showBanner, setShowBanner] = useState<boolean>(true);

  return (
    <section aria-labelledby="home-heading" className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 pb-20 pt-4 sm:px-6">
      {/* 1. Customizable meme / announcement slide banner */}
      {showBanner && (
        <MemeCarouselBanner
          onAction={(chip) => onSelectChip(chip)}
          onDismiss={() => setShowBanner(false)}
        />
      )}

      {/* 2. Chip bar filter tabs */}
      <div className="sticky top-14 z-30 -mx-4 bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <ChipBar active={activeChip} onSelect={onSelectChip} />
      </div>

      {/* 3. Grid listing matching search page concept with first featured card */}
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
        <div className="py-20 text-center">
          <p className="text-base text-muted-foreground">No videos found for this topic. Try another category.</p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {videos.map((video, idx) => (
              <li key={`${video.id}-${idx}`} className={idx === 0 ? "sm:col-span-2 lg:row-span-2" : ""}>
                <VideoCard
                  video={video}
                  featured={idx === 0}
                  onSelect={() => onSelectVideo(video)}
                />
              </li>
            ))}
          </ul>

          {hasMore && onLoadMore && (
            <div className="flex justify-center pt-8">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="flex h-11 items-center gap-2 rounded-full border border-border px-8 text-sm font-medium text-foreground transition-colors hover:border-brand/70 hover:bg-secondary disabled:opacity-60 cursor-pointer"
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
