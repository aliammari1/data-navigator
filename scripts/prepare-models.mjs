/**
 * prepare-models.mjs — build/setup-time offline-model acquisition.
 *
 * Downloads the offline AI model weights from Hugging Face into the local
 * destinations the runtime expects, then verifies size + sha256 against the
 * embedded {@link MODEL_MANIFEST}. Idempotent: a model whose file already exists
 * with the expected byte length (and, when `--verify-hash`, the expected sha256)
 * is skipped.
 *
 * Both lanes are GGUF weights for the Electron node-llama-cpp runtime — the
 * embeddings lane no longer runs transformers.js/ONNX in a browser worker:
 *
 *   (a) Instruct GGUF for the chat/completion lane
 *       (electron/llama-service.ts → <userData>/models/llm/<file>).
 *   (b) Embedding GGUF for the embeddings lane
 *       (electron/embedding-service.ts → <userData>/models/embed/<file>).
 *
 * Because this script runs at build/setup time — not inside Electron — it
 * cannot resolve the per-OS userData path. It therefore stages both lanes
 * under repo-local cache dirs (`<repo>/.model-cache/llm/`,
 * `<repo>/.model-cache/embed/`) that the in-app downloader
 * (electron/model-download-service.ts) and packaging step can copy from, or
 * you point `--llm-dest` / `--embed-dest` at the real userData/models/<lane>
 * directory.
 *
 * NETWORK: this script is the ONLY model path that touches the network, and only
 * when run explicitly (`pnpm run models:prepare`). The app itself never downloads
 * at runtime except through the user-triggered Setup affordance.
 *
 * USAGE
 *   node scripts/prepare-models.mjs                 # download missing + verify size
 *   node scripts/prepare-models.mjs --verify-hash   # also verify sha256 (slow)
 *   node scripts/prepare-models.mjs --only=embed    # one group: embed | llm
 *   node scripts/prepare-models.mjs --check         # report presence only, no download
 *   node scripts/prepare-models.mjs --llm-dest=/abs/path/to/userData/models/llm
 *   node scripts/prepare-models.mjs --embed-dest=/abs/path/to/userData/models/embed
 *   node scripts/prepare-models.mjs --low-ram       # also fetch the Granite 3B alternative GGUF
 *
 * The manifest is intentionally embedded here (single source of truth shared in
 * spirit with src/platform/ai/models/model-manifest.ts and
 * electron/model-download-service.ts) so the script has no import dependency on
 * the TS app code.
 */

