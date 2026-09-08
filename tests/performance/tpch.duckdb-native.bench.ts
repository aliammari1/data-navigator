/**
 * Canonical TPC-H Decision-Support Benchmark Suite for DuckDB.
 *
 * Real DuckDB native engine execution using DuckDB's official `tpch` extension.
 * Benchmarks industry-standard decision-support query patterns across multiple
 * scale factors (sf = 0.01 and sf = 0.1).
 *
 * Queries covered:
 * - Q1: Pricing Summary Report Query (heavy scan, multi-aggregation, grouping on lineitem)
 * - Q6: Forecasting Revenue Change Query (high-selectivity range scan, filter on shipdate, discount, quantity)
 * - Q3: Shipping Priority Query (multi-table join: customer x orders x lineitem with top-10 sort)
 * - Q5: Local Supplier Volume Query (6-table join: customer x orders x lineitem x supplier x nation x region)
 * - Q10: Returned Item Reporting Query (4-table join: customer x orders x lineitem x nation with group by and order by)
 *
 * Run with:
 *   pnpm run bench:duckdb
 *
 * @vitest-environment node
 */

import { performance } from "node:perf_hooks";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, bench, describe } from "vitest";

// ─── Configuration & Query Metadata ──────────────────────────────────────────

interface TpchQueryDefinition {
  queryNr: number;
  name: string;
  description: string;
}

const TPCH_QUERIES: TpchQueryDefinition[] = [
  {
    queryNr: 1,
    name: "Q1: Pricing Summary Report",
    description: "Scan, multi-aggregate, filter, and group by returnflag/linestatus on lineitem",
  },
  {
    queryNr: 6,
    name: "Q6: Forecasting Revenue Change",
    description: "High-selectivity scan filtering by shipdate, discount range, and quantity",
  },
  {
    queryNr: 3,
    name: "Q3: Shipping Priority",
    description: "Join customer x orders x lineitem with order status filtering and top-10 sort",
  },
  {
    queryNr: 5,
    name: "Q5: Local Supplier Volume",
    description: "6-table join evaluating supplier revenue volume within regional boundaries",
  },
  {
    queryNr: 10,
    name: "Q10: Returned Item Reporting",
    description: "4-table join identifying top customers experiencing returned lineitems",
  },
];

const BENCH_CONFIG = { warmupIterations: 2, iterations: 6, time: 0 } as const;

// ─── Suite Lifecycle & State ──────────────────────────────────────────────────

let instance001: DuckDBInstance;
let conn001: Awaited<ReturnType<DuckDBInstance["connect"]>>;

let instance01: DuckDBInstance;
let conn01: Awaited<ReturnType<DuckDBInstance["connect"]>>;

interface TpchTableStats {
  scale: number;
  lineitemRows: number;
  ordersRows: number;
  customerRows: number;
  partRows: number;
  supplierRows: number;
  genElapsedMs: number;
}

const scaleStats: TpchTableStats[] = [];

async function getRowCount(
  conn: Awaited<ReturnType<DuckDBInstance["connect"]>>,
  table: string,
): Promise<number> {
  const res = await conn.runAndReadAll(`SELECT count(*) AS cnt FROM ${table};`);
  const rows = res.getRowObjects() as { cnt?: bigint | number }[];
  return Number(rows[0]?.cnt ?? 0);
}

