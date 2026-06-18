/**
 * compute-model-hashes.mjs — print sha256 + byte length for downloaded model
 * weights so they can be PINNED into the integrity registry.
 *
 * The in-app downloader (electron/model-download-service.ts → MODEL_DOWNLOADS)
 * and the build-time fetcher (scripts/prepare-models.mjs → MODEL_MANIFEST) both
 * gate installs on `sha256` + `bytes`. Those fields ship empty ("" / 0) until a
 * verified release pins them. This script computes the real values FROM FILES YOU
 * ALREADY DOWNLOADED — it never touches the network and never fabricates values.
 *
 * It scans, in order, every readable directory below, plus any extra paths you
 * pass, and hashes the GGUF weights it finds:
 *
 *   1. The Electron userData models dir for each known app-name candidate, i.e.
 *      <APPDATA|XDG|Library>/<App>/models/llm   (dev uses "Electron", packaged
 *      uses the productName "Data Navigator"; both are checked).
 *   2. The repo-local staging dir written by prepare-models: <repo>/.model-cache/llm.
 *
 * USAGE
 *   pnpm run models:hash                       # scan the known dirs above
 *   node scripts/compute-model-hashes.mjs --dir=/abs/path/to/models/llm
 *   node scripts/compute-model-hashes.mjs --file=/abs/path/to/model.gguf
 *   node scripts/compute-model-hashes.mjs --json   # machine-readable output
 *
 * Then paste the printed sha256/bytes into the matching entry's `sha256:`/`bytes:`
 * in electron/model-download-service.ts (and scripts/prepare-models.mjs). For a
 * fully reproducible pin, also switch the entry URL from `resolve/main` to the
 * `resolve/<commit>` revision noted in those files so the bytes you hashed match
 * the URL you ship.
 *
 * NETWORK: none. This script only reads local files.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// App-name candidates for the per-OS userData dir. The app does not call
// app.setName(), so dev runs land under "Electron" while packaged builds use the
// Forge productName ("Data Navigator"). We probe both so the script "just works"
// regardless of how the weights were obtained.
const APP_NAME_CANDIDATES = ["Data Navigator", "data-navigator", "Electron"];

/** Mirror of Electron's app.getPath("userData") base dir, per platform. */
function userDataBaseDir() {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function defaultModelDirs() {
  const base = userDataBaseDir();
  const dirs = APP_NAME_CANDIDATES.map((name) => path.join(base, name, "models", "llm"));
  // Repo-local staging dir written by prepare-models.mjs.
  dirs.push(path.join(ROOT, ".model-cache", "llm"));
  return dirs;
}

function parseArgs(argv) {
  const opts = { dirs: [], files: [], json: false };
  for (const arg of argv) {
    if (arg === "--json") opts.json = true;
    else if (arg.startsWith("--dir=")) opts.dirs.push(arg.slice("--dir=".length));
    else if (arg.startsWith("--file=")) opts.files.push(arg.slice("--file=".length));
  }
  return opts;
}

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

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/** Collect candidate model files (GGUF + ONNX) from dirs/files, de-duplicated. */
function collectFiles(opts) {
  const seen = new Set();
  const files = [];

  const add = (p) => {
    const abs = path.resolve(p);
    if (seen.has(abs)) return;
    if (!existsSync(abs)) return;
    if (!statSync(abs).isFile()) return;
    seen.add(abs);
    files.push(abs);
  };

  const dirs = opts.dirs.length > 0 ? opts.dirs : defaultModelDirs();
  for (const dir of dirs) {
    const absDir = path.resolve(dir);
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) continue;
    for (const name of readdirSync(absDir)) {
      if (/\.(gguf|onnx)$/i.test(name)) add(path.join(absDir, name));
    }
  }
  for (const f of opts.files) add(f);

  return files;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const files = collectFiles(opts);

  if (files.length === 0) {
    const scanned = (opts.dirs.length > 0 ? opts.dirs : defaultModelDirs())
      .map((d) => `    ${d}`)
      .join("\n");
    console.error(
      "compute-model-hashes: no .gguf/.onnx files found.\n" +
        "Download a model first (in-app Setup, or `pnpm run prepare:models`), or pass\n" +
        "--dir=<path> / --file=<path>.\n\nScanned:\n" +
        scanned,
    );
    process.exitCode = 1;
    return;
  }

  const results = [];
  if (!opts.json) {
    console.log(`compute-model-hashes: hashing ${files.length} file(s)…\n`);
  }

  for (const file of files) {
    const bytes = statSync(file).size;
    process.stderr.write(`  hashing ${path.basename(file)} (${humanBytes(bytes)})…\r`);
    const sha256 = await sha256File(file);
    process.stderr.write("".padEnd(80, " ") + "\r");
    results.push({ file, basename: path.basename(file), bytes, sha256 });
  }

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log("Paste these into the matching registry entry");
  console.log("(electron/model-download-service.ts MODEL_DOWNLOADS, and");
  console.log(" scripts/prepare-models.mjs MODEL_MANIFEST):\n");

  for (const r of results) {
    console.log(`  ${r.basename}  (${humanBytes(r.bytes)})`);
    console.log(`    path:   ${r.file}`);
    console.log(`    sha256: "${r.sha256}",`);
    console.log(`    bytes: ${r.bytes},`);
    console.log("");
  }

  console.log(
    "Reminder: pin the URL to resolve/<commit> (see the registry comments) so the\n" +
      "bytes you hashed match the exact bytes the app downloads.",
  );
}

main().catch((err) => {
  console.error("compute-model-hashes fatal:", err);
  process.exitCode = 1;
});
