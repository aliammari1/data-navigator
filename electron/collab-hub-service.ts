/**
 * LAN Collaboration Hub — Electron MAIN process edition (OPTIONAL in-app hub).
 *
 * Mental model (mirrors duckdb-service.ts):
 * - The DEFAULT offline collab path stays renderer + `scripts/lan-server.mjs`
 *   (zero new deps). This service is the opt-in upgrade: an embedded
 *   `@hocuspocus/server` LAN hub (so no separate terminal) with SQLite
 *   persistence + `bonjour-service` mDNS auto-discovery — all in the main
 *   process, behind IPC (`collabHub:*`). The renderer connects to it as an
 *   ordinary `y-websocket` client (the collab-client agent owns that side).
 * - @hocuspocus/server + bonjour-service pull in Node APIs and MUST NOT be
 *   imported in the renderer. They are lazy-imported here so the cost is only
 *   paid when the hub is actually started.
 * - SQLite + mDNS advertise/discover, pairing-code auth, read-only
 *   reviewer/viewer roles — matching the existing `lan-server.mjs` contract.
 *
 * Public API (exposed over IPC as window.electronCollab.*):
 * - start()       — boot the embedded hub + begin mDNS advertise
 * - stop()        — destroy the hub + stop advertising
 * - status()      — running?, port, pairing code, LAN URLs
 * - discover()    — list mDNS-discovered peer hubs (ws:// candidates)
 * - getDiscovered()
 *
 * HTTP sidecar (feature parity with scripts/lan-server.mjs): the hub also
 * answers GET /lan/status (+ /lan/discover), GET /lan/audit, GET/POST
 * /lan/files (pairing-code-gated inbox uploads), and serves a branded join
 * landing page on every other GET — replacing Hocuspocus's default
 * "Welcome to Hocuspocus!" response. See `handleSidecarRequest` below.
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import {
  deriveRoleFromCodes,
  generatePairingCode,
  pairingCodesMatch,
  parseCollabToken,
} from "./collab-pairing";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CollabHubStartInput = {
  port?: number;
  pairingCode?: string;
  /** Read-only guest code. Generated when omitted. */
  guestCode?: string;
  room?: string;
  /** Advertise this hub over mDNS so peers can auto-discover it. */
  advertise?: boolean;
  /** Begin browsing for peer hubs over mDNS on start. */
  discover?: boolean;
};

export type CollabHubStatus = {
  running: boolean;
  port: number | null;
  pairingCode: string | null;
  /** Share this one with view-only guests — it can never grant write access. */
  guestCode: string | null;
  room: string | null;
  advertising: boolean;
  discovering: boolean;
  /** ws:// URLs this host is reachable on (one per LAN IPv4 NIC). */
  websocketUrls: string[];
  ips: Array<{ name: string; address: string }>;
  dbPath: string | null;
  startedAt: string | null;
};

export type DiscoveredHub = {
  name: string;
  host: string;
  port: number;
  /** ws:// URL built from the first IPv4 address. */
  url: string;
  addresses: string[];
  room?: string;
  pairingRequired: boolean;
};

/** Sink for discovery events → wired in main.ts to `webContents.send`. */
export type DiscoveryListener = (event: { type: "up" | "down"; hub: DiscoveredHub }) => void;

// Minimal structural types so this file does not need the hocuspocus/bonjour
// type packages at compile time (they are lazy-imported as `unknown`).
type HocuspocusServer = {
  listen(port?: number): Promise<unknown> | unknown;
  destroy(): Promise<unknown> | unknown;
  // Underlying node:http server — needed to catch the raw 'error' event
  // (EADDRINUSE) that Hocuspocus's own listen() promise never settles on.
  httpServer: {
    once(event: "error", listener: (err: NodeJS.ErrnoException) => void): unknown;
    off(event: "error", listener: (err: NodeJS.ErrnoException) => void): unknown;
  };
};
type BonjourInstance = {
  publish(opts: Record<string, unknown>): unknown;
  find(opts: Record<string, unknown>): BonjourBrowser;
  unpublishAll(cb?: () => void): void;
  destroy(): void;
};
type BonjourBrowser = {
  on(event: "up" | "down", cb: (svc: BonjourService) => void): void;
  stop?(): void;
};
type BonjourService = {
  name?: string;
  type?: string;
  port: number;
  host?: string;
  addresses?: string[];
  txt?: Record<string, string>;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_PORT = 1234;
// Matches scripts/lan-server.mjs's PORT_SCAN_LIMIT default — how many
// consecutive ports to try before giving up on EADDRINUSE.
const PORT_SCAN_LIMIT = 24;
const SERVICE_TYPE = "dn-collab"; // becomes _dn-collab._tcp
const SERVICE_NAME = "Data Navigator LAN";
const HUB_NAME = "data-navigator-hub";

// HTTP sidecar limits — keep in sync with scripts/lan-server.mjs.
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_INBOX_FILES = 200;
const AUDIT_LOG_LIMIT = 200;
const FILES_LIST_LIMIT = 100;
const STATUS_SLICE_LIMIT = 40;

// ─── Module state ───────────────────────────────────────────────────────────

let server: HocuspocusServer | null = null;
let bonjour: BonjourInstance | null = null;
let publishedService: unknown = null;
let browser: BonjourBrowser | null = null;

let activePort: number | null = null;
let activePairingCode: string | null = null;
let activeGuestCode: string | null = null;
let activeRoom: string | null = null;
let startedAt: string | null = null;
let dbPath: string | null = null;

const discovered = new Map<string, DiscoveredHub>();
let discoveryListener: DiscoveryListener | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function dataDir(): string {
  return path.join(app.getPath("userData"), "data-navigator", "collab");
}

function lanAddresses(): Array<{ name: string; address: string }> {
  const nets = os.networkInterfaces();
  const lans: Array<{ name: string; address: string }> = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        lans.push({ name, address: net.address });
      }
    }
  }
  return lans;
}

