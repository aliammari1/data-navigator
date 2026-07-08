# Feature Plan — collaboration — Realtime local-first collaboration (Yjs) layer

**Maturity:** partial

## Performance issues

- CollaborationScreen.tsx (1383 lines) holds all comments/changes/chat/notifications in component useState and is never wired to the Yjs ydoc or the LAN provider — every collaborative artifact is mock-only and non-persistent.
- No list virtualization anywhere: comments, changes, audit log, chat, and notifications all render with raw .map() (24 .map call sites). At realistic volumes (hundreds of audit/chat entries) this re-renders the whole tree on every keystroke/observe.
- useYMap in collab.ts rebuilds a full snapshot object on every render and force-updates the whole consuming component on any map change (no key-level selector, no useSyncExternalStore) — coarse re-render granularity.
- Module-level singleton `ydoc` in collab.ts is created at import time on the client; it loads in every route that transitively imports the platform, adding Yjs to bundles that never collaborate and preventing per-room doc lifecycle.
- scanLANSubnet fires up to 254 fetch() probes (batches of 24) from the renderer main thread with no worker offload; AbortController timers and JSON parsing run on the UI thread and can jank the page during discovery.
- loadWorkspaceStats runs three async cache reads on a 30s setInterval that keeps firing even when the tab/route is hidden (no visibility gating), and re-runs Promise.all unconditionally.
- Awareness/presence is published as full-object JSON on every cursor/selection move (publishSelection -> publishPresence writes a stringified peer object) with no throttle/debounce — high-frequency awareness churn over the LAN socket.
- sharedAudit is an unbounded-then-trimmed Y.Array of JSON strings; readLANAudit re-parses the entire array (.toArray().map(JSON.parse)) on every audit observe with no memoization or incremental decode.
- echarts-for-react is dynamically imported but the activity/contribution charts recompute option objects in useMemo tied to mock data; with real streaming data and no OffscreenCanvas these run on the main thread.
- y-websocket provider is imported lazily (good) but the awareness 'change' handler calls refreshPeers -> emit() which triggers a full re-render of every LAN subscriber on every remote awareness tick (cursor moves of other peers).

## Offline gaps

