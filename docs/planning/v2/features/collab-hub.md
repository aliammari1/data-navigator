# Feature Plan — collab-hub — Collaboration hub (presence, comments/annotations, approvals, audit trail)

**Maturity:** partial

## Performance issues

- Presence pruning runs setPeers() every 10s with new Map() clones plus a parallel heartbeat interval that itself triggers state churn; combined with Date.now()-based status recomputed on every render in usePresence, the PresenceBar re-renders all avatars on a fixed 10s cadence even when nothing changes.
- PresenceBar.usePresence builds a brand-new `me` object on EVERY render (new joinedAt/lastSeenAt = Date.now()), and CollabHubScreen's useEffect `updatePresence([me, ...peers])` depends on `me`, so it writes to the Zustand store on every render -> render/store-write churn and wasted persist serialization.
- useAnnotations reads localStorage synchronously on mount AND re-reads via loadNotes() inside every mutation (addNote/resolveNote/deleteNote/replyToNote each JSON.parse the whole array), so each annotation action does a full synchronous parse+serialize of the section's note list on the main thread.
- AnnotationsTab does a synchronous JSON.parse of localStorage for all 6 sections during render (inside the component body, not memoized) to compute `hasAny`; every tab switch re-parses up to 6 localStorage keys on the main thread.
- Audit trail filters the full (up to 500-entry) array on every keystroke with no debounce and no memoization; AnimatePresence mode=popLayout + motion.div layout on every row makes large lists expensive, and there is no virtualization so 500 animated rows mount at once.
- Zustand persist serializes the entire collab-hub-store (incl. up to 500 audit events) to localStorage on every addAuditEvent, AND addAuditEvent ALSO writes a second duplicate copy to a separate `audit:events` localStorage key — double JSON.stringify of the whole audit log per event.
- No memoization of derived values: badgeCount object, allUsers array, filtered audit list, avatar hashing all recompute each render; hashColor is called twice per avatar (statusDot helper is dead code).
- motion/react AnimatePresence mode="wait" wraps the whole tab body so switching tabs blocks paint on exit animation; heavy framer-motion layout animations on note cards and audit rows add main-thread work on a medium PC.

## Offline gaps

