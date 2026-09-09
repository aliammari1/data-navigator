#!/usr/bin/env node

/**
 * LAN sync server for the telecom dashboard — Hocuspocus edition.
 *
 * The Yjs relay is `@hocuspocus/server`'s core (`Hocuspocus`) embedded in this
 * script's own HTTP server, so the existing discovery/file sidecar endpoints
 * (`/lan/status`, `/lan/audit`, `/lan/files`) keep working unchanged while the
 * sync layer gains real auth hooks:
 *
 *  - Token auth (`onAuthenticate`): the client sends `{code, peerId, peerName,
 *    role}` in the Hocuspocus Auth frame — the code never rides the URL.
 *  - Dual codes: the full PAIRING_CODE grants the requested role; the
 *    GUEST_CODE only ever grants read-only viewer/reviewer. The server derives
 *    the role from which code matched — a client cannot self-promote.
 *  - Server-side read-only: viewers'/reviewers' document updates are dropped
 *    by Hocuspocus (`connectionConfig.readOnly`), not trusted to the client.
 *  - Awareness anti-spoofing: the server stamps its derived role onto every
 *    presence state a connection broadcasts.
 *
 * There is deliberately NO "trusted peer" rejoin bypass anymore: peer ids are
 * broadcast in awareness, so treating them as credentials let anyone who ever
 * saw the peer list reconnect without a code. Every connection re-presents a
 * code.
 *
 * Usage:
 *   node scripts/lan-server.mjs               # 127.0.0.1:1234 (localhost-only)
 *   HOST=192.168.1.10 PORT=1234 node scripts/lan-server.mjs
 *   PAIRING_CODE=123456 GUEST_CODE=654321 node scripts/lan-server.mjs
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { SQLite } from "@hocuspocus/extension-sqlite";
import { Hocuspocus } from "@hocuspocus/server";
import { WebSocketServer } from "ws";

// Default to 0.0.0.0 so the LAN server is actually reachable over the network
// as advertised by the discovery URLs. The previous 127.0.0.1 default was
// too restrictive for a collaboration hub.
const HOST = process.env.HOST ?? "0.0.0.0";
const REQUESTED_PORT = Number(process.env.PORT ?? 1234);
const PORT_SCAN_LIMIT = Number(process.env.PORT_SCAN_LIMIT ?? 24);
// CSPRNG codes — Math.random() (V8 xorshift128+) is predictable and must never
// gate access. crypto.randomInt yields uniform, unpredictable 6-digit codes.
const PAIRING_CODE = process.env.PAIRING_CODE ?? String(crypto.randomInt(100000, 1000000));
const GUEST_CODE = process.env.GUEST_CODE ?? String(crypto.randomInt(100000, 1000000));
const MAX_INBOX_FILES = Number(process.env.MAX_INBOX_FILES ?? 200);
const SESSION_NAME = process.env.SESSION_NAME ?? "Data Navigator LAN";
const ALLOW_GUESTS = process.env.ALLOW_GUESTS !== "0";
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES ?? 512 * 1024 * 1024);
const INBOX_DIR = path.resolve(process.env.LAN_INBOX_DIR ?? ".data/lan-inbox");
// Document persistence: without this, Hocuspocus unloads (and discards) a
// document the instant its last connection drops (`unloadImmediately`
// defaults to true), so the shared doc would be wiped between sessions.
const DB_PATH = path.resolve(process.env.DB_PATH ?? ".data/lan-server.sqlite");

const audit = [];
const files = [];

function now() {
  return new Date().toISOString();
}

function addAudit(event, detail = {}) {
  const entry = {
    id: crypto.randomUUID(),
    at: now(),
    event,
    ...detail,
  };
  audit.unshift(entry);
  if (audit.length > 200) audit.length = 200;
  return entry;
}

function safeFileName(name) {
  return (
    String(name || "upload.bin")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "upload.bin"
  );
}

/**
 * Constant-time code comparison. Plain `===` is a timing oracle; this compares
 * fixed-length buffers via crypto.timingSafeEqual and fails closed on length
 * mismatch without leaking length through an early return.
 * (Mirror of `electron/collab-pairing.ts` — keep the two in sync.)
 */
function safeCodeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab); // keep timing ~constant, then fail closed
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function normalizeRequestedRole(requested) {
  if (requested === "host" || requested === "reviewer" || requested === "viewer") return requested;
  return "editor";
}

/**
 * Dual-code role derivation (mirror of `deriveRoleFromCodes` in
 * `electron/collab-pairing.ts`): the presented code decides the trust tier,
 * the requested role is honored only within that tier.
 */
function deriveRoleFromCodes(presented, requestedRole) {
  const requested = normalizeRequestedRole(requestedRole);
  if (safeCodeEqual(PAIRING_CODE, presented)) {
    return {
      role: requested,
      readOnly: requested === "viewer" || requested === "reviewer",
      isGuestCode: false,
    };
  }
  if (safeCodeEqual(GUEST_CODE, presented)) {
    const role = requested === "reviewer" ? "reviewer" : "viewer";
    return { role, readOnly: true, isGuestCode: true };
  }
  return null;
}

/** Parse the auth token: JSON envelope {code, peerId, peerName, role} or bare code. */
function parseCollabToken(token) {
  if (!token) return { code: "" };
  try {
    const parsed = JSON.parse(token);
    if (parsed && typeof parsed === "object" && typeof parsed.code === "string") {
      return parsed;
    }
  } catch {
    // bare string token — treat as the code
  }
  return { code: String(token) };
}

// ─── Peer tracking (for /lan/status) ─────────────────────────────────────────
// Keyed by document (room) name → Map<socketId, peer>.

const roomPeers = new Map();

function trackPeer(documentName, socketId, peer) {
  let peers = roomPeers.get(documentName);
  if (!peers) {
    peers = new Map();
    roomPeers.set(documentName, peers);
  }
  peers.set(socketId, { ...peer, lastSeenAt: Date.now() });
}

function untrackPeer(documentName, socketId) {
  const peers = roomPeers.get(documentName);
  if (!peers) return;
  peers.delete(socketId);
  if (peers.size === 0) roomPeers.delete(documentName);
}

let ephemeralHostSecret = null;
function getHostSecret() {
  const HOST_SECRET_ENV = "DATA_NAVIGATOR_HOST_SECRET";
  const fromEnv = process.env[HOST_SECRET_ENV];
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (!ephemeralHostSecret) {
    ephemeralHostSecret = crypto.randomBytes(32).toString("base64url");
  }
  return ephemeralHostSecret;
}

function verifyInviteToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { ok: false, reason: "invalid format" };
    }
    const [headerB64, payloadB64, sigB64] = parts;

    const signingInput = `${headerB64}.${payloadB64}`;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(signingInput);
    const expectedSig = hmac
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sigBuf = Buffer.from(sigB64);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { ok: false, reason: "signature mismatch" };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
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

const memoryGuests = new Map();

function pruneMemoryGuests() {
  const now = Date.now();
  for (const [id, guest] of memoryGuests.entries()) {
    if (guest.expiresAt <= now) {
      if (guest.timer) clearTimeout(guest.timer);
      memoryGuests.delete(id);
    }
  }
}

function createPendingGuest(input) {
  pruneMemoryGuests();
  const PENDING_TTL_MS = 5 * 60 * 1000;
  const now = Date.now();
  const id = crypto.randomUUID();
  const timer = setTimeout(() => {
    memoryGuests.delete(id);
  }, PENDING_TTL_MS);

  const guest = {
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
      if (g && g.timer) clearTimeout(g.timer);
      memoryGuests.delete(oldestKey);
    }
  }
  return guest;
}

