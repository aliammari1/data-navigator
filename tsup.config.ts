import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./electron/main.ts", "./electron/preload.ts"],
  external: [
    "electron",
    "better-sqlite3",
    "@duckdb/node-api",
    "@duckdb/node-bindings",
  ],
  splitting: false,
  sourcemap: false,
  clean: true,
  cjsInterop: true,
  skipNodeModulesBundle: false,
  treeshake: true,
  outDir: "build",
  format: ["cjs"],
  bundle: true,
});
