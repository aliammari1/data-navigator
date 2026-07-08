/**
 * DuckDB read-path host — Electron `utilityProcess` edition (ISOLATION SCAFFOLD).
 *
 * Blueprint: "native parsers (DuckDB/llama) should run in a utilityProcess
 * isolated from the secret-holding main." This module is the child process that
 * hosts a filesystem-sandboxed, READ-ONLY DuckDB engine. It NEVER sees the
 * better-auth secret, the auth SQLite DB, or any write connection — it only
 * receives the managed datasets/spill directories at init and answers
 * id-correlated read requests over `process.parentPort` (a `MessagePortMain`
 * pair set up by electron/workers/duckdb-utility-broker.ts).
 *
 * IMPORTANT — additive, off-by-default:
 * - The in-main DuckDB path in electron/duckdb-service.ts is UNCHANGED and stays
 *   the default. This process is only forked when the broker is enabled
 *   (env DN_DUCKDB_UTILITY=1). When off, none of this code runs.
 * - This is a working *scaffold*: it implements the `runReadOnlyQuery` (JSON)
 *   read path against the managed Parquet cache directory. It deliberately does
 *   not co-open the main `.duckdb` catalog file (that would fight the main
 *   process's read-write file lock). Instead it scans the managed Parquet files
 *   directly, which is exactly the sandbox the read connections already enforce.
 *
 * This file is bundled by tsup to build/workers/duckdb.utility.js and is loaded
 * via `utilityProcess.fork(...)` from the broker. It does NOT import `electron`
 * (unavailable in a utility process); `process.parentPort` is a runtime global.
 */

import os from "node:os";
import path from "node:path";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import type {
  InitRequest,
  RunReadOnlyQueryRequest,
  UtilityRequest,
  UtilityResponse,
} from "./duckdb-utility-protocol";

// ─── parentPort (Electron utilityProcess runtime global) ──────────────────────
// We do not import `electron` here — it is not available in a utilityProcess.
// `process.parentPort` is injected by Electron at runtime. Declare the minimal
// shape we use so this file type-checks without coupling to Electron's ambient
// augmentation of NodeJS.Process.

interface ParentPortMessageEvent {
  readonly data: unknown;
}

interface ParentPortLike {
  on(event: "message", listener: (event: ParentPortMessageEvent) => void): void;
  postMessage(message: unknown): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort;

// ─── Engine state ─────────────────────────────────────────────────────────────

let instance: DuckDBInstance | null = null;
let readConn: DuckDBConnection | null = null;
let datasetsDir: string | null = null;

// ─── SQL read-only guard (mirrors the in-main textual guard) ──────────────────
// Defense-in-depth: even though the broker only routes already-validated SQL,
// the utility re-validates locally so a future caller cannot bypass it.

function stripSqlWrapping(sql: string): string {
  let s = sql.trim();
  const fence = s.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) s = fence[1].trim();
  s = s.replace(/^(\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)+/i, "").trim();
  s = s.replace(/;+\s*$/, "").trim();
  return s;
}

function assertReadOnlySql(sql: string): string {
  const trimmed = stripSqlWrapping(sql);
  const upper = trimmed.toUpperCase();

  const allowed =
    upper.startsWith("SELECT") ||
    upper.startsWith("WITH") ||
    upper.startsWith("SHOW") ||
    upper.startsWith("DESCRIBE") ||
    upper.startsWith("DESC ") ||
    upper.startsWith("SUMMARIZE") ||
    upper.startsWith("EXPLAIN") ||
    upper.startsWith("FROM") ||
    upper.startsWith("TABLE") ||
    upper.startsWith("VALUES") ||
    upper.startsWith("PIVOT") ||
    upper.startsWith("UNPIVOT");

  if (!allowed) {
    const preview = trimmed.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`Only read-only DuckDB queries are allowed. Got: ${preview || "<empty>"}`);
  }

  const blocked =
    /\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|COPY|EXPORT|IMPORT|ATTACH|DETACH|INSTALL|LOAD|CALL|PRAGMA)\b/i;
  if (blocked.test(trimmed)) {
    throw new Error("Unsafe SQL statement blocked.");
  }

  // Note: unlike the in-main path, the utility scaffold scans managed Parquet
  // directly, so read_parquet over the sandboxed datasets dir is permitted. The
  // engine `allowed_directories` sandbox below narrows file access to that dir.
  const setConfig = /\bSET\s+(SESSION\s+|GLOBAL\s+|LOCAL\s+)?[A-Za-z_][\w]*\s*=/i;
  if (setConfig.test(trimmed)) {
    throw new Error("Unsafe SQL: SET configuration blocked.");
  }

  return trimmed;
}

