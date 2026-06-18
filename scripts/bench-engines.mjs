#!/usr/bin/env node
// @ts-check
/**
 * Competitive benchmark: DuckDB vs other embedded analytical engines.
 *
 * Goal: run the SAME aggregation workload over the SAME on-disk CSV across
 * several Windows-compatible Node engines and print one comparison table.
 *
 * Engines:
 *   1. DuckDB (current/app)  - all_varchar CSV -> VARCHAR table, TRY_CAST per query
 *                              (mirrors this app's read-only renderer DuckDB,
 *                               which can't CREATE typed tables and casts in
 *                               every query: see src/features/telecom/lib/queries.ts)
 *   2. DuckDB (typed)        - read_csv_auto type inference -> typed CTAS table
 *   3. Polars (lazy)         - pl.scanCSV(...).groupBy(...).agg(...).collect()
 *   4. node:sqlite           - Node 24 built-in SQLite, prepared-stmt tx insert
 *   5. better-sqlite3        - native SQLite, prepared-stmt tx insert
 *   6. sql.js                - pure-WASM SQLite
 *   7. alasql                - pure-JS SQL
 *   8. arquero               - pure-JS dataframe
 *
 * Workload (identical semantics everywhere):
 *   Q1 GROUP BY channel: total=count(*), success=count(status='success'),
 *                        amount_total=sum(amount)
 *   Q2 filtered count:   count(status='success' AND amount > THRESHOLD)
 *
 * Each engine is wrapped in try/catch + dynamic import. A missing dep or a
 * runtime failure (e.g. OOM at 1M) is reported as a skipped/failed row; the
 * script keeps going with whatever is available.
 *
 * Env:
 *   DN_BENCH_ROWS   row count (default 1_000_000)
 *   DN_BENCH_REPEAT measured repeats per query (default 5, median reported)
 */

import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const ROWS = Number(process.env.DN_BENCH_ROWS ?? 1_000_000);
const REPEAT = Number(process.env.DN_BENCH_REPEAT ?? 5);
const AMOUNT_THRESHOLD = 500; // Q2 filter: amount > 500

const CHANNELS = ["USSD", "APP", "WEB", "SMS"];
const STATUSES = ["success", "declined", "refund", "pending"];
const REGIONS = ["North", "South", "East", "West", "Central"];
const OPERATORS = ["Op-A", "Op-B", "Op-C"];

/** Median of a numeric array. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Time a (possibly async) thunk in ms. */
async function timed(fn) {
  const start = performance.now();
  const result = await fn();
  return { ms: performance.now() - start, result };
}

/**
 * Deterministic synthetic telecom data -> CSV file. No Math.random / Date.now.
 * Every engine loads this exact file so the comparison is apples-to-apples.
 * Returns { file, cleanup, bytes, expected } where `expected` is the
 * ground-truth Q1/Q2 result computed in plain JS for cross-checking.
 */