- This is the biggest gap and it is the inverse of a network problem: the feature claims to be collaborative but is NOT actually multi-user. Presence uses BroadcastChannel ('collab-hub-presence-v1') which only spans tabs in the SAME browser on the SAME machine — two real teammates on two PCs never see each other. The 'session code' is cosmetic (random TXN-1234 string, never transmitted or validated anywhere).
- The repo ALREADY SHIPS a complete offline LAN collaboration stack — src/platform/collab/collab.ts (Yjs doc + BroadcastChannel provider), src/platform/lan/lan-collab.ts (y-websocket provider, awareness presence, peer discovery, subnet scan, pairing codes, file drop, LAN audit), and scripts/lan-server.mjs (a bundled y-protocols sync+awareness WebSocket relay). collab-hub uses NONE of it. It reinvented a weaker, non-CRDT, single-machine version.
- Annotations/comments are stored only in localStorage per-section (`annotations:<id>`), not in the Yjs doc, so they are NEVER synced to teammates and are lost if storage is cleared; no CRDT merge means concurrent edits from two users would silently clobber.
- Approval state and audit trail live only in this machine's localStorage/Zustand; an 'Approved by Bob' decision made on Bob's PC is invisible on Alice's PC. The whole approval workflow is single-player.
- handleShare() builds a `window.location.origin` URL and copies it to clipboard as the 'LAN share' link, but origin in Electron is app:///localhost — that URL is meaningless to another machine. No real shareable artifact is produced; sharing is theater.
- No offline persistence durability story beyond localStorage: no y-indexeddb / OPFS, no quota handling, no navigator.storage.persist(); localStorage is ~5MB and synchronous, and audit is hard-capped at 500 entries with silent truncation.
- Username identity is a free-text localStorage string with no link to the LAN peer identity used elsewhere (lan-collab LANPeer id/color/role), so audit 'user' fields and presence names cannot be trusted or correlated across the app.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `yjs` | CRDT core (already a dependency) | ~17-22k | Very active; v13.6.x | MIT | yes | localStorage annotation/audit silos | Already in package.json and already used by src/platform/collab/collab.ts. Make annotations, approval state, and audit a Y.Doc so they sync over the EXISTING LAN relay and merge conflict-free. No new dep — just stop bypassing it. | https://github.com/yjs/yjs |
| `y-indexeddb` | CRDT offline persistence | ~245 (yjs/y-crdt org) | Active; v9.0.12 | MIT | yes | localStorage annotation/audit/approval persistence | Durable, async, binary-update-log persistence of the collab Y.Doc in the renderer with compaction; survives reload and merges back when the LAN peer reconnects. Replaces brittle synchronous localStorage. Tiny, official Yjs ecosystem. | https://github.com/yjs/y-indexeddb |
| `y-websocket` | CRDT LAN transport (already a dependency) | y-crdt org | Active; v3 | MIT | yes | BroadcastChannel-only 'presence' | Already in package.json and wired in src/platform/lan/lan-collab.ts against scripts/lan-server.mjs (a relay you ship). Reuse it so collab-hub presence/comments/approvals reach other machines on the LAN with zero internet. | https://github.com/yjs/y-websocket |
| `y-protocols (Awareness)` | Ephemeral presence CRDT | y-crdt org | Active | MIT | yes | hand-rolled BroadcastChannel heartbeat/prune presence | Native ephemeral presence (name/color/page/cursor) already consumed by lan-collab.ts. Use raw Awareness behind a thin useAwareness hook instead of BroadcastChannel. Auto-prunes on disconnect; no manual heartbeat/prune intervals needed. Add as explicit dep (currently transitive via y-websocket). | https://github.com/yjs/y-protocols |
| `@tanstack/react-virtual` | List virtualization (already used in data-browser) | ~5.5k | Very active; v3 | MIT | yes | full 500-row mount in AuditTrail | Virtualize the audit trail (up to 500+ rows) and large annotation lists so only visible rows mount. Already used by src/features/data-browser; reuse, do not add new grid libs. | https://github.com/TanStack/virtual |
| `@hocuspocus/server` | Optional Electron-main LAN hub | ~2.4k | Very active; v4 (Node/Bun/Deno) | MIT | yes | custom scripts/lan-server.mjs (optional) | OPTIONAL upgrade path: replace/augment the hand-written scripts/lan-server.mjs with a maintained Yjs backend embeddable in Electron main, with awareness multiplexing + SQLite/file persistence of the collab doc. Document as Trial; only if you want server-side durability + auth hooks. Embeds in main, not the renderer bundle. | https://github.com/ueberdosis/hocuspocus |
| `bonjour-service` | Optional mDNS LAN discovery | ~0.4k | Active | MIT | yes | manual IP entry / subnet scan UX | OPTIONAL: auto-advertise/discover the LAN hub so peers stop typing IP+port (today lan-collab.ts does a 254-host subnet fetch scan). mDNS in Electron main is cleaner; keep the subnet scan as fallback. Trial. Runs in main, not the renderer bundle. | https://github.com/onlxltd/bonjour-service |
| `loro-crdt` | WATCH — high-perf CRDT alt | ~12k | Very active; v1.x | MIT | yes | yjs (only if history/branching needed) | WATCH only. Its EphemeralStore does partial presence updates (Yjs Awareness re-sends full state on every cursor move). Consider ONLY if you later need fine-grained live cursors at scale or doc history/branching. ~180kB WASM is heavier than Yjs; do not adopt now given the existing Yjs investment. | https://github.com/loro-dev/loro |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `scripts/lan-server.mjs (already in repo)` | service-local | yes | Bundled y-protocols sync+awareness WebSocket relay that runs on one LAN PC (npm run lan-server). Reuse it as the collab-hub transport; it already does pairing codes, rooms, audit, file inbox. | https://github.com/yjs/y-websocket |
| `y-websocket WebsocketProvider (dynamic import)` | library | yes | Renderer-side join to the LAN relay; lan-collab.ts already lazy-imports it. Same provider can carry the collab-hub doc room. | https://github.com/yjs/y-websocket |
| `react-scan` | cli | yes | Detect the presence/store render storm described above (PresenceBar re-renders, updatePresence churn) during dev with zero network. | https://github.com/aidenybai/react-scan |
| `size-limit (preset-app)` | cli | yes | Already in repo. Add a per-route budget for /dashboard/collab-hub so the framer-motion-heavy screen + Yjs providers stay within budget. | https://github.com/ai/size-limit |
| `vitest + fake-indexeddb` | library | yes | Unit-test CRDT merge semantics for annotations/approvals offline (apply two concurrent updates, assert convergence) and y-indexeddb persistence without a browser. | https://github.com/dumbmatter/fakeIndexedDB |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Audit INP/CLS of the collab-hub route against localhost to catch the presence-cadence jank and unvirtualized audit list. | https://github.com/GoogleChrome/lighthouse-ci |

