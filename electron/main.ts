import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
  type SaveDialogOptions,
  session,
} from "electron";
import { getPort } from "get-port-please";
import { startServer } from "next/dist/server/lib/start-server";
import * as duckdbService from "./duckdb-service";

if (require("electron-squirrel-startup")) {
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
    append: boolean,
    hasHeader: boolean,
  ) => {
    return duckdbService.loadCSVPath(tableName, filePath, append, hasHeader);
  },
);

ipcMain.handle(
  "duckdb:loadCSVBuffer",
  async (
    _event,
    tableName: string,
    buffer: ArrayBuffer,
    append: boolean,
    hasHeader: boolean,
  ) => {
    return duckdbService.loadCSVBuffer(tableName, buffer, append, hasHeader);
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
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
    },
  });

  if (isDev) {
    await installReactDevTools();
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    try {
      const port = await startNextJSServer();
      console.log("Next.js server started on port:", port);
      mainWindow.loadURL(`http://localhost:${port}`);
    } catch (error) {
      console.error("Error starting Next.js server:", error);
    }
  }

  // ── Retry on load failure ─────────────────────────────────────────────
  // When the Next.js server is slow to start or temporarily unreachable,
  // Chromium shows chrome-error://chromewebdata/ and any subsequent reload
  // is blocked by origin mismatch. By catching did-fail-load and retrying
  // with loadURL (not reload), we bypass the error-page origin issue.
  let loadRetries = 0;
  const MAX_LOAD_RETRIES = 5;
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      if (loadRetries >= MAX_LOAD_RETRIES) {
        console.error(
          `[electron] Failed to load ${validatedURL} after ${MAX_LOAD_RETRIES} retries: ${errorDescription} (code ${errorCode})`,
        );
        return;
      }
      loadRetries++;
      const delay = Math.min(1000 * loadRetries, 5000);
      console.warn(
        `[electron] Load failed (${errorDescription}), retrying in ${delay}ms (attempt ${loadRetries}/${MAX_LOAD_RETRIES})...`,
      );
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(validatedURL);
        }
      }, delay);
    },
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const startNextJSServer = async () => {
  try {
    const nextJSPort = await getPort({ portRange: [30_011, 50_000] });
    const webDir = path.join(app.getAppPath(), "app");
    const serverUrl = `http://localhost:${nextJSPort}`;

    process.env.BETTER_AUTH_URL = serverUrl;

    await startServer({
      dir: webDir,
      isDev: false,
      hostname: "localhost",
      port: nextJSPort,
      customServer: true,
      allowRetry: false,
      keepAliveTimeout: 5000,
      minimalMode: true,
    });

    return nextJSPort;
  } catch (error) {
    console.error("Error starting Next.js server:", error);
    throw error;
  }
};

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    callback({ responseHeaders: headers });
  });

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
