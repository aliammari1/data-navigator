# Tech Radar Brief — Local-first realtime collaboration without a cloud for data-navigator (Yjs ecosystem, Automerge, Loro, ElectricSQL/PowerSync, presence/awareness, CRDT performance, P2P over LAN in Electron)

## Key findings

- Yjs is the clear default for an offline-first Electron app: ~22k stars, MIT, actively maintained (v13.6.31, May 2026), tiny ~18kB pure-JS bundle (no WASM), and the project already depends on yjs + y-websocket. It needs no cloud and runs entirely in-process.
- For full offline persistence with zero internet, the winning Yjs stack is y-indexeddb (renderer) or a custom Electron-main file/SQLite persistence + IndexeddbPersistence whenStored gate. y-indexeddb is part of the y-crdt org, MIT, and stores binary update logs locally with periodic compaction.
- Presence/awareness is solved natively by y-protocols Awareness (MIT, bundled with Yjs). It is a state-based, network-agnostic ephemeral CRDT (Map<clientID,state>, 30s timeout) carrying cursors/selection/user color, broadcast over the same provider. No separate presence service is needed; y-presence is a thin React wrapper and is optional/largely unmaintained, so prefer raw Awareness + your own hook.
- P2P over LAN with NO internet is achievable two ways: (A) y-webrtc pointed at a LOCALLY-bundled signaling server (its ./bin/server.js, MIT) on the LAN, or (B) y-websocket against a Hocuspocus server you run inside the Electron main process. WebRTC public signaling/STUN must be disabled; on locked-down LANs WebRTC NAT/mDNS can be blocked, so a bundled WebSocket hub is the more reliable offline default.
- Hocuspocus v4 (ueberdosis, ~2.4k stars, MIT, v4.1.2 June 2026) is the recommended self-hosted Yjs backend. v4 dropped the hard Node/ws coupling for crossws and supports awareness multiplexing + pluggable persistence (SQLite/LevelDB/file). It can be embedded in the Electron main process as a localhost/LAN hub with zero external dependencies.
- CRDT performance ranking (crdt-benchmarks / 2026 data): Loro fastest and smallest encoded docs (e.g. ~290ms/260k edits, ~68kB encoded, ~15MB mem), Yjs strong second (~430ms, ~160kB, ~28MB), Automerge slowest/heaviest (~680ms, ~250kB, ~41MB) though 3.x cut memory ~10x. For a medium-end PC, Yjs's no-WASM, low-memory profile and mature ecosystem make it the safer pick over WASM-heavy Loro/Automerge.
- Loro (loro-dev, ~5.7k stars, MIT, 1.x stable, v1.13.x June 2026) is the strongest TRENDING alternative: best raw perf, rich-text (Peritext/Fugue), built-in version control (git-like history) and EphemeralStore for presence. Trade-off: ~180kB WASM, younger ecosystem, fewer editor bindings. Worth a spike if data-navigator needs document history/branching, but not a default replacement for Yjs today.
- ElectricSQL and PowerSync are the wrong tool for this constraint set: both are Postgres<->SQLite SYNC ENGINES that require a server/cloud sync service and a Postgres backend. ElectricSQL explicitly puts offline + client persistence out of scope; PowerSync has first-class offline but still needs its sync service + Postgres. Neither is a pure peer-to-peer, no-server, offline-only collaboration layer. Reject for the cloudless requirement; CRDTs (Yjs/Loro) are the correct primitive.
- Automerge (6.3k stars, MIT, v3.x) remains the best choice only if you need rich document history/time-travel and don't mind a ~320kB WASM bundle and higher memory. For data-navigator's medium-end target and existing Yjs investment, it is not recommended over Yjs.
- LAN peer discovery for the WebSocket/WebRTC hub: use mDNS/Bonjour (bonjour-service or node-dns-sd, both pure-JS MIT) to advertise/discover the Electron hub on the LAN, with a UDP-broadcast fallback since some routers/APs drop multicast. This lets peers auto-find each other offline without typing IPs.

## Dependencies evaluated

