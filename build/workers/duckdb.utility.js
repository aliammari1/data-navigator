'use strict';

var os = require('os');
var path = require('path');
var nodeApi = require('@duckdb/node-api');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var os__default = /*#__PURE__*/_interopDefault(os);
var path__default = /*#__PURE__*/_interopDefault(path);

// electron/workers/duckdb.utility.ts
var parentPort = process.parentPort;
var instance = null;
var readConn = null;
var datasetsDir = null;
function stripSqlWrapping(sql) {
  let s = sql.trim();
  const fence = s.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  if (fence == null ? void 0 : fence[1]) s = fence[1].trim();
  s = s.replace(/^(\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)+/i, "").trim();
  s = s.replace(/;+\s*$/, "").trim();
  return s;
}
function assertReadOnlySql(sql) {
  const trimmed = stripSqlWrapping(sql);
  const upper = trimmed.toUpperCase();
  const allowed = upper.startsWith("SELECT") || upper.startsWith("WITH") || upper.startsWith("SHOW") || upper.startsWith("DESCRIBE") || upper.startsWith("DESC ") || upper.startsWith("SUMMARIZE") || upper.startsWith("EXPLAIN") || upper.startsWith("FROM") || upper.startsWith("TABLE") || upper.startsWith("VALUES") || upper.startsWith("PIVOT") || upper.startsWith("UNPIVOT");
  if (!allowed) {
    const preview = trimmed.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`Only read-only DuckDB queries are allowed. Got: ${preview || "<empty>"}`);
  }
  const blocked = /\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|COPY|EXPORT|IMPORT|ATTACH|DETACH|INSTALL|LOAD|CALL|PRAGMA)\b/i;
  if (blocked.test(trimmed)) {
    throw new Error("Unsafe SQL statement blocked.");
  }
  const setConfig = /\bSET\s+(SESSION\s+|GLOBAL\s+|LOCAL\s+)?[A-Za-z_][\w]*\s*=/i;
  if (setConfig.test(trimmed)) {
    throw new Error("Unsafe SQL: SET configuration blocked.");
  }
  return trimmed;
}
function quoteSqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function quoteSqlPathList(paths) {
  return `[${paths.map((p) => quoteSqlString(p)).join(", ")}]`;
}
async function applyReadConnectionSandbox(conn, allowedDirs) {
  const resolvedDirs = allowedDirs.filter((dir) => typeof dir === "string" && dir.length > 0).map((dir) => path__default.default.resolve(dir));
  if (resolvedDirs.length === 0) return false;
  const settings = [
    "SET enable_external_access = true",
    `SET allowed_directories = ${quoteSqlPathList(resolvedDirs)}`,
    "SET lock_configuration = true"
  ];
  let allApplied = true;
  for (const setting of settings) {
    try {
      await conn.run(setting);
    } catch (error) {
      allApplied = false;
      console.warn(
        `[duckdb.utility] sandbox setting skipped (${setting.split("=")[0].trim()}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return allApplied;
}
async function initEngine(req) {
  var _a, _b, _c;
  if (instance && readConn) return true;
  const cores = (_c = (_b = (_a = os__default.default).availableParallelism) == null ? void 0 : _b.call(_a)) != null ? _c : 4;
  const threads = String(
    Math.max(1, Math.min(req.threads > 0 ? req.threads : cores - 1, 6))
  );
  instance = await nodeApi.DuckDBInstance.create(":memory:", { threads });
  readConn = await instance.connect();
  datasetsDir = path__default.default.resolve(req.datasetsDir);
  const pragmas = [
    `PRAGMA threads = ${threads}`,
    "PRAGMA enable_progress_bar = false",
    `PRAGMA memory_limit = ${quoteSqlString(req.memoryLimit || "2GB")}`,
    `PRAGMA temp_directory = ${quoteSqlString(req.tmpSpillDir)}`,
    "PRAGMA enable_object_cache"
  ];
  for (const pragma of pragmas) {
    try {
      await readConn.run(pragma);
    } catch (error) {
      console.warn(
        `[duckdb.utility] pragma skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const sandboxApplied = await applyReadConnectionSandbox(readConn, [
    datasetsDir,
    req.tmpSpillDir
  ]);
  return sandboxApplied;
}
async function runReadOnlyQuery(req) {
  if (!readConn) {
    throw new Error("DuckDB utility not initialized.");
  }
  const safeSql = assertReadOnlySql(req.sql);
  const result = await readConn.run(safeSql);
  return result.getRowObjectsJS();
}
function reply(message) {
  parentPort == null ? void 0 : parentPort.postMessage(message);
}
async function handle(request) {
  var _a, _b, _c;
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
        const unknownKind = (_a = request.kind) != null ? _a : "<none>";
        reply({
          id: (_b = request.id) != null ? _b : -1,
          kind: "error",
          ok: false,
          message: `Unknown request kind: ${unknownKind}`
        });
      }
    }
  } catch (error) {
    reply({
      id: (_c = request.id) != null ? _c : -1,
      kind: "error",
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
function isUtilityRequest(value) {
  return typeof value === "object" && value !== null && typeof value.id === "number" && typeof value.kind === "string";
}
if (parentPort) {
  parentPort.on("message", (event) => {
    const data = event.data;
    if (!isUtilityRequest(data)) return;
    void handle(data);
  });
} else {
  console.error("[duckdb.utility] no parentPort \u2014 must be launched via utilityProcess.fork");
}
