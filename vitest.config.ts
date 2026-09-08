import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const isCI = process.env.CI === "true" || process.env.CI === "1";

/**
 * Vitest configuration.
 *
 * Enterprise notes:
 * - Coverage uses the V8 provider and is gated by per-metric thresholds so the
 *   suite fails when coverage regresses below the agreed quality bar.
 * - In CI we additionally emit `lcov` (for Codecov/SonarQube ingestion) and a
 *   JUnit report (for test-result annotations), without slowing local runs.
 * - `tests/performance/**` benchmarks are excluded from the normal `test` run
 *   and are executed through `pnpm run bench` (vitest bench) instead.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: "unit",
    projects: [
      "./vitest.config.ts",
      "./vitest.eval.config.ts",
      "./vitest.duckdb-bench.config.ts",
    ],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "node_modules",
      ".next",
      "out",
      "dist",
      "storybook-static",
      "tests/e2e",
      "tests/e2e-electron",
      "tests/visual",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      // Playwright specs (e.g. startup.perf.spec.ts) — run via `pnpm run
      // bench:electron`, not the Vitest `test` runner (see benchmark note above).
      "tests/performance",
    ],
    // Keep tests deterministic and isolated.
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    reporters: isCI ? ["default", "junit", "github-actions"] : ["default"],
    outputFile: {
      junit: "./test-results/junit.xml",
    },
    benchmark: {
      include: ["tests/performance/**/*.bench.{ts,tsx}"],
      // Native-DuckDB benches (`*.duckdb-native.bench.*`) require the `node`
      // environment and run only via `pnpm run bench:duckdb`
      // (vitest.duckdb-bench.config.ts). Keep them out of the default jsdom
      // `pnpm run bench` so it stays light and environment-consistent.
      exclude: [
        "node_modules",
        ".next",
        "out",
        "dist",
        "tests/performance/**/*.duckdb-native.bench.{ts,tsx}",
      ],
    },
    coverage: {
      provider: "v8",
      reporter: isCI ? ["text-summary", "json", "json-summary", "lcov"] : ["text", "json", "html"],
      reportsDirectory: "./coverage",
      // Coverage is scoped to the LOGIC layers — where bugs hide and unit tests
      // pay off — and driven to the 80% bar there. UI view components (`*.tsx`
      // under feature roots, screens, components) are intentionally NOT measured
      // here: they are covered by Playwright e2e (`tests/e2e`), Storybook visual
      // regression, a11y, and per-story `play` interaction tests instead. This
      // keeps the headline number honest about behaviour that matters rather
      // than rewarding brittle render/snapshot tests of presentational code.
      include: [
        "src/features/**/lib/**/*.{ts,tsx}",
        "src/features/**/core/**/*.{ts,tsx}",
        "src/features/**/model/**/*.{ts,tsx}",
        "src/features/**/hooks/**/*.{ts,tsx}",
        "src/core/**/*.{ts,tsx}",
        "src/platform/**/*.{ts,tsx}",
        "src/workers/**/*.{ts,tsx}",
        "src/shared/**/*.{ts,tsx}",
        "src/hooks/**/*.{ts,tsx}",
        "electron/**/*.ts",
      ],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.stories.{ts,tsx}",
        "electron/preload.ts",
        "electron/main.ts",
        "**/*.config.{ts,js,mjs}",
        "**/types.ts",
        "**/*.types.ts",
        // ── Hybrid coverage scope (TESTING.md, decision 2026-06-25) ──────────
        // The 80% bar is measured over UNIT-TESTABLE logic. The files below are
        // genuinely hardware-/runtime-bound shells: exercising them needs real
        // audio/GPU/WASM/native bindings or a Worker realm, so they are covered
        // by Playwright e2e + manual QA, not jsdom unit tests. This is a HYBRID,
        // not a blanket "logic-only" carve-out — tractable shell *logic* stays in
        // scope and is unit-tested (e.g. `analysis.worker.ts`'s exported math,
        // `electron/sql-guard.ts`, `upload-to-duckdb.ts`). Each exclusion is justified inline.
        "src/features/eye-tracking/**", // webcam/MediaPipe hardware
        "src/platform/ai/pyodide-ml.ts", // Pyodide WASM bootstrap
        "src/features/forecast-intelligence/core/forecast-pyodide.ts", // Pyodide forecast bootstrap
        "src/platform/browser/forecast-onnx.ts", // ONNX Runtime Web init
        "src/workers/export.worker.ts", // Comlink Worker-realm entry shell
        "src/workers/parse.worker.ts", // Comlink Worker-realm entry shell
        "src/workers/python-sandbox.worker.ts", // onmessage Worker-realm entry shell
        "src/workers/chart.worker.ts", // Comlink Worker-realm entry shell
        "src/workers/layout.worker.ts", // Comlink Worker-realm entry shell
        "src/features/ai-briefing/core/narrator.worker.ts", // Comlink Worker-realm entry shell
        "electron/workers/**", // electron utility-process workers
        "electron/duckdb-service.ts", // native DuckDB binding
        "electron/llama-service.ts", // node-llama-cpp native binding
        "electron/embedding-service.ts", // node-llama-cpp native binding (embeddings lane)
        "electron/collab-hub-service.ts", // native LAN hub server
        "electron/model-download-service.ts", // streaming model downloader
        "electron/duckdb-arrow.ts", // native Arrow bridge
        "electron/auth-client.ts", // IPC client glue
        "src/platform/duckdb/shared-duckdb.ts", // DuckDB-WASM instance bootstrap
        "src/platform/duckdb/duckdb.ts", // DuckDB-WASM loader
        "src/platform/duckdb/duckdb-fs.ts", // OPFS<->DuckDB filesystem
        "src/platform/duckdb/arrow-ipc.ts", // Arrow IPC binding
        "src/platform/storage/app-db.ts", // IndexedDB/OPFS app database
        "src/platform/storage/opfs-handles.ts", // OPFS file handles
        "src/platform/collab/**", // Yjs/WebRTC collab transport
        "src/platform/lan/lan-collab.ts", // LAN WebSocket transport
        "src/platform/auth/auth-database.ts", // better-sqlite3 native auth DB
      ],
      // Quality gate strategy (see TESTING.md): rather than a single global
      // threshold — which would be permanently red against a large, gradually
      // covered codebase — we gate *critical* modules hard and ratchet the set
      // of gated globs outward as coverage grows. This makes the gate
      // meaningful and green from day one.
      thresholds: {
        // ── Global ratchet floor (2026-07-05) ──────────────────────────────
        // Locks in the near-ceiling logic coverage reached across the
        // Hybrid-scoped surface (achieved: lines 99.64 / stmts 98.99 /
        // funcs 99.49 / branch 96.5, after authoring tests for the previously
        // 0%-covered desktop menu subsystem + a handful of partial-coverage
        // cleanups). Floors sit a little below the measured numbers so CI
        // tolerates minor run-to-run noise but fails on any real regression.
        // The remaining gap to 100% is confirmed-unreachable-in-jsdom code
        // (SSR `typeof window/document === "undefined"` guards, one
        // intentionally-empty-in-production array) — not neglect.
        lines: 99,
        statements: 98,
        functions: 98,
        branches: 95,
        // Security-critical: the Electron trust boundary must stay fully tested.
        "electron/security.ts": {
          lines: 95,
          functions: 100,
          branches: 90,
          statements: 95,
        },
        // Pure formatting/statistics helpers used across the app.
        "src/features/telecom/lib/format.ts": {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
        "src/features/data-import/model/helpers.tsx": {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
        // Structured-output parsing is the backbone of every AI feature.
        "src/platform/ai/provider/structured.ts": {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
