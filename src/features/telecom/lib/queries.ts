import { safeNum } from "@/features/telecom/lib/format";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import {
  canalCaseExpr,
  canalWhere,
  colExpr,
  hourExpr,
  qc,
  sqlLiteral,
  statusNorm,
} from "@/features/telecom/lib/sql";
import {
  buildRawStatusFilterForColumn,
  DEFAULT_STATUS_MAPPINGS,
  SPEC_DECLINED_FILTER,
  SPEC_INSTANCE_FILTER,
  SPEC_REFUND_FILTER,
  SPEC_STATUS_CODES,
  SPEC_SUCCESS_FILTER,
} from "@/features/telecom/lib/status-definitions";
import type {
  CanalHourCell,
  CanalKey,
  ColumnMapping,
  CustomerProfileData,
  DailyTrendRow,
  FilterState,
  HourlyRow,
  KPISummary,
  OperatorRow,
  RawRow,
  RawStatusRow,
  RegionRow,
  ServiceCodeRow,
  SortDir,
  StatusMapping,
  StatusRow,
} from "@/features/telecom/types";
import { runQuery } from "@/platform/duckdb/duckdb";

// ─── Canal label map (must stay in sync with canalCaseExpr THEN clauses) ────────

export const CANAL_KEY_TO_LABEL: Record<CanalKey, string> = {
  bill_payment: "Bill Payment",
  voice_fixed_ttcash: "Fixed by TTCASH",
  voice_fixed_voucher: "Fixed by Voucher",
  voice_mobile_ttcash: "Mobile by TTCASH",
  voice_mobile_voucher: "Mobile by Voucher",
  data_sabba: "Internet Sabba",
  data_evoucher: "Data by Voucher",
  voucher_for_payment: "Voucher For Payment",
  credit_transfer: "Credit Transfer",
  voucher_convergent: "Voucher Convergent Management",
};

// ─── Raw canal row (no React.ElementType — enrichment happens in page.tsx) ───────

export interface RawCanalRow {
  key: CanalKey;
  label: string;
  total: number;
  success: number;
  declined: number;
  refund: number;
  instance: number;
  submitted: number;
  amount: number;
  successRate: number;
  avgAmount: number;
  share: number;
}

// ─── Spec-based channel stats ─────────────────────────────────────────────────

export interface SpecChRow {
  canal: string;
  nombre: number;
  montant: number;
}

export {
  SPEC_DECLINED_FILTER,
  SPEC_INSTANCE_FILTER,
  SPEC_REFUND_FILTER,
  SPEC_SUCCESS_FILTER,
};

const enrichmentKeys = new Map<string, string>();
const enrichmentInFlight = new Map<string, Promise<boolean>>();

function enrichmentKey(m: ColumnMapping, sm: StatusMapping[]): string {
  return JSON.stringify({ mapping: m, statuses: sm });
}

export function transactionDateExpr(dateColumn = "TRANSACTION_DATE"): string {
  const c = qc(dateColumn);

  return `COALESCE(
    TRY_CAST(${c} AS TIMESTAMP),
    TRY_CAST(CAST(${c} AS VARCHAR) AS TIMESTAMP),
    TRY_STRPTIME(CAST(${c} AS VARCHAR), '%Y-%m-%d %H:%M:%S'),
    TRY_STRPTIME(SPLIT_PART(CAST(${c} AS VARCHAR), ' ', 1), '%Y-%m-%d'),
    TRY_STRPTIME(CAST(${c} AS VARCHAR), '%d/%m/%Y %H:%M:%S'),
    TRY_STRPTIME(SPLIT_PART(CAST(${c} AS VARCHAR), ' ', 1), '%d/%m/%Y')
  )`;
}

export function transactionDayExpr(dateColumn = "TRANSACTION_DATE"): string {
  return `DATE_TRUNC('day', ${transactionDateExpr(dateColumn)})`;
}

export function transactionHourExpr(dateColumn = "TRANSACTION_DATE"): string {
  const c = qc(dateColumn);
  // Direct string extraction - much faster than EXTRACT(HOUR FROM transactionDateExpr())
  // Assumes format "DD/MM/YYYY HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
  return `TRY_CAST(SPLIT_PART(SPLIT_PART(CAST(${c} AS VARCHAR),' ',2),':',1) AS INTEGER)`;
}

function dateParamExpr(value: string): string {
  const v = sqlLiteral(value);

  return `COALESCE(
    TRY_STRPTIME(${v}, '%Y-%m-%d'),
    TRY_STRPTIME(${v}, '%m/%d/%Y'),
    TRY_STRPTIME(${v}, '%d/%m/%Y')
  )`;
}

