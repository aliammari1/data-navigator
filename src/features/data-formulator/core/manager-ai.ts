"use client";

import { ManagerAnswerJsonSchema, validateSchema } from "./ai-schemas";
import { safeJsonStringify } from "./json";
import type { ManagerIntent } from "./language/intent";
import { createManagerAnswer, type ManagerAnswer } from "./manager-answer";
import { generateWithOllamaStructured } from "./ollama-provider";
import type { ColumnInfo } from "./types";

interface ManagerAiRequest {
  prompt: string;
  normalizedPrompt: string;
  intent: ManagerIntent;
  tableName: string;
  columns: ColumnInfo[];
  rowSample: Record<string, unknown>[];
  retrievedContext?: string[];
  model: string;
  host: string;
}

interface RawManagerAnswer {
  title?: unknown;
  summary?: unknown;
  decision?: unknown;
  impact?: unknown;
  nextAction?: unknown;
  assumptions?: unknown;
  evidence?: unknown;
  followUps?: unknown;
  confidence?: unknown;
  language?: unknown;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 5);
}

function parseJsonObject(text: string): RawManagerAnswer {
  try {
    return JSON.parse(text) as RawManagerAnswer;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as RawManagerAnswer;
    } catch {
      return {};
    }
  }
}

function confidence(value: unknown): ManagerAnswer["confidence"] {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function language(value: unknown): ManagerAnswer["language"] {
  return ["auto", "tounsi", "fr", "en", "ar"].includes(String(value))
    ? (value as ManagerAnswer["language"])
    : "auto";
}

function optionalText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export async function generateManagerAnswer(
  request: ManagerAiRequest,
): Promise<ManagerAnswer> {
  const columnPreview = request.columns
    .slice(0, 80)
    .map((column) => `${column.name}:${column.dbType ?? column.type}`)
    .join(", ");

  // Use structured output with JSON schema for reliable parsing
  const response = await generateWithOllamaStructured(
    request.model,
    [
      "You are Moudir AI, an offline manager copilot for custom KPI and business analysis.",
      "You must answer like a practical non-technical manager assistant.",
      "You understand English, French, Arabic, Tunisian Arabic, and Arabizi.",
      "Do not invent exact numbers unless they are in the supplied sample.",
      "Return valid JSON matching the requested schema.",
      "Keep the summary short and actionable.",
      "Always include a decision, business impact, and nextAction when the prompt contains enough context.",
      "Decision must be a recommendation, not a restatement. If evidence is weak, recommend the safest next diagnostic step.",
      "Evidence must cite available columns, sample fields, or executed local context only.",
      "Prefer local-first, open-source-friendly guidance. Do not recommend proprietary observability services or external data processors.",
      "If you need more information, set needsReview to true and explain what is missing in the summary.",
    ].join("\n"),
    safeJsonStringify({
      intent: request.intent,
      userPrompt: request.prompt,
      normalizedPrompt: request.normalizedPrompt,
      tableName: request.tableName,
      columns: columnPreview,
      sampleRows: request.rowSample.slice(0, 8),
      retrievedContext: request.retrievedContext?.slice(0, 6) ?? [],
    }),
    ManagerAnswerJsonSchema,
    {
      host: request.host,
      temperature: 0,
    },
  );

  const validated = validateSchema<{
    title: string;
    summary: string;
    decision?: string;
    impact?: string;
    nextAction?: string;
    assumptions: string[];
    evidence: string[];
    followUps: string[];
    confidence: ManagerAnswer["confidence"];
    language: ManagerAnswer["language"];
    needsReview?: boolean;
  }>(response, [
    "title",
    "summary",
    "assumptions",
    "evidence",
    "followUps",
    "confidence",
    "language",
  ]);

  if (!validated.valid) {
    // Fallback: try loose parsing
    const fallback = parseJsonObject(JSON.stringify(response));
    const title = String(fallback.title ?? "AI answer").trim();
    const summary = String(
      fallback.summary ?? "The model returned invalid JSON.",
    ).trim();
    return createManagerAnswer({
      intent: request.intent,
      title: title || "AI answer",
      summary,
      decision: optionalText(fallback.decision),
      impact: optionalText(fallback.impact),
      nextAction: optionalText(fallback.nextAction),
      assumptions: asStringList(fallback.assumptions),
      evidence: asStringList(fallback.evidence),
      followUps: asStringList(fallback.followUps),
      confidence: confidence(fallback.confidence),
      language: language(fallback.language),
      status: "needs-input",
    });
  }

  const data = validated.data;
  return createManagerAnswer({
    intent: request.intent,
    title: data.title || "AI answer",
    summary: data.summary || "The model responded with an empty summary.",
    decision: optionalText(data.decision),
    impact: optionalText(data.impact),
    nextAction: optionalText(data.nextAction),
    assumptions: asStringList(data.assumptions),
    evidence: asStringList(data.evidence),
    followUps: asStringList(data.followUps),
    confidence: confidence(data.confidence),
    language: language(data.language),
    status: data.needsReview ? "needs-input" : "ready",
  });
}
