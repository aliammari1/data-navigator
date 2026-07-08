import { build } from "esbuild";

const isWatch = process.argv.includes("--watch");
const isProduction = process.env.NODE_ENV === "production";

const workers = [
  {
    in: "src/workers/python-sandbox.worker.ts",
    out: "public/workers/python-sandbox.worker.js",
  },
  // Shared Comlink workers (web-build pre-bundle path; the renderer also loads
  // these via `new Worker(new URL(...), { type: "module" })` through Next).
  {
    in: "src/workers/analysis.worker.ts",
    out: "public/workers/analysis.worker.js",
  },
  {
    in: "src/workers/chart.worker.ts",
    out: "public/workers/chart.worker.js",
  },
  {
    in: "src/workers/parse.worker.ts",
    out: "public/workers/parse.worker.js",
  },
  {
    in: "src/workers/layout.worker.ts",
    out: "public/workers/layout.worker.js",
  },
  {
    in: "src/workers/export.worker.ts",
    out: "public/workers/export.worker.js",
  },
];

const sharedOptions = {
  bundle: true,
  platform: "browser",
  format: "esm",
  target: ["es2022"],
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
  },
};

if (isWatch) {
  const contexts = await Promise.all(
    workers.map(({ in: entryPoint, out: outfile }) =>
      build({
        ...sharedOptions,
        entryPoints: [entryPoint],
        outfile,
        watch: {
          onRebuild(error) {
            if (error) {
              console.error(`[workers] rebuild failed: ${outfile}`, error);
            } else {
              console.log(`[workers] rebuilt: ${outfile}`);
            }
          },
        },
      }),
    ),
  );

  console.log(`[workers] watching ${contexts.length} workers...`);
} else {
  await Promise.all(
    workers.map(({ in: entryPoint, out: outfile }) =>
      build({
        ...sharedOptions,
        entryPoints: [entryPoint],
        outfile,
      }),
    ),
  );

  console.log("[workers] build completed.");
}
