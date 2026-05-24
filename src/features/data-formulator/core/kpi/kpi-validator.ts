"use client";

/**
 * KPI SQL Validator
 * Validates that AI-generated KPI SQL is safe and syntactically reasonable.
 */

import { runQuery } from "@/platform/duckdb/duckdb";

export interface KpiValidationResult {
  valid: boolean;
  sql: string;
  error?: string;
  sampleResult?: Record<string, unknown>;
  rowCount?: number;
  durationMs?: number;
  fieldsDetected: string[];
  warnings: string[];
}

const FORBIDDEN_PATTERN =
  /\b(DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|ATTACH|DETACH|COPY|EXECUTE|PRAGMA|VACUUM|LOAD|INSTALL)\b/i;

export function isSafeKpiSql(
  sql: string,
): { safe: true } | { safe: false; reason: string } {
  if (!sql.trim()) {
    return { safe: false, reason: "SQL is empty" };
  }

  if (!/^\s*SELECT\b/i.test(sql)) {
    return { safe: false, reason: "KPI SQL must start with SELECT" };
  }

  if (FORBIDDEN_PATTERN.test(sql)) {
    return { safe: false, reason: "Forbidden SQL keywords detected" };
  }

  if (/;.*\S/.test(sql.replace(/\s+/g, " "))) {
    return { safe: false, reason: "Multiple statements are not allowed" };
  }

  return { safe: true };
}

export async function validateKpiSql(
  sql: string,
  tableName: string,
  columns: Array<{ name: string }>,
): Promise<KpiValidationResult> {
  const safety = isSafeKpiSql(sql);
  if (!safety.safe) {
    return {
      valid: false,
      sql,
      error: safety.reason,
      fieldsDetected: [],
      warnings: [],
    };
  }

  const start = performance.now();
  const warnings: string[] = [];
  const scope = validateSqlDatasetScope(sql, tableName, columns);
  const fieldsDetected = scope.fieldsDetected;

  if (!scope.valid) {
    return {
      valid: false,
      sql,
      error: scope.reason,
      fieldsDetected,
      warnings,
    };
  }

  try {
    // Run with a small LIMIT to validate syntax and get sample
    const limited = sql.replace(/;?\s*$/, " LIMIT 5");
    const data = await runQuery(limited);
    const durationMs = Math.round(performance.now() - start);

    if (!Array.isArray(data) || data.length === 0) {
      warnings.push(
        "Query returned no rows — check filters or data availability",
      );
    }

    return {
      valid: true,
      sql,
      sampleResult: data[0],
      rowCount: data.length,
      durationMs,
      fieldsDetected,
      warnings,
    };
  } catch (err) {
    return {
      valid: false,
      sql,
      error: err instanceof Error ? err.message : String(err),
      fieldsDetected,
      warnings,
    };
  }
}

export function validateSqlDatasetScope(
  sql: string,
  tableName: string,
  columns: Array<{ name: string }>,
):
  | { valid: true; fieldsDetected: string[] }
  | { valid: false; reason: string; fieldsDetected: string[] } {
  const sqlWithoutLiterals = sql.replace(/'([^']|'')*'/g, "''");
  const fieldsDetected = columns
    .filter((col) => {
      const quoted = new RegExp(
        `"${escapeRegExp(col.name.replace('"', '""'))}"`,
        "i",
      );
      const bare = new RegExp(`\\b${escapeRegExp(col.name)}\\b`, "i");
      return quoted.test(sqlWithoutLiterals) || bare.test(sqlWithoutLiterals);
    })
    .map((col) => col.name);

  const escapedTable = tableName.replace('"', '""');
  const quotedTable = new RegExp(
    `\\bfrom\\s+"${escapeRegExp(escapedTable)}"(?:\\s|$|,)`,
    "i",
  );
  const bareTable = new RegExp(
    `\\bfrom\\s+${escapeRegExp(tableName)}(?:\\s|$|,)`,
    "i",
  );
  if (
    !quotedTable.test(sqlWithoutLiterals) &&
    !bareTable.test(sqlWithoutLiterals)
  ) {
    return {
      valid: false,
      reason: `SQL must read from the active table "${tableName}"`,
      fieldsDetected,
    };
  }

  const countAll = /\bcount\s*\(\s*(\*|1)\s*\)/i.test(sqlWithoutLiterals);
  if (fieldsDetected.length === 0 && !countAll) {
    return {
      valid: false,
      reason:
        "SQL must reference at least one known column or an explicit COUNT(*)",
      fieldsDetected,
    };
  }

  return { valid: true, fieldsDetected };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
