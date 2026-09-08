/**
 * Enterprise-standard DuckDB performance and benchmarking suite.
 *
 * Real DuckDB native engine execution (not mocked) over scalable telecom &
 * business metrics datasets with TPC-H-grade rigor.
 *
 * Requirements & Coverage:
 * 1. Scalable dataset generator (10k, 100k, 500k rows) with real-world dimensions:
 *    timestamp, customer_id, region, canal, plan_type, usage_gb, revenue, status.
 *    Paired with a high-cardinality customer dimension table (50,000 customers).
 * 2. Ingestion throughput benchmarks:
 *    - CSV ingestion (COPY read_csv to Parquet cache)
 *    - Parquet columnar ingestion (read_parquet view)
 *    - Direct in-memory table generation and bulk insertion
 * 3. Core enterprise OLAP aggregations:
 *    - Multi-dimensional GROUP BY (region x canal x plan_type x status)
 *    - High-precision percentiles (QUANTILE_CONT p50, p90, p95, p99) & APPROX_COUNT_DISTINCT
 * 4. Window functions & time-series rolling averages:
 *    - 7-day and 30-day moving averages + cumulative revenue partitions
 *    - Customer-level lag & moving window deltas
 * 5. High-cardinality JOINs:
 *    - Customer dimension (50k rows) joined to transaction fact (100k / 500k rows)
 *    - Top-tier enterprise account lifetime value and consumption ranking
 * 6. Detailed metrics & safety:
 *    - MB/s throughput and rows/sec
 *    - Ops/sec (hz), p50/p95 latency metrics
 *    - Memory safety verification under 2GB memory ceilings
 *
 * Run with:
 *   pnpm run bench:duckdb
 *
 * @vitest-environment node
 */

import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, bench, describe } from "vitest";

// ─── Types & Configuration ───────────────────────────────────────────────────

interface TelecomFactRow {
  timestamp: string;
  customer_id: string;
  region: string;
  canal: string;
  plan_type: string;
  usage_gb: number;
  revenue: number;
  status: string;
}

interface IngestThroughputMetrics {
  scale: number;
  format: "CSV" | "Parquet" | "In-Memory";
  fileSizeBytes: number;
  elapsedMs: number;
  mbPerSec: number;
  rowsPerSec: number;
}

interface LatencyPercentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
}

interface MemorySafetySnapshot {
  duckdbMemoryBytes: bigint;
  databaseSizeBytes: string;
  rssMb: number;
  heapUsedMb: number;
}

const SCALE_SMALL = 10_000;
const SCALE_MEDIUM = 100_000;
const SCALE_LARGE = 500_000;

const CUSTOMER_DIM_COUNT = 50_000;
const DUCKDB_MEMORY_LIMIT = "2GB";

// vitest bench settings: iterations tuned for stable wall-clock without excessive duration
const BENCH_CONFIG = { warmupIterations: 2, iterations: 6, time: 0 } as const;

// ─── Deterministic Scalable Dataset Generator ────────────────────────────────

/**
 * Returns deterministic SQL generating `rows` of realistic telecom fact records.
 * Uses pseudo-random modulus distributions with prime multipliers:
 * - timestamp: spans 2025-01-01 to ~2025-12-31 uniformly (63s step per row at 500k)
 * - customer_id: high cardinality mapped across 50,000 customers
 * - region: 8 global geographic regions
 * - canal: 6 enterprise distribution channels
 * - plan_type: 6 telecommunication service tiers
 * - usage_gb: 0.25 GB to 850.25 GB
 * - revenue: $15.00 to $12,515.00
 * - status: realistic enterprise completion distribution (60% COMPLETED, FAILED/PENDING/REFUNDED/SUSPENDED)
 */
