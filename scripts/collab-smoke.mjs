/**
 * Collaboration end-to-end smoke test (run: node .data/collab-smoke.mjs).
 *
 * Boots scripts/lan-server.mjs with known codes, then verifies with REAL
 * HocuspocusProvider clients:
 *   1. editor (full code) writes → guest (guest code) receives the update
 *   2. guest writes → server drops it (read-only) — editor never sees it
 *   3. wrong code → onAuthenticationFailed fires
 *   4. guest's awareness role claim ("host") is stamped back to viewer
 */

import { spawn } from "node:child_process";
import { HocuspocusProvider } from "@hocuspocus/provider";
import WebSocket from "ws";
import * as Y from "yjs";

const PORT = 12999;
const PAIRING = "111111";
const GUEST = "222222";
const ROOM = "smoke-room";

const server = spawn(
  process.execPath,
  ["scripts/lan-server.mjs"],
  {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(PORT),
      PAIRING_CODE: PAIRING,
      GUEST_CODE: GUEST,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOut = "";
server.stdout.on("data", (d) => {
  serverOut += String(d);
});
server.stderr.on("data", (d) => {
  serverOut += String(d);
});

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeProvider({ code, role, name, doc }) {
  return new HocuspocusProvider({
    url: `ws://127.0.0.1:${PORT}`,
    name: ROOM,
    document: doc,
    WebSocketPolyfill: WebSocket,
    token: JSON.stringify({ code, peerId: name, peerName: name, role }),
  });
}

const results = [];
function check(label, ok) {
  results.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

try {
  // Wait for the server to listen.
  for (let i = 0; i < 50 && !serverOut.includes("bound:"); i++) await delay(100);
  if (!serverOut.includes("bound:")) throw new Error(`server did not start:\n${serverOut}`);

  // ── 1+2: editor writes sync, guest writes are dropped ──
  const editorDoc = new Y.Doc();
  const guestDoc = new Y.Doc();
  const editor = makeProvider({ code: PAIRING, role: "editor", name: "editor-1", doc: editorDoc });
  const guest = makeProvider({ code: GUEST, role: "host", name: "guest-1", doc: guestDoc });

  let editorScope = null;
  let guestScope = null;
  editor.on("authenticated", ({ scope }) => {
    editorScope = scope;
  });
  guest.on("authenticated", ({ scope }) => {
    guestScope = scope;
  });

  // Publish a spoofed awareness identity from the guest: claims role "host".
  guest.setAwarenessField("user", { id: "guest-1", name: "guest-1", role: "host", color: "#ff0000" });

  for (let i = 0; i < 50 && !(editor.isSynced && guest.isSynced); i++) await delay(100);
  check("editor synced", editor.isSynced);
  check("guest synced", guest.isSynced);
  check("editor granted read-write scope", editorScope === "read-write");
  check("guest granted readonly scope (despite claiming host)", guestScope === "readonly");

  editorDoc.getMap("smoke").set("fromEditor", "hello");
  guestDoc.getMap("smoke").set("fromGuest", "should-be-dropped");
  await delay(1500);

  check("guest received editor write", guestDoc.getMap("smoke").get("fromEditor") === "hello");
  check(
    "editor did NOT receive guest write (server-side read-only)",
    editorDoc.getMap("smoke").get("fromGuest") === undefined,
  );

  // ── 4: awareness role stamping ──
  const guestStateSeenByEditor = [...editor.awareness.getStates().values()].find(
    (s) => s.user?.name === "guest-1",
  );
  check(
    "guest's spoofed 'host' role stamped back to viewer in peers' awareness",
    guestStateSeenByEditor?.user?.role === "viewer",
  );

  // ── 3: wrong code rejected ──
  let authFailed = false;
  const badDoc = new Y.Doc();
  const intruder = new HocuspocusProvider({
    url: `ws://127.0.0.1:${PORT}`,
    name: ROOM,
    document: badDoc,
    WebSocketPolyfill: WebSocket,
    token: JSON.stringify({ code: "999999", peerId: "x", peerName: "x", role: "editor" }),
    onAuthenticationFailed: () => {
      authFailed = true;
    },
  });
  for (let i = 0; i < 30 && !authFailed; i++) await delay(100);
  check("wrong code → authentication failed", authFailed);
  check("intruder never synced", !intruder.isSynced);

  editor.destroy();
  guest.destroy();
  intruder.destroy();
} catch (err) {
  console.error("SMOKE ERROR:", err);
  results.push({ label: "no unexpected error", ok: false });
} finally {
  server.kill("SIGTERM");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
