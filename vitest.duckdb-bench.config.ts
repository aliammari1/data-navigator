import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Native-DuckDB benchmark configuration.
 *
 * This is a SEPARATE vitest project from the unit suite (`vitest.config.ts`)
 * and from the eval harness (`vitest.eval.config.ts`). It exists for one reason:
 * the `@duckdb/node-api` native addon needs a real Node.js environment — it does
 * NOT work under jsdom (the default `environment` in the base config), which is
 * why the in-repo unit/bench suites mock the DuckDB IPC boundary instead of
 * exercising the engine.
 *
 * These benches load the REAL engine, write synthetic CSV/Parquet to a temp dir,
 * and measure ingestion throughput + SUMMARIZE latency against actual data.
 *
 * Differences from the base config:
 * - `environment: "node"` (NOT jsdom) so the native addon loads.
 * - NO React plugin, NO `tests/setup.ts` (jsdom-only matchMedia/observer shims).
 * - `include` is the native-DuckDB bench glob only.
 * - High `testTimeout` — ingesting 1M rows + SUMMARIZE over a wide schema on a
 *   medium-end CPU can take tens of seconds per case.
 *
 * Run:  pnpm run bench:duckdb
 */

// Ingesting 1M rows + profiling a 60-column table on a medium-end CPU is slow;
// give each bench case generous head-room so it never times out mid-measurement.
const DUCKDB_BENCH_TIMEOUT_MS = 600_000;

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/performance/**/*.duckdb-native.bench.{ts,tsx}"],
    exclude: ["node_modules", ".next", "out", "dist", "storybook-static"],
    testTimeout: DUCKDB_BENCH_TIMEOUT_MS,
    hookTimeout: DUCKDB_BENCH_TIMEOUT_MS,
    reporters: ["default"],
    benchmark: {
      include: ["tests/performance/**/*.duckdb-native.bench.{ts,tsx}"],
      exclude: ["node_modules", ".next", "out", "dist", "storybook-static"],
    },
    coverage: { enabled: false },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