function invitePageHtml(props) {
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

function inviteErrorHtml(message) {
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

function inviteSuccessHtml(id) {
  const dashboardPort = process.env.DASHBOARD_PORT || "3000";
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

function landingPageHtml(room) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${SESSION_NAME} — LAN</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
  code { background: rgba(0,0,0,0.05); padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
  @media (prefers-color-scheme: dark) { code { background: rgba(255,255,255,0.1); } }
  .card { border: 1px solid rgba(0,0,0,0.1); padding: 1.5rem; border-radius: 0.5rem; margin-top: 2rem; }
  @media (prefers-color-scheme: dark) { .card { border-color: rgba(255,255,255,0.1); } }
</style>
</head>
<body>
  <h1>Data Navigator</h1>
  <p><strong>LAN session</strong></p>
  <div class="card">
    <p><strong>Room</strong><br/><code>${room}</code></p>
    <p><strong>How to join</strong></p>
    <ol>
      <li>Open Data Navigator on your computer.</li>
      <li>Go to the LAN session screen.</li>
      <li>Enter the server address shown in the host's invitation.</li>
    </ol>
    <p><small>Real-time sync happens in the desktop app — this page only shows your join details.</small></p>
  </div>
</body>
</html>`;
}

function roomSummaries() {
  return [...roomPeers.entries()].map(([name, peers]) => ({
    name,
    peers: [...peers.values()],
    connections: peers.size,
  }));
}

// ─── Hocuspocus core (embedded — we own the HTTP server) ─────────────────────

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const hocuspocus = new Hocuspocus({
  name: SESSION_NAME,
  quiet: true,
  extensions: [new SQLite({ database: DB_PATH })],

  async onAuthenticate({ token, requestParameters, connectionConfig, documentName, socketId }) {
    try {
      const parsed = parseCollabToken(token);
      // Legacy fallback: pre-token clients sent the code as a query param.
      const presented = parsed.code || requestParameters.get("pairingCode") || "";
      const requestedRole = parsed.role ?? requestParameters.get("role");
      const peerId = parsed.peerId ?? requestParameters.get("peerId") ?? crypto.randomUUID();
      const peerName = parsed.peerName ?? requestParameters.get("peerName") ?? "Unknown peer";

      const access = deriveRoleFromCodes(presented, requestedRole);
      if (!access) {
        addAudit("pairing.rejected", { room: documentName, peerId, peerName });
        throw new Error("Invalid access code");
      }
      // Gate on which code was actually presented (GUEST_CODE), not the
      // derived role/readOnly result — a PAIRING_CODE holder who voluntarily
      // requests a read-only role is not a "guest" and must never be blocked
      // by ALLOW_GUESTS=0.
      if (access.isGuestCode && !ALLOW_GUESTS) {
        addAudit("guest.rejected", { room: documentName, peerId, peerName });
        throw new Error("Guest mode disabled");
      }

      // Server-side enforcement: read-only connections cannot mutate the doc.
      connectionConfig.readOnly = access.readOnly;

      trackPeer(documentName, socketId, { id: peerId, name: peerName, role: access.role });
      addAudit("peer.paired", { room: documentName, peerId, peerName, role: access.role });

      return { role: access.role, peerId, peerName };
    } catch (err) {
      if (err.code === "ERR_DLOPEN_FAILED" || err.message.includes("NODE_MODULE_VERSION")) {
        console.error("\n[FATAL ERROR] Native module mismatch detected (better-sqlite3).");
        console.error(
          "This usually happens when Node.js is updated without rebuilding dependencies.",
        );
        console.error("FIX: Run 'pnpm run rebuild:node' to fix your environment.\n");
      }
      throw err;
    }
  },

  // Anti-spoofing: awareness identity is client-asserted; overwrite the role
  // with the server-derived one so a guest can never present as host/editor.
  async beforeHandleAwareness({ context, states }) {
    if (!context) return;
    for (const state of states.values()) {
      if (state.user && typeof state.user === "object") {
        state.user.role = context.role;
      }
    }
  },

  async onDisconnect({ documentName, socketId, context }) {
    untrackPeer(documentName, socketId);
    addAudit("peer.left", {
      room: documentName,
      peerId: context?.peerId,
      peerName: context?.peerName,
      role: context?.role,
    });
  },
});

// ─── HTTP sidecar (discovery + file inbox) ───────────────────────────────────

function lanAddresses() {
  const nets = os.networkInterfaces();
  const lans = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] ?? []) {
      if (n.family === "IPv4" && !n.internal) {
        lans.push({ name, address: n.address });
      }
    }
  }
  return lans;
}

// Files persisted to the inbox this session (disk-exhaustion guard).
let inboxFileCount = 0;
let activePort = REQUESTED_PORT;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers":
        "content-type,x-file-name,x-peer-id,x-peer-name,x-room,x-pairing-code",
    });
    res.end();
    return;
  }
  if (url.pathname === "/guest/join" && req.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) {
      res.writeHead(400, {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(inviteErrorHtml("Missing invite token."));
      return;
    }
    const result = verifyInviteToken(token, getHostSecret());
    if (!result.ok) {
      res.writeHead(401, {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(inviteErrorHtml(`Invite token is invalid or expired (${result.reason}).`));
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    res.end(invitePageHtml({ room: SESSION_NAME, token }));
    return;
  }
  if (url.pathname === "/guest/join" && req.method === "POST") {
    const body = await new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });
    const params = new URLSearchParams(body);
    const token = params.get("token") || "";
    const name = params.get("name") || "";
    const pairingCode = params.get("pairingCode") || "";

    const result = verifyInviteToken(token, getHostSecret());
    if (!result.ok) {
      res.writeHead(401, {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(inviteErrorHtml(`Invite token is invalid or expired (${result.reason}).`));
      return;
    }
    const payload = result.payload;
    if (!safeCodeEqual(PAIRING_CODE, pairingCode)) {
      res.writeHead(401, {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(inviteErrorHtml("Pairing code does not match the host."));
      return;
    }

    const guest = createPendingGuest({
      name,
      role: payload.defaultRole || "editor",
      pairingCode,
      room: SESSION_NAME,
      hostUrl: `http://${req.headers.host}`,
    });

    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    res.end(inviteSuccessHtml(guest.id));
    return;
  }
  if (url.pathname === "/guest/status" && req.method === "GET") {
    const id = url.searchParams.get("id");
    const guest = id ? memoryGuests.get(id) : undefined;
    const statusPayload =
      guest && guest.expiresAt > Date.now()
        ? {
            status: guest.status,
            sessionToken: guest.sessionToken,
            approvedRole: guest.approvedRole,
          }
        : { status: "not-found" };

    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(statusPayload));
    return;
  }
  if (url.pathname === "/lan/status" || url.pathname === "/lan/discover") {
    const ips = lanAddresses();
    const payload = {
      ok: true,
      name: SESSION_NAME,
      host: HOST,
      port: activePort,
      pairingRequired: true,
      allowGuests: ALLOW_GUESTS,
      ips,
      websocketUrls: ips.map((ip) => `ws://${ip.address}:${activePort}`),
      httpUrls: ips.map((ip) => `http://${ip.address}:${activePort}`),
      rooms: roomSummaries(),
      audit: audit.slice(0, 40),
      files: files.slice(0, 40),
      maxFileBytes: MAX_FILE_BYTES,
      inboxDir: INBOX_DIR,
      startedAt,
    };
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(payload, null, 2));
    return;
  }
  if (url.pathname === "/lan/audit") {
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ audit }, null, 2));
    return;
  }
  if (url.pathname === "/lan/files" && req.method === "GET") {
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ files, maxFileBytes: MAX_FILE_BYTES, inboxDir: INBOX_DIR }, null, 2));
    return;
  }
  if (url.pathname === "/lan/files" && req.method === "POST") {
    // Only the full pairing code authorizes an upload — GUEST_CODE is
    // view-only and must not be able to write files to the host's disk.
    const presented = req.headers["x-pairing-code"];
    if (!safeCodeEqual(presented, PAIRING_CODE)) {
      addAudit("file.rejected_pairing", {
        peerId: req.headers["x-peer-id"],
        peerName: req.headers["x-peer-name"],
      });
      res.writeHead(401, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify({ ok: false, error: "Pairing code required" }));
      return;
    }

    if (inboxFileCount >= MAX_INBOX_FILES) {
      addAudit("file.rejected_quota", {
        peerId: req.headers["x-peer-id"],
        peerName: req.headers["x-peer-name"],
        count: inboxFileCount,
      });
      res.writeHead(507, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify({ ok: false, error: "Inbox file limit reached" }));
      return;
    }

    fs.mkdirSync(INBOX_DIR, { recursive: true });
    const originalName = safeFileName(req.headers["x-file-name"] ?? "upload.bin");
    const storedName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalName}`;
    const target = path.join(INBOX_DIR, storedName);
    const out = fs.createWriteStream(target, { flags: "wx" });
    let size = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_FILE_BYTES && !rejected) {
        rejected = true;
        req.destroy(new Error("File too large"));
        out.destroy();
        fs.rm(target, { force: true }, () => {});
      }
    });
    req.pipe(out);
    out.on("finish", () => {
      if (rejected) return;
      inboxFileCount += 1;
      const entry = {
        id: crypto.randomUUID(),
        originalName,
        storedName,
        size,
        type: req.headers["content-type"] ?? "application/octet-stream",
        room: req.headers["x-room"] ?? "default",
        peerId: req.headers["x-peer-id"] ?? "",
        peerName: req.headers["x-peer-name"] ?? "",
        receivedAt: now(),
      };
      files.unshift(entry);
      if (files.length > 100) files.length = 100;
      addAudit("file.uploaded", entry);
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify({ ok: true, file: entry }));
    });
    req.on("error", (err) => {
      addAudit("file.upload_failed", {
        peerId: req.headers["x-peer-id"],
        peerName: req.headers["x-peer-name"],
        error: err.message,
      });
      if (!res.headersSent) {
        res.writeHead(size > MAX_FILE_BYTES ? 413 : 500, {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        });
      }
      res.end(JSON.stringify({ ok: false, error: err.message }));
    });
    return;
  }
  // SECURITY: never disclose the codes in an HTTP response — they are the sole
  // access-control secrets for the room. They live only on the host console
  // and the host's own UI. A health probe gets a generic OK, nothing else.
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`${SESSION_NAME} — OK\n`);
});

// ─── WebSocket layer → Hocuspocus ────────────────────────────────────────────

const wss = new WebSocketServer({
  noServer: true,
  // DoS hardening: cap message size and disable compression (perMessageDeflate
  // has known memory-amplification issues — OWASP WebSocket guidance).
  maxPayload: 64 * 1024 * 1024,
  perMessageDeflate: false,
});

wss.on("connection", (ws, req) => {
  // Bridge the Node upgrade request to the web-standard Request Hocuspocus v4
  // expects (URL for requestParameters, headers for onAuthenticate payloads).
  const webRequest = new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? HOST}`), {
    headers: Object.entries(req.headers).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.join(",") : (v ?? ""),
    ]),
  });
  const clientConnection = hocuspocus.handleConnection(ws, webRequest);
  ws.binaryType = "arraybuffer";
  ws.on("message", (data) => {
    clientConnection.handleMessage(new Uint8Array(data));
  });
  ws.on("close", (code, reason) => {
    clientConnection.handleClose({ code, reason: reason?.toString() ?? "" });
  });
  ws.on("error", () => {
    clientConnection.handleClose({ code: 1011, reason: "socket error" });
  });
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

