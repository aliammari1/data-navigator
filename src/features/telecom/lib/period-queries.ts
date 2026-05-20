/**
 * Period-aware queries — accept (dateFrom, dateTo) and return aggregates
 * scoped to that range. Used by Period Studio + Day Analytics tabs.
 */

import { safeNum } from "@/features/telecom/lib/format";
import {
  buildSpecDateFilter,
  ensureTelecomEnrichedView,
  SPEC_DECLINED_FILTER,
  SPEC_INSTANCE_FILTER,
  SPEC_REFUND_FILTER,
  SPEC_SUCCESS_FILTER,
  transactionDayExpr,
  transactionHourExpr,
} from "@/features/telecom/lib/queries";
import { canalCaseExpr, qc, sqlLiteral } from "@/features/telecom/lib/sql";
import {
  RAW_TRANSACTION_STATUS_EXPR,
  REPORT_DOUBT_STATUS_CODES,
  REPORT_HOLD_STATUS_CODES,
  SPEC_STATUS_CODES,
  SPEC_SUBMITTED_FILTER,
} from "@/features/telecom/lib/status-definitions";
import type { ColumnMapping } from "@/features/telecom/types";
import { runQuery } from "@/platform/duckdb/duckdb";

export interface PeriodKPI {
  total: number;
  success: number;
  declined: number;
  refund: number;
  instance: number;
  submitted: number;
  amount: number;
  successRate: number;
  uniqueCustomers: number;
  uniqueAccounts: number;
  uniqueBrands: number;
  avgAmount: number;
}

const SUB_STATUS_GROUPS: Array<{
  label: string;
  parent: "INSTANCE" | "SUCCESS" | "REFUND" | "DECLINED" | "SUBMITTED";
  codes: string[];
}> = [
  {
    label: "HOLD",
    parent: "INSTANCE",
    codes: REPORT_HOLD_STATUS_CODES,
  },
  {
    label: "DOUBT",
    parent: "INSTANCE",
    codes: REPORT_DOUBT_STATUS_CODES,
  },
  {
    label: "SUCCESS",
    parent: "SUCCESS",
    codes: SPEC_STATUS_CODES.success,
  },
  { label: "REFUND", parent: "REFUND", codes: SPEC_STATUS_CODES.refund },
  {
    label: "DECLINED",
    parent: "DECLINED",
    codes: SPEC_STATUS_CODES.declined,
  },
  {
    label: "SUBMITTED",
    parent: "SUBMITTED",
    codes: SPEC_STATUS_CODES.submitted,
  },
];

