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
  shell,
  systemPreferences,
} from "electron";
import type { startServer as StartServerFn } from "next/dist/server/lib/start-server";
import { isAuthDbEncryptionRequested } from "../src/platform/auth/auth-db-encryption";
import {
  BETTER_AUTH_BASE_URL,
  ELECTRON_AUTH_PROTOCOL,
} from "../src/platform/auth/electron-options";
import { authClient } from "./auth-client";
import * as collabHubService from "./collab-hub-service";
import * as duckdbService from "./duckdb-service";
import { createConcurrencyLimiter, runBounded } from "./ipc-concurrency";
import * as llamaService from "./llama-service";
import * as modelDownloadService from "./model-download-service";
import { ensureAuthDbKeyEnv } from "./secure-store";
import {
  assertLoopbackHostname,
  ensureAuthSecretEnv,
  isAllowedAppOrigin,
  type MediaPermissionDetails,
  PathAccessController,
  PRODUCTION_FUSE_CONFIG,
  wantsMicrophone,
  withRendererSecurityHeaders,
} from "./security";
import {
  CollabStartSchema,
  CountRowsSchema,
  DatasetOnlySchema,
  ExportDatasetSchema,
  KeysetPageSchema,
  LlamaEnsureModelSchema,
  LlamaGenerateSchema,
  LlamaGenerateStructuredSchema,
  ModelDownloadSchema,
  ModelKeySchema,
  parseIpc,
  PreviewDatasetSchema,
  ProfileColumnDetailSchema,
  ProfileDatasetSchema,
  RegisterCsvSchema,
  RegisterParquetSchema,
  RequestIdSchema,
  SqlSchema,
} from "./ipc-validation";
import * as voiceService from "./voice-service";
import * as duckdbUtilityBroker from "./workers/duckdb-utility-broker";

// if (require("electron-squirrel-startup")) {
//   app.quit();
// }

// Lightweight boot tracer. Windowed Electron does not surface main-process
// stdout, so packaged startup failures are otherwise invisible. Writes to
// <userData>/boot.log when available; before app `ready` (when userData may not
// resolve yet) it falls back to the OS temp dir. Best-effort — never throws.
function bootLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  const nodeFs = require("node:fs");
  try {
    nodeFs.appendFileSync(path.join(app.getPath("userData"), "boot.log"), line);
    return;
  } catch {
    // userData not ready / not writable — fall through to temp.
  }
  try {
    const os = require("node:os");
    nodeFs.appendFileSync(path.join(os.tmpdir(), "data-navigator-boot.log"), line);
  } catch {
    // give up silently
  }
}

bootLog(`main.js loaded; isPackaged=${app.isPackaged}`);

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

authClient.setupMain({
  getWindow: () => mainWindow,
});

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

// Enforce the Chromium sandbox for EVERY current/future renderer (and devtools)
// before app ready, so a new BrowserWindow can never silently forget
// webPreferences.sandbox. Complements the per-window sandbox:true.
app.enableSandbox();

// Single-instance lock: a second launch focuses the existing window instead of
// spawning a rival process that fights over :3000 and the SQLite/DuckDB files.
// (better-auth's deep-link handler also receives the second-instance argv.)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Refuse debugger/inspector flags in packaged builds (belt-and-suspenders over
// the EnableNodeCliInspectArguments fuse). Dev uses --remote-debugging-port; a
// shipped build never should.
if (app.isPackaged) {
  const hasDebugFlag = process.argv.some(
    (arg) => arg.startsWith("--inspect") || arg.startsWith("--remote-debugging-port"),
  );
  if (hasDebugFlag) {
    console.error("[electron] refusing to run a packaged build with a debug flag");
    app.quit();
  }
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(app.getPath("userData"), "data-navigator");

// Single source of truth for filesystem allowlisting. The pure logic lives in
// ./security and is exhaustively unit-tested (see tests/security).
const pathAccess = new PathAccessController(DATA_DIR);

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
}

function assertAllowedReadPath(filePath: string): string {
  return pathAccess.assertAllowedReadPath(filePath);
}

function assertAllowedWritePath(filePath: string): string {
  return pathAccess.assertAllowedWritePath(filePath);
}

function assertAllowedDeletePath(filePath: string): string {
  return pathAccess.assertAllowedDeletePath(filePath);
}