- package.json is missing y-protocols, ws, and lib0 — the LAN sync server scripts/lan-server.mjs imports all three and will crash on `npm run lan-server`; the entire LAN path is currently non-functional out of the box.
- No offline CRDT persistence: y-indexeddb is not a dependency and collab.ts only uses BroadcastChannel (RAM-only, lost on reload). Comments/changes/chat do not survive a page reload even within one machine.
- The actual CollaborationScreen never persists anything (pure useState); there is no Electron-main file/SQLite persistence and no whenStored gate, so collaborative content has zero durability.
- LAN discovery relies on manual IP entry + a brute-force subnet scan; there is no mDNS/Bonjour auto-discovery (bonjour-service not present), so peers cannot find the hub without typing an IP — fragile on locked-down offline LANs.
- y-websocket points at a separately-launched Node script (scripts/lan-server.mjs) rather than an Electron-main embedded hub, so collaboration requires a manual terminal command (buildLANCommand returns `npm run lan-server`) instead of being available in-app offline.
- No COOP/COEP cross-origin isolation is leveraged for the collab worker path; awareness/CRDT decode stays on the main thread instead of a SharedArrayBuffer-backed worker.
- Presence/awareness has no offline persistence of identity beyond localStorage peer record; no OPFS/IndexedDB-backed durable room registry for previously-paired hubs.
- File-drop sharing depends on the LAN HTTP sidecar (/lan/files) which only exists when the manual Node server runs; in pure single-Electron offline mode there is no local inbox path.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `yjs` | CRDT core (keep) | ~19-22k | Very active, v13.6.x | MIT | yes | Automerge | Already the substrate; ~18kB pure-JS no-WASM, low memory — ideal for medium-end PC. Keep as the source of truth; just wire the screen to it. | https://github.com/yjs/yjs |
| `y-indexeddb` | Offline persistence (ADD) | y-crdt org | Active | MIT | yes | custom persistence | Closes the #1 offline gap: durable per-room CRDT log in IndexedDB with compaction + whenStored gate so comments/chat/changes survive reload with zero network. | https://github.com/yjs/y-indexeddb |
| `y-protocols` | Awareness + sync (ADD explicit) | y-crdt org | Active | MIT | yes | y-presence / 3rd-party presence | Provides Awareness (cursors/selection/presence) and sync/encoding; currently used by lan-server.mjs but NOT declared in package.json. Make it a direct dep and drive presence from raw Awareness. | https://github.com/yjs/y-protocols |
| `ws` | LAN server runtime (ADD — currently missing) | ~22k | Very active | MIT | yes | raw http upgrade | scripts/lan-server.mjs imports `ws` (WebSocketServer) but it is absent from package.json; the LAN hub crashes on launch without it. Declare it explicitly. | https://github.com/websockets/ws |
| `lib0` | Encoding utils (ADD explicit) | ~0.4k | Active (Yjs author) | MIT | yes | manual binary encoding | lan-server.mjs uses lib0/encoding/decoding/map; transitive today but should be a declared dep since the server depends on it directly. | https://github.com/dmonad/lib0 |
| `@hocuspocus/server` | Embedded LAN hub (ADD — strongly recommended) | ~2.4k | Very active, v4.x | MIT | yes | raw ws server (lan-server.mjs) | Replace the hand-rolled lan-server.mjs with a maintained Yjs backend embeddable in Electron main: awareness multiplexing, SQLite/file persistence, hooks for auth/roles. More reliable offline default than manual terminal scripts. | https://github.com/ueberdosis/hocuspocus |
| `bonjour-service` | LAN auto-discovery (ADD) | ~0.4k | Active | MIT | yes | manual IP entry + scanLANSubnet brute force | mDNS advertise+discover so peers auto-find the hub without typing an IP; replaces the brute-force 254-host subnet scanner. Pair with UDP-broadcast fallback for locked-down LANs. | https://github.com/onlxltd/bonjour-service |
| `loro-crdt` | TRIAL — high-perf CRDT w/ history + presence | ~5.7k | Very active, v1.13.1 (Jun 2026) | MIT | yes | yjs (only if history is primary need) | Trending CRDT: fastest/smallest, git-like version history/branching, and EphemeralStore (v1.5+) for presence. Spike behind a flag if doc history/time-travel of report state becomes a requirement; ~180kB WASM is the tradeoff. | https://github.com/loro-dev/loro |
| `@tanstack/react-virtual` | Virtualization (ADD) | ~5.5k | Very active, v3 | MIT | yes | raw .map() list rendering | Already in the radar/stack family; virtualize the audit log, chat, comments and changes lists so large collaborative histories render at 60fps on medium-end CPUs. | https://github.com/TanStack/virtual |
| `comlink` | Worker RPC (already present) | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread parsing | Already a dep; use it to move CRDT decode, subnet scan, and audit JSON parsing off the renderer main thread into a worker. | https://github.com/GoogleChromeLabs/comlink |
| `y-webrtc` | TRIAL — P2P fallback (scope carefully) | y-crdt org | Active but limited (max ~20-35 peers, mesh) | MIT | partial | y-websocket (only for adhoc P2P) | Optional serverless P2P mesh via WebRTC + locally-bundled signaling. Less reliable on locked-down LANs (mDNS/NAT often blocked); keep as a secondary path, not the default. Hocuspocus/y-websocket hub is the reliable offline default. | https://github.com/yjs/y-webrtc |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `y-websocket (bundled server)` | service-local | yes | Already the LAN relay client; the bundled scripts/lan-server.mjs is the localhost/LAN hub. Verify it boots after adding ws/lib0/y-protocols. | https://github.com/yjs/y-websocket |
| `@hocuspocus/cli / server` | service-local | yes | Run a maintained Yjs hub locally (or embedded in Electron main) to test multi-peer sync, awareness, and SQLite persistence fully offline. | https://github.com/ueberdosis/hocuspocus |
| `wscat` | cli | yes | Manually open a WebSocket to ws://<ip>:1234/<room> to confirm the LAN hub accepts connections and the pairing-code gate works, without the UI. | https://github.com/websockets/wscat |
| `size-limit (@size-limit/preset-app)` | cli | yes | Add a per-route budget for /dashboard/collaborative and a per-worker budget for the collab worker so Yjs+providers don't bloat unrelated routes. | https://github.com/ai/size-limit |
| `vitest + tinybench` | library | yes | Microbench CRDT apply/encode and audit-parse throughput in a worker to prove the off-main-thread move; run fully offline. | https://github.com/tinylibs/tinybench |
| `@axe-core/playwright` | library | yes | A11y-gate the collaborative panels (comment threads, presence avatars, live region for incoming messages) offline against localhost. | https://github.com/dequelabs/axe-core |
| `react-scan` | library | yes | Detect the wholesale re-renders caused by useYMap/refreshPeers on every awareness tick so you can verify selector-based fixes. | https://github.com/aidenybai/react-scan |

