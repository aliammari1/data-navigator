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
import { Hocuspocus } from "@hocuspocus/server";
import { WebSocketServer } from "ws";

// Localhost-only by default (secure default). Set HOST explicitly to a LAN/mesh
// interface address to opt into LAN collaboration — never default to 0.0.0.0.
const HOST = process.env.HOST ?? "127.0.0.1";
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
    return { role: requested, readOnly: requested === "viewer" || requested === "reviewer" };
  }
  if (safeCodeEqual(GUEST_CODE, presented)) {
    const role = requested === "reviewer" ? "reviewer" : "viewer";
    return { role, readOnly: true };
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

function roomSummaries() {
  return [...roomPeers.entries()].map(([name, peers]) => ({
    name,
    peers: [...peers.values()],
    connections: peers.size,
  }));
}

// ─── Hocuspocus core (embedded — we own the HTTP server) ─────────────────────

const hocuspocus = new Hocuspocus({
  name: SESSION_NAME,
  quiet: true,

  async onAuthenticate({ token, requestParameters, connectionConfig, documentName, socketId }) {
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
    if (access.readOnly && !ALLOW_GUESTS) {
      addAudit("guest.rejected", { room: documentName, peerId, peerName });
      throw new Error("Guest mode disabled");
    }

    // Server-side enforcement: read-only connections cannot mutate the doc.
    connectionConfig.readOnly = access.readOnly;

    trackPeer(documentName, socketId, { id: peerId, name: peerName, role: access.role });
    addAudit("peer.paired", { room: documentName, peerId, peerName, role: access.role });

    return { role: access.role, peerId, peerName };
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

const server = http.createServer((req, res) => {
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
    // Either code authorizes an upload; the inbox is read-shared with the room.
    const presented = req.headers["x-pairing-code"];
    if (!safeCodeEqual(presented, PAIRING_CODE) && !safeCodeEqual(presented, GUEST_CODE)) {
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
    headers: Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : (v ?? "")]),
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
      listenWithPortScan(port + 1, remaining - 1);
      return;
    }
    throw err;
  });
  server.listen(port, HOST, () => {
    activePort = port;
    printReady();
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
