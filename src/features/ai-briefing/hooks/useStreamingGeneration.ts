"use client";

/**
 * Streaming generation hook for the AI briefing feature.
 *
 * Routes through the unified offline-first provider (`useAI`) instead of the
 * legacy WebGPU-only `llm-engine`. The transformers.js provider already runs
 * inference in a Web Worker and supports token streaming, so:
 *  - first tokens appear in well under a second (no full-document wait),
 *  - generation is cancelable via AbortController,
 *  - and the render thread is never blocked by the model.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAI } from "@/platform/ai/provider";

export interface StreamingGenerationState {
  text: string;
  busy: boolean;
  error: string | null;
}

export function useStreamingGeneration() {
  const ai = useAI();
  const [state, setState] = useState<StreamingGenerationState>({
    text: "",
    busy: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const run = useCallback(
    async (
      system: string,
      prompt: string,
      opts?: { maxTokens?: number; temperature?: number },
    ): Promise<string> => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setState({ text: "", busy: true, error: null });

      let acc = "";
      try {
        const result = await ai.generate({
          system,
          prompt,
          maxTokens: opts?.maxTokens ?? 700,
          temperature: opts?.temperature ?? 0.6,
          signal: ac.signal,
          onToken: (t) => {
            acc += t;
            setState((s) => (s.busy ? { ...s, text: acc } : s));
          },
        });
        const final = result.text || acc;
        setState({ text: final, busy: false, error: null });
        return final;
      } catch (err) {
        if (ac.signal.aborted) {
          setState((s) => ({ ...s, busy: false }));
          return acc;
        }
        const message = err instanceof Error ? err.message : "Generation failed. Please try again.";
        setState({ text: acc, busy: false, error: message });
        throw err;
      }
    },
    [ai],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, busy: false }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ text: "", busy: false, error: null });
  }, []);

  return { ...state, run, cancel, reset };
}
