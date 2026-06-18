/**
 * Model Download Service — Electron MAIN process.
 *
 * Streams the offline AI model weights from Hugging Face into the local dirs the
 * runtime expects, WHILE ONLINE, with progress events back to the renderer. This
 * is the in-app counterpart to the build-time `scripts/prepare-models.mjs`:
 *
 *   - GGUF instruct weights  → `<userData>/models/llm/<file>.gguf`
 *     (consumed by llama-service.ts; never bundled in the asar).
 *   - all-MiniLM ONNX weights → the packaged Next `public/models/transformers/…`
 *     is read-only inside the asar, so MiniLM is downloaded by the RENDERER into
 *     OPFS / the transformers.js browser cache (handled renderer-side), NOT here.
 *     This service owns the GGUF lane (the only one that needs a trusted FS path
 *     outside the sandbox) and exposes presence for both.
 *
 * Mirrors the existing service+IPC pattern (duckdb-service / llama-service):
 *   - pure functions over module state, reached via `ipcMain.handle("models:*")`
 *   - progress pushed on `models:progress` (per requestId), abort via `models:abort`.
 *
 * SECURITY: only the URLs in MODEL_DOWNLOADS are fetchable. The renderer passes a
 * `key`, never a raw URL, so this cannot be turned into an SSRF primitive.
 */

import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { app } from "electron";

// ─── Manifest (GGUF lane only; mirror of model-manifest.ts llm entries) ───────

export interface ModelDownloadEntry {
  key: string;
  /** GGUF filename under <userData>/models/llm. */
  file: string;
  url: string;
  /** Expected sha256 (lowercase hex). "" = unknown → download proceeds, warns. */
  sha256: string;
  /** Expected content-length. 0 = unknown. */
  bytes: number;
  label: string;
  optional: boolean;
}

const HF = "https://huggingface.co";