function generateCsv(rows) {
  const dir = mkdtempSync(join(tmpdir(), "dn-bench-"));
  const file = join(dir, `telecom-${rows}.csv`);

  // Ground-truth accumulators (the canonical answer all engines must match).
  const totals = new Map(); // channel -> { total, success, amount_total }
  for (const c of CHANNELS) {
    totals.set(c, { total: 0, success: 0, amount_total: 0 });
  }
  let q2Count = 0;

  const header = "channel,status,amount,region,operator,hour,customer_id\n";
  const parts = [header];
  // Build the CSV body in chunks to avoid one giant string for huge row counts.
  let chunk = "";
  const FLUSH_EVERY = 50_000;

  for (let i = 0; i < rows; i++) {
    const channel = CHANNELS[i % CHANNELS.length];
    // ~70% success: indices 0..6 of a 10-wide cycle map to success.
    const statusCycle = i % 10;
    const status =
      statusCycle < 7 ? "success" : STATUSES[1 + (statusCycle % 3)];
    // Deterministic amount in [1, 1000] with two decimals.
    const amountCents = ((i * 37 + 13) % 100_000) + 1; // 1..100000 cents
    const amount = (amountCents / 100).toFixed(2);
    const amountNum = amountCents / 100;
    const region = REGIONS[i % REGIONS.length];
    const operator = OPERATORS[i % OPERATORS.length];
    const hour = i % 24;
    const customerId = `C${100000 + (i % 50000)}`;

    chunk += `${channel},${status},${amount},${region},${operator},${hour},${customerId}\n`;

    const t = totals.get(channel);
    t.total += 1;
    if (status === "success") t.success += 1;
    t.amount_total += amountNum;
    if (status === "success" && amountNum > AMOUNT_THRESHOLD) q2Count += 1;

    if (i % FLUSH_EVERY === FLUSH_EVERY - 1) {
      parts.push(chunk);
      chunk = "";
    }
  }
  if (chunk) parts.push(chunk);

  writeFileSync(file, parts.join(""));
  const bytes = statSync(file).size;

  // Normalize expected into a sorted, rounded, comparable shape.
  const expected = {
    q1: [...totals.entries()]
      .map(([channel, v]) => ({
        channel,
        total: v.total,
        success: v.success,
        amount_total: round2(v.amount_total),
      }))
      .sort((a, b) => a.channel.localeCompare(b.channel)),
    q2: q2Count,
  };

  return {
    file,
    bytes,
    expected,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort temp cleanup */
      }
    },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Normalize an engine's Q1 rows into the canonical comparable shape so we can
 * diff against `expected`. Tolerates BigInt, numeric strings, and float drift.
 */
function normalizeQ1(rows) {
  return rows
    .map((r) => ({
      channel: String(r.channel),
      total: Number(r.total),
      success: Number(r.success),
      amount_total: round2(Number(r.amount_total)),
    }))
    .sort((a, b) => a.channel.localeCompare(b.channel));
}

/**
 * Extract the scalar count from a Q2 result. Engines return Q2 as a single-row
 * result set shaped like `[{ c: N }]` (or `[{ <somekey>: N }]`); pull the first
 * numeric field of the first row.
 */
function q2Scalar(q2) {
  if (q2 == null) return Number.NaN;
  if (Array.isArray(q2)) {
    const row = q2[0];
    if (row == null) return Number.NaN;
    if (typeof row === "object") {
      const first = Object.values(row)[0];
      return Number(first);
    }
    return Number(row);
  }
  if (typeof q2 === "object") return Number(Object.values(q2)[0]);
  return Number(q2);
}

/** True if engine Q1/Q2 match ground truth (small float tolerance on sums). */
function crossCheck(q1, q2, expected) {
  if (q2Scalar(q2) !== expected.q2) return false;
  const got = normalizeQ1(q1);
  if (got.length !== expected.q1.length) return false;
  for (let i = 0; i < got.length; i++) {
    const a = got[i];
    const b = expected.q1[i];
    if (a.channel !== b.channel) return false;
    if (a.total !== b.total) return false;
    if (a.success !== b.success) return false;
    if (Math.abs(a.amount_total - b.amount_total) > 0.5) return false;
  }
  return true;
}

/**
 * Run one engine: warmup once, then REPEAT measured passes per query.
 * `engine` returns { load, q1, q2 } thunks; load() is timed once per pass
 * (load cost is real and engine-specific), q1()/q2() are timed per pass.
 *
 * Returns a result row or throws (caught by the caller -> failed/skipped row).
 */
