/**
 * REAL DuckDB telecom-report query benchmark (native engine, not mocked).
 *
 * Why this file exists
 * --------------------
 * The user cares about the REAL performance of the heavy engines. This bench
 * runs the ACTUAL report SQL the app generates — built by the same pure SQL
 * builders the renderer uses (`statusNorm`, `canalCaseExpr`, `hourExpr`,
 * `transactionDateExpr`, `buildSpecDateFilter`, ...) — against a REAL
 * in-process DuckDB (`@duckdb/node-api`) over deterministically-generated
 * synthetic `DailyTransactions` rows.
 *
 * It does NOT import `runReadOnlyQuery` (that is the Electron-IPC renderer
 * channel). It imports only the pure SQL string builders and feeds the exact
 * generated SQL into a real DuckDB connection, so the numbers reflect the cost
 * of the engine running the app's real query shapes.
 *
 * Environment
 * -----------
 * `@duckdb/node-api` is a NATIVE addon and requires the `node` vitest
 * environment. The default `pnpm run bench` uses jsdom, which breaks native
 * addons — so this file uses the `*.duckdb-native.bench.ts` suffix and runs
 * under `vitest.duckdb-bench.config.ts` (`environment: "node"`) via
 * `pnpm run bench:duckdb`. The directive below is belt-and-braces.
 *
 * @vitest-environment node
 *
 * Determinism
 * -----------
 * Synthetic data is generated purely counter-based (NO Math.random / Date.now).
 * Field values are derived from the row index via small fixed-modulus pickers,
 * so the same `DN_BENCH_ROWS` always yields byte-identical data.
 *
 * Scale knob
 * ----------
 *   DN_BENCH_ROWS  (default 100000)  e.g. DN_BENCH_ROWS=1000000 for 1M rows
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, bench, describe } from "vitest";

import { canalCaseExpr, hourExpr, qc, statusNorm } from "@/features/telecom/lib/sql";
import { buildSpecDateFilter, transactionDayExpr } from "@/features/telecom/lib/queries";
import {
  SPEC_DECLINED_FILTER,
  SPEC_INSTANCE_FILTER,
  SPEC_REFUND_FILTER,
  SPEC_SUCCESS_FILTER,
} from "@/features/telecom/lib/status-definitions";
import { DEFAULT_MAPPING } from "@/features/telecom/store";

// ─── Config ──────────────────────────────────────────────────────────────────

const ROWS = (() => {
  const raw = Number.parseInt(process.env.DN_BENCH_ROWS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 100_000;
})();

const TABLE = "DailyTransactions";
const M = DEFAULT_MAPPING;

// vitest bench knobs: enough warmup + iterations for stable wall-clock numbers.
const BENCH_OPTS = { warmupIterations: 2, iterations: 8, time: 0 } as const;

// ─── Deterministic synthetic generators (NO Math.random / NO Date.now) ────────
//
// Every column is a pure function of the 0-based row index `i`. The chosen
// cardinalities mirror the real DailyTransactions shape: a handful of statuses
// (success-heavy), BRAND_D ids that hit the channel CASE branches, account
// layer/group ids the channel conditions test, regions, operators, customer
// MSISDNs, hours 0..23, and amounts.

// BRAND_D ids that exercise real channel branches (bill-payment, voice fixed/
// mobile ttcash/voucher, data sabba/evoucher, voucher-for-payment, credit
// transfer, voucher-convergent) plus some "Other" ids.
const BRAND_IDS = [
  39, 35, 61, 9, 118, 132, 149, 156, 108, 122, 56, 57, 58, 59, 8, 31, 117, 109, 95, 137, 123, 158,
  98, 99, 100, 88, 89, 111, 159, 166, 163, 119, 120, 7, 42, 200, 201, 202,
] as const;

// Status codes weighted toward SUCCESS (PST*), with declines, refunds,
// instance (hold/doubt) and submitted, matching BUILTIN/SPEC status sets.
const STATUS_CODES = [
  "PST",
  "PST",
  "PST",
  "PST",
  "PST1",
  "PST2",
  "PST7", // success-heavy
  "DCL",
  "DCT",
  "DCA",
  "PDL",
  "REJ",
  "FLD", // declined
  "RFD",
  "RFD3", // refund
  "HLD",
  "DBT",
  "TPP",
  "PND", // instance
  "SBM", // submitted
] as const;

const ACCOUNT_MSISDNS = [
  "21619444555",
  "21619777888",
  "21692507919",
  "2160000111222",
  "21619111222",
  "21699270724",
  "21692509273",
  "21693033354",
  "21698276912",
  "21692836704",
  "21692885461",
  "2160123456789",
  "21692885410",
  "21692885467",
] as const;

const ACCOUNT_LAYER_IDS = [12, 9, 6, 14, 5] as const;
const ACCOUNT_GROUP_IDS = [152, 162, 100, 101] as const;
const REGIONS = ["152", "162", "100", "101", "TUNIS", "SFAX", "SOUSSE", "GABES"] as const;
const OPERATORS = ["OP_A", "OP_B", "OP_C", "OP_D", "OP_E", ""] as const;
const SERVICE_CLASSES = ["VOICE", "DATA", "BILL", "VOUCHER", "TRANSFER"] as const;
const BRAND_CATEGORIES = ["RECHARGE", "PAYMENT", "TRANSFER", "GENERATION"] as const;

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

/** Deterministic date string in "DD/MM/YYYY HH:MM:SS" — the app's primary format. */
function txnDate(i: number): string {
  const day = (i % 28) + 1; // 1..28
  const month = (Math.trunc(i / 28) % 12) + 1; // 1..12
  const hour = i % 24; // 0..23 (drives hourExpr / peak-hour)
  const minute = i % 60;
  const second = (i * 7) % 60;
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  return `${dd}/${mm}/2025 ${hh}:${mi}:${ss}`;
}

