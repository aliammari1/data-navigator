"use client";

/**
 * DuckDB aggregate layer for report-studio (SQL pushdown).
 *
 * Instead of materializing/filtering raw rows in JS, this aggregates the active
 * dataset in DuckDB and returns only the tiny shaped result (one row per
 * channel + 24 hourly buckets + a totals row). Works for any registered dataset
 * by heuristically detecting the channel / amount / status / timestamp columns
 * from the dataset schema (same approach as the telecom feature's queries).
 *
 * When no dataset/DuckDB is reachable (browser demo, or no datasets imported),
 * callers fall back to the bundled SAMPLE_DATA so the screen still renders.
 */

import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";
import type { ReportChannel, ReportData, ReportHourly } from "../lib/types";

function qc(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function num(value: unknown): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

export interface DatasetColumnRoles {
  channel: string | null;
  amount: string | null;
  status: string | null;
  timestamp: string | null;
}

const CHANNEL_HINTS = ["channel", "canal", "service", "product", "type", "category", "operation"];
const AMOUNT_HINTS = ["amount", "montant", "revenue", "value", "total", "price", "sum"];
const STATUS_HINTS = ["status", "statut", "state", "result", "code", "outcome"];
const TS_HINTS = ["timestamp", "datetime", "date", "time", "created", "ts"];

function pickColumn(
  columns: RegisteredDataset["columns"],
  hints: string[],
  predicate?: (typeUpper: string) => boolean,
): string | null {
  // Prefer an exact-ish name hint that also satisfies the type predicate.
  for (const hint of hints) {
    const match = columns.find((c) => {
      const name = c.name.toLowerCase();
      const typeUpper = c.type.toUpperCase();
      return name.includes(hint) && (!predicate || predicate(typeUpper));
    });
    if (match) return match.name;
  }
  // Fall back to the first column matching only the predicate.
  if (predicate) {
    const typed = columns.find((c) => predicate(c.type.toUpperCase()));
    if (typed) return typed.name;
  }
  return null;
}

const isNumeric = (t: string) =>
  /INT|BIGINT|HUGEINT|TINYINT|SMALLINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL/.test(t);
const isTemporal = (t: string) => /DATE|TIME|TIMESTAMP/.test(t);
const isTextual = (t: string) => /VARCHAR|TEXT|CHAR|STRING|ENUM/.test(t);

/** Heuristically map dataset columns to the report roles. */
export function detectColumnRoles(dataset: RegisteredDataset): DatasetColumnRoles {
  const cols = dataset.columns;
  return {
    channel:
      pickColumn(cols, CHANNEL_HINTS, isTextual) ??
      cols.find((c) => isTextual(c.type.toUpperCase()))?.name ??
      null,
    amount: pickColumn(cols, AMOUNT_HINTS, isNumeric),
    status: pickColumn(cols, STATUS_HINTS, isTextual),
    timestamp: pickColumn(cols, TS_HINTS, isTemporal),
  };
}

/**
 * SQL expression that evaluates to 1 for a "successful" transaction and 0
 * otherwise, based on the detected status column. When no status column is
 * detected, every row counts as a success (so success rate is 100%).
 */
function successExpr(statusCol: string | null): string {
  if (!statusCol) return "1";
  const s = `UPPER(TRIM(CAST(${qc(statusCol)} AS VARCHAR)))`;
  // Treat common success markers as success; everything else as failure.
  return `CASE WHEN ${s} IN ('OK','SUCCESS','SUCCESSFUL','COMPLETED','VALIDE','SUCCES','APPROVED','00','0','TRUE','YES','Y','PAID') THEN 1 ELSE 0 END`;
}

function amountExpr(amountCol: string | null): string {
  return amountCol ? `COALESCE(TRY_CAST(${qc(amountCol)} AS DOUBLE), 0)` : "0";
}

/**
 * Aggregate the given dataset view into ReportData entirely in DuckDB.
 *
 * Three small queries (channels, hourly, totals) run in parallel; each returns
 * a handful of rows regardless of the underlying table size.
 */
export interface AggregateOptions {
  channelLimit?: number;
  /**
   * When true and a timestamp column is detected, restrict every aggregate to
   * the calendar day equal to `date` (so period-over-period comparison is
   * meaningful). When no timestamp column exists, the whole view is aggregated
   * and the comparison is suppressed by the caller.
   */
  scopeToDay?: boolean;
}

export async function aggregateReportData(
  dataset: RegisteredDataset,
  date: string,
  options: AggregateOptions = {},
): Promise<ReportData> {
  const channelLimit = options.channelLimit ?? 50;
  const view = dataset.viewName || dataset.id;
  const roles = detectColumnRoles(dataset);
  const success = successExpr(roles.status);
  const amount = amountExpr(roles.amount);

  const channelSelect = roles.channel
    ? `CAST(${qc(roles.channel)} AS VARCHAR)`
    : `'All Transactions'`;

  // Optional day scope (only when a timestamp column exists and the caller asks).
  const dayScope =
    options.scopeToDay && roles.timestamp
      ? `CAST(TRY_CAST(${qc(roles.timestamp)} AS TIMESTAMP) AS DATE) = DATE '${date.replaceAll("'", "")}'`
      : null;
  const whereClause = dayScope ? `WHERE ${dayScope}` : "";
  const hourlyWhere = roles.timestamp
    ? `WHERE TRY_CAST(${qc(roles.timestamp)} AS TIMESTAMP) IS NOT NULL${dayScope ? ` AND ${dayScope}` : ""}`
    : "";

  const channelSql = `
    SELECT
      ${channelSelect} AS name,
      COUNT(*) AS volume,
      100.0 * AVG(${success}) AS success_rate,
      SUM(${amount}) AS revenue
    FROM ${qc(view)}
    ${whereClause}
    GROUP BY 1
    ORDER BY volume DESC
    LIMIT ${Math.max(1, Math.floor(channelLimit))}
  `;

  const hourlySql = roles.timestamp
    ? `
      SELECT
        CAST(EXTRACT(hour FROM TRY_CAST(${qc(roles.timestamp)} AS TIMESTAMP)) AS INTEGER) AS hour,
        COUNT(*) AS count,
        100.0 * AVG(${success}) AS success_rate
      FROM ${qc(view)}
      ${hourlyWhere}
      GROUP BY 1
      ORDER BY 1
    `
    : null;

  const totalsSql = `
    SELECT
      COUNT(*) AS total,
      SUM(1 - ${success}) AS failed,
      100.0 * AVG(${success}) AS success_rate,
      SUM(${amount}) AS revenue
    FROM ${qc(view)}
    ${whereClause}
  `;

  const [channelRows, hourlyRows, totalsRows] = await Promise.all([
    runReadOnlyQuery(channelSql),
    hourlySql ? runReadOnlyQuery(hourlySql) : Promise.resolve([]),
    runReadOnlyQuery(totalsSql),
  ]);

  const topChannels: ReportChannel[] = channelRows.map((r) => ({
    name: str(r.name) || "Unknown",
    volume: num(r.volume),
    successRate: num(r.success_rate),
    revenue: num(r.revenue),
  }));

  // Densify hourly buckets to a stable 0..23 range so charts are well-formed.
  const hourlyMap = new Map<number, ReportHourly>();
  for (const r of hourlyRows) {
    const hour = num(r.hour);
    hourlyMap.set(hour, { hour, count: num(r.count), successRate: num(r.success_rate) });
  }
  const hourlyData: ReportHourly[] = hourlyMap.size
    ? Array.from(
        { length: 24 },
        (_, h) => hourlyMap.get(h) ?? { hour: h, count: 0, successRate: 0 },
      )
    : [];

  const totals = totalsRows[0] ?? {};

  return {
    date,
    totalTransactions: num(totals.total),
    successRate: num(totals.success_rate),
    totalRevenue: num(totals.revenue),
    failedTransactions: num(totals.failed),
    topChannels,
    hourlyData,
  };
}
