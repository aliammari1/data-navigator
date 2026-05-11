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
var import_promises = __toESM(require("node:fs/promises"));
var import_node_path = __toESM(require("node:path"));
var import_electron = require("electron");
var import_electron_squirrel_startup = __toESM(require("electron-squirrel-startup"));
var __dirname = "C:\\Users\\ammar\\OneDrive\\Desktop\\data-navigator\\electron";
if (import_electron_squirrel_startup.default) {
  import_electron.app.quit();
}
var isDev = !import_electron.app.isPackaged;
function getAppRoot() {
  return import_electron.app.getAppPath();
}
function getPreloadPath() {
  const candidates = [
    import_node_path.default.join(__dirname, "preload.js"),
    import_node_path.default.join(process.cwd(), "dist-electron", "preload.js"),
    import_node_path.default.join(getAppRoot(), "preload.js"),
    import_node_path.default.join(getAppRoot(), "out", "electron", "preload.js"),
    import_node_path.default.join(process.cwd(), "out", "electron", "preload.js")
  ];
  const preloadPath = candidates.find((candidate) => import_node_fs.existsSync(candidate));
  if (preloadPath)
    return preloadPath;
  console.warn("[electron] preload script not found. Tried:", candidates);
  return candidates[0];
}
var DATA_DIR = import_node_path.default.join(import_electron.app.getPath("userData"), "data-navigator");
async function ensureDataDir() {
  await import_promises.default.mkdir(DATA_DIR, { recursive: true });
}
import_electron.ipcMain.handle("fs:getDataDir", () => DATA_DIR);
import_electron.ipcMain.handle("fs:readFile", async (_event, filePath) => {
  const data = await import_promises.default.readFile(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
});
import_electron.ipcMain.handle("fs:writeFile", async (_event, filePath, data) => {
  await import_promises.default.mkdir(import_node_path.default.dirname(filePath), { recursive: true });
  await import_promises.default.writeFile(filePath, Buffer.from(data));
});
import_electron.ipcMain.handle("fs:deleteFile", async (_event, filePath) => {
  try {
    await import_promises.default.unlink(filePath);
    return true;
  } catch {
    return false;
  }
});
import_electron.ipcMain.handle("fs:listFiles", async (_event, dir) => {
  const target = dir ?? DATA_DIR;
  try {
    return await import_promises.default.readdir(target);
  } catch {
    return [];
  }
});
async function walkFilesRecursive(rootDir) {
  const out = [];
  const entries = await import_promises.default.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = import_node_path.default.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFilesRecursive(full));
      continue;
    }
    if (entry.isFile())
      out.push(full);
  }
  return out;
}
import_electron.ipcMain.handle("fs:listFilesRecursive", async (_event, dir) => {
  try {
    return await walkFilesRecursive(dir);
  } catch {
    return [];
  }
});
import_electron.ipcMain.handle("fs:fileExists", (_event, filePath) => import_node_fs.existsSync(filePath));
import_electron.ipcMain.handle("fs:openDialog", async (_event, options) => {
  const result = await import_electron.dialog.showOpenDialog(options);
  return { canceled: result.canceled, filePaths: result.filePaths };
});
import_electron.ipcMain.handle("fs:saveDialog", async (_event, options) => {
  const result = await import_electron.dialog.showSaveDialog(options);
  return { canceled: result.canceled, filePath: result.filePath };
});
var mainWindow = null;
async function createWindow() {
  await ensureDataDir();
  mainWindow = new import_electron.BrowserWindow({
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
  const serverScript = import_node_path.default.join(getAppRoot(), ".next", "standalone", "server.js");
  if (!import_node_fs.existsSync(serverScript)) {
    console.warn("[electron] Next.js standalone server not found:", serverScript);
    return;
  }
  nextServer = import_node_child_process.spawn(process.execPath, [serverScript], {
    env: { ...process.env, PORT: "3001", HOSTNAME: "127.0.0.1" },
    stdio: "inherit"
  });
  nextServer.on("error", (err) => console.error("[electron] Next.js server error:", err));
}
import_electron.app.whenReady().then(async () => {
  if (!isDev) {
    startNextServer();
    await new Promise((r) => setTimeout(r, 2000));
  }
  await createWindow();
});
import_electron.app.on("window-all-closed", () => {
  nextServer?.kill();
  if (process.platform !== "darwin")
    import_electron.app.quit();
});
import_electron.app.on("activate", async () => {
  if (mainWindow === null)
    await createWindow();
});