function websocketUrls(port: number): string[] {
  return lanAddresses().map((ip) => `ws://${ip.address}:${port}`);
}

/**
 * Boot `instance` with a port-scan retry on EADDRINUSE (mirrors
 * `listenWithPortScan` in scripts/lan-server.mjs). Hocuspocus's own
 * `Server.listen()` calls `httpServer.listen(...)` without attaching an
 * 'error' listener, so a bind failure never settles its returned promise —
 * left unguarded, the resulting unhandled 'error' event would crash the
 * process. We attach our own listener, bump the port and retry (bounded by
 * `attemptsRemaining`) on EADDRINUSE, and propagate any other error.
 * Resolves with the port that actually bound.
 */
function listenWithPortScan(
  instance: HocuspocusServer,
  port: number,
  attemptsRemaining: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err?.code === "EADDRINUSE" && attemptsRemaining > 0) {
        console.warn(`[collab-hub] Port ${port} is busy, retrying on ${port + 1}...`);
        listenWithPortScan(instance, port + 1, attemptsRemaining - 1).then(resolve, reject);
        return;
      }
      reject(err);
    };
    instance.httpServer.once("error", onError);
    Promise.resolve(instance.listen(port)).then(
      () => {
        instance.httpServer.off("error", onError);
        resolve(port);
      },
      (err) => {
        instance.httpServer.off("error", onError);
        reject(err);
      },
    );
  });
}

function pickIpv4(addresses: string[] | undefined): string | undefined {
  return addresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
}

function serviceKey(svc: BonjourService): string {
  return `${svc.name ?? svc.host ?? "hub"}:${svc.port}`;
}

function toDiscoveredHub(svc: BonjourService): DiscoveredHub | null {
  const ip = pickIpv4(svc.addresses) ?? svc.host;
  if (!ip) return null;
  return {
    name: svc.name ?? SERVICE_NAME,
    host: svc.host ?? ip,
    port: svc.port,
    url: `ws://${ip}:${svc.port}`,
    addresses: svc.addresses ?? [],
    room: svc.txt?.room,
    pairingRequired: svc.txt?.pairingRequired === "1",
  };
}

// ─── HTTP sidecar (discovery + file inbox + join landing page) ──────────────
// Feature parity with scripts/lan-server.mjs so `discoverLAN()` /
// `scanLANSubnet()` in src/platform/lan/lan-collab.ts parse either hub
// identically. EVERY sidecar response carries
// `Cross-Origin-Resource-Policy: cross-origin` — the renderer is
// COEP:require-corp isolated, so a missing CORP header makes the browser block
// the cross-origin discovery fetch (see discoverLAN()'s comment).

interface SidecarAuditEntry {
  id: string;
  at: string;
  event: string;
  [detail: string]: unknown;
}

interface SidecarFileEntry {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  type: string;
  room: string;
  peerId: string;
  peerName: string;
  receivedAt: string;
}

interface SidecarPeer {
  id: string;
  name: string;
  role: string;
  lastSeenAt: number;
}

/** Per-session mutable sidecar state, created on start() and captured by the hub hooks. */
export interface SidecarContext {
  name: string;
  room: string;
  /** Actual bound port — updated after a port-scan retry shifts it. */
  port: number;
  pairingCode: string;
  allowGuests: boolean;
  startedAt: string;
  inboxDir: string;
  maxFileBytes: number;
  maxInboxFiles: number;
  audit: SidecarAuditEntry[];
  files: SidecarFileEntry[];
  /** room → socketId → peer (mirrors lan-server.mjs's roomPeers). */
  roomPeers: Map<string, Map<string, SidecarPeer>>;
  counters: { inboxFiles: number };
}

export function createSidecarContext(input: {
  name: string;
  room: string;
  port: number;
  pairingCode: string;
  allowGuests: boolean;
  startedAt: string;
  inboxDir: string;
  maxFileBytes?: number;
  maxInboxFiles?: number;
}): SidecarContext {
  return {
    ...input,
    maxFileBytes: input.maxFileBytes ?? MAX_FILE_BYTES,
    maxInboxFiles: input.maxInboxFiles ?? MAX_INBOX_FILES,
    audit: [],
    files: [],
    roomPeers: new Map(),
    counters: { inboxFiles: 0 },
  };
}