async function runEngine(name, category, makeContext, expected) {
  // Warmup (also validates correctness before timing).
  const warm = await makeContext();
  const warmLoad = await timed(warm.load);
  const ctx = warmLoad.result;
  const wq1 = await warm.q1(ctx);
  const wq2 = await warm.q2(ctx);
  const correct = crossCheck(wq1, wq2, expected);
  if (warm.dispose) await warm.dispose(ctx);

  const loadTimes = [warmLoad.ms];
  const q1Times = [];
  const q2Times = [];

  for (let pass = 0; pass < REPEAT; pass++) {
    const e = await makeContext();
    const loaded = await timed(e.load);
    loadTimes.push(loaded.ms);
    const c = loaded.result;
    const t1 = await timed(() => e.q1(c));
    q1Times.push(t1.ms);
    const t2 = await timed(() => e.q2(c));
    q2Times.push(t2.ms);
    if (e.dispose) await e.dispose(c);
    // Encourage GC between heavy passes when exposed (--expose-gc).
    if (global.gc) global.gc();
  }

  const q1Med = median(q1Times);
  return {
    Engine: name,
    Category: category,
    "Load (ms)": Math.round(median(loadTimes)),
    "Q1 group-by (ms)": Math.round(q1Med),
    "Q2 count (ms)": Math.round(median(q2Times)),
    "Q1 (M rows/s)": +(ROWS / q1Med / 1000).toFixed(2),
    _q1ms: q1Med,
    _correct: correct,
    _status: "ok",
  };
}

function skippedRow(name, category, reason) {
  return {
    Engine: name,
    Category: category,
    "Load (ms)": reason,
    "Q1 group-by (ms)": "-",
    "Q2 count (ms)": "-",
    "Q1 (M rows/s)": "-",
    _q1ms: Infinity,
    _correct: null,
    _status: reason.startsWith("skipped") ? "skipped" : "failed",
  };
}

// ---------------------------------------------------------------------------
// Engine definitions. Each returns { load, q1, q2, dispose?, category }.
// `load` returns the per-pass context object passed to q1/q2.
// ---------------------------------------------------------------------------

/** DuckDB shared SQL strings. */
const DUCK_Q1 = (table, amountExpr) =>
  `SELECT channel,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'success') AS success,
          SUM(${amountExpr}) AS amount_total
   FROM ${table}
   GROUP BY channel
   ORDER BY channel`;
const DUCK_Q2 = (table, amountExpr) =>
  `SELECT COUNT(*) AS c FROM ${table}
   WHERE status = 'success' AND ${amountExpr} > ${AMOUNT_THRESHOLD}`;

async function duckRowsToObjects(reader) {
  // @duckdb/node-api runAndReadAll -> reader.getRowObjects()
  return reader.getRowObjects();
}

function duckCurrentEngine(file) {
  return async () => {
    const { DuckDBInstance } = await import("@duckdb/node-api");
    const csv = file.replace(/\\/g, "/");
    return {
      category: "columnar-native",
      async load() {
        const instance = await DuckDBInstance.create(":memory:");
        const conn = await instance.connect();
        // App-style: load ALL columns as VARCHAR into a table; no type inference.
        await conn.run(
          `CREATE TABLE t AS
             SELECT * FROM read_csv('${csv}', header = true, all_varchar = true)`,
        );
        return { instance, conn };
      },
      async q1({ conn }) {
        // Per-row TRY_CAST(amount AS DOUBLE) — exactly the renderer pattern.
        const r = await conn.runAndReadAll(
          DUCK_Q1("t", "TRY_CAST(amount AS DOUBLE)"),
        );
        return duckRowsToObjects(r);
      },
      async q2({ conn }) {
        const r = await conn.runAndReadAll(
          DUCK_Q2("t", "TRY_CAST(amount AS DOUBLE)"),
        );
        return duckRowsToObjects(r);
      },
      async dispose({ conn, instance }) {
        conn.closeSync?.();
        instance.closeSync?.();
      },
    };
  };
}

function duckTypedEngine(file) {
  return async () => {
    const { DuckDBInstance } = await import("@duckdb/node-api");
    const csv = file.replace(/\\/g, "/");
    return {
      category: "columnar-native",
      async load() {
        const instance = await DuckDBInstance.create(":memory:");
        const conn = await instance.connect();
        // Normal DuckDB: native type inference into a typed columnar table.
        await conn.run(
          `CREATE TABLE t AS SELECT * FROM read_csv_auto('${csv}', header = true)`,
        );
        return { instance, conn };
      },
      async q1({ conn }) {
        // amount is already DOUBLE — aggregate directly, no per-row cast.
        const r = await conn.runAndReadAll(DUCK_Q1("t", "amount"));
        return duckRowsToObjects(r);
      },
      async q2({ conn }) {
        const r = await conn.runAndReadAll(DUCK_Q2("t", "amount"));
        return duckRowsToObjects(r);
      },
      async dispose({ conn, instance }) {
        conn.closeSync?.();
        instance.closeSync?.();
      },
    };
  };
}

