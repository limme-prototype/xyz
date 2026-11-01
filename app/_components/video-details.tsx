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

/** Video title, stats, actions and an expandable description. */
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
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h1
            className="line-clamp-2 text-title-3 font-bold leading-[1.12] tracking-[var(--tracking-title-3)] sm:text-title-2 sm:tracking-[var(--tracking-title-2)] lg:text-title-1 lg:tracking-[var(--tracking-title-1)]"
          >
            {meta.title || "Untitled video"}
          </h1>
          {/* iOS secondaryLabel — footnote size */}
          {stats && (
            <p
              className="mt-1 sm:mt-1.5"
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

      {hasDescription && (
        <div
          className="rounded-[var(--radius-md)] px-3 py-2 glass-thin sm:px-4 sm:py-3"
          style={{ fontSize: "var(--text-subhead)", lineHeight: "var(--leading-subhead)" }}
        >
          <div className={expanded ? "" : "flex min-w-0 items-center gap-2"}>
            <p
              className={`whitespace-pre-line break-words ${expanded ? "" : "line-clamp-1 min-w-0 flex-1 sm:line-clamp-2"}`}
              style={{ color: "var(--ios-label)" }}
            >
              {meta.description}
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={`interactive cursor-pointer ${expanded ? "mt-2 min-h-[var(--space-tap)]" : "min-h-8 shrink-0 px-1"}`}
              style={{
                fontSize: "var(--text-footnote)",
                fontWeight: 500,
                color: "var(--ios-blue)",
              }}
            >
              {expanded ? "Show less" : "More"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