// ─── Build the synthetic DailyTransactions table in real DuckDB ───────────────

let instance: DuckDBInstance;
let conn: Awaited<ReturnType<DuckDBInstance["connect"]>>;
let actualRows = 0;

/**
 * Generate the table fully inside DuckDB from a `range(ROWS)` so the data lives
 * natively (no JS-side row-by-row INSERT overhead skewing the scan numbers).
 * Every column is a deterministic SQL expression of the row index `i` mirroring
 * the JS pickers above — same modulus cardinalities, counter-based, no random.
 *
 * The generated columns are typed as VARCHAR exactly like a freshly-ingested
 * CSV (the real app reads everything as text and TRY_CASTs in the query), so
 * the report SQL pays the same per-row CAST/parse cost it pays in production.
 */
async function buildTable(): Promise<void> {
  const brandSql = sqlPick(BRAND_IDS.map(String));
  const statusSql = sqlPick(STATUS_CODES);
  const acctMsisdnSql = sqlPick(ACCOUNT_MSISDNS);
  const layerSql = sqlPick(ACCOUNT_LAYER_IDS.map(String));
  const groupSql = sqlPick(ACCOUNT_GROUP_IDS.map(String));
  const regionSql = sqlPick(REGIONS);
  const operatorSql = sqlPick(OPERATORS);
  const svcSql = sqlPick(SERVICE_CLASSES);
  const catSql = sqlPick(BRAND_CATEGORIES);

  // Date string built in SQL with the SAME formula as txnDate() above.
  const dateSql = `
    lpad(CAST((i % 28) + 1 AS VARCHAR), 2, '0') || '/' ||
    lpad(CAST(((i // 28) % 12) + 1 AS VARCHAR), 2, '0') || '/2025 ' ||
    lpad(CAST(i % 24 AS VARCHAR), 2, '0') || ':' ||
    lpad(CAST(i % 60 AS VARCHAR), 2, '0') || ':' ||
    lpad(CAST((i * 7) % 60 AS VARCHAR), 2, '0')`;

  await conn.run(`DROP TABLE IF EXISTS ${qc(TABLE)}`);
  await conn.run(`
    CREATE TABLE ${qc(TABLE)} AS
    SELECT
      CAST(i AS VARCHAR)                                   AS "TRANSACTION_ID",
      ${dateSql}                                           AS "TRANSACTION_DATE",
      ${brandSql}                                          AS "BRAND_D",
      'Brand ' || ${brandSql}                              AS "BRAND_NAME",
      ${catSql}                                            AS "BRAND_CATEGORY_NAME",
      ${svcSql}                                            AS "SERVICE_CLASS_NAME",
      ${statusSql}                                         AS "TRANSACTION_STATUS",
      ${acctMsisdnSql}                                     AS "ACCOUNT_MSISDN",
      CAST((i % 5000) AS VARCHAR)                          AS "ACCOUNT_ID",
      ${layerSql}                                          AS "ACCOUNT_LAYER_ID",
      ${groupSql}                                          AS "ACCOUNT_GROUP_ID",
      '216' || lpad(CAST(i % 90000 AS VARCHAR), 8, '0')    AS "CUSTOMER_MSISDN",
      'Cust ' || CAST(i % 90000 AS VARCHAR)               AS "CUSTOMER_NAME",
      CAST(((i * 13) % 100000) / 100.0 AS VARCHAR)         AS "ORIGINAL_AMOUNT",
      CAST(((i * 17) % 500000) AS VARCHAR)                 AS "BALANCE_BEFORE",
      CAST(((i * 19) % 500000) AS VARCHAR)                 AS "BALANCE_AFTER",
      ${operatorSql}                                       AS "SALES_PERSON",
      ${regionSql}                                         AS "ACCOUNT_GROUP_ID_REGION",
      'GEN ' || CAST(i % 17 AS VARCHAR)                   AS "GENERATION_ACCOUNT_NAME",
      'remark ' || ${statusSql}                            AS "REMARK"
    FROM range(${ROWS}) tbl(i)
  `);

  // Region is mapped to ACCOUNT_GROUP_ID in DEFAULT_MAPPING; the channel
  // conditions ALSO read ACCOUNT_GROUP_ID as the numeric group. We satisfy both
  // by aliasing: the numeric group lives in ACCOUNT_GROUP_ID, and the region
  // query uses the same column. Re-point the region column for the bench so the
  // region aggregation has a real, varied region dimension to group on.
  await conn.run(
    `ALTER TABLE ${qc(TABLE)} RENAME COLUMN "ACCOUNT_GROUP_ID" TO "ACCOUNT_GROUP_ID_NUM"`,
  );
  await conn.run(
    `ALTER TABLE ${qc(TABLE)} RENAME COLUMN "ACCOUNT_GROUP_ID_REGION" TO "ACCOUNT_GROUP_ID"`,
  );

  const reader = await conn.runAndReadAll(`SELECT COUNT(*) AS n FROM ${qc(TABLE)}`);
  actualRows = Number(reader.getRowObjects()[0]?.n ?? 0);
}