---

# Collaboration Feature — Deep Improvement Plan

`data-navigator` / Realtime local-first collaboration (Yjs) layer.
Targets: offline-only, medium-end PC (4-8 cores, 8-16GB RAM, no guaranteed WebGPU), mature/trending permissive deps only.

---

## 0. TL;DR (the one thing to understand)

There are effectively **two collaboration codebases that do not talk to each other**:

1. **A real CRDT/LAN platform** in `src/platform/collab/collab.ts` and `src/platform/lan/lan-collab.ts`, backed by a real Yjs LAN sync server in `scripts/lan-server.mjs`, surfaced by `src/features/dashboard-shell/components/lan-control-center.tsx`.
2. **A large mock UI** in `src/features/collaboration/screens/CollaborationScreen.tsx` (1383 lines) that is the actual content of the `/dashboard/collaborative` route — and is **100% local React `useState`**. Its comments, changes, chat, notifications, collaborators, and annotations are mock arrays (`INITIAL_COMMENTS = []`, `COLLABORATORS = [{ id: "me", name: "You" }]`). It imports neither `collab.ts` nor `lan-collab.ts`.

So the headline problem is **not** "Yjs is wired wrong" — it is "**the collaboration *screen* is a façade**; the working CRDT layer is bolted onto a different component on a different route, and the LAN server can't even start because three of its dependencies are missing from `package.json`."