function assertAllowedDirectoryPath(dirPath: string): string {
  return pathAccess.assertAllowedDirectoryPath(dirPath);
}

// ─── Trusted IPC Sender Guard ─────────────────────────────────────────────────

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

// ─── Heavy-Query DoS Bounds ──────────────────────────────────────────────────
// The DuckDB read channels are renderer-reachable and resource-intensive (each
// occupies a read connection / threads / memory). Bound concurrency + queue
// depth so a flood of requests fails fast with back-pressure instead of
// exhausting the main process, and cap per-request wall time so a runaway query
// cannot hold a slot forever. Additive defense-in-depth — the service still owns
// its own read-connection pool and per-query cancellation.

// DuckDB reads run across READ_CONN_COUNT (3) connections; cap a little above
// that and bound the waiting queue.
const HEAVY_QUERY_MAX_CONCURRENT = 4;
const HEAVY_QUERY_MAX_QUEUE = 24;
// Generous ceiling: real interactive queries finish far sooner; this only kills
// pathological/runaway requests.
const HEAVY_QUERY_TIMEOUT_MS = 120_000;

const heavyQueryLimiter = createConcurrencyLimiter({
  label: "duckdb-heavy-query",
  maxConcurrent: HEAVY_QUERY_MAX_CONCURRENT,
  maxQueue: HEAVY_QUERY_MAX_QUEUE,
});

/**
 * Wrap a heavy DuckDB IPC handler in the trusted-sender guard plus the shared
 * concurrency limiter and per-request timeout. The handler receives an
 * AbortSignal it MAY honor (the underlying service already supports cancellation
 * via cancel tokens); the limiter guarantees back-pressure regardless.
 */
async function withBoundedHeavyQuery<T>(
  event: IpcMainInvokeEvent,
  label: string,
  handler: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return withTrustedSender(event, () =>
    runBounded(heavyQueryLimiter, handler, {
      label,
      timeoutMs: HEAVY_QUERY_TIMEOUT_MS,
    }),
  );
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

    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }),
);

ipcMain.handle("fs:writeFile", async (event, filePath: string, data: ArrayBuffer) =>
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
        pathAccess.rememberDirectory(filePath);
      } else {
        pathAccess.rememberReadPath(filePath);
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
      pathAccess.rememberSavePath(result.filePath);
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
    const parsed = parseIpc(RegisterCsvSchema, input, "duckdb:registerCSVPathDataset");
    const safePath = assertAllowedReadPath(parsed.filePath);

    return duckdbService.registerCSVPathDataset({ ...parsed, filePath: safePath });
  }),
);

ipcMain.handle("duckdb:registerParquetPathDataset", async (event, input) =>
  withTrustedSender(event, async () => {
    const parsed = parseIpc(RegisterParquetSchema, input, "duckdb:registerParquetPathDataset");
    const safePath = assertAllowedReadPath(parsed.filePath);

    return duckdbService.registerParquetPathDataset({ ...parsed, filePath: safePath });
  }),
);

ipcMain.handle("duckdb:listDatasets", async (event) =>
  withTrustedSender(event, () => duckdbService.listDatasets()),
);

ipcMain.handle("duckdb:previewDataset", async (event, input) =>
  withTrustedSender(event, () =>
    duckdbService.previewDataset(parseIpc(PreviewDatasetSchema, input, "duckdb:previewDataset")),
  ),
);

ipcMain.handle("duckdb:summarizeDataset", async (event, input) =>
  withTrustedSender(event, () =>
    duckdbService.summarizeDataset(parseIpc(DatasetOnlySchema, input, "duckdb:summarizeDataset")),
  ),
);

ipcMain.handle("duckdb:exportDataset", async (event, input) =>
  withTrustedSender(event, async () => {
    const parsed = parseIpc(ExportDatasetSchema, input, "duckdb:exportDataset");
    const safeTargetPath = assertAllowedWritePath(parsed.targetPath);

    return duckdbService.exportDataset({ ...parsed, targetPath: safeTargetPath });
  }),
);

