"use client";

import { useEffect, useRef } from "react";

let audioCtxInstance: AudioContext | null = null;
let silentOscInstance: OscillatorNode | null = null;
let silentGainInstance: GainNode | null = null;

export function ensureAudioContext(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioCtxInstance) {
      audioCtxInstance = new AudioCtx();
    }

    if (audioCtxInstance.state === "suspended") {
      audioCtxInstance.resume().catch(() => {});
    }

    if (!silentOscInstance && audioCtxInstance.state === "running") {
      silentGainInstance = audioCtxInstance.createGain();
      silentGainInstance.gain.setValueAtTime(0.00001, audioCtxInstance.currentTime);

      silentOscInstance = audioCtxInstance.createOscillator();
      silentOscInstance.frequency.setValueAtTime  (440, audioCtxInstance.currentTime);
      silentOscInstance.connect(silentGainInstance);
      silentGainInstance.connect(audioCtxInstance.destination);
      silentOscInstance.start();
    }
  } catch {
    // Gracefully handle browser policy restrictions prior to user gesture
  }
}

export function useAudioKeepalive(): void {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const unlock = () => {
      ensureAudioContext();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}