export function buildSpecDateFilter(
  dateFrom: string,
  dateTo: string,
  dateColumn = "TRANSACTION_DATE",
): string {
  if (!dateFrom && !dateTo) return "";

  const e = transactionDateExpr(dateColumn);

  if (dateFrom && dateTo) {
    return ` AND CAST(${e} AS DATE) BETWEEN CAST(${dateParamExpr(
      dateFrom,
    )} AS DATE) AND CAST(${dateParamExpr(dateTo)} AS DATE)`;
  }

  if (dateFrom) {
    return ` AND CAST(${e} AS DATE) >= CAST(${dateParamExpr(dateFrom)} AS DATE)`;
  }

  return ` AND CAST(${e} AS DATE) <= CAST(${dateParamExpr(dateTo)} AS DATE)`;
}

// ─── Query functions ──────────────────────────────────────────────────────────

export async function fetchKPI(
  tableName: string,
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<KPISummary | null> {
  // Use enriched view if available, otherwise fall back to base table
  const viewName = enrichedViewName(tableName);
  const source = qc(viewName); // enriched view has pre-computed columns
  const hasEnriched = await ensureTelecomEnrichedView(tableName, m, sm);

  const mapKpiRow = (r: Record<string, unknown>): KPISummary => ({
    totalTransactions: safeNum(r.total),
    successCount: safeNum(r.success_count),
    declinedCount: safeNum(r.declined_count),
    refundCount: safeNum(r.refund_count),
    instanceCount: safeNum(r.instance_count),
    submittedCount: safeNum(r.submitted_count),
    successRate: safeNum(r.success_rate),
    totalAmount: safeNum(r.total_amount),
    avgAmount: safeNum(r.avg_amount),
    avgProcessingMs: safeNum(r.avg_proc_ms),
    uniqueCustomers: safeNum(r.unique_customers),
    peakHour: safeNum(r.peak_hour),
    topErrorCode: String(r.top_error ?? "N/A"),
  });

  if (hasEnriched) {
    try {
      const rows = await runQuery(`
        SELECT
          COUNT(*)                                                                        AS total,
          COUNT(*) FILTER (WHERE _status_norm='SUCCESS') AS success_count,
          COUNT(*) FILTER (WHERE _status_norm='DECLINED') AS declined_count,
          COUNT(*) FILTER (WHERE _status_norm='REFUND') AS refund_count,
          COUNT(*) FILTER (WHERE _status_norm='INSTANCE') AS instance_count,
          COUNT(*) FILTER (WHERE _status_norm='SUBMITTED') AS submitted_count,
          ROUND(COUNT(*) FILTER (WHERE _status_norm='SUCCESS')*100.0/NULLIF(COUNT(*),0),2) AS success_rate,
          ROUND(SUM(_amount),3)                                                           AS total_amount,
          ROUND(AVG(_amount),3)                                                           AS avg_amount,
          ROUND(AVG(_proc_ms),0)                                                          AS avg_proc_ms,
          APPROX_COUNT_DISTINCT(_customer_id)                                             AS unique_customers,
          MODE(_txn_hour)                                                                 AS peak_hour,
          MODE(_error_code)                                                               AS top_error
        FROM ${source}
      `);
      if (!rows[0]) return null;
      return mapKpiRow(rows[0]);
    } catch {
      // Fall back to the raw table below.
    }
  }

  const sn = statusNorm(m, sm);
  const amt = colExpr(m.amount);
  const pms = colExpr(m.processingTimeMs);
  const id = colExpr(m.msisdn);
  const ec = colExpr(m.errorCode);
  try {
    const rows = await runQuery(`
        WITH base AS (
          SELECT
            ${sn}                          AS _status,
            TRY_CAST(${amt} AS DOUBLE)     AS _amt,
            TRY_CAST(${pms} AS DOUBLE)     AS _pms,
            CAST(${id} AS VARCHAR)         AS _id,
            CAST(${ec} AS VARCHAR)         AS _ec,
            ${hourExpr(m)}                 AS _hr
          FROM ${qc(tableName)}
        )
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE _status='SUCCESS') AS success_count,
          COUNT(*) FILTER (WHERE _status='DECLINED') AS declined_count,
          COUNT(*) FILTER (WHERE _status='REFUND') AS refund_count,
          COUNT(*) FILTER (WHERE _status='INSTANCE') AS instance_count,
          COUNT(*) FILTER (WHERE _status='SUBMITTED') AS submitted_count,
          ROUND(COUNT(*) FILTER (WHERE _status='SUCCESS')*100.0/NULLIF(COUNT(*),0),2) AS success_rate,
          ROUND(SUM(_amt),3) AS total_amount,
          ROUND(AVG(_amt),3) AS avg_amount,
          ROUND(AVG(_pms),0) AS avg_proc_ms,
          APPROX_COUNT_DISTINCT(_id) AS unique_customers,
          MODE(_hr) AS peak_hour,
          MODE(_ec) AS top_error
        FROM base
      `);
    return rows[0] ? mapKpiRow(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function fetchRawCanalSummaries(
  tableName: string,
  m: ColumnMapping,
  totalTx: number,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<RawCanalRow[]> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const canal = canalCaseExpr(m);
  const keyMap: Record<string, CanalKey> = {
    "Bill Payment": "bill_payment",
    "Fixed by TTCASH": "voice_fixed_ttcash",
    "Fixed by Voucher": "voice_fixed_voucher",
    "Mobile by TTCASH": "voice_mobile_ttcash",
    "Mobile by Voucher": "voice_mobile_voucher",
    "Internet Sabba": "data_sabba",
    "Data by Voucher": "data_evoucher",
    "Voucher For Payment": "voucher_for_payment",
    "Credit Transfer": "credit_transfer",
    "Voucher Convergent Management": "voucher_convergent",
  };
  try {
    const rows = await runQuery(`
      SELECT
        ${canal}                                                                    AS canal_group,
        COUNT(*)                                                                    AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        COUNT(*) FILTER (WHERE ${sn}='DECLINED') AS declined,
        COUNT(*) FILTER (WHERE ${sn}='REFUND') AS refund,
        COUNT(*) FILTER (WHERE ${sn}='INSTANCE') AS instance,
        COUNT(*) FILTER (WHERE ${sn}='SUBMITTED') AS submitted,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3)                                    AS amount,
        ROUND(AVG(TRY_CAST(${amt} AS DOUBLE)),3)                                    AS avg_amount
      FROM ${qc(tableName)}
      GROUP BY 1 ORDER BY 2 DESC
    `);
    const total = totalTx || rows.reduce((a, r) => a + safeNum(r.total), 0);
    return rows
      .filter((r) => keyMap[String(r.canal_group)])
      .map((r) => {
        const key = keyMap[String(r.canal_group)];
        const t = safeNum(r.total);
        const s = safeNum(r.success);
        return {
          key,
          label: CANAL_KEY_TO_LABEL[key],
          total: t,
          success: s,
          declined: safeNum(r.declined),
          refund: safeNum(r.refund),
          instance: safeNum(r.instance),
          submitted: safeNum(r.submitted),
          amount: safeNum(r.amount),
          successRate: t > 0 ? (s / t) * 100 : 0,
          avgAmount: safeNum(r.avg_amount),
          share: total > 0 ? (t / total) * 100 : 0,
        };
      });
  } catch {
    return [];
  }
}

export async function fetchHourly(
  tableName: string,
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<HourlyRow[]> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const hr = hourExpr(m);
  try {
    const rows = await runQuery(`
      SELECT
        ${hr}                                             AS hour,
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        COUNT(*) FILTER (WHERE ${sn}='DECLINED') AS declined,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3)          AS amount
      FROM ${qc(tableName)}
      WHERE ${hr} BETWEEN 0 AND 23
      GROUP BY 1 ORDER BY 1
    `);
    return rows.map((r) => ({
      hour: safeNum(r.hour),
      total: safeNum(r.total),
      success: safeNum(r.success),
      declined: safeNum(r.declined),
      amount: safeNum(r.amount),
    }));
  } catch {
    return [];
  }
}

export async function fetchStatusBreakdown(
  tableName: string,
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<StatusRow[]> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  try {
    const rows = await runQuery(`
      SELECT ${sn} AS status,
             COUNT(*) AS count,
             ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3) AS amount
      FROM ${qc(tableName)} GROUP BY 1 ORDER BY 2 DESC LIMIT 500
    `);
    return rows.map((r) => ({
      status: String(r.status ?? "UNKNOWN"),
      count: safeNum(r.count),
      amount: safeNum(r.amount),
    }));
  } catch {
    return [];
  }
}

export async function fetchOperators(
  tableName: string,
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<OperatorRow[]> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const op = qc(m.operator);
  const mapRows = (
    rows: Record<string, unknown>[],
    accountType: "source" | "destination",
  ): OperatorRow[] =>
    rows.map((r) => ({
      operator: String(r.operator ?? ""),
      total: safeNum(r.total),
      success: safeNum(r.success),
      amount: safeNum(r.amount),
      successRate:
        safeNum(r.total) > 0
          ? (safeNum(r.success) / safeNum(r.total)) * 100
          : 0,
      accountType,
    }));
  try {
    const srcRows = await runQuery(`
      SELECT
        COALESCE(CAST(${op} AS VARCHAR),'Inconnu')    AS operator,
        COUNT(*)                                       AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3)       AS amount
      FROM ${qc(tableName)}
      WHERE ${op} IS NOT NULL AND CAST(${op} AS VARCHAR) <> ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT 50
    `);
    const dstCol = qc("GENERATION_ACCOUNT_NAME");
    let dstRows: Record<string, unknown>[] = [];
    try {
      dstRows = await runQuery(`
        SELECT
          COALESCE(CAST(${dstCol} AS VARCHAR),'Inconnu') AS operator,
          COUNT(*)                                        AS total,
          COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
          ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3)        AS amount
        FROM ${qc(tableName)}
        WHERE ${dstCol} IS NOT NULL AND CAST(${dstCol} AS VARCHAR) <> ''
        GROUP BY 1 ORDER BY 2 DESC LIMIT 50
      `);
    } catch {
      /* column may not exist */
    }
    return [...mapRows(srcRows, "source"), ...mapRows(dstRows, "destination")];
  } catch {
    return [];
  }
}

export async function fetchOperatorsForGroup(
  tableName: string,
  m: ColumnMapping,
  groupKeys: CanalKey[],
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<OperatorRow[]> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const op = qc(m.operator);
  const canal = canalCaseExpr(m);
  const labels = groupKeys
    .map((k) => sqlLiteral(CANAL_KEY_TO_LABEL[k]))
    .join(", ");
  try {
    const rows = await runQuery(`
      SELECT
        COALESCE(CAST(${op} AS VARCHAR), 'Inconnu') AS operator,
        COUNT(*)                                    AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)), 3)  AS amount
      FROM ${qc(tableName)}
      WHERE (${canal}) IN (${labels})
        AND ${op} IS NOT NULL AND CAST(${op} AS VARCHAR) <> ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT 50
    `);
    return rows.map((r) => ({
      operator: String(r.operator ?? ""),
      total: safeNum(r.total),
      success: safeNum(r.success),
      amount: safeNum(r.amount),
      successRate:
        safeNum(r.total) > 0
          ? (safeNum(r.success) / safeNum(r.total)) * 100
          : 0,
      accountType: "source" as const,
    }));
  } catch {
    return [];
  }
}

export async function fetchRegionsForGroup(
  tableName: string,
  m: ColumnMapping,
  groupKeys: CanalKey[],
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<RegionRow[]> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const reg = qc(m.region);
  const canal = canalCaseExpr(m);
  const labels = groupKeys
    .map((k) => sqlLiteral(CANAL_KEY_TO_LABEL[k]))
    .join(", ");
  try {
    const rows = await runQuery(`
      SELECT
        COALESCE(CAST(${reg} AS VARCHAR), 'Inconnu') AS region,
        COUNT(*)                                     AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)), 3)   AS amount
      FROM ${qc(tableName)}
      WHERE (${canal}) IN (${labels})
        AND ${reg} IS NOT NULL AND CAST(${reg} AS VARCHAR) NOT IN ('', 'NULL')
      GROUP BY 1 ORDER BY 4 DESC LIMIT 50
    `);
    return rows.map((r) => ({
      region: String(r.region ?? ""),
      total: safeNum(r.total),
      success: safeNum(r.success),
      amount: safeNum(r.amount),
    }));
  } catch {
    return [];
  }
}

export async function fetchDestinationsForGroup(
  tableName: string,
  m: ColumnMapping,
  groupKeys: CanalKey[],
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<OperatorRow[]> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const dst = qc("GENERATION_ACCOUNT_NAME");
  const canal = canalCaseExpr(m);
  const labels = groupKeys
    .map((k) => sqlLiteral(CANAL_KEY_TO_LABEL[k]))
    .join(", ");
  try {
    const rows = await runQuery(`
      SELECT
        COALESCE(CAST(${dst} AS VARCHAR), 'Inconnu') AS operator,
        COUNT(*)                                     AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)), 3)   AS amount
      FROM ${qc(tableName)}
      WHERE (${canal}) IN (${labels})
        AND ${dst} IS NOT NULL AND CAST(${dst} AS VARCHAR) <> ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT 50
    `);
    return rows.map((r) => ({
      operator: String(r.operator ?? ""),
      total: safeNum(r.total),
      success: safeNum(r.success),
      amount: safeNum(r.amount),
      successRate:
        safeNum(r.total) > 0
          ? (safeNum(r.success) / safeNum(r.total)) * 100
          : 0,
      accountType: "destination" as const,
    }));
  } catch {
    return [];
  }
}

export async function fetchRegions(
  tableName: string,
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<RegionRow[]> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const reg = qc(m.region);
  try {
    const rows = await runQuery(`
      SELECT
        COALESCE(CAST(${reg} AS VARCHAR),'Inconnu') AS region,
        COUNT(*)                                     AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3)     AS amount
      FROM ${qc(tableName)}
      WHERE ${reg} IS NOT NULL AND CAST(${reg} AS VARCHAR) NOT IN ('','NULL')
      GROUP BY 1 ORDER BY 2 DESC LIMIT 20
    `);
    return rows.map((r) => ({
      region: String(r.region ?? ""),
      total: safeNum(r.total),
      success: safeNum(r.success),
      amount: safeNum(r.amount),
    }));
  } catch {
    return [];
  }
}

export async function fetchCanalHourly(
  tableName: string,
  m: ColumnMapping,
  key: CanalKey,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<HourlyRow[]> {
  const where = canalWhere(m);
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const hr = hourExpr(m);
  try {
    const rows = await runQuery(`
      SELECT
        ${hr}                                             AS hour,
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        COUNT(*) FILTER (WHERE ${sn}='DECLINED') AS declined,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3)          AS amount
      FROM ${qc(tableName)}
      WHERE ${where[key]}
        AND ${hr} BETWEEN 0 AND 23
      GROUP BY 1 ORDER BY 1
    `);
    return rows.map((r) => ({
      hour: safeNum(r.hour),
      total: safeNum(r.total),
      success: safeNum(r.success),
      declined: safeNum(r.declined),
      amount: safeNum(r.amount),
    }));
  } catch {
    return [];
  }
}

export async function fetchCanalHourlyMatrix(
  tableName: string,
  m: ColumnMapping,
): Promise<CanalHourCell[]> {
  const sn = statusNorm(m);
  const hr = hourExpr(m);
  const canal = canalCaseExpr(m);
  try {
    const rows = await runQuery(`
      SELECT
        ${canal}  AS canal,
        ${hr}     AS hour,
        COUNT(*)  AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success
      FROM ${qc(tableName)}
      WHERE ${hr} BETWEEN 0 AND 23
        AND ${canal} != 'Other'
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);
    return rows.map((r) => ({
      canal: String(r.canal ?? ""),
      hour: safeNum(r.hour),
      total: safeNum(r.total),
      success: safeNum(r.success),
    }));
  } catch {
    return [];
  }
}

export async function fetchDailyTrend(
  tableName: string,
  m: ColumnMapping,
): Promise<DailyTrendRow[]> {
  const sn = statusNorm(m);
  const amt = qc(m.amount);
  const dayExpr = transactionDayExpr(m.transactionDate);

  try {
    const rows = await runQuery(`
      SELECT
        CAST(${dayExpr} AS VARCHAR) AS day,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
        COUNT(*) FILTER (WHERE ${sn}='DECLINED') AS declined,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)), 3) AS amount
      FROM ${qc(tableName)}
      WHERE ${dayExpr} IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `);

    if (rows.length < 2) return [];

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

export async function fetchCustomerProfile(
  tableName: string,
  m: ColumnMapping,
  msisdn: string,
): Promise<CustomerProfileData | null> {
  const sn = statusNorm(m);
  const amt = qc(m.amount);
  const ms = qc(m.msisdn);
  const hr = hourExpr(m);
  const canal = canalCaseExpr(m);
  const ec = qc(m.errorCode);
  const cname = qc(m.serviceName);
  const msLiteral = sqlLiteral(msisdn);
  try {
    const [agg, hourly, recent] = await Promise.all([
      runQuery(`
        SELECT
          CAST(${ms} AS VARCHAR)                                           AS msisdn,
          COALESCE(CAST(${cname} AS VARCHAR), CAST(${ms} AS VARCHAR))     AS name,
          COUNT(*)                                                         AS total,
          COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
          COUNT(*) FILTER (WHERE ${sn}='DECLINED') AS declined,
          ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)), 3)                       AS total_amount,
          ROUND(AVG(TRY_CAST(${amt} AS DOUBLE)), 3)                       AS avg_amount,
          MODE(${canal})                                                   AS fav_canal,
          MODE(${hr})                                                      AS peak_hour,
          COALESCE(MODE(CAST(${ec} AS VARCHAR)), '')                      AS top_error
        FROM ${qc(tableName)}
        WHERE CAST(${ms} AS VARCHAR) = ${msLiteral}
        GROUP BY 1, 2
        LIMIT 1
      `),
      runQuery(`
        SELECT ${hr} AS hour, COUNT(*) AS total
        FROM ${qc(tableName)}
        WHERE CAST(${ms} AS VARCHAR) = ${msLiteral}
          AND ${hr} BETWEEN 0 AND 23
        GROUP BY 1 ORDER BY 1
      `),
      runQuery(`
        SELECT * FROM ${qc(tableName)}
        WHERE CAST(${ms} AS VARCHAR) = ${msLiteral}
        ORDER BY CAST(${qc(m.transactionDate)} AS VARCHAR) DESC
        LIMIT 50
      `),
    ]);
    if (!agg[0]) return null;
    const a = agg[0];
    return {
      msisdn: String(a.msisdn ?? msisdn),
      name: String(a.name ?? msisdn),
      group: "",
      total: safeNum(a.total),
      success: safeNum(a.success),
      declined: safeNum(a.declined),
      totalAmount: safeNum(a.total_amount),
      avgAmount: safeNum(a.avg_amount),
      favoriteCanal: String(a.fav_canal ?? "—"),
      peakHour: safeNum(a.peak_hour),
      topError: String(a.top_error ?? ""),
      hourly: hourly.map((r) => ({
        hour: safeNum(r.hour),
        total: safeNum(r.total),
      })),
      recentTx: recent,
    };
  } catch {
    return null;
  }
}

export async function fetchCanalRows(
  tableName: string,
  m: ColumnMapping,
  key: CanalKey,
  limit = 100,
): Promise<RawRow[]> {
  const where = canalWhere(m);
  try {
    return await runQuery(`
      SELECT * FROM ${qc(tableName)}
      WHERE ${where[key]}
      LIMIT ${limit}
    `);
  } catch {
    return [];
  }
}

export async function fetchFiltered(
  tableName: string,
  m: ColumnMapping,
  f: FilterState,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
  limit = 50,
  offset = 0,
  sortCol = "",
  sortDir: SortDir = "desc",
): Promise<{ rows: RawRow[]; total: number }> {
  const sn = statusNorm(m, sm);
  const amt = qc(m.amount);
  const reg = qc(m.region);
  const op = qc(m.operator);
  const ms = qc(m.msisdn);
  const sn2 = qc(m.serviceName);
  const conds: string[] = [];
  if (f.status) conds.push(`${sn} = ${sqlLiteral(f.status)}`);
  if (f.region)
    conds.push(
      `UPPER(CAST(${reg} AS VARCHAR)) = ${sqlLiteral(f.region.toUpperCase())}`,
    );
  if (f.operator)
    conds.push(
      `UPPER(CAST(${op} AS VARCHAR)) = ${sqlLiteral(f.operator.toUpperCase())}`,
    );
  if (f.minAmount) conds.push(`TRY_CAST(${amt} AS DOUBLE) >= ${f.minAmount}`);
  if (f.maxAmount) conds.push(`TRY_CAST(${amt} AS DOUBLE) <= ${f.maxAmount}`);
  if (f.search) {
    const s = sqlLiteral(`%${f.search}%`);
    conds.push(
      `(CAST(${ms} AS VARCHAR) LIKE ${s} OR CAST(${sn2} AS VARCHAR) LIKE ${s})`,
    );
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const orderBy = sortCol
    ? `ORDER BY ${qc(sortCol)} ${sortDir === "asc" ? "ASC" : "DESC"}`
    : "";
  try {
    const [cnt, data] = await Promise.all([
      runQuery(`SELECT COUNT(*) AS cnt FROM ${qc(tableName)} ${where}`),
      runQuery(
        `SELECT * FROM ${qc(tableName)} ${where} ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
      ),
    ]);
    return { rows: data, total: safeNum(cnt[0]?.cnt) };
  } catch {
    return { rows: [], total: 0 };
  }
}

