"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type LLMEngineState,
  type LLMModelId,
  generateText,
  getLLMEngineState,
  initLLMEngine,
  subscribeLLMEngine,
  unloadLLMEngine,
} from "@/platform/ai/llm-engine";

export function useLLMEngine(): {
  state: LLMEngineState;
  init: (model?: LLMModelId) => Promise<void>;
  generate: (
    prompt: string,
    opts?: { systemPrompt?: string; maxTokens?: number },
  ) => Promise<string>;
  unload: () => Promise<void>;
} {
  const [state, setState] = useState<LLMEngineState>(getLLMEngineState);

  useEffect(() => subscribeLLMEngine(setState), []);

  const init = useCallback((model?: LLMModelId) => initLLMEngine(model), []);

  const generate = useCallback(
    (prompt: string, opts?: { systemPrompt?: string; maxTokens?: number }) =>
      generateText(prompt, opts),
    [],
  );

  return { state, init, generate, unload: unloadLLMEngine };
}

export function useLLMGenerate(): {
  generate: (prompt: string, opts?: { systemPrompt?: string }) => Promise<string>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (prompt: string, opts?: { systemPrompt?: string }): Promise<string> => {
      setLoading(true);
      setError(null);
      try {
        return await generateText(prompt, opts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return "";
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { generate, loading, error };
}