function polarsEngine(file) {
  return async () => {
    const pl = (await import("nodejs-polars")).default;
    return {
      category: "columnar-native",
      async load() {
        // Lazy scan: nothing executes until collect().
        return { pl, lf: pl.scanCSV(file) };
      },
      async q1({ pl, lf }) {
        const df = await lf
          .groupBy("channel")
          .agg(
            pl.count("channel").alias("total"),
            pl.col("status").eq(pl.lit("success")).sum().alias("success"),
            pl.col("amount").sum().alias("amount_total"),
          )
          .sort("channel")
          .collect();
        return df.toRecords();
      },
      async q2({ pl, lf }) {
        const df = await lf
          .filter(
            pl
              .col("status")
              .eq(pl.lit("success"))
              .and(pl.col("amount").gt(pl.lit(AMOUNT_THRESHOLD))),
          )
          .collect();
        return [{ c: df.height }];
      },
    };
  };
}

/** Shared CSV parser for the row-store SQLite engines (parse cost is real). */
function parseCsvRows(text) {
  const lines = text.split("\n");
  const rows = [];
  // line 0 is header; skip it. Last line may be empty.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",");
    // channel, status, amount, region, operator, hour, customer_id
    rows.push(f);
  }
  return rows;
}

const SQLITE_Q1 =
  `SELECT channel, COUNT(*) AS total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
          SUM(amount) AS amount_total
   FROM t GROUP BY channel ORDER BY channel`;
const SQLITE_Q2 =
  `SELECT COUNT(*) AS c FROM t
   WHERE status = 'success' AND amount > ${AMOUNT_THRESHOLD}`;

function nodeSqliteEngine(file) {
  return async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(file, "utf8");
    return {
      category: "row-store-sql",
      async load() {
        const db = new DatabaseSync(":memory:");
        db.exec(
          "CREATE TABLE t(channel TEXT, status TEXT, amount REAL, region TEXT, operator TEXT, hour INTEGER, customer_id TEXT)",
        );
        const insert = db.prepare(
          "INSERT INTO t VALUES (?, ?, ?, ?, ?, ?, ?)",
        );
        const rows = parseCsvRows(text);
        db.exec("BEGIN");
        for (const f of rows) {
          insert.run(f[0], f[1], Number(f[2]), f[3], f[4], Number(f[5]), f[6]);
        }
        db.exec("COMMIT");
        return { db };
      },
      async q1({ db }) {
        return db.prepare(SQLITE_Q1).all();
      },
      async q2({ db }) {
        return [db.prepare(SQLITE_Q2).get()];
      },
      async dispose({ db }) {
        db.close();
      },
    };
  };
}

function betterSqliteEngine(file) {
  return async () => {
    const Database = (await import("better-sqlite3")).default;
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(file, "utf8");
    return {
      category: "row-store-sql",
      async load() {
        const db = new Database(":memory:");
        db.pragma("journal_mode = MEMORY");
        db.exec(
          "CREATE TABLE t(channel TEXT, status TEXT, amount REAL, region TEXT, operator TEXT, hour INTEGER, customer_id TEXT)",
        );
        const insert = db.prepare(
          "INSERT INTO t VALUES (?, ?, ?, ?, ?, ?, ?)",
        );
        const rows = parseCsvRows(text);
        const insertMany = db.transaction((all) => {
          for (const f of all) {
            insert.run(
              f[0],
              f[1],
              Number(f[2]),
              f[3],
              f[4],
              Number(f[5]),
              f[6],
            );
          }
        });
        insertMany(rows);
        return { db };
      },
      async q1({ db }) {
        return db.prepare(SQLITE_Q1).all();
      },
      async q2({ db }) {
        return [db.prepare(SQLITE_Q2).get()];
      },
      async dispose({ db }) {
        db.close();
      },
    };
  };
}