---

# data-navigator · `collab-hub` Deep Improvement Plan

> Feature: Collaboration Hub — presence, annotations/comments, approval workflow, audit trail.
> Verdict: **partial**. The UI is polished and the data model is reasonable, but the feature is **single-machine theater**: it advertises real-time multi-user collaboration while running entirely on `BroadcastChannel` (same-browser-only) + `localStorage`. Meanwhile the repo **already ships a full offline Yjs/LAN collaboration stack that this feature ignores.** The headline work is *convergence onto the existing CRDT/LAN infrastructure*, plus standard perf hygiene (kill the render/store-write storm, virtualize the audit list, stop double-writing localStorage).

---

## 1. Current implementation (file-by-file)

### Route
- `src/app/dashboard/collab-hub/page.tsx` — trivial wrapper rendering `CollabHubScreen`.

### Screen
- `src/features/collab-hub/screens/CollabHubScreen.tsx` (509 lines) — tabbed shell: **Presence & Status / Annotations / Approval / Audit**. Tabs are local `useState`. Wraps each tab body in `AnimatePresence mode=\"wait\"`.
  - `AnnotationsTab` (lines 181-195): computes `hasAny` by **synchronously `JSON.parse`-ing `localStorage` for all 6 sections inside the render body** — runs on every tab switch.
  - `SessionCodeDisplay` (199-263): generates a cosmetic `TXN-1234` code. **It is never transmitted, stored on a server, or validated** — pure decoration.
  - `TeamActivityFeed` / `SharedReportsSection` read from the Zustand store.

### Store
- `src/features/collab-hub/store/collab-hub-store.ts` (176 lines) — Zustand + `persist` to `localStorage` (`collab-hub-store`). Holds `username`, `approvalState`, `auditEvents` (capped 500), `presenceUsers`, `sharedReports`, `sessionCode`.
  - `addAuditEvent` (117-136): pushes to store **and** writes a **second duplicate copy** to a separate `audit:events` localStorage key. Every audit event therefore triggers (a) full-store persist serialization (incl. all 500 events) **and** (b) a second standalone `JSON.stringify` of the whole log.
  - `updatePresence` writes the full peer array into transient state (excluded from `partialize`, good — but still set on every render, see §2).

### Components
- `components/PresenceBar.tsx` (420 lines) — `usePresence` hook drives presence over **`BroadcastChannel(\"collab-hub-presence-v1\")`** with manual 10s heartbeat, 5/15-min idle/away thresholds, and a 30s prune interval. **This only reaches other tabs in the same browser on the same machine.** `statusDot` helper (42-49) is dead code. `hashColor` is computed twice per avatar.
- `components/ApprovalWorkflow.tsx` (502 lines) — DRAFT→REVIEW→APPROVED/REJECTED state machine writing to Zustand. `handleShare` (251-271) builds a `window.location.origin` URL and copies it as a \"LAN share\" link — meaningless across machines in Electron.
- `components/AuditTrail.tsx` (362 lines) — filter pills + search + CSV export. Filters the full ≤500-entry array **on every keystroke, unmemoized, undebounced**; renders all matching rows with `motion.div layout` + `AnimatePresence mode=\"popLayout\"`. **No virtualization.**
- `components/StickyNoteAnnotation.tsx` (489 lines) — per-section sticky-note panel with replies, colors, priority, resolve/unresolve. Heavy framer-motion.

### Annotations hook
- `hooks/useAnnotations.ts` (169 lines) — CRUD over `localStorage` key `annotations:<sectionId>`. **Every mutation re-`loadNotes()` (full `JSON.parse`) then `saveNotes()` (full `JSON.stringify`)** on the main thread. No cross-machine sync, no CRDT.

