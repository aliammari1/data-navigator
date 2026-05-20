"use client";

/**
 * Signal Radar Agent
 * Scans approved KPIs and recent data for anomalies, drops, spikes, and risks.
 */

import { generateWithOllamaStructured } from "./ollama-provider";
import { SignalScanJsonSchema, validateSchema } from "./ai-schemas";
import { safeJsonStringify } from "./json";
import type { ColumnInfo } from "./types";
import type { KpiContract } from "./kpi/kpi-contract";
import type { AiError } from "./ai-errors";
import { aiErrorFromUnknown } from "./ai-errors";
import { runQuery } from "@/platform/duckdb/duckdb";
import { isSafeKpiSql, validateSqlDatasetScope } from "./kpi/kpi-validator";

export interface SignalRadarRequest {
  tableName: string;
  columns: ColumnInfo[];
  rowSample: Record<string, unknown>[];
  approvedKpis: KpiContract[];
  model: string;
  host: string;
}

export interface Signal {
  severity: "high" | "medium" | "low";
  metric: string;
  whatChanged: string;
  likelyReason: string;
  evidence: string;
  suggestedAction: string;
  sql: string;
}

export interface SignalRadarResult {
  signals: Signal[];
  overallConfidence: "high" | "medium" | "low";
  error?: AiError;
}

async function verifySignal(
  signal: Signal,
  tableName: string,
  columns: Array<{ name: string }>,
): Promise<Signal | null> {
  const safety = isSafeKpiSql(signal.sql);
  if (!safety.safe) {
    return null;
  }

  const scope = validateSqlDatasetScope(signal.sql, tableName, columns);
  if (!scope.valid) {
    return null;
  }

  try {
    const sql = `SELECT * FROM (${signal.sql.trim().replace(/;$/, "")}) AS moudir_signal LIMIT 25`;
    const rows = await runQuery(sql);
    if (rows.length === 0) {
      return null;
    }
    return {
      ...signal,
      evidence: `${signal.evidence} Verified query returned ${rows.length} row${rows.length === 1 ? "" : "s"}.`,
    };
  } catch {
    return null;
  }
}

export async function runSignalRadar(
  request: SignalRadarRequest,
): Promise<SignalRadarResult> {
  const { tableName, columns, rowSample, approvedKpis, model, host } = request;

  try {
    const columnPreview = columns
      .slice(0, 40)
      .map((c) => `${c.name}:${c.dbType ?? c.type}`)
      .join(", ");

    const kpiPreview = approvedKpis.length > 0
      ? approvedKpis.map((k) => `${k.name} = ${k.numerator}/${k.denominator}`).join("; ")
      : "No approved KPIs yet. Scan raw metrics.";

    const result = await generateWithOllamaStructured<{
      signals: Signal[];
      overallConfidence: "high" | "medium" | "low";
    }>(
      model,
      [
        "You are Moudir AI Signal Radar. Scan the dataset for important changes and risks.",
        "You understand Tunisian Arabic, French, English, and Arabizi.",
        "Return valid JSON matching the signal scan schema exactly.",
        "Focus on: sudden drops, abnormal spikes, missing channels, period-over-period shifts, data freshness issues, high-value failure clusters.",
        "Each signal must include a SQL query that can verify it.",
      ].join("\n"),
      safeJsonStringify({
        tableName,
        columns: columnPreview,
        approvedKpis: kpiPreview,
        sampleRows: rowSample.slice(0, 8),
      }),
      SignalScanJsonSchema,
      { host, temperature: 0 },
    );

    const validated = validateSchema<typeof result>(
      result,
      ["signals", "overallConfidence"],
    );

    if (!validated.valid) {
      return {
        signals: [],
        overallConfidence: "low",
        error: { code: "SCHEMA_MISMATCH", message: validated.error, retryable: true },
      };
    }

    const verifiedSignals: Signal[] = [];
    for (const signal of validated.data.signals.slice(0, 10)) {
      const verified = await verifySignal(signal, tableName, columns);
      if (verified) {
        verifiedSignals.push(verified);
      }
    }

    if (validated.data.signals.length > 0 && verifiedSignals.length === 0) {
      return {
        signals: [],
        overallConfidence: "low",
        error: {
          code: "SQL_UNSAFE",
          message: "All signal verification SQL was rejected or failed.",
          retryable: true,
        },
      };
    }

    return {
      signals: verifiedSignals,
      overallConfidence: validated.data.overallConfidence,
    };
  } catch (err) {
    return {
      signals: [],
      overallConfidence: "low",
      error: aiErrorFromUnknown(err),
    };
  }
}
