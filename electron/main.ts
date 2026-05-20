import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "electron";
import squirrelStartup from "electron-squirrel-startup";
import * as duckdbService from "./duckdb-service";

if (squirrelStartup) {
  app.quit();
}

const isDev = !app.isPackaged;

async function installReactDevTools(): Promise<void> {
  if (!isDev) return;

  try {
    const { installExtension, REACT_DEVELOPER_TOOLS } = await import(
      "@tomjs/electron-devtools-installer"
    );
    const extension = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`Installed ${extension.name}`);
  } catch (err) {
    console.warn("React DevTools install failed:", err);
  }
}

// ─── GPU / WebGPU Configuration ─────────────────────────────────────────────
// Enable WebGPU for @huggingface/transformers in renderer + workers.
// Required for GPU-accelerated Whisper STT and LLM inference.
app.commandLine.appendSwitch("enable-unsafe-webgpu");

// Linux requires Vulkan backend for WebGPU adapter discovery.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "Vulkan");
}

// Optional: allow GPUs that Chromium normally blocklists (older/integrated).
app.commandLine.appendSwitch("ignore-gpu-blocklist");

function getAppRoot(): string {
  return app.getAppPath();
}

function getPreloadPath(): string {
  const candidates = [
    // Production (inside the packaged app directory)
    path.join(getAppRoot(), "dist-electron", "preload.js"),
    // Dev (running from repo root with `electron dist-electron/main.js`)
    path.join(process.cwd(), "dist-electron", "preload.js"),
    // Legacy / fallback paths
    path.join(getAppRoot(), "preload.js"),
    path.join(getAppRoot(), "out", "electron", "preload.js"),
    path.join(process.cwd(), "out", "electron", "preload.js"),
  ];

  const preloadPath = candidates.find((candidate) => existsSync(candidate));
  if (preloadPath) return preloadPath;

  console.warn("[electron] preload script not found. Tried:", candidates);
  return candidates[0];
}

// Local data directory for DuckDB exports and app data
const DATA_DIR = path.join(app.getPath("userData"), "data-navigator");

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// ─── IPC: filesystem bridge ───────────────────────────────────────────────────

ipcMain.handle("fs:getDataDir", () => DATA_DIR);

ipcMain.handle("fs:readFile", async (_event, filePath: string) => {
  const data = await fs.readFile(filePath);
  // Return as ArrayBuffer (transferable across IPC)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
});

ipcMain.handle(
  "fs:writeFile",
  async (_event, filePath: string, data: ArrayBuffer) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(data));
  },
);

ipcMain.handle("fs:deleteFile", async (_event, filePath: string) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("fs:listFiles", async (_event, dir?: string) => {
  const target = dir ?? DATA_DIR;
  try {
    return await fs.readdir(target);
  } catch {
    return [];
  }
});

async function walkFilesRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFilesRecursive(full)));
      continue;
    }
    if (entry.isFile()) out.push(full);
  }
  return out;
}

ipcMain.handle("fs:listFilesRecursive", async (_event, dir: string) => {
  try {
    return await walkFilesRecursive(dir);
  } catch {
    return [];
  }
});

ipcMain.handle("fs:fileExists", (_event, filePath: string) =>
  existsSync(filePath),
);

ipcMain.handle("fs:openDialog", async (_event, options: OpenDialogOptions) => {
  const result = await dialog.showOpenDialog(options);
  return { canceled: result.canceled, filePaths: result.filePaths };
});

ipcMain.handle("fs:saveDialog", async (_event, options: SaveDialogOptions) => {
  const result = await dialog.showSaveDialog(options);
  return { canceled: result.canceled, filePath: result.filePath };
});

// ─── IPC: DuckDB service ──────────────────────────────────────────────────────

ipcMain.handle("duckdb:init", async () => {
  await duckdbService.init();
  return { success: true };
});

ipcMain.handle("duckdb:runQuery", async (_event, sql: string) => {
  return duckdbService.runQuery(sql);
});

