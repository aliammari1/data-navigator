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
      "tests/visual",
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
      reporter: isCI
        ? ["text-summary", "json", "json-summary", "lcov"]
        : ["text", "json", "html"],
      reportsDirectory: "./coverage",
      // Only count source we actually ship; exclude generated/boilerplate.
      include: ["src/**/*.{ts,tsx}", "electron/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.stories.{ts,tsx}",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/components/ui/**",
        "electron/preload.ts",
        "electron/main.ts",
        "**/*.config.{ts,js,mjs}",
        "**/types.ts",
        "**/*.types.ts",
      ],
      // Quality gate strategy (see TESTING.md): rather than a single global
      // threshold — which would be permanently red against a large, gradually
      // covered codebase — we gate *critical* modules hard and ratchet the set
      // of gated globs outward as coverage grows. This makes the gate
      // meaningful and green from day one.
      thresholds: {
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