import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Repo-local staging dirs for GGUF weights (copied into userData by the app /
// packaging step). Keep out of git — see note in return summary.
const LLM_STAGING_DIR = path.join(ROOT, ".model-cache", "llm");
const EMBED_STAGING_DIR = path.join(ROOT, ".model-cache", "embed");

const HF = "https://huggingface.co";

/**
 * @typedef {Object} ModelEntry
 * @property {string}  key        Stable id for --only filtering / logging.
 * @property {"llm"|"embed"} group GGUF destination lane.
 * @property {string}  url        Absolute HF resolve URL.
 * @property {string}  destPath   Absolute on-disk destination.
 * @property {number}  bytes      Expected content length (for size verify + skip).
 * @property {string}  sha256     Expected lowercase hex sha256 ("" = TODO/unknown).
 * @property {boolean} [optional] Only fetched with the matching flag (--low-ram).
 * @property {string}  [label]
 */

/**
 * Embedded manifest. bytes/sha256 marked `TODO` below MUST be filled from the
 * real HF artifacts before a verified release — they are the integrity contract.
 * The placeholder `0` bytes / `""` sha256 mean "unknown": the script will still
 * download, but size-skip and hash-verify degrade to "download + warn".
 *
 * @type {ModelEntry[]}
 */
export const MODEL_MANIFEST = [
  // Mirrors electron/model-download-service.ts's MODEL_DOWNLOADS — the
  // canonical in-app catalog — keep both in lockstep.
  // ── (a) Instruct GGUF — Electron node-llama-cpp lane ───────────────────────
  // Default: MiniCPM-V 4.6 (1B Multimodal, ~529 MB). OpenBMB 2026.
  {
    key: "minicpm-v-4.6-q4_k_m",
    group: "llm",
    label: "MiniCPM-V 4.6 (1B, Multimodal)",
    url: `${HF}/openbmb/MiniCPM-V-4.6-gguf/resolve/main/MiniCPM-V-4_6-Q4_K_M.gguf?download=true`,
    destPath: path.join(LLM_STAGING_DIR, "minicpm-v-4.6-q4_k_m.gguf"),
    bytes: 529_101_504,
    sha256: "", // TODO: fill sha256 of the released artifact before a verified build
  },
  // Multimodal reasoning specialist: SmolVLM2 2.2B Instruct (~1.11 GB).
  {
    key: "smolvlm2-2.2b-instruct-q4_k_m",
    group: "llm",
    label: "SmolVLM2 2.2B Instruct (Multimodal)",
    optional: true,
    url: `${HF}/ggml-org/SmolVLM2-2.2B-Instruct-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Q4_K_M.gguf?download=true`,
    destPath: path.join(LLM_STAGING_DIR, "smolvlm2-2.2b-instruct-q4_k_m.gguf"),
    bytes: 1_112_602_656,
    sha256: "", // TODO: fill sha256 of the released artifact before a verified build
  },
  // Tool-call specialist: Liquid AI LFM2.5-2.6B Q4_K_M (August 2026).
  {
    key: "lfm2-5-2.6b-q4_k_m",
    group: "llm",
    label: "LFM2.5-2.6B Instruct (Q4_K_M, Liquid AI 2026)",
    optional: true,
    url: `${HF}/LiquidAI/LFM2.5-2.6B-GGUF/resolve/main/lfm2-5-2.6b-q4_k_m.gguf?download=true`,
    destPath: path.join(LLM_STAGING_DIR, "lfm2-5-2.6b-q4_k_m.gguf"),
    bytes: 1674455040,
    sha256: "02a8b7e17487d326e46d68ce0ba24211e1b80a14c4cd0597fa73c1cd697f52ed",
  },
  // Apache 2.0 alternative: IBM Granite 4.0 1B transformer variant (not the
  // Mamba hybrid — llama.cpp does not support that one).
  {
    key: "granite-4.0-1b-q4_k_m",
    group: "llm",
    label: "Granite 4.0 1B Instruct (GGUF q4_k_m, Apache 2.0)",
    optional: true,
    url: `${HF}/ibm-granite/granite-4.0-1b-GGUF/resolve/main/granite-4.0-1b-q4_k_m.gguf?download=true`,
    destPath: path.join(LLM_STAGING_DIR, "granite-4.0-1b-q4_k_m.gguf"),
    bytes: 1023645440,
    sha256: "22ec0f9cc99a90185312de3c882c84e7bd6789bdd050389844380a01a831d7f1",
  },
  // Reasoning fallback: Qwen3-1.7B UD-Q4_K_XL via Unsloth (April 2026).
  // Official Qwen/Qwen3-1.7B-GGUF ships Q8_0 only — 4-bit comes from
  // huggingface.co/unsloth/Qwen3-1.7B-GGUF (Qwen3-1.7B-UD-Q4_K_XL.gguf).
  {
    key: "qwen3-1.7b-q4_k_m",
    group: "llm",
    label: "Qwen3-1.7B Instruct (Unsloth UD-Q4_K_XL, Apache 2.0)",
    optional: true,
    url: `${HF}/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-UD-Q4_K_XL.gguf?download=true`,
    destPath: path.join(LLM_STAGING_DIR, "qwen3-1.7b-q4_k_m.gguf"),
    bytes: 1_132_952_128,
    sha256: "", // TODO
  },
  // Lower-resource alternative: Granite 4.1 3B Instruct q4_k_m (Apache 2.0). Optional (--low-ram).
  {
    key: "granite-4.1-3b-instruct-q4_k_m",
    group: "llm",
    label: "Granite 4.1 3B Instruct (GGUF q4_k_m, Apache 2.0)",
    optional: true,
    // Repo has no "-instruct-" in its name or its filenames — Granite 4.1 3B IS
    // the instruct model; see huggingface.co/ibm-granite/granite-4.1-3b-GGUF.
    url: `${HF}/ibm-granite/granite-4.1-3b-GGUF/resolve/main/granite-4.1-3b-Q4_K_M.gguf?download=true`,
    destPath: path.join(LLM_STAGING_DIR, "granite-4.1-3b-instruct-q4_k_m.gguf"),
    bytes: 2099501664,
    sha256: "662b0626cd58f443baea23559b469df6576a81d349649c59413b36a9fb32eb29",
  },

  // ── (b) all-MiniLM-L6-v2 embedding GGUF — Electron node-llama-cpp lane ──────
  // Mirrors electron/model-download-service.ts's MODEL_DOWNLOADS embed entry —
  // keep both in lockstep. sha256/bytes were computed from a real downloaded
  // file (see model-download-service.ts's comment); re-verify via
  // `pnpm run models:hash` before pinning a release.
  {
    key: "all-minilm-l6-v2-embed-q8_0",
    group: "embed",
    label: "all-MiniLM-L6-v2 Embeddings (GGUF Q8_0)",
    url: `${HF}/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q8_0.gguf?download=true`,
    destPath: path.join(EMBED_STAGING_DIR, "all-minilm-l6-v2-embed-q8_0.gguf"),
    bytes: 25_008_064,
    sha256: "263215c3cadd6e16740741a7624ab4cbb6c8e777688bd5331ecfbf5681c2f8ed",
  },
];

// ─── arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    verifyHash: false,
    checkOnly: false,
    lowRam: false,
    only: null, // "llm" | "minilm" | "embed" | null
    llmDest: null,
    embedDest: null,
  };
  for (const arg of argv) {
    if (arg === "--verify-hash") opts.verifyHash = true;
    else if (arg === "--check") opts.checkOnly = true;
    else if (arg === "--low-ram") opts.lowRam = true;
    else if (arg.startsWith("--only=")) opts.only = arg.slice("--only=".length);
    else if (arg.startsWith("--llm-dest=")) opts.llmDest = arg.slice("--llm-dest=".length);
    else if (arg.startsWith("--embed-dest=")) opts.embedDest = arg.slice("--embed-dest=".length);
  }
  return opts;
}

