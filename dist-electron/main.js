var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};

// electron/main.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_promises2 = __toESM(require("node:fs/promises"));
var import_node_http = __toESM(require("node:http"));
var import_node_path2 = __toESM(require("node:path"));
var import_electron2 = require("electron");
var import_electron_squirrel_startup = __toESM(require("electron-squirrel-startup"));

// electron/duckdb-service.ts
var import_promises = __toESM(require("node:fs/promises"));
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var import_electron = require("electron");
var import_node_api = require("@duckdb/node-api");
var instance = null;
var writeConn = null;
var readConns = [];
var initPromise = null;
var writeQueue = Promise.resolve();
function enqueueWrite(operation) {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.catch(() => {
    return;
  });
  return run;
}
var readConnIndex = 0;
var READ_CONN_COUNT = 3;
function getReadConnection() {
  if (readConns.length === 0) {
    if (!writeConn)
      throw new Error("DuckDB connection not initialized");
    return writeConn;
  }
  const conn = readConns[readConnIndex % readConns.length];
  readConnIndex++;
  return conn;
}
function isReadOnlyQuery(sql) {
  const trimmed = sql.trim().toUpperCase();
  return trimmed.startsWith("SELECT") || trimmed.startsWith("SHOW") || trimmed.startsWith("DESCRIBE") || trimmed.startsWith("EXPLAIN") || trimmed.startsWith("PRAGMA");
}
function quoteSqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function quoteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}
var tempDir = null;
async function getTempDir() {
  if (tempDir)
    return tempDir;
  const base = import_electron.app.isPackaged ? import_node_path.default.join(import_electron.app.getPath("userData"), "data-navigator", "tmp") : import_node_path.default.join(import_node_os.default.tmpdir(), "data-navigator-dev");
  await import_promises.default.mkdir(base, { recursive: true });
  tempDir = base;
  return base;
}
async function writeTempFile(name, data) {
  const dir = await getTempDir();
  const filePath = import_node_path.default.join(dir, name);
  await import_promises.default.writeFile(filePath, Buffer.from(data));
  return filePath;
}
async function cleanTempDir() {
  if (!tempDir)
    return;
  try {
    await import_promises.default.rm(tempDir, { recursive: true, force: true });
  } catch {}
  tempDir = null;
}
async function ensureInit() {
  if (instance && writeConn)
    return;
  if (initPromise)
    return initPromise;
  initPromise = (async () => {
    try {
      const dbPath = import_node_path.default.join(import_electron.app.getPath("userData"), "data-navigator", "duckdb.db");
      await import_promises.default.mkdir(import_node_path.default.dirname(dbPath), { recursive: true });
      const threads = String(Math.max(1, import_node_os.default.availableParallelism?.() ?? 4));
      instance = await import_node_api.DuckDBInstance.create(dbPath, { threads });
      writeConn = await instance.connect();
      readConns = [];
      for (let i = 0;i < READ_CONN_COUNT; i++) {
        readConns.push(await instance.connect());
      }
      const pragmas = [
        `PRAGMA threads = ${threads}`,
        `PRAGMA enable_progress_bar = false`,
        `PRAGMA memory_limit = '2GB'`
      ];
      for (const pragma of pragmas) {
        await writeConn.run(pragma);
        for (const rc of readConns)
          await rc.run(pragma);
      }
    } catch (error) {
      instance = null;
      writeConn = null;
      readConns = [];
      initPromise = null;
      throw error;
    }
  })();
  return initPromise;
}
async function convertResult(conn, sql) {
  const result = await conn.run(sql);
  return await result.getRowObjectsJS();
}
var MAX_PREPARED_STATEMENTS = 50;
var preparedStatements = new Map;
function generateStmtId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
async function prepareInternal(sql) {
  await ensureInit();
  if (!writeConn)
    throw new Error("DuckDB connection not initialized");
  if (preparedStatements.size >= MAX_PREPARED_STATEMENTS) {
    const firstKey = preparedStatements.keys().next().value;
    preparedStatements.delete(firstKey);
  }
  const stmt = await writeConn.prepare(sql);
  const stmtId = generateStmtId();
  preparedStatements.set(stmtId, { statement: stmt });
  return stmtId;
}
async function runPreparedInternal(stmtId, params) {
  await ensureInit();
  const handle = preparedStatements.get(stmtId);
  if (!handle)
    throw new Error(`Prepared statement ${stmtId} not found`);
  const stmt = handle.statement;
  for (let i = 0;i < params.length; i++) {
    const param = params[i];
    const idx = i + 1;
    if (param === null || param === undefined) {
      stmt.bindNull(idx);
    } else if (typeof param === "string") {
      stmt.bindVarchar(idx, param);
    } else if (typeof param === "number") {
      if (Number.isInteger(param)) {
        stmt.bindInteger(idx, param);
      } else {
        stmt.bindDouble(idx, param);
      }
    } else if (typeof param === "boolean") {
      stmt.bindBoolean(idx, param);
    } else {
      stmt.bindVarchar(idx, String(param));
    }
  }
  const result = await stmt.run();
  return await result.getRowObjectsJS();
}
async function disposePreparedInternal(stmtId) {
  const handle = preparedStatements.get(stmtId);
  if (!handle)
    return;
  preparedStatements.delete(stmtId);
  handle.statement.destroySync();
}
var MAX_METRICS = 200;
var queryMetrics = [];
function truncateSql(sql, maxLen = 200) {
  return sql.length > maxLen ? `${sql.slice(0, maxLen)}...` : sql;
}
function pushMetric(metric) {
  queryMetrics.unshift(metric);
  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.pop();
  }
}
async function init() {
  return ensureInit();
}
async function runQuery(sql) {
  const start = performance.now();
  await ensureInit();
  const conn = isReadOnlyQuery(sql) ? getReadConnection() : writeConn;
  if (!conn)
    throw new Error("DuckDB connection not initialized");
  const rows = await convertResult(conn, sql);
  const duration = performance.now() - start;
  pushMetric({
    sql: truncateSql(sql),
    durationMs: Math.round(duration),
    timestamp: Date.now(),
    rowCount: rows.length
  });
  return rows;
}
async function runBatch(sqls) {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn)
      throw new Error("DuckDB connection not initialized");
    const results = [];
    for (const sql of sqls) {
      const rows = await convertResult(writeConn, sql);
      results.push(rows);
    }
    return results;
  });
}
async function prepare(sql) {
  return enqueueWrite(() => prepareInternal(sql));
}
async function execute(stmtId, params) {
  return enqueueWrite(() => runPreparedInternal(stmtId, params));
}
async function disposePrepared(stmtId) {
  return enqueueWrite(() => disposePreparedInternal(stmtId));
}
async function listTables() {
  const rows = await runQuery("SHOW TABLES");
  return rows.map((row) => String(row.name));
}
async function getTableInfo(tableName) {
  const quoted = quoteIdentifier(tableName);
  const [columns, rowCountResult] = await Promise.all([
    runQuery(`DESCRIBE ${quoted}`),
    runQuery(`SELECT COUNT(*) AS row_count FROM ${quoted}`)
  ]);
  return {
    columns: columns.map((row) => ({
      name: String(row.column_name ?? row.name),
      type: String(row.column_type ?? row.type),
      nullable: row.null !== "NO" && row.null !== false
    })),
    rowCount: Number(rowCountResult[0]?.row_count ?? 0)
  };
}
async function getColumnStats(tableName, columnName) {
  const t = quoteIdentifier(tableName);
  const c = quoteIdentifier(columnName);
  const [basic, distinct, histogram] = await Promise.all([
    runQuery(`
      SELECT
        MIN(${c}) AS min,
        MAX(${c}) AS max,
        AVG(${c}) AS avg,
        COUNT(*) - COUNT(${c}) AS null_count
      FROM ${t}
    `),
    runQuery(`
      SELECT COUNT(DISTINCT ${c}) AS distinct_count FROM ${t}
    `),
    runQuery(`
      SELECT
        ${c} AS bucket,
        COUNT(*) AS count
      FROM ${t}
      WHERE ${c} IS NOT NULL
      GROUP BY ${c}
      ORDER BY count DESC
      LIMIT 20
    `)
  ]);
  const stats = basic[0] ?? {};
  return {
    min: stats.min ?? null,
    max: stats.max ?? null,
    avg: stats.avg ?? null,
    nullCount: Number(stats.null_count ?? 0),
    distinctCount: Number(distinct[0]?.distinct_count ?? 0),
    histogram: histogram.map((row) => ({
      bucket: String(row.bucket),
      count: Number(row.count)
    }))
  };
}
async function loadCSVPath(tableName, filePath, delimiter = ",", append = false, hasHeader = true) {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn)
      throw new Error("DuckDB connection not initialized");
    const t = quoteIdentifier(tableName);
    const headerStr = hasHeader ? "header = true" : "header = false";
    const delimStr = `delim = ${quoteSqlString(delimiter)}`;
    const pathStr = quoteSqlString(filePath);
    if (append) {
      await writeConn.run(`INSERT INTO ${t} SELECT * FROM read_csv_auto(${pathStr}, ${headerStr}, ${delimStr})`);
    } else {
      await writeConn.run(`CREATE OR REPLACE TABLE ${t} AS SELECT * FROM read_csv_auto(${pathStr}, ${headerStr}, ${delimStr})`);
    }
  });
}
async function loadJSONPath(tableName, filePath) {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn)
      throw new Error("DuckDB connection not initialized");
    const t = quoteIdentifier(tableName);
    const pathStr = quoteSqlString(filePath);
    await writeConn.run(`CREATE OR REPLACE TABLE ${t} AS SELECT * FROM read_json_auto(${pathStr})`);
  });
}
async function loadCSVBuffer(tableName, buffer, delimiter = ",", append = false, hasHeader = true) {
  const tempPath = await writeTempFile(`csv_${Date.now()}_${Math.random().toString(36).slice(2)}.csv`, buffer);
  try {
    await loadCSVPath(tableName, tempPath, delimiter, append, hasHeader);
  } finally {
    try {
      await import_promises.default.unlink(tempPath);
    } catch {}
  }
}
async function loadJSONBuffer(tableName, buffer) {
  const tempPath = await writeTempFile(`json_${Date.now()}_${Math.random().toString(36).slice(2)}.json`, buffer);
  try {
    await loadJSONPath(tableName, tempPath);
  } finally {
    try {
      await import_promises.default.unlink(tempPath);
    } catch {}
  }
}
async function exportTableToParquet(tableName, filePath) {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn)
      throw new Error("DuckDB connection not initialized");
    const t = quoteIdentifier(tableName);
    const p = quoteSqlString(filePath);
    await writeConn.run(`COPY ${t} TO ${p} (FORMAT PARQUET)`);
  });
}
async function loadTableFromParquet(tableName, filePath) {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn)
      throw new Error("DuckDB connection not initialized");
    const t = quoteIdentifier(tableName);
    const p = quoteSqlString(filePath);
    await writeConn.run(`CREATE OR REPLACE TABLE ${t} AS SELECT * FROM read_parquet(${p})`);
  });
}
async function clearTable(tableName) {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn)
      throw new Error("DuckDB connection not initialized");
    const t = quoteIdentifier(tableName);
    await writeConn.run(`DROP TABLE IF EXISTS ${t}`);
  });
}
function getStatus() {
  return {
    opfsPersistenceActive: false,
    dbPath: instance ? "active" : null
  };
}
function getQueryMetrics() {
  return queryMetrics.slice();
}
function clearQueryMetrics() {
  queryMetrics.length = 0;
}
async function close() {
  for (const [id, handle] of preparedStatements) {
    handle.statement.destroySync();
    preparedStatements.delete(id);
  }
  readConns = [];
  writeConn = null;
  instance = null;
  initPromise = null;
  await cleanTempDir();
}
import_electron.app.on("quit", () => {
  close().catch((err) => {
    console.error("[duckdb-service] cleanup error:", err);
  });
});