// ─── Engine init ──────────────────────────────────────────────────────────────

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteSqlPathList(paths: readonly string[]): string {
  return `[${paths.map((p) => quoteSqlString(p)).join(", ")}]`;
}

async function applyReadConnectionSandbox(
  conn: DuckDBConnection,
  allowedDirs: readonly string[],
): Promise<boolean> {
  const resolvedDirs = allowedDirs
    .filter((dir): dir is string => typeof dir === "string" && dir.length > 0)
    .map((dir) => path.resolve(dir));

  if (resolvedDirs.length === 0) return false;

  // enable_external_access is startup-only (set in DuckDBInstance.create).
  // lock_configuration is GLOBAL but safe here: this utility process has a
  // single connection, so locking it after setting allowed_directories gives
  // the same per-lifetime guarantee the original code intended.
  const settings: readonly string[] = [
    `SET allowed_directories = ${quoteSqlPathList(resolvedDirs)}`,
    "SET lock_configuration = true",
  ];

  let allApplied = true;
  for (const setting of settings) {
    try {
      await conn.run(setting);
    } catch (error) {
      allApplied = false;
      // eslint-disable-next-line no-console
      console.warn(
        `[duckdb.utility] sandbox setting skipped (${setting.split("=")[0].trim()}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return allApplied;
}

async function initEngine(req: InitRequest): Promise<boolean> {
  if (instance && readConn) return true;

  const cores = os.availableParallelism?.() ?? 4;
  const threads = String(Math.max(1, Math.min(req.threads > 0 ? req.threads : cores - 1, 6)));

  // In-memory instance: the utility scaffold reads managed Parquet files
  // directly and never co-opens the main read-write `.duckdb` catalog file.
  // enable_external_access is a startup-only GLOBAL setting in DuckDB 1.x and
  // must be passed here, not via SET after the instance is running.
  instance = await DuckDBInstance.create(":memory:", { threads, enable_external_access: "true" });
  readConn = await instance.connect();

  datasetsDir = path.resolve(req.datasetsDir);

  const pragmas = [
    `PRAGMA threads = ${threads}`,
    "PRAGMA enable_progress_bar = false",
    `PRAGMA memory_limit = ${quoteSqlString(req.memoryLimit || "2GB")}`,
    `PRAGMA temp_directory = ${quoteSqlString(req.tmpSpillDir)}`,
    "PRAGMA enable_object_cache",
  ];
  for (const pragma of pragmas) {
    try {
      await readConn.run(pragma);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[duckdb.utility] pragma skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Narrow filesystem access to ONLY the managed datasets + spill dirs.
  const sandboxApplied = await applyReadConnectionSandbox(readConn, [datasetsDir, req.tmpSpillDir]);

  return sandboxApplied;
}

// ─── Read execution ───────────────────────────────────────────────────────────

async function runReadOnlyQuery(req: RunReadOnlyQueryRequest): Promise<Record<string, unknown>[]> {
  if (!readConn) {
    throw new Error("DuckDB utility not initialized.");
  }
  const safeSql = assertReadOnlySql(req.sql);
  const result = await readConn.run(safeSql);
  return result.getRowObjectsJS();
}

// ─── Message loop ─────────────────────────────────────────────────────────────

function reply(message: UtilityResponse): void {
  parentPort?.postMessage(message);
}

async function handle(request: UtilityRequest): Promise<void> {
  try {
    switch (request.kind) {
      case "init": {
        const sandboxApplied = await initEngine(request);
        reply({ id: request.id, kind: "init", ok: true, sandboxApplied });
        return;
      }
      case "ping": {
        reply({ id: request.id, kind: "ping", ok: true, pong: true });
        return;
      }
      case "runReadOnlyQuery": {
        const rows = await runReadOnlyQuery(request);
        reply({ id: request.id, kind: "runReadOnlyQuery", ok: true, rows });
        return;
      }
      default: {
        // Exhaustiveness guard: unknown kind.
        const unknownKind = (request as { kind?: string }).kind ?? "<none>";
        reply({
          id: (request as { id?: number }).id ?? -1,
          kind: "error",
          ok: false,
          message: `Unknown request kind: ${unknownKind}`,
        });
      }
    }
  } catch (error) {
    reply({
      id: (request as { id?: number }).id ?? -1,
      kind: "error",
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function isUtilityRequest(value: unknown): value is UtilityRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "number" &&
    typeof (value as { kind?: unknown }).kind === "string"
  );
}

if (parentPort) {
  parentPort.on("message", (event) => {
    const data = event.data;
    if (!isUtilityRequest(data)) return;
    void handle(data);
  });
} else {
  // Not running as an Electron utilityProcess (e.g. accidental direct run).
  // eslint-disable-next-line no-console
  console.error("[duckdb.utility] no parentPort — must be launched via utilityProcess.fork");
}