function sqlJsEngine(file) {
  return async () => {
    const initSqlJs = (await import("sql.js")).default;
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(file, "utf8");
    const SQL = await initSqlJs();
    return {
      category: "pure-js",
      async load() {
        const db = new SQL.Database();
        db.run(
          "CREATE TABLE t(channel TEXT, status TEXT, amount REAL, region TEXT, operator TEXT, hour INTEGER, customer_id TEXT)",
        );
        const insert = db.prepare(
          "INSERT INTO t VALUES (?, ?, ?, ?, ?, ?, ?)",
        );
        const rows = parseCsvRows(text);
        db.run("BEGIN");
        for (const f of rows) {
          insert.run([f[0], f[1], Number(f[2]), f[3], f[4], Number(f[5]), f[6]]);
        }
        db.run("COMMIT");
        insert.free();
        return { db };
      },
      async q1({ db }) {
        const res = db.exec(SQLITE_Q1);
        if (!res.length) return [];
        const { columns, values } = res[0];
        return values.map((v) =>
          Object.fromEntries(columns.map((c, idx) => [c, v[idx]])),
        );
      },
      async q2({ db }) {
        const res = db.exec(SQLITE_Q2);
        return [{ c: res[0].values[0][0] }];
      },
      async dispose({ db }) {
        db.close();
      },
    };
  };
}

function alasqlEngine(file) {
  return async () => {
    const alasql = (await import("alasql")).default;
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(file, "utf8");
    return {
      category: "pure-js",
      async load() {
        // Parse the same CSV into an array of typed objects, then query it.
        const rows = parseCsvRows(text).map((f) => ({
          channel: f[0],
          status: f[1],
          amount: Number(f[2]),
        }));
        return { alasql, rows };
      },
      async q1({ alasql, rows }) {
        // NB: `total` is a reserved word in alasql's parser, so alias the row
        // count as `cnt` and map it back to `total` for the cross-check.
        const out = alasql(
          `SELECT channel,
                  COUNT(*) AS cnt,
                  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
                  SUM(amount) AS amount_total
           FROM ?
           GROUP BY channel
           ORDER BY channel`,
          [rows],
        );
        return out.map((r) => ({
          channel: r.channel,
          total: r.cnt,
          success: r.success,
          amount_total: r.amount_total,
        }));
      },
      async q2({ alasql, rows }) {
        const r = alasql(
          `SELECT COUNT(*) AS c FROM ?
           WHERE status = 'success' AND amount > ${AMOUNT_THRESHOLD}`,
          [rows],
        );
        return r;
      },
    };
  };
}