beforeAll(async () => {
  // ── 1. Initialize Scale Factor 0.01 (~60k lineitems) ───────────────────────
  const t001Start = performance.now();
  instance001 = await DuckDBInstance.create(":memory:");
  conn001 = await instance001.connect();
  await conn001.run("SET max_memory = '2GB';");
  try {
    await conn001.run("INSTALL tpch;");
  } catch {
    // tpch may already be installed or bundled
  }
  await conn001.run("LOAD tpch;");
  await conn001.run("CALL dbgen(sf = 0.01);");
  const gen001Ms = performance.now() - t001Start;

  scaleStats.push({
    scale: 0.01,
    lineitemRows: await getRowCount(conn001, "lineitem"),
    ordersRows: await getRowCount(conn001, "orders"),
    customerRows: await getRowCount(conn001, "customer"),
    partRows: await getRowCount(conn001, "part"),
    supplierRows: await getRowCount(conn001, "supplier"),
    genElapsedMs: gen001Ms,
  });

  // ── 2. Initialize Scale Factor 0.1 (~600k lineitems) ──────────────────────
  const t01Start = performance.now();
  instance01 = await DuckDBInstance.create(":memory:");
  conn01 = await instance01.connect();
  await conn01.run("SET max_memory = '2GB';");
  try {
    await conn01.run("INSTALL tpch;");
  } catch {
    // tpch may already be installed or bundled
  }
  await conn01.run("LOAD tpch;");
  await conn01.run("CALL dbgen(sf = 0.1);");
  const gen01Ms = performance.now() - t01Start;

  scaleStats.push({
    scale: 0.1,
    lineitemRows: await getRowCount(conn01, "lineitem"),
    ordersRows: await getRowCount(conn01, "orders"),
    customerRows: await getRowCount(conn01, "customer"),
    partRows: await getRowCount(conn01, "part"),
    supplierRows: await getRowCount(conn01, "supplier"),
    genElapsedMs: gen01Ms,
  });

  // ── 3. Verification & Warmup ───────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log("\n================================================================================");
  // eslint-disable-next-line no-console
  console.log("  DUCKDB CANONICAL TPC-H BENCHMARK SUITE - INITIALIZATION COMPLETE");
  // eslint-disable-next-line no-console
  console.log("================================================================================");
  for (const s of scaleStats) {
    // eslint-disable-next-line no-console
    console.log(
      `[TPC-H sf=${s.scale}] Lineitems: ${s.lineitemRows.toLocaleString().padStart(8)} | ` +
        `Orders: ${s.ordersRows.toLocaleString().padStart(7)} | ` +
        `Customers: ${s.customerRows.toLocaleString().padStart(6)} | ` +
        `Gen: ${s.genElapsedMs.toFixed(0)} ms`,
    );
  }
  // eslint-disable-next-line no-console
  console.log("--------------------------------------------------------------------------------");
  // Warmup each query and print verified output row count
  for (const q of TPCH_QUERIES) {
    const res001 = await conn001.runAndReadAll(`PRAGMA tpch(${q.queryNr});`);
    const res01 = await conn01.runAndReadAll(`PRAGMA tpch(${q.queryNr});`);
    // eslint-disable-next-line no-console
    console.log(
      `  Verified ${q.name.padEnd(32)} -> sf=0.01: ${res001.getRowObjects().length} rows | sf=0.1: ${res01.getRowObjects().length} rows`,
    );
  }
  // eslint-disable-next-line no-console
  console.log("================================================================================\n");
}, 180_000);

afterAll(async () => {
  try {
    conn001?.disconnectSync?.();
    instance001?.closeSync?.();
  } catch {
    // best-effort cleanup
  }
  try {
    conn01?.disconnectSync?.();
    instance01?.closeSync?.();
  } catch {
    // best-effort cleanup
  }
});

// ─── Benchmarks: TPC-H Scale Factor 0.01 ─────────────────────────────────────

describe("TPC-H Decision Support (Scale Factor sf=0.01)", () => {
  bench(
    "TPC-H sf=0.01: Q1 Pricing Summary Report",
    async () => {
      await conn001.runAndReadAll("PRAGMA tpch(1);");
    },
    BENCH_CONFIG,
  );

  bench(
    "TPC-H sf=0.01: Q6 Forecasting Revenue Change",
    async () => {
      await conn001.runAndReadAll("PRAGMA tpch(6);");
    },
    BENCH_CONFIG,
  );

  bench(
    "TPC-H sf=0.01: Q3 Shipping Priority",
    async () => {
      await conn001.runAndReadAll("PRAGMA tpch(3);");
    },
    BENCH_CONFIG,
  );

  bench(
    "TPC-H sf=0.01: Q5 Local Supplier Volume",
    async () => {
      await conn001.runAndReadAll("PRAGMA tpch(5);");
    },
    BENCH_CONFIG,
  );

  bench(
    "TPC-H sf=0.01: Q10 Returned Item Reporting",
    async () => {
      await conn001.runAndReadAll("PRAGMA tpch(10);");
    },
    BENCH_CONFIG,
  );
});

// ─── Benchmarks: TPC-H Scale Factor 0.1 ──────────────────────────────────────

describe("TPC-H Decision Support (Scale Factor sf=0.1)", () => {
  bench(
    "TPC-H sf=0.1: Q1 Pricing Summary Report",
    async () => {
      await conn01.runAndReadAll("PRAGMA tpch(1);");
    },
    BENCH_CONFIG,
  );

  bench(
    "TPC-H sf=0.1: Q6 Forecasting Revenue Change",
    async () => {
      await conn01.runAndReadAll("PRAGMA tpch(6);");
    },
    BENCH_CONFIG,
  );

  bench(
    "TPC-H sf=0.1: Q3 Shipping Priority",
    async () => {
      await conn01.runAndReadAll("PRAGMA tpch(3);");
    },
    BENCH_CONFIG,
  );

  bench(
    "TPC-H sf=0.1: Q5 Local Supplier Volume",
    async () => {
      await conn01.runAndReadAll("PRAGMA tpch(5);");
    },
    BENCH_CONFIG,
  );

  bench(
    "TPC-H sf=0.1: Q10 Returned Item Reporting",
    async () => {
      await conn01.runAndReadAll("PRAGMA tpch(10);");
    },
    BENCH_CONFIG,
  );
});