### The infrastructure this feature ignores (critical)
The repo **already has** a working offline collaboration backbone used by the `telecom` and `collaboration` features:
- `src/platform/collab/collab.ts` — a shared `Y.Doc` with maps for filter/tab/mapping/overview/presence and a `sharedAudit` Y.Array, synced cross-tab via a `BroadcastChannel` Yjs provider (`startCollabSync`) and a `useYMap` React hook.
- `src/platform/lan/lan-collab.ts` — a full LAN layer: lazy `y-websocket` `WebsocketProvider`, **Awareness-based presence** (`refreshPeers`), peer roles (host/editor/reviewer/viewer), pairing codes, subnet discovery (`scanLANSubnet`), file drop, and a LAN audit Y.Array.
- `scripts/lan-server.mjs` (452 lines) — a bundled `y-protocols/sync` + `y-protocols/awareness` WebSocket relay (`npm run lan-server`) with rooms, pairing, audit, and a file inbox. **Trusted-LAN, zero internet.**

`collab-hub` reimplemented a weaker subset of all of this on `BroadcastChannel`+`localStorage`. **The plan is to delete the reinvention and adopt the existing stack.**

---

## 2. Performance bottlenecks & exact fixes

### 2.1 Presence render/store-write storm (highest impact)
`usePresence` builds a fresh `me` object every render (`joinedAt/lastSeenAt: Date.now()`), and `PresenceBar` then runs:
```ts
useEffect(() => { updatePresence([me, ...peers]); }, [peers, me, updatePresence]);
```
Because `me` is a new object every render, this effect fires every render → writes Zustand → re-render → new `me` → … a churn loop, plus needless persist work.

**Fix — derive `me` stably and only publish on real change.** When you migrate to Awareness (§4) this disappears entirely (Awareness owns presence, no store writes). Interim fix if you keep the hook:
```ts
const meRef = useRef<PresenceUser>({
  sessionId: sessionIdRef.current, name: username, page: currentPage,
  joinedAt: Date.now(), lastSeenAt: Date.now(), status: \"active\", color: myColor,
});
meRef.current = { ...meRef.current, name: username, page: currentPage, status: myStatus, color: myColor };
useEffect(() => {
  const id = setInterval(() => updatePresence([meRef.current, ...peersRef.current]), 5000);
  return () => clearInterval(id);
}, [updatePresence]);
```

### 2.2 Stop double-writing the audit log
`addAuditEvent` writes both the persisted store and a separate `audit:events` key. **Fix:** delete the second write; the Zustand `persist` already covers it.
```ts
addAuditEvent: (event) => {
  const entry = { ...event, id: makeId(), at: Date.now() };
  set((s) => ({ auditEvents: [entry, ...s.auditEvents].slice(0, 500) }));
  // (removed) duplicate localStorage.setItem(\"audit:events\", …)
},
```
Better still (§4): audit becomes a Yjs `Y.Array` persisted by `y-indexeddb` — no full-array reserialize per event.

### 2.3 Audit trail: debounce, memoize, virtualize
```tsx
const deferredSearch = React.useDeferredValue(search);
const filtered = React.useMemo(
  () => auditEvents.filter(e => {
    const t = filterType === \"all\" || e.type === filterType;
    const q = !deferredSearch ||
      e.description.toLowerCase().includes(deferredSearch.toLowerCase()) ||
      e.user.toLowerCase().includes(deferredSearch.toLowerCase());
    return t && q;
  }),
  [auditEvents, filterType, deferredSearch],
);
```
Virtualize with the already-installed `@tanstack/react-virtual` (used in `data-browser`):
```tsx
const parentRef = React.useRef<HTMLDivElement>(null);
const v = useVirtualizer({ count: filtered.length, getScrollElement: () => parentRef.current,
  estimateSize: () => 64, overscan: 8 });
return (
  <div ref={parentRef} className=\"max-h-[500px] overflow-y-auto pr-1\">
    <div style={{ height: v.getTotalSize(), position: \"relative\" }}>
      {v.getVirtualItems().map(vi => (
        <div key={filtered[vi.index].id}
             style={{ position:\"absolute\", top:0, left:0, width:\"100%\",
                      transform:`translateY(${vi.start}px)` }}>
          <EventRow event={filtered[vi.index]} showDate={false} />
        </div>
      ))}
    </div>
  </div>
);
```
Drop `motion.div layout` + `AnimatePresence mode=\"popLayout\"` for audit rows — they fight virtualization and cost main-thread layout on a medium PC.

