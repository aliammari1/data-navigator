import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./electron/main.ts", "./electron/preload.ts", "./electron/workers/duckdb.utility.ts"],
  external: [
    "electron",
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "node-llama-cpp",
    "@node-llama-cpp",
    "@hocuspocus/server",
    "@hocuspocus/extension-sqlite",
    "@hocuspocus/extension-database",
    "better-sqlite3",
    "bonjour-service",
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