export async function detectAvailableColumns(
  tableName: string,
): Promise<string[]> {
  try {
    const rows = await runQuery(`DESCRIBE ${qc(tableName)}`);
    return rows.map((r) => String(r.column_name ?? ""));
  } catch {
    return [];
  }
}

export async function fetchDistinctStatuses(
  tableName: string,
  m: ColumnMapping,
): Promise<RawStatusRow[]> {
  const s = colExpr(m.status);
  const amt = colExpr(m.amount);
  try {
    const rows = await runQuery(`
      SELECT
        UPPER(TRIM(CAST(${s} AS VARCHAR)))              AS raw_code,
        COUNT(*)                                        AS count,
        ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3)        AS amount
      FROM ${qc(tableName)}
      WHERE ${s} IS NOT NULL AND TRIM(CAST(${s} AS VARCHAR)) <> ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT 500
    `);
    return rows.map((r) => ({
      rawCode: String(r.raw_code ?? ""),
      count: safeNum(r.count),
      amount: safeNum(r.amount),
    }));
  } catch {
    return [];
  }
}

export async function fetchSpecChannelStats(
  tableName: string,
  channels: ChannelDef[],
  dateFrom: string,
  dateTo: string,
  m?: ColumnMapping,
): Promise<{ rows: SpecChRow[]; total: SpecChRow }> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m?.transactionDate);
  const amountExpr = colExpr(m?.amount ?? "ORIGINAL_AMOUNT");
  const statusExpr = colExpr(m?.status ?? "TRANSACTION_STATUS");
  const successFilter = buildRawStatusFilterForColumn(
    statusExpr,
    SPEC_STATUS_CODES.success,
  );
  const rows = await Promise.all(
    channels.map(async (ch) => {
      try {
        const res = await runQuery(`
          SELECT COUNT(*) AS n, COALESCE(SUM(TRY_CAST(${amountExpr} AS DOUBLE)),0) AS m
          FROM ${qc(tableName)}
          WHERE ${successFilter} AND (${ch.condition})${df}
        `);
        return {
          canal: ch.name,
          nombre: safeNum(res[0]?.n),
          montant: safeNum(res[0]?.m),
        };
      } catch {
        return { canal: ch.name, nombre: 0, montant: 0 };
      }
    }),
  );
  const tn = rows.reduce((s, r) => s + r.nombre, 0);
  const tm = rows.reduce((s, r) => s + r.montant, 0);
  return {
    rows,
    total: { canal: "TOTAL (tous canaux)", nombre: tn, montant: tm },
  };
}

