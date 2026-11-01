"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { animate } from "motion/react";
import type { HeroRect } from "@/lib/motion";

const TRAVEL = 0.4;
const SINK = 0.18;
/** Longest the proxy may cover the stage if playback never reports a first frame. */
const STALL = 1400;

/**
 * Flies a card's thumbnail into the stage, so the view change reads as one
 * surface moving rather than a grid vanishing and a black box appearing.
 *
 * It is a proxy over a permanently-mounted real surface, and it is painted
 * outside the stage: inside, the stage's `overflow-hidden` clips it for most of
 * the travel and the stage's own layout projection rides on top of this
 * transform. As a viewport-fixed layer it can measure a settled destination.
 */
export function HeroFlight({
  from,
  targetRef,
  src,
  reveal,
  onDone,
}: {
  from: HeroRect;
  /** The stage box — the proxy lands exactly on it. */
  targetRef: React.RefObject<HTMLDivElement | null>;
  src: string;
  /** True once the real surface has a frame worth uncovering. */
  reveal: boolean;
  onDone: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  // Kept out of the fade effect's deps, so a re-render cannot restart the flight.
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useLayoutEffect(() => {
    const el = imgRef.current;
    const stage = targetRef.current;
    if (!el || !stage) {
      doneRef.current();
      return;
    }
    const to = stage.getBoundingClientRect();
    if (to.width < 2 || to.height < 2) {
      doneRef.current();
      return;
    }
    el.style.left = `${to.left}px`;
    el.style.top = `${to.top}px`;
    el.style.width = `${to.width}px`;
    el.style.height = `${to.height}px`;
    // Land on the stage's own corner radius, which is breakpoint-dependent.
    el.style.borderRadius = getComputedStyle(stage).borderTopLeftRadius;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dx = from.x - to.left;
    const dy = from.y - to.top;
    const sx = from.w / to.width;
    const sy = from.h / to.height;

    const place = (t: number) => {
      const k = 1 - t;
      el.style.transform = `translate3d(${dx * k}px, ${dy * k}px, 0) scale(${sx + t * (1 - sx)}, ${sy + t * (1 - sy)})`;
    };
    // Parked on the card before anything is painted, so the swap's blocking
    // commit shows a held thumbnail rather than a landed one.
    place(0);

    let run: { stop(): void } | null = null;
    // The view swap is a ~300ms long task; starting here would burn most of the
    // travel inside it. Begin on the first frame the main thread is actually free.
    const frame = requestAnimationFrame(() => {
      run = animate(0, 1, {
        duration: TRAVEL,
        // Same curve as --ease-spring in globals.css.
        ease: [0.22, 1, 0.36, 1],
        onUpdate: place,
        onComplete: () => {
          el.style.transform = "none";
        },
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      run?.stop();
    };
  }, [from, targetRef]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    let fade: { stop(): void } | null = null;
    const sink = () => {
      if (fade) return;
      fade = animate(parseFloat(el.style.opacity || "1"), 0, {
        duration: SINK,
        ease: "easeOut",
        onUpdate: (v) => {
          el.style.opacity = String(v);
        },
        onComplete: () => doneRef.current(),
      });
    };
    const stall = setTimeout(sink, STALL);
    if (reveal) {
      clearTimeout(stall);
      sink();
    }
    return () => {
      clearTimeout(stall);
      fade?.stop();
    };
  }, [reveal]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt=""
      draggable={false}
      className="pointer-events-none fixed z-[60] origin-top-left object-cover"
      style={{ willChange: "transform, opacity", transform: "none" }}
    />
  );
}
