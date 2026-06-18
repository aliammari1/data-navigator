#!/usr/bin/env node

/**
 * Minimal LAN sync server for telecom dashboard (y-websocket v3 compatible).
 * Speaks y-protocols/sync + y-protocols/awareness over plain WebSocket so the
 * in-browser y-websocket client can join. Trusted-LAN use only — no auth.
 *
 * Usage:
 *   node scripts/lan-server.mjs               # 0.0.0.0:1234
 *   PORT=4444 node scripts/lan-server.mjs
 *   HOST=192.168.1.10 PORT=1234 node scripts/lan-server.mjs
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as map from "lib0/map";
import { WebSocketServer } from "ws";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

// Localhost-only by default (secure default). Set HOST explicitly to a LAN/mesh
// interface address to opt into LAN collaboration — never default to 0.0.0.0.
const HOST = process.env.HOST ?? "127.0.0.1";
const REQUESTED_PORT = Number(process.env.PORT ?? 1234);
const PORT_SCAN_LIMIT = Number(process.env.PORT_SCAN_LIMIT ?? 24);
// CSPRNG pairing code — Math.random() (V8 xorshift128+) is predictable and must
// never gate access. crypto.randomInt yields a uniform, unpredictable 6-digit code.
const PAIRING_CODE = process.env.PAIRING_CODE ?? String(crypto.randomInt(100000, 1000000));
const MAX_INBOX_FILES = Number(process.env.MAX_INBOX_FILES ?? 200);
const SESSION_NAME = process.env.SESSION_NAME ?? "Data Navigator LAN";
const ALLOW_GUESTS = process.env.ALLOW_GUESTS !== "0";
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES ?? 512 * 1024 * 1024);
const INBOX_DIR = path.resolve(process.env.LAN_INBOX_DIR ?? ".data/lan-inbox");

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

const wsReadyStateOpen = 1;
const pingTimeout = 30000;

const docs = new Map();
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
 * Constant-time pairing-code comparison. Plain `===` is a timing oracle; this
 * compares fixed-length buffers via crypto.timingSafeEqual and fails closed on
 * length mismatch without leaking length through an early return.
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

// Files persisted to the inbox this session (disk-exhaustion guard).
let inboxFileCount = 0;

class Room {
  constructor(name) {
    this.name = name;
    this.ydoc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.ydoc);
    this.awareness.setLocalState(null);
    this.conns = new Map();
    this.trustedPeers = new Map();

    this.ydoc.on("update", (update, _origin) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      const buf = encoding.toUint8Array(enc);
      for (const conn of this.conns.keys()) send(conn, buf);
    });

    this.awareness.on("update", ({ added, updated, removed }, conn) => {
      const changedClients = [...added, ...updated, ...removed];
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const buf = encoding.toUint8Array(enc);
      for (const c of this.conns.keys()) {
        if (c !== conn) send(c, buf);
      }
    });
  }
}

function getRoom(name) {
  return map.setIfUndefined(docs, name, () => new Room(name));
}

function send(conn, buf) {
  if (conn.readyState !== wsReadyStateOpen) return closeConn(conn);
  try {
    conn.send(buf, (err) => {
      if (err) closeConn(conn);
    });
  } catch {
    closeConn(conn);
  }
}

function closeConn(conn) {
  const room = conn._room;
  if (room) {
    const ids = room.conns.get(conn);
    room.conns.delete(conn);
    if (ids) awarenessProtocol.removeAwarenessStates(room.awareness, [...ids], null);
    if (room.conns.size === 0) docs.delete(room.name);
  }
  try {
    conn.close();
  } catch {}
}

function onMessage(conn, room, msg) {
  try {
    const enc = encoding.createEncoder();
    const dec = decoding.createDecoder(msg);
    const type = decoding.readVarUint(dec);
    switch (type) {
      case MSG_SYNC:
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(dec, enc, room.ydoc, conn);
        if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc));
        break;
      case MSG_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(dec),
          conn,
        );
        break;
    }
  } catch (e) {
    room.ydoc.emit("error", [e]);
  }
}

function setupConn(conn, req) {
  const url = new URL(req.url, "http://localhost");
  const roomName = url.pathname.slice(1).split("?")[0] || "default";
  const peerId = url.searchParams.get("peerId") || crypto.randomUUID();
  const peerName = url.searchParams.get("peerName") || "Unknown peer";
  const requestedRole = url.searchParams.get("role") || "viewer";
  const pairingCode = url.searchParams.get("pairingCode") || "";
  const role = ["host", "editor", "reviewer", "viewer"].includes(requestedRole)
    ? requestedRole
    : "viewer";
  const room = getRoom(roomName);
  const trusted = room.trustedPeers.get(peerId);
  const codeOk = safeCodeEqual(pairingCode, PAIRING_CODE);
  if (!trusted && !codeOk) {
    addAudit("pairing.rejected", { room: roomName, peerId, peerName, role });
    conn.close(4401, "Pairing code required");
    return;
  }
  if (role === "viewer" && !ALLOW_GUESTS) {
    addAudit("guest.rejected", { room: roomName, peerId, peerName });
    conn.close(4403, "Guest mode disabled");
    return;
  }
  room.trustedPeers.set(peerId, {
    id: peerId,
    name: peerName,
    role,
    pairedAt: trusted?.pairedAt ?? Date.now(),
    lastSeenAt: Date.now(),
  });
  addAudit(trusted ? "peer.rejoined" : "peer.paired", {
    room: roomName,
    peerId,
    peerName,
    role,
    remote: req.socket.remoteAddress,
  });
  conn._room = room;
  conn._peer = { id: peerId, name: peerName, role };
  conn.binaryType = "arraybuffer";
  room.conns.set(conn, new Set());

  conn.on("message", (data) => {
    // Viewers/reviewers can receive shared state and publish awareness, but
    // cannot mutate room CRDT content. This keeps read-only guest mode simple.
    try {
      const dec = decoding.createDecoder(new Uint8Array(data));
      const type = decoding.readVarUint(dec);
      if (type === MSG_SYNC && (role === "viewer" || role === "reviewer")) {
        addAudit("sync.blocked_readonly", { room: roomName, peerId, role });
        return;
      }
    } catch {}
    onMessage(conn, room, new Uint8Array(data));
  });

  // Ping/pong heartbeat
  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (room.conns.has(conn)) closeConn(conn);
      clearInterval(pingInterval);
    } else if (room.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);
  conn.on("close", () => {
    addAudit("peer.left", { room: roomName, peerId, peerName, role });
    closeConn(conn);
    clearInterval(pingInterval);
  });
  conn.on("pong", () => {
    pongReceived = true;
  });

  // Send initial sync step 1
  {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, room.ydoc);
    send(conn, encoding.toUint8Array(enc));
  }
  // Send awareness state
  const ids = [...room.awareness.getStates().keys()];
  if (ids.length > 0) {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, ids));
    send(conn, encoding.toUint8Array(enc));
  }
}

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

function roomSummaries() {
  return [...docs.values()].map((room) => ({
    name: room.name,
    peers: [...room.trustedPeers.values()],
    connections: room.conns.size,
  }));
}

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
    const pairingCode = req.headers["x-pairing-code"];
    if (!safeCodeEqual(pairingCode, PAIRING_CODE)) {
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
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`${SESSION_NAME} — OK\nPairing code: ${PAIRING_CODE}\n`);
});

const wss = new WebSocketServer({
  noServer: true,
  // DoS hardening: cap message size and disable compression (perMessageDeflate
  // has known memory-amplification issues — OWASP WebSocket guidance).
  maxPayload: 64 * 1024 * 1024,
  perMessageDeflate: false,
});
wss.on("connection", setupConn);

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
  console.log(`\n  Telecom LAN sync server`);
  console.log(`  ───────────────────────`);
  console.log(`  bound:    ${HOST}:${activePort}`);
  console.log(`  pairing: ${PAIRING_CODE}`);
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