/** CASE expression: pick element `i % arr.length` from a literal array, in SQL. */
function sqlPick(values: readonly string[]): string {
  const n = values.length;
  const whens = values.map((v, idx) => `WHEN ${idx} THEN '${v.replace(/'/g, "''")}'`).join(" ");
  return `(CASE (i % ${n}) ${whens} END)`;
}

// ─── Run a query against the REAL engine and return [rowCount, rows] ──────────

async function runSql(sql: string): Promise<Record<string, unknown>[]> {
  const reader = await conn.runAndReadAll(sql);
  return reader.getRowObjects() as Record<string, unknown>[];
}

// ─── The ACTUAL report SQL the app generates (inlined builders) ───────────────
// These mirror queries.ts / period-queries.ts exactly (raw-table fallback path,
// since the enriched materialized view is disabled by design — see
// ensureTelecomEnrichedView).

const sn = statusNorm(M);
const canal = canalCaseExpr(M);
const hr = hourExpr(M);
const dayExpr = transactionDayExpr(M.transactionDate);
const amt = qc(M.amount);
const op = qc(M.operator);
const reg = qc(M.region);

const SQL = {
  // fetchKPI (raw fallback) — success-rate + amounts + approx distinct + modes.
  kpi: `
    WITH base AS (
      SELECT ${sn} AS _status,
             TRY_CAST(${amt} AS DOUBLE) AS _amt,
             CAST(${qc(M.msisdn)} AS VARCHAR) AS _id,
             CAST(${qc(M.errorCode)} AS VARCHAR) AS _ec,
             ${hr} AS _hr
      FROM ${qc(TABLE)}
    )
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE _status='SUCCESS')  AS success_count,
      COUNT(*) FILTER (WHERE _status='DECLINED') AS declined_count,
      COUNT(*) FILTER (WHERE _status='REFUND')   AS refund_count,
      COUNT(*) FILTER (WHERE _status='INSTANCE') AS instance_count,
      COUNT(*) FILTER (WHERE _status='SUBMITTED')AS submitted_count,
      ROUND(COUNT(*) FILTER (WHERE _status='SUCCESS')*100.0/NULLIF(COUNT(*),0),2) AS success_rate,
      ROUND(SUM(_amt),3) AS total_amount,
      ROUND(AVG(_amt),3) AS avg_amount,
      APPROX_COUNT_DISTINCT(_id) AS unique_customers,
      MODE(_hr) AS peak_hour,
      MODE(_ec) AS top_error
    FROM base
  `,

  // fetchHourly — hourly time series with status splits.
  hourly: `
    SELECT ${hr} AS hour,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${sn}='SUCCESS')  AS success,
           COUNT(*) FILTER (WHERE ${sn}='DECLINED') AS declined,
           ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3) AS amount
    FROM ${qc(TABLE)}
    WHERE ${hr} BETWEEN 0 AND 23
    GROUP BY 1 ORDER BY 1
  `,

  // fetchOperators (source) — operators matrix, success-rate per operator.
  operators: `
    SELECT
      COALESCE(CAST(${op} AS VARCHAR),'Inconnu') AS operator,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
      ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3) AS amount
    FROM ${qc(TABLE)}
    WHERE ${op} IS NOT NULL AND CAST(${op} AS VARCHAR) <> ''
    GROUP BY 1 ORDER BY 2 DESC LIMIT 50
  `,

  // fetchRegions — regional breakdown.
  regions: `
    SELECT
      COALESCE(CAST(${reg} AS VARCHAR),'Inconnu') AS region,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success,
      ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3) AS amount
    FROM ${qc(TABLE)}
    WHERE ${reg} IS NOT NULL AND CAST(${reg} AS VARCHAR) NOT IN ('','NULL')
    GROUP BY 1 ORDER BY 2 DESC LIMIT 20
  `,

  // fetchRawCanalSummaries — the heavy 10-branch canal CASE aggregation.
  canalSummaries: `
    SELECT
      ${canal} AS canal_group,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ${sn}='SUCCESS')   AS success,
      COUNT(*) FILTER (WHERE ${sn}='DECLINED')  AS declined,
      COUNT(*) FILTER (WHERE ${sn}='REFUND')    AS refund,
      COUNT(*) FILTER (WHERE ${sn}='INSTANCE')  AS instance,
      COUNT(*) FILTER (WHERE ${sn}='SUBMITTED') AS submitted,
      ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3)  AS amount,
      ROUND(AVG(TRY_CAST(${amt} AS DOUBLE)),3)  AS avg_amount
    FROM ${qc(TABLE)}
    GROUP BY 1 ORDER BY 2 DESC
  `,

  // fetchCanalHourlyMatrix — canal x hour heatmap (2-dim group on heavy CASE).
  canalHourMatrix: `
    SELECT ${canal} AS canal, ${hr} AS hour,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${sn}='SUCCESS') AS success
    FROM ${qc(TABLE)}
    WHERE ${hr} BETWEEN 0 AND 23 AND ${canal} != 'Other'
    GROUP BY 1, 2 ORDER BY 1, 2
  `,

  // fetchDailyTrend — period-over-period day series (date parsing + group).
  dailyTrend: `
    SELECT CAST(${dayExpr} AS VARCHAR) AS day,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${sn}='SUCCESS')  AS success,
           COUNT(*) FILTER (WHERE ${sn}='DECLINED') AS declined,
           ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)),3) AS amount
    FROM ${qc(TABLE)}
    WHERE ${dayExpr} IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `,

  // fetchPeriodKPI (raw fallback) — period-scoped spec-status aggregation with
  // a real date filter (period-over-period KPI for Period Studio).
  periodKpi: `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ${SPEC_SUCCESS_FILTER})  AS success,
      COUNT(*) FILTER (WHERE ${SPEC_DECLINED_FILTER}) AS declined,
      COUNT(*) FILTER (WHERE ${SPEC_REFUND_FILTER})   AS refund,
      COUNT(*) FILTER (WHERE ${SPEC_INSTANCE_FILTER}) AS instance,
      ROUND(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)) FILTER (WHERE ${SPEC_SUCCESS_FILTER}),3) AS amount,
      APPROX_COUNT_DISTINCT(CAST(CUSTOMER_MSISDN AS VARCHAR)) AS unique_customers
    FROM ${qc(TABLE)}
    WHERE 1=1 ${buildSpecDateFilter("2025-03-01", "2025-09-30", M.transactionDate)}
  `,

  // fetchFilteredPage — the hot interactive raw-data grid (filter + sort + page).
  rawGridPage: `
    SELECT * FROM ${qc(TABLE)}
    WHERE ${sn} = 'SUCCESS'
      AND TRY_CAST(${amt} AS DOUBLE) >= 100
    ORDER BY ${qc(M.transactionDate)} DESC
    LIMIT 50 OFFSET 1000
  `,

  // fetchFilteredCount — the paired full filtered count scan.
  rawGridCount: `
    SELECT COUNT(*) AS cnt FROM ${qc(TABLE)}
    WHERE ${sn} = 'SUCCESS'
      AND TRY_CAST(${amt} AS DOUBLE) >= 100
  `,
} as const;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  instance = await DuckDBInstance.create(":memory:");
  conn = await instance.connect();
  // Single-thread to keep numbers comparable across machines is NOT forced —
  // we want REAL on-this-PC throughput, so DuckDB uses all cores by default.
  await buildTable();

  // Verification: print the table size and one real result row per query so the
  // run evidence proves the queries actually execute (not no-ops).
  const verify: Array<[string, string]> = [
    ["kpi", SQL.kpi],
    ["hourly", SQL.hourly],
    ["operators", SQL.operators],
    ["regions", SQL.regions],
    ["canalSummaries", SQL.canalSummaries],
    ["canalHourMatrix", SQL.canalHourMatrix],
    ["dailyTrend", SQL.dailyTrend],
    ["periodKpi", SQL.periodKpi],
    ["rawGridPage", SQL.rawGridPage],
    ["rawGridCount", SQL.rawGridCount],
  ];
  // eslint-disable-next-line no-console
  console.log(
    `\n[duckdb-bench] table=${TABLE} rows=${actualRows.toLocaleString()} (DN_BENCH_ROWS=${ROWS})`,
  );
  for (const [name, sql] of verify) {
    const rows = await runSql(sql);
    const sample = rows[0]
      ? JSON.stringify(rows[0], (_k, v) => (typeof v === "bigint" ? Number(v) : v)).slice(0, 140)
      : "(no rows)";
    // eslint-disable-next-line no-console
    console.log(`[duckdb-bench] ${name.padEnd(16)} -> ${rows.length} rows | ${sample}`);
  }
  // eslint-disable-next-line no-console
  console.log("");
}, 120_000);