| Package | Stars | Maintenance | License | Offline | Role / replaces | URL |
|---|---|---|---|---|---|---|
| `yjs` | 22k | Very active; v13.6.31 May 2026, 2200+ commits, 197 releases | MIT | yes | Core CRDT engine for shared data types (Map/Array/Text/XML). The collaboration substrate; already a project dependency. | https://github.com/yjs/yjs |
| `y-indexeddb` | part of y-crdt org (yjs 22k) | Active within y-crdt org, MIT, periodic releases | MIT | yes | Browser/renderer offline persistence: stores Yjs binary updates in IndexedDB with compaction; instant local load, syncs diffs when a provider connects. | https://github.com/yjs/y-indexeddb |
| `y-protocols (Awareness)` | part of y-crdt org | Active, MIT, bundled with Yjs ecosystem | MIT | yes | Native presence/awareness: ephemeral state-based CRDT for cursors, selection, user identity/color. Replaces any separate presence service. | https://github.com/yjs/y-protocols |
| `y-websocket` | part of y-crdt org | Active; v3.x, MIT | MIT | partial | Client provider for a WebSocket hub (works fully offline against a LAN/localhost server you ship, e.g. Hocuspocus). Already a project dependency. | https://github.com/yjs/y-websocket |
| `y-webrtc` | part of y-crdt org | Active, MIT; includes bundleable signaling server | MIT | partial | P2P provider over WebRTC for true serverless mesh sync. Use with a LOCALLY-bundled signaling server on the LAN; disable public STUN/signaling for offline. | https://github.com/yjs/y-webrtc |
| `@hocuspocus/server` | 2.4k | Very active; v4.1.2 June 2026, 1960+ commits | MIT | yes | Self-hosted Yjs WebSocket backend embeddable in the Electron main process as a localhost/LAN hub; v4 awareness multiplexing + pluggable SQLite/file persistence. | https://github.com/ueberdosis/hocuspocus |
| `loro-crdt` | 5.7k | Very active; 1.x stable, v1.13.x June 2026 | MIT | yes | Trending high-perf CRDT alternative with rich text (Peritext/Fugue), git-like version history, and EphemeralStore presence. Spike candidate if doc history/branching is needed. | https://github.com/loro-dev/loro |
| `@automerge/automerge` | 6.3k | Active; v3.2.6 Apr 2026, Ink&Switch full-time maintainers | MIT | yes | CRDT with strong document history/time-travel and sync protocol. Heavier/slower than Yjs; recommend only if history is the primary need. | https://github.com/automerge/automerge |
| `bonjour-service` | ~0.4k | Active maintained fork of bonjour, pure JS | MIT | yes | mDNS/Bonjour LAN advertise+discover so peers auto-find the Electron hub offline without typing IPs. Pair with UDP-broadcast fallback. | https://github.com/onlxltd/bonjour-service |
| `node-dns-sd` | ~0.2k | Maintained, pure-JS mDNS/DNS-SD, MIT | MIT | yes | Alternative pure-JS mDNS discovery/packet monitor for LAN peer/hub discovery; no native deps (vs node_mdns which needs compilation). | https://github.com/futomi/node-dns-sd |
| `electricsql / @electric-sql/client` | ~8k | Active but pivoted (electric-next) | Apache-2.0 | no | REJECTED for this app: Postgres->SQLite read-path sync engine requiring a sync service + Postgres; offline/client-persistence explicitly out of scope. | https://github.com/electric-sql/electric |
| `@powersync/web` | ~1k | Active, production-grade | FSL/OSL (source-available, not fully permissive) | no | REJECTED for cloudless target: best-in-class offline sync but needs the PowerSync service + Postgres/Mongo backend; not a serverless P2P collaboration layer. | https://github.com/powersync-ja/powersync-js |

## Brief

# Offline-First Realtime Collaboration for data-navigator — Tech Radar Brief

**Scope:** Add local-first, cloudless realtime collaboration (multi-window / multi-peer over LAN) to a Next.js 16 + Electron, on-device data-analysis app. Target hardware: 4–8 cores, 8–16 GB RAM, WebGPU often absent. Everything must run with **no internet at runtime** — no SaaS sync service, no hosted signaling, no telemetry.