ipcMain.handle("duckdb:runBatch", async (_event, sqls: string[]) => {
  return duckdbService.runBatch(sqls);
});

ipcMain.handle("duckdb:prepare", async (_event, sql: string) => {
  return duckdbService.prepare(sql);
});

ipcMain.handle(
  "duckdb:execute",
  async (_event, stmtId: string, params: unknown[]) => {
    return duckdbService.execute(stmtId, params);
  },
);

ipcMain.handle("duckdb:disposePrepared", async (_event, stmtId: string) => {
  return duckdbService.disposePrepared(stmtId);
});

ipcMain.handle("duckdb:listTables", async () => {
  return duckdbService.listTables();
});

ipcMain.handle("duckdb:getTableInfo", async (_event, tableName: string) => {
  return duckdbService.getTableInfo(tableName);
});

ipcMain.handle(
  "duckdb:getColumnStats",
  async (_event, tableName: string, columnName: string) => {
    return duckdbService.getColumnStats(tableName, columnName);
  },
);

ipcMain.handle(
  "duckdb:loadCSVPath",
  async (
    _event,
    tableName: string,
    filePath: string,
    delimiter: string,
    append: boolean,
    hasHeader: boolean,
  ) => {
    return duckdbService.loadCSVPath(
      tableName,
      filePath,
      delimiter,
      append,
      hasHeader,
    );
  },
);

ipcMain.handle(
  "duckdb:loadJSONPath",
  async (_event, tableName: string, filePath: string) => {
    return duckdbService.loadJSONPath(tableName, filePath);
  },
);

ipcMain.handle(
  "duckdb:loadCSVBuffer",
  async (
    _event,
    tableName: string,
    buffer: ArrayBuffer,
    delimiter: string,
    append: boolean,
    hasHeader: boolean,
  ) => {
    return duckdbService.loadCSVBuffer(
      tableName,
      buffer,
      delimiter,
      append,
      hasHeader,
    );
  },
);

ipcMain.handle(
  "duckdb:loadJSONBuffer",
  async (_event, tableName: string, buffer: ArrayBuffer) => {
    return duckdbService.loadJSONBuffer(tableName, buffer);
  },
);

ipcMain.handle(
  "duckdb:exportTableToParquet",
  async (_event, tableName: string, filePath: string) => {
    return duckdbService.exportTableToParquet(tableName, filePath);
  },
);

ipcMain.handle(
  "duckdb:loadTableFromParquet",
  async (_event, tableName: string, filePath: string) => {
    return duckdbService.loadTableFromParquet(tableName, filePath);
  },
);

ipcMain.handle("duckdb:clearTable", async (_event, tableName: string) => {
  return duckdbService.clearTable(tableName);
});

ipcMain.handle("duckdb:getStatus", async () => {
  return duckdbService.getStatus();
});

ipcMain.handle("duckdb:getQueryMetrics", async () => {
  return duckdbService.getQueryMetrics();
});

ipcMain.handle("duckdb:clearQueryMetrics", async () => {
  return duckdbService.clearQueryMetrics();
});

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  await ensureDataDir();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // Required for SharedArrayBuffer (DuckDB WASM needs cross-origin isolation)
      additionalArguments: ["--enable-features=SharedArrayBuffer"],
    },
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

// ─── Next.js standalone server (production) ───────────────────────────────────

let nextServer: ChildProcess | null = null;

function startNextServer(): void {
  const serverScript = path.join(
    getAppRoot(),
    ".next",
    "standalone",
    "server.js",
  );
  if (!existsSync(serverScript)) {
    console.warn(
      "[electron] Next.js standalone server not found:",
      serverScript,
    );
    return;
  }

  nextServer = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: "3001",
      HOSTNAME: "127.0.0.1",
    },
    stdio: "inherit",
    windowsHide: true,
  });

  nextServer.on("error", (err) =>
    console.error("[electron] Next.js server error:", err),
  );
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const req = http.get(url, (res) => {
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

app.whenReady().then(async () => {
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

app.on("window-all-closed", () => {
  nextServer?.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (mainWindow === null) await createWindow();
});
