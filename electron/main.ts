import crypto from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import fs, { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import dotenv from "dotenv";

const cwdEnv = path.resolve(process.cwd(), ".env");
const buildEnv = path.resolve(__dirname, "..", ".env");
const targetEnv = existsSync(cwdEnv) ? cwdEnv : existsSync(buildEnv) ? buildEnv : undefined;
if (targetEnv) {
  dotenv.config({ path: targetEnv });
} else {
  dotenv.config();
}

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  nativeImage,
  type OpenDialogOptions,
  powerMonitor,
  protocol,
  type SaveDialogOptions,
  session,
  shell,
  systemPreferences,
} from "electron";
import type { startServer as StartServerFn } from "next/dist/server/lib/start-server";
import { isAuthDbEncryptionRequested } from "@/platform/auth/auth-db-encryption";
import { BETTER_AUTH_BASE_URL, ELECTRON_AUTH_PROTOCOL } from "@/platform/auth/electron-options";
import { PROD_PORT_RANGE, resolveAppPort } from "./port-picker";

let currentServerPort = 3000;

import { authClient } from "./auth-client";
import {
  changePassword as authChangePassword,
  getOwnerInfo as authGetOwnerInfo,
  getSession as authGetSession,
  hasOwner as authHasOwner,
  isAppLocked as authIsAppLocked,
  lockApp as authLockApp,
  login as authLogin,
  logout as authLogout,
  signUp as authSignUp,
  closeAuthStore,
  configureAuthStore,
  getNextLocalMidnight,
  setAuthMigrationsFolder,
} from "./auth-store";
import { searchMessages as chatSearchMessages } from "./chat-search";
import {
  appendMessageEmbedding,
  backfillMessageEmbeddings,
  semanticSearchMessages,
  setChatSemanticSearchHandle,
} from "./chat-semantic-search";
import * as chatSessionService from "./chat-session-service";
import {
  appendMessage as chatAppendMessage,
  createConversation as chatCreateConversation,
  deleteConversation as chatDeleteConversation,
  getMessages as chatGetMessages,
  listConversations as chatListConversations,
  renameConversation as chatRenameConversation,
  setConversationModel as chatSetConversationModel,
  setConversationPinned as chatSetConversationPinned,
  closeChatStore,
  configureChatStore,
  getChatStoreHandle,
  onMessageAppended as onChatMessageAppended,
  setChatMigrationsFolder,
} from "./chat-store";
import * as collabHubService from "./collab-hub-service";
import * as duckdbService from "./duckdb-service";
import * as embeddingService from "./embedding-service";
import { createConcurrencyLimiter, runBounded } from "./ipc-concurrency";
import {
  ChatAppendMessageSchema,
  ChatConversationIdSchema,
  ChatCreateConversationSchema,
  ChatGetMessagesSchema,
  ChatListConversationsSchema,
  ChatModelSchema,
  ChatOpenSchema,
  ChatPinSchema,
  ChatPreloadSchema,
  ChatPromptSchema,
  ChatRenameSchema,
  ChatSearchMessagesSchema,
  ChatSessionIdSchema,
  ClipboardImageSchema,
  CollabStartSchema,
  CountRowsSchema,
  DatasetOnlySchema,
  EmbedBatchSchema,
  EmbedEnsureModelSchema,
  EmbedOneSchema,
  ExportDatasetSchema,
  KeysetPageSchema,
  LlamaEnsureModelSchema,
  LlamaGenerateSchema,
  LlamaGenerateStructuredSchema,
  LlamaPreloadWarmPrefixSchema,
  ModelDownloadSchema,
  ModelKeySchema,
  PreviewDatasetSchema,
  ProfileColumnDetailSchema,
  ProfileDatasetSchema,
  parseIpc,
  RegisterCsvSchema,
  RegisterParquetSchema,
  RequestIdSchema,
  SqlSchema,
} from "./ipc-validation";
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
  closeSettingsStore,
  configureSettingsStore,
  deleteAnalyticsSnapshotHistoryById,
  deleteSetting,
  exportSettings,
  getAnalyticsSnapshotHistoryById,
  getSetting,
  listAnalyticsSnapshotHistory,
  listAuditLog,
  listQueryAnalytics,
  migrateLegacyAnalyticsSnapshotKV,
  migrateLegacyAppSettings,
  recordAuditLog,
  recordQueryAnalytics,
  saveAnalyticsSnapshotHistory,
  setSetting,
  setSettingsMigrationsFolder,
} from "./settings-storage";
import * as duckdbUtilityBroker from "./workers/duckdb-utility-broker";

// Handle any Windows installer lifecycle flags (--squirrel-*) without external deps
if (process.platform === "win32") {
  const squirrelArg = process.argv[1];
  if (
    squirrelArg &&
    (squirrelArg === "--squirrel-install" ||
      squirrelArg === "--squirrel-updated" ||
      squirrelArg === "--squirrel-uninstall" ||
      squirrelArg === "--squirrel-obsolete")
  ) {
    app.quit();
  }
}

// The sandboxed Pyodide iframe (opaque origin) fetches pyodide.mjs + runtime
// files via `pyodide://host/…`. Module scripts require CORS, so the scheme
// must be privileged-standard with fetch support. Must run before app ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "pyodide",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

if (process.platform !== "darwin" && !process.env.OMP_PROC_BIND) {
  process.env.OMP_PROC_BIND = "true";
}

if (!process.env.OMP_NUM_THREADS) {
  process.env.OMP_NUM_THREADS = String(Math.max(1, (os.cpus()?.length ?? 2) - 1));
}

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

