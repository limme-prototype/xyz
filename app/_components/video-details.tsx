"use client";

import { useState } from "react";
import { Check, Link2, Repeat } from "lucide-react";
import type { VideoMeta } from "@/lib/types/player";

interface VideoDetailsProps {
  meta: VideoMeta | null;
  autoplay: boolean;
  onToggleAutoplay: () => void;
  onCopyLink: () => void;
}

/** Title, stats, actions and an expandable description.
 *  iOS HIG: Title 1 (28pt bold) for the video title.
 *  Secondary label for stats. systemBlue tint on active controls.
 *  Minimum 44pt tap targets on all buttons.
 */
export function VideoDetails({ meta, autoplay, onToggleAutoplay, onCopyLink }: VideoDetailsProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!meta) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {/* iOS skeleton: secondarySystemBackground fill, 10pt radius */}
        <div className="h-7 w-3/4 animate-pulse rounded-[var(--radius-md)] bg-[var(--ios-fill-4)]" />
        <div className="h-4 w-1/3 animate-pulse rounded-[var(--radius-md)] bg-[var(--ios-fill-4)]" />
      </div>
    );
  }

  const stats = [meta.views, meta.uploadedAt].filter(Boolean).join(" · ");
  const hasDescription = Boolean(meta.description?.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {/* iOS Title 1: 28pt Bold, tight tracking */}
          <h1
            className="line-clamp-2 font-bold leading-[1.08]"
            style={{ fontSize: "var(--text-title-1)", letterSpacing: "var(--tracking-title-1)" }}
          >
            {meta.title || "Untitled video"}
          </h1>
          {/* iOS secondaryLabel — footnote size */}
          {stats && (
            <p
              className="mt-1.5"
              style={{
                fontSize: "var(--text-footnote)",
                color: "var(--ios-label-2)",
                letterSpacing: "var(--tracking-footnote)",
              }}
            >
              {stats}
            </p>
          )}
        </div>

        {/* Action buttons — iOS "bordered" style (secondary action) */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Autoplay toggle — systemBlue tint when active */}
          <button
            type="button"
            onClick={onToggleAutoplay}
            aria-pressed={autoplay}
            title="Play the next video automatically"
            className="interactive flex items-center gap-2 rounded-[var(--radius-md)] border px-4 cursor-pointer"
            style={{
              minHeight: "var(--space-tap)",      /* 44pt */
              fontSize: "var(--text-callout)",    /* 16pt */
              fontWeight: 500,
              letterSpacing: "var(--tracking-callout)",
              borderColor: autoplay ? "var(--ios-blue)" : "var(--ios-separator)",
              background: autoplay ? "rgba(10,132,255,0.15)" : "transparent",
              color: autoplay ? "var(--ios-blue)" : "var(--ios-label-2)",
            }}
          >
            <Repeat className="size-4" />
            Autoplay
          </button>

          {/* Copy link — plain bordered button */}
          <button
            type="button"
            onClick={() => {
              onCopyLink();
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="interactive flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--ios-separator)] px-4 cursor-pointer"
            style={{
              minHeight: "var(--space-tap)",
              fontSize: "var(--text-callout)",
              fontWeight: 500,
              letterSpacing: "var(--tracking-callout)",
              color: copied ? "var(--ios-green)" : "var(--ios-label-2)",
            }}
          >
            {copied
              ? <Check className="size-4" style={{ color: "var(--ios-green)" }} />
              : <Link2 className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      {/* Description — iOS secondarySystemBackground fill, 10pt radius */}
      {hasDescription && (
        <div
          className="rounded-[var(--radius-md)] px-4 py-3 glass-thin"
          style={{ fontSize: "var(--text-callout)", lineHeight: "var(--leading-callout)" }}
        >
          <p
            className={`whitespace-pre-line break-words ${expanded ? "" : "line-clamp-2"}`}
            style={{ color: "var(--ios-label)" }}
          >
            {meta.description}
          </p>
          {/* iOS "show more" — systemBlue tint, no border */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="interactive mt-2 cursor-pointer"
            style={{
              fontSize: "var(--text-callout)",
              fontWeight: 500,
              color: "var(--ios-blue)",
              minHeight: "var(--space-tap)",
            }}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}