// electron/main.ts
if (import_electron_squirrel_startup.default) {
  import_electron2.app.quit();
}
var isDev = !import_electron2.app.isPackaged;
async function installReactDevTools() {
  if (!isDev)
    return;
  try {
    const { installExtension, REACT_DEVELOPER_TOOLS } = await import("@tomjs/electron-devtools-installer");
    const extension = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`Installed ${extension.name}`);
  } catch (err) {
    console.warn("React DevTools install failed:", err);
  }
}
import_electron2.app.commandLine.appendSwitch("enable-unsafe-webgpu");
if (process.platform === "linux") {
  import_electron2.app.commandLine.appendSwitch("enable-features", "Vulkan");
}
import_electron2.app.commandLine.appendSwitch("ignore-gpu-blocklist");
function getAppRoot() {
  return import_electron2.app.getAppPath();
}
function getPreloadPath() {
  const candidates = [
    import_node_path2.default.join(getAppRoot(), "dist-electron", "preload.js"),
    import_node_path2.default.join(process.cwd(), "dist-electron", "preload.js"),
    import_node_path2.default.join(getAppRoot(), "preload.js"),
    import_node_path2.default.join(getAppRoot(), "out", "electron", "preload.js"),
    import_node_path2.default.join(process.cwd(), "out", "electron", "preload.js")
  ];
  const preloadPath = candidates.find((candidate) => import_node_fs.existsSync(candidate));
  if (preloadPath)
    return preloadPath;
  console.warn("[electron] preload script not found. Tried:", candidates);
  return candidates[0];
}
var DATA_DIR = import_node_path2.default.join(import_electron2.app.getPath("userData"), "data-navigator");
async function ensureDataDir() {
  await import_promises2.default.mkdir(DATA_DIR, { recursive: true });
}
import_electron2.ipcMain.handle("fs:getDataDir", () => DATA_DIR);
import_electron2.ipcMain.handle("fs:readFile", async (_event, filePath) => {
  const data = await import_promises2.default.readFile(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
});
import_electron2.ipcMain.handle("fs:writeFile", async (_event, filePath, data) => {
  await import_promises2.default.mkdir(import_node_path2.default.dirname(filePath), { recursive: true });
  await import_promises2.default.writeFile(filePath, Buffer.from(data));
});
import_electron2.ipcMain.handle("fs:deleteFile", async (_event, filePath) => {
  try {
    await import_promises2.default.unlink(filePath);
    return true;
  } catch {
    return false;
  }
});
import_electron2.ipcMain.handle("fs:listFiles", async (_event, dir) => {
  const target = dir ?? DATA_DIR;
  try {
    return await import_promises2.default.readdir(target);
  } catch {
    return [];
  }
});
async function walkFilesRecursive(rootDir) {
  const out = [];
  const entries = await import_promises2.default.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = import_node_path2.default.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFilesRecursive(full));
      continue;
    }
    if (entry.isFile())
      out.push(full);
  }
  return out;
}
import_electron2.ipcMain.handle("fs:listFilesRecursive", async (_event, dir) => {
  try {
    return await walkFilesRecursive(dir);
  } catch {
    return [];
  }
});
import_electron2.ipcMain.handle("fs:fileExists", (_event, filePath) => import_node_fs.existsSync(filePath));
import_electron2.ipcMain.handle("fs:openDialog", async (_event, options) => {
  const result = await import_electron2.dialog.showOpenDialog(options);
  return { canceled: result.canceled, filePaths: result.filePaths };
});
import_electron2.ipcMain.handle("fs:saveDialog", async (_event, options) => {
  const result = await import_electron2.dialog.showSaveDialog(options);
  return { canceled: result.canceled, filePath: result.filePath };
});
import_electron2.ipcMain.handle("duckdb:init", async () => {
  await init();
  return { success: true };
});
import_electron2.ipcMain.handle("duckdb:runQuery", async (_event, sql) => {
  return runQuery(sql);
});
import_electron2.ipcMain.handle("duckdb:runBatch", async (_event, sqls) => {
  return runBatch(sqls);
});
import_electron2.ipcMain.handle("duckdb:prepare", async (_event, sql) => {
  return prepare(sql);
});
import_electron2.ipcMain.handle("duckdb:execute", async (_event, stmtId, params) => {
  return execute(stmtId, params);
});
import_electron2.ipcMain.handle("duckdb:disposePrepared", async (_event, stmtId) => {
  return disposePrepared(stmtId);
});
import_electron2.ipcMain.handle("duckdb:listTables", async () => {
  return listTables();
});
import_electron2.ipcMain.handle("duckdb:getTableInfo", async (_event, tableName) => {
  return getTableInfo(tableName);
});
import_electron2.ipcMain.handle("duckdb:getColumnStats", async (_event, tableName, columnName) => {
  return getColumnStats(tableName, columnName);
});
import_electron2.ipcMain.handle("duckdb:loadCSVPath", async (_event, tableName, filePath, delimiter, append, hasHeader) => {
  return loadCSVPath(tableName, filePath, delimiter, append, hasHeader);
});
import_electron2.ipcMain.handle("duckdb:loadJSONPath", async (_event, tableName, filePath) => {
  return loadJSONPath(tableName, filePath);
});
import_electron2.ipcMain.handle("duckdb:loadCSVBuffer", async (_event, tableName, buffer, delimiter, append, hasHeader) => {
  return loadCSVBuffer(tableName, buffer, delimiter, append, hasHeader);
});
import_electron2.ipcMain.handle("duckdb:loadJSONBuffer", async (_event, tableName, buffer) => {
  return loadJSONBuffer(tableName, buffer);
});
import_electron2.ipcMain.handle("duckdb:exportTableToParquet", async (_event, tableName, filePath) => {
  return exportTableToParquet(tableName, filePath);
});
import_electron2.ipcMain.handle("duckdb:loadTableFromParquet", async (_event, tableName, filePath) => {
  return loadTableFromParquet(tableName, filePath);
});
import_electron2.ipcMain.handle("duckdb:clearTable", async (_event, tableName) => {
  return clearTable(tableName);
});
import_electron2.ipcMain.handle("duckdb:getStatus", async () => {
  return getStatus();
});
import_electron2.ipcMain.handle("duckdb:getQueryMetrics", async () => {
  return getQueryMetrics();
});
import_electron2.ipcMain.handle("duckdb:clearQueryMetrics", async () => {
  return clearQueryMetrics();
});
var mainWindow = null;
async function createWindow() {
  await ensureDataDir();
  mainWindow = new import_electron2.BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ["--enable-features=SharedArrayBuffer"]
    }
  });
  if (isDev) {
    await installReactDevTools();
    await mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadURL("http://localhost:3001");
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
var nextServer = null;
function startNextServer() {
  const serverScript = import_node_path2.default.join(getAppRoot(), ".next", "standalone", "server.js");
  if (!import_node_fs.existsSync(serverScript)) {
    console.warn("[electron] Next.js standalone server not found:", serverScript);
    return;
  }
  nextServer = import_node_child_process.spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: "3001",
      HOSTNAME: "127.0.0.1"
    },
    stdio: "inherit",
    windowsHide: true
  });
  nextServer.on("error", (err) => console.error("[electron] Next.js server error:", err));
}
function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const req = import_node_http.default.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on("error", retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`));
        return;
      }
      setTimeout(tryConnect, 300);
    };
    tryConnect();
  });
}
import_electron2.app.whenReady().then(async () => {
  if (!isDev) {
    startNextServer();
    try {
      await waitForServer("http://127.0.0.1:3001", 15000);
    } catch (err) {
      console.error("[electron] Server did not become ready:", err);
    }
  }
  await createWindow();
});
import_electron2.app.on("window-all-closed", () => {
  nextServer?.kill();
  if (process.platform !== "darwin")
    import_electron2.app.quit();
});
import_electron2.app.on("activate", async () => {
  if (mainWindow === null)
    await createWindow();
});
