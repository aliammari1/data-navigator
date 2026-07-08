"use client";

/**
 * Offline narration hook for the AI briefing feature.
 *
 * Primary path: the bundled Kokoro-82M neural TTS worker (deterministic, fully
 * offline, OS-independent). Fallback: `window.speechSynthesis` only when the
 * worker or model is unavailable (e.g. weights not yet cached). Either way the
 * UI calls `speak(text)` / `stop()` and reads `speaking` / `loading`.
 */

import * as Comlink from "comlink";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasElectronVoice, sherpaSpeak } from "@/platform/electron/electron-fs";
import type { NarratorWorkerApi } from "../core/narrator.worker";

type Mode = "kokoro" | "speech" | "none";

function detectMode(): Mode {
  if (typeof window === "undefined") return "none";
  if (typeof Worker !== "undefined") return "kokoro";
  if ("speechSynthesis" in window) return "speech";
  return "none";
}

export interface NarratorState {
  speaking: boolean;
  loading: boolean;
  available: boolean;
  engine: "Kokoro (offline)" | "System voices" | "Unavailable";
}

export function useNarrator() {
  const [state, setState] = useState<NarratorState>({
    speaking: false,
    loading: false,
    available: false,
    engine: "Unavailable",
  });
  const workerRef = useRef<Worker | null>(null);
  const proxyRef = useRef<Comlink.Remote<NarratorWorkerApi> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const modeRef = useRef<Mode>("none");
  const kokoroFailedRef = useRef(false);

  useEffect(() => {
    const mode = detectMode();
    modeRef.current = mode;
    setState((s) => ({
      ...s,
      available: mode !== "none",
      engine:
        mode === "kokoro"
          ? "Kokoro (offline)"
          : mode === "speech"
            ? "System voices"
            : "Unavailable",
    }));
    // Teardown only touches refs (stable), so this effect runs once on mount.
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      workerRef.current?.terminate();
      workerRef.current = null;
      proxyRef.current = null;
    };
  }, []);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const ensureProxy = useCallback((): Comlink.Remote<NarratorWorkerApi> | null => {
    if (proxyRef.current) return proxyRef.current;
    try {
      const worker = new Worker(new URL("../core/narrator.worker.ts", import.meta.url), {
        type: "module",
        name: "ai-briefing-narrator",
      });
      workerRef.current = worker;
      proxyRef.current = Comlink.wrap<NarratorWorkerApi>(worker);
      return proxyRef.current;
    } catch {
      return null;
    }
  }, []);

  const speakWithSpeechSynthesis = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.97;
    utterance.onend = () => setState((s) => ({ ...s, speaking: false }));
    utterance.onerror = () => setState((s) => ({ ...s, speaking: false }));
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setState((s) => ({ ...s, speaking: true, engine: "System voices" }));
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      cleanup();

      // Prefer the bundled native sherpa-onnx lane (fully offline, zero new
      // assets) whenever running inside Electron.
      if (hasElectronVoice()) {
        setState((s) => ({ ...s, loading: true, engine: "Kokoro (offline)" }));
        try {
          const { wav } = await sherpaSpeak(clean, { voice: "af_heart" });
          setState((s) => ({ ...s, loading: false }));
          const blob = new Blob([new Uint8Array(wav)], { type: "audio/wav" });
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => setState((s) => ({ ...s, speaking: false }));
          audio.onerror = () => setState((s) => ({ ...s, speaking: false }));
          setState((s) => ({ ...s, speaking: true }));
          await audio.play();
          return;
        } catch {
          setState((s) => ({ ...s, loading: false }));
          // Fall through to the kokoro worker / speechSynthesis chain below.
        }
      }

      // Try Kokoro first unless it has previously failed in this session.
      if (modeRef.current === "kokoro" && !kokoroFailedRef.current) {
        const proxy = ensureProxy();
        if (proxy) {
          setState((s) => ({ ...s, loading: true, engine: "Kokoro (offline)" }));
          try {
            const result = await proxy.synthesize(clean);
            setState((s) => ({ ...s, loading: false }));
            if (result) {
              const blob = new Blob([result.bytes], { type: result.type });
              const url = URL.createObjectURL(blob);
              urlRef.current = url;
              const audio = new Audio(url);
              audioRef.current = audio;
              audio.onended = () => setState((s) => ({ ...s, speaking: false }));
              audio.onerror = () => setState((s) => ({ ...s, speaking: false }));
              setState((s) => ({ ...s, speaking: true }));
              await audio.play();
              return;
            }
          } catch {
            kokoroFailedRef.current = true;
            setState((s) => ({ ...s, loading: false }));
          }
        }
      }

      // Fallback to OS voices.
      speakWithSpeechSynthesis(clean);
    },
    [cleanup, ensureProxy, speakWithSpeechSynthesis],
  );

  const stop = useCallback(() => {
    cleanup();
    setState((s) => ({ ...s, speaking: false, loading: false }));
  }, [cleanup]);

  return { ...state, speak, stop };
}