// Native download deps (ipull, via node-llama-cpp's model downloader) run
// several chunk writers in parallel and only await/catch the FIRST one to
// settle; when multiple chunks reject around the same moment (e.g. every
// writer hitting ENOSPC at once because the disk filled up mid-download),
// the rest are orphaned rejections that Node prints as raw
// UnhandledPromiseRejectionWarning stack dumps — one per orphaned chunk,
// unbounded. That's a bug in the dependency's internal Promise.race loop,
// not something reachable from our own try/catch around downloader.download().
// A process-level handler is the only interception point available to us: it
// can't fix the leak, but it stops Node's noisy default printer and (per
// Node's docs) prevents an unhandled rejection from ever terminating the
// main process outright, which is the real risk once Node's default
// unhandled-rejection behavior tightens in a future major version.
process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  bootLog(`unhandledRejection: ${detail}`);
  console.error("[electron] unhandled promise rejection:", reason);
});

bootLog(`main.js loaded; isPackaged=${app.isPackaged}`);

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

authClient.setupMain({
  getWindow: () => mainWindow,
  // Keep better-auth's own CSP rewriter OFF — this app owns the CSP in
  // electron/security.ts (see withRendererSecurityHeaders). Explicit so a future
  // edit can't silently activate a competing onHeadersReceived CSP handler.
  csp: false,
});

// ─── App Update ───────────────────────────────────────────────────────────────
// Offline-first: auto-update is OFF by default so a packaged launch makes ZERO
// outbound network requests. Otherwise update-electron-app polls
// update.electronjs.org on launch AND hourly — in the MAIN process, so the
// renderer CSP cannot stop it, and it leaks app version + platform. Opt back in
// by setting DN_ENABLE_AUTO_UPDATE=1 in the environment. (Auto-update is also
// non-functional for this private-repo MSI — see docs/RELEASING-WINDOWS.md — so
// disabling it by default only removes a dead, guarantee-violating network call.)