export const SUB_STATUS_DEFS = SUB_STATUS_GROUPS;
export async function fetchPeriodKPI(
  table: string,
  m: ColumnMapping,
  dateFrom: string,
  dateTo: string,
): Promise<PeriodKPI | null> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m.transactionDate);
  const enriched = `${table}_enriched`;
  const hasEnriched = await ensureTelecomEnrichedView(table, m);

  const mapPeriodKpi = (r: Record<string, unknown>): PeriodKPI => {
    const total = safeNum(r.total);
    const success = safeNum(r.success);

    return {
      total,
      success,
      declined: safeNum(r.declined),
      refund: safeNum(r.refund),
      instance: safeNum(r.instance),
      submitted: safeNum(r.submitted),
      amount: safeNum(r.amount),
      avgAmount: safeNum(r.avg_amount),
      uniqueCustomers: safeNum(r.unique_customers),
      uniqueAccounts: safeNum(r.unique_accounts),
      uniqueBrands: safeNum(r.unique_brands),
      successRate: total > 0 ? (success / total) * 100 : 0,
    };
  };

  if (hasEnriched) {
    try {
      const rows = await runQuery(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE _status_norm = 'SUCCESS') AS success,
          COUNT(*) FILTER (WHERE _status_norm = 'DECLINED') AS declined,
          COUNT(*) FILTER (WHERE _status_norm = 'REFUND') AS refund,
          COUNT(*) FILTER (WHERE _status_norm = 'INSTANCE') AS instance,
          COUNT(*) FILTER (WHERE _status_norm = 'SUBMITTED') AS submitted,
          ROUND(SUM(_amount) FILTER (WHERE _status_norm = 'SUCCESS'), 3) AS amount,
          ROUND(AVG(_amount) FILTER (WHERE _status_norm = 'SUCCESS'), 3) AS avg_amount,
          APPROX_COUNT_DISTINCT(_customer_id) AS unique_customers,
          APPROX_COUNT_DISTINCT(CAST(ACCOUNT_ID AS VARCHAR)) AS unique_accounts,
          APPROX_COUNT_DISTINCT(CAST(BRAND_D AS VARCHAR)) AS unique_brands
        FROM ${qc(enriched)}
        WHERE 1=1 ${df}
      `);

      if (!rows[0]) return null;

      return mapPeriodKpi(rows[0]);
    } catch {
      // Fall back to the raw table below.
    }
  }

  try {
    const rows = await runQuery(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE ${SPEC_SUCCESS_FILTER}) AS success,
          COUNT(*) FILTER (WHERE ${SPEC_DECLINED_FILTER}) AS declined,
          COUNT(*) FILTER (WHERE ${SPEC_REFUND_FILTER}) AS refund,
          COUNT(*) FILTER (WHERE ${SPEC_INSTANCE_FILTER}) AS instance,
          COUNT(*) FILTER (WHERE ${SPEC_SUBMITTED_FILTER}) AS submitted,
          ROUND(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)) FILTER (WHERE ${SPEC_SUCCESS_FILTER}), 3) AS amount,
          ROUND(AVG(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)) FILTER (WHERE ${SPEC_SUCCESS_FILTER}), 3) AS avg_amount,
          APPROX_COUNT_DISTINCT(CAST(CUSTOMER_MSISDN AS VARCHAR)) AS unique_customers,
          APPROX_COUNT_DISTINCT(CAST(ACCOUNT_ID AS VARCHAR)) AS unique_accounts,
          APPROX_COUNT_DISTINCT(CAST(BRAND_D AS VARCHAR)) AS unique_brands
        FROM ${qc(table)}
        WHERE 1=1 ${df}
      `);

    return rows[0] ? mapPeriodKpi(rows[0]) : null;
  } catch {
    return null;
  }
}

export interface SubStatusRow {
  parent: string;
  code: string;
  count: number;
  amount: number;
  share: number;
}

export async function fetchSubStatusBreakdown(
  table: string,
  m: ColumnMapping,
  dateFrom: string,
  dateTo: string,
): Promise<SubStatusRow[]> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m.transactionDate);

  const codeToParent = new Map<string, string>();

  for (const g of SUB_STATUS_GROUPS) {
    for (const c of g.codes) codeToParent.set(c, g.parent);
  }

  const allCodes = SUB_STATUS_GROUPS.flatMap((g) => g.codes);
  const inList = allCodes.map((c) => `'${c}'`).join(",");

  try {
    const rows = await runQuery(`
      SELECT
        ${RAW_TRANSACTION_STATUS_EXPR} AS code,
        COUNT(*) AS n,
        ROUND(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)), 3) AS amount
      FROM ${qc(table)}
      WHERE ${RAW_TRANSACTION_STATUS_EXPR} IN (${inList})
      ${df}
      GROUP BY 1
      ORDER BY 2 DESC
    `);

    const total = rows.reduce((a, r) => a + safeNum(r.n), 0);

    return rows.map((r) => {
      const code = String(r.code ?? "");

      return {
        parent: codeToParent.get(code) ?? "OTHER",
        code,
        count: safeNum(r.n),
        amount: safeNum(r.amount),
        share: total > 0 ? (safeNum(r.n) / total) * 100 : 0,
      };
    });
  } catch {
    return [];
  }
}

export interface TopAccountRow {
  msisdn: string;
  name: string;
  total: number;
  success: number;
  amount: number;
  successRate: number;
  favCanal: string;
}