function arqueroEngine(file) {
  return async () => {
    const aq = await import("arquero");
    const op = aq.op;
    return {
      category: "pure-js",
      async load() {
        const table = await aq.loadCSV(file, {
          // Let arquero auto-parse; amount becomes a number.
        });
        return { aq, op, table };
      },
      async q1({ op, table }) {
        // arquero compiles rollup expressions per row; the inline ternary
        // inside op.sum produces a 0/1 sum (the conditional-count).
        const out = table
          .groupby("channel")
          .rollup({
            total: op.count(),
            success: (d) => op.sum(d.status === "success" ? 1 : 0),
            amount_total: op.sum("amount"),
          })
          .orderby("channel");
        return out.objects();
      },
      async q2({ table }) {
        // arquero filter predicates run in a compiled scope; reference the
        // threshold via params() so it's available inside the predicate.
        const filtered = table
          .params({ thr: AMOUNT_THRESHOLD })
          .filter(
            (d, $) => d.status === "success" && d.amount > $.thr,
          );
        return [{ c: filtered.numRows() }];
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const machine = {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpus: (await import("node:os")).cpus()?.[0]?.model?.trim() ?? "unknown",
  };

  console.log("");
  console.log(
    "Embedded analytical engine benchmark — DuckDB vs the field",
  );
  console.log(
    `Node ${machine.node} | ${machine.platform} | ${machine.cpus}`,
  );
  console.log(
    `Rows: ${ROWS.toLocaleString("en-US")} | repeats: ${REPEAT} (median) | Q2 threshold: amount > ${AMOUNT_THRESHOLD}`,
  );

  console.log("Generating deterministic CSV...");
  const { file, bytes, expected, cleanup } = generateCsv(ROWS);
  console.log(
    `CSV: ${file} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`,
  );
  console.log(
    `Ground truth Q1 (per channel): ${expected.q1
      .map((r) => `${r.channel}=${r.total}`)
      .join("  ")}`,
  );
  console.log(`Ground truth Q2 (success & amount>${AMOUNT_THRESHOLD}): ${expected.q2}`);
  console.log("");

  const engines = [
    ["DuckDB (current/app, VARCHAR+TRY_CAST)", duckCurrentEngine(file)],
    ["DuckDB (typed, read_csv_auto)", duckTypedEngine(file)],
    ["Polars (lazy)", polarsEngine(file)],
    ["node:sqlite (built-in)", nodeSqliteEngine(file)],
    ["better-sqlite3", betterSqliteEngine(file)],
    ["sql.js (WASM)", sqlJsEngine(file)],
    ["alasql", alasqlEngine(file)],
    ["arquero", arqueroEngine(file)],
  ];

  const results = [];
  for (const [name, make] of engines) {
    process.stdout.write(`Running ${name} ... `);
    let category = "?";
    try {
      // Resolve the engine context factory once to read its category and to
      // surface a clean "skipped (not installed)" for missing deps.
      const factory = await make();
      category = factory.category;
      const row = await runEngine(name, category, make, expected);
      results.push(row);
      console.log(
        `done  load=${row["Load (ms)"]}ms q1=${row["Q1 group-by (ms)"]}ms q2=${row["Q2 count (ms)"]}ms  ${row._correct ? "✓ cross-check" : "✗ MISMATCH"}`,
      );
    } catch (err) {
      const msg = err?.message ?? String(err);
      const missing =
        /Cannot find (module|package)|ERR_MODULE_NOT_FOUND|not installed/i.test(
          msg,
        );
      const isOom =
        /out of memory|heap|allocation failed|Array buffer allocation/i.test(
          msg,
        );
      const reason = missing
        ? "skipped (not installed)"
        : isOom
          ? "failed (out of memory)"
          : `failed (${msg.split("\n")[0].slice(0, 60)})`;
      results.push(skippedRow(name, category, reason));
      console.log(reason);
    }
  }

  cleanup();

  // Sort: successful engines by fastest Q1 first, then non-ok rows after.
  results.sort((a, b) => {
    if (a._status === "ok" && b._status !== "ok") return -1;
    if (a._status !== "ok" && b._status === "ok") return 1;
    return a._q1ms - b._q1ms;
  });

  const tableRows = results.map((r) => ({
    Engine: r.Engine,
    Category: r.Category,
    "Load (ms)": r["Load (ms)"],
    "Q1 group-by (ms)": r["Q1 group-by (ms)"],
    "Q2 count (ms)": r["Q2 count (ms)"],
    "Q1 (M rows/s)": r["Q1 (M rows/s)"],
    "cross-check": r._correct === null ? "-" : r._correct ? "OK" : "MISMATCH",
  }));

  console.log("");
  console.log(
    `=== Results: ${ROWS.toLocaleString("en-US")} rows (median of ${REPEAT}, sorted fastest Q1 first) ===`,
  );
  console.table(tableRows);

  console.log(
    "Notes: Load = time to make data queryable (CSV parse + ingest); SQLite/JS load includes per-row insert.",
  );
  console.log(
    "       Polars uses the lazy scanCSV path, so its CSV read is deferred into Q1/Q2 (Load≈0); its query times therefore include scan cost.",
  );

  const anyMismatch = results.some((r) => r._correct === false);
  if (anyMismatch) {
    console.log(
      "WARNING: one or more engines disagreed on the cross-check; their numbers are not comparable.",
    );
  }
}

main().catch((err) => {
  console.error("Benchmark crashed:", err);
  process.exit(1);
});
