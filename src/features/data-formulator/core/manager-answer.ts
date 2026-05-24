"use client";

import type { AiGateResult } from "./ai-gate";
import type { ManagerIntent } from "./language/intent";

export interface ManagerAnswer {
  id: string;
  intent: ManagerIntent;
  title: string;
  summary: string;
  assumptions: string[];
  evidence: string[];
  followUps: string[];
  confidence: "low" | "medium" | "high";
  status: "ready" | "needs-input" | "error" | "running";
  language: "auto" | "tounsi" | "fr" | "en" | "ar";
  createdAt: number;
}

export function createManagerAnswer(
  answer: Omit<ManagerAnswer, "id" | "createdAt">,
): ManagerAnswer {
  return {
    ...answer,
    id: `answer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
}

export function smallTalkAnswer(): ManagerAnswer {
  return createManagerAnswer({
    intent: "ask",
    title: "Ready for your question",
    summary:
      "Tell me what you want to understand: a KPI, a dashboard, a drop explanation, a signal scan, or an executive brief.",
    assumptions: ["No analysis was run because this was a greeting."],
    evidence: [],
    followUps: [
      "Create a KPI for success rate",
      "Explain why revenue changed",
      "Build an AI dashboard",
    ],
    confidence: "high",
    status: "needs-input",
    language: "auto",
  });
}

export function aiGateAnswer(gate: AiGateResult): ManagerAnswer {
  return createManagerAnswer({
    intent: "setup",
    title: "Edge AI setup required",
    summary: gate.message,
    assumptions: [
      `Runtime: ${gate.executionMode}`,
      gate.selectedModel
        ? `Selected model: ${gate.selectedModel}`
        : "No model selected",
    ],
    evidence:
      gate.modelNames.length > 0
        ? [`Supported edge models: ${gate.modelNames.join(", ")}`]
        : ["No supported edge models were discovered."],
    followUps: [
      "Select a supported edge model",
      "Use CPU/WASM mode if WebGPU is unavailable",
    ],
    confidence: "high",
    status: "error",
    language: "auto",
  });
}
