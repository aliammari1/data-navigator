import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./electron/main.ts", "./electron/preload.ts"],
  external: ["electron", "@duckdb/node-api", "@duckdb/node-bindings", "sherpa-onnx-node"],
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