export async function fetchSpecStatusStats(
  tableName: string,
  channels: ChannelDef[],
  dateFrom: string,
  dateTo: string,
  m?: ColumnMapping,
): Promise<{
  rows: Array<{ status: string; nombre: number }>;
  total: { status: string; nombre: number };
}> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m?.transactionDate);
  const scope =
    channels.length > 0
      ? `AND (${channels.map((ch) => `(${ch.condition})`).join(" OR ")})`
      : "";
  const statusExpr = colExpr(m?.status ?? "TRANSACTION_STATUS");
  const statusCases = [
    [
      "Réussie",
      buildRawStatusFilterForColumn(statusExpr, SPEC_STATUS_CODES.success),
    ],
    [
      "Annulation",
      buildRawStatusFilterForColumn(statusExpr, SPEC_STATUS_CODES.refund),
    ],
    [
      "Instance (Hold + Doubt)",
      buildRawStatusFilterForColumn(statusExpr, SPEC_STATUS_CODES.instance),
    ],
    [
      "Échec",
      buildRawStatusFilterForColumn(statusExpr, SPEC_STATUS_CODES.declined),
    ],
  ] as const;

  try {
    const results = await Promise.all(
      statusCases.map(async ([status, filter]) => {
        const res = await runQuery(`
          SELECT COUNT(*) AS n
          FROM ${qc(tableName)}
          WHERE ${filter} ${scope}${df}
        `);
        return { status, nombre: safeNum(res[0]?.n) };
      }),
    );
    const total = results.reduce((s, r) => s + r.nombre, 0);
    return {
      rows: results,
      total: { status: "TOTAL (tous Status)", nombre: total },
    };
  } catch (err) {
    console.error("[fetchSpecStatusStats] Error:", err);
    return { rows: [], total: { status: "TOTAL (tous Status)", nombre: 0 } };
  }
}

