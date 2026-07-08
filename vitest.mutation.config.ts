import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Stryker-only Vitest configuration.
 *
 * Mutation testing re-runs the suite once per surviving mutant, so the scope is
 * deliberately narrowed to the unit tests that cover the high-value pure modules
 * Stryker mutates (see `stryker.config.mjs` -> `mutate`). Running the full
 * `tests/**` suite per mutant would be an order of magnitude slower for no extra
 * signal — these are the only tests that exercise the mutated code.
 *
 * It mirrors the relevant parts of the main `vitest.config.ts` (jsdom env, the
 * `@` -> `src` alias, deterministic mock reset) so behavior matches the real
 * suite; it only swaps `include` for the scoped set and drops coverage/CI
 * reporters that Stryker does not use.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/shared/duckdb-summary.test.ts",
      "tests/features/ai-analysis/stats.test.ts",
      "tests/features/data-import/summarize.test.ts",
      "tests/features/data-formulator/core/swarm/agents/base.test.ts",
      "tests/platform/ai/nlq.test.ts",
      "tests/features/telecom/lib/sql.test.ts",
      "tests/features/telecom/sql.test.ts",
      "tests/platform/ai/provider/structured.test.ts",
      "tests/platform/ai/provider-structured.test.ts",
      "tests/features/data-formulator/core/swarm/agents/validate.test.ts",
      "tests/electron/sql-guard.test.ts",
      "tests/features/desktop/core/menu/registry.test.ts",
    ],
    exclude: ["node_modules", ".next", "out", "dist", "tests/e2e", "tests/visual"],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