const startedAt = now();

function listenWithPortScan(port, remaining) {
  activePort = port;
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && remaining > 0) {
      console.warn(`[!] Port ${port} is already in use, trying ${port + 1}...`);
      listenWithPortScan(port + 1, remaining - 1);
      return;
    }
    throw err;
  });
  server
    .listen(port, HOST, () => {
      activePort = port;
      printReady();
    })
    .on("error", (err) => {
      if (err.code === "ERR_DLOPEN_FAILED" || err.message.includes("NODE_MODULE_VERSION")) {
        console.error("\n[FATAL ERROR] Native module mismatch detected (better-sqlite3).");
        console.error(
          "This usually happens when Node.js is updated without rebuilding dependencies.",
        );
        console.error("FIX: Run 'pnpm run rebuild:node' to fix your environment.\n");
        process.exit(1);
      }
    });
}

function printReady() {
  console.log(`\n  Telecom LAN sync server (hocuspocus)`);
  console.log(`  ────────────────────────────────────`);
  console.log(`  bound:    ${HOST}:${activePort}`);
  console.log(`  pairing (full access): ${PAIRING_CODE}`);
  console.log(`  guest   (view-only):   ${GUEST_CODE}`);
  console.log(`  guests:  ${ALLOW_GUESTS ? "read-only enabled" : "disabled"}`);
  const lans = lanAddresses().map((item) => item.address);
  if (lans.length > 0) {
    console.log(`  paste in dashboard "URL serveur (LAN)":`);
    for (const ip of lans) console.log(`    ws://${ip}:${activePort}`);
    console.log(`  discovery:`);
    for (const ip of lans) console.log(`http://${ip}:${activePort}/lan/status`);
  } else {
    console.log(`  (no LAN IPv4 detected — try ws://localhost:${activePort})`);
  }
  console.log("");
}

listenWithPortScan(REQUESTED_PORT, PORT_SCAN_LIMIT);