function matchesOnly(entry, only) {
  if (!only) return true;
  if (only === "llm") return entry.group === "llm";
  if (only === "embed" || only === "minilm") return entry.group === "embed";
  return entry.key === only;
}

// ─── integrity ────────────────────────────────────────────────────────────────

async function sha256File(filePath) {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/**
 * @returns {Promise<{ ok: boolean; reason?: string; bytes: number; sha?: string }>}
 */
async function verifyExisting(entry, { verifyHash }) {
  if (!existsSync(entry.destPath)) {
    return { ok: false, reason: "missing", bytes: 0 };
  }
  const actualBytes = statSync(entry.destPath).size;
  if (entry.bytes > 0 && actualBytes !== entry.bytes) {
    return {
      ok: false,
      reason: `size mismatch (${actualBytes} ≠ ${entry.bytes})`,
      bytes: actualBytes,
    };
  }
  if (verifyHash && entry.sha256) {
    const sha = await sha256File(entry.destPath);
    if (sha !== entry.sha256) {
      return { ok: false, reason: `sha256 mismatch`, bytes: actualBytes, sha };
    }
    return { ok: true, bytes: actualBytes, sha };
  }
  // Present and size-consistent (or size unknown). Treat as valid for idempotency.
  return { ok: true, bytes: actualBytes };
}

// ─── download ─────────────────────────────────────────────────────────────────

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

async function downloadEntry(entry, { verifyHash }) {
  mkdirSync(path.dirname(entry.destPath), { recursive: true });

  const res = await fetch(entry.url, {
    redirect: "follow",
    headers: { "user-agent": "data-navigator/prepare-models" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} for ${entry.url}`);
  }

  const tmp = `${entry.destPath}.download`;
  const expected = entry.bytes || Number(res.headers.get("content-length")) || 0;
  let received = 0;
  let lastLogged = 0;

  const hash = verifyHash ? createHash("sha256") : null;
  const source = Readable.fromWeb(res.body);
  source.on("data", (chunk) => {
    received += chunk.length;
    hash?.update(chunk);
    if (expected && received - lastLogged > 16 * 1024 * 1024) {
      lastLogged = received;
      const pct = Math.floor((received / expected) * 100);
      process.stdout.write(`\r    ${entry.key}: ${pct}% (${humanBytes(received)})   `);
    }
  });

  await pipeline(source, createWriteStream(tmp));
  process.stdout.write("\r");

  // Integrity gate before promoting the temp file.
  if (entry.bytes > 0 && received !== entry.bytes) {
    await rm(tmp, { force: true });
    throw new Error(
      `${entry.key}: byte mismatch (got ${received}, manifest ${entry.bytes}) — refusing to install`,
    );
  }
  if (verifyHash && entry.sha256 && hash) {
    const sha = hash.digest("hex");
    if (sha !== entry.sha256) {
      await rm(tmp, { force: true });
      throw new Error(`${entry.key}: sha256 mismatch (got ${sha}, manifest ${entry.sha256})`);
    }
  }

  // Atomic-ish promote.
  const { rename } = await import("node:fs/promises");
  await rename(tmp, entry.destPath);
  return received;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // Optionally redirect a GGUF group to a real userData/models/<lane> dir.
  const entries = MODEL_MANIFEST.filter((e) => matchesOnly(e, opts.only))
    .filter((e) => (e.optional ? opts.lowRam : true))
    .map((e) => {
      if (e.group === "llm" && opts.llmDest) {
        return { ...e, destPath: path.join(opts.llmDest, path.basename(e.destPath)) };
      }
      if (e.group === "embed" && opts.embedDest) {
        return { ...e, destPath: path.join(opts.embedDest, path.basename(e.destPath)) };
      }
      return e;
    });

  if (entries.length === 0) {
    console.log("No manifest entries matched the given filters.");
    return;
  }

  console.log(
    `prepare-models: ${entries.length} artifact(s)${opts.checkOnly ? " (check only)" : ""}`,
  );

  let downloaded = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  for (const entry of entries) {
    const status = await verifyExisting(entry, { verifyHash: opts.verifyHash });

    if (status.ok) {
      console.log(`  ✓ present ${entry.key} (${humanBytes(status.bytes)})`);
      skipped++;
      continue;
    }

    if (opts.checkOnly) {
      console.log(`  ✗ ${status.reason} ${entry.key} → ${path.relative(ROOT, entry.destPath)}`);
      missing++;
      continue;
    }

    try {
      console.log(`  ↓ downloading ${entry.key} (${status.reason})`);
      const got = await downloadEntry(entry, { verifyHash: opts.verifyHash });
      console.log(`  ✓ installed ${entry.key} (${humanBytes(got)})`);
      downloaded++;
    } catch (err) {
      console.error(`  ✗ FAILED ${entry.key}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(
    `\nprepare-models done — downloaded ${downloaded}, present ${skipped}` +
      (opts.checkOnly ? `, missing ${missing}` : "") +
      (failed ? `, failed ${failed}` : ""),
  );

  if (failed > 0) process.exitCode = 1;
  if (opts.checkOnly && missing > 0) process.exitCode = 2;

  if (entries.some((e) => e.group === "llm" && !opts.llmDest)) {
    console.log(
      `\nNote: chat GGUF weights were staged under ${path.relative(ROOT, LLM_STAGING_DIR)}.\n` +
        `      At runtime they must live in <userData>/models/llm/. The in-app Setup\n` +
        `      downloader (electron/model-download-service.ts) fetches directly to userData,\n` +
        `      or pass --llm-dest=<userData>/models/llm to write there now.`,
    );
  }
  if (entries.some((e) => e.group === "embed" && !opts.embedDest)) {
    console.log(
      `\nNote: embedding GGUF weights were staged under ${path.relative(ROOT, EMBED_STAGING_DIR)}.\n` +
        `      At runtime they must live in <userData>/models/embed/. The in-app Setup\n` +
        `      downloader (electron/model-download-service.ts) fetches directly to userData,\n` +
        `      or pass --embed-dest=<userData>/models/embed to write there now.`,
    );
  }
}

main().catch((err) => {
  console.error("prepare-models fatal:", err);
  process.exitCode = 1;
});
