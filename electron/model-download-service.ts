/**
 * Model Download Service — Electron MAIN process.
 *
 * Streams the offline AI model weights from Hugging Face into the local dirs the
 * runtime expects, WHILE ONLINE, with progress events back to the renderer. This
 * is the in-app counterpart to the build-time `scripts/prepare-models.mjs`:
 *
 *   - GGUF instruct weights → `<userData>/models/llm/<file>.gguf`
 *     (consumed by llama-service.ts; never bundled in the asar).
 *   - GGUF embedding weights → `<userData>/models/embed/<file>.gguf`
 *     (consumed by embedding-service.ts; same lane, separate directory so the
 *     chat-model picker in llama-service.ts never has to filter it out by hand).
 *
 * Both lanes share this one downloader/integrity-gate implementation, keyed off
 * each entry's `lane` field (see `dirFor()` below).
 *
 * ─── Downloader: node-llama-cpp, not hand-rolled fetch ────────────────────────
 * Downloads are delegated to node-llama-cpp's own `createModelDownloader` — the
 * same high-speed, resumable, chunked `ipull`-based downloader the
 * `node-llama-cpp pull` CLI uses — instead of a bespoke `fetch()` + stream copy.
 *
 * This is ALSO a correctness fix. The entries in MODEL_DOWNLOADS use
 * node-llama-cpp *model URIs* (`hf:<user>/<model>:<quant>`), which are NOT
 * fetchable: `fetch("hf:…")` throws because `hf:` is not a real URL scheme. Only
 * node-llama-cpp knows how to resolve an `hf:` URI to the concrete Hugging Face
 * `…/resolve/<branch>/<file>.gguf` URL(s). Delegating to it gives us, for free:
 *   - resumable + auto-retried downloads (survives flaky mobile/African links);
 *   - parallel chunked transfer, and multi-part / binary-split GGUF stitching
 *     (pass only the first file's URI and the rest are pulled automatically);
 *   - remote content-length verification + skip-if-already-present-and-sized;
 *   - automatic gated-model auth via HF_TOKEN / ~/.cache/huggingface/token,
 *     or an explicit `tokens: { huggingFace }`.
 *
 * Mirrors the existing service+IPC pattern (duckdb-service / llama-service):
 *   - pure functions over module state, reached via `ipcMain.handle("models:*")`
 *   - progress pushed on `models:progress` (per requestId), abort via `models:abort`.
 *
 * SECURITY: only the URIs in MODEL_DOWNLOADS are downloadable. The renderer passes
 * a `key`, never a raw URI/URL, so this cannot be turned into an SSRF primitive.
 * We additionally pin `fileName` and `dirPath` so a manifest entry can only ever
 * write to `<userData>/models/<lane>/<file>` — never an attacker-chosen path —
 * and, when a sha256 is pinned, we re-hash the finished file and refuse to keep
 * a mismatch (see the integrity gate below).
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { app } from "electron";

// ─── Manifest (GGUF lane only; mirror of model-manifest.ts llm entries) ───────

export interface ModelDownloadEntry {
  key: string;
  /** GGUF filename under <userData>/models/<lane>. Pinned as the downloader's fileName. */
  file: string;
  /**
   * Which inference lane this GGUF feeds: "llm" (chat/completion, consumed by
   * llama-service.ts) or "embed" (embeddings, consumed by embedding-service.ts).
   * Determines the destination subdirectory (see `dirFor()`) and lets
   * llama-service.ts filter its chat-model catalog to lane==="llm" only.
   */
  lane: "llm" | "embed";
  /**
   * node-llama-cpp model URI. Hugging Face scheme:
   *   `hf:<user>/<model>:<quant>`               (recommended — resolves offline/faster)
   *   `hf:<user>/<model>/<file-path>#<branch>`  (exact file / branch)
   * For split / multi-part GGUFs, use the FIRST part's URI; the rest are pulled
   * automatically.
   */
  uri: string;
  /** Expected sha256 (lowercase hex). "" = unknown → download proceeds, warns. */
  sha256: string;
  /** Expected content-length. 0 = unknown. Display/estimate only; the downloader
   *  verifies the real size against the remote itself. */
  bytes: number;
  label: string;
  /** Model family, for grouping in menus (e.g. "Gemma 4"). */
  family: string;
  /** Short size/variant label (e.g. "E4B", "3B"). */
  sizeLabel: string;
  optional: boolean;
  /**
   * What the model can do, verified against vendor docs/model cards (never
   * assumed from size). `tools` means callable through THIS app's generic
   * function path — a model with only a proprietary protocol (LFM2.5's
   * `<|tool_call_start|>` tokens) is `tools: false` here.
   */
  capabilities: ModelCapabilities;
  /** Why a capability is off (shown in the picker). Omit when obvious. */
  capabilityNote?: string;
}