export async function fetchSpecUnitAmountStats(
  tableName: string,
  channels: ChannelDef[],
  dateFrom: string,
  dateTo: string,
  m?: ColumnMapping,
): Promise<{
  rows: Array<{ unitAmount: string; nombre: number; montant: number }>;
  total: { unitAmount: string; nombre: number; montant: number };
}> {
  const df = buildSpecDateFilter(dateFrom, dateTo, m?.transactionDate);
  const scope =
    channels.length > 0
      ? `AND (${channels.map((ch) => `(${ch.condition})`).join(" OR ")})`
      : "";
  const amountExpr = colExpr(m?.amount ?? "ORIGINAL_AMOUNT");
  const statusExpr = colExpr(m?.status ?? "TRANSACTION_STATUS");
  const successFilter = buildRawStatusFilterForColumn(
    statusExpr,
    SPEC_STATUS_CODES.success,
  );
  try {
    const rows = await runQuery(`
      SELECT
        CAST(TRY_CAST(${amountExpr} AS DOUBLE) AS VARCHAR) AS unit_amount,
        COUNT(*) AS n,
        COALESCE(SUM(TRY_CAST(${amountExpr} AS DOUBLE)), 0) AS m
      FROM ${qc(tableName)}
      WHERE ${successFilter} ${scope}${df}
      GROUP BY 1
      ORDER BY TRY_CAST(unit_amount AS DOUBLE)
    `);
    const mapped = rows.map((r) => ({
      unitAmount: String(r.unit_amount ?? "0"),
      nombre: safeNum(r.n),
      montant: safeNum(r.m),
    }));
    return {
      rows: mapped,
      total: {
        unitAmount: "TOTAL",
        nombre: mapped.reduce((sum, row) => sum + row.nombre, 0),
        montant: mapped.reduce((sum, row) => sum + row.montant, 0),
      },
    };
  } catch (err) {
    console.error("[fetchSpecUnitAmountStats] Error:", err);
    return {
      rows: [],
      total: { unitAmount: "TOTAL", nombre: 0, montant: 0 },
    };
  }
}