if (app.isPackaged && process.env.DN_ENABLE_AUTO_UPDATE === "1") {
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
// Enable WebGPU in renderer + workers for GPU-accelerated local model
// inference that still runs in the browser. Text embeddings/generation no
// longer need this — both now run as GGUF models through node-llama-cpp in
// this main process instead.
app.commandLine.appendSwitch("enable-unsafe-webgpu");

// Enforce the Chromium sandbox for EVERY current/future renderer (and devtools)
// before app ready, so a new BrowserWindow can never silently forget
// webPreferences.sandbox. Complements the per-window sandbox:true.
app.enableSandbox();

/**
 * Merge FTS5 BM25 hits with semantic cosine hits. FTS5's `rank` field is
 * actually the array index (chat-search.ts limitation), so cross-source
 * score normalization is impossible — we dedupe by messageId and let
 * semantic win on ties (it captures intent the keyword match misses).
 */
function mergeSearchHits(
  ftsHits: Array<{
    messageId: number;
    conversationId: string;
    role: string;
    snippet: string;
    rank: number;
  }>,
  semanticHits: Array<{
    messageId: number;
    conversationId: string;
    role: string;
    snippet: string;
    score: number;
  }>,
  limit: number,
): Array<{
  messageId: number;
  conversationId: string;
  role: string;
  snippet: string;
  source: "fts" | "semantic";
}> {
  const byId = new Map<
    number,
    {
      messageId: number;
      conversationId: string;
      role: string;
      snippet: string;
      source: "fts" | "semantic";
    }
  >();
  for (const hit of ftsHits) {
    byId.set(hit.messageId, {
      messageId: hit.messageId,
      conversationId: hit.conversationId,
      role: hit.role,
      snippet: hit.snippet,
      source: "fts",
    });
  }
  for (const hit of semanticHits) {
    byId.set(hit.messageId, {
      messageId: hit.messageId,
      conversationId: hit.conversationId,
      role: hit.role,
      snippet: hit.snippet,
      source: "semantic",
    });
  }
  return Array.from(byId.values()).slice(0, limit);
}

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

// Directory holding the per-domain settings/analytics SQLite files owned by the
// main process (the IPC replacement for /api/settings).
const DATABASES_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "databases")
  : process.env.APP_USER_DATA
    ? path.join(process.env.APP_USER_DATA, "databases")
    : path.join(process.cwd(), ".data");

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
  // In test harnesses (e.g. electron-playwright-helpers ipcMainInvokeHandler),
  // event is a synthesized mock object without sender or senderFrame.
  if (!event || (!event.sender && !event.senderFrame)) {
    return;
  }
  const frameUrl = event.senderFrame?.url;
  const webContentsUrl = event.sender?.getURL ? event.sender.getURL() : undefined;
  const url = frameUrl || webContentsUrl;

  if (url && !isAllowedAppOrigin(url)) {
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

// ─── IPC: Settings Bridge ────────────────────────────────────────────────────
// Durable client state (zustand stores, theme, dashboard access, analytics
// snapshots) persisted into per-domain SQLite files owned here in the main
// process — the IPC replacement for the retired /api/settings HTTP route. The
// store ops are synchronous (better-sqlite3); the trusted-sender guard blocks
// calls from any frame that isn't an allowed app origin.

ipcMain.handle("settings:get", async (event, namespace: string, key: string) =>
  withTrustedSender(event, () => getSetting(namespace, key)),
);

ipcMain.handle("settings:set", async (event, namespace: string, key: string, value: unknown) =>
  withTrustedSender(event, () => setSetting(namespace, key, value)),
);

ipcMain.handle("settings:delete", async (event, namespace: string, key: string) =>
  withTrustedSender(event, () => deleteSetting(namespace, key)),
);

ipcMain.handle("settings:export", async (event, namespace?: string) =>
  withTrustedSender(event, () => exportSettings(namespace)),
);

// ─── IPC: Analytics Snapshot History Bridge ───────────────────────────────────
// The telecom "Persister" button + Analytics History list. One method per
// message (not a generic query passthrough) per Electron's own IPC security
// guidance — the renderer gets save/list/get/delete, never raw SQL access.
// `limit` is clamped inside listAnalyticsSnapshotHistory so a bad renderer call
// can't force an oversized structured-clone payload across the bridge.

ipcMain.handle(
  "analyticsSnapshots:save",
  async (
    event,
    input: {
      tableName: string;
      label: string;
      fileName?: string | null;
      payload: unknown;
      totalTransactions?: number;
      successRate?: number;
      savedAt?: number;
    },
  ) => withTrustedSender(event, () => saveAnalyticsSnapshotHistory(input)),
);

ipcMain.handle(
  "analyticsSnapshots:list",
  async (event, tableName?: string, limit?: number, offset?: number) =>
    withTrustedSender(event, () => listAnalyticsSnapshotHistory(tableName, limit, offset)),
);

ipcMain.handle("analyticsSnapshots:get", async (event, id: number) =>
  withTrustedSender(event, () => getAnalyticsSnapshotHistoryById(id)),
);

ipcMain.handle("analyticsSnapshots:delete", async (event, id: number) =>
  withTrustedSender(event, () => deleteAnalyticsSnapshotHistoryById(id)),
);

// ─── IPC: Authentication Bridge (Signal Desktop / Bitwarden Pattern) ─────────
// Better-sqlite3 native driver runs exclusively in this main process.
// The renderer invokes these secure IPC handlers for authentication,
// password verification, session queries, and lock/unlock operations.

function signCookieValue(value: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(value);
  const signature = hmac.digest("base64");
  return `${value}.${signature}`;
}

async function syncSessionCookie(token: string | null, expiresAtMs?: number): Promise<void> {
  try {
    const defaultSession = session.defaultSession;
    if (!defaultSession) return;
    const primaryUrl = BETTER_AUTH_BASE_URL || `http://localhost:${currentServerPort}`;
    const targetUrls = new Set([
      primaryUrl,
      `http://localhost:${currentServerPort}`,
      `http://127.0.0.1:${currentServerPort}`,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);

    const expirationDate = expiresAtMs
      ? Math.floor(expiresAtMs / 1000)
      : Math.floor(getNextLocalMidnight().getTime() / 1000);

    const authSecret =
      process.env.BETTER_AUTH_SECRET || "data-navigator-local-dev-secret-change-me";
    const signedValue = token ? signCookieValue(token, authSecret) : null;

    for (const url of targetUrls) {
      if (token && signedValue) {
        await defaultSession.cookies.set({
          url,
          name: "better-auth.session_token",
          value: signedValue,
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          expirationDate,
        });
      } else {
        await defaultSession.cookies.remove(url, "better-auth.session_token");
      }
    }
  } catch (error) {
    console.warn("[electron] syncSessionCookie error:", error);
  }
}

let currentActiveToken: string | null = null;
let midnightTimer: NodeJS.Timeout | null = null;
let warningTimer: NodeJS.Timeout | null = null;

function clearMidnightTimer(): void {
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }
}

function scheduleMidnightExpiration(expiresAtIsoString?: string): void {
  clearMidnightTimer();
  const expiresAtMs = expiresAtIsoString
    ? new Date(expiresAtIsoString).getTime()
    : getNextLocalMidnight().getTime();
  const delayMs = Math.max(0, expiresAtMs - Date.now());

  // 5-minute warning before midnight expiration
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  if (delayMs > FIVE_MINUTES_MS) {
    const warningDelayMs = delayMs - FIVE_MINUTES_MS;
    warningTimer = setTimeout(() => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auth:session-expiring-soon", {
            minutesRemaining: 5,
          });
        }
      } catch (err) {
        console.error("[electron] pre-midnight warning error:", err);
      }
    }, warningDelayMs);
  }

  midnightTimer = setTimeout(async () => {
    try {
      authLockApp();
      currentActiveToken = null;
      await syncSessionCookie(null);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auth:session-expired");
        mainWindow.webContents.send("auth:lock-changed", true);
      }
    } catch (err) {
      console.error("[electron] midnight expiration handler error:", err);
    }
  }, delayMs);
}

function sanitizeSessionResult<
  T extends {
    session?: {
      id: string;
      userId: string;
      expiresAt: string;
      createdAt?: string;
      updatedAt?: string;
    } | null;
  },
>(result: T): T {
  if (!result || !result.session) return result;
  const { token: _, ...safeSession } = result.session as { token?: string } & typeof result.session;
  return {
    ...result,
    session: safeSession,
  };
}

ipcMain.handle("auth:hasOwner", async (event) => withTrustedSender(event, () => authHasOwner()));

ipcMain.handle("auth:getOwnerInfo", async (event) =>
  withTrustedSender(event, () => authGetOwnerInfo()),
);

ipcMain.handle("auth:isLocked", async (event) => withTrustedSender(event, () => authIsAppLocked()));

ipcMain.handle("auth:lock", async (event) =>
  withTrustedSender(event, async () => {
    clearMidnightTimer();
    authLockApp();
    currentActiveToken = null;
    await syncSessionCookie(null);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auth:lock-changed", true);
    }
  }),
);

ipcMain.handle(
  "auth:signUp",
  async (event, input: { name: string; email: string; password: string }) =>
    withTrustedSender(event, async () => {
      const result = authSignUp(input);
      if (result?.session?.token) {
        currentActiveToken = result.session.token;
        const expiresAtMs = new Date(result.session.expiresAt).getTime();
        await syncSessionCookie(result.session.token, expiresAtMs);
        scheduleMidnightExpiration(result.session.expiresAt);
      }
      return sanitizeSessionResult(result);
    }),
);