function addAudit(ctx: SidecarContext, event: string, detail: Record<string, unknown> = {}): void {
  ctx.audit.unshift({ id: randomUUID(), at: new Date().toISOString(), event, ...detail });
  if (ctx.audit.length > AUDIT_LOG_LIMIT) ctx.audit.length = AUDIT_LOG_LIMIT;
}

function trackPeer(
  ctx: SidecarContext,
  room: string,
  socketId: string,
  peer: { id: string; name: string; role: string },
): void {
  let peers = ctx.roomPeers.get(room);
  if (!peers) {
    peers = new Map();
    ctx.roomPeers.set(room, peers);
  }
  peers.set(socketId, { ...peer, lastSeenAt: Date.now() });
}

function untrackPeer(ctx: SidecarContext, room: string, socketId: string): void {
  const peers = ctx.roomPeers.get(room);
  if (!peers) return;
  peers.delete(socketId);
  if (peers.size === 0) ctx.roomPeers.delete(room);
}

function roomSummaries(
  ctx: SidecarContext,
): Array<{ name: string; peers: SidecarPeer[]; connections: number }> {
  return [...ctx.roomPeers.entries()].map(([name, peers]) => ({
    name,
    peers: [...peers.values()],
    connections: peers.size,
  }));
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Every sidecar response: content-type + CORS + the REQUIRED CORP header. */
function sidecarHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, sidecarHeaders("application/json"));
  response.end(JSON.stringify(body, null, 2));
}

/** Mirror of lan-server.mjs's safeFileName — strips path/control characters. */
function safeFileName(name: string | undefined): string {
  return (
    String(name || "upload.bin")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "upload.bin"
  );
}

/** Discovery payload — structurally matches lan-server.mjs's /lan/status. */
function sidecarStatusPayload(ctx: SidecarContext): Record<string, unknown> {
  const ips = lanAddresses();
  return {
    ok: true,
    name: ctx.name,
    // The embedded hub binds all interfaces (Hocuspocus Server default).
    host: "0.0.0.0",
    port: ctx.port,
    pairingRequired: true,
    allowGuests: ctx.allowGuests,
    ips,
    websocketUrls: ips.map((ip) => `ws://${ip.address}:${ctx.port}`),
    httpUrls: ips.map((ip) => `http://${ip.address}:${ctx.port}`),
    rooms: roomSummaries(ctx),
    audit: ctx.audit.slice(0, STATUS_SLICE_LIMIT),
    files: ctx.files.slice(0, STATUS_SLICE_LIMIT),
    maxFileBytes: ctx.maxFileBytes,
    inboxDir: ctx.inboxDir,
    startedAt: ctx.startedAt,
  };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/**
 * Branded join landing page — what a phone/browser lands on after scanning the
 * join QR (`makeJoinHttpUrl` in src/platform/lan/lan-collab.ts puts ?room= and
 * ?code= on the URL). Replaces Hocuspocus's default "Welcome to Hocuspocus!"
 * page. Self-contained: inline CSS + a tiny inline script, no external assets.
 * SECURITY: the server never embeds its own codes here — the script only echoes
 * back the ?code= the visitor already holds (the host handed them the QR).
 */
/**
 * Retrieve or generate the persistent host secret used to sign/verify guest
 * invitations and session tokens. In Electron, this is the canonical source
 * of truth; the renderer retrieves it via IPC to ensure consistency.
 */
let ephemeralHostSecret: string | null = null;

export function getHostSecret(): string {
  const HOST_SECRET_ENV = "DATA_NAVIGATOR_HOST_SECRET";
  const fromEnv = process.env[HOST_SECRET_ENV];
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (!ephemeralHostSecret) {
    ephemeralHostSecret = randomBytes(32).toString("base64url");
  }
  return ephemeralHostSecret;
}

interface PendingGuestRecord {
  id: string;
  name: string;
  role: string;
  pairingCode: string;
  room: string;
  hostUrl: string;
  requestedAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "denied";
  approvedRole?: string;
  sessionToken?: string;
  timer?: NodeJS.Timeout;
}

const memoryGuests = new Map<string, PendingGuestRecord>();

function pruneMemoryGuests(): void {
  const now = Date.now();
  for (const [id, guest] of memoryGuests.entries()) {
    if (guest.expiresAt <= now) {
      if (guest.timer) clearTimeout(guest.timer);
      memoryGuests.delete(id);
    }
  }
}

async function verifyInviteToken(
  token: string,
  secret: string,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; reason: string }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { ok: false, reason: "invalid format" };
    }
    const [headerB64, payloadB64, sigB64] = parts;

    const signingInput = `${headerB64}.${payloadB64}`;
    const hmac = createHmac("sha256", secret);
    hmac.update(signingInput);
    const expectedSig = hmac
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sigBuf = Buffer.from(sigB64);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return { ok: false, reason: "signature mismatch" };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (payload.iss !== "data-navigator" || payload.aud !== "guest-invite") {
      return { ok: false, reason: "invalid issuer or audience" };
    }
    if (typeof payload.exp === "number" && payload.exp < Date.now()) {
      return { ok: false, reason: "expired" };
    }

    return { ok: true, payload };
  } catch (err) {
    console.error("[verifyInviteToken] Error:", err);
    return { ok: false, reason: "verification error" };
  }
}