function buildTelecomFactSql(rows: number): string {
  return `
    SELECT
      TIMESTAMP '2025-01-01 00:00:00' + INTERVAL (i * 63) SECOND AS "timestamp",
      'CUST_' || lpad(CAST((i * 104729) % ${CUSTOMER_DIM_COUNT} AS VARCHAR), 6, '0') AS "customer_id",
      CASE ((i * 7) % 8)
        WHEN 0 THEN 'EMEA-North'
        WHEN 1 THEN 'EMEA-South'
        WHEN 2 THEN 'APAC-East'
        WHEN 3 THEN 'APAC-South'
        WHEN 4 THEN 'NA-East'
        WHEN 5 THEN 'NA-West'
        WHEN 6 THEN 'LATAM-Central'
        ELSE 'MENA-Coast'
      END AS "region",
      CASE ((i * 11) % 6)
        WHEN 0 THEN 'Online Portal'
        WHEN 1 THEN 'Direct Sales'
        WHEN 2 THEN 'Mobile App'
        WHEN 3 THEN 'Partner API'
        WHEN 4 THEN 'Retail Store'
        ELSE 'Enterprise Desk'
      END AS "canal",
      CASE ((i * 13) % 6)
        WHEN 0 THEN 'Enterprise Fiber'
        WHEN 1 THEN 'Business 5G Pro'
        WHEN 2 THEN 'Prepaid Mobile'
        WHEN 3 THEN 'IoT Dedicated'
        WHEN 4 THEN 'Cloud Connect 10G'
        ELSE 'Voice Trunking'
      END AS "plan_type",
      ROUND(0.25 + (((i * 9973) % 100000) / 100000.0) * 850.0, 2) AS "usage_gb",
      ROUND(15.0 + (((i * 65537) % 100000) / 100000.0) * 12500.0, 2) AS "revenue",
      CASE ((i * 3) % 10)
        WHEN 0 THEN 'FAILED'
        WHEN 1 THEN 'PENDING'
        WHEN 2 THEN 'REFUNDED'
        WHEN 3 THEN 'SUSPENDED'
        ELSE 'COMPLETED'
      END AS "status"
    FROM range(${rows}) tbl(i)
  `;
}

/**
 * Returns deterministic SQL generating the Customer dimension table (50,000 customers)
 * with segment, country, SLA tier, signup date, and credit rating.
 */
function buildCustomerDimSql(customerCount: number = CUSTOMER_DIM_COUNT): string {
  return `
    SELECT
      'CUST_' || lpad(CAST(i AS VARCHAR), 6, '0') AS customer_id,
      'Enterprise Client ' || CAST(i AS VARCHAR) AS customer_name,
      CASE (i % 5)
        WHEN 0 THEN 'Strategic Enterprise'
        WHEN 1 THEN 'Mid-Market'
        WHEN 2 THEN 'SMB'
        WHEN 3 THEN 'Government'
        ELSE 'Wholesale'
      END AS segment,
      CASE (i % 8)
        WHEN 0 THEN 'US'
        WHEN 1 THEN 'DE'
        WHEN 2 THEN 'UK'
        WHEN 3 THEN 'FR'
        WHEN 4 THEN 'SG'
        WHEN 5 THEN 'JP'
        WHEN 6 THEN 'TN'
        ELSE 'AE'
      END AS country,
      CASE (i % 4)
        WHEN 0 THEN 'Tier 1 - Platinum'
        WHEN 1 THEN 'Tier 2 - Gold'
        WHEN 2 THEN 'Tier 3 - Silver'
        ELSE 'Tier 4 - Standard'
      END AS tier,
      DATE '2023-01-01' + INTERVAL (i % 730) DAY AS signup_date,
      CASE (i % 4)
        WHEN 0 THEN 'AAA'
        WHEN 1 THEN 'AA'
        WHEN 2 THEN 'A'
        ELSE 'BBB'
      END AS credit_rating
    FROM range(${customerCount}) tbl(i)
  `;
}

// ─── Query Definitions ────────────────────────────────────────────────────────