const MODEL_DOWNLOADS: ModelDownloadEntry[] = [
  {
    key: "qwen2.5-1.5b-instruct-q4_k_m",
    file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    // Pinned-revision form (recommended for a verified release — swap `main` for the
    // commit once hashes below are pinned so the URL and sha256 describe the SAME bytes):
    //   ${HF}/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true
    // HF commit at time of writing: 91cad51170dc346986eccefdc2dd33a9da36ead9 (2024-09-20).
    url: `${HF}/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true`,
    // INTEGRITY: empty sha256 → unverified (download proceeds + warns). Fill via
    // `pnpm run models:hash` before a verified release. Do NOT guess these values.
    sha256: "", // TODO: paste sha256 from `pnpm run models:hash` (must match the pinned revision)
    bytes: 0, // TODO: paste exact byte length from `pnpm run models:hash` (≈1_117_320_736)
    label: "Qwen2.5 1.5B Instruct (GGUF q4)",
    optional: false,
  },
  {
    key: "qwen2.5-0.5b-instruct-q4_k_m",
    file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    // Pinned-revision form (see note above):
    //   ${HF}/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true
    // HF commit at time of writing: 9217f5db79a29953eb74d5343926648285ec7e67.
    url: `${HF}/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true`,
    sha256: "", // TODO: paste sha256 from `pnpm run models:hash`
    bytes: 0, // TODO: paste exact byte length from `pnpm run models:hash` (≈398_000_000)
    label: "Qwen2.5 0.5B Instruct (GGUF q4)",
    optional: true,
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelDownloadProgress = {
  key: string;
  receivedBytes: number;
  totalBytes: number;
  /** 0–100 (or -1 when total is unknown). */
  percent: number;
  done: boolean;
};

export type ModelPresence = {
  key: string;
  file: string;
  label: string;
  optional: boolean;
  present: boolean;
  /** Bytes on disk when present, else 0. */
  sizeBytes: number;
  path: string;
};

export type DownloadModelInput = {
  key: string;
  requestId?: string;
  /** Optional streaming sink wired to `models:progress` in main.ts. */
  onProgress?: (p: ModelDownloadProgress) => void;
  signal?: AbortSignal;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function llmDir(): string {
  return path.join(app.getPath("userData"), "models", "llm");
}

function entryFor(key: string): ModelDownloadEntry {
  const entry = MODEL_DOWNLOADS.find((m) => m.key === key);
  if (!entry) throw new Error(`Unknown model key: ${key}`);
  return entry;
}

function abortError(): Error {
  const error = new Error("Model download aborted");
  error.name = "AbortError";
  return error;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Presence + on-disk size for every GGUF model the app knows about. */
export function listModelPresence(): ModelPresence[] {
  const dir = llmDir();
  return MODEL_DOWNLOADS.map((m) => {
    const p = path.join(dir, m.file);
    const present = existsSync(p);
    return {
      key: m.key,
      file: m.file,
      label: m.label,
      optional: m.optional,
      present,
      sizeBytes: present ? statSync(p).size : 0,
      path: p,
    };
  });
}

export function isModelPresent(key: string): boolean {
  const entry = entryFor(key);
  return existsSync(path.join(llmDir(), entry.file));
}

/**
 * Stream a GGUF model to `<userData>/models/llm/<file>`, verifying size/sha256
 * before promoting the temp file. Idempotent: returns early if already present
 * and size-consistent. Reports progress via `input.onProgress`.
 */
export async function downloadModel(input: DownloadModelInput): Promise<ModelPresence> {
  const entry = entryFor(input.key);
  const dir = llmDir();
  const dest = path.join(dir, entry.file);

  // Idempotent skip: present and (when known) the right size.
  if (existsSync(dest)) {
    const size = statSync(dest).size;
    if (entry.bytes === 0 || size === entry.bytes) {
      input.onProgress?.({
        key: entry.key,
        receivedBytes: size,
        totalBytes: size,
        percent: 100,
        done: true,
      });
      return {
        key: entry.key,
        file: entry.file,
        label: entry.label,
        optional: entry.optional,
        present: true,
        sizeBytes: size,
        path: dest,
      };
    }
  }

  mkdirSync(dir, { recursive: true });

  const res = await fetch(entry.url, {
    redirect: "follow",
    signal: input.signal,
    headers: { "user-agent": "data-navigator/model-download" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} downloading ${entry.key}`);
  }

  const total = entry.bytes || Number(res.headers.get("content-length")) || 0;
  const tmp = `${dest}.download`;
  const hash = entry.sha256 ? createHash("sha256") : null;

  let received = 0;
  let lastEmit = 0;

  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on("data", (chunk: Buffer) => {
    received += chunk.length;
    hash?.update(chunk);
    const now = Date.now();
    // Throttle progress events to ~10/s to avoid flooding IPC.
    if (now - lastEmit > 100) {
      lastEmit = now;
      input.onProgress?.({
        key: entry.key,
        receivedBytes: received,
        totalBytes: total,
        percent: total > 0 ? Math.floor((received / total) * 100) : -1,
        done: false,
      });
    }
  });

  try {
    await pipeline(source, createWriteStream(tmp));
  } catch (err) {
    await rm(tmp, { force: true });
    if (input.signal?.aborted) throw abortError();
    throw err;
  }

  // ── Integrity gate (ENFORCING) — runs before promoting the temp file ────────
  // Contract: when an entry pins a non-empty sha256 (and/or bytes), a mismatch
  // DELETES the temp download and throws (the file never reaches `dest`). When
  // sha256 is empty (hashes not yet pinned), we cannot verify authenticity, so
  // we log a clear unverified-integrity warning but do not block the download.
  if (entry.bytes > 0 && received !== entry.bytes) {
    await rm(tmp, { force: true });
    throw new Error(
      `${entry.key}: byte mismatch (got ${received}, expected ${entry.bytes}) — deleted, refusing to install`,
    );
  }
  if (entry.sha256 && hash) {
    const sha = hash.digest("hex");
    if (sha !== entry.sha256) {
      await rm(tmp, { force: true });
      throw new Error(
        `${entry.key}: sha256 mismatch (got ${sha}, expected ${entry.sha256}) — deleted, refusing to install`,
      );
    }
  } else {
    // No pinned hash → integrity is UNVERIFIED. Surface this loudly so a verified
    // release fills the manifest. Use `pnpm run models:hash` to compute the values.
    console.warn(
      `[model-download] ${entry.key}: integrity UNVERIFIED — no sha256 pinned in the registry. ` +
        `The downloaded weights were NOT authenticated. Run \`pnpm run models:hash\` and paste ` +
        `the sha256/bytes into MODEL_DOWNLOADS before a verified release.`,
    );
  }

  await rename(tmp, dest);

  const size = statSync(dest).size;
  input.onProgress?.({
    key: entry.key,
    receivedBytes: size,
    totalBytes: size,
    percent: 100,
    done: true,
  });

  return {
    key: entry.key,
    file: entry.file,
    label: entry.label,
    optional: entry.optional,
    present: true,
    sizeBytes: size,
    path: dest,
  };
}

/** Delete a downloaded GGUF (free disk / re-download). */
export async function deleteModel(key: string): Promise<{ deleted: boolean }> {
  const entry = entryFor(key);
  const dest = path.join(llmDir(), entry.file);
  if (!existsSync(dest)) return { deleted: false };
  await rm(dest, { force: true });
  return { deleted: true };
}