ipcMain.handle("auth:login", async (event, input: { email: string; password: string }) =>
  withTrustedSender(event, async () => {
    const result = authLogin(input);
    if (result?.session?.token) {
      currentActiveToken = result.session.token;
      const expiresAtMs = new Date(result.session.expiresAt).getTime();
      await syncSessionCookie(result.session.token, expiresAtMs);
      scheduleMidnightExpiration(result.session.expiresAt);
    }
    return sanitizeSessionResult(result);
  }),
);

ipcMain.handle("auth:getSession", async (event, token?: string | null) =>
  withTrustedSender(event, () => {
    const effectiveToken = token || currentActiveToken;
    const result = authGetSession(effectiveToken);
    return sanitizeSessionResult(result);
  }),
);

ipcMain.handle("auth:logout", async (event, token?: string | null) =>
  withTrustedSender(event, async () => {
    clearMidnightTimer();
    const effectiveToken = token || currentActiveToken;
    authLogout(effectiveToken);
    currentActiveToken = null;
    await syncSessionCookie(null);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auth:lock-changed", true);
    }
  }),
);

ipcMain.handle(
  "auth:changePassword",
  async (event, input: { token?: string; currentPassword: string; newPassword: string }) =>
    withTrustedSender(event, () => {
      const effectiveToken = input.token || currentActiveToken;
      if (!effectiveToken) throw new Error("No active session.");
      return authChangePassword({
        token: effectiveToken,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
    }),
);

// ─── IPC: Analytics & Audit Logging Bridge ───────────────────────────────────

ipcMain.handle(
  "analytics:recordAudit",
  async (
    event,
    input: {
      userId?: string | null;
      action: string;
      category: string;
      status: string;
      durationMs?: number | null;
      metadata?: Record<string, unknown> | null;
    },
  ) => withTrustedSender(event, () => recordAuditLog(input)),
);

ipcMain.handle("analytics:getAuditLogs", async (event, limit?: number) =>
  withTrustedSender(event, () => listAuditLog(limit)),
);

ipcMain.handle(
  "analytics:recordQuery",
  async (
    event,
    input: {
      datasetId: string;
      sqlQuery: string;
      rowCount: number;
      executionTimeMs: number;
      isCached?: boolean;
      error?: string | null;
    },
  ) => withTrustedSender(event, () => recordQueryAnalytics(input)),
);

ipcMain.handle("analytics:getQueryAnalytics", async (event, limit?: number) =>
  withTrustedSender(event, () => listQueryAnalytics(limit)),
);

// ─── IPC: Clipboard Bridge ────────────────────────────────────────────────────
// Write a chart's PNG export (as a data URL) to the OS clipboard as a native
// image. The renderer can't reach the clipboard directly; the schema caps the
// payload and enforces the `data:image/` prefix, and an empty decode is
// rejected so a malformed URL surfaces as an error instead of a silent no-op.

ipcMain.handle("clipboard:writeImage", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const { dataUrl } = parseIpc(ClipboardImageSchema, input, "clipboard:writeImage");
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) {
      throw new Error("clipboard:writeImage received an unreadable image data URL");
    }
    clipboard.writeImage(image);
  }),
);

// ─── IPC: Moudir Chat History Bridge ─────────────────────────────────────────
// Durable conversations for the assistant (chat.db). One method per message,
// no raw SQL across the bridge — same shape as the analytics-snapshot bridge.

ipcMain.handle("chatHistory:create", async (event, input: unknown) =>
  withTrustedSender(event, () =>
    chatCreateConversation(parseIpc(ChatCreateConversationSchema, input, "chatHistory:create")),
  ),
);

ipcMain.handle("chatHistory:list", async (event, input?: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatListConversationsSchema, input, "chatHistory:list");
    return chatListConversations(parsed?.limit ?? 100, parsed?.search);
  }),
);

ipcMain.handle("chatHistory:rename", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatRenameSchema, input, "chatHistory:rename");
    chatRenameConversation(parsed.id, parsed.title);
  }),
);

ipcMain.handle("chatHistory:pin", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatPinSchema, input, "chatHistory:pin");
    chatSetConversationPinned(parsed.id, parsed.pinned);
  }),
);

ipcMain.handle("chatHistory:setModel", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatModelSchema, input, "chatHistory:setModel");
    chatSetConversationModel(parsed.id, parsed.model);
  }),
);

ipcMain.handle("chatHistory:delete", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatConversationIdSchema, input, "chatHistory:delete");
    chatDeleteConversation(parsed.id);
  }),
);

ipcMain.handle("chatHistory:appendMessage", async (event, input: unknown) =>
  withTrustedSender(event, () =>
    chatAppendMessage(parseIpc(ChatAppendMessageSchema, input, "chatHistory:appendMessage")),
  ),
);

ipcMain.handle("chatHistory:messages", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatGetMessagesSchema, input, "chatHistory:messages");
    return chatGetMessages(parsed.conversationId, parsed.limit);
  }),
);

ipcMain.handle("chatHistory:searchMessages", async (event, input: unknown) =>
  withTrustedSender(event, async () => {
    const parsed = parseIpc(ChatSearchMessagesSchema, input, "chatHistory:searchMessages");
    const ftsHits = chatSearchMessages(parsed.query, {
      limit: parsed.limit,
      conversationId: parsed.conversationId,
    });
    const semanticHits = await semanticSearchMessages(parsed.query, {
      limit: parsed.limit,
      conversationId: parsed.conversationId,
    });
    return mergeSearchHits(ftsHits, semanticHits, parsed.limit ?? 25);
  }),
);

ipcMain.handle("chatHistory:backfillEmbeddings", async (event) =>
  withTrustedSender(event, async () => backfillMessageEmbeddings()),
);

// ─── IPC: Pyodide downloader ─────────────────────────────────────────────────

import * as pyodideDownloader from "./pyodide-downloader";

