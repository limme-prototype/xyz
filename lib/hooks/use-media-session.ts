"use client";

import { useEffect } from "react";
import { VideoMeta } from "@/lib/types/player";

interface MediaSessionCallbacks {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSeekTo?: (time: number) => void;
}

export function useMediaSession(
  meta: VideoMeta | null,
  activeVideoId: string,
  callbacks: MediaSessionCallbacks
): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    try {
      // Same-origin artwork only: users may be on networks where YouTube image hosts are blocked.
      const art = meta?.thumbnailUrl || `/api/xyz/thumb/${activeVideoId}`;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: meta?.title || "xyz",
        artist: meta?.authorName || "xyz Media Player",
        album: "xyz Distraction-Free Player",
        artwork: [
          { src: art, sizes: "128x128", type: "image/jpeg" },
          { src: art, sizes: "256x256", type: "image/jpeg" },
          { src: art, sizes: "512x512", type: "image/jpeg" },
        ],
      });

      if (callbacks.onPlay) {
        navigator.mediaSession.setActionHandler("play", () => {
          callbacks.onPlay?.();
          try {
            navigator.mediaSession.playbackState = "playing";
          } catch {}
        });
      }

      if (callbacks.onPause) {
        navigator.mediaSession.setActionHandler("pause", () => {
          callbacks.onPause?.();
          try {
            navigator.mediaSession.playbackState = "paused";
          } catch {}
        });
      }

      if (callbacks.onNext) {
        navigator.mediaSession.setActionHandler("nexttrack", () => {
          callbacks.onNext?.();
        });
      }

      if (callbacks.onPrev) {
        navigator.mediaSession.setActionHandler("previoustrack", () => {
          callbacks.onPrev?.();
        });
      }

      if (callbacks.onSeekTo) {
        navigator.mediaSession.setActionHandler("seekto", (details) => {
          if (details.seekTime !== undefined) {
            callbacks.onSeekTo?.(details.seekTime);
          }
        });
      }
    } catch {
      // Ignore unsupported browser features
    }
  }, [meta, activeVideoId, callbacks]);
}
