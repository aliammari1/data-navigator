import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  type OpenDialogOptions,
  type SaveDialogOptions,
  session,
  systemPreferences,
} from "electron";
import { getPort } from "get-port-please";
import { startServer } from "next/dist/server/lib/start-server";
import * as duckdbService from "./duckdb-service";

if (require("electron-squirrel-startup")) {
  app.quit();
}

const isDev = !app.isPackaged;

// ─── App Update ───────────────────────────────────────────────────────────────

if (app.isPackaged) {
  import("update-electron-app")
    .then(({ updateElectronApp }) => {
      updateElectronApp({
        repo: "aliammari1/data-navigator",
        updateInterval: "1 hour",
      });
    })
    .catch((error) => {
      console.warn("[electron] auto-update setup failed:", error);
    });
}

// ─── GPU / WebGPU Configuration ──────────────────────────────────────────────
// Enable WebGPU for @huggingface/transformers in renderer + workers.
// Required for GPU-accelerated Whisper STT and local model inference.
app.commandLine.appendSwitch("enable-unsafe-webgpu");

// Linux requires Vulkan backend for WebGPU adapter discovery.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "Vulkan");
}

// Optional: allow GPUs that Chromium normally blocklists.
app.commandLine.appendSwitch("ignore-gpu-blocklist");

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(app.getPath("userData"), "data-navigator");

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const child = normalizePath(childPath);
  const parent = normalizePath(parentPath);
  const relative = path.relative(parent, child);

  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function isInsideDataDir(filePath: string): boolean {
  return isPathInside(filePath, DATA_DIR);
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(normalizePath(filePath)), { recursive: true });
}

// These sets prevent renderer code from passing arbitrary filesystem paths.
// A path becomes allowed when the user selected it through an Electron dialog.
const allowedReadPaths = new Set<string>();
const allowedWritePaths = new Set<string>();
const allowedDirectoryPaths = new Set<string>();

function rememberDialogPath(filePath: string): void {
  const resolved = normalizePath(filePath);
  allowedReadPaths.add(resolved);
  allowedDirectoryPaths.add(resolved);
}

function rememberSavePath(filePath: string): void {
  allowedWritePaths.add(normalizePath(filePath));
}

function assertAllowedReadPath(filePath: string): string {
  const resolved = normalizePath(filePath);

  if (allowedReadPaths.has(resolved) || isInsideDataDir(resolved)) {
    return resolved;
  }

  for (const allowedDir of allowedDirectoryPaths) {
    if (isPathInside(resolved, allowedDir)) {
      return resolved;
    }
  }

  throw new Error(`Blocked read access to untrusted path: ${resolved}`);
}

function assertAllowedWritePath(filePath: string): string {
  const resolved = normalizePath(filePath);

  if (allowedWritePaths.has(resolved) || isInsideDataDir(resolved)) {
    return resolved;
  }

  throw new Error(`Blocked write access to untrusted path: ${resolved}`);
}

function assertAllowedDeletePath(filePath: string): string {
  const resolved = normalizePath(filePath);

  if (!isInsideDataDir(resolved)) {
    throw new Error(`Blocked delete access outside app data dir: ${resolved}`);
  }

  return resolved;
}

function assertAllowedDirectoryPath(dirPath: string): string {
  const resolved = normalizePath(dirPath);

  if (allowedDirectoryPaths.has(resolved) || isInsideDataDir(resolved)) {
    return resolved;
  }

  throw new Error(`Blocked directory access to untrusted path: ${resolved}`);
}

