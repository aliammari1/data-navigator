# Collaboration — architecture, roles & security

Data Navigator collaborates **LAN-first, cloud-never**: one machine hosts a
sync hub, peers join by IP + access code. Documents are Yjs CRDTs; transport is
[Hocuspocus](https://tiptap.dev/docs/hocuspocus) end-to-end (client
`@hocuspocus/provider`, servers `@hocuspocus/server`).

## Topology

```
┌────────────┐   ws:// (Hocuspocus wire protocol, token auth)   ┌────────────┐
│  Host PC   │◄────────────────────────────────────────────────►│  Guest PC  │
│            │                                                  │            │
│ hub:       │   Yjs sync ▸ shared report state                 │ login page │
│ Electron   │   awareness ▸ presence, live cursors             │ (local     │
│ main proc  │   SQLite persistence (Electron hub)              │  account)  │
│ or         │   mDNS advertise/discover (_dn-collab._tcp)      │            │
│ lan-server │                                                  │            │
└────────────┘                                                  └────────────┘
```

Two interchangeable hubs, one contract:

| Hub | Where | Start | Persistence |
|---|---|---|---|
| **In-app hub** | Electron main process (`electron/collab-hub-service.ts`) | LAN dock → "Start built-in hub" (one click) | SQLite |
| **Script relay** | `scripts/lan-server.mjs` | `PAIRING_CODE=… GUEST_CODE=… PORT=1234 npm run lan-server` | in-memory |

Both advertise over mDNS (Electron discovers them for you); the script relay
also serves the HTTP sidecar (`/lan/status` discovery, `/lan/files` inbox).
Each client keeps a durable local copy via y-indexeddb — offline edits load
BEFORE the network provider connects, then CRDT-merge on reconnect.

## Access model: two codes, server-derived roles

The **code you present decides your role** — never the role your client claims:

- **Access code** (pairing code): full access. Grants the requested role —
  `host`, `editor`, or a voluntarily read-only `reviewer`/`viewer`.
- **Guest code**: view-only. ALWAYS clamped to `viewer` (or `reviewer` on
  request). Can never grant write access, whatever the client claims.
- Anything else: connection rejected (`onAuthenticationFailed` in the UI).

Both codes are CSPRNG-generated 6-digit values compared in constant time
(`electron/collab-pairing.ts`, mirrored in `scripts/lan-server.mjs`). The code
travels in the Hocuspocus **Auth frame**, not the URL, so it never lands in
HTTP/proxy logs. There is deliberately **no rejoin-without-code path**: peer
ids are broadcast in awareness, so treating them as credentials would let
anyone who ever saw the peer list back in.

Enforcement is **server-side**:

- read-only connections get `connectionConfig.readOnly = true` — the hub drops
  their document updates (verified by `scripts/collab-smoke.mjs`);
- the hub stamps its derived role onto every awareness state a connection
  broadcasts (`beforeHandleAwareness`), so a guest cannot present as
  host/editor in peers' presence UI;
- the server tells the client its granted scope (`onAuthenticated({scope})`),
  and the UI trusts THAT, not the local claim.

## Roles & permissions

Two layers, deliberately coupled at one point (`useDashboardAccess`):

1. **Device role** (`Settings → Account → Role`, persisted): what this
   machine's user may do locally.
2. **Session role** (server-granted, live): what the hub allows this
   connection while joined.

The **effective role is the minimum of both** — an owner joining someone
else's session with a guest code acts as a viewer while connected
(`capRoleBySession` in `src/platform/auth/dashboard-access.ts`).

| Permission | owner | editor | viewer |
|---|---|---|---|
| Upload / import data | ✔ | ✔ | ✖ |
| Append / rename datasets | ✔ | ✔ | ✖ |
| Export (files, reports, DB) | ✔ | ✔ | ✖ |
| Comment / annotate / approve | ✔ | ✔ | ✖ |
| Manage users (telecom admin) | ✔ | ✖ | ✖ |
| Share / view shared state | ✔ | ✔ | ✔ |

## What a guest sees

1. **Login page** — every device requires a local account
   (`src/app/dashboard/layout.tsx` redirects to `/login` without a session).
   Accounts are per-device (better-auth, local SQLite); nothing is shared
   through them.
2. **The LAN gate** — a device whose role is `viewer` gets a full-screen join
   gate (`LanAccessGate`) instead of the dashboard until it connects to a
   session. Enter host IP (or auto-discover), your name, the guest code.
3. **A restricted sidebar** — while the effective role is viewer, navigation
   collapses to `minRole: "viewer"` entries only (`nav-config.ts`): Accueil,
   Rapport Télécom, Surveillance Canaux, Collaboration, Aide, Paramètres. The
   command palette and the Explorer grid apply the same rule. This is UX
   shaping; the hub's read-only enforcement is the real boundary.
4. **Live shared state** — the telecom shared overview, presence, cursors,
   annotations/comments (read-only), audit trail.

## Presence, live cursors, discovery

- **Presence** rides `y-protocols/awareness` (auto-pruned ~30 s after a peer
  stalls; explicitly cleared on `beforeunload`/`pagehide` and on disconnect).
  Durable identity (name/role/color) also mirrors into the persisted doc.
- **Where is everyone**: each client publishes its route on navigation.
  Peer avatars (PresenceBar) and the LAN dock's peer chips are clickable —
  jump straight to the page a teammate is on.
- **Live cursors** (`live-cursors.tsx`): pointer positions are published over
  awareness in content coordinates (x as a fraction of `#main-content` width,
  y in content px), throttled to ~80 ms, and rendered only for peers on the
  same page, with the peer's name and color. Cursors fade after ~6 s idle.
- **Discovery**: the Electron hub advertises `_dn-collab._tcp` over mDNS;
  peers see it in the join UI with no typing. Fallbacks: HTTP `/lan/status`
  probe and a bounded subnet scan.
- **Display name** is centralized (Settings → Account → Display name) and kept
  in sync across the presence bar, LAN identity, and annotations.

## Security posture (LAN threat model)

- Auth: mandatory `onAuthenticate` on both hubs; dual codes; constant-time
  comparison; fail-closed on missing/empty codes; guests can be disabled
  entirely (`ALLOW_GUESTS=0`).
- Awareness is **untrusted display data**: names render as text, colors are
  validated against a hex pattern before touching styles, roles are
  server-stamped. Never use awareness for authorization.
- DoS hardening: 64 MB max frame, compression disabled (memory-amplification),
  Hocuspocus v4.3 pre-auth queue limits.
- The relay binds `127.0.0.1` by default — exposing it on a LAN interface is
  an explicit opt-in (`HOST=…`).
- Plain `ws://` on a trusted LAN is a deliberate trade-off for offline-first
  zero-config; put a TLS reverse proxy in front for hostile networks.
- Known limitation: Hocuspocus drops read-only clients' updates server-side
  but does not roll them back client-side — a guest's local (unsynced) edits
  vanish on reload, which is the intended outcome here.

## Verification

- `pnpm exec vitest run tests/electron/collab-pairing.test.ts` — role
  derivation and token parsing (dual-code matrix, fail-closed cases).
- `pnpm run test:collab-smoke` — boots the real relay and drives real
  providers: editor sync works, guest writes dropped, spoofed awareness role
  stamped back, wrong code rejected.