function createPendingGuest(input: {
  name: string;
  role: string;
  pairingCode: string;
  room: string;
  hostUrl: string;
}): PendingGuestRecord {
  pruneMemoryGuests();
  const PENDING_TTL_MS = 5 * 60 * 1000;
  const now = Date.now();
  const id = randomUUID();
  const timer = setTimeout(() => {
    memoryGuests.delete(id);
  }, PENDING_TTL_MS);

  const guest: PendingGuestRecord = {
    id,
    name: input.name,
    role: input.role,
    pairingCode: input.pairingCode,
    room: input.room,
    hostUrl: input.hostUrl,
    requestedAt: now,
    expiresAt: now + PENDING_TTL_MS,
    status: "pending",
    timer,
  };

  memoryGuests.set(id, guest);
  if (memoryGuests.size > 100) {
    const oldestKey = memoryGuests.keys().next().value;
    if (oldestKey) {
      const g = memoryGuests.get(oldestKey);
      if (g?.timer) clearTimeout(g.timer);
      memoryGuests.delete(oldestKey);
    }
  }
  return guest;
}

function invitePageHtml(props: { room: string; token: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Join LAN Session — data navigator</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2937; --muted: #6b7280; --primary: #3b82f6; --primary-fg: #ffffff; --border: #e5e7eb; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111827; --fg: #f9fafb; --muted: #9ca3af; --border: #374151; } }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--fg); max-width: 28rem; margin: 4rem auto; padding: 1.5rem; line-height: 1.5; }
  .card { border: 1px solid var(--border); padding: 2rem; border-radius: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.5rem; }
  p { color: var(--muted); margin: 0 0 1.5rem; font-size: 0.875rem; }
  .field { margin-bottom: 1rem; }
  label { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 0.25rem; }
  input { width: 100%; box-sizing: border-box; padding: 0.625rem 0.75rem; border: 1px solid var(--border); border-radius: 0.375rem; background: var(--bg); color: var(--fg); font-size: 1rem; }
  button { width: 100%; padding: 0.75rem; background: var(--primary); color: var(--primary-fg); border: none; border-radius: 0.375rem; font-weight: 600; cursor: pointer; margin-top: 0.5rem; }
  button:hover { opacity: 0.9; }
</style>
</head>
<body>
  <div class="card">
    <h1>Join LAN Session</h1>
    <p>Enter your name and the pairing code shown on the host's screen to join <strong>${props.room}</strong>.</p>
    <form method="POST" action="/guest/join">
      <input type="hidden" name="token" value="${props.token}" />
      <div class="field">
        <label for="name">Your Name</label>
        <input type="text" id="name" name="name" required placeholder="e.g. Alice" autofocus />
      </div>
      <div class="field">
        <label for="pairingCode">Pairing Code</label>
        <input type="text" id="pairingCode" name="pairingCode" required placeholder="6-digit code" inputmode="numeric" pattern="[0-9]*" />
      </div>
      <button type="submit">Request Access</button>
    </form>
  </div>
</body>
</html>`;
}

function inviteErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Error — data navigator</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 1.5rem; line-height: 1.5; text-align: center; }
  h1 { font-size: 1.25rem; margin-bottom: 1rem; }
  p { color: #6b7280; }
  .back { display: inline-block; margin-top: 2rem; color: #3b82f6; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
  <h1>Cannot Join Session</h1>
  <p>${message}</p>
  <a href="/" class="back">View Instructions</a>
</body>
</html>`;
}

function inviteSuccessHtml(id: string): string {
  const dashboardPort = process.env.PORT || "3000";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Waiting for Approval — data navigator</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 1.5rem; line-height: 1.5; text-align: center; }
  .spinner { display: inline-block; width: 2rem; height: 2rem; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1.5rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
  p { color: #6b7280; }
  .status { margin-top: 1rem; font-weight: 600; color: #3b82f6; }
</style>
</head>
<body>
  <div class="spinner"></div>
  <h1>Request Sent!</h1>
  <p>Please wait while the host approves your request.</p>
  <div id="poll-status" class="status">Waiting for host...</div>

  <script>
    const id = "${id}";
    const dashboardPort = "${dashboardPort}";
    async function poll() {
      try {
        const res = await fetch("/guest/status?id=" + id);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "approved") {
          document.getElementById("poll-status").textContent = "Approved! Redirecting...";
          const host = window.location.hostname;
          window.location.href = "http://" + host + ":" + dashboardPort + "/guest/waiting?id=" + id;
        } else if (data.status === "denied") {
          document.getElementById("poll-status").textContent = "Request denied by host.";
          document.querySelector(".spinner").style.display = "none";
        }
      } catch (e) {}
    }
    setInterval(poll, 2000);
    poll();
  </script>
</body>
</html>`;
}

function landingPageHtml(room: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Data Navigator — LAN session</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(80rem 40rem at 50% -10%, #1e293b, #0b1220);
    color: #e2e8f0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 26rem; width: 100%; padding: 2.5rem 1.5rem; }
  .brand { font-size: .8rem; letter-spacing: .2em; text-transform: uppercase; color: #7dd3fc; margin: 0 0 .25rem; }
  h1 { font-size: 1.6rem; margin: 0 0 1.25rem; }
  .card { background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .2); border-radius: .75rem; padding: 1rem 1.25rem; margin: 0 0 1rem; }
  .label { font-size: .75rem; text-transform: uppercase; letter-spacing: .12em; color: #94a3b8; margin: 0 0 .35rem; }
  .label + .label, p + .label { margin-top: .75rem; }
  .value { font-size: 1.05rem; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
  .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.9rem; letter-spacing: .3em; color: #7dd3fc; }
  ol { margin: 0 0 1rem; padding-left: 1.25rem; line-height: 1.65; color: #cbd5e1; }
  .hint { font-size: .8rem; color: #64748b; margin: 0; }
</style>
</head>
<body>
<main>
  <p class="brand">Data Navigator</p>
  <h1>LAN session</h1>
  <div class="card">
    <p class="label">Server address</p>
    <p class="value" id="server"></p>
    <p class="label">Room</p>
    <p class="value" id="room">${escapeHtml(room)}</p>
  </div>
  <div class="card" id="code-card" hidden>
    <p class="label">Your access code</p>
    <p class="value code" id="code"></p>
  </div>
  <p class="label">How to join</p>
  <ol>
    <li>Open <strong>Data Navigator</strong> on your computer.</li>
    <li>Go to the <strong>LAN session</strong> screen.</li>
    <li>Enter this server address, the room, and your access code.</li>
  </ol>
  <p class="hint">Real-time sync happens in the desktop app — this page only shows your join details.</p>
</main>
<script>
  (function () {
    var params = new URLSearchParams(window.location.search);
    var room = params.get("room");
    var code = params.get("code");
    if (room) document.getElementById("room").textContent = room;
    if (code) {
      document.getElementById("code").textContent = code;
      document.getElementById("code-card").removeAttribute("hidden");
    }
    document.getElementById("server").textContent = window.location.host;
  })();
</script>
</body>
</html>
`;
}

/**
 * POST /lan/files body streamer — resolves once the response has been sent.
 * Ported from lan-server.mjs: size-capped, collision-proof stored name
 * (`wx` flag), metadata recorded for GET /lan/files and the audit log.
 */
async function streamInboxFile(
  request: IncomingMessage,
  response: ServerResponse,
  ctx: SidecarContext,
  peer: { peerId: string; peerName: string },
): Promise<void> {
  // Lazy: node:fs is only paid for when an upload actually happens.
  const fs = await import("node:fs");
  fs.mkdirSync(ctx.inboxDir, { recursive: true });
  const originalName = safeFileName(headerValue(request.headers, "x-file-name"));
  const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${originalName}`;
  const target = path.join(ctx.inboxDir, storedName);
  const out = fs.createWriteStream(target, { flags: "wx" });
  let size = 0;
  let rejected = false;

  await new Promise<void>((resolve) => {
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > ctx.maxFileBytes && !rejected) {
        rejected = true;
        request.destroy(new Error("File too large"));
        out.destroy();
        fs.rm(target, { force: true }, () => {});
      }
    });
    out.on("error", (error) => {
      // Disk failure (or wx collision) — surface it through the request's
      // error path so the client still gets a JSON response.
      if (!rejected) {
        rejected = true;
        request.destroy(error);
      }
    });
    request.pipe(out);
    out.on("finish", () => {
      if (rejected) return;
      ctx.counters.inboxFiles += 1;
      const entry: SidecarFileEntry = {
        id: randomUUID(),
        originalName,
        storedName,
        size,
        type: headerValue(request.headers, "content-type") ?? "application/octet-stream",
        room: headerValue(request.headers, "x-room") ?? "default",
        peerId: peer.peerId,
        peerName: peer.peerName,
        receivedAt: new Date().toISOString(),
      };
      ctx.files.unshift(entry);
      if (ctx.files.length > FILES_LIST_LIMIT) ctx.files.length = FILES_LIST_LIMIT;
      addAudit(ctx, "file.uploaded", { ...entry });
      sendJson(response, 200, { ok: true, file: entry });
      resolve();
    });
    request.on("error", (error: Error) => {
      addAudit(ctx, "file.upload_failed", {
        peerId: peer.peerId,
        peerName: peer.peerName,
        error: error.message,
      });
      if (!response.headersSent) {
        response.writeHead(size > ctx.maxFileBytes ? 413 : 500, sidecarHeaders("application/json"));
      }
      response.end(JSON.stringify({ ok: false, error: error.message }));
      resolve();
    });
  });
}

/**
 * POST /lan/files — AUTH RULE (mirrors lan-server.mjs exactly): only the FULL
 * pairing code authorizes an upload. The guest code is view-only and must
 * never be able to write files to the host's disk.
 */
async function receiveInboxFile(
  request: IncomingMessage,
  response: ServerResponse,
  ctx: SidecarContext,
): Promise<void> {
  const peerId = headerValue(request.headers, "x-peer-id") ?? "";
  const peerName = headerValue(request.headers, "x-peer-name") ?? "";
  const presented = headerValue(request.headers, "x-pairing-code");
  if (!pairingCodesMatch(ctx.pairingCode, presented)) {
    addAudit(ctx, "file.rejected_pairing", { peerId, peerName });
    sendJson(response, 401, { ok: false, error: "Pairing code required" });
    return;
  }
  if (ctx.counters.inboxFiles >= ctx.maxInboxFiles) {
    addAudit(ctx, "file.rejected_quota", { peerId, peerName, count: ctx.counters.inboxFiles });
    sendJson(response, 507, { ok: false, error: "Inbox file limit reached" });
    return;
  }
  await streamInboxFile(request, response, ctx, { peerId, peerName });
}

/**
 * HTTP sidecar router — every non-WebSocket request to the hub lands here via
 * the Hocuspocus `onRequest` hook. Exported for unit tests.
 * SECURITY: no branch may ever disclose the pairing/guest codes — they are the
 * sole access-control secrets for the room.
 */
export async function handleSidecarRequest(
  request: IncomingMessage,
  response: ServerResponse,
  ctx: SidecarContext,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (method === "OPTIONS") {
    response.writeHead(204, {
      ...sidecarHeaders("text/plain"),
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers":
        "content-type,x-file-name,x-peer-id,x-peer-name,x-room,x-pairing-code",
    });
    response.end();
    return;
  }
  if (url.pathname === "/guest/join" && method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) {
      response.writeHead(400, sidecarHeaders("text/html; charset=utf-8"));
      response.end(inviteErrorHtml("Missing invite token."));
      return;
    }
    const result = await verifyInviteToken(token, getHostSecret());
    if (!result.ok) {
      response.writeHead(401, sidecarHeaders("text/html; charset=utf-8"));
      response.end(inviteErrorHtml(`Invite token is invalid or expired (${result.reason}).`));
      return;
    }
    response.writeHead(200, sidecarHeaders("text/html; charset=utf-8"));
    response.end(invitePageHtml({ room: ctx.room, token }));
    return;
  }
  if (url.pathname === "/guest/join" && method === "POST") {
    const body = await new Promise<string>((resolve) => {
      let data = "";
      request.on("data", (chunk) => (data += chunk));
      request.on("end", () => resolve(data));
    });
    const params = new URLSearchParams(body);
    const token = params.get("token") || "";
    const name = params.get("name") || "";
    const pairingCode = params.get("pairingCode") || "";

    const result = await verifyInviteToken(token, getHostSecret());
    if (!result.ok) {
      response.writeHead(401, sidecarHeaders("text/html; charset=utf-8"));
      response.end(inviteErrorHtml(`Invite token is invalid or expired (${result.reason}).`));
      return;
    }
    const payload = result.payload;
    if (!pairingCodesMatch(ctx.pairingCode, pairingCode)) {
      response.writeHead(401, sidecarHeaders("text/html; charset=utf-8"));
      response.end(inviteErrorHtml("Pairing code does not match the host."));
      return;
    }

    const guest = createPendingGuest({
      name,
      role: (payload.defaultRole as string) || "editor",
      pairingCode,
      room: ctx.room,
      hostUrl: `http://${request.headers.host}`,
    });

    response.writeHead(200, sidecarHeaders("text/html; charset=utf-8"));
    response.end(inviteSuccessHtml(guest.id));
    return;
  }
  if (url.pathname === "/guest/status" && method === "GET") {
    const id = url.searchParams.get("id");
    const guest = id ? memoryGuests.get(id) : undefined;
    if (guest && guest.expiresAt > Date.now()) {
      sendJson(response, 200, {
        status: guest.status,
        sessionToken: guest.sessionToken,
        approvedRole: guest.approvedRole,
      });
    } else {
      sendJson(response, 200, { status: "not-found" });
    }
    return;
  }
  if (url.pathname === "/lan/status" || url.pathname === "/lan/discover") {
    sendJson(response, 200, sidecarStatusPayload(ctx));
    return;
  }
  if (url.pathname === "/lan/audit") {
    sendJson(response, 200, { audit: ctx.audit });
    return;
  }
  if (url.pathname === "/lan/files" && method === "GET") {
    sendJson(response, 200, {
      files: ctx.files,
      maxFileBytes: ctx.maxFileBytes,
      inboxDir: ctx.inboxDir,
    });
    return;
  }
  if (url.pathname === "/lan/files" && method === "POST") {
    await receiveInboxFile(request, response, ctx);
    return;
  }
  if (method === "GET" || method === "HEAD") {
    // Join landing page — replaces Hocuspocus's default text response.
    response.writeHead(200, sidecarHeaders("text/html; charset=utf-8"));
    response.end(landingPageHtml(ctx.room));
    return;
  }
  sendJson(response, 404, { ok: false, error: "Not found" });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Register a listener for mDNS discovery up/down events (set once from main.ts). */