const BENCHMARK_QUERIES = {
  /** Multi-dimensional OLAP aggregation: 4 dimensions x 7 aggregated metrics */
  olapMultiDimGroupBy: (table: string) => `
    SELECT
      region,
      canal,
      plan_type,
      status,
      COUNT(*) AS total_txns,
      ROUND(SUM(revenue), 2) AS total_revenue,
      ROUND(AVG(revenue), 2) AS avg_revenue,
      ROUND(SUM(usage_gb), 2) AS total_usage_gb,
      ROUND(AVG(usage_gb), 2) AS avg_usage_gb,
      ROUND(MAX(revenue), 2) AS max_revenue,
      ROUND(MIN(usage_gb), 2) AS min_usage_gb
    FROM ${table}
    GROUP BY region, canal, plan_type, status
    ORDER BY total_revenue DESC
  `,

  /** High-precision OLAP percentiles, quantiles, and distinct customer estimation */
  olapPercentiles: (table: string) => `
    SELECT
      region,
      plan_type,
      COUNT(*) AS count_txns,
      APPROX_COUNT_DISTINCT(customer_id) AS approx_unique_customers,
      ROUND(QUANTILE_CONT(revenue, 0.50), 2) AS revenue_p50,
      ROUND(QUANTILE_CONT(revenue, 0.90), 2) AS revenue_p90,
      ROUND(QUANTILE_CONT(revenue, 0.95), 2) AS revenue_p95,
      ROUND(QUANTILE_CONT(revenue, 0.99), 2) AS revenue_p99,
      ROUND(QUANTILE_CONT(usage_gb, 0.50), 2) AS usage_p50,
      ROUND(QUANTILE_CONT(usage_gb, 0.95), 2) AS usage_p95
    FROM ${table}
    WHERE status = 'COMPLETED'
    GROUP BY region, plan_type
    ORDER BY count_txns DESC
  `,

  /** Time-series 7-day and 30-day moving averages + cumulative running total */
  windowRollingAverages: (table: string) => `
    WITH daily_metrics AS (
      SELECT
        date_trunc('day', "timestamp") AS day,
        region,
        canal,
        COUNT(*) AS daily_txns,
        SUM(revenue) AS daily_revenue,
        SUM(usage_gb) AS daily_usage
      FROM ${table}
      GROUP BY 1, 2, 3
    )
    SELECT
      day,
      region,
      canal,
      daily_revenue,
      ROUND(AVG(daily_revenue) OVER (
        PARTITION BY region, canal
        ORDER BY day
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
      ), 2) AS rolling_avg_revenue_7d,
      ROUND(AVG(daily_revenue) OVER (
        PARTITION BY region, canal
        ORDER BY day
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
      ), 2) AS rolling_avg_revenue_30d,
      ROUND(SUM(daily_revenue) OVER (
        PARTITION BY region, canal
        ORDER BY day
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ), 2) AS cumulative_revenue,
      ROUND(AVG(daily_usage) OVER (
        PARTITION BY region, canal
        ORDER BY day
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
      ), 2) AS rolling_avg_usage_7d
    FROM daily_metrics
    ORDER BY region, canal, day
  `,

  /** Customer-level transaction delta, ranking, and rolling consumption */
  windowCustomerLags: (table: string) => `
    SELECT
      customer_id,
      "timestamp",
      revenue,
      usage_gb,
      LAG(revenue, 1) OVER (
        PARTITION BY customer_id
        ORDER BY "timestamp"
      ) AS prev_revenue,
      ROUND(revenue - LAG(revenue, 1) OVER (
        PARTITION BY customer_id
        ORDER BY "timestamp"
      ), 2) AS revenue_delta,
      DENSE_RANK() OVER (
        PARTITION BY region
        ORDER BY revenue DESC
      ) AS regional_revenue_rank,
      ROUND(AVG(revenue) OVER (
        PARTITION BY customer_id
        ORDER BY "timestamp"
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
      ), 2) AS customer_recent_avg_revenue
    FROM ${table}
    WHERE status = 'COMPLETED'
    ORDER BY customer_id, "timestamp"
    LIMIT 5000
  `,

  /** High-cardinality multi-table JOIN between customers dimension and transaction fact */
  joinDimensionFact: (factTable: string, dimTable: string) => `
    SELECT
      c.segment,
      c.country,
      c.tier,
      f.plan_type,
      f.canal,
      COUNT(f.customer_id) AS transaction_count,
      APPROX_COUNT_DISTINCT(c.customer_id) AS distinct_customers,
      ROUND(SUM(f.revenue), 2) AS total_revenue,
      ROUND(AVG(f.revenue), 2) AS avg_revenue_per_txn,
      ROUND(SUM(f.usage_gb), 2) AS total_usage_gb,
      ROUND(AVG(f.usage_gb), 2) AS avg_usage_per_txn
    FROM ${factTable} f
    JOIN ${dimTable} c ON f.customer_id = c.customer_id
    WHERE f.status = 'COMPLETED'
    GROUP BY c.segment, c.country, c.tier, f.plan_type, f.canal
    ORDER BY total_revenue DESC
  `,

  /** High-cardinality aggregated customer lifetime spend & tier enrichment JOIN */
  joinTopSpenders: (factTable: string, dimTable: string) => `
    WITH customer_aggregates AS (
      SELECT
        f.customer_id,
        COUNT(*) AS tx_count,
        SUM(f.revenue) AS lifetime_value,
        SUM(f.usage_gb) AS total_consumption,
        MAX(f."timestamp") AS last_activity
      FROM ${factTable} f
      GROUP BY f.customer_id
    )
    SELECT
      c.customer_id,
      c.customer_name,
      c.segment,
      c.country,
      c.tier,
      c.credit_rating,
      a.tx_count,
      ROUND(a.lifetime_value, 2) AS lifetime_value,
      ROUND(a.total_consumption, 2) AS total_consumption,
      a.last_activity
    FROM customer_aggregates a
    JOIN ${dimTable} c ON a.customer_id = c.customer_id
    WHERE a.lifetime_value > 2500.0
    ORDER BY a.lifetime_value DESC
    LIMIT 1000
  `,
};