export async function fetchServiceCodeRows(
  tableName: string,
  m: ColumnMapping,
): Promise<ServiceCodeRow[]> {
  const svc = colExpr(m.serviceCode);
  const cat = colExpr(m.transactionType);
  const canal = canalCaseExpr(m);
  try {
    const rows = await runQuery(`
      SELECT
        UPPER(CAST(${svc} AS VARCHAR))  AS service_code,
        UPPER(CAST(${cat} AS VARCHAR))  AS category,
        COUNT(*)                         AS count,
        ${canal}                         AS matched_canal
      FROM ${qc(tableName)}
      WHERE ${svc} IS NOT NULL AND TRIM(CAST(${svc} AS VARCHAR)) <> ''
      GROUP BY 1, 2, 4
      ORDER BY 3 DESC
      LIMIT 200
    `);
    return rows.map((r) => ({
      serviceCode: String(r.service_code ?? ""),
      category: String(r.category ?? ""),
      count: safeNum(r.count),
      matchedCanal: String(r.matched_canal ?? "Other"),
    }));
  } catch {
    return [];
  }
}

export async function runCustomKPIExpr(
  tableName: string,
  sqlExpr: string,
): Promise<number> {
  try {
    const rows = await runQuery(
      `SELECT (${sqlExpr}) AS val FROM ${qc(tableName)} LIMIT 1`,
    );
    return safeNum(rows[0]?.val);
  } catch (err) {
    console.error("[runCustomKPIExpr] Error:", err);
    throw err;
  }
}