**Bottom line up front:** Stay on **Yjs**. It already ships in `package.json` (`yjs ^13.6.31`, `y-websocket ^3.0.0`), is the most mature CRDT, is pure-JS (no WASM weight on a medium PC), and every offline/presence/P2P requirement is satisfiable inside the Electron process with **MIT** building blocks. The Postgres-sync engines (**ElectricSQL**, **PowerSync**) are the wrong category and are rejected. **Loro** is the one alternative worth watching/spiking — only if you need git-like document history.

---

## 1. The constraint filter (why most of the buzz is irrelevant here)

The local-first space has two fundamentally different architectures, and they get conflated constantly:

| Architecture | Examples | Needs a server you DON'T ship? | Fit for cloudless Electron |
| --- | --- | --- | --- |
| **CRDT libraries** (peer-merge data structures) | Yjs, Automerge, Loro | No — pure libraries; transport is pluggable and can be P2P/localhost | ✅ Correct primitive |
| **Sync engines** (DB replication services) | ElectricSQL, PowerSync, Zero | **Yes** — a sync service + a backend Postgres/Mongo | ❌ Violates offline-only |

ElectricSQL/PowerSync/Zero are excellent *if you have a central Postgres and want clients to mirror it offline-capable*. data-navigator has **no central database and no cloud** — it is a desktop app where peers on a LAN (or even just multiple Electron windows / a future "share my analysis session" feature) need to converge. That is exactly what CRDTs are for, and exactly what sync engines are **not** for.

- **ElectricSQL**: explicitly states offline + client-side persistence is *out of scope*; it's a Postgres→SQLite read-path replication layer. Requires running the Electric sync service. **Reject.**
- **PowerSync**: best-in-class *offline* support and battle-tested at scale, but still requires the PowerSync service + a Postgres/Mongo backend, and its license is source-available (FSL/OSL), not permissive MIT/Apache. **Reject for this app.**

These remain on the radar only as a note: *if data-navigator ever grows a central team server, PowerSync is the sync engine to evaluate.* For the stated cloudless requirement, they are out.

---

## 2. CRDT engine selection — Yjs vs Automerge vs Loro

### 2.1 Verified signals (June 2026)

| Lib | Stars | Latest | License | Bundle | Lang/Runtime | Maintenance |
| --- | --- | --- | --- | --- | --- | --- |
| **Yjs** | **~22k** | v13.6.31 (May 2026) | MIT | **~18 kB** min+gz | **Pure JS, no WASM** | Very active, 2200+ commits, 197 releases |
| **Loro** | ~5.7k | v1.13.x (Jun 2026) | MIT | ~180 kB WASM | Rust→WASM | Very active, 1.0 stable, 137 releases |
| **Automerge** | ~6.3k | v3.2.6 (Apr 2026) | MIT | ~320 kB WASM | Rust→WASM | Active, Ink&Switch full-time |

npm weekly downloads tell the adoption story bluntly: **Yjs ~920k**, Automerge ~85k, Loro ~12k.

### 2.2 Performance (crdt-benchmarks "B4 real-world editing", 260k edits)

| Metric | Yjs | Automerge | Loro |
| --- | --- | --- | --- |
| Apply 260k edits | 430 ms | 680 ms | **290 ms** |
| Encode doc | 4 ms | 12 ms | **2 ms** |
| Decode doc | 8 ms | 45 ms | **5 ms** |
| Encoded size | 160 kB | 250 kB | **68 kB** |
| Loaded memory | 28 MB | 41 MB | **15 MB** |