export function setDiscoveryListener(listener: DiscoveryListener | null): void {
  discoveryListener = listener;
}

/** Boot the embedded Hocuspocus LAN hub (+ optional mDNS advertise/discover). */
export async function start(input: CollabHubStartInput = {}): Promise<CollabHubStatus> {
  if (server) {
    // Already running — return current status (idempotent).
    return status();
  }

  const port = input.port ?? DEFAULT_PORT;
  const pairingCode = input.pairingCode?.trim() || generatePairingCode();
  const guestCode = input.guestCode?.trim() || generatePairingCode();
  const room = input.room ?? "telecom-default";

  const { Server } = (await import("@hocuspocus/server")) as {
    Server: new (opts: Record<string, unknown>) => HocuspocusServer;
  };
  const { SQLite } = (await import("@hocuspocus/extension-sqlite")) as {
    SQLite: new (opts: Record<string, unknown>) => unknown;
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir(dataDir(), { recursive: true });
  dbPath = path.join(dataDir(), "collab-hub.sqlite");

  interface HubContext {
    role: string;
    peerId: string;
    peerName: string;
  }

  // Per-session HTTP-sidecar state (status/audit/file inbox + peer tracking),
  // captured by the hub hooks below. Inbox files land under Electron's
  // userData, next to the hub's SQLite database.
  const sidecar = createSidecarContext({
    name: SERVICE_NAME,
    room,
    port,
    pairingCode,
    allowGuests: true,
    startedAt: new Date().toISOString(),
    inboxDir: path.join(dataDir(), "lan-inbox"),
  });

  let instance: HocuspocusServer;
  try {
    instance = new Server({
      name: HUB_NAME,
      port,
      quiet: true,
      // DoS hardening: cap frame size well below the crossws default.
      websocketOptions: { maxPayload: 64 * 1024 * 1024 },
      extensions: [new SQLite({ database: dbPath })],

      // Token-based auth (Hocuspocus Auth frame — the code never rides the URL,
      // so it cannot leak into HTTP/proxy logs). The token is a JSON envelope
      // {code, peerId, peerName, role}; which CODE matches decides the role:
      // pairing code → requested role, guest code → read-only viewer/reviewer.
      async onAuthenticate(payload: {
        token: string;
        requestParameters: URLSearchParams;
        connectionConfig: { readOnly: boolean; isAuthenticated: boolean };
        documentName: string;
        socketId: string;
      }): Promise<HubContext> {
        const parsed = parseCollabToken(payload.token);
        // Legacy fallback: pre-token clients sent the code as a query param.
        const presented = parsed.code || payload.requestParameters.get("pairingCode");
        const requestedRole = parsed.role ?? payload.requestParameters.get("role");
        const peerId = parsed.peerId ?? payload.requestParameters.get("peerId") ?? randomUUID();
        const peerName =
          parsed.peerName ?? payload.requestParameters.get("peerName") ?? "Unknown peer";
        const access = deriveRoleFromCodes({ pairingCode, guestCode }, presented, requestedRole);
        if (!access) {
          addAudit(sidecar, "pairing.rejected", { room: payload.documentName, peerId, peerName });
          throw new Error("Invalid access code");
        }
        // Server-side enforcement: read-only connections cannot mutate the doc
        // (MessageReceiver drops their sync updates), whatever the client claims.
        payload.connectionConfig.readOnly = access.readOnly;
        trackPeer(sidecar, payload.documentName, payload.socketId, {
          id: peerId,
          name: peerName,
          role: access.role,
        });
        addAudit(sidecar, "peer.paired", {
          room: payload.documentName,
          peerId,
          peerName,
          role: access.role,
        });
        return { role: access.role, peerId, peerName };
      },

      async onDisconnect(payload: {
        documentName: string;
        socketId: string;
        context?: HubContext;
      }) {
        untrackPeer(sidecar, payload.documentName, payload.socketId);
        addAudit(sidecar, "peer.left", {
          room: payload.documentName,
          peerId: payload.context?.peerId,
          peerName: payload.context?.peerName,
          role: payload.context?.role,
        });
      },

      // HTTP sidecar: discovery/status, audit, file inbox, and the join landing
      // page. Rejecting with a FALSY value afterwards short-circuits Hocuspocus's
      // default "Welcome to Hocuspocus!" responder without surfacing an error —
      // its Server.requestHandler rethrows only truthy hook rejections. A truthy
      // rejection would become an unhandled rejection in the main process, so
      // sidecar failures are answered with a generic 500 instead of rethrown.
      async onRequest(payload: { request: IncomingMessage; response: ServerResponse }) {
        try {
          await handleSidecarRequest(payload.request, payload.response, sidecar);
        } catch (error) {
          console.warn("[collab-hub] sidecar request failed:", error);
          if (!payload.response.headersSent) {
            payload.response.writeHead(500, sidecarHeaders("application/json"));
          }
          payload.response.end(JSON.stringify({ ok: false, error: "Internal error" }));
        }
        return Promise.reject(null);
      },

      // Anti-spoofing: awareness is client-asserted, so stamp the SERVER-derived
      // role onto every presence state this connection broadcasts. A guest can
      // rename themselves, but can never present as host/editor to peers.
      async beforeHandleAwareness(payload: {
        context: HubContext | undefined;
        states: Map<number, Record<string, unknown>>;
      }) {
        if (!payload.context) return;
        for (const state of payload.states.values()) {
          const user = state.user as Record<string, unknown> | undefined;
          if (user && typeof user === "object") {
            user.role = payload.context.role;
          }
        }
      },

      // `payload.port` is the ACTUAL bound port (from the underlying
      // http.Server's address()), not necessarily the originally-requested
      // `port` — it can differ after a port-scan retry below.
      async onListen(payload: { port: number }) {
        if (input.advertise !== false) {
          startAdvertising(payload.port, room, Boolean(pairingCode));
        }
      },
    });
  } catch (err: any) {
    if (err.code === "ERR_DLOPEN_FAILED" || err.message.includes("NODE_MODULE_VERSION")) {
      console.error("\n[FATAL ERROR] Native module mismatch detected in Electron main process.");
      console.error(
        "The hub could not start because better-sqlite3 needs to be rebuilt for Electron.",
      );
      console.error("FIX: Run 'pnpm run rebuild:electron' then restart the app.\n");
    }
    throw err;
  }

  const boundPort = await listenWithPortScan(instance, port, PORT_SCAN_LIMIT);
  // Keep the sidecar's discovery payload truthful after a port-scan retry.
  sidecar.port = boundPort;
  server = instance;
  activePort = boundPort;
  activePairingCode = pairingCode;
  activeGuestCode = guestCode;
  activeRoom = room;
  startedAt = sidecar.startedAt;

  if (input.discover) {
    startDiscovery();
  }

  return status();
}

/** Destroy the hub, stop mDNS advertising + discovery. */
export async function stop(): Promise<{ stopped: boolean }> {
  stopDiscovery();
  await stopAdvertising();

  if (server) {
    try {
      await server.destroy();
    } catch (error) {
      console.warn("[collab-hub] server destroy error:", error);
    }
    server = null;
  }

  activePort = null;
  activePairingCode = null;
  activeGuestCode = null;
  activeRoom = null;
  startedAt = null;
  dbPath = null;
  return { stopped: true };
}

/** Current hub status (never throws). */
export function status(): CollabHubStatus {
  return {
    running: server !== null,
    port: activePort,
    pairingCode: activePairingCode,
    guestCode: activeGuestCode,
    room: activeRoom,
    advertising: publishedService !== null,
    discovering: browser !== null,
    websocketUrls: activePort ? websocketUrls(activePort) : [],
    ips: lanAddresses(),
    dbPath,
    startedAt,
  };
}

/**
 * Begin mDNS discovery and return the hubs currently known. The renderer can
 * also subscribe to live up/down events via the `collab:discovered` channel.
 */
export async function discover(): Promise<DiscoveredHub[]> {
  startDiscovery();
  return [...discovered.values()];
}

/** Snapshot of hubs discovered so far (no side effects). */
export function getDiscovered(): DiscoveredHub[] {
  return [...discovered.values()];
}

// ─── mDNS advertise/discover ──────────────────────────────────────────────────

async function ensureBonjour(): Promise<BonjourInstance> {
  if (!bonjour) {
    const mod = (await import("bonjour-service")) as unknown as {
      Bonjour: new (...args: unknown[]) => BonjourInstance;
      default?: new (...args: unknown[]) => BonjourInstance;
    };
    const Ctor = mod.Bonjour ?? mod.default;
    if (!Ctor) throw new Error("bonjour-service: missing Bonjour export");
    bonjour = new Ctor();
  }
  return bonjour;
}

function startAdvertising(port: number, room: string, pairingRequired: boolean): void {
  void (async () => {
    try {
      const inst = await ensureBonjour();
      publishedService = inst.publish({
        name: SERVICE_NAME,
        type: SERVICE_TYPE,
        port,
        protocol: "tcp",
        txt: { room, pairingRequired: pairingRequired ? "1" : "0" },
      });
    } catch (error) {
      console.warn("[collab-hub] mDNS advertise failed:", error);
    }
  })();
}

async function stopAdvertising(): Promise<void> {
  if (!publishedService) return;
  publishedService = null;
  const inst = bonjour;
  if (inst) {
    await new Promise<void>((resolve) => {
      try {
        inst.unpublishAll(() => resolve());
      } catch {
        resolve();
      }
    });
  }
}

function startDiscovery(): void {
  if (browser) return;
  void (async () => {
    try {
      const inst = await ensureBonjour();
      const b = inst.find({ type: SERVICE_TYPE });
      browser = b;
      b.on("up", (svc) => {
        const hub = toDiscoveredHub(svc);
        if (!hub) return;
        discovered.set(serviceKey(svc), hub);
        discoveryListener?.({ type: "up", hub });
      });
      b.on("down", (svc) => {
        const key = serviceKey(svc);
        const hub = discovered.get(key);
        discovered.delete(key);
        if (hub) discoveryListener?.({ type: "down", hub });
      });
    } catch (error) {
      console.warn("[collab-hub] mDNS discovery failed:", error);
    }
  })();
}

function stopDiscovery(): void {
  if (browser) {
    try {
      browser.stop?.();
    } catch {
      // ignore
    }
    browser = null;
  }
  discovered.clear();
}

/** Best-effort full teardown on app quit. */
export async function dispose(): Promise<void> {
  await stop();
  if (bonjour) {
    try {
      bonjour.destroy();
    } catch {
      // ignore
    }
    bonjour = null;
  }
}