export async function fetchTopAccounts(
  table: string,
  m: ColumnMapping,
  dateFrom: string,
  dateTo: string,
  limit = 25,
  by: "amount" | "count" = "amount",
): Promise<TopAccountRow[]> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m.transactionDate);
  const ms = qc(m.msisdn);
  const nm = qc(m.serviceName);
  const canal = canalCaseExpr(m);
  const orderCol = by === "amount" ? "amount" : "total";

  try {
    const rows = await runQuery(`
      SELECT
        CAST(${ms} AS VARCHAR) AS msisdn,
        FIRST(CAST(${nm} AS VARCHAR)) AS name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ${SPEC_SUCCESS_FILTER}) AS success,
        ROUND(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)) FILTER (WHERE ${SPEC_SUCCESS_FILTER}), 3) AS amount,
        MODE(${canal}) AS fav_canal
      FROM ${qc(table)}
      WHERE ${ms} IS NOT NULL AND CAST(${ms} AS VARCHAR) <> ''
      ${df}
      GROUP BY 1
      ORDER BY ${orderCol} DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => {
      const t = safeNum(r.total);
      const s = safeNum(r.success);

      return {
        msisdn: String(r.msisdn ?? ""),
        name: String(r.name ?? ""),
        total: t,
        success: s,
        amount: safeNum(r.amount),
        successRate: t > 0 ? (s / t) * 100 : 0,
        favCanal: String(r.fav_canal ?? ""),
      };
    });
  } catch {
    return [];
  }
}

export interface DayBucketRow {
  day: string;
  total: number;
  success: number;
  declined: number;
  amount: number;
}

export async function fetchDayBuckets(
  table: string,
  m: ColumnMapping,
  dateFrom: string,
  dateTo: string,
): Promise<DayBucketRow[]> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m.transactionDate);
  const dayExpr = transactionDayExpr(m.transactionDate);

  try {
    const rows = await runQuery(`
      SELECT
        CAST(${dayExpr} AS VARCHAR) AS day,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ${SPEC_SUCCESS_FILTER}) AS success,
        COUNT(*) FILTER (WHERE ${SPEC_DECLINED_FILTER}) AS declined,
        ROUND(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)) FILTER (WHERE ${SPEC_SUCCESS_FILTER}), 3) AS amount
      FROM ${qc(table)}
      WHERE ${dayExpr} IS NOT NULL ${df}
      GROUP BY 1
      ORDER BY 1
    `);

    return rows.map((r) => ({
      day: String(r.day ?? "").slice(0, 10),
      total: safeNum(r.total),
      success: safeNum(r.success),
      declined: safeNum(r.declined),
      amount: safeNum(r.amount),
    }));
  } catch {
    return [];
  }
}

export async function fetchAvailableDays(
  table: string,
  m?: ColumnMapping,
): Promise<string[]> {
  const dayExpr = transactionDayExpr(m?.transactionDate ?? "TRANSACTION_DATE");

  try {
    const rows = await runQuery(`
      SELECT DISTINCT CAST(${dayExpr} AS VARCHAR) AS day
      FROM ${qc(table)}
      WHERE ${dayExpr} IS NOT NULL
      ORDER BY 1 DESC
    `);

    return rows
      .map((r) => String(r.day ?? "").slice(0, 10))
      .filter((d) => d.length === 10);
  } catch {
    return [];
  }
}

export interface CanalHourMatrix {
  canal: string;
  hour: number;
  total: number;
  success: number;
  declined: number;
}

export async function fetchCanalHourPeriod(
  table: string,
  m: ColumnMapping,
  dateFrom: string,
  dateTo: string,
): Promise<CanalHourMatrix[]> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m.transactionDate);
  const canal = canalCaseExpr(m);
  const hr = transactionHourExpr(m.transactionDate);

  try {
    const rows = await runQuery(`
      SELECT
        ${canal} AS canal,
        ${hr} AS hour,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ${SPEC_SUCCESS_FILTER}) AS success,
        COUNT(*) FILTER (WHERE ${SPEC_DECLINED_FILTER}) AS declined
      FROM ${qc(table)}
      WHERE ${hr} BETWEEN 0 AND 23 AND ${canal} != 'Other' ${df}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    return rows.map((r) => ({
      canal: String(r.canal ?? ""),
      hour: safeNum(r.hour),
      total: safeNum(r.total),
      success: safeNum(r.success),
      declined: safeNum(r.declined),
    }));
  } catch {
    return [];
  }
}

export interface BrandRow {
  brandId: number;
  brandName: string;
  total: number;
  success: number;
  amount: number;
  successRate: number;
}

