# Implementation Brief — Cluster: LAN-first CRDT Collaboration

> **Scope:** Wire `collab-hub` + `collaboration` onto the existing Yjs/LAN stack, add durable
> offline persistence, and (optional, Trial) replace the hand-written relay with an Electron-main
> Hocuspocus hub + mDNS discovery.
> **Hard constraints:** fully offline (no runtime network / CDN), medium PC (4-core, no WebGPU,
> 8 GB), current stable APIs only.
> **Audience:** implementation agents. Build directly from this — do not re-research.

---

## 0. Repo reality check (READ FIRST — the plan docs are slightly stale)

Verified against `package.json` and source on 2026-06-12:

| Claim in plan docs | Actual repo state |
|---|---|
| "`ws`, `lib0`, `y-protocols` missing from package.json → LAN server crashes" | **FALSE now.** `ws ^8.18.0`, `lib0 ^0.2.117`, `y-protocols ^1.0.7`, `y-websocket ^3.0.0`, `yjs ^13.6.31` are **all present**. `npm run lan-server` boots. |
| "add `@tanstack/react-virtual`" | Already present: `@tanstack/react-virtual ^3.14.2`. |
| "add `comlink`" | Already present: `comlink ^4.4.2`. |
| "`better-sqlite3` for main-process persistence" | Already present: `better-sqlite3 ^12.10.0` (so the Hocuspocus SQLite extension's bundled `better-sqlite3 ^12.6.2` is compatible). |
| selector hooks `useYArray` / `useLAN` "to be written" | Already exist: `src/features/collaboration/lib/use-y.ts` (`useYArray`, `shallowArrayEqual`), `src/features/collaboration/lib/use-lan.ts` (`useLAN`, `useLANAudit` over `useSyncExternalStore`). |
| per-room doc "to be written" | Already exists: `src/features/collaboration/lib/room.ts` (`getRoomDoc` returning `comments/changes/chat/meta`) + `room-provider.tsx`. **But it has NO persistence yet** — its own header comment says *"Durable single-tab reload persistence requires `y-indexeddb`, which is not an installed dependency"*. |

**Net-new dependencies this cluster must add (only these):**

```
y-indexeddb@9.0.12                 # renderer offline persistence  (peerDep yjs ^13)
@hocuspocus/server@4.2.0           # OPTIONAL Trial: Electron-main LAN hub
@hocuspocus/extension-sqlite@4.2.0 # OPTIONAL Trial: SQLite persistence for the hub
bonjour-service@1.4.1              # OPTIONAL Trial: mDNS LAN auto-discovery
```

Everything else in this cluster (`yjs`, `y-websocket`, `y-protocols`, `ws`, `lib0`) is already installed and already wired in `src/platform/collab/collab.ts`, `src/platform/lan/lan-collab.ts`, and `scripts/lan-server.mjs`. **Do not reinstall or re-version them.**

`@hocuspocus/extension-sqlite` depends on `@hocuspocus/extension-database` (pulled transitively — no need to add it explicitly) and on `better-sqlite3` (already present).

---

## 1. Architecture map (where each package lives)

```
RENDERER (Next.js client, cross-origin isolated)
  yjs ........................ src/platform/collab/collab.ts (the singleton ydoc + shared types)
  y-indexeddb ................ NEW src/features/collab-hub/collab/persistence.ts  (durable doc)
                              + wire into src/features/collaboration/lib/room.ts (per-room doc)
  y-websocket (client) ....... src/platform/lan/lan-collab.ts  connectLAN()  (already lazy-imported)
  y-protocols/awareness ...... consumed via provider.awareness in lan-collab.ts → exposed by
                               src/features/collaboration/lib/use-lan.ts (useLAN)

ELECTRON MAIN (privileged, Node)
  @hocuspocus/server ......... NEW electron/collab-hub-service.ts  (utility/main process)
  @hocuspocus/extension-sqlite NEW   "        "         (durable hub state on disk)
  bonjour-service ............ NEW electron/collab-hub-service.ts  (advertise + discover)
  ws / lib0 / y-protocols .... scripts/lan-server.mjs  (the existing zero-config default relay)

WORKERS (src/workers/) — none required for this cluster.
  (Optional perf: move scanLANSubnet into a Comlink worker — comlink already present.
   NOT required to ship the cluster.)
```

The **default offline path stays renderer + `scripts/lan-server.mjs`** (already works, zero new deps).
y-indexeddb is the **only mandatory addition**. Hocuspocus + bonjour-service are an **opt-in upgrade** for in-app hub + auto-discovery.

---

## 2. yjs (already installed — `yjs ^13.6.31`)

**Status:** installed and wired. Do not change the version. This cluster only adds new shared types and stops the features that bypass the doc.

### Where it lives
- Singleton app doc + shared types: `src/platform/collab/collab.ts` (`ydoc`, `sharedAudit`, `sharedPresence`, `sharedLanRoom`, `useYMap`).
- Per-room collaborative doc: `src/features/collaboration/lib/room.ts` (`getRoomDoc`).

### New shared structures for collab-hub
Create `src/features/collab-hub/collab/collab-hub-doc.ts`:

```ts
"use client";
import * as Y from "yjs";
import { ydoc } from "@/platform/collab/collab";

// Approval workflow state, keyed by reportId.
export const yApprovals = ydoc.getMap<Y.Map<unknown>>("collabhub:approvals");
// Annotations: sectionId -> ordered list of note maps (replies are a nested Y.Array).
export const yAnnotations = ydoc.getMap<Y.Array<Y.Map<unknown>>>("collabhub:annotations");
// Audit: append-only JSON strings (mirrors the existing sharedAudit pattern in collab.ts).
export const yAudit = ydoc.getArray<string>("collabhub:audit");
```

### Key API calls (current v13 — copy-pasteable)
```ts
// Always mutate inside a transaction so observers fire once per logical change.
ydoc.transact(() => {
  const note = new Y.Map<unknown>();
  note.set("id", crypto.randomUUID());
  note.set("author", peer.name);
  note.set("text", text);
  note.set("at", Date.now());
  note.set("resolved", false);
  note.set("replies", new Y.Array());      // nested CRDT → concurrent replies never clobber
  sectionArray.push([note]);               // Y.Array.push takes an ARRAY of items
});

// Read a whole array as plain JS:
sectionArray.toArray().map((m) => Object.fromEntries(m.entries()));

// Observe (deep, because notes mutate internally):
sectionArray.observeDeep(cb);  sectionArray.unobserveDeep(cb);

// Manual merge / persistence primitives (used by the main-process hub fallback):
const update = Y.encodeStateAsUpdate(ydoc);   // Uint8Array snapshot
Y.applyUpdate(ydoc, update, "remote");        // 3rd arg = origin tag; collab.ts guards origin==="remote"
```

### Pitfalls
- `Y.Array.push`/`unshift`/`insert` take an **array**, not a single item: `arr.push([item])`.
- Never store a `Y.Map`/`Y.Array` in two places, and never re-insert a detached one — Yjs throws. Create a fresh `Y.Map` per insert.
- Do not mutate Yjs types through `immer` drafts; mutate via the Yjs API directly (the repo uses `immer` elsewhere).
- `useYMap` in `collab.ts` rebuilds a full snapshot every render — for new code use the selector hook `useYArray` in `src/features/collaboration/lib/use-y.ts` instead.

---

## 3. y-indexeddb (ADD — `y-indexeddb@9.0.12`) — the ONE mandatory new dep

**Install:** `y-indexeddb@9.0.12` (peerDependency `yjs ^13.0.0`; already satisfied). Import path: `"y-indexeddb"`. Pure JS, ~5 kB, no WASM, no native deps. Closes the #1 offline gap (durable CRDT survives reload).

### Minimal correct init — collab-hub doc
Create `src/features/collab-hub/collab/persistence.ts`:

```ts
"use client";
import { IndexeddbPersistence } from "y-indexeddb";
import { ydoc } from "@/platform/collab/collab";

let persistence: IndexeddbPersistence | null = null;

export async function ensureCollabHubPersistence() {
  if (persistence) return persistence;
  if (typeof indexedDB === "undefined") return null;        // SSR / unsupported env guard
  await navigator.storage?.persist?.();                     // best-effort: ask for durable storage
  persistence = new IndexeddbPersistence("collab-hub-doc", ydoc); // (docName, ydoc)
  await persistence.whenSynced;                             // gate UI until local content loaded
  return persistence;
}
```

### Wire the existing per-room doc (`src/features/collaboration/lib/room.ts`)
That file already declares `comments/changes/chat/meta` and a `destroy()`, and explicitly notes persistence is missing. Add it inside `getRoomDoc`:

```ts
import { IndexeddbPersistence } from "y-indexeddb";
// inside getRoomDoc(roomId), after `const doc = new Y.Doc()`:
const persistence = new IndexeddbPersistence(`dn-room-${roomId}`, doc);
const room: RoomDoc = {
  doc, comments: doc.getArray("comments"), /* …existing fields… */,
  whenStored: persistence.whenSynced,          // expose so RoomProvider can gate on it
  destroy() { persistence.destroy(); doc.destroy(); rooms.delete(roomId); },
};
```
Then in `src/features/collaboration/lib/room-provider.tsx`, gate render on `room.whenStored` (await it, show a skeleton until resolved) **before** any network provider connects.

### Key API (current v9.0.12 — exact)
```ts
const p = new IndexeddbPersistence(docName, ydoc); // constructor
p.on("synced", () => {});      // event: local content fully loaded
await p.whenSynced;            // promise form of the same
await p.clearData();           // destroy DB + stored doc (use for "leave/reset room")
await p.destroy();             // stop syncing, close connection (keep data)
p.set(key, value); p.get(key); p.del(key);  // arbitrary metadata storage
```

### Offline / self-host requirements
- **No assets to bundle.** Pure JS; nothing in `public/` or `models/`. Uses the browser's IndexedDB only.
- **Ordering rule (critical):** `await persistence.whenSynced` (local load) **before** calling `connectLAN()` — otherwise a remote peer's state can overwrite local-only offline edits before they're loaded. This is what makes offline-first feel instant and lossless.
- `navigator.storage.persist()` is best-effort; in Electron it generally returns true (app origin is trusted). Surface `navigator.storage.estimate()` (quota/usage) in the UI for long-lived rooms.

### Pitfalls
- **Last published "3 years ago" but it IS current** — 9.0.12 is the latest release; the y-crdt org maintains it. Do not look for a newer major; there isn't one. Do not substitute `@toeverything/y-indexeddb` (a different fork).
- One `IndexeddbPersistence` per `(docName, doc)` pair. Reusing the same `docName` for two different docs corrupts state. Use distinct names (`collab-hub-doc`, `dn-room-<id>`).
- For **vitest** tests, IndexedDB doesn't exist in Node — add `fake-indexeddb` (dev dep) and `import "fake-indexeddb/auto"` at the top of the test, or guard with the `typeof indexedDB === "undefined"` check shown above.
- Do not also keep writing the same data to `localStorage` — that's the bug being removed. Pick the doc as the single source of truth.

---

## 4. y-websocket (already installed — `y-websocket@3.0.0`) — LAN transport client

**Status:** installed and already wired in `src/platform/lan/lan-collab.ts` via a **lazy** `await import("y-websocket")` (keeps Yjs/provider out of routes that never collaborate — keep it lazy).

### Current correct init (v3 — matches existing code)
```ts
const { WebsocketProvider } = await import("y-websocket");
const provider = new WebsocketProvider(
  settings.url,       // e.g. "ws://192.168.1.10:1234"  (NO room in the URL)
  settings.room,      // room name, e.g. "telecom-default"
  ydoc,               // the SHARED Y.Doc from collab.ts
  {
    connect: true,
    params: {         // query params → become onAuthenticate's requestParameters on the hub
      peerId: settings.peer.id,
      peerName: settings.peer.name,
      role: settings.peer.role,           // host|editor|reviewer|viewer
      pairingCode: settings.pairingCode,  // the hub's auth gate (see §6)
    },
    // For Electron/Node-side providers you'd pass `WebSocketPolyfill: ws`; in the
    // renderer the native WebSocket is used — do NOT polyfill in the renderer.
  },
);
provider.on("status", ({ status }) => { /* "connecting" | "connected" | "disconnected" */ });
provider.awareness.setLocalStateField("user", { id, name, role, color, page, lastSeenAt });
provider.awareness.on("change", refreshPeers);
// teardown:
provider.awareness.off("change", refreshPeers);
provider.destroy();
```

### Offline requirements
- Connect only to a **LAN/localhost host you run** (`scripts/lan-server.mjs` or the Hocuspocus hub in §6). Never a public URL. No CDN, no STUN, no signaling server.
- The provider auto-reconnects with backoff. When the cable is pulled mid-session, edits queue locally (in the doc + y-indexeddb) and merge on reconnect — no special handling needed.

### Wiring targets
- Keep the provider lifecycle owned by `src/platform/lan/lan-collab.ts` (`connectLAN`/`disconnectLAN`).
- `collab-hub` must **not** create its own provider — it shares the same `ydoc`, so it rides the existing LAN provider + the `startCollabSync()` BroadcastChannel provider automatically. Two providers on one doc is fine: Yjs dedupes by update origin (`collab.ts` already tags remote updates `"remote"`).

### Pitfalls
- **Do not put the room in the URL** — pass URL and room as separate args. Putting `/<room>` in the URL double-encodes against the hub's room routing.
- The renderer is **cross-origin isolated** (COEP: require-corp). **WebSocket connections are exempt from COEP/CORP**, so `ws://<lan-ip>` works despite isolation. (See §8 gotcha — this is the thing people get wrong.)
- v3 requires the server to speak the y-protocols sync+awareness framing (the existing `lan-server.mjs` and Hocuspocus both do). Don't point it at a generic WS echo server.

---

## 5. y-protocols / awareness (already installed — `y-protocols@1.0.7`) — presence

**Status:** installed. Awareness is consumed today via `provider.awareness` in `lan-collab.ts` and surfaced by `src/features/collaboration/lib/use-lan.ts` (`useLAN`). Make it explicit (it's a direct dep already) and route `collab-hub` presence through it — **delete the BroadcastChannel heartbeat** in `PresenceBar.tsx`.

### Key API (current)
```ts
import type { Awareness } from "y-protocols/awareness";   // type import for hooks
// Server side (Node): import * as awarenessProtocol from "y-protocols/awareness";
//   const awareness = new awarenessProtocol.Awareness(ydoc);  // already used in lan-server.mjs

// Local presence write (ephemeral; auto-expires after ~30s if not refreshed):
awareness.setLocalStateField("user", { id, name, role, color, page, lastSeenAt: Date.now() });
awareness.setLocalStateField("cursor", { page: location.pathname, sel, at: Date.now() });

// Read peers:
for (const [clientId, state] of awareness.getStates()) { /* state.user, state.cursor */ }

// Subscribe (fires on EVERY remote tick — throttle!):
awareness.on("change", handler);  awareness.off("change", handler);
```

### Presence hook for collab-hub
Replace the `usePresence` BroadcastChannel block in `src/features/collab-hub/components/PresenceBar.tsx` with the existing LAN-backed hook:

```ts
// reuse src/features/collaboration/lib/use-lan.ts
import { useLAN } from "@/features/collaboration/lib/use-lan";
const { peers, status } = useLAN();          // already useSyncExternalStore-backed, no render storm
const me = readLANSettings().peer;           // stable identity from src/platform/lan/lan-collab.ts
```
This deletes the manual 10 s heartbeat + 30 s prune intervals and the per-render `me` object churn. Awareness auto-prunes on disconnect (30 s timeout). For same-machine multi-tab without a relay, `startCollabSync()` (BroadcastChannel Yjs provider) already covers it — one code path, two reach levels.

### Offline requirements
- None beyond y-websocket; awareness rides the same provider. No assets, no network beyond the LAN socket.

### Pitfalls
- **Throttle awareness writes** for high-frequency fields (cursor/selection) to ~30–60 ms (rAF) — raw `awareness.on("change")` fires on every remote peer's cursor move and re-renders all subscribers on a medium CPU. Split low-frequency membership (join/leave/role) from high-frequency cursor updates if you add live cursors.
- Awareness is **ephemeral** — do NOT also write cursor/selection into the persisted `sharedPresence` Y.Map (it bloats the doc + the IndexedDB log). Keep only durable identity (name/role/color) in the doc; live cursor goes to awareness only. (`lan-collab.ts`'s `publishPresence` currently double-writes both — fix it.)
- Do **not** add `y-presence` / `@y-presence/react` (thin, unmaintained wrappers). Use raw Awareness behind your own hook — already done in `use-lan.ts`.

---

## 6. @hocuspocus/server (ADD — Trial — `@hocuspocus/server@4.2.0`) — Electron-main LAN hub

**OPTIONAL upgrade path.** The default offline relay is `scripts/lan-server.mjs` (works today, zero new deps). Adopt Hocuspocus only to get an **in-app** hub (no separate terminal) with maintained awareness multiplexing + SQLite persistence + an auth hook.

**Install:** `@hocuspocus/server@4.2.0` + `@hocuspocus/extension-sqlite@4.2.0`. v4 deps: `crossws ^0.4.4` (replaces the hard `ws` coupling), `lib0`, `async-mutex`. Runs in **Electron main / utility process only — never bundle into the renderer.**

### Minimal correct init (v4 — `new Server`, NOT `Server.configure`)
Create `electron/collab-hub-service.ts`:

```ts
import { Server } from "@hocuspocus/server";
import { SQLite } from "@hocuspocus/extension-sqlite";
import path from "node:path";

export function startCollabHub(opts: { port?: number; pairingCode: string; dataDir: string }) {
  const server = new Server({
    name: "data-navigator-hub",
    port: opts.port ?? 1234,
    quiet: true,                                  // no startup banner
    extensions: [
      new SQLite({ database: path.join(opts.dataDir, "collab-hub.sqlite") }), // file path persists to disk
    ],
    // v4: payload uses web-standard objects. Pairing-code gate = the existing lan-server.mjs contract.
    async onAuthenticate({ requestParameters, connection, documentName }) {
      const code = requestParameters.get("pairingCode");      // URLSearchParams.get
      if (opts.pairingCode && code !== opts.pairingCode) {
        throw new Error("Invalid pairing code");              // throwing terminates the connection
      }
      const role = requestParameters.get("role");
      if (role === "viewer" || role === "reviewer") {
        connection.readOnly = true;                           // read-only roles can't mutate the doc
      }
      return { role, documentName };                          // contextual data for later hooks
    },
    async onListen({ port }) { /* advertise via bonjour-service here — see §7 */ },
  });
  server.listen();                                            // start accepting WS connections
  return { stop: () => server.destroy() };
}
```

### Key API (current v4.2.0)
- `new Server({ name, port, timeout, debounce, quiet, extensions, ...hooks })` — **`new Server`**, not `Server.configure` (configure is legacy).
- `server.listen()` — start. `server.destroy()` — stop.
- Hooks (all async, return/throw a Promise): `onAuthenticate`, `onConfigure`, `onListen`, `onLoadDocument`, `onStoreDocument`, `onConnect`, `onDisconnect`.
- `onAuthenticate` payload (v4): `{ token, documentName, requestHeaders: Headers, requestParameters: URLSearchParams, connection: { readOnly }, instance, request, socketId }`. **Read query params with `requestParameters.get("…")`** and headers with `requestHeaders.get("…")` (web-standard — the v4 breaking change from Node `IncomingMessage`).
- SQLite extension: `new SQLite({ database })` where `database` is a filename (persists to disk), `":memory:"` (default), or `""` (anonymous disk). Custom `schema`, `fetch`, `store` overrides available. **v4 uses `better-sqlite3` (already a repo dep, compatible major 12); named params dropped the `$` prefix vs v3.**

### Offline / self-host requirements
- 100% self-hosted in Electron main; binds to `0.0.0.0:<port>` for LAN reach. No external services, no CDN.
- SQLite file goes under the app data dir (use `app.getPath("userData")` → pass as `dataDir`). Reuse the existing `PathAccessController.dataDir` convention in `electron/security.ts`.
- Expose start/stop over IPC following the existing pattern in `electron/main.ts` (`ipcMain.handle(...)` + `withTrustedSender`) and the `electron/preload.ts` contextBridge — mirror how `duckdb:*`/`voice:*` handlers are registered. Add e.g. `collabHub:start` / `collabHub:stop` / `collabHub:status`.

### Pitfalls
- **Main-process only.** `@hocuspocus/server` pulls in `crossws`/Node APIs — importing it in any renderer/client module breaks the build and bloats the bundle. Keep it behind the `electron/` boundary + IPC.
- v4 ≠ v3 docs. Many web examples show `Server.configure({...})` and Node `request.headers['x']` — that's v3. Use `new Server` and `requestHeaders.get('x')` / `requestParameters.get('x')`.
- `connection.readOnly = true` is how you enforce reviewer/viewer roles server-side (matches the existing role gate in `lan-server.mjs`). Don't rely on client-side role checks alone.
- Keep `scripts/lan-server.mjs` as the **zero-config / browser-only fallback**. Hocuspocus is the in-app option, not a hard replacement.

---

## 7. bonjour-service (ADD — Trial — `bonjour-service@1.4.1`) — mDNS LAN discovery

**OPTIONAL.** Replaces "type the host IP" / the 254-host `scanLANSubnet` brute force with auto-discovery. **Electron main only** (pure-JS mDNS; no native build — do NOT use `mdns`/`node_mdns` which need toolchains and break the Windows MSIX/Squirrel packaging already configured).

### Minimal correct init (current v1.4.1)
In `electron/collab-hub-service.ts` (advertise on the host) and discovery on peers:

```ts
import { Bonjour } from "bonjour-service";        // named export (default also works)
const bonjour = new Bonjour();

// HOST: advertise the hub once it's listening (call from onListen):
const service = bonjour.publish({
  name: "Data Navigator LAN",
  type: "dn-collab",                               // your service type (becomes _dn-collab._tcp)
  port: 1234,
  protocol: "tcp",
  txt: { room: "telecom-default", pairingRequired: "1" },   // TXT record (string values)
});

// PEER: discover hubs, feed candidates to the renderer (via IPC) instead of scanning:
const browser = bonjour.find({ type: "dn-collab" });
browser.on("up", (svc) => {
  // svc: { name, type, port, addresses: string[], txt, host }
  const ip = svc.addresses?.find((a) => a.includes("."));   // pick IPv4
  send(`ws://${ip}:${svc.port}`);                           // → renderer addCandidate()
});
browser.on("down", (svc) => { /* remove candidate */ });

// teardown:
bonjour.unpublishAll(() => bonjour.destroy());
```

### Key API (current v1.4.1)
- `new Bonjour(options?, errorCallback?)`.
- `bonjour.publish({ name, type, port, protocol?, host?, subtypes?, txt?, disableIPv6? })` → returns a `Service`.
- `bonjour.find({ type }, onUp?)` → `Browser` with events `up` / `down` / `srv-update` / `txt-update`.
- Discovered service shape: `{ name, type, port, addresses: string[], txt, host }`.
- `bonjour.unpublishAll(cb?)`, `bonjour.destroy()`.

### Offline requirements
- mDNS is link-local multicast — works with **no internet, no router config** on a normal LAN. No assets to bundle.
- **Many networks drop multicast** (guest Wi-Fi, client isolation). Keep `scanLANSubnet` (in `lan-collab.ts`) as the explicit fallback and a manual "enter IP" field. mDNS is the convenience layer, not the only path.

### Pitfalls
- Main-process only; talk to the renderer over IPC (publish discovered `ws://` candidates).
- Use a unique, stable `type` (e.g. `dn-collab`) so you don't collide with `_http._tcp` services. TXT values must be strings.
- Always `unpublishAll` + `destroy` on app quit, or the service lingers in caches.
- `addresses` can include IPv6 + multiple NICs — filter to the IPv4 on the active subnet before building the `ws://` URL.

---

## 8. ws + lib0 (already installed — `ws@8.18.0`, `lib0@0.2.117`) — server runtime

**Status:** installed and used directly by `scripts/lan-server.mjs` (`WebSocketServer` from `ws`; `lib0/encoding`, `lib0/decoding`, `lib0/map`; `y-protocols/sync`, `y-protocols/awareness`). The "missing deps → server crashes" gap in the plan docs is **already closed.** No action needed unless you adopt Hocuspocus (which uses `crossws` instead of `ws` for its own listener — `ws` then remains only for the legacy `lan-server.mjs` fallback).

- **Verify gate:** add a `lan:doctor` npm script that does `node -e "import('ws');import('lib0/encoding');import('y-protocols/sync')"` to fail fast if a future prune removes them.

---

## THE SINGLE MOST IMPORTANT OFFLINE GOTCHA

**The renderer is unconditionally cross-origin isolated** — `electron/security.ts` applies `Cross-Origin-Opener-Policy: same-origin` + **`Cross-Origin-Embedder-Policy: require-corp`** + `Cross-Origin-Resource-Policy: same-origin` to *every* document response (for SharedArrayBuffer / WASM threads / DuckDB-COI). Two consequences for this cluster:

1. **The LAN WebSocket still works.** `ws://<lan-ip>:1234` is **exempt** from COEP/CORP (WebSocket handshakes are not COEP-gated resource fetches), and there is **no CSP `connect-src`** restriction in the Electron session (only the COOP/COEP/CORP headers exist). So `connectLAN()` to a raw LAN IP succeeds despite isolation — do not "fix" this by loosening COEP.
2. **Any HTTP sidecar fetch will be CORP-blocked.** The existing discovery/audit/file-drop calls (`discoverLAN`, `scanLANSubnet`, `uploadLANFile` in `lan-collab.ts`) do `fetch("http://<lan-ip>/lan/...")` from the isolated renderer. Under `require-corp`, a **cross-origin HTTP response with no `Cross-Origin-Resource-Policy: cross-origin` header is blocked**. The hub's HTTP responses (in `lan-server.mjs`, and any Hocuspocus HTTP) **must send `Cross-Origin-Resource-Policy: cross-origin`** or those fetches fail silently in the packaged app even though the LAN is reachable. (WebSocket sync is fine; the HTTP sidecar is the trap.) Preferred fix: move discovery to mDNS (§7, main process, not subject to renderer isolation) and file-drop to IPC→main, so the isolated renderer never makes a cross-origin HTTP fetch at all.

Everything in this cluster runs with **zero internet**: transport is a LAN WebSocket hub you ship, persistence is IndexedDB (renderer) / SQLite (main), discovery is link-local mDNS, CRDT merge is in-process. No CDN, no STUN, no signaling, no telemetry.

---

## Verification checklist (offline, no network)
- `await persistence.whenSynced` resolves and a note added → reload → note persists (y-indexeddb).
- `PAIRING_CODE=123456 PORT=1234 npm run lan-server` (or the Hocuspocus hub via IPC); two browsers/PCs join with the code → annotation on B appears on A; approve on A flips status on B.
- Wrong `pairingCode` → connection rejected (`onAuthenticate` throws).
- Pull the cable mid-session, edit on both peers, reconnect → CRDT merges, no lost notes.
- `react-scan` shows no whole-tree re-render on remote awareness ticks (presence routed through `useLAN`).
- vitest + `fake-indexeddb`: apply two concurrent `Y.applyUpdate`s to two docs → assert converged final state.