function getStringProperty(input: unknown, key: string): string {
  if (!input || typeof input !== "object") {
    throw new Error(`Expected object input with property "${key}".`);
  }

  const value = (input as Record<string, unknown>)[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Expected non-empty string property "${key}".`);
  }

  return value;
}

// ─── Trusted IPC Sender Guard ─────────────────────────────────────────────────

function isAllowedAppOrigin(value?: string): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);

    if (url.protocol === "file:") return true;
    if (url.hostname === "localhost") return true;
    if (url.hostname === "127.0.0.1") return true;

    return false;
  } catch {
    return false;
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frameUrl = event.senderFrame?.url;
  const webContentsUrl = event.sender.getURL();
  const url = frameUrl || webContentsUrl;

  if (!isAllowedAppOrigin(url)) {
    throw new Error(`Blocked IPC call from untrusted sender: ${url}`);
  }
}

async function withTrustedSender<T>(
  event: IpcMainInvokeEvent,
  handler: () => Promise<T> | T,
): Promise<T> {
  assertTrustedSender(event);
  return handler();
}

// ─── DevTools ────────────────────────────────────────────────────────────────

async function installReactDevTools(): Promise<void> {
  if (!isDev) return;

  try {
    const { installExtension, REACT_DEVELOPER_TOOLS } = await import(
      "@tomjs/electron-devtools-installer"
    );

    const extension = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`[electron] Installed ${extension.name}`);
  } catch (error) {
    console.warn("[electron] React DevTools install failed:", error);
  }
}

// ─── IPC: Filesystem Bridge ──────────────────────────────────────────────────
// Keep this bridge narrow. Arbitrary read/write/delete is blocked unless the
// path is inside app data or was explicitly selected through a native dialog.

ipcMain.handle("fs:getDataDir", async (event) =>
  withTrustedSender(event, async () => {
    await ensureDataDir();
    return DATA_DIR;
  }),
);

ipcMain.handle("fs:readFile", async (event, filePath: string) =>
  withTrustedSender(event, async () => {
    const safePath = assertAllowedReadPath(filePath);
    const data = await fs.readFile(safePath);

    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
  }),
);

ipcMain.handle(
  "fs:writeFile",
  async (event, filePath: string, data: ArrayBuffer) =>
    withTrustedSender(event, async () => {
      const safePath = assertAllowedWritePath(filePath);
      await ensureParentDirectory(safePath);
      await fs.writeFile(safePath, Buffer.from(data));
    }),
);

ipcMain.handle("fs:deleteFile", async (event, filePath: string) =>
  withTrustedSender(event, async () => {
    const safePath = assertAllowedDeletePath(filePath);

    try {
      await fs.unlink(safePath);
      return true;
    } catch {
      return false;
    }
  }),
);

ipcMain.handle("fs:listFiles", async (event, dir?: string) =>
  withTrustedSender(event, async () => {
    const target = dir ? assertAllowedDirectoryPath(dir) : DATA_DIR;

    try {
      return await fs.readdir(target);
    } catch {
      return [];
    }
  }),
);

async function walkFilesRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      out.push(...(await walkFilesRecursive(full)));
      continue;
    }

    if (entry.isFile()) {
      out.push(full);
    }
  }

  return out;
}

ipcMain.handle("fs:listFilesRecursive", async (event, dir: string) =>
  withTrustedSender(event, async () => {
    try {
      const safeDir = assertAllowedDirectoryPath(dir);
      return await walkFilesRecursive(safeDir);
    } catch {
      return [];
    }
  }),
);

ipcMain.handle("fs:fileExists", async (event, filePath: string) =>
  withTrustedSender(event, async () => {
    try {
      const safePath = assertAllowedReadPath(filePath);
      return existsSync(safePath);
    } catch {
      return false;
    }
  }),
);

ipcMain.handle("fs:openDialog", async (event, options: OpenDialogOptions) =>
  withTrustedSender(event, async () => {
    const result = await dialog.showOpenDialog(options);

    const opensDirectory = options.properties?.includes("openDirectory");

    for (const filePath of result.filePaths) {
      if (opensDirectory) {
        allowedDirectoryPaths.add(normalizePath(filePath));
      } else {
        allowedReadPaths.add(normalizePath(filePath));
      }
    }

    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  }),
);

ipcMain.handle("fs:saveDialog", async (event, options: SaveDialogOptions) =>
  withTrustedSender(event, async () => {
    const result = await dialog.showSaveDialog(options);

    if (result.filePath) {
      rememberSavePath(result.filePath);
    }

    return {
      canceled: result.canceled,
      filePath: result.filePath,
    };
  }),
);

// ─── IPC: DuckDB Dataset Service ─────────────────────────────────────────────

ipcMain.handle("duckdb:init", async (event) =>
  withTrustedSender(event, async () => {
    await duckdbService.init();
    return { success: true };
  }),
);

ipcMain.handle("duckdb:registerCSVPathDataset", async (event, input) =>
  withTrustedSender(event, async () => {
    const filePath = getStringProperty(input, "filePath");
    const safePath = assertAllowedReadPath(filePath);

    return duckdbService.registerCSVPathDataset({
      ...(input as Record<string, unknown>),
      filePath: safePath,
    });
  }),
);

ipcMain.handle("duckdb:registerParquetPathDataset", async (event, input) =>
  withTrustedSender(event, async () => {
    const filePath = getStringProperty(input, "filePath");
    const safePath = assertAllowedReadPath(filePath);

    return duckdbService.registerParquetPathDataset({
      ...(input as Record<string, unknown>),
      filePath: safePath,
    });
  }),
);

ipcMain.handle("duckdb:listDatasets", async (event) =>
  withTrustedSender(event, () => duckdbService.listDatasets()),
);

ipcMain.handle("duckdb:previewDataset", async (event, input) =>
  withTrustedSender(event, () => duckdbService.previewDataset(input)),
);

ipcMain.handle("duckdb:summarizeDataset", async (event, input) =>
  withTrustedSender(event, () => duckdbService.summarizeDataset(input)),
);

ipcMain.handle("duckdb:exportDataset", async (event, input) =>
  withTrustedSender(event, async () => {
    const targetPath = getStringProperty(input, "targetPath");
    const safeTargetPath = assertAllowedWritePath(targetPath);

    return duckdbService.exportDataset({
      ...(input as Record<string, unknown>),
      targetPath: safeTargetPath,
    });
  }),
);

ipcMain.handle("duckdb:deleteDataset", async (event, input) =>
  withTrustedSender(event, () => duckdbService.deleteDataset(input)),
);

ipcMain.handle("duckdb:getStatus", async (event) =>
  withTrustedSender(event, () => duckdbService.getStatus()),
);

ipcMain.handle("duckdb:getQueryMetrics", async (event) =>
  withTrustedSender(event, () => duckdbService.getQueryMetrics()),
);

ipcMain.handle("duckdb:clearQueryMetrics", async (event) =>
  withTrustedSender(event, () => {
    duckdbService.clearQueryMetrics();
    return { success: true };
  }),
);

// ─── Permissions ─────────────────────────────────────────────────────────────

type MediaPermissionDetails = {
  mediaType?: string;
  mediaTypes?: string[];
  requestingUrl?: string;
  securityOrigin?: string;
};

function wantsMicrophone(details?: MediaPermissionDetails): boolean {
  if (!details) return true;

  if (Array.isArray(details.mediaTypes)) {
    return details.mediaTypes.includes("audio");
  }

  if (details.mediaType) {
    return details.mediaType === "audio" || details.mediaType === "unknown";
  }

  return true;
}

function installMediaPermissionHandlers(): void {
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => {
      if (permission !== "media") return false;

      const mediaDetails = details as MediaPermissionDetails | undefined;
      const origin = mediaDetails?.securityOrigin ?? requestingOrigin;

      return isAllowedAppOrigin(origin) && wantsMicrophone(mediaDetails);
    },
  );

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      if (permission !== "media") {
        callback(false);
        return;
      }

      const mediaDetails = details as MediaPermissionDetails | undefined;
      const pageUrl =
        mediaDetails?.requestingUrl ??
        mediaDetails?.securityOrigin ??
        webContents.getURL();

      const allowed =
        isAllowedAppOrigin(pageUrl) && wantsMicrophone(mediaDetails);

      console.log("[electron] media permission request", {
        pageUrl,
        mediaDetails,
        allowed,
      });

      callback(allowed);
    },
  );
}

ipcMain.handle("voice:getMicrophoneAccessStatus", async (event) =>
  withTrustedSender(event, () => {
    if (process.platform !== "darwin" && process.platform !== "win32") {
      return "unknown";
    }

    return systemPreferences.getMediaAccessStatus("microphone");
  }),
);

ipcMain.handle("duckdb:runReadOnlyQuery", async (event, sql: string) =>
  withTrustedSender(event, () => duckdbService.runReadOnlyQuery(sql)),
);
// ─── Window ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  await ensureDataDir();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,

      // Keep false if your existing preload bundle depends on Node APIs.
      // Change to true only after confirming the preload still works.
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (isDev) {
    await installReactDevTools();

    await mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    try {
      const port = await startNextJSServer();
      console.log("[electron] Next.js server started on port:", port);

      await mainWindow.loadURL(`http://localhost:${port}`);
    } catch (error) {
      console.error("[electron] Error starting Next.js server:", error);
    }
  }

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

      loadRetries += 1;

      const delay = Math.min(1000 * loadRetries, 5000);

      console.warn(
        `[electron] Load failed (${errorDescription}), retrying in ${delay}ms (attempt ${loadRetries}/${MAX_LOAD_RETRIES})...`,
      );

      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          void mainWindow.loadURL(validatedURL);
        }
      }, delay);
    },
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Next.js Server ──────────────────────────────────────────────────────────

async function startNextJSServer(): Promise<number> {
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
    console.error("[electron] Error starting Next.js server:", error);
    throw error;
  }
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  installMediaPermissionHandlers();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };

    // Keep this intentionally light. A strict CSP can easily break Next.js
    // unless the app's generated scripts/styles are audited first.
    callback({ responseHeaders: headers });
  });

  console.log(
    "[electron] microphone access status:",
    process.platform === "darwin" || process.platform === "win32"
      ? systemPreferences.getMediaAccessStatus("microphone")
      : "unknown",
  );

  await duckdbService.init();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("before-quit", () => {
  duckdbService.close().catch((error) => {
    console.error("[electron] DuckDB cleanup error:", error);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