// ─── Helpers: Execution, Percentiles, and Memory Telemetry ───────────────────

function calculatePercentiles(samplesMs: number[]): LatencyPercentiles {
  if (samplesMs.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const getP = (pct: number) =>
    sorted[Math.min(Math.floor((pct / 100) * sorted.length), sorted.length - 1)] ?? 0;
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    p50: Number(getP(50).toFixed(2)),
    p90: Number(getP(90).toFixed(2)),
    p95: Number(getP(95).toFixed(2)),
    p99: Number(getP(99).toFixed(2)),
    mean: Number((sum / sorted.length).toFixed(2)),
    min: Number(sorted[0]?.toFixed(2) ?? 0),
    max: Number(sorted[sorted.length - 1]?.toFixed(2) ?? 0),
  };
}

async function captureMemorySafety(
  conn: Awaited<ReturnType<DuckDBInstance["connect"]>>,
): Promise<MemorySafetySnapshot> {
  const memRes = await conn.runAndReadAll(
    "SELECT SUM(memory_usage_bytes) AS total_bytes FROM duckdb_memory();",
  );
  const memRows = memRes.getRowObjects() as { total_bytes?: bigint }[];
  const duckdbMemoryBytes = memRows[0]?.total_bytes ?? 0n;

  const dbSizeRes = await conn.runAndReadAll("PRAGMA database_size;");
  const dbSizeRows = dbSizeRes.getRowObjects() as { database_size?: string }[];
  const databaseSizeBytes = dbSizeRows[0]?.database_size ?? "0 bytes";

  const nodeMem = process.memoryUsage();
  return {
    duckdbMemoryBytes,
    databaseSizeBytes,
    rssMb: Number((nodeMem.rss / 1024 / 1024).toFixed(1)),
    heapUsedMb: Number((nodeMem.heapUsed / 1024 / 1024).toFixed(1)),
  };
}

// ─── Suite Lifecycle & State ──────────────────────────────────────────────────

let tmpDir = "";
let instance: DuckDBInstance;
let conn: Awaited<ReturnType<DuckDBInstance["connect"]>>;

const filePaths = {
  csv10k: "",
  parquet10k: "",
  csv100k: "",
  parquet100k: "",
  csv500k: "",
  parquet500k: "",
};

