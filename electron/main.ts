import { type ChildProcess, spawn } from "node:child_process";
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
} from "electron";

import squirrelStartup from "electron-squirrel-startup";

if (squirrelStartup) {
  app.quit();
}

const isDev = !app.isPackaged;

function getAppRoot(): string {
  return app.getAppPath();
}

function getPreloadPath(): string {
  const candidates = [
    path.join(__dirname, "preload.js"),
    path.join(process.cwd(), "dist-electron", "preload.js"),
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
    env: { ...process.env, PORT: "3001", HOSTNAME: "127.0.0.1" },
    stdio: "inherit",
  });

  nextServer.on("error", (err) =>
    console.error("[electron] Next.js server error:", err),
  );
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  if (!isDev) {
    startNextServer();
    // Brief pause for server startup
    await new Promise<void>((r) => setTimeout(r, 2000));
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