### 2.4 AnnotationsTab: stop parsing localStorage in render
Replace the synchronous 6-key `JSON.parse` in the render body with a single subscription to the Yjs annotations map (§4): `hasAny` becomes `ydoc.getMap(\"collabhub:annotations\").size > 0`, observed reactively. Interim: hoist into `useEffect`/`useMemo`.

### 2.5 Memoize derived values & kill dead code
- Wrap `badgeCount`, `allUsers`, `activeCount` in `useMemo`.
- Remove `statusDot` (dead). Compute `hashColor(user.name)` once per avatar and pass down.
- Replace `AnimatePresence mode=\"wait\"` on the tab body (blocks paint on exit) with `mode=\"popLayout\"` or a plain conditional + light fade.

### 2.6 Perf budget
Add a `size-limit` entry for `app/dashboard/collab-hub` and an `@lhci/cli` assertion on INP for the route. The presence cadence + unvirtualized audit list are the two things that will show up.

---

## 3. Offline gaps & how to close them

| Gap | Today | Fix |
|---|---|---|
| **Not actually multi-user** | `BroadcastChannel` = same browser only | Switch presence to **Awareness** over the existing `y-websocket` LAN relay (`scripts/lan-server.mjs`). |
| **Comments not synced** | `localStorage` per section | Move annotations into a Yjs `Y.Map<Y.Array<Y.Map>>` in a shared room; merge conflict-free. |
| **Approval not synced** | Zustand/localStorage | Approval state → Yjs `Y.Map`; transitions become CRDT ops everyone sees. |
| **Audit not synced** | localStorage (×2) | Audit → Yjs `Y.Array` (matches the existing `sharedAudit` pattern in `collab.ts`). |
| **Fake share link** | `window.location.origin` URL | Produce a real LAN join URL via `getLANJoinUrl(settings)` from `lan-collab.ts`. |
| **Cosmetic session code** | random string | Bind to the LAN **room + pairing code** that `lan-collab.ts` already manages. |
| **Fragile persistence** | synchronous `localStorage`, 5MB cap, 500-entry truncation | **`y-indexeddb`** persistence of the collab doc; call `navigator.storage.persist()` and surface `estimate()`. |
| **Identity mismatch** | free-text `username` | Reuse `LANPeer` identity (id/name/color/role) from `readLANSettings()`. |

Everything above runs with **zero internet** — transport is a LAN WebSocket relay you ship, persistence is IndexedDB/OPFS, CRDT merge is in-process.

---

## 4. Better architecture & implementation (step-by-step)

**Principle: do not invent a new collab system. Bind collab-hub to the existing `src/platform/collab` + `src/platform/lan` stack.**

### 4.1 A dedicated collab-hub Yjs sub-document
Reuse the shared `ydoc` from `collab.ts` (so it rides the same BroadcastChannel cross-tab provider and the same LAN `y-websocket` provider), and add typed shared structures:
```ts
// src/features/collab-hub/collab/collab-hub-doc.ts
import { ydoc } from \"@/platform/collab/collab\";
import * as Y from \"yjs\";
export const yApprovals = ydoc.getMap<Y.Map<unknown>>(\"collabhub:approvals\");
export const yAnnotations = ydoc.getMap<Y.Array<Y.Map<unknown>>>(\"collabhub:annotations\");
export const yAudit = ydoc.getArray<string>(\"collabhub:audit\"); // JSON strings, like sharedAudit
```

### 4.2 Persistence (renderer) with y-indexeddb
```ts
// src/features/collab-hub/collab/persistence.ts
import { IndexeddbPersistence } from \"y-indexeddb\";
import { ydoc } from \"@/platform/collab/collab\";
let persistence: IndexeddbPersistence | null = null;
export async function ensureCollabHubPersistence() {
  if (persistence) return persistence;
  if (typeof indexedDB === \"undefined\") return null;
  await navigator.storage?.persist?.();        // best-effort durability
  persistence = new IndexeddbPersistence(\"collab-hub-doc\", ydoc);
  await persistence.whenSynced;                // gate UI on local load
  return persistence;
}
```

