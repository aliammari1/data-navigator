"use client";

import { useEffect, useRef, useState } from "react";
import { type DeepPartial, parsePartialJson } from "./structured";

/**
 * Progressive streaming JSON parser hook for offline local SLM completions.
 *
 * As the local model generates tokens via IPC or Web Worker, this hook translates
 * the raw token buffer into an incrementally updated JavaScript object tree
 * using `partial-json`. UI components (AgentLane, Swarm cards, Chart previews) can
 * render live previews without waiting for full completion.
 */
export function useStreamingJson<T = unknown>(rawStream: string): {
  data: DeepPartial<T> | null;
  hasData: boolean;
} {
  const [data, setData] = useState<DeepPartial<T> | null>(() => parsePartialJson<T>(rawStream));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!rawStream) {
      setData(null);
      return;
    }

    if (typeof window !== "undefined") {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(() => {
        const parsed = parsePartialJson<T>(rawStream);
        if (parsed !== null) {
          setData(parsed);
        }
      });
    } else {
      const parsed = parsePartialJson<T>(rawStream);
      if (parsed !== null) {
        setData(parsed);
      }
    }

    return () => {
      if (rafRef.current && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [rawStream]);

  return {
    data,
    hasData: data !== null,
  };
}
