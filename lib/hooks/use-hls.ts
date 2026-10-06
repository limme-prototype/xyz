"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Attaches an HLS (.m3u8) stream to a <video> element.
 * Uses native HLS when the browser supports it (Safari/iOS), otherwise lazy-loads hls.js
 * so the library is only downloaded when a stream is actually played.
 */
export function useHls(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string | null,
  onError?: (message: string) => void
): void {
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let cancelled = false;
    let hls: import("hls.js").default | null = null;
    const start = () => {
      video.play().catch(() => {});
    };

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      start();
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          onErrorRef.current?.("HLS is not supported in this browser");
          return;
        }
        hls = new Hls({ enableWorker: true });
        hls.on(Hls.Events.MANIFEST_PARSED, start);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || !hls) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            onErrorRef.current?.("Stream failed to load");
            hls.destroy();
            hls = null;
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [videoRef, src]);
}
