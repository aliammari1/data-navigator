/**
 * DuckDB utilityProcess broker — Electron MAIN process side (ISOLATION SCAFFOLD).
 *
 * Routes the renderer-reachable DuckDB *read* channels to an isolated
 * `utilityProcess` (electron/workers/duckdb.utility.ts) instead of running them
 * inside the secret-holding main process. Communication is an id-correlated
 * request/response protocol over the utility's `parentPort` MessagePort
 * (electron/workers/duckdb-utility-protocol.ts).
 *
 * SAFETY / ADDITIVE CONTRACT:
 * - OFF BY DEFAULT. Enabled only when `process.env.DN_DUCKDB_UTILITY === "1"`.
 *   When disabled, `isEnabled()` returns false and callers fall back to the
 *   existing in-main duckdb-service path — behavior is byte-for-byte unchanged.
 * - The broker passes ONLY non-secret directory locations to the child; the
 *   auth secret / auth DB never cross this boundary.
 * - Lazy: the utility process is forked on first use, never at import time.
 * - Resilient: a child crash rejects in-flight requests and resets state so the
 *   next call transparently re-forks. Callers SHOULD fall back to the in-main
 *   path on any broker error.
 */

import os from "node:os";
import path from "node:path";
import { app, utilityProcess, type UtilityProcess } from "electron";
import type { UtilityRequest, UtilityResponse } from "./duckdb-utility-protocol";
import { isErrorResponse } from "./duckdb-utility-protocol";

// ─── Tunables ─────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 120_000;
const FORK_SPAWN_TIMEOUT_MS = 15_000;
const UTILITY_MEMORY_LIMIT = "2GB";

// ─── Path helpers (mirror duckdb-service's managed-root layout) ───────────────

function getDuckDBRootDir(): string {
  return path.join(app.getPath("userData"), "data-navigator");
}

function getDatasetsDirPath(): string {
  return path.join(getDuckDBRootDir(), "datasets");
}

function getTmpSpillDir(): string {
  return path.join(getDuckDBRootDir(), "tmp");
}

/**
 * Resolve the compiled utility entry. tsup emits this module's sibling
 * `duckdb.utility.ts` to `build/workers/duckdb.utility.js`; this file compiles to
 * `build/workers/duckdb-utility-broker.js`, so the entry is a sibling.
 */
function getUtilityModulePath(): string {
  return path.join(__dirname, "workers", "duckdb.utility.js");
}

// ─── Flag ─────────────────────────────────────────────────────────────────────

/**
 * Whether the utilityProcess isolation path is enabled. OFF by default; opt in
 * with `DN_DUCKDB_UTILITY=1`. Read live each call so it can be toggled before
 * first use without caching a stale value.
 */
export function isEnabled(): boolean {
  return process.env.DN_DUCKDB_UTILITY === "1";
}

// ─── Broker state ─────────────────────────────────────────────────────────────

interface Pending {
  resolve: (value: UtilityResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let child: UtilityProcess | null = null;
let readyPromise: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function rejectAllPending(error: Error): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
}

function teardown(error: Error): void {
  rejectAllPending(error);
  child = null;
  readyPromise = null;
}

function onChildMessage(message: unknown): void {
  if (typeof message !== "object" || message === null) return;
  const response = message as UtilityResponse;
  if (typeof response.id !== "number") return;

  const entry = pending.get(response.id);
  if (!entry) return;

  pending.delete(response.id);
  clearTimeout(entry.timer);
  entry.resolve(response);
}

/**
 * Fork the utility process and wait for its `spawn` event. Idempotent: a second
 * call while spawning awaits the same promise.
 */
function ensureSpawned(): Promise<void> {
  if (child && readyPromise) return readyPromise;

  readyPromise = new Promise<void>((resolve, reject) => {
    let settled = false;

    const forked = utilityProcess.fork(getUtilityModulePath(), [], {
      serviceName: "data-navigator-duckdb",
      // Keep the child lean; it must never inherit a debug/inspect posture.
      stdio: "inherit",
    });

    child = forked;

    const spawnTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      teardown(new Error("DuckDB utility process failed to spawn in time."));
      reject(new Error("DuckDB utility process failed to spawn in time."));
    }, FORK_SPAWN_TIMEOUT_MS);

    forked.on("spawn", () => {
      if (settled) return;
      settled = true;
      clearTimeout(spawnTimer);
      resolve();
    });

    forked.on("message", onChildMessage);

    forked.on("exit", (code) => {
      const err = new Error(`DuckDB utility process exited (code ${code}).`);
      if (!settled) {
        settled = true;
        clearTimeout(spawnTimer);
        reject(err);
      }
      teardown(err);
    });

    forked.on("error", (type, location) => {
      const err = new Error(`DuckDB utility process error (${type}) at ${location}.`);
      if (!settled) {
        settled = true;
        clearTimeout(spawnTimer);
        reject(err);
      }
      teardown(err);
    });
  });

  return readyPromise;
}

/**
 * `Omit<Union, K>` is NOT distributive: it collapses a discriminated union to
 * only the keys common to every member, dropping variant-specific fields like
 * `InitRequest.userDataDir` (TS issues #54525 / #49659). Distributing the Omit
 * over each union member preserves each request variant's own properties.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Send a request and await its correlated response (or timeout/crash). */
function request(message: DistributiveOmit<UtilityRequest, "id">): Promise<UtilityResponse> {
  const id = nextId++;
  const full = { ...message, id } as UtilityRequest;

  return new Promise<UtilityResponse>((resolve, reject) => {
    const active = child;
    if (!active) {
      reject(new Error("DuckDB utility process not available."));
      return;
    }

    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DuckDB utility request "${full.kind}" timed out.`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    active.postMessage(full);
  });
}

// ─── Init handshake ───────────────────────────────────────────────────────────

let initialized = false;

async function ensureInitialized(): Promise<void> {
  await ensureSpawned();
  if (initialized) return;

  const cores = os.availableParallelism?.() ?? 4;
  const threads = Math.max(1, Math.min(cores - 1, 6));

  const response = await request({
    kind: "init",
    userDataDir: app.getPath("userData"),
    datasetsDir: getDatasetsDirPath(),
    tmpSpillDir: getTmpSpillDir(),
    threads,
    memoryLimit: UTILITY_MEMORY_LIMIT,
  });

  if (isErrorResponse(response)) {
    throw new Error(`DuckDB utility init failed: ${response.message}`);
  }
  initialized = true;
}

// ─── Public read API (mirrors the subset of duckdb-service routed here) ───────

/**
 * Run a read-only query in the isolated utility process and return JSON rows.
 * Throws on any transport/engine error so the caller can fall back to the
 * in-main path.
 */
export async function runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]> {
  await ensureInitialized();
  const response = await request({ kind: "runReadOnlyQuery", sql });

  if (isErrorResponse(response)) {
    throw new Error(response.message);
  }
  if (response.kind !== "runReadOnlyQuery") {
    throw new Error(`Unexpected response kind: ${response.kind}`);
  }
  return response.rows;
}

/** Liveness probe (diagnostics / tests). */
export async function ping(): Promise<boolean> {
  await ensureSpawned();
  const response = await request({ kind: "ping" });
  return !isErrorResponse(response) && response.kind === "ping" && response.pong === true;
}

/** Terminate the utility process (lifecycle cleanup). Safe to call when off. */
export function dispose(): void {
  const active = child;
  initialized = false;
  if (active) {
    try {
      active.kill();
    } catch {
      // already dead
    }
  }
  teardown(new Error("DuckDB utility broker disposed."));
}
