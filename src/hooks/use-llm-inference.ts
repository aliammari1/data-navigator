"use client";

import { useCallback, useRef, useState } from "react";
import type { LLMInferRequest, LLMWorkerMessage } from "@/workers/llm.worker";

export interface UseLLMInferenceOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface UseLLMInferenceReturn {
  output: string;
  loading: boolean;
  error: string | null;
  infer: (prompt: string) => void;
  cancel: () => void;
}

let _worker: Worker | null = null;

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL("../../workers/llm.worker", import.meta.url));
  }
  return _worker;
}

export function useLLMInference(
  opts: UseLLMInferenceOptions,
): UseLLMInferenceReturn {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    activeIdRef.current = null;
    setLoading(false);
  }, []);

  const infer = useCallback(
    (prompt: string) => {
      const id = `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeIdRef.current = id;
      setOutput("");
      setError(null);
      setLoading(true);

      const worker = getWorker();

      const handler = (e: MessageEvent<LLMWorkerMessage>) => {
        const msg = e.data as LLMWorkerMessage & { id?: string };
        if (msg.id !== id) return;

        if (e.data.type === "INFER_CHUNK") {
          if (activeIdRef.current === id) {
            const chunk = (
              e.data as Extract<LLMWorkerMessage, { type: "INFER_CHUNK" }>
            ).chunk;
            setOutput((prev) => prev + chunk);
          }
        } else if (e.data.type === "INFER_DONE") {
          worker.removeEventListener("message", handler);
          if (activeIdRef.current === id) setLoading(false);
        } else if (e.data.type === "INFER_ERROR") {
          worker.removeEventListener("message", handler);
          if (activeIdRef.current === id) {
            setError(
              (e.data as Extract<LLMWorkerMessage, { type: "INFER_ERROR" }>)
                .error,
            );
            setLoading(false);
          }
        }
      };

      worker.addEventListener("message", handler);

      const request: LLMInferRequest = {
        id,
        type: "INFER",
        payload: {
          prompt,
          systemPrompt: opts.systemPrompt ?? "",
          maxTokens: opts.maxTokens,
        },
      };
      worker.postMessage(request);
    },
    [opts.maxTokens, opts.systemPrompt],
  );

  return { output, loading, error, infer, cancel };
}