afterAll(async () => {
  conn?.disconnectSync?.();
  instance?.closeSync?.();
});

// ─── Benchmarks ───────────────────────────────────────────────────────────────
// Each bench runs the real query against the real engine. tinybench reports
// mean/p99/hz (ops/sec). Per-query rows-scanned/sec = ROWS * hz.

describe(`telecom report SQL on REAL DuckDB (${ROWS.toLocaleString()} rows)`, () => {
  bench(
    "KPI / success-rate (full scan, FILTER aggregates)",
    async () => {
      await runSql(SQL.kpi);
    },
    BENCH_OPTS,
  );

  bench(
    "hourly series (hour extract + status splits)",
    async () => {
      await runSql(SQL.hourly);
    },
    BENCH_OPTS,
  );

  bench(
    "operators matrix (group + success-rate)",
    async () => {
      await runSql(SQL.operators);
    },
    BENCH_OPTS,
  );

  bench(
    "regions breakdown (group + amount)",
    async () => {
      await runSql(SQL.regions);
    },
    BENCH_OPTS,
  );

  bench(
    "canal summaries (10-branch CASE aggregation)",
    async () => {
      await runSql(SQL.canalSummaries);
    },
    BENCH_OPTS,
  );

  bench(
    "canal x hour matrix (2-dim heavy CASE group)",
    async () => {
      await runSql(SQL.canalHourMatrix);
    },
    BENCH_OPTS,
  );

  bench(
    "daily trend (date parse + day group)",
    async () => {
      await runSql(SQL.dailyTrend);
    },
    BENCH_OPTS,
  );

  bench(
    "period KPI (date-filtered spec-status aggregation)",
    async () => {
      await runSql(SQL.periodKpi);
    },
    BENCH_OPTS,
  );

  bench(
    "raw grid page (filter + sort + paginate) — hot path",
    async () => {
      await runSql(SQL.rawGridPage);
    },
    BENCH_OPTS,
  );

  bench(
    "raw grid filtered count (paired full filtered scan)",
    async () => {
      await runSql(SQL.rawGridCount);
    },
    BENCH_OPTS,
  );
});