const ingestionTelemetry: IngestThroughputMetrics[] = [];

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "dn-enterprise-bench-"));
  filePaths.csv10k = path.join(tmpDir, "fact_10k.csv");
  filePaths.parquet10k = path.join(tmpDir, "fact_10k.parquet");
  filePaths.csv100k = path.join(tmpDir, "fact_100k.csv");
  filePaths.parquet100k = path.join(tmpDir, "fact_100k.parquet");
  filePaths.csv500k = path.join(tmpDir, "fact_500k.csv");
  filePaths.parquet500k = path.join(tmpDir, "fact_500k.parquet");

  instance = await DuckDBInstance.create(":memory:");
  conn = await instance.connect();

  // Enforce memory safety ceiling for enterprise verification
  await conn.run(`SET max_memory = '${DUCKDB_MEMORY_LIMIT}';`);
  await conn.run("SET preserve_insertion_order = false;");

  // 1. Generate Customer Dimension Table
  await conn.run(`CREATE TABLE customers AS ${buildCustomerDimSql()}`);

  // 2. Pre-generate on-disk CSV and Parquet files for ingestion benchmarks
  const scales = [
    { scale: SCALE_SMALL, csv: filePaths.csv10k, pq: filePaths.parquet10k },
    { scale: SCALE_MEDIUM, csv: filePaths.csv100k, pq: filePaths.parquet100k },
    { scale: SCALE_LARGE, csv: filePaths.csv500k, pq: filePaths.parquet500k },
  ];

  for (const { scale, csv, pq } of scales) {
    const genSql = buildTelecomFactSql(scale);
    await conn.run(`COPY (${genSql}) TO '${csv}' (HEADER, DELIMITER ',');`);
    await conn.run(
      `COPY (${genSql}) TO '${pq}' (FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL 1);`,
    );
  }

  // 3. Create Fact Tables in-memory for 100k and 500k query execution
  await conn.run(
    `CREATE TABLE fact_100k AS SELECT * FROM read_parquet('${filePaths.parquet100k}')`,
  );
  await conn.run(
    `CREATE TABLE fact_500k AS SELECT * FROM read_parquet('${filePaths.parquet500k}')`,
  );

  // 4. Measure Ingestion Throughput across formats (CSV, Parquet, In-Memory)
  for (const { scale, csv, pq } of scales) {
    const csvBytes = statSync(csv).size;
    const pqBytes = statSync(pq).size;

    // A: CSV Ingestion
    const tCsvStart = performance.now();
    await conn.run(`
      CREATE OR REPLACE TABLE ingest_csv_test AS
      SELECT * FROM read_csv('${csv}', auto_detect = true, header = true)
    `);
    const csvElapsedMs = performance.now() - tCsvStart;
    await conn.run("DROP TABLE ingest_csv_test;");
    ingestionTelemetry.push({
      scale,
      format: "CSV",
      fileSizeBytes: csvBytes,
      elapsedMs: csvElapsedMs,
      mbPerSec: Number((csvBytes / 1024 / 1024 / (csvElapsedMs / 1000)).toFixed(2)),
      rowsPerSec: Math.round(scale / (csvElapsedMs / 1000)),
    });

    // B: Parquet Columnar Ingestion
    const tPqStart = performance.now();
    await conn.run(`
      CREATE OR REPLACE TABLE ingest_pq_test AS
      SELECT * FROM read_parquet('${pq}')
    `);
    const pqElapsedMs = performance.now() - tPqStart;
    await conn.run("DROP TABLE ingest_pq_test;");
    ingestionTelemetry.push({
      scale,
      format: "Parquet",
      fileSizeBytes: pqBytes,
      elapsedMs: pqElapsedMs,
      mbPerSec: Number((pqBytes / 1024 / 1024 / (pqElapsedMs / 1000)).toFixed(2)),
      rowsPerSec: Math.round(scale / (pqElapsedMs / 1000)),
    });

    // C: In-Memory direct table creation
    const tMemStart = performance.now();
    await conn.run(`
      CREATE OR REPLACE TABLE ingest_mem_test AS
      ${buildTelecomFactSql(scale)}
    `);
    const memElapsedMs = performance.now() - tMemStart;
    await conn.run("DROP TABLE ingest_mem_test;");
    ingestionTelemetry.push({
      scale,
      format: "In-Memory",
      fileSizeBytes: csvBytes, // using raw equivalent payload
      elapsedMs: memElapsedMs,
      mbPerSec: Number((csvBytes / 1024 / 1024 / (memElapsedMs / 1000)).toFixed(2)),
      rowsPerSec: Math.round(scale / (memElapsedMs / 1000)),
    });
  }

  // 5. Log Enterprise Telemetry Matrix
  const memMetrics = await captureMemorySafety(conn);
  // eslint-disable-next-line no-console
  console.log("\n================================================================================");
  // eslint-disable-next-line no-console
  console.log("  DUCKDB ENTERPRISE BENCHMARK SUITE - INITIALIZATION COMPLETE");
  // eslint-disable-next-line no-console
  console.log("================================================================================");
  // eslint-disable-next-line no-console
  console.log(
    `Memory Ceiling: ${DUCKDB_MEMORY_LIMIT} | RSS: ${memMetrics.rssMb}MB | Heap: ${memMetrics.heapUsedMb}MB`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `Customer Dimension: ${CUSTOMER_DIM_COUNT.toLocaleString()} rows | Fact: 10k, 100k, 500k rows`,
  );
  // eslint-disable-next-line no-console
  console.log("--------------------------------------------------------------------------------");
  // eslint-disable-next-line no-console
  console.log("Ingestion Throughput Matrix:");
  for (const t of ingestionTelemetry) {
    // eslint-disable-next-line no-console
    console.log(
      `  [${t.scale.toLocaleString().padStart(7)} rows | ${t.format.padEnd(9)}] ` +
        `Size: ${(t.fileSizeBytes / 1024 / 1024).toFixed(2).padStart(6)} MB | ` +
        `Time: ${t.elapsedMs.toFixed(1).padStart(6)} ms | ` +
        `Throughput: ${t.mbPerSec.toFixed(1).padStart(6)} MB/s | ` +
        `${t.rowsPerSec.toLocaleString().padStart(10)} rows/s`,
    );
  }
  // eslint-disable-next-line no-console
  console.log("================================================================================\n");
}, 300_000);

