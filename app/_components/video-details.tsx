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

/** Title, stats, actions and an expandable description. */
export function VideoDetails({ meta, autoplay, onToggleAutoplay, onCopyLink }: VideoDetailsProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!meta) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="h-7 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const stats = [meta.views, meta.uploadedAt].filter(Boolean).join(" · ");
  const hasDescription = Boolean(meta.description?.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="line-clamp-2 font-display text-2xl font-semibold leading-tight tracking-tight">
            {meta.title || "Untitled video"}
          </h1>
          {stats && <p className="mt-1.5 text-sm text-muted-foreground">{stats}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleAutoplay}
            aria-pressed={autoplay}
            title="Play the next video automatically"
            className={`flex h-9 items-center gap-2 rounded-[10px] border px-3 text-sm font-medium transition-colors cursor-pointer ${
              autoplay
                ? "border-brand/50 bg-brand/10 text-brand"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Repeat className="size-4" />
            Autoplay
          </button>
          <button
            type="button"
            onClick={() => {
              onCopyLink();
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex h-9 items-center gap-2 rounded-[10px] border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            {copied ? <Check className="size-4 text-brand" /> : <Link2 className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      {hasDescription && (
        <div className="rounded-xl bg-secondary px-4 py-3 text-sm leading-6 text-foreground/90">
          <p className={`whitespace-pre-line break-words ${expanded ? "" : "line-clamp-2"}`}>{meta.description}</p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}
