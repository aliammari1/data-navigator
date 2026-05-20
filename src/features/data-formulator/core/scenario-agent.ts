"use client";

/**
 * Scenario Simulator Agent
 * Runs what-if scenarios via AI-planned SQL modifications.
 */

import { generateWithOllamaStructured } from "./ollama-provider";
import { ScenarioJsonSchema, validateSchema } from "./ai-schemas";
import { safeJsonStringify } from "./json";
import type { ColumnInfo } from "./types";
import type { AiError } from "./ai-errors";
import { aiErrorFromUnknown } from "./ai-errors";
import { runQuery } from "@/platform/duckdb/duckdb";
import { isSafeKpiSql, validateSqlDatasetScope } from "./kpi/kpi-validator";

export interface ScenarioRequest {
  prompt: string;
  tableName: string;
  columns: ColumnInfo[];
  rowSample: Record<string, unknown>[];
  model: string;
  host: string;
}

export interface ScenarioResult {
  name: string;
  assumptions: Array<{ variable: string; change: string; value: number }>;
  baseCaseSql: string;
  scenarioSql: string;
  estimatedImpact: {
    metric: string;
    baseValue: number;
    scenarioValue: number;
    delta: number;
    deltaPercent: number;
  };
  confidence: "high" | "medium" | "low";
  caveats: string[];
  error?: AiError;
}

async function runScenarioValue(
  sql: string,
  tableName: string,
  columns: Array<{ name: string }>,
): Promise<number> {
  const safety = isSafeKpiSql(sql);
  if (!safety.safe) {
    throw new Error(safety.reason);
  }
  const scope = validateSqlDatasetScope(sql, tableName, columns);
  if (!scope.valid) {
    throw new Error(scope.reason);
  }

  const query = `SELECT * FROM (${sql.trim().replace(/;$/, "")}) AS moudir_scenario LIMIT 1`;
  const rows = await runQuery(query);
  const firstRow = rows[0] ?? {};
  for (const value of Object.values(firstRow)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  throw new Error("Scenario SQL did not return a numeric value");
}

export async function runScenarioAgent(
  request: ScenarioRequest,
): Promise<ScenarioResult> {
  const { prompt, tableName, columns, rowSample, model, host } = request;

  try {
    const columnPreview = columns
      .slice(0, 30)
      .map((c) => `${c.name}:${c.dbType ?? c.type}`)
      .join(", ");

    const result = await generateWithOllamaStructured<{
      name: string;
      assumptions: Array<{ variable: string; change: string; value: number }>;
      baseCaseSql: string;
      scenarioSql: string;
      estimatedImpact: {
        metric: string;
        baseValue: number;
        scenarioValue: number;
        delta: number;
        deltaPercent: number;
      };
      confidence: "high" | "medium" | "low";
      caveats: string[];
    }>(
      model,
      [
        "You are Moudir AI Scenario Simulator. Define and estimate what-if scenarios.",
        "You understand Tunisian Arabic, French, English, and Arabizi.",
        "Return valid JSON matching the scenario schema exactly.",
        "Be conservative with estimates. Always include caveats.",
      ].join("\n"),
      safeJsonStringify({
        userPrompt: prompt,
        tableName,
        columns: columnPreview,
        sampleRows: rowSample.slice(0, 6),
      }),
      ScenarioJsonSchema,
      { host, temperature: 0.2 },
    );

    const validated = validateSchema<typeof result>(
      result,
      ["name", "assumptions", "baseCaseSql", "scenarioSql", "estimatedImpact", "confidence"],
    );

    if (!validated.valid) {
      return {
        name: "Scenario failed",
        assumptions: [],
        baseCaseSql: "",
        scenarioSql: "",
        estimatedImpact: {
          metric: "",
          baseValue: 0,
          scenarioValue: 0,
          delta: 0,
          deltaPercent: 0,
        },
        confidence: "low",
        caveats: [validated.error],
        error: { code: "SCHEMA_MISMATCH", message: validated.error, retryable: true },
      };
    }

    const [baseValue, scenarioValue] = await Promise.all([
      runScenarioValue(validated.data.baseCaseSql, tableName, columns),
      runScenarioValue(validated.data.scenarioSql, tableName, columns),
    ]);
    const delta = scenarioValue - baseValue;
    const deltaPercent = baseValue === 0 ? 0 : (delta / baseValue) * 100;

    return {
      ...validated.data,
      estimatedImpact: {
        ...validated.data.estimatedImpact,
        baseValue,
        scenarioValue,
        delta,
        deltaPercent,
      },
    };
  } catch (err) {
    return {
      name: "Scenario failed",
      assumptions: [],
      baseCaseSql: "",
      scenarioSql: "",
      estimatedImpact: {
        metric: "",
        baseValue: 0,
        scenarioValue: 0,
        delta: 0,
        deltaPercent: 0,
      },
      confidence: "low",
      caveats: [],
      error: aiErrorFromUnknown(err),
    };
  }
}
