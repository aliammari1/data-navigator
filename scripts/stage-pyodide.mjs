/**
 * stage-pyodide.mjs — vendor a self-hosted Pyodide distribution for OFFLINE use.
 *
 * The Python sandbox worker (src/workers/python-sandbox.worker.ts) loads Pyodide
 * and its scientific wheels from `/pyodide/v<ver>/full/` (same-origin, served by
 * the embedded Next server) instead of cdn.jsdelivr.net. This script stages that
 * directory so the advanced Python/ML tier (forecasting via statsmodels, anomaly/
 * cluster via scikit-learn) works with ZERO internet at runtime.
 *
 * It is a SETUP/BUILD-TIME step (the only Pyodide path that touches the network),
 * run explicitly: `pnpm stage:pyodide`. Idempotent — files already present are
 * skipped, so re-runs and offline rebuilds do no network I/O.
 *
 * Robustness: rather than hardcoding wheel versions (which drift per Pyodide
 * release and 404 when wrong), it downloads the release's own `pyodide-lock.json`
 * and resolves the exact `file_name` for the target packages + their transitive
 * `depends`. So bumping PYODIDE_VERSION just works.
 *
 * USAGE
 *   node scripts/stage-pyodide.mjs                 # stage missing files
 *   node scripts/stage-pyodide.mjs --check         # report presence only, no download
 *   node scripts/stage-pyodide.mjs --base=<url>    # override the source base URL
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Keep in lockstep with PYODIDE_VERSION in src/workers/python-sandbox.worker.ts.
const PYODIDE_VERSION = "0.26.4";

// Top-level packages the app's Python actually imports. Transitive deps are
// resolved from pyodide-lock.json, so only the leaves are listed here.
// (numpy/pandas/micropip are also loaded unconditionally by the worker.)
const TARGET_PACKAGES = [
  "numpy",
  "pandas",
  "scipy",
  "scikit-learn",
  "statsmodels",
  "micropip",
];

// Runtime files that are NOT in pyodide-lock.json's package map but are required
// for `importScripts(pyodide.js)` + `loadPyodide({indexURL})` to boot offline.
const RUNTIME_FILES = [
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

function parseArgs(argv) {
  const opts = {
    checkOnly: false,
    base: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
  };
  for (const arg of argv) {
    if (arg === "--check") opts.checkOnly = true;
    else if (arg.startsWith("--base=")) opts.base = arg.slice("--base=".length);
  }
  if (!opts.base.endsWith("/")) opts.base += "/";
  return opts;
}

const DEST_DIR = path.join(ROOT, "public", "pyodide", `v${PYODIDE_VERSION}`, "full");

function humanBytes(n) {
  if (!n) return "?";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function download(fileName, base) {
  const url = `${base}${fileName}`;
  const dest = path.join(DEST_DIR, fileName);
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "data-navigator/stage-pyodide" },
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const tmp = `${dest}.download`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const { rename } = await import("node:fs/promises");
  await rename(tmp, dest);
  return statSync(dest).size;
}

/**
 * Resolve the transitive closure of TARGET_PACKAGES from a parsed pyodide-lock,
 * returning the set of wheel/zip file_names to fetch.
 */
function resolveWheels(lock) {
  const pkgs = lock.packages || {};
  // pyodide-lock keys are normalized lowercase; build a lookup tolerant of case.
  const byName = new Map();
  for (const [key, meta] of Object.entries(pkgs)) {
    byName.set(key.toLowerCase(), meta);
    if (meta?.name) byName.set(String(meta.name).toLowerCase(), meta);
  }
  const seen = new Set();
  const files = new Set();
  const stack = [...TARGET_PACKAGES];
  const missing = [];
  while (stack.length) {
    const name = String(stack.pop()).toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    const meta = byName.get(name);
    if (!meta) {
      missing.push(name);
      continue;
    }
    if (meta.file_name) files.add(meta.file_name);
    for (const dep of meta.depends || []) stack.push(dep);
  }
  return { files: [...files], missing };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `stage-pyodide: Pyodide v${PYODIDE_VERSION} -> ${path.relative(ROOT, DEST_DIR)}` +
      `${opts.checkOnly ? " (check only)" : ""}\n  source: ${opts.base}`,
  );

  // 1) Runtime files. pyodide-lock.json must be present locally to resolve wheels.
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  async function ensure(fileName) {
    const dest = path.join(DEST_DIR, fileName);
    if (existsSync(dest) && statSync(dest).size > 0) {
      skipped++;
      return;
    }
    if (opts.checkOnly) {
      console.log(`  ✗ missing ${fileName}`);
      failed++;
      return;
    }
    try {
      const bytes = await download(fileName, opts.base);
      console.log(`  ✓ ${fileName} (${humanBytes(bytes)})`);
      downloaded++;
    } catch (err) {
      console.error(`  ✗ FAILED ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
      await rm(path.join(DEST_DIR, `${fileName}.download`), { force: true });
      failed++;
    }
  }

  for (const f of RUNTIME_FILES) await ensure(f);

  // 2) Resolve + stage the wheel closure from the (now-local) lock file.
  const lockPath = path.join(DEST_DIR, "pyodide-lock.json");
  if (!existsSync(lockPath)) {
    console.error(
      "\nstage-pyodide: pyodide-lock.json is not available — cannot resolve wheels." +
        (opts.checkOnly ? " Run without --check first (online)." : ""),
    );
    process.exitCode = 1;
    return;
  }
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const { files, missing } = resolveWheels(lock);
  if (missing.length) {
    console.warn(`  ! not found in pyodide-lock (skipped): ${missing.join(", ")}`);
  }
  console.log(`  resolved ${files.length} wheel/dep files from lock`);
  for (const f of files) await ensure(f);

  console.log(
    `\nstage-pyodide done — downloaded ${downloaded}, present ${skipped}` +
      (failed ? `, missing/failed ${failed}` : ""),
  );
  if (failed > 0 && !opts.checkOnly) process.exitCode = 1;
  if (opts.checkOnly && failed > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error("stage-pyodide fatal:", err);
  process.exitCode = 1;
});