/** Verified capability flags for one catalog model. */
export interface ModelCapabilities {
  /** Callable through the generic function path (data tools, charts, questions). */
  tools: boolean;
  /** Emits <think> reasoning the UI can collapse. */
  thinking: boolean;
  /** Accepts image input (needs a vision checkpoint + pipeline). */
  vision: boolean;
}

/**
 * THE single source of truth for which GGUF models this app ships. Every other
 * GGUF-model reference in the codebase (electron/llama-service.ts's
 * DEFAULT_LLM_MODEL/KNOWN_MODELS, src/platform/ai/models/model-manifest.ts,
 * src/platform/ai/provider/adapters/llamacpp.ts's MODELS) must mirror these
 * exact `key`/`file`/`label` values — llama-service.ts imports this array
 * directly (same main process); the renderer-side files can't (bundling
 * boundary: this module imports `electron` + `node:fs`) so they hand-mirror it
 * — keep them in lockstep when this list changes.
 */
export const MODEL_DOWNLOADS: ModelDownloadEntry[] = [
  {
    key: "gemma-4-e2b-qat-mobile-text-only",
    file: "gemma-4-e2b-qat-mobile-text-only.gguf",
    lane: "llm",
    uri: "hf:google/gemma-4-e2b-qat-mobile-text-only-GGUF/gemma-4-e2b-qat-mobile-text-only-q4_0.gguf",
    sha256: "", // TODO: paste sha256 from `pnpm run models:hash`
    bytes: 840_000_000,
    label: "Gemma 4 E2B Instruct (QAT Mobile Text-only)",
    family: "Gemma 4",
    sizeLabel: "E2B",
    optional: false,
    // Native function calling per Google's Gemma 4 docs; text-only checkpoint.
    capabilities: { tools: true, thinking: true, vision: false },
  },
  {
    key: "lfm2-5-2.6b-q4_k_m",
    file: "lfm2-5-2.6b-q4_k_m.gguf",
    lane: "llm",
    uri: "hf:LiquidAI/LFM2.5-2.6B-GGUF:Q4_K_M",
    sha256: "02a8b7e17487d326e46d68ce0ba24211e1b80a14c4cd0597fa73c1cd697f52ed",
    bytes: 1674455040,
    label: "LFM2.5-2.6B Instruct (Q4_K_M, Liquid AI 2026)",
    family: "LFM",
    sizeLabel: "2.6B",
    optional: true,
    // Proven in-session: never invokes the generic function path (narrates
    // calls as text instead). Its native <|tool_call_start|> protocol is
    // unsupported here, so tools are honestly off.
    capabilities: { tools: false, thinking: true, vision: false },
    capabilityNote: "Sans appels d'outils sur le chemin générique.",
  },
  {
    key: "granite-4.0-1b-q4_k_m",
    file: "granite-4.0-1b-q4_k_m.gguf",
    lane: "llm",
    uri: "hf:ibm-granite/granite-4.0-1b-GGUF:Q4_K_M",
    sha256: "22ec0f9cc99a90185312de3c882c84e7bd6789bdd050389844380a01a831d7f1",
    bytes: 1023645440,
    label: "Granite 4.0 1B Instruct (GGUF q4, Apache 2.0)",
    family: "Granite 4.0",
    sizeLabel: "1B",
    optional: true,
    // OpenAI-schema tool calling per IBM's Granite 4.0 docs.
    capabilities: { tools: true, thinking: false, vision: false },
  },
  {
    key: "qwen3-1.7b-q4_k_m",
    file: "qwen3-1.7b-q4_k_m.gguf",
    lane: "llm",
    uri: "hf:Qwen/Qwen3-1.7B-GGUF:Q4_K_M",
    sha256: "", // TODO: paste sha256 from `pnpm run models:hash`
    bytes: 1_100_000_000,
    label: "Qwen3-1.7B Instruct (GGUF q4, Apache 2.0)",
    family: "Qwen3",
    sizeLabel: "1.7B",
    optional: true,
    // Hermes-style tool use per Qwen's function-calling docs; hybrid thinking.
    capabilities: { tools: true, thinking: true, vision: false },
  },
  {
    key: "gemma-4-e4b-it-q4_k_m",
    file: "gemma-4-e4b-it-q4_k_m.gguf",
    lane: "llm",
    uri: "hf:bartowski/google_gemma-4-E4B-it-GGUF:Q4_K_M",
    sha256: "", // TODO: paste sha256 from `pnpm run models:hash`
    bytes: 5_340_000_000,
    label: "Gemma 4 E4B Instruct (GGUF q4, power-user)",
    family: "Gemma 4",
    sizeLabel: "E4B",
    optional: true,
    // Native function calling per Google's Gemma 4 docs; GGUF text pipeline.
    capabilities: { tools: true, thinking: true, vision: false },
  },
  {
    key: "granite-4.1-3b-instruct-q4_k_m",
    file: "granite-4.1-3b-instruct-q4_k_m.gguf",
    lane: "llm",
    // Repo has no "-instruct-" in its name — Granite 4.1 3B IS the instruct
    // model (finetuned from the separate "-Base" checkpoint); IBM just doesn't
    // suffix the flagship chat variant. Verified at huggingface.co/ibm-granite/granite-4.1-3b-GGUF.
    uri: "hf:ibm-granite/granite-4.1-3b-GGUF:Q4_K_M",
    sha256: "662b0626cd58f443baea23559b469df6576a81d349649c59413b36a9fb32eb29",
    bytes: 2099501664,
    label: "Granite 4.1 3B Instruct (GGUF q4, Apache 2.0)",
    family: "Granite 4.1",
    sizeLabel: "3B",
    optional: true,
    // Enhanced tool calling per IBM's Granite 4.1 docs (BFCL 60.8 @ 3B).
    capabilities: { tools: true, thinking: false, vision: false },
  },
  {
    key: "all-minilm-l6-v2-embed-q8_0",
    file: "all-minilm-l6-v2-embed-q8_0.gguf",
    lane: "embed",
    // Exact-file form (not the short `hf:...:Q8_0` tag) — this repo's GGUF
    // filename ("all-MiniLM-L6-v2-Q8_0.gguf", hyphen before the quant suffix)
    // is non-standard, so resolving it through HF's short-tag manifest API
    // isn't relied on; this URI deterministically resolves to
    // huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q8_0.gguf.
    uri: "hf:second-state/All-MiniLM-L6-v2-Embedding-GGUF/all-MiniLM-L6-v2-Q8_0.gguf",
    // Computed from a real downloaded file in this session (sha256sum of the
    // 25,008,064-byte artifact) — re-verify via `pnpm run models:hash` before
    // trusting long-term / pinning a release. leliuga/all-MiniLM-L6-v2-GGUF's
    // all-MiniLM-L6-v2.Q8_0.gguf is a byte-identical fallback if this repo
    // ever disappears (same size, same sha256).
    sha256: "263215c3cadd6e16740741a7624ab4cbb6c8e777688bd5331ecfbf5681c2f8ed",
    bytes: 25_008_064,
    label: "all-MiniLM-L6-v2 Embeddings (GGUF Q8_0)",
    family: "MiniLM",
    sizeLabel: "22.7M params",
    optional: false,
    // Encoder, not a chat model: no chat capabilities at all.
    capabilities: { tools: false, thinking: false, vision: false },
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

/** Lane-aware destination dir: <userData>/models/llm or <userData>/models/embed. */
function dirFor(entry: ModelDownloadEntry): string {
  return path.join(app.getPath("userData"), "models", entry.lane === "embed" ? "embed" : "llm");
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

function presenceFor(entry: ModelDownloadEntry): ModelPresence {
  const p = path.join(dirFor(entry), entry.file);
  const present = existsSync(p);
  return {
    key: entry.key,
    file: entry.file,
    label: entry.label,
    optional: entry.optional,
    present,
    sizeBytes: present ? statSync(p).size : 0,
    path: p,
  };
}

/** Streaming sha256 of a file on disk (never loads the whole GGUF into memory). */
async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/**
 * Optional HF access token for gated models. node-llama-cpp already reads
 * HF_TOKEN / ~/.cache/huggingface/token automatically, but forwarding an explicit
 * token keeps behaviour deterministic when the env is set in-process.
 */
function hfTokens(): { huggingFace: string } | undefined {
  const token = process.env.HF_TOKEN?.trim() || process.env.HUGGING_FACE_TOKEN?.trim();
  return token ? { huggingFace: token } : undefined;
}

/**
 * One real download per model key, keyed for the lifetime of the download
 * (not the caller). The renderer's model-required dialog closes without
 * aborting anything (see useModelStatus's unmount effect — it only tears
 * down its own progress listener), so if the user reopens the dialog and
 * hits Download again while the first attempt is still running, that second
 * call must attach to THIS entry instead of starting a competing
 * `ModelDownloader` against the same destination file.
 */
interface InFlightDownload {
  promise: Promise<ModelPresence>;
  listeners: Set<(p: ModelDownloadProgress) => void>;
  lastProgress: ModelDownloadProgress;
  /** Cancels the real underlying download, however many callers are attached. */
  cancel: () => void;
}

const inFlightDownloads = new Map<string, InFlightDownload>();

// ─── Public API ───────────────────────────────────────────────────────────────

/** Presence + on-disk size for every GGUF model the app knows about. */
export function listModelPresence(): ModelPresence[] {
  return MODEL_DOWNLOADS.map(presenceFor);
}

export function isModelPresent(key: string): boolean {
  const entry = entryFor(key);
  return existsSync(path.join(dirFor(entry), entry.file));
}

/**
 * Stream a GGUF model to `<userData>/models/<lane>/<file>` using node-llama-cpp's
 * downloader, then (when a sha256 is pinned) verify integrity before returning.
 * Idempotent: returns early if already present and size-consistent, and the
 * downloader itself re-skips on an exact remote-size match. Reports progress via
 * `input.onProgress`.
 *
 * If `key` already has a download running (from an earlier call whose caller
 * went away — e.g. the model-required dialog was closed and reopened), this
 * attaches to that SAME in-flight download instead of starting a second one:
 * the caller's `onProgress` is synced to the current byte count immediately
 * and then streamed the rest of the way, so the UI picks up mid-progress
 * rather than restarting from 0%.
 */
export async function downloadModel(input: DownloadModelInput): Promise<ModelPresence> {
  const entry = entryFor(input.key);

  const existing = inFlightDownloads.get(entry.key);
  if (existing) return attachToInFlightDownload(existing, input);

  const dir = dirFor(entry);
  const dest = path.join(dir, entry.file);

  if (input.signal?.aborted) throw abortError();

  // Fast idempotent skip: present and (when known) the right size. The downloader
  // would also skip via `skipExisting`, but short-circuiting here avoids spinning
  // up ipull just to emit a single "done" event for an already-installed model.
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
      return presenceFor(entry);
    }
  }

  mkdirSync(dir, { recursive: true });

  const listeners = new Set<(p: ModelDownloadProgress) => void>();
  if (input.onProgress) listeners.add(input.onProgress);

  let lastProgress: ModelDownloadProgress = {
    key: entry.key,
    receivedBytes: 0,
    totalBytes: entry.bytes,
    percent: entry.bytes ? 0 : -1,
    done: false,
  };

  // Throttle progress to ~10/s so we don't flood IPC (the renderer only needs a
  // smooth bar, not every chunk). node-llama-cpp reports absolute byte counts.
  let lastEmit = 0;
  const emitProgress = (downloadedSize: number, totalSize: number, done: boolean) => {
    const now = Date.now();
    if (!done && now - lastEmit < 100) return;
    lastEmit = now;
    lastProgress = {
      key: entry.key,
      receivedBytes: downloadedSize,
      totalBytes: totalSize,
      percent: totalSize > 0 ? Math.min(100, Math.floor((downloadedSize / totalSize) * 100)) : -1,
      done,
    };
    for (const listener of listeners) listener(lastProgress);
  };

  const { createModelDownloader } = await import("node-llama-cpp");

  const downloader = await createModelDownloader({
    modelUri: entry.uri,
    dirPath: dir,
    // Pin the on-disk name so it matches what llama-service.ts loads by exact
    // filename, and so a manifest entry can only write to this one path.
    fileName: entry.file,
    // Present + exact remote size → skip re-download (default, made explicit).
    skipExisting: true,
    // Remove the partial temp file if we cancel/abort (default, made explicit).
    deleteTempFileOnCancel: true,
    // We surface our own progress bar; keep node's CLI renderer quiet.
    showCliProgress: false,
    tokens: hfTokens(),
    onProgress: ({ totalSize, downloadedSize }) => {
      emitProgress(downloadedSize, totalSize || entry.bytes || 0, false);
    },
  });

  // Shared across every caller attached to this key — any one of them
  // cancelling (e.g. hitting Cancel from a re-opened dialog) stops the real
  // download for everyone, since there's only ever one download per key.
  const ownController = new AbortController();
  const cancel = () => {
    void downloader.cancel({ deleteTempFile: true }).catch(() => {
      // best-effort — the download() rejection is what we actually act on
    });
    ownController.abort();
  };
  if (input.signal) {
    if (input.signal.aborted) cancel();
    else input.signal.addEventListener("abort", cancel, { once: true });
  }

  const promise = (async (): Promise<ModelPresence> => {
    try {
      await downloader.download({ signal: ownController.signal });
    } catch (err) {
      if (ownController.signal.aborted) throw abortError();
      throw err;
    }

    // ── Integrity gate (ENFORCING) — the downloader already verified the
    // remote size; when an entry pins a non-empty sha256 we additionally
    // re-hash the finished file and DELETE + throw on mismatch (the weights
    // never stay on disk). Empty sha256 → integrity is UNVERIFIED; we log
    // loudly but keep the file, so a verified release can fill the manifest.
    if (entry.sha256) {
      const sha = await sha256OfFile(dest);
      if (sha !== entry.sha256) {
        await rm(dest, { force: true });
        throw new Error(
          `${entry.key}: sha256 mismatch (got ${sha}, expected ${entry.sha256}) — deleted, refusing to install`,
        );
      }
    } else {
      console.warn(
        `[model-download] ${entry.key}: integrity UNVERIFIED — no sha256 pinned in the registry. ` +
          `node-llama-cpp verified the download against the remote content-length, but the weights ` +
          `were NOT authenticated by hash. Run \`pnpm run models:hash\` and paste the sha256 into ` +
          `MODEL_DOWNLOADS before a verified release.`,
      );
    }

    const size = existsSync(dest) ? statSync(dest).size : 0;
    emitProgress(size, size, true);
    return presenceFor(entry);
  })();

  inFlightDownloads.set(entry.key, {
    promise,
    listeners,
    // Live view: emitProgress REASSIGNS the local `lastProgress` binding, so a
    // plain property here would freeze the initial 0% snapshot and late
    // attachers would be synced to 0% instead of the current byte count.
    get lastProgress() {
      return lastProgress;
    },
    cancel,
  });

  try {
    return await promise;
  } finally {
    inFlightDownloads.delete(entry.key);
  }
}

/** Attach a caller to a download already running for this key (see downloadModel). */
async function attachToInFlightDownload(
  existing: InFlightDownload,
  input: DownloadModelInput,
): Promise<ModelPresence> {
  const listener = input.onProgress;
  if (listener) {
    listener(existing.lastProgress);
    existing.listeners.add(listener);
  }
  const onAbort = () => existing.cancel();
  if (input.signal) {
    if (input.signal.aborted) onAbort();
    else input.signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await existing.promise;
  } finally {
    if (listener) existing.listeners.delete(listener);
    if (input.signal) input.signal.removeEventListener("abort", onAbort);
  }
}

/** Delete a downloaded GGUF (free disk / re-download). */
export async function deleteModel(key: string): Promise<{ deleted: boolean }> {
  const entry = entryFor(key);
  const dest = path.join(dirFor(entry), entry.file);
  if (!existsSync(dest)) return { deleted: false };
  await rm(dest, { force: true });
  return { deleted: true };
}