ipcMain.handle("pyodide:status", async (event) =>
  withTrustedSender(event, async () => pyodideDownloader.getPyodideStatus()),
);

ipcMain.handle("pyodide:download", async (event) =>
  withTrustedSender(event, async () => pyodideDownloader.downloadPyodide()),
);

ipcMain.handle("pyodide:cancel", async (event) =>
  withTrustedSender(event, async () => {
    pyodideDownloader.cancelPyodideDownload();
  }),
);

ipcMain.handle("pyodide:version", async (event) =>
  withTrustedSender(event, async () => pyodideDownloader.getPyodideVersion()),
);

// Fan progress to every renderer so the settings UI can show a real bar.
pyodideDownloader.onPyodideDownloadProgress((progress) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("pyodide:progress", progress);
  }
});

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

ipcMain.handle("duckdb:runReadOnlyQuery", async (event, sql: string) =>
  withBoundedHeavyQuery(event, "duckdb:runReadOnlyQuery", async () => {
    const safeSql = parseIpc(SqlSchema, sql, "duckdb:runReadOnlyQuery");

    // utilityProcess isolation (OFF by default; DN_DUCKDB_UTILITY=1). When
    // enabled, route the read through the isolated process; on ANY broker error
    // fall back to the unchanged in-main path so behavior never regresses.
    // The utility engine is :memory: with no catalog views by construction,
    // so view-backed queries (ds_*) can never succeed there — run them
    // in-main directly instead of failing-then-retrying every time.
    const hitsDatasetView = /\bds_[A-Za-z0-9_-]{8,32}\b/.test(safeSql);
    if (duckdbUtilityBroker.isEnabled() && !hitsDatasetView) {
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

ipcMain.handle("llama:preloadWarmPrefix", async (event, input?: { systemPrefix: string }) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(LlamaPreloadWarmPrefixSchema, input, "llama:preloadWarmPrefix");
    return llamaService.preloadWarmPrefix(parsed.systemPrefix);
  }),
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

// ─── IPC: node-llama-cpp Embedding Service ────────────────────────────────────
// Embeddings lane (electron/embedding-service.ts) — own model and context on
// the shared Llama backend with the `llama:*` generative lane above. Both lanes
// serialize through one native queue. Reached via `window.electronEmbed.*`.
// Plain request/response invokes (embeddings aren't streamed token-by-token);
// `embed:abort` cancels by requestId.

const embedAbortControllers = new Map<string, AbortController>();

ipcMain.handle("embed:ensureModel", async (event, input?: { file?: string }) =>
  withTrustedSender(event, () =>
    embeddingService.ensureEmbedModel(
      parseIpc(EmbedEnsureModelSchema, input, "embed:ensureModel")?.file,
    ),
  ),
);

ipcMain.handle("embed:one", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(EmbedOneSchema, input, "embed:one");
    const requestId = parsed.requestId;
    const controller = new AbortController();
    if (requestId) embedAbortControllers.set(requestId, controller);

    return embeddingService.embedOne(parsed.text, controller.signal).finally(() => {
      if (requestId) embedAbortControllers.delete(requestId);
    });
  }),
);

ipcMain.handle("embed:batch", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(EmbedBatchSchema, input, "embed:batch");
    const requestId = parsed.requestId;
    const controller = new AbortController();
    if (requestId) embedAbortControllers.set(requestId, controller);

    return embeddingService.embedBatch(parsed.texts, controller.signal).finally(() => {
      if (requestId) embedAbortControllers.delete(requestId);
    });
  }),
);

ipcMain.handle("embed:abort", async (event, requestId: string) =>
  withTrustedSender(event, () => {
    parseIpc(RequestIdSchema, requestId, "embed:abort");
    const controller = embedAbortControllers.get(requestId);
    if (controller) {
      controller.abort();
      embedAbortControllers.delete(requestId);
      return true;
    }
    return false;
  }),
);

// ─── IPC: Moudir Chat Session Runtime ─────────────────────────────────────────
// Live per-conversation LlamaChatSession (chat-session-service.ts). Prompt
// tokens stream on "chat:token" and tool invocations on "chat:tool", both
// keyed by the caller's requestId; "chat:abort" cancels by id (same pattern as
// llama:* / models:*).

const chatAbortControllers = new Map<string, AbortController>();

ipcMain.handle("chat:open", async (event, input: unknown) => {
  const out = await withTrustedSender(event, () =>
    chatSessionService.openSession(parseIpc(ChatOpenSchema, input, "chat:open")),
  );
  return out;
});

ipcMain.handle("chat:prompt", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatPromptSchema, input, "chat:prompt");
    const requestId = parsed.requestId;
    const controller = new AbortController();
    if (requestId) chatAbortControllers.set(requestId, controller);

    return chatSessionService
      .promptSession({
        conversationId: parsed.conversationId,
        text: parsed.text,
        requestId,
        signal: controller.signal,
        onToken: requestId
          ? (chunk) => {
              if (!event.sender.isDestroyed()) {
                event.sender.send("chat:token", { requestId, chunk });
              }
            }
          : undefined,
        onTool: requestId
          ? (toolEvent) => {
              if (!event.sender.isDestroyed()) {
                event.sender.send("chat:tool", { requestId, event: toolEvent });
              }
            }
          : undefined,
        onToolStart: requestId
          ? (toolEvent) => {
              if (!event.sender.isDestroyed()) {
                event.sender.send("chat:tool", { requestId, event: toolEvent });
              }
            }
          : undefined,
      })
      .then((res) => {
        return res;
      })
      .finally(() => {
        if (requestId) chatAbortControllers.delete(requestId);
      });
  }),
);