The plan below is therefore primarily a **consolidation + wiring + hardening** effort (exactly the radar's default posture), not a library swap. Yjs stays. We add `y-indexeddb` for durability, declare the missing server deps, replace the brute-force subnet scan with mDNS, move heavy work to a worker, virtualize the lists, and connect the real screen to the real doc.

---

## 1. Current implementation (file-by-file)

### 1.1 Route entry
`src/app/dashboard/collaborative/page.tsx`
```tsx
import CollaborationScreen from "@/features/collaboration/screens/CollaborationScreen";
export default function Page() { return <CollaborationScreen />; }
```
Thin wrapper; no provider, no room param, no Suspense boundary for the CRDT layer.

### 1.2 The CRDT core — `src/platform/collab/collab.ts`
- Creates a **module-level singleton** `ydoc = new Y.Doc()` at import time (`"use client"`).
- Declares shared types: `sharedFilter`, `sharedTab`, `sharedMapping`, `sharedOverview`, `sharedLanRoom`, `sharedPresence` (Y.Map) and `sharedAudit` (Y.Array of JSON strings).
- `startCollabSync()` wires a **BroadcastChannel** (`telecom-ydoc-v1`) provider for cross-tab sync only. **No persistence** — purely in-RAM; reload loses everything.
- `useYMap(ymap, defaults)` — a hook that:
  - hydrates defaults if `ymap.size === 0`,
  - `ymap.observe(forceUpdate)` (a `useReducer` bump),
  - rebuilds a **fresh snapshot object every render** by iterating `ymap.entries()`.

This is the cross-tab state-sync primitive (filters/tab/mapping/overview), and it is reasonable for that narrow job — but it has no persistence and a coarse re-render model.

### 1.3 The LAN layer — `src/platform/lan/lan-collab.ts` (558 lines)
- Reads/writes peer identity to **localStorage** (`telecom-lan-peer-v2`, url, room, pairing code).
- `connectLAN(settings)`:
  - lazy `import("y-websocket")` (good — keeps it out of the base bundle),
  - constructs `WebsocketProvider(url, room, ydoc, { params })`,
  - subscribes to provider `status`, sets `awareness.setLocalStateField("user", {...})`, `awareness.on("change", refreshPeers)`.
- `refreshPeers()` iterates `awareness.getStates()` → rebuilds `peers[]` → `emit()` to all watchers. **Fires on every remote awareness tick** (every other peer's cursor move).
- `publishPresence/publishSelection` writes a full stringified peer object both into `sharedPresence` (Y.Map, persisted in doc) *and* `awareness` (ephemeral) — **double write, no throttle**.
- `appendAudit` pushes JSON strings into `sharedAudit`, trims to 120. `readLANAudit` re-parses the **entire array** on every read.
- `scanLANSubnet` — brute-forces up to **254 hosts** (`x.x.x.1..254`) in batches of 24, each a `fetch('/lan/status')` with an `AbortController` + timer, all on the renderer main thread.
- `uploadLANFile` POSTs a `File` to the LAN HTTP sidecar `/lan/files`.

### 1.4 The LAN server — `scripts/lan-server.mjs` (453 lines)
- A from-scratch y-protocols sync+awareness server over `ws`, with a per-room `Y.Doc`, pairing-code gate, role gate (viewer/reviewer read-only), HTTP sidecar (`/lan/status`, `/lan/audit`, `/lan/files`), file inbox to `.data/lan-inbox`, ping/pong heartbeat, port auto-scan.
- **Imports `ws`, `lib0/*`, `y-protocols/*`, `yjs`.** Only `yjs` is in `package.json`. **`ws`, `lib0`, `y-protocols` are NOT declared** → `npm run lan-server` fails unless they happen to be hoisted transitively. This is the single biggest "it doesn't actually run offline" defect.

### 1.5 The LAN UI — `src/features/dashboard-shell/components/lan-control-center.tsx` (535 lines)
- The **real** consumer of `lan-collab.ts`: connect/disconnect, peer list (polled via `subscribeLAN`), subnet scan trigger.
- It is **not used on the `/dashboard/collaborative` route** (grep finds no import in `src/app` or `src/features/collaboration`). It is a dashboard-shell widget.

### 1.6 The screen — `src/features/collaboration/screens/CollaborationScreen.tsx` (1383 lines)
- Tabs: `overview | comments | changes | live`.
- **All state is local mock**: `comments`, `changes`, `notifications`, `liveMessages`, `collaborators` in `useState`; handlers (`handleAddComment`, `handleResolve`, `handleReact`, `handleReply`, `handleSendChat`) mutate React state only.
- `useEffect` #1: one-shot DuckDB probe (`SHOW TABLES`, `COUNT(*)`) just to flip `duckdbLoaded`.
- `useEffect` #2: `loadWorkspaceStats` on a **30s `setInterval`** (3 cache reads), no visibility gating.
- Charts via dynamic `echarts-for-react`, options memoized off mock data.
- **24 `.map()` render loops, zero virtualization**, no `useSyncExternalStore`, no connection to `ydoc`/awareness.

---

## 2. Performance bottlenecks → exact fixes

### 2.1 The screen never uses the CRDT → no realtime, but also infinite mock re-renders
**Problem:** comment/change/chat lists are mock `useState`; `filteredComments` rebuilds and re-sorts on every keystroke in the search box; every list renders via `.map()`.

**Fix:** bind the lists to Yjs shared types via a **selector-based external-store hook** so a component re-renders only when *its* slice changes, and **virtualize** the lists.

```ts
// src/platform/collab/use-y.ts
import { useSyncExternalStore } from "react";
import type * as Y from "yjs";

/** Subscribe to a Y.Array and project it; re-renders only when the cached projection identity changes. */
export function useYArray<T, S>(
  yarr: Y.Array<T>,
  select: (items: T[]) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
): S {
  const cache = { value: select(yarr.toArray()) };
  return useSyncExternalStore(
    (onChange) => {
      const handler = () => {
        const next = select(yarr.toArray());
        if (!isEqual(next, cache.value)) { cache.value = next; onChange(); }
      };
      yarr.observe(handler);
      return () => yarr.unobserve(handler);
    },
    () => cache.value,
    () => cache.value, // SSR: stable
  );
}
```

Virtualize the audit / chat / comment lists:
```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function AuditList({ entries }: { entries: LANAuditEntry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });
  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((row) => (
          <div key={entries[row.index].id}
               style={{ position: "absolute", top: 0, transform: `translateY(${row.start}px)`, width: "100%" }}>
            <AuditRow entry={entries[row.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 2.2 `useYMap` rebuilds a full snapshot every render + force-updates the whole component
**Problem (collab.ts:84-122):** every render iterates the whole map and constructs a new object; any key change bumps the entire consumer.

**Fix:** replace with a `useSyncExternalStore` selector that reads a single key and caches.
```ts
export function useYMapKey<T extends string>(ymap: Y.Map<string>, key: string, fallback: T): T {
  return useSyncExternalStore(
    (cb) => { const h = (e: Y.YMapEvent<string>) => { if (e.keysChanged.has(key)) cb(); };
              ymap.observe(h); return () => ymap.unobserve(h); },
    () => (ymap.get(key) as T) ?? fallback,
    () => fallback,
  );
}
```
This is a drop-in for the filter/tab/mapping consumers and eliminates whole-tree churn.

### 2.3 `refreshPeers` re-renders on every remote cursor tick
**Problem (lan-collab.ts:340-353):** `awareness.on("change", refreshPeers)` → `emit()` to every watcher on each awareness update; remote cursor movement = global re-render.

**Fix:** (a) **throttle** awareness-driven `emit` (rAF or 60-100ms), and (b) split *presence list* (low-frequency: join/leave/role) from *cursor positions* (high-frequency) so cursor overlays subscribe to a separate channel.
```ts
import { throttle } from "lib0/function"; // or hand-rolled rAF throttle
const emitThrottled = throttle(emit, 80);

provider.awareness.on("change", ({ added, removed, updated }) => {
  if (added.length || removed.length) refreshPeers();  // membership: immediate
  else emitCursorsThrottled();                         // cursor moves: throttled
});
```

### 2.4 Presence published unthrottled + double-written
**Problem (lan-collab.ts:370-389):** `publishSelection` → `publishPresence` writes to both `sharedPresence` (persisted) and awareness on every selection change.

**Fix:** cursors/selection are **ephemeral** → awareness only, throttled; stop writing them into the persisted `sharedPresence` map (which bloats the doc + the IndexedDB log once we add persistence).
```ts
const publishCursor = throttle((sel: string) => {
  provider?.awareness?.setLocalStateField("cursor", { page: location.pathname, sel, at: Date.now() });
}, 50);
// keep sharedPresence ONLY for durable identity (name/role/color), not live cursor.
```

### 2.5 `readLANAudit` re-parses the entire Y.Array every read
**Problem (lan-collab.ts:248-259):** `.toArray().map(JSON.parse)` on every audit observe.

**Fix:** store **structured** entries (Yjs supports nested Y.Maps / plain JSON-serializable objects via `Y.Array<object>`), or keep a parsed cache and apply only the `delta` from the observe event:
```ts
let auditCache: LANAuditEntry[] = [];
sharedAudit.observe((e) => {
  // apply incremental delta instead of full re-parse
  let idx = 0;
  for (const op of e.changes.delta) {
    if (op.retain) idx += op.retain;
    else if (op.insert) { auditCache.splice(idx, 0, ...(op.insert as string[]).map(safeParse)); idx += op.insert.length; }
    else if (op.delete) auditCache.splice(idx, op.delete);
  }
});
```

### 2.6 Subnet scan blocks the main thread with 254 fetches
**Problem (lan-collab.ts:442-501):** brute-force discovery on the UI thread.

**Fix (two-pronged):**
1. **Primary:** replace with **mDNS auto-discovery** in Electron main (see §4.3) so the scan rarely runs.
2. **Fallback:** when a manual scan is still needed, run it in a **Comlink worker** so probes/timers/JSON parse stay off the main thread.
```ts
// scan.worker.ts
import * as Comlink from "comlink";
Comlink.expose({ async scan(prefix: string, port: string) { /* batched fetches here */ } });
// caller
const scanner = Comlink.wrap<ScanApi>(new Worker(new URL("./scan.worker.ts", import.meta.url)));
const hits = await scanner.scan("192.168.1", "1234");
```

### 2.7 30s `setInterval` runs while route is hidden
**Problem (CollaborationScreen.tsx:494-516):** polls caches every 30s regardless of visibility.

**Fix:** gate on `document.visibilityState` and pause when hidden; better, recompute on a Yjs/cache mutation event rather than a timer.
```ts
useEffect(() => {
  let timer: number | undefined;
  const tick = () => { if (document.visibilityState === "visible") loadWorkspaceStats(); };
  const start = () => { tick(); timer = window.setInterval(tick, 30000); };
  start();
  document.addEventListener("visibilitychange", tick);
  return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
}, []);
```

### 2.8 Module-level singleton `ydoc` loads everywhere
**Problem (collab.ts:13):** `ydoc` is created at import and pulled into every route transitively importing the platform; also prevents per-room doc lifecycle.

**Fix:** keep a default app-state doc, but **lazily create a per-room doc** behind a provider for actual collaboration content (comments/chat/changes), so the heavy collaborative doc + y-indexeddb only mount on `/dashboard/collaborative`. See §4.1.

---

## 3. Offline gaps → how to close them

| Gap | Closure |
|---|---|
| `ws`, `lib0`, `y-protocols` missing from package.json → LAN server crashes | Add all three as explicit deps; pin versions; add a `lan:doctor` script that imports them to fail fast. |
| No durable CRDT persistence (BroadcastChannel = RAM only) | Add **y-indexeddb** in renderer; gate UI on `provider.whenSynced`. For Electron, optionally persist room docs to disk/SQLite via Hocuspocus. |
| Screen persists nothing (pure useState) | Move comments/changes/chat into Yjs shared types on a per-room doc backed by y-indexeddb (§4.1). |
| Manual IP entry + brute-force scan | **bonjour-service** mDNS advertise/discover in Electron main + UDP-broadcast fallback. |
| LAN hub requires manual `npm run lan-server` | Embed **@hocuspocus/server** in Electron main (utility process) so the hub is in-app and offline-by-default; keep lan-server.mjs as a CLI fallback for browser-only builds. |
| No cross-origin isolation for collab worker | Set COOP:same-origin + COEP:require-corp on the Electron custom protocol; run CRDT decode in a SharedArrayBuffer-backed worker. |
| File-drop needs HTTP sidecar | In single-Electron mode, write dropped files to a local inbox via IPC to main, not HTTP. |

All recommended additions (`y-indexeddb`, `y-protocols`, `ws`, `lib0`, `@hocuspocus/server`, `bonjour-service`, `loro-crdt`) are MIT, run fully offline, and are bundled/cached once — no runtime network.

---

## 4. Better architecture & implementation (step-by-step, code-heavy)

### 4.1 A per-room collaboration doc with offline persistence + a provider

Create a single source of truth that the screen consumes.

```ts
// src/platform/collab/room.ts
"use client";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

export interface RoomDoc {
  doc: Y.Doc;
  comments: Y.Array<Y.Map<unknown>>;
  changes: Y.Array<Y.Map<unknown>>;
  chat: Y.Array<Y.Map<unknown>>;
  meta: Y.Map<unknown>;
  whenStored: Promise<unknown>;
  destroy(): void;
}

const rooms = new Map<string, RoomDoc>();

export function getRoomDoc(roomId: string): RoomDoc {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(`dn-room-${roomId}`, doc);
  const room: RoomDoc = {
    doc,
    comments: doc.getArray("comments"),
    changes: doc.getArray("changes"),
    chat: doc.getArray("chat"),
    meta: doc.getMap("meta"),
    whenStored: persistence.whenSynced,
    destroy: () => { persistence.destroy(); doc.destroy(); rooms.delete(roomId); },
  };
  rooms.set(roomId, room);
  return room;
}
```

A React context provider that mounts only on the collaborative route:
```tsx
// src/platform/collab/room-provider.tsx
"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getRoomDoc, type RoomDoc } from "./room";

const RoomCtx = createContext<RoomDoc | null>(null);
export const useRoom = () => {
  const r = useContext(RoomCtx);
  if (!r) throw new Error("useRoom outside RoomProvider");
  return r;
};

export function RoomProvider({ roomId, children }: { roomId: string; children: React.ReactNode }) {
  const room = useMemo(() => getRoomDoc(roomId), [roomId]);
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; room.whenStored.then(() => live && setReady(true)); return () => { live = false; }; }, [room]);
  if (!ready) return <RoomSkeleton />; // hydrating from IndexedDB
  return <RoomCtx.Provider value={room}>{children}</RoomCtx.Provider>;
}
```

Wire the route:
```tsx
// src/app/dashboard/collaborative/page.tsx
"use client";
import { RoomProvider } from "@/platform/collab/room-provider";
import CollaborationScreen from "@/features/collaboration/screens/CollaborationScreen";