### 4.3 Presence via Awareness (delete BroadcastChannel)
Reuse the LAN provider's awareness behind a thin hook:
```ts
// src/features/collab-hub/hooks/useAwarenessPresence.ts
import { useSyncExternalStore } from \"react\";
import { getLANPeers, subscribeLAN, readLANSettings } from \"@/platform/lan/lan-collab\";
export function usePresence() {
  const peers = useSyncExternalStore(subscribeLAN, getLANPeers, () => []);
  const me = readLANSettings().peer;           // stable identity from the LAN layer
  return { me, peers };
}
```
This removes the entire `usePresence`/heartbeat/prune block in `PresenceBar.tsx` (~130 lines) and the render storm with it. Awareness auto-prunes on disconnect. For same-machine multi-tab without a relay, `startCollabSync()` already provides the BroadcastChannel Yjs provider — so cross-tab works offline and the LAN server upgrades it to cross-machine. One code path, two reach levels.

### 4.4 Annotations as CRDT
```ts
// src/features/collab-hub/hooks/useAnnotations.ts (rewritten)
import * as Y from \"yjs\";
import { useSyncExternalStore, useCallback } from \"react\";
import { ydoc } from \"@/platform/collab/collab\";
import { yAnnotations } from \"../collab/collab-hub-doc\";
import { readLANSettings } from \"@/platform/lan/lan-collab\";
function sectionArray(sectionId: string): Y.Array<Y.Map<unknown>> {
  let arr = yAnnotations.get(sectionId);
  if (!arr) { arr = new Y.Array(); yAnnotations.set(sectionId, arr); }
  return arr;
}
export function useAnnotations(sectionId: string) {
  const arr = sectionArray(sectionId);
  const subscribe = useCallback((cb: () => void) => {
    arr.observeDeep(cb); return () => arr.unobserveDeep(cb);
  }, [arr]);
  const getSnapshot = useCallback(
    () => arr.toArray().map(m => Object.fromEntries(m.entries())) as Annotation[], [arr]);
  const notes = useSyncExternalStore(subscribe, getSnapshot, () => []);
  const addNote = useCallback((text, color, priority) => {
    const peer = readLANSettings().peer;
    ydoc.transact(() => {
      const m = new Y.Map<unknown>();
      m.set(\"id\", crypto.randomUUID()); m.set(\"author\", peer.name);
      m.set(\"text\", text); m.set(\"color\", color); m.set(\"priority\", priority);
      m.set(\"at\", Date.now()); m.set(\"resolved\", false); m.set(\"replies\", new Y.Array());
      arr.push([m]);
    });
    appendAudit(\"annotation\", `Annotation added to \"${sectionId}\"`, peer.name);
  }, [arr, sectionId]);
  const unresolvedCount = notes.filter(n => !n.resolved).length;
  return { notes, addNote, /* resolve/delete/reply mutate the Y.Map in transact() */, unresolvedCount };
}
```
Replies become a nested `Y.Array` on each note's `Y.Map`, so two users replying concurrently both keep their replies (no clobber). Conflict-free by construction.

### 4.5 Approval state as CRDT
```ts
function approvalMap(reportId: string): Y.Map<unknown> {
  let m = yApprovals.get(reportId);
  if (!m) { m = new Y.Map(); yApprovals.set(reportId, m); }
  return m;
}
export function transition(reportId, next, by, comment) {
  const m = approvalMap(reportId);
  ydoc.transact(() => {
    m.set(\"status\", next);
    let history = m.get(\"history\") as Y.Array<unknown>;
    if (!history) { history = new Y.Array(); m.set(\"history\", history); }
    history.push([{ id: crypto.randomUUID(), status: next, by, at: Date.now(), comment }]);
  });
  appendAudit(\"approval\", `Report ${next.toLowerCase()} by ${by}`, by);
}
```
Now an approval on Bob's PC appears on Alice's PC. Last-writer-wins on `status` suits a linear workflow; `history` is append-only and merges cleanly.

### 4.6 Audit as a shared Y.Array (single write path)
```ts
// src/features/collab-hub/collab/audit.ts
import { yAudit } from \"./collab-hub-doc\";
export function appendAudit(type, description, user) {
  yAudit.push([JSON.stringify({ id: crypto.randomUUID(), type, description, user, at: Date.now() })]);
  if (yAudit.length > 1000) yAudit.delete(0, yAudit.length - 1000);
}
export function useAudit() {
  const subscribe = (cb:()=>void)=>{ yAudit.observe(cb); return ()=>yAudit.unobserve(cb); };
  return useSyncExternalStore(subscribe,
    () => yAudit.toArray().map(s => JSON.parse(s) as AuditEvent), () => []);
}
```
Mirrors the existing `sharedAudit` pattern; removes both the Zustand audit persistence and the duplicate `audit:events` write. `y-indexeddb` persists it durably without per-event full-array reserialize.

### 4.7 Real share link + real session code
```ts
import { getLANJoinUrl, readLANSettings, getLANStatus } from \"@/platform/lan/lan-collab\";
const settings = readLANSettings();
const joinUrl = getLANStatus() === \"connected\" ? getLANJoinUrl(settings) : null;
// \"session code\" = settings.pairingCode + settings.room (what teammates actually enter)
```
If no LAN session is active, the UI should say \"Start a LAN session to share\" and deep-link to the existing LAN control center (`src/features/dashboard-shell/components/lan-control-center.tsx`) instead of pretending.

### 4.8 Zustand store: shrink to UI-only
After migration, `collab-hub-store` keeps only **local UI prefs** (active tab, last-used note color, username fallback). `approvalState`, `auditEvents`, `presenceUsers`, `sharedReports` move to the Yjs doc. Removes the heavy persist serialization entirely.

### 4.9 Optional Electron-main hub (Trial)
If you want server-side durability/auth beyond the trusted-LAN `lan-server.mjs`, embed `@hocuspocus/server` in Electron main with SQLite persistence and advertise it via `bonjour-service` (mDNS) so peers auto-discover instead of subnet-scanning. Keep `scripts/lan-server.mjs` as the zero-config default.

---

## 5. Recommended dependencies (verified)

| Dep | Stars | Maint. | License | Offline | Bundle | Why | URL |
|---|---|---|---|---|---|---|---|
| **yjs** (have it) | ~17-22k | Very active v13.6 | MIT | yes | ~18kB | Stop bypassing it; make collab-hub data CRDT. | https://github.com/yjs/yjs |
| **y-indexeddb** | ~245 | Active v9.0.12 | MIT | yes | ~5kB | Durable async persistence + compaction for the collab doc. | https://github.com/yjs/y-indexeddb |
| **y-websocket** (have it) | y-crdt | Active v3 | MIT | yes | ~10kB | LAN transport vs bundled `lan-server.mjs`. | https://github.com/yjs/y-websocket |
| **y-protocols** (Awareness) | y-crdt | Active | MIT | yes | ~6kB | Native presence; delete BroadcastChannel heartbeat. | https://github.com/yjs/y-protocols |
| **@tanstack/react-virtual** (have it) | ~5.5k | Very active v3 | MIT | yes | ~10kB | Virtualize audit + long note lists. | https://github.com/TanStack/virtual |
| **@hocuspocus/server** (Trial) | ~2.4k | Very active v4 | MIT | yes | main-only | Optional Electron-main durable hub. | https://github.com/ueberdosis/hocuspocus |
| **bonjour-service** (Trial) | ~0.4k | Active | MIT | yes | main-only | Optional mDNS LAN discovery. | https://github.com/onlxltd/bonjour-service |
| **loro-crdt** (WATCH) | ~12k | Very active v1.x | MIT | yes | ~180kB WASM | Only if fine-grained live cursors / history later. | https://github.com/loro-dev/loro |

**Reject / avoid:** `y-presence` & `@y-presence/react` (thin, low-maintenance wrappers — use raw Awareness behind your own hook, per the radar); any cloud sync engine (ElectricSQL/PowerSync/Convex) — they need a server + Postgres and violate offline-only.

**Net new deps: just `y-indexeddb` (~5kB) and an explicit `y-protocols`.** Everything else is already in `package.json`.

---

## 6. CLIs & tools (all offline)
- **`npm run lan-server`** (`scripts/lan-server.mjs`) — start the LAN relay for real multi-machine testing on one PC; others join by IP+pairing code.
- **react-scan** — surface the presence/store render storm and confirm it's gone post-migration.
- **size-limit (`@size-limit/preset-app`)** — add a `/dashboard/collab-hub` budget (already configured in repo).
- **@lhci/cli** — assert INP/CLS for the route vs localhost.
- **vitest + fake-indexeddb** — test CRDT convergence (apply two concurrent `Y.applyUpdate`s, assert equal final state) and `y-indexeddb` reload persistence without a browser.
- **knip / dependency-cruiser** (in repo) — after deleting the BroadcastChannel/localStorage code, prove no orphaned exports and that collab-hub now depends on `@/platform/collab` and `@/platform/lan` (add a depcruise rule).

### Manual multi-machine smoke test
1. `PAIRING_CODE=123456 PORT=1234 npm run lan-server` on PC-A.
2. PC-A opens collab-hub, starts a LAN session (room + code).
3. PC-B joins via IP:1234 + code. Add an annotation on B → appears on A. Approve on A → status flips on B. Kill PC-B's tab → its presence avatar disappears within the Awareness timeout.
4. Pull the network cable mid-session, keep editing on both, reconnect → CRDT merges with no lost notes (offline-resilience proof).

---

## 7. Phased task list

### P1 — Make it real & stop the bleeding (1-2 days)
1. Delete the duplicate `audit:events` localStorage write in the store (§2.2).
2. Add `React.useDeferredValue` + `useMemo` to AuditTrail filtering; virtualize rows with `@tanstack/react-virtual` (§2.3).
3. Memoize `badgeCount`/`allUsers`/`activeCount`; delete dead `statusDot`; de-dupe `hashColor` calls.
4. Stop the presence render/store-write storm: stable `me` via ref + timer-based `updatePresence` (§2.1) (interim, before §4.3 deletes it).
5. Add a `size-limit` budget + an `@lhci/cli` INP assertion for the route.

### P2 — Converge onto the existing CRDT/LAN stack (3-5 days)
6. Add `collab-hub-doc.ts` (Yjs structures) + `persistence.ts` (`y-indexeddb`, `navigator.storage.persist()`), gating UI on `whenSynced`.
7. Rewrite `useAnnotations` as a Yjs-backed hook (`useSyncExternalStore` + `observeDeep`); nested `Y.Array` replies (§4.4). One-shot migrate existing `annotations:*` localStorage into the doc on first load, then drop the keys.
8. Move approval state + history into `yApprovals` (§4.5); refactor `ApprovalWorkflow` to read/transition via the doc.
9. Move audit into `yAudit` (§4.6); replace `addAuditEvent` call sites with `appendAudit`; remove audit from the Zustand store/persist.
10. Replace `PresenceBar`'s BroadcastChannel `usePresence` with Awareness via `lan-collab` (`usePresence` over `subscribeLAN`/`getLANPeers`) (§4.3). Keep `startCollabSync()` for cross-tab-without-relay.
11. Replace fake share/session-code with `getLANJoinUrl` + real room/pairing code; deep-link to the LAN control center when no session is active (§4.7).
12. Shrink `collab-hub-store` to UI-only prefs (§4.8).
13. Tests: vitest CRDT-convergence + `y-indexeddb` reload (fake-indexeddb); a depcruise rule asserting the new platform dependency.

### P3 — Hardening & power features (optional, behind flags)
14. Identity unification: use `LANPeer` (id/name/color/role) everywhere; role-gate approvals (`canMutateLAN`).
15. Trial `@hocuspocus/server` in Electron main + SQLite persistence + `bonjour-service` mDNS discovery (§4.9), keeping `lan-server.mjs` as default.
16. Live cursors / section-highlight presence using Awareness fields (Loro's EphemeralStore is a future option only if Awareness full-state resends become a bottleneck).
17. Surface `navigator.storage.estimate()` quota in the UI; add audit log compaction/export to Parquet via the native DuckDB path for long-lived rooms.

---

## 8. Risks & notes
- **Migration of existing localStorage annotations/audit** must be one-shot and idempotent (write into the doc inside a single `transact`, then clear keys) to avoid duplication across reloads.
- **Two providers, one doc:** `startCollabSync()` (BroadcastChannel) + the LAN `WebsocketProvider` can both attach to the same `ydoc` — Yjs dedupes via update origins (the existing `collab.ts` guards with `origin === \"remote\"`). The platform layer should own provider lifecycle; collab-hub only reads/writes shared structures.
- **Bundle:** net add ~5kB (`y-indexeddb`); framer-motion is the real weight on this route — trimming layout animations on audit/notes is the bigger win.
- **Security:** the LAN relay is trusted-LAN, no auth, per its header — acceptable for the offline desktop model; if P3 hocuspocus lands, enforce the pairing-code check server-side (already present in `lan-server.mjs`).

Sources verified via web search: yjs/y-indexeddb (~245★, v9.0.12, active), ueberdosis/hocuspocus (v4, active), yjs/y-protocols (active), loro-dev/loro (~12k★, v1.x, EphemeralStore for partial presence updates), TanStack/virtual (~5.5k★).