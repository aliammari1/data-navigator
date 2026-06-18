import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "./electron/main.ts",
    "./electron/preload.ts",
    // Isolated DuckDB read-path host launched via utilityProcess.fork from the
    // broker (electron/workers/duckdb-utility-broker.ts). Must be a separate
    // entry so it emits its own build/workers/duckdb.utility.js the fork can
    // load. OFF by default (DN_DUCKDB_UTILITY=1 to enable); see the broker.
    "./electron/workers/duckdb.utility.ts",
  ],
  external: [
    "electron",
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "sherpa-onnx-node",
    // Native / prebuilt-binary modules: must load from node_modules at runtime,
    // never be bundled into build/main.js (bundling breaks binary resolution).
    "node-llama-cpp",
    "@node-llama-cpp",
    "@hocuspocus/server",
    "@hocuspocus/extension-sqlite",
    "@hocuspocus/extension-database",
    "better-sqlite3",
    "bonjour-service",
    // Next's server must never be bundled into build/main.js — it is loaded at
    // runtime from the self-contained Next standalone bundle (startNextJSServer).
    "next",
  ],
  splitting: false,
  sourcemap: false,
  clean: true,
  cjsInterop: true,
  noExternal: ["@better-auth/electron"],
  skipNodeModulesBundle: false,
  treeshake: true,
  outDir: "build",
  format: ["cjs"],
  bundle: true,
});