ipcMain.handle("duckdb:deleteDataset", async (event, input) =>
  withTrustedSender(event, () =>
    duckdbService.deleteDataset(parseIpc(DatasetOnlySchema, input, "duckdb:deleteDataset")),
  ),
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

function installMediaPermissionHandlers(): void {
  // Synchronous gate (enumerateDevices / getUserMedia pre-check): allow camera
  // AND microphone for the trusted app origin. The actual grant is confirmed by
  // the async request handler's dialog below.
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => {
      if (permission !== "media") return false;
      const mediaDetails = details as MediaPermissionDetails | undefined;
      const origin = mediaDetails?.securityOrigin ?? requestingOrigin;
      return isAllowedAppOrigin(origin);
    },
  );

  // Async request: ALWAYS re-ask via a native dialog so a camera/mic permission
  // denied the first time can still be granted later (user's explicit ask).
  // Chromium would otherwise silently reuse the prior "deny".
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      if (permission !== "media") {
        callback(false);
        return;
      }

      const mediaDetails = details as MediaPermissionDetails | undefined;
      const pageUrl =
        mediaDetails?.requestingUrl ?? mediaDetails?.securityOrigin ?? webContents.getURL();

      if (!isAllowedAppOrigin(pageUrl)) {
        callback(false);
        return;
      }

      const types = (mediaDetails?.mediaTypes ?? []) as string[];
      const wantsVideo = types.includes("video");
      const wantsAudio = types.includes("audio") || wantsMicrophone(mediaDetails);
      const what =
        wantsVideo && wantsAudio
          ? "la caméra et le microphone"
          : wantsVideo
            ? "la caméra"
            : "le microphone";

      console.log("[electron] media permission request → prompting", { pageUrl, types });

      const parent = BrowserWindow.fromWebContents(webContents) ?? undefined;
      const opts = {
        type: "question" as const,
        buttons: ["Autoriser", "Refuser"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: "Autorisation requise",
        message: `Data Navigator souhaite accéder à ${what}.`,
        detail:
          "Le traitement est 100 % local et hors ligne — aucune image ni aucun son ne quitte votre appareil. Vous pouvez réautoriser à tout moment.",
      };
      const prompt = parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts);
      prompt.then((r) => callback(r.response === 0)).catch(() => callback(false));
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

ipcMain.handle("voice:preloadStt", async (event, input) =>
  withTrustedSender(event, () => voiceService.preloadStt(input)),
);

ipcMain.handle("voice:transcribe", async (event, input) =>
  withTrustedSender(event, () => voiceService.transcribe(input)),
);

ipcMain.handle("voice:preloadTts", async (event, input) =>
  withTrustedSender(event, () => voiceService.preloadTts(input)),
);

ipcMain.handle("voice:speak", async (event, input) =>
  withTrustedSender(event, () => voiceService.speak(input)),
);

ipcMain.handle("voice:clearModels", async (event) =>
  withTrustedSender(event, () => voiceService.clearVoiceModels()),
);

ipcMain.handle("duckdb:runReadOnlyQuery", async (event, sql: string) =>
  withBoundedHeavyQuery(event, "duckdb:runReadOnlyQuery", async () => {
    const safeSql = parseIpc(SqlSchema, sql, "duckdb:runReadOnlyQuery");

    // utilityProcess isolation (OFF by default; DN_DUCKDB_UTILITY=1). When
    // enabled, route the read through the isolated process; on ANY broker error
    // fall back to the unchanged in-main path so behavior never regresses.
    if (duckdbUtilityBroker.isEnabled()) {
      try {
        return await duckdbUtilityBroker.runReadOnlyQuery(safeSql);
      } catch (error) {
        console.warn(
          "[electron] duckdb utility read failed; falling back to in-main path:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return duckdbService.runReadOnlyQuery(safeSql);
  }),
);

ipcMain.handle("duckdb:runReadOnlyQueryArrow", async (event, sql: string, cancelToken?: string) =>
  withBoundedHeavyQuery(event, "duckdb:runReadOnlyQueryArrow", () =>
    duckdbService.runReadOnlyQueryArrow(
      parseIpc(SqlSchema, sql, "duckdb:runReadOnlyQueryArrow"),
      cancelToken,
    ),
  ),
);

ipcMain.handle("duckdb:profileDataset", async (event, input) =>
  withBoundedHeavyQuery(event, "duckdb:profileDataset", () =>
    duckdbService.profileDataset(parseIpc(ProfileDatasetSchema, input, "duckdb:profileDataset")),
  ),
);

ipcMain.handle("duckdb:profileColumnDetail", async (event, input) =>
  withTrustedSender(event, () =>
    duckdbService.profileColumnDetail(
      parseIpc(ProfileColumnDetailSchema, input, "duckdb:profileColumnDetail"),
    ),
  ),
);

ipcMain.handle("duckdb:countRows", async (event, input) =>
  withTrustedSender(event, () =>
    duckdbService.countRows(parseIpc(CountRowsSchema, input, "duckdb:countRows")),
  ),
);

ipcMain.handle("duckdb:fetchKeysetPage", async (event, input) =>
  withBoundedHeavyQuery(event, "duckdb:fetchKeysetPage", () =>
    duckdbService.fetchKeysetPage(parseIpc(KeysetPageSchema, input, "duckdb:fetchKeysetPage")),
  ),
);

ipcMain.handle("duckdb:cancelQueries", async (event, token: string) =>
  withTrustedSender(event, () => {
    duckdbService.cancelQueries(token);
    return { success: true };
  }),
);

ipcMain.handle("duckdb:resetCancelToken", async (event, token: string) =>
  withTrustedSender(event, () => {
    duckdbService.resetCancelToken(token);
    return { success: true };
  }),
);

// ─── IPC: node-llama-cpp Generative Service ──────────────────────────────────
// PRIMARY generative + structured (JSON-schema grammar) lane. Runs in MAIN; the
// renderer reaches it via `window.electronLlama.*`. Streaming tokens are pushed
// back on the per-request `llama:token` channel; `llama:abort` cancels by id.

const llamaAbortControllers = new Map<string, AbortController>();

ipcMain.handle("llama:ensureModel", async (event, input?: { file?: string }) =>
  withTrustedSender(event, () =>
    llamaService.ensureModel(parseIpc(LlamaEnsureModelSchema, input, "llama:ensureModel")?.file),
  ),
);

ipcMain.handle(
  "llama:generate",
  async (
    event,
    input: {
      requestId?: string;
      system?: string;
      prompt: string;
      systemPrefix?: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    },
  ) =>
    withTrustedSender(event, () => {
      parseIpc(LlamaGenerateSchema, input, "llama:generate");
      const requestId = input?.requestId;
      const controller = new AbortController();
      if (requestId) llamaAbortControllers.set(requestId, controller);

      return llamaService
        .generate({
          system: input?.system,
          prompt: input?.prompt,
          systemPrefix: input?.systemPrefix,
          maxTokens: input?.maxTokens,
          temperature: input?.temperature,
          topP: input?.topP,
          signal: controller.signal,
          onToken: requestId
            ? (chunk) => {
                if (!event.sender.isDestroyed()) {
                  event.sender.send("llama:token", { id: requestId, chunk });
                }
              }
            : undefined,
        })
        .finally(() => {
          if (requestId) llamaAbortControllers.delete(requestId);
        });
    }),
);

ipcMain.handle(
  "llama:generateStructured",
  async (
    event,
    input: {
      requestId?: string;
      system?: string;
      prompt: string;
      systemPrefix?: string;
      jsonSchema: object;
      maxTokens?: number;
      temperature?: number;
    },
  ) =>
    withTrustedSender(event, () => {
      parseIpc(LlamaGenerateStructuredSchema, input, "llama:generateStructured");
      const requestId = input?.requestId;
      const controller = new AbortController();
      if (requestId) llamaAbortControllers.set(requestId, controller);

      return llamaService
        .generateStructured({
          system: input?.system,
          prompt: input?.prompt,
          systemPrefix: input?.systemPrefix,
          jsonSchema: input?.jsonSchema,
          maxTokens: input?.maxTokens,
          temperature: input?.temperature,
          signal: controller.signal,
        })
        .finally(() => {
          if (requestId) llamaAbortControllers.delete(requestId);
        });
    }),
);

ipcMain.handle("llama:abort", async (event, requestId: string) =>
  withTrustedSender(event, () => {
    parseIpc(RequestIdSchema, requestId, "llama:abort");
    const controller = llamaAbortControllers.get(requestId);
    if (controller) {
      controller.abort();
      llamaAbortControllers.delete(requestId);
      return true;
    }
    return false;
  }),
);

ipcMain.handle("llama:listModels", async (event) =>
  withTrustedSender(event, () => llamaService.listModels()),
);

ipcMain.handle("llama:isAvailable", async (event, input?: { file?: string }) =>
  withTrustedSender(event, () =>
    llamaService.isAvailable(parseIpc(LlamaEnsureModelSchema, input, "llama:isAvailable")?.file),
  ),
);

// ─── IPC: Offline Model Download Service ─────────────────────────────────────
// Streams GGUF weights to <userData>/models/llm while online, with progress on
// the per-request `models:progress` channel; `models:abort` cancels by id. Only
// allowlisted model keys are downloadable (no raw URLs cross the bridge).

const modelDownloadAbortControllers = new Map<string, AbortController>();

ipcMain.handle("models:listPresence", async (event) =>
  withTrustedSender(event, () => modelDownloadService.listModelPresence()),
);

ipcMain.handle("models:isPresent", async (event, key: string) =>
  withTrustedSender(event, () =>
    modelDownloadService.isModelPresent(parseIpc(ModelKeySchema, key, "models:isPresent")),
  ),
);

ipcMain.handle("models:download", async (event, input: { key: string; requestId?: string }) =>
  withTrustedSender(event, () => {
    parseIpc(ModelDownloadSchema, input, "models:download");
    const requestId = input?.requestId;
    const controller = new AbortController();
    if (requestId) modelDownloadAbortControllers.set(requestId, controller);

    return modelDownloadService
      .downloadModel({
        key: input?.key,
        requestId,
        signal: controller.signal,
        onProgress: requestId
          ? (progress) => {
              if (!event.sender.isDestroyed()) {
                event.sender.send("models:progress", { id: requestId, progress });
              }
            }
          : undefined,
      })
      .finally(() => {
        if (requestId) modelDownloadAbortControllers.delete(requestId);
      });
  }),
);

ipcMain.handle("models:abort", async (event, requestId: string) =>
  withTrustedSender(event, () => {
    const controller = modelDownloadAbortControllers.get(requestId);
    if (controller) {
      controller.abort();
      modelDownloadAbortControllers.delete(requestId);
      return true;
    }
    return false;
  }),
);

ipcMain.handle("models:delete", async (event, key: string) =>
  withTrustedSender(event, () =>
    modelDownloadService.deleteModel(parseIpc(ModelKeySchema, key, "models:delete")),
  ),
);

// ─── IPC: LAN Collaboration Hub Service ──────────────────────────────────────
// Optional embedded Hocuspocus hub + bonjour-service mDNS. The renderer connects
// as an ordinary y-websocket client; this just exposes start/stop/discover.

ipcMain.handle("collabHub:start", async (event, input?: collabHubService.CollabHubStartInput) =>
  withTrustedSender(event, () =>
    collabHubService.start(parseIpc(CollabStartSchema, input, "collabHub:start")),
  ),
);

ipcMain.handle("collabHub:stop", async (event) =>
  withTrustedSender(event, () => collabHubService.stop()),
);

ipcMain.handle("collabHub:status", async (event) =>
  withTrustedSender(event, () => collabHubService.status()),
);

ipcMain.handle("collabHub:discover", async (event) =>
  withTrustedSender(event, () => collabHubService.discover()),
);

ipcMain.handle("collabHub:getDiscovered", async (event) =>
  withTrustedSender(event, () => collabHubService.getDiscovered()),
);

// ─── Window ──────────────────────────────────────────────────────────────────

async function createWindow(): Promise<void> {
  await ensureDataDir();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    // Responsive floor: below this the sidebar/topbar have no fallback. Matches
    // the redesign's design floor (blueprint §2). Hide the stock English menu
    // (it also exposed DevTools/zoom). backgroundColor avoids a white flash
    // before the dark dashboard paints (--surface-0).
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: "#0b0e15",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Renderer sandbox ON (Chromium OS-level sandbox). The preload uses only
      // contextBridge/ipcRenderer/webUtils, which remain available to sandboxed
      // preloads. If auth/IPC ever regresses, reverting this line is step one.
      sandbox: true,
      // Explicit secure defaults (defense-in-depth — don't rely on version defaults).
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      nodeIntegrationInSubFrames: false,
      experimentalFeatures: false,
      // Middle-click auxclick can open links in a new window and subvert the
      // navigation guards below — disable it.
      disableBlinkFeatures: "Auxclick",
      // No spellcheck: its dictionary fetch is silent network egress, which
      // breaks the offline/no-runtime-network guarantee.
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // ─── Navigation hardening ──────────────────────────────────────────────────
  // The renderer must never spawn new windows or navigate cross-origin. Deny all
  // window.open (route real external https links to the OS browser); restrict
  // in-window navigation/redirects to the local app origin + the OAuth protocol;
  // refuse webview attachment outright.
  const isAllowedNavigation = (target: string): boolean => {
    if (isAllowedAppOrigin(target)) return true;
    try {
      return new URL(target).protocol === `${ELECTRON_AUTH_PROTOCOL}:`;
    } catch {
      return false;
    }
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      console.warn("[electron] blocked navigation to:", url);
    }
  });

  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      console.warn("[electron] blocked redirect to:", url);
    }
  });

  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  // Forward mDNS hub discovery events to the renderer (collab-client subscribes
  // via the `collab:discovered` channel exposed in preload).
  collabHubService.setDiscoveryListener((discoveryEvent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("collab:discovered", discoveryEvent);
    }
  });

  if (isDev) {
    await installReactDevTools();

    // Boot straight into the product, not the marketing landing (blueprint §7).
    await mainWindow.loadURL("http://localhost:3000/dashboard");
    mainWindow.webContents.openDevTools();
  } else {
    try {
      const serverUrl = await startNextJSServer();
      console.log("[electron] Next.js server started at:", serverUrl);

      // Boot straight into the product, not the marketing landing (blueprint §7).
      const dashboardUrl = new URL("/dashboard", serverUrl).toString();
      await mainWindow.loadURL(dashboardUrl);
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

async function startNextJSServer(): Promise<string> {
  try {
    bootLog("startNextJSServer: begin");
    const authUrl = new URL(BETTER_AUTH_BASE_URL);
    // Enforce localhost-only: fail closed if the (env-overridable) base URL ever
    // resolves to a non-loopback host. Makes "localhost-only" an invariant, not
    // a convention (closes the Model-D loopback-bind gap).
    const hostname = assertLoopbackHostname(authUrl.hostname);
    const nextJSPort = authUrl.port ? Number(authUrl.port) : 3000;

    const webDir = path.join(app.getAppPath(), "app");

    process.env.BETTER_AUTH_URL = BETTER_AUTH_BASE_URL;
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = BETTER_AUTH_BASE_URL;
    process.env.APP_USER_DATA = app.getPath("userData"); // ← add
    process.env.PORT = nextJSPort.toString();

    // Replace the shipped constant BETTER_AUTH_SECRET with a per-install random
    // 256-bit secret persisted (0600) in userData — forgeable-cookie hardening
    // (architecture §12). `auth.ts` reads `process.env.BETTER_AUTH_SECRET`, so
    // populating it here before the server boots overrides the dev constant
    // without touching the auth config.
    ensureAuthSecretEnv(app.getPath("userData"));

    // At-rest auth-DB encryption (OPT-IN, DEFAULT OFF). Only when the operator
    // sets DN_ENCRYPT_AUTH_DB=1 do we derive/expose the per-install DEK so the
    // Next server's auth-database layer can open the SQLite DB encrypted. Gating
    // the call on the same opt-in flag means a non-opted-in install never even
    // generates a wrapped key file, keeping the plaintext path byte-for-byte
    // unchanged. If safeStorage is unavailable the DEK is not exposed and the
    // auth layer transparently stays on plaintext.
    if (isAuthDbEncryptionRequested()) {
      const { safeStorage } = require("electron") as typeof import("electron");
      ensureAuthDbKeyEnv(app.getPath("userData"), safeStorage);
    }

    // better-auth trustedOrigins: accept the app's local origins AND the
    // Electron custom protocol used for the OAuth callback. better-auth reads
    // BETTER_AUTH_TRUSTED_ORIGINS (comma-separated) when `trustedOrigins` is not
    // set in config, so we set it here without editing the (out-of-scope)
    // auth.ts.
    const trustedOrigins = [
      BETTER_AUTH_BASE_URL,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      // Exact custom-protocol origin only — the `://*` wildcard widened trusted
      // redirect targets (open-redirect sink for the OAuth callback).
      `${ELECTRON_AUTH_PROTOCOL}://`,
    ];
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = Array.from(new Set(trustedOrigins)).join(",");

    // Load Next's startServer from the SELF-CONTAINED standalone bundle that
    // ships inside `app/` (webDir/node_modules/next). The bare "next/..."
    // specifier resolves against the packaged ROOT node_modules, which under
    // pnpm is a dangling symlink into the (excluded) .pnpm store → the installed
    // app crashed with "Cannot find module next/dist/server/lib/start-server".
    // The standalone copy has real files, so it always resolves.
    const standaloneStartServer = path.join(
      webDir,
      "node_modules",
      "next",
      "dist",
      "server",
      "lib",
      "start-server.js",
    );
    const startServerEntry = existsSync(standaloneStartServer)
      ? standaloneStartServer
      : "next/dist/server/lib/start-server";
    bootLog(`webDir=${webDir}`);
    bootLog(`appPath=${app.getAppPath()}`);
    bootLog(
      `standaloneStartServer=${standaloneStartServer} exists=${existsSync(standaloneStartServer)}`,
    );
    bootLog(`startServerEntry=${startServerEntry}`);
    const { startServer } = require(startServerEntry) as { startServer: typeof StartServerFn };
    bootLog("required startServer OK");

    await startServer({
      dir: webDir,
      isDev: false,
      hostname,
      port: nextJSPort,
      customServer: true,
      allowRetry: false,
      keepAliveTimeout: 5000,
      minimalMode: true,
    });
    bootLog(`startServer resolved; listening at ${BETTER_AUTH_BASE_URL}`);

    return BETTER_AUTH_BASE_URL;
  } catch (error) {
    bootLog(
      `ERROR: ${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`,
    );
    console.error("[electron] Error starting Next.js server:", error);
    throw error;
  }
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app
  .whenReady()
  .then(async () => {
    // Production hardening preflight. The fuses themselves are flipped at package
    // time by the Forge FusesPlugin from PRODUCTION_FUSE_CONFIG (forge.config.ts);
    // this is a runtime assertion that, when packaged, ELECTRON_RUN_AS_NODE is
    // disabled (RunAsNode:false) so the binary cannot be coerced into a generic
    // Node runtime. If a future build drops the plugin, this surfaces it in logs.
    if (
      app.isPackaged &&
      PRODUCTION_FUSE_CONFIG.RunAsNode === false &&
      process.env.ELECTRON_RUN_AS_NODE
    ) {
      console.warn(
        "[electron] ELECTRON_RUN_AS_NODE is set in a packaged build — fuses may not be enforced.",
      );
    }

    installMediaPermissionHandlers();

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // Cross-origin isolate every response (COOP/COEP/CORP → SharedArrayBuffer
      // / WASM threads / DuckDB-WASM) AND apply the renderer CSP + static security
      // headers. The CSP allows worker-src blob: + wasm-unsafe-eval (required by
      // the DuckDB/LLM/worker engine) and additionally ships a stricter
      // Report-Only policy for nonce-rollout telemetry. Pure policy in ./security.
      callback({
        responseHeaders: withRendererSecurityHeaders(details.responseHeaders, {
          dev: isDev,
          enforceCsp: true,
        }),
      });
    });

    console.log(
      "[electron] microphone access status:",
      process.platform === "darwin" || process.platform === "win32"
        ? systemPreferences.getMediaAccessStatus("microphone")
        : "unknown",
    );

    bootLog("whenReady: before duckdbService.init()");
    try {
      await duckdbService.init();
      bootLog("whenReady: duckdbService.init() OK");
    } catch (error) {
      bootLog(
        `whenReady: duckdbService.init() FAILED: ${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`,
      );
    }
    await createWindow();
    bootLog("whenReady: createWindow() returned");

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  })
  .catch((error) => {
    bootLog(
      `whenReady: TOP-LEVEL REJECTION: ${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`,
    );
  });

app.on("before-quit", () => {
  // Terminate the isolated DuckDB utility process if it was ever forked
  // (no-op when DN_DUCKDB_UTILITY is off and the broker never spawned a child).
  duckdbUtilityBroker.dispose();

  duckdbService.close().catch((error) => {
    console.error("[electron] DuckDB cleanup error:", error);
  });

  llamaService.dispose().catch((error) => {
    console.error("[electron] llama cleanup error:", error);
  });

  collabHubService.dispose().catch((error) => {
    console.error("[electron] collab-hub cleanup error:", error);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
