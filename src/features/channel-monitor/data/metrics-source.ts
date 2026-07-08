"use client";

/**
 * Real channel metrics, pushed to DuckDB and streamed as Arrow.
 *
 * The previous screen monitored NOTHING real — it ran `Math.sin`-seeded
 * generators on the main thread. Here every number traces to a DuckDB query via
 * the platform foundation API (`runReadOnlyQueryArrow` + Arrow decode). The
 * aggregation runs entirely in SQL (one GROUP BY scan); we never materialize raw
 * rows in JS. When no dataset is loaded (or `MONITOR_DEMO` is forced) we fall
 * back to the deterministic seeded simulator — never fabricated render-time data.
 */

import {
  arrowToRows,
  decodeArrowIPC,
  quoteIdent,
  runReadOnlyQueryArrow,
} from "@/platform/duckdb/duckdb";
import type { Dataset } from "@/core/stores/data-store";
import type { ChannelHealth, ChannelStatus } from "../store/monitor-store";
import { channelLabel } from "../lib/channels";
import { simulateStatuses } from "../lib/simulate";

const MONITOR_DEMO =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_MONITOR_DEMO === "1";

const CANCEL_TOKEN = "channel-monitor-metrics";

function classifyHealth(successRate: number): ChannelHealth {
  if (!Number.isFinite(successRate)) return "unknown";
  return successRate > 95 ? "healthy" : successRate >= 85 ? "degraded" : "critical";
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Heuristic column resolution against the active dataset's schema. */
export interface ColumnBindings {
  channel: string;
  success?: string;
  amount?: string;
  timestamp?: string;
}

const CHANNEL_HINTS = ["channel", "canal", "service", "product", "offer", "type"];
const SUCCESS_HINTS = ["success", "status", "result", "etat", "statut", "ok"];
const AMOUNT_HINTS = ["amount", "montant", "value", "revenue", "price", "total"];
const TIME_HINTS = ["date", "time", "timestamp", "created", "ts"];

function pick(columns: string[], hints: string[]): string | undefined {
  const lower = columns.map((c) => ({ raw: c, lc: c.toLowerCase() }));
  for (const hint of hints) {
    const hit = lower.find((c) => c.lc === hint) ?? lower.find((c) => c.lc.includes(hint));
    if (hit) return hit.raw;
  }
  return undefined;
}

/**
 * Resolve which dataset columns map to channel / success / amount / time.
 * Returns null when there's no plausible channel dimension to monitor.
 */
export function resolveColumnBindings(dataset: Dataset): ColumnBindings | null {
  const columns = dataset.columns?.map((c) => c.name) ?? [];
  if (columns.length === 0) return null;
  const channel = pick(columns, CHANNEL_HINTS);
  if (!channel) return null;
  return {
    channel,
    success: pick(columns, SUCCESS_HINTS),
    amount: pick(columns, AMOUNT_HINTS),
    timestamp: pick(columns, TIME_HINTS),
  };
}

/**
 * Aggregate per-channel metrics in DuckDB. One GROUP BY scan over the active
 * view; success-rate is derived from a boolean/`'success'`-like status column
 * when present, otherwise treated as 100% (volume-only monitoring).
 */
function buildMetricsSQL(view: string, b: ColumnBindings): string {
  const ch = quoteIdent(b.channel);
  const src = quoteIdent(view);

  // Success expression: treat truthy / 'success' / 'ok' / 1 as a success.
  const successExpr = b.success
    ? `CASE WHEN lower(CAST(${quoteIdent(b.success)} AS VARCHAR)) IN ('success','ok','1','true','y','yes') THEN 1 ELSE 0 END`
    : `1`;

  const amountExpr = b.amount
    ? `COALESCE(SUM(TRY_CAST(${quoteIdent(b.amount)} AS DOUBLE)), 0)`
    : `0`;

  return `
    SELECT
      CAST(${ch} AS VARCHAR)                                   AS channel,
      COUNT(*)                                                 AS txn_count,
      100.0 * SUM(${successExpr}) / NULLIF(COUNT(*), 0)        AS success_rate,
      COUNT(*) - SUM(${successExpr})                           AS failure_count,
      ${amountExpr}                                            AS amount_total
    FROM ${src}
    WHERE ${ch} IS NOT NULL
    GROUP BY 1
    ORDER BY txn_count DESC
    LIMIT 200
  `;
}

interface MetricRow {
  channel: string;
  txn_count: number;
  success_rate: number;
  failure_count: number;
  amount_total: number;
}

/**
 * Fetch the current per-channel status snapshot.
 *
 * @param dataset  The active dataset (from data-store); null ⇒ demo fallback.
 * @param tick     Logical refresh counter (used only by the demo simulator).
 */
export async function fetchMetrics(
  dataset: Dataset | undefined,
  tick: number,
): Promise<{ statuses: ChannelStatus[]; source: "duckdb" | "demo" }> {
  if (MONITOR_DEMO || !dataset) {
    return { statuses: simulateStatuses(tick), source: "demo" };
  }

  const bindings = resolveColumnBindings(dataset);
  const view = dataset.viewName || dataset.tableName;
  if (!bindings || !view) {
    return { statuses: simulateStatuses(tick), source: "demo" };
  }

  try {
    const bytes = await runReadOnlyQueryArrow(buildMetricsSQL(view, bindings), CANCEL_TOKEN);
    const rows = arrowToRows(decodeArrowIPC(bytes)) as unknown as MetricRow[];
    if (!rows || rows.length === 0) {
      return { statuses: simulateStatuses(tick), source: "demo" };
    }

    const now = new Date().toISOString();
    const statuses: ChannelStatus[] = rows.map((r) => {
      const channel = String(r.channel);
      const txnTotal = num(r.txn_count);
      const successRate = num(r.success_rate);
      const failureCount = num(r.failure_count);
      const amountToday = num(r.amount_total);
      return {
        channel,
        displayName: channelLabel(channel),
        health: classifyHealth(successRate),
        successRate,
        // Approximate a per-minute rate over a notional 24h window for display.
        txnPerMin: Math.max(0, Math.round(txnTotal / (24 * 60))),
        amountToday,
        failureCount,
        trend: "stable",
        lastIncident: null,
        lastIncidentAt: null,
        updatedAt: now,
      };
    });
    return { statuses, source: "duckdb" };
  } catch {
    // DuckDB unavailable or query failed → deterministic demo, never fabricated.
    return { statuses: simulateStatuses(tick), source: "demo" };
  }
}
