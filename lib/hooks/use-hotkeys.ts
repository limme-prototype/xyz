"use client";

import { useEffect } from "react";

interface HotkeyHandlers {
  onTogglePlay?: () => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onToggleMute?: () => void;
  onToggleFullscreen?: () => void;
  onToggleMini?: () => void;
  onOpenCommand?: () => void;
}

export function useHotkeys(handlers: HotkeyHandlers): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      // Spotlight / Command Palette shortcut: Cmd+K / Ctrl+K or '/'
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isInput)) {
        e.preventDefault();
        handlers.onOpenCommand?.();
        return;
      }

      // Ignore standard player keys when user is typing in an input field
      if (isInput) return;

      if (e.key === " " || e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onTogglePlay?.();
      } else if (e.key.toLowerCase() === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        handlers.onSeekForward?.();
      } else if (e.key.toLowerCase() === "j" || e.key === "ArrowLeft") {
        e.preventDefault();
        handlers.onSeekBackward?.();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        handlers.onNext?.();
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlers.onPrev?.();
      } else if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        handlers.onToggleMini?.();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        handlers.onToggleFullscreen?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