// ─── Enrichment helpers ───────────────────────────────────────────────────────

/** Returns the enriched view name for a given base table. */
export function enrichedViewName(tableName: string): string {
  return `${tableName}_enriched`;
}

/** Returns the daily pre-aggregated table name. */
export function dailyAggTableName(tableName: string): string {
  return `${tableName}_daily`;
}

/**
 * Create (or replace) an enriched view with pre-computed status, canal,
 * date/hour/day, and amount columns. Downstream queries reference this view
 * instead of rebuilding CASE expressions every time.
 */
export async function createTelecomEnrichedView(
  tableName: string,
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<void> {
  const viewName = enrichedViewName(tableName);
  const sn = statusNorm(m, sm);
  const amt = colExpr(m.amount);
  const pms = colExpr(m.processingTimeMs);
  const id = colExpr(m.msisdn);
  const ec = colExpr(m.errorCode);

  const cn = canalCaseExpr(m);

  await runQuery(`
    CREATE OR REPLACE VIEW ${qc(viewName)} AS
    SELECT
      *,
      ${sn}                              AS _status_norm,
      ${cn}                              AS _canal,
      ${transactionDateExpr(m.transactionDate)} AS _txn_date,
      ${transactionHourExpr(m.transactionDate)} AS _txn_hour,
      DATE_TRUNC('day', ${transactionDateExpr(m.transactionDate)}) AS _txn_day,
      TRY_CAST(${amt} AS DOUBLE)         AS _amount,
      TRY_CAST(${pms} AS DOUBLE)         AS _proc_ms,
      CAST(${id} AS VARCHAR)             AS _customer_id,
      CAST(${ec} AS VARCHAR)             AS _error_code
    FROM ${qc(tableName)}
  `);
}

export async function ensureTelecomEnrichedView(
  tableName: string,
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): Promise<boolean> {
  const viewName = enrichedViewName(tableName);
  const key = enrichmentKey(m, sm);
  if (enrichmentKeys.get(viewName) === key) return true;

  const inFlightKey = `${viewName}:${key}`;
  const existing = enrichmentInFlight.get(inFlightKey);
  if (existing) return existing;

  const pending = createTelecomEnrichedView(tableName, m, sm)
    .then(() => {
      enrichmentKeys.set(viewName, key);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      enrichmentInFlight.delete(inFlightKey);
    });

  enrichmentInFlight.set(inFlightKey, pending);
  return pending;
}

/**
 * Create (or replace) a pre-aggregated daily summary table.
 * KPI queries can hit this tiny table instead of the full dataset.
 */
export async function createTelecomDailyAgg(tableName: string): Promise<void> {
  const viewName = enrichedViewName(tableName);
  const aggTable = dailyAggTableName(tableName);

  await runQuery(`
    CREATE OR REPLACE TABLE ${qc(aggTable)} AS
    SELECT
      _txn_day                                       AS day,
      _canal                                         AS canal,
      _status_norm                                   AS status,
      COUNT(*)                                       AS cnt,
      SUM(_amount)                                   AS amount,
      AVG(_proc_ms)                                  AS avg_proc_ms,
      APPROX_COUNT_DISTINCT(_customer_id)            AS unique_customers
    FROM ${qc(viewName)}
    GROUP BY _txn_day, _canal, _status_norm
  `);
}
