import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Offline-LLM EVAL harness configuration.
 *
 * This is a SEPARATE vitest project from the unit suite (`vitest.config.ts`).
 * The unit suite includes `tests/**`; this one includes ONLY `evals/**` so that
 * the (sometimes slow, sometimes model-gated) evals never run as part of the
 * normal `pnpm run test`.
 *
 * Reused from the base config:
 * - `@/` alias  -> ./src           (so eval suites can import app code)
 * - jsdom environment + globals    (matches how app modules expect to load)
 * - tests/setup.ts                 (matchMedia / observers / jest-dom matchers)
 *
 * Differences from the base config:
 * - include is the eval glob, NOT the unit glob.
 * - testTimeout is high (live model load + generation can take a long time).
 * - NO coverage (evals score model behaviour, not line coverage).
 *
 * Run deterministic evals:   pnpm run test:eval
 * Run live (model) evals:    pnpm run test:eval:live   (needs the GGUF installed)
 */

// Live model loads + first-token latency on CPU can be very slow; give them room.
const EVAL_TEST_TIMEOUT_MS = 180_000;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["evals/**/*.eval.ts"],
    exclude: ["node_modules", ".next", "out", "dist", "storybook-static"],
    // Match the unit suite's determinism guarantees.
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    testTimeout: EVAL_TEST_TIMEOUT_MS,
    hookTimeout: EVAL_TEST_TIMEOUT_MS,
    reporters: ["default"],
    // Evals measure model behaviour, not code coverage — keep it off.
    coverage: { enabled: false },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