export default function Page() {
  return (
    <RoomProvider roomId="telecom-default">
      <CollaborationScreen />
    </RoomProvider>
  );
}
```

### 4.2 Rewire the screen handlers to the CRDT (replace mock useState)

```ts
// inside CollaborationScreen, replace local comment state
const room = useRoom();

const comments = useYArray(room.comments,
  (arr) => arr.map((m) => m.toJSON() as Comment),
  shallowArrayEqual);

const handleAddComment = useCallback(() => {
  if (!access.permissions.canEditComments || !newComment.trim()) return;
  const m = new Y.Map<unknown>();
  room.doc.transact(() => {
    m.set("id", `c-${Date.now()}`);
    m.set("authorId", myPeer.id);
    m.set("content", newComment.trim());
    m.set("timestamp", Date.now());
    m.set("cell", commentCell.trim() || null);
    m.set("resolved", false);
    m.set("type", commentType);
    room.comments.unshift([m]);          // CRDT insert → syncs to peers + IndexedDB
  });
  setNewComment(""); setCommentCell("");
}, [room, access, newComment, commentCell, commentType, myPeer]);

const handleResolve = useCallback((id: string) => {
  room.doc.transact(() => {
    for (const m of room.comments) if (m.get("id") === id) m.set("resolved", true);
  });
}, [room]);
```
Chat and changes follow the same pattern (`room.chat.push`, `room.changes.push`). Reactions become a nested `Y.Map<number>` keyed by emoji so concurrent reactions merge instead of clobbering — a genuine CRDT win over the current `.map()` clobber logic.

### 4.3 Presence: raw Awareness hook + throttled cursors

```ts
// src/platform/collab/use-awareness.ts
import { useSyncExternalStore } from "react";
import type { Awareness } from "y-protocols/awareness";