Loro wins on raw numbers in nearly every category; Automerge is consistently the heaviest (3.x improved memory ~10x but it's still last). **But raw CRDT throughput is almost never the bottleneck** for a data-analysis app — you're not editing 260k characters of prose, you're collaborating on dashboard layout, chart configs, filters, annotations, and cursor presence. Those are small documents updated interactively.

### 2.3 Decision for a medium-end, WebGPU-often-absent PC

**Choose Yjs.** Reasoning weighted to the actual constraints:

1. **No WASM tax.** Loro/Automerge ship 180–320 kB of WASM that must be fetched, compiled, and JIT-warmed on every cold start. On an 8 GB integrated-GPU machine, the pure-JS ~18 kB Yjs path has lower memory, faster startup, and no WASM-instantiation jank. This is the single biggest reason to prefer Yjs on the target hardware.
2. **Ecosystem depth.** Yjs has the providers (`y-indexeddb`, `y-websocket`, `y-webrtc`), the native awareness protocol, and editor bindings (Monaco — already a dep via `@monaco-editor/react`, ProseMirror, CodeMirror). Loro's ecosystem is young; you'd write integrations yourself.
3. **Already adopted.** `yjs` and `y-websocket` are in the lockfile. Zero migration cost.
4. **Risk.** Yjs is used by Linear, Evernote, and many production apps; it is the conservative, correct default.

**When to reconsider:** if data-navigator needs **first-class document history / time-travel / branching** of analysis documents (e.g., "fork this dashboard," "see who changed this filter and roll back"), then **Loro** becomes compelling — its git-like versioning and EphemeralStore presence are purpose-built for that, and it's MIT and 1.0-stable. Spike it behind a feature flag; do not rip out Yjs preemptively. **Automerge** is only justified if you specifically want its mature change-graph/history model and accept the bundle/memory cost — given Loro now beats it on perf *and* offers history, Automerge is a weak middle option here.

---

## 3. Offline persistence (no internet, ever)

Two layers, both local:

### 3.1 Renderer-side: `y-indexeddb`
Stores the Yjs update log in IndexedDB; the document is available instantly on load, and only diffs sync when a provider connects. MIT, part of the y-crdt org.

```ts
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

const doc = new Y.Doc()
const persistence = new IndexeddbPersistence('dn:dashboard:42', doc)

// Gate UI on local load so offline-first feels instant
await new Promise<void>((resolve) => persistence.once('synced', () => resolve()))
// doc is now hydrated from disk — no network involved
```

### 3.2 Electron-main alternative: file/SQLite persistence
For desktop you often want the canonical document on disk (portable, backup-able, outside the browser sandbox). Persist `Y.encodeStateAsUpdate(doc)` to a file or to `better-sqlite3` (already a dependency) keyed by document id, with periodic compaction. This pairs naturally with an embedded Hocuspocus hub (§5).

```ts
// main process
import Database from 'better-sqlite3'
import * as Y from 'yjs'

const db = new Database('collab.sqlite')
db.exec('CREATE TABLE IF NOT EXISTS ydocs (id TEXT PRIMARY KEY, state BLOB)')

export function loadDoc(id: string, doc: Y.Doc) {
  const row = db.prepare('SELECT state FROM ydocs WHERE id=?').get(id) as { state: Buffer } | undefined
  if (row) Y.applyUpdate(doc, new Uint8Array(row.state))
}
export function saveDoc(id: string, doc: Y.Doc) {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc))
  db.prepare('INSERT INTO ydocs(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=?')
    .run(id, state, state)
}
```

OPFS is also viable for renderer-side large binary state, but IndexedDB via `y-indexeddb` is the path of least resistance and is well-tested.

---

## 4. Presence & awareness (cursors, selection, "who's here")

**Use the native Yjs Awareness protocol from `y-protocols`.** It is a network-agnostic, *state-based ephemeral CRDT*: every client owns one entry in a `Map<clientID, state>`; entries not refreshed within ~30 s are dropped; an incoming entry is applied only if its clock is strictly greater. It carries any JSON-encodable state — cursor position, selection range, username, color, current view/tab. It rides the same provider you already use (WebSocket or WebRTC), so there's nothing extra to host.

```ts
import { WebsocketProvider } from 'y-websocket'

const provider = new WebsocketProvider('ws://192.168.1.50:1234', 'dn:dashboard:42', doc)
const awareness = provider.awareness

awareness.setLocalStateField('user', { name: 'Ali', color: '#6e56cf' })
awareness.setLocalStateField('cursor', { chartId, x, y }) // app-specific presence

awareness.on('change', () => {
  const peers = [...awareness.getStates().entries()]
    .filter(([id]) => id !== awareness.clientID)
  renderRemoteCursors(peers) // throttle this; presence updates are frequent
})
```

**Do not add `y-presence`** as a hard dependency — it's a thin, largely stale React wrapper over Awareness. Write a tiny `useAwareness()` Zustand/React hook yourself (you already use `zustand ^5`); it's ~30 lines and you control re-render throttling, which matters on a medium-end CPU. Loro's equivalent is `EphemeralStore` (same last-write-wins-by-timestamp idea) if you ever move to Loro.

**Performance note:** throttle/debounce cursor broadcasts to ~30–60 ms and batch remote-cursor rendering with `requestAnimationFrame`; raw awareness change events can fire hot and cause main-thread churn.

---

## 5. P2P / multi-peer over LAN — no internet, no public servers

Three viable topologies; pick based on how locked-down the LAN is.

### Option A (recommended default): Embedded WebSocket hub via **Hocuspocus** in the Electron main process
Run `@hocuspocus/server` (MIT, v4.1.2, ~2.4k stars) **inside Electron's main process** bound to the LAN interface. v4 dropped the hard `ws`/Node coupling for `crossws`, supports **awareness multiplexing**, and has pluggable persistence (wire it to the SQLite store from §3.2). One Electron instance acts as host/hub; other peers connect with `y-websocket`. Fully offline, single binary, no external infra.

```ts
// main process — embedded collaboration hub
import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'

const hub = new Server({
  port: 1234,
  address: '0.0.0.0', // LAN-reachable
  extensions: [
    new Database({
      fetch: async ({ documentName }) => loadStateBytes(documentName), // from sqlite
      store: async ({ documentName, state }) => saveStateBytes(documentName, state),
    }),
  ],
})
await hub.listen()
```

Pros: most reliable on real networks (TCP/WebSocket isn't dropped the way multicast/WebRTC often is), trivially persistent, supports auth hooks if you later want a join code. Cons: star topology (one host); if the host quits, elect a new one or fall back to Option B.

### Option B: True mesh with **y-webrtc** + a *locally bundled* signaling server
`y-webrtc` (MIT) gives a serverless P2P mesh, but WebRTC still needs a signaling rendezvous. Ship its `./bin/server.js` and run it locally; point all clients at `ws://<lan-host>:4444`. **Critically: disable public STUN/signaling** for offline operation.

```ts
import { WebrtcProvider } from 'y-webrtc'

new WebrtcProvider('dn:dashboard:42', doc, {
  signaling: ['ws://192.168.1.50:4444'], // LAN-bundled signaling ONLY
  peerOpts: { config: { iceServers: [] } }, // no public STUN; rely on host candidates on LAN
})
```

Pros: no single host owns the document; resilient mesh. Cons: WebRTC on corporate/guest Wi-Fi frequently fails — client isolation, multicast/mDNS disabled, NAT hairpinning. Treat as an enhancement, not the primary path.

### Option C: Multiple Electron windows / same machine
For "collaborate across windows of one app" you don't even need the network — use a `BroadcastChannel` provider (`y-protocols` ships one) or relay updates over Electron IPC between renderer processes. Near-zero overhead.

### LAN peer discovery (so users don't type IPs)
Advertise the hub via **mDNS/Bonjour** using `bonjour-service` or `node-dns-sd` (both pure-JS, MIT, no native compilation — avoid `node_mdns`/`mdns` which need build toolchains and break Electron packaging). Because real networks drop multicast, layer a **UDP broadcast** fallback and, last resort, a subnet scan.

```ts
// main process — advertise + discover the collab hub on the LAN
import { Bonjour } from 'bonjour-service'
const bonjour = new Bonjour()
bonjour.publish({ name: 'data-navigator-hub', type: 'dn-collab', port: 1234 })
bonjour.find({ type: 'dn-collab' }, (svc) => connectPeer(svc.addresses?.[0], svc.port))
```

**Recommendation:** ship **Option A (embedded Hocuspocus hub)** as the default offline LAN path, with **Option B (y-webrtc)** available as an opt-in mesh and **Option C** for same-machine multi-window. Use mDNS + UDP-broadcast for discovery, with a manual "enter host code/IP" fallback for hostile networks.

---

## 6. Recommended stack (final)

```
Engine:        yjs (already present)            — MIT, ~18kB, no WASM
Persistence:   y-indexeddb (renderer)           — MIT
               + better-sqlite3 (main, present) — for canonical on-disk state
Presence:      y-protocols Awareness            — MIT, native, no extra service
               + custom useAwareness() hook (zustand, present)
Transport A:   @hocuspocus/server (embedded)    — MIT, default LAN hub
               + y-websocket (client, present)
Transport B:   y-webrtc + bundled signaling     — MIT, opt-in mesh
Transport C:   BroadcastChannel / IPC           — same-machine windows
Discovery:     bonjour-service (mDNS) + UDP broadcast fallback — MIT, pure JS
Watch / spike: loro-crdt                        — MIT, only if doc history/branching needed
Rejected:      ElectricSQL, PowerSync, Automerge(as default)
```

### Why this passes every hard constraint
- **Offline-only:** every component runs in-process or on the LAN; the only "server" is one you bundle and run inside Electron. No SaaS, no hosted signaling, no STUN, no telemetry.
- **Medium-end PC:** pure-JS Yjs (no WASM compile), low memory (~28 MB even at 260k edits, far less for typical app docs), throttled presence, SQLite persistence in main process keeps the renderer light. WebGPU irrelevant — none of this touches the GPU.
- **Mature/permissive:** all chosen deps are MIT, active within the last weeks (Yjs/Hocuspocus released in May–June 2026), multi-maintainer (y-crdt org, ueberdosis), and high-signal (Yjs 22k stars).

---

## 7. Migration / integration notes

1. **Model your collaborative state as Yjs types from day one.** Map dashboard config → `Y.Map`, chart list → `Y.Array<Y.Map>`, annotations/notes → `Y.Text`. Keep ephemeral UI state (hover, transient selection) in Awareness, **not** in the doc — it shouldn't persist or merge.
2. **Bridge Yjs ↔ Zustand.** Subscribe to `doc` observe events to push into your existing Zustand stores for rendering, and write user actions back into Yjs types. Use `immer` (already a dep) carefully — mutate Yjs types via their APIs, not via Immer drafts.
3. **Persistence ordering.** Always `await persistence 'synced'` before connecting a network provider, so local offline state loads first and then reconciles — this is what makes it feel instant offline.
4. **Throttle presence and remote-cursor rendering** (rAF + ~40 ms debounce) to protect the main thread on integrated-GPU machines.
5. **Host election for Option A.** If the hub host closes the app, detect via mDNS disappearance and promote another peer to host, replaying its `y-indexeddb` state into a fresh Hocuspocus hub. Keep a small state machine for this (xstate is already a dep).
6. **Loro spike (optional):** if history/branching is greenlit, prototype Loro behind a flag, mapping the same logical schema; keep an export path (`Y.encodeStateAsUpdate` ↔ Loro snapshot) so you can A/B without data loss. Don't dual-run both engines in production.
7. **Packaging gotcha:** prefer pure-JS mDNS (`bonjour-service`) to avoid native rebuilds in `electron-forge`; native `mdns`/`node_mdns` require platform toolchains and complicate the Windows MSIX/Squirrel makers already configured.

---

## 8. Risk register
- **WebRTC on hostile LANs (Option B):** multicast/client-isolation frequently blocks it → mitigated by defaulting to the WebSocket hub (Option A).
- **Hub single point of failure (Option A):** mitigated by host election + local persistence on every peer.
- **Loro ecosystem youth:** mitigated by keeping it spike-only behind a flag.
- **Awareness churn on slow CPUs:** mitigated by throttling/rAF batching.
- **Large analysis documents:** Yjs handles these fine in memory; if a single collaborative doc grows huge, snapshot/compact via `Y.encodeStateAsUpdate` and consider Loro's smaller encoded size as the trigger to migrate.

---

### Sources
- Yjs repo & docs: https://github.com/yjs/yjs , https://docs.yjs.dev/
- y-protocols / Awareness: https://github.com/yjs/y-protocols , https://docs.yjs.dev/api/about-awareness
- y-webrtc: https://github.com/yjs/y-webrtc ; y-indexeddb: https://github.com/yjs/y-indexeddb
- Hocuspocus: https://github.com/ueberdosis/hocuspocus
- CRDT comparison (Yjs/Automerge/Loro, 2026): https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026
- crdt-benchmarks: https://github.com/dmonad/crdt-benchmarks ; Loro perf: https://loro.dev/docs/performance
- Loro: https://github.com/loro-dev/loro ; Automerge: https://github.com/automerge/automerge
- ElectricSQL vs PowerSync: https://powersync.com/blog/electricsql-electric-next-vs-powersync , https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026
- LAN discovery: https://github.com/onlxltd/bonjour-service , https://github.com/futomi/node-dns-sd