ipcMain.handle("chat:abort", async (event, requestId: string) =>
  withTrustedSender(event, () => {
    parseIpc(RequestIdSchema, requestId, "chat:abort");
    const controller = chatAbortControllers.get(requestId);
    if (controller) {
      controller.abort();
      chatAbortControllers.delete(requestId);
      return true;
    }
    return false;
  }),
);

ipcMain.handle("chat:preload", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatPreloadSchema, input, "chat:preload");
    return chatSessionService.preloadSessionPrompt(parsed.conversationId, parsed.text);
  }),
);

ipcMain.handle("chat:history", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatSessionIdSchema, input, "chat:history");
    return chatSessionService.getSessionHistory(parsed.conversationId);
  }),
);

ipcMain.handle("chat:title", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatSessionIdSchema, input, "chat:title");
    return chatSessionService.generateTitle(parsed.conversationId);
  }),
);

ipcMain.handle("chat:followups", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatSessionIdSchema, input, "chat:followups");
    return chatSessionService.suggestFollowUps(parsed.conversationId);
  }),
);

ipcMain.handle("chat:dispose", async (event, input: unknown) =>
  withTrustedSender(event, () => {
    const parsed = parseIpc(ChatSessionIdSchema, input, "chat:dispose");
    return chatSessionService.disposeSession(parsed.conversationId);
  }),
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

ipcMain.handle("collabHub:start", async (event, input?: collabHubService.CollabHubStartInput) => {
  const result = await withTrustedSender(event, () =>
    collabHubService.start(parseIpc(CollabStartSchema, input, "collabHub:start")),
  );
  // Enable remote access in the Next.js middleware if the hub started successfully.
  if (result.running) {
    process.env.NEXT_PUBLIC_LAN_ALLOW_REMOTE = "1";
  }
  return result;
});

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

ipcMain.handle("collabHub:getHostSecret", async (event) =>
  withTrustedSender(event, () => collabHubService.getHostSecret()),
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

  // Workaround for Electron upstream issue #48859 ("ready-to-show not triggering on Wayland"):
  // Under native Wayland in Electron 38+, a window created with `show: false` may not commit
  // its surface until `show()` is called, causing `ready-to-show` to deadlock and leaving
  // the window invisible. Show on the first of `ready-to-show`, `did-finish-load`, `did-fail-load`,
  // or a 2-second timeout.
  let isWindowShown = false;
  const showWindow = () => {
    if (!isWindowShown && mainWindow && !mainWindow.isDestroyed()) {
      isWindowShown = true;
      mainWindow.show();
    }
  };

  mainWindow.once("ready-to-show", showWindow);
  mainWindow.webContents.once("did-finish-load", showWindow);
  mainWindow.webContents.once(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.warn(`[electron] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
      showWindow();
    },
  );
  setTimeout(showWindow, 2000);

  // ─── Navigation hardening ──────────────────────────────────────────────────
  // The renderer must never spawn new windows or navigate cross-origin. Deny all
  // window.open (route real external https links to the OS browser); restrict
  // in-window navigation/redirects to the local app origin + the OAuth protocol;
  // refuse webview attachment outright.
  const isAllowedNavigation = (target: string): boolean => {
    if (target.startsWith("/")) return true;
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
    void installReactDevTools();

    const devPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    await mainWindow.loadURL(`http://localhost:${devPort}/dashboard`);
    mainWindow.webContents.openDevTools();
  } else {
    // Register fail-retry listener before loading any URL
    let loadRetries = 0;
    const MAX_LOAD_RETRIES = 5;

    mainWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
        if (loadRetries >= MAX_LOAD_RETRIES) {
          console.error(
            `[electron] Failed to load ${validatedURL} after ${MAX_LOAD_RETRIES} retries: ${errorDescription} (code ${errorCode})`,
          );
          dialog.showErrorBox(
            "Data Navigator failed to load",
            `The application window could not load ${validatedURL}.\n\n` +
              `${errorDescription} (code ${errorCode})\n\n` +
              `See boot.log in the app data folder for details.`,
          );
          app.quit();
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

    try {
      const serverUrl = await startNextJSServer();
      console.log("[electron] Next.js server started at:", serverUrl);

      // Use 127.0.0.1 explicitly to eliminate IPv6 ::1 lookup failure against 0.0.0.0 IPv4 listener
      const parsedServerUrl = new URL(serverUrl);
      const host =
        parsedServerUrl.hostname === "localhost" || parsedServerUrl.hostname === "0.0.0.0"
          ? "127.0.0.1"
          : parsedServerUrl.hostname;
      const origin = `${parsedServerUrl.protocol}//${host}:${parsedServerUrl.port || "3000"}`;

      // Wait up to 10 seconds for the HTTP server to accept requests
      const healthCheckUrl = `${origin}/`;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          const res = await fetch(healthCheckUrl);
          if (res.status) break;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      // Boot straight into the product, not the marketing landing (blueprint §7).
      const dashboardUrl = new URL("/dashboard", origin).toString();
      await mainWindow.loadURL(dashboardUrl).catch((loadErr) => {
        console.warn(
          "[electron] initial mainWindow.loadURL rejected:",
          loadErr?.message ?? loadErr,
        );
      });
    } catch (error) {
      console.error("[electron] Error starting Next.js server:", error);
      dialog.showErrorBox(
        "Data Navigator failed to start",
        `The local application server could not start, so the app cannot open.\n\n` +
          `${error instanceof Error ? error.message : String(error)}\n\n` +
          `See boot.log in the app data folder for details.`,
      );
      app.quit();
    }
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Next.js Server ──────────────────────────────────────────────────────────

async function startNextJSServer(): Promise<string> {
  try {
    bootLog("startNextJSServer: begin");
    const nextJSPort = await resolveAppPort({ isPackaged: app.isPackaged });
    currentServerPort = nextJSPort;
    bootLog(
      `selected application port: ${nextJSPort} (range ${PROD_PORT_RANGE.start}-${PROD_PORT_RANGE.end})`,
    );

    const serverOrigin = `http://127.0.0.1:${nextJSPort}`;
    const localhostOrigin = `http://localhost:${nextJSPort}`;

    // The server must listen on all interfaces to be reachable by LAN peers when
    // collaboration is enabled. Access control is enforced by src/proxy.ts.
    const bindAddress = "0.0.0.0";

    const webDir = path.join(app.getAppPath(), "app");

    process.env.BETTER_AUTH_URL = serverOrigin;
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = serverOrigin;
    process.env.APP_USER_DATA = app.getPath("userData");
    process.env.PORT = nextJSPort.toString();
    process.env.HOSTNAME = bindAddress;

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
      serverOrigin,
      localhostOrigin,
      `http://localhost:${nextJSPort}`,
      `http://127.0.0.1:${nextJSPort}`,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      // Exact custom-protocol origin only — the `://*` wildcard widened trusted
      // redirect targets (open-redirect sink for the OAuth callback).
      `${ELECTRON_AUTH_PROTOCOL}://`,
    ];
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = Array.from(new Set(trustedOrigins)).join(",");

    const standaloneServerScript = path.join(webDir, "server.js");
    if (existsSync(standaloneServerScript)) {
      bootLog(`starting standalone Next.js server via ${standaloneServerScript}`);
      process.env.PORT = nextJSPort.toString();
      process.env.HOSTNAME = bindAddress;
      const originalChdir = process.chdir;
      process.chdir = (dir: string) => {
        try {
          return originalChdir.call(process, dir);
        } catch (err: any) {
          if (err && (err.code === "ENOTDIR" || err.code === "ENOENT")) {
            return;
          }
          throw err;
        }
      };
      require(standaloneServerScript);
    } else {
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
      bootLog(`startServerEntry=${startServerEntry}`);
      const { startServer } = require(startServerEntry) as { startServer: typeof StartServerFn };
      await startServer({
        dir: webDir,
        isDev: false,
        hostname: bindAddress,
        port: nextJSPort,
        allowRetry: false,
        keepAliveTimeout: 5000,
      });
    }

    bootLog(`startServer invoked; target is ${serverOrigin}`);
    return serverOrigin;
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
    // Ensure the host secret is consistent across all processes (main, hub, and Next server).
    // The renderer retrieves this via the collabHub:getHostSecret IPC.
    process.env.DATA_NAVIGATOR_HOST_SECRET = collabHubService.getHostSecret();

    // Production hardening preflight. The fuses themselves are flipped at package
    // time by electron-builder from PRODUCTION_FUSE_CONFIG (electron-builder.config.ts);
    // this is a runtime assertion that, when packaged, ELECTRON_RUN_AS_NODE is
    // disabled (RunAsNode:false) so the binary cannot be coerced into a generic
    // Node runtime. If a future build drops the plugin, this surfaces it in logs.
    if (app.isPackaged && PRODUCTION_FUSE_CONFIG.RunAsNode) {
      console.warn(
        "[electron] ELECTRON_RUN_AS_NODE is set in a packaged build — fuses may not be enforced.",
      );
    }

    // In dev mode, if .data/auth.db does not exist yet but Electron's userData/databases/auth.db exists,
    // seamlessly copy it over so developer accounts and sessions are preserved.
    if (!app.isPackaged) {
      const devAuthDb = path.join(DATABASES_DIR, "auth.db");
      const legacyUserDataAuthDb = path.join(app.getPath("userData"), "databases", "auth.db");
      if (!existsSync(devAuthDb) && existsSync(legacyUserDataAuthDb)) {
        try {
          mkdirSync(DATABASES_DIR, { recursive: true });
          copyFileSync(legacyUserDataAuthDb, devAuthDb);
          if (existsSync(`${legacyUserDataAuthDb}-wal`)) {
            copyFileSync(`${legacyUserDataAuthDb}-wal`, `${devAuthDb}-wal`);
          }
          if (existsSync(`${legacyUserDataAuthDb}-shm`)) {
            copyFileSync(`${legacyUserDataAuthDb}-shm`, `${devAuthDb}-shm`);
          }
          bootLog(
            `auth-store: migrated existing auth.db from ${legacyUserDataAuthDb} to ${devAuthDb}`,
          );
        } catch (err) {
          bootLog(`auth-store: failed to copy legacy auth.db: ${err}`);
        }
      }
    }

    // Bring up the per-domain settings/analytics databases and lift any legacy
    // app_setting rows out of the auth DB exactly once — BEFORE createWindow loads
    // the renderer (which talks to them over the settings: IPC channels). Done here
    // rather than in startNextJSServer so it also runs in dev, where the renderer is
    // served by an external `next dev` and startNextJSServer never runs.
    configureSettingsStore(DATABASES_DIR);
    configureChatStore(DATABASES_DIR);
    configureAuthStore(DATABASES_DIR);
    // The packaged app's cwd is the install root (read-only on macOS/Linux), so the
    // drizzle migrations must be resolved out of the asar. The DEFAULT_MIGRATIONS_FOLDER
    // in each store is `<cwd>/drizzle/...` which works for `pnpm dev`; the packaged
    // app must override to `<appPath>/drizzle/...` so migrations resolve inside the
    // asar. (See the bug audit in `docs/audit*.md` — this is the fix for the
    // "no such table" error after install.)
    //
    // Guarded on app.isPackaged: in dev, app.getAppPath() is the dir containing
    // main.js (build/), not the project root, so an unconditional override here
    // points the migrator at a non-existent build/drizzle/... and rejects the
    // whenReady chain before createWindow() runs — dev launches with no window.
    // Do NOT remove this guard without also fixing DEFAULT_MIGRATIONS_FOLDER.
    if (app.isPackaged) {
      setAuthMigrationsFolder(path.join(app.getAppPath(), "drizzle"));
      setSettingsMigrationsFolder(path.join(app.getAppPath(), "drizzle", "settings"));
      setChatMigrationsFolder(path.join(app.getAppPath(), "drizzle", "chat"));
    }
    // In dev, DEFAULT_MIGRATIONS_FOLDER (<cwd>/drizzle/...) is correct because
    // pnpm launches electron from the project root.

    // Cross-module wiring: chat-store fires onMessageAppended →
    // semantic-search indexer writes the embedding row in the same SQLite
    // handle so chat row + embedding row live in one WAL.
    setChatSemanticSearchHandle(getChatStoreHandle());
    onChatMessageAppended((row) => {
      // Background-fire; never block the IPC thread on embedding latency.
      void appendMessageEmbedding({
        messageId: row.id,
        conversationId: row.conversationId,
        content: row.content,
      }).catch((error: unknown) => {
        if (typeof console !== "undefined") {
          console.warn("[chat-semantic-search] embed hook failed:", error);
        }
      });
    });

    try {
      const legacyPath = path.join(app.getPath("userData"), "data", "data-navigator-auth.sqlite");
      const currentPath = path.join(DATABASES_DIR, "auth.db");
      const authDbPath = existsSync(legacyPath) ? legacyPath : currentPath;
      const { migrated } = migrateLegacyAppSettings(authDbPath);
      bootLog(`settings-store: ready at ${DATABASES_DIR}; settings lift migrated ${migrated} rows`);
    } catch (error) {
      bootLog(
        `settings-store: init/migration error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // `pyodide://host/<path>` serves files from <userData>/pyodide/ so the
    // renderer can load Pyodide fully offline.
    protocol.handle("pyodide", async (request) => {
      try {
        const url = new URL(request.url);
        const root = path.resolve(pyodideDownloader.getPyodideInstallPath());
        const target = path.resolve(root, "." + url.pathname);
        if (!target.startsWith(root + path.sep) && target !== root) {
          return new Response("forbidden", { status: 403 });
        }
        const data = await readFile(target);
        const lower = target.toLowerCase();
        const mime =
          lower.endsWith(".mjs") || lower.endsWith(".js")
            ? "application/javascript"
            : lower.endsWith(".wasm")
              ? "application/wasm"
              : lower.endsWith(".json")
                ? "application/json"
                : lower.endsWith(".zip") || lower.endsWith(".tar")
                  ? "application/octet-stream"
                  : "application/octet-stream";
        return new Response(data, {
          headers: {
            "content-type": mime,
            "cache-control": "no-store",
            // Module + fetch loads from the opaque-origin sandbox iframe require CORS.
            "access-control-allow-origin": "*",
          },
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          (error as { code: string }).code === "ENOENT"
        ) {
          return new Response("not found", { status: 404 });
        }
        return new Response("error", { status: 500 });
      }
    });
    try {
      const { migrated } = migrateLegacyAnalyticsSnapshotKV();
      bootLog(`settings-store: analytics snapshot history lift migrated ${migrated} rows`);
    } catch (error) {
      bootLog(
        `settings-store: analytics snapshot history lift error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    installMediaPermissionHandlers();

    session.defaultSession.webRequest.onErrorOccurred((details) => {
      console.warn(
        `[electron:webRequest:error] url=${details.url} error=${details.error} type=${details.resourceType}`,
      );
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      try {
        callback({
          responseHeaders: withRendererSecurityHeaders(details.responseHeaders, {
            dev: isDev,
            enforceCsp: true,
            port: currentServerPort,
          }),
        });
      } catch (err) {
        console.error("[electron:onHeadersReceived:error]", err);
        callback({ responseHeaders: details.responseHeaders });
      }
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
    try {
      await session.defaultSession.clearStorageData({
        storages: ["serviceworkers", "cachestorage"],
      });
      bootLog("whenReady: cleared service workers and cache storage");
    } catch (e) {
      console.warn("[electron] failed to clear service worker storage:", e);
    }
    await syncSessionCookie(null);
    await createWindow();
    bootLog("whenReady: createWindow() returned");

    // ── OS Lock & Sleep Auto-Lock (Bitwarden / 1Password desktop pattern) ──
    try {
      powerMonitor.on("lock-screen", async () => {
        if (!authIsAppLocked()) {
          clearMidnightTimer();
          authLockApp();
          currentActiveToken = null;
          await syncSessionCookie(null);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("auth:lock-changed", true);
          }
        }
      });

      powerMonitor.on("suspend", async () => {
        if (!authIsAppLocked()) {
          clearMidnightTimer();
          authLockApp();
          currentActiveToken = null;
          await syncSessionCookie(null);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("auth:lock-changed", true);
          }
        }
      });

      powerMonitor.on("resume", async () => {
        if (currentActiveToken) {
          const sessionRes = authGetSession(currentActiveToken);
          if (!sessionRes.session || sessionRes.isLocked) {
            clearMidnightTimer();
            authLockApp();
            currentActiveToken = null;
            await syncSessionCookie(null);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("auth:session-expired");
              mainWindow.webContents.send("auth:lock-changed", true);
            }
          }
        }
      });
    } catch (err) {
      console.warn("[electron] powerMonitor subscription warning:", err);
    }

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

  chatSessionService
    .disposeAll()
    .then(() => embeddingService.dispose())
    .then(() => llamaService.dispose())
    .catch((error) => {
      console.error("[electron] llama cleanup error:", error);
    });

  collabHubService.dispose().catch((error) => {
    console.error("[electron] collab-hub cleanup error:", error);
  });

  // Flush WAL + close the settings/analytics/chat/auth SQLite handles cleanly.
  closeSettingsStore();
  closeChatStore();
  closeAuthStore();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
