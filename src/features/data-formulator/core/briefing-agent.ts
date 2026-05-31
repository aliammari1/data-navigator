"use client";

/**
 * Briefing Agent
 * Generates executive briefings from analysis context.
 */

import type { AiError } from "./ai-errors";
import { aiErrorFromUnknown } from "./ai-errors";
import { BriefJsonSchema, validateSchema } from "./ai-schemas";
import { safeJsonStringify } from "./json";
import { generateWithOllamaStructured } from "./ollama-provider";
import type { ColumnInfo } from "./types";

export interface BriefingRequest {
  prompt: string;
  context: {
    tableName: string;
    columns: ColumnInfo[];
    rowSample: Record<string, unknown>[];
    recentAnswer?: string;
    recentEvidence?: string[];
    retrievedContext?: string[];
  };
  model: string;
  host: string;
}

export interface BriefingResult {
  title: string;
  audience: string;
  durationSeconds: number;
  keyPoints: string[];
  recommendations: string[];
  risks: string[];
  nextSteps: string[];
  tone: "formal" | "casual" | "technical";
  error?: AiError;
}

export async function runBriefingAgent(
  request: BriefingRequest,
): Promise<BriefingResult> {
  const { prompt, context, model, host } = request;

  try {
    const columnPreview = context.columns
      .slice(0, 30)
      .map((c) => `${c.name}:${c.dbType ?? c.type}`)
      .join(", ");

    const result = await generateWithOllamaStructured<{
      title: string;
      audience: string;
      durationSeconds: number;
      keyPoints: string[];
      recommendations: string[];
      risks: string[];
      nextSteps: string[];
      tone: "formal" | "casual" | "technical";
    }>(
      model,
      [
        "You are Moudir AI Briefing Agent. Create concise executive communications.",
        "You understand Tunisian Arabic, French, English, and Arabizi.",
        "Return valid JSON matching the briefing schema exactly.",
        "Keep keyPoints to 3-5 bullets. Be specific and actionable.",
      ].join("\n"),
      safeJsonStringify({
        userPrompt: prompt,
        tableName: context.tableName,
        columns: columnPreview,
        sampleRows: context.rowSample.slice(0, 6),
        recentAnswer: context.recentAnswer,
        recentEvidence: context.recentEvidence,
        retrievedContext: context.retrievedContext?.slice(0, 6) ?? [],
      }),
      BriefJsonSchema,
      { host, temperature: 0.2 },
    );

    const validated = validateSchema<typeof result>(result, [
      "title",
      "audience",
      "durationSeconds",
      "keyPoints",
      "recommendations",
      "nextSteps",
    ]);

    if (!validated.valid) {
      return {
        title: "Briefing failed",
        audience: "",
        durationSeconds: 0,
        keyPoints: [validated.error],
        recommendations: [],
        risks: [],
        nextSteps: [],
        tone: "formal",
        error: {
          code: "SCHEMA_MISMATCH",
          message: validated.error,
          retryable: true,
        },
      };
    }

    return validated.data;
  } catch (err) {
    return {
      title: "Briefing failed",
      audience: "",
      durationSeconds: 0,
      keyPoints: [],
      recommendations: [],
      risks: [],
      nextSteps: [],
      tone: "formal",
      error: aiErrorFromUnknown(err),
    };
  }
}
