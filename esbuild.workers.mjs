import { build } from "esbuild";

const workers = [
  {
    in: "src/workers/python-sandbox.worker.ts",
    out: "public/workers/python-sandbox.worker.js",
  },
  { in: "src/workers/llm.worker.ts", out: "public/workers/llm.worker.js" },
  {
    in: "src/features/data-formulator/core/voice/voice-stt-worker.ts",
    out: "public/workers/voice-stt.worker.js",
  },
  {
    in: "src/features/data-formulator/core/voice/voice-command-router.ts",
    out: "public/workers/voice-router.worker.js",
  },
];

await Promise.all(
  workers.map(({ in: entryPoints, out: outfile }) =>
    build({
      entryPoints: [entryPoints],
      outfile,
      bundle: true,
      platform: "browser",
    }),
  ),
);
