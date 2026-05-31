"use client";

/**
 * Investigation Agent
 * Coordinates the "Why did it change?" analysis pipeline.
 * Uses the bounded agent loop to run segmentation tools and build evidence.
 */

import { runAgentLoop } from "./agent-loop";
import type { AiError } from "./ai-errors";
import { aiErrorFromUnknown, createAiError } from "./ai-errors";
import { InvestigationPlanJsonSchema, validateSchema } from "./ai-schemas";
import { safeJsonStringify } from "./json";
import { generateWithOllamaStructured } from "./ollama-provider";
import type { ToolContext } from "./tool-registry";
import type { ColumnInfo } from "./types";

export interface InvestigationRequest {
  prompt: string;
  normalizedPrompt: string;
  tableName: string;
  columns: ColumnInfo[];
  rowSample: Record<string, unknown>[];
  retrievedContext?: string[];
  model: string;
  host: string;
}

export interface InvestigationResult {
  targetMetric: string;
  currentPeriod: { start: string; end: string };
  baselinePeriod: { start: string; end: string };
  steps: Array<{
    dimension: string;
    reason: string;
    sql: string;
    result?: Record<string, unknown>[];
  }>;
  hypothesis: string;
  confidence: "high" | "medium" | "low";
  error?: AiError;
}

export async function runInvestigation(
  request: InvestigationRequest,
): Promise<InvestigationResult> {
  const {
    prompt,
    normalizedPrompt,
    tableName,
    columns,
    rowSample,
    retrievedContext,
    model,
    host,
  } = request;

  try {
    // Step 1: Get investigation plan from edge AI
    const columnPreview = columns
      .slice(0, 40)
      .map((c) => `${c.name}:${c.dbType ?? c.type}`)
      .join(", ");

    const plan = await generateWithOllamaStructured<{
      targetMetric: string;
      currentPeriod: { start: string; end: string };
      baselinePeriod: { start: string; end: string };
      segmentationSteps: Array<{
        dimension: string;
        reason: string;
        sql: string;
      }>;
      hypothesis: string;
      confidence: "high" | "medium" | "low";
    }>(
      model,
      [
        "You are Moudir AI Investigation Agent. Plan a root-cause analysis.",
        "You understand Tunisian Arabic, French, English, and Arabizi.",
        "Return valid JSON matching the investigation schema exactly.",
        "Only propose segmentation dimensions that exist in the columns.",
      ].join("\n"),
      safeJsonStringify({
        userPrompt: prompt,
        normalizedPrompt,
        tableName,
        columns: columnPreview,
        sampleRows: rowSample.slice(0, 8),
        retrievedContext: retrievedContext?.slice(0, 6) ?? [],
      }),
      InvestigationPlanJsonSchema,
      { host, temperature: 0 },
    );

    const validated = validateSchema<typeof plan>(plan, [
      "targetMetric",
      "currentPeriod",
      "baselinePeriod",
      "segmentationSteps",
      "hypothesis",
      "confidence",
    ]);

    if (!validated.valid) {
      return {
        targetMetric: "unknown",
        currentPeriod: { start: "", end: "" },
        baselinePeriod: { start: "", end: "" },
        steps: [],
        hypothesis: "Failed to parse investigation plan",
        confidence: "low",
        error: createAiError("SCHEMA_MISMATCH", validated.error),
      };
    }

    // Step 2: Execute segmentation tools via agent loop
    const ctx: ToolContext = {
      tableName,
      columns: columns.map((c) => ({ name: c.name, type: c.type })),
    };

    const executedSteps: InvestigationResult["steps"] = [];

    for (const step of validated.data.segmentationSteps.slice(0, 4)) {
      try {
        const result = await runAgentLoop(
          model,
          host,
          "You are a data analyst. Execute the requested segmentation and return a concise summary of the top contributors.",
          `Segment ${validated.data.targetMetric} by ${step.dimension}. Reason: ${step.reason}. SQL: ${step.sql}`,
          ctx,
        );

        executedSteps.push({
          dimension: step.dimension,
          reason: step.reason,
          sql: step.sql,
          result: result.success
            ? (result.steps[0]?.result?.data as Record<string, unknown>[])
            : undefined,
        });
      } catch {
        executedSteps.push({
          dimension: step.dimension,
          reason: step.reason,
          sql: step.sql,
        });
      }
    }

    return {
      targetMetric: validated.data.targetMetric,
      currentPeriod: validated.data.currentPeriod,
      baselinePeriod: validated.data.baselinePeriod,
      steps: executedSteps,
      hypothesis: validated.data.hypothesis,
      confidence: validated.data.confidence,
    };
  } catch (err) {
    return {
      targetMetric: "unknown",
      currentPeriod: { start: "", end: "" },
      baselinePeriod: { start: "", end: "" },
      steps: [],
      hypothesis: "Investigation failed",
      confidence: "low",
      error: aiErrorFromUnknown(err),
    };
  }
}