export function useAwarenessPeers<T>(awareness: Awareness, select: (states: Map<number, any>) => T): T {
  let cache = select(awareness.getStates());
  return useSyncExternalStore(
    (cb) => {
      const onMembership = () => { cache = select(awareness.getStates()); cb(); };
      awareness.on("change", onMembership);
      return () => awareness.off("change", onMembership);
    },
    () => cache, () => cache,
  );
}
```
Hub-side membership is immediate; cursor overlays subscribe separately and read a throttled snapshot (§2.3/2.4).

### 4.4 Embed the hub in Electron main (offline-by-default)

Replace the manual `npm run lan-server` step with an embedded Hocuspocus hub plus mDNS:
```ts
// electron/collab-hub.ts (runs in main / utility process)
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database"; // SQLite/file persistence
import { Bonjour } from "bonjour-service";

export function startHub({ port = 1234, pairingCode }: { port?: number; pairingCode: string }) {
  const hub = Server.configure({
    port,
    async onAuthenticate({ token }) { if (token !== pairingCode) throw new Error("bad code"); },
    extensions: [ new Database({ /* fetch/store room updates to better-sqlite3 */ }) ],
  });
  hub.listen();
  const bonjour = new Bonjour();
  bonjour.publish({ name: "Data Navigator LAN", type: "dn-collab", port });
  return { stop: () => { hub.destroy(); bonjour.destroy(); } };
}
```
Renderer discovery becomes event-driven (no 254-host scan):
```ts
const bonjour = new Bonjour();
bonjour.find({ type: "dn-collab" }, (svc) => addCandidate(`ws://${svc.referer.address}:${svc.port}`));
```
Keep `scripts/lan-server.mjs` (now with declared deps) as the **browser-only** fallback hub.

### 4.5 Move CRDT decode + scan off the main thread

A collab worker owns the Yjs doc apply/encode and the (fallback) subnet scan; the renderer talks to it via Comlink and only receives projected, virtualization-ready slices. This keeps awareness/CRDT churn off the UI thread on medium-end CPUs and pairs with COOP/COEP for SharedArrayBuffer threads in Electron.

### 4.6 Optional: Loro trial behind a flag (history/branching)

If "time-travel the report state" or branch/merge of a shared report becomes a requirement, spike `loro-crdt` (v1.13.1, ~5.7k stars, MIT) using its **EphemeralStore** for presence and version vectors for history. Tradeoff: ~180kB WASM vs Yjs's ~18kB no-WASM. Keep Yjs as default; gate Loro behind a feature flag and a worker so the WASM never loads on machines that don't use history.

---

## 5. Recommended dependencies (verified)

| Dep | Stars | Maintenance | License | Offline | Why | URL |
|---|---|---|---|---|---|---|
| yjs (keep) | ~19-22k | Very active, v13.6 | MIT | yes | Substrate; ~18kB no-WASM, low memory | https://github.com/yjs/yjs |
| y-indexeddb (ADD) | y-crdt org | Active | MIT | yes | Durable offline CRDT log; closes #1 gap | https://github.com/yjs/y-indexeddb |
| y-protocols (ADD explicit) | y-crdt org | Active | MIT | yes | Awareness + sync; used by server, undeclared | https://github.com/yjs/y-protocols |
| ws (ADD — missing) | ~22k | Very active | MIT | yes | LAN server runtime; currently crashes without it | https://github.com/websockets/ws |
| lib0 (ADD explicit) | ~0.4k | Active (Yjs author) | MIT | yes | Encoding used by server; make direct | https://github.com/dmonad/lib0 |
| @hocuspocus/server (ADD) | ~2.4k | Very active, v4.x | MIT | yes | Embedded Electron-main hub + SQLite persistence | https://github.com/ueberdosis/hocuspocus |
| bonjour-service (ADD) | ~0.4k | Active | MIT | yes | mDNS auto-discovery; kills 254-host scan | https://github.com/onlxltd/bonjour-service |
| @tanstack/react-virtual (ADD) | ~5.5k | Very active, v3 | MIT | yes | Virtualize audit/chat/comments/changes | https://github.com/TanStack/virtual |
| comlink (present) | ~12.6k | Active | Apache-2.0 | yes | Worker RPC for decode/scan offload | https://github.com/GoogleChromeLabs/comlink |
| loro-crdt (TRIAL) | ~5.7k | Very active, v1.13.1 (Jun 2026) | MIT | yes | High-perf CRDT + history + EphemeralStore presence | https://github.com/loro-dev/loro |
| y-webrtc (TRIAL) | y-crdt org | Active (mesh, ~20-35 peer cap) | MIT | partial | Optional serverless P2P fallback | https://github.com/yjs/y-webrtc |

**Rejected (radar-aligned):** ElectricSQL / PowerSync / Zero / Convex (server+Postgres sync engines — violate offline-only); @mlc-ai/web-llm (irrelevant here); @automerge/automerge as a swap (heavier/slower than Yjs, no reason to migrate).

---

## 6. CLIs & tools (offline)

- **wscat** — `wscat -c "ws://192.168.1.10:1234/telecom-default?pairingCode=123456&peerId=t&peerName=t&role=editor"` to confirm the hub accepts/refuses connections without the UI.
- **@hocuspocus/server** local — boot the embedded hub and connect two browser tabs to validate multi-peer sync + persistence offline.
- **size-limit** (`@size-limit/preset-app`) — add a per-route budget for `/dashboard/collaborative` and a per-worker budget for the collab worker; assert Yjs+providers don't leak into unrelated routes.
- **vitest + tinybench** — bench CRDT apply/encode and audit-parse in a worker to prove the off-main-thread move (commit results as a CI report).
- **react-scan** — visually confirm that `useYMapKey`/throttled awareness removed the whole-tree re-renders.
- **@axe-core/playwright** — a11y-gate comment threads, presence avatars, and an `aria-live` region for incoming chat, offline vs localhost.
- **knip / dependency-cruiser** — after consolidation, prove the old mock paths are gone and the screen depends on `platform/collab`.

---

## 7. Phased task list

### P1 — Make it real and durable (correctness, no new UX)
1. Add missing deps: `ws`, `lib0`, `y-protocols`, `y-indexeddb`. Add `lan:doctor` script importing them. Verify `npm run lan-server` boots. (Closes the "doesn't run offline" defect.)
2. Add `room.ts` + `RoomProvider` with **y-indexeddb** persistence; gate on `whenStored`. Mount only on `/dashboard/collaborative`.
3. Rewire `CollaborationScreen` handlers (comments/changes/chat/reactions) to the per-room Yjs doc; delete the mock `useState` arrays and `INITIAL_*` constants.
4. Replace `useYMap` whole-snapshot hook with `useYMapKey` / `useYArray` selector hooks (useSyncExternalStore).
5. Connect the LAN provider (`connectLAN`) to the collaborative room and render the real peer list/presence on the screen (reuse logic from `lan-control-center.tsx`).

### P2 — Performance hardening
6. Virtualize audit, chat, comments, changes with `@tanstack/react-virtual`.
7. Throttle awareness emit; split membership vs cursor channels; stop double-writing cursors into `sharedPresence`.
8. Convert `readLANAudit` to incremental delta apply (no full re-parse).
9. Gate the 30s stats interval on `visibilitychange`; prefer mutation-driven recompute.
10. Move CRDT decode + fallback subnet scan into a Comlink worker; set COOP/COEP on the Electron protocol for SAB threads.

### P3 — Offline UX + trials
11. Embed **@hocuspocus/server** in Electron main with SQLite persistence; expose start/stop via IPC; keep `lan-server.mjs` as browser-only fallback.
12. Add **bonjour-service** mDNS advertise/discover + UDP-broadcast fallback; make `scanLANSubnet` the last resort.
13. Local file-drop via IPC to a main-process inbox in single-Electron mode (no HTTP sidecar dependency).
14. **TRIAL:** flag-gated `loro-crdt` spike for report-state history/branching with EphemeralStore presence (worker-isolated, WASM lazy).
15. **TRIAL:** `y-webrtc` serverless P2P path for ad-hoc 2-peer sessions where no hub is running.

### Verification gate (every phase)
- `size-limit` per-route/worker budgets green.
- `react-scan` shows no whole-tree re-render on remote cursor ticks.
- Two-tab + two-machine offline sync test: add comment on A → appears on B; reload A → comment persists (y-indexeddb); kill network entirely → still works on LAN hub.
- `knip`/`dependency-cruiser` confirm mock paths removed and no forbidden cloud deps.
