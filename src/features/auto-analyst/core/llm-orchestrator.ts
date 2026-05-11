"use client";
/**
 * Cross-component LLM lifecycle: consent → load → ready → chat.
 * Wraps the offline pipeline in @/features/agent-canvas/core/llm.
 */

import { create } from "zustand";
import { isLoaded, loadLLM } from "@/features/agent-canvas/core/llm";

const CONSENT_KEY = "analyst.llm.consent";
const MODEL_KEY = "analyst.llm.model";
const DEFAULT_MODEL = "HuggingFaceTB/SmolLM2-360M-Instruct";

type Status = "idle" | "consent-pending" | "loading" | "ready" | "error";

interface Store {
  status: Status;
  modelId: string | null;
  progress: number;
  text: string;
  error: string | null;
  setConsentPending: () => void;
  decline: () => void;
  load: (modelId?: string) => Promise<void>;
  hasConsent: () => boolean;
}

function readConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CONSENT_KEY) === "yes";
}

function writeConsent(yes: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, yes ? "yes" : "no");
}

export const useLLMOrchestrator = create<Store>((set, _get) => ({
  status: isLoaded() ? "ready" : "idle",
  modelId:
    typeof window !== "undefined"
      ? (localStorage.getItem(MODEL_KEY) ?? null)
      : null,
  progress: 0,
  text: "",
  error: null,

  setConsentPending: () => set({ status: "consent-pending" }),

  decline: () => {
    writeConsent(false);
    set({ status: "idle" });
  },

  hasConsent: readConsent,

  load: async (modelId = DEFAULT_MODEL) => {
    writeConsent(true);
    if (typeof window !== "undefined") localStorage.setItem(MODEL_KEY, modelId);
    set({ status: "loading", error: null, modelId, progress: 0, text: "" });
    try {
      await loadLLM(modelId, (progress, text) => {
        set({ progress, text });
      });
      set({ status: "ready", progress: 1, text: "Ready" });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set({ status: "error", error });
    }
  },
}));

export function isLLMReady(): boolean {
  return useLLMOrchestrator.getState().status === "ready" || isLoaded();
}

export function ensureLLMConsent():
  | "ready"
  | "needs-consent"
  | "loading"
  | "error" {
  const s = useLLMOrchestrator.getState();
  if (s.status === "ready") return "ready";
  if (s.status === "loading") return "loading";
  if (s.status === "error") return "error";
  return "needs-consent";
}