export async function fetchBrandBreakdown(
  table: string,
  m: ColumnMapping,
  dateFrom: string,
  dateTo: string,
  limit = 30,
): Promise<BrandRow[]> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m.transactionDate);

  try {
    const rows = await runQuery(`
      SELECT
        TRY_CAST(BRAND_D AS INTEGER) AS brand_id,
        FIRST(CAST(BRAND_NAME AS VARCHAR)) AS brand_name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ${SPEC_SUCCESS_FILTER}) AS success,
        ROUND(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)) FILTER (WHERE ${SPEC_SUCCESS_FILTER}), 3) AS amount
      FROM ${qc(table)}
      WHERE BRAND_D IS NOT NULL ${df}
      GROUP BY 1
      ORDER BY total DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => {
      const t = safeNum(r.total);
      const s = safeNum(r.success);

      return {
        brandId: safeNum(r.brand_id),
        brandName: String(r.brand_name ?? ""),
        total: t,
        success: s,
        amount: safeNum(r.amount),
        successRate: t > 0 ? (s / t) * 100 : 0,
      };
    });
  } catch {
    return [];
  }
}

export interface RowAnomaly {
  canal: string;
  hour: number;
  total: number;
  success: number;
  successRate: number;
  z: number;
  reason: string;
}

/**
 * Anomaly detector: flag canal-hour cells whose success rate is far from
 * the canal's average (z-score), or whose volume is a big spike.
 */
export async function fetchAnomalies(
  table: string,
  m: ColumnMapping,
  dateFrom: string,
  dateTo: string,
): Promise<RowAnomaly[]> {
  try {
    const cells = await fetchCanalHourPeriod(table, m, dateFrom, dateTo);
    const byCanal = new Map<string, CanalHourMatrix[]>();
    for (const c of cells) {
      const arr = byCanal.get(c.canal) ?? [];
      arr.push(c);
      byCanal.set(c.canal, arr);
    }
    const anomalies: RowAnomaly[] = [];
    for (const [canal, list] of byCanal) {
      if (list.length < 3) continue;
      const rates = list.map((c) =>
        c.total > 0 ? (c.success / c.total) * 100 : 0,
      );
      const totals = list.map((c) => c.total);
      const meanR = avg(rates);
      const sdR = stddev(rates, meanR);
      const meanT = avg(totals);
      const sdT = stddev(totals, meanT);
      for (let i = 0; i < list.length; i++) {
        const cell = list[i];
        const r = rates[i];
        const zRate = sdR > 0 ? (r - meanR) / sdR : 0;
        const zVol = sdT > 0 ? (cell.total - meanT) / sdT : 0;
        const reasons: string[] = [];
        if (zRate <= -2)
          reasons.push(`Taux réussite chute (z=${zRate.toFixed(2)})`);
        if (zVol >= 2.5) reasons.push(`Pic de volume (z=${zVol.toFixed(2)})`);
        if (zVol <= -2.5) reasons.push(`Volume anormalement bas`);
        if (reasons.length > 0) {
          anomalies.push({
            canal,
            hour: cell.hour,
            total: cell.total,
            success: cell.success,
            successRate: r,
            z: Math.max(Math.abs(zRate), Math.abs(zVol)),
            reason: reasons.join(" · "),
          });
        }
      }
    }
    return anomalies.sort((a, b) => b.z - a.z).slice(0, 50);
  } catch (err) {
    console.error("[fetchAnomalies] Error:", err);
    return [];
  }
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export async function fetchRowCount(table: string): Promise<number> {
  try {
    const rows = await runQuery(`SELECT COUNT(*) AS n FROM ${qc(table)}`);
    return safeNum(rows[0]?.n);
  } catch {
    return 0;
  }
}

export async function fetchRowCountForDay(
  table: string,
  m: ColumnMapping,
  day: string,
): Promise<number> {
  const dayExpr = transactionDayExpr(m.transactionDate);

  try {
    const rows = await runQuery(`
      SELECT COUNT(*) AS n
      FROM ${qc(table)}
      WHERE ${dayExpr} = STRPTIME(${sqlLiteral(day)},'%Y-%m-%d')
    `);

    return safeNum(rows[0]?.n);
  } catch {
    return 0;
  }
}