afterAll(async () => {
  try {
    conn?.disconnectSync?.();
    instance?.closeSync?.();
  } catch {
    // best-effort cleanup
  }
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── Benchmarks: Ingestion Throughput ─────────────────────────────────────────

describe("DuckDB Ingestion Throughput (100k rows)", () => {
  bench(
    "Ingestion: CSV via read_csv to in-memory table",
    async () => {
      await conn.run(`
        CREATE OR REPLACE TEMP TABLE _bench_ingest_csv AS
        SELECT * FROM read_csv('${filePaths.csv100k}', auto_detect = true, header = true);
        DROP TABLE _bench_ingest_csv;
      `);
    },
    BENCH_CONFIG,
  );

  bench(
    "Ingestion: Columnar Parquet via read_parquet",
    async () => {
      await conn.run(`
        CREATE OR REPLACE TEMP TABLE _bench_ingest_pq AS
        SELECT * FROM read_parquet('${filePaths.parquet100k}');
        DROP TABLE _bench_ingest_pq;
      `);
    },
    BENCH_CONFIG,
  );

  bench(
    "Ingestion: Direct in-memory table generation (100k rows)",
    async () => {
      await conn.run(`
        CREATE OR REPLACE TEMP TABLE _bench_ingest_gen AS
        ${buildTelecomFactSql(100_000)};
        DROP TABLE _bench_ingest_gen;
      `);
    },
    BENCH_CONFIG,
  );
});

// ─── Benchmarks: Core Enterprise OLAP Aggregation ─────────────────────────────

describe("DuckDB OLAP: Multi-Dimensional Aggregation", () => {
  bench(
    "OLAP: Multi-dimensional GROUP BY (100k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.olapMultiDimGroupBy("fact_100k"));
    },
    BENCH_CONFIG,
  );

  bench(
    "OLAP: Multi-dimensional GROUP BY (500k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.olapMultiDimGroupBy("fact_500k"));
    },
    BENCH_CONFIG,
  );

  bench(
    "OLAP: Percentiles & Distinct Estimation (100k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.olapPercentiles("fact_100k"));
    },
    BENCH_CONFIG,
  );

  bench(
    "OLAP: Percentiles & Distinct Estimation (500k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.olapPercentiles("fact_500k"));
    },
    BENCH_CONFIG,
  );
});

// ─── Benchmarks: Window Functions & Time-Series ───────────────────────────────

describe("DuckDB Time-Series & Window Functions", () => {
  bench(
    "Window: 7-day & 30-day Rolling Averages (100k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.windowRollingAverages("fact_100k"));
    },
    BENCH_CONFIG,
  );

  bench(
    "Window: 7-day & 30-day Rolling Averages (500k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.windowRollingAverages("fact_500k"));
    },
    BENCH_CONFIG,
  );

  bench(
    "Window: Customer Lags & Moving Window (100k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.windowCustomerLags("fact_100k"));
    },
    BENCH_CONFIG,
  );

  bench(
    "Window: Customer Lags & Moving Window (500k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.windowCustomerLags("fact_500k"));
    },
    BENCH_CONFIG,
  );
});

// ─── Benchmarks: High-Cardinality Dimension-Fact JOINs ────────────────────────

describe("DuckDB High-Cardinality JOINs", () => {
  bench(
    "JOIN: Customer Dimension (50k) x Fact (100k) Multi-Agg",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.joinDimensionFact("fact_100k", "customers"));
    },
    BENCH_CONFIG,
  );

  bench(
    "JOIN: Customer Dimension (50k) x Fact (500k) Multi-Agg",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.joinDimensionFact("fact_500k", "customers"));
    },
    BENCH_CONFIG,
  );

  bench(
    "JOIN: Top Customer Spenders Lifetime Value (100k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.joinTopSpenders("fact_100k", "customers"));
    },
    BENCH_CONFIG,
  );

  bench(
    "JOIN: Top Customer Spenders Lifetime Value (500k rows)",
    async () => {
      await conn.runAndReadAll(BENCHMARK_QUERIES.joinTopSpenders("fact_500k", "customers"));
    },
    BENCH_CONFIG,
  );
});
