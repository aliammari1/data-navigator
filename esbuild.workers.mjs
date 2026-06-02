import { build } from "esbuild";

const isWatch = process.argv.includes("--watch");
const isProduction = process.env.NODE_ENV === "production";

const workers = [
  {
    in: "src/workers/python-sandbox.worker.ts",
    out: "public/workers/python-sandbox.worker.js",
  },
  {
    in: "src/workers/llm.worker.ts",
    out: "public/workers/llm.worker.js",
  },
  {
    in: "src/features/data-formulator/core/voice/voice-stt-worker.ts",
    out: "public/workers/voice-stt.worker.js",
  },
  {
    in: "src/features/data-formulator/core/voice/voice-command-router.ts",
    out: "public/workers/voice-router.worker.js",
  },
  {
    in: "src/features/data-formulator/core/voice/voice-tts-worker.ts",
    out: "public/workers/voice-tts.worker.js",
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
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "development",
    ),
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
