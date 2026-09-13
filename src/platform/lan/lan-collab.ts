/**
 * LAN collaboration over Hocuspocus.
 *
 * The relay is intentionally small: one PC hosts `scripts/lan-server.mjs` or
 * the in-app Electron-main hub — both `@hocuspocus/server` — and peers join by
 * IP address + access code. The client is `@hocuspocus/provider`: the code
 * rides the wire-protocol Auth frame (never the URL, so it can't leak into
 * HTTP logs), the SERVER derives the role from which code was presented (full
 * pairing code → requested role; guest code → read-only viewer/reviewer), and
 * read-only enforcement happens server-side. `onAuthenticated({scope})` tells
 * us the granted scope, so the UI reflects the server's decision, not the
 * client's claim.
 *
 * Yjs carries shared report state, `y-protocols/awareness` carries live
 * presence (auto-pruned ~30s after a peer stalls — no hand-rolled heartbeat),
 * and discovery prefers Electron mDNS over IPC (the cross-origin isolated
 * renderer cannot reliably do cross-origin HTTP fetches under
 * COEP:require-corp — see architecture §8).
 *
 * Presence discipline: DURABLE identity (id/name/role/color) lives in awareness
 * `user` (+ the doc); EPHEMERAL cursor/selection lives in awareness `cursor`
 * ONLY — it is NOT written into the persisted `sharedPresence`/doc (that would
 * bloat the doc + the IndexedDB update log).
 */

"use client";

import type { Awareness } from "y-protocols/awareness";
import {
  ensureAppDocPersistence,
  getAppAwareness,
  sharedAudit,
  sharedLanRoom,
  sharedPresence,
  ydoc,
} from "@/platform/collab/collab";
import { STORAGE_KEYS } from "@/platform/storage/storage-keys";
import {
  getHostSecret,
  getHostSecretAsync,
  INVITE_TTL_MS,
  type InvitePayload,
  type LANRole,
  type SessionPayload,
  signInviteToken,
  signSessionToken,
  verifyInviteToken,
  verifySessionToken,
} from "./lan-common";

export {
  getHostSecret,
  getHostSecretAsync,
  INVITE_TTL_MS,
  type InvitePayload,
  type LANRole,
  type SessionPayload,
  signInviteToken,
  signSessionToken,
  verifyInviteToken,
  verifySessionToken,
};

export type LANStatus = "off" | "connecting" | "connected" | "error";

export interface LANCursor {
  sectionId: string;
  row?: number;
  x?: number;
  y?: number;
  selectionStart?: number;
  selectionEnd?: number;
  ts: number;
}

export interface LANFollowRequest {
  fromPeerId: string;
  fromPeerName: string;
  toPage: string;
  toTab?: string;
  ts: number;
  expiresAt: number;
}

export interface LANPeer {
  id: string;
  name: string;
  role: LANRole;
  color: string;
  active: boolean;
  page?: string;
  tab?: string;
  sectionId?: string;
  cursor?: LANCursor;
  lastSeenAt?: number;
}

export interface LANSettings {
  url: string;
  room: string;
  pairingCode: string;
  peer: LANPeer;
}

export interface LANAuditEntry {
  id: string;
  at: number | string;
  event: string;
  peerId?: string;
  peerName?: string;
  role?: string;
  room?: string;
  detail?: string;
}

export interface LANDiscovery {
  ok: boolean;
  name: string;
  host: string;
  port: number;
  pairingRequired: boolean;
  allowGuests: boolean;
  ips: Array<{ name: string; address: string }>;
  websocketUrls: string[];
  httpUrls: string[];
  rooms: Array<{
    name: string;
    connections: number;
    peers: Array<{
      id: string;
      name: string;
      role: LANRole;
      lastSeenAt: number;
    }>;
  }>;
  audit: LANAuditEntry[];
  files?: LANSharedFile[];
  maxFileBytes?: number;
  inboxDir?: string;
  startedAt: string;
}

export interface LANSharedFile {
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

export interface LANScanResult {
  url: string;
  status: "found" | "miss" | "error";
  discovery?: LANDiscovery;
  latencyMs?: number;
  error?: string;
}

const PEER_KEY = STORAGE_KEYS.lanPeer;
const URL_KEY = STORAGE_KEYS.lanWsUrl;
const ROOM_KEY = STORAGE_KEYS.lanRoom;
const CODE_KEY = STORAGE_KEYS.lanPairingCode;
const PALETTE = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#06b6d4",
];

// ─── Electron collab-hub bridge (mDNS discovery + in-app hub) ─────────────────
// The Electron-main agent exposes `window.electronCollab` (see electron/preload).
// Preferred over cross-origin HTTP fetch from the COEP:require-corp renderer.

export interface ElectronCollabStatus {
  running: boolean;
  port: number | null;
  pairingCode: string | null;
  guestCode: string | null;
  room: string | null;
  advertising: boolean;
  discovering: boolean;
  websocketUrls: string[];
  ips: Array<{ name: string; address: string }>;
  dbPath: string | null;
  startedAt: string | null;
}

interface ElectronDiscoveredHub {
  name: string;
  host: string;
  port: number;
  url: string;
  addresses: string[];
  room?: string;
  pairingRequired: boolean;
}

interface ElectronCollabBridge {
  start(input?: {
    port?: number;
    pairingCode?: string;
    guestCode?: string;
    room?: string;
    advertise?: boolean;
    discover?: boolean;
  }): Promise<ElectronCollabStatus>;
  stop(): Promise<{ stopped: boolean }>;
  status(): Promise<ElectronCollabStatus>;
  discover(): Promise<ElectronDiscoveredHub[]>;
  getDiscovered(): Promise<ElectronDiscoveredHub[]>;
  onDiscovered(
    cb: (event: { type: "up" | "down"; hub: ElectronDiscoveredHub }) => void,
  ): () => void;
}

function electronCollab(): ElectronCollabBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { electronCollab?: ElectronCollabBridge }).electronCollab ?? null;
}

/** True when running inside Electron with the collab-hub IPC bridge available. */
export function hasCollabHubBridge(): boolean {
  return electronCollab() !== null;
}

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRole(role: string | undefined): LANRole {
  if (role === "host" || role === "editor" || role === "reviewer") return role;
  return "viewer";
}

function httpFromWs(url: string): string {
  return url.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}

function wsFromHttp(url: string): string {
  return url.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

// ─── Signed JWTs moved to lan-common.ts ────────────────────────────────

export async function makeJoinHttpUrl(settings: LANSettings): Promise<string> {
  const base = new URL(httpFromWs(settings.url || "ws://127.0.0.1:1234"));
  if (base.hostname === "0.0.0.0" || base.hostname === "::" || base.hostname === "[::]") {
    if (typeof window !== "undefined" && (window as any).electronCollab?.status) {
      try {
        const st = await (window as any).electronCollab.status();
        if (st?.ips?.[0]?.address) {
          base.hostname = st.ips[0].address;
        }
      } catch {}
    }
    if (base.hostname === "0.0.0.0" || base.hostname === "::" || base.hostname === "[::]") {
      if (
        typeof window !== "undefined" &&
        window.location?.hostname &&
        window.location.hostname !== "0.0.0.0"
      ) {
        base.hostname = window.location.hostname;
      }
    }
  }
  // The guest join web interface and host approval dialog are served by the Next.js
  // web dashboard (e.g. port 3000), whereas settings.url points to the WebSocket Hocuspocus port (e.g. 1234).
  const webPort =
    (typeof window !== "undefined" && window.location.port) ||
    process.env.NEXT_PUBLIC_PORT ||
    "3000";
  base.port = webPort;
  base.pathname = "/guest/join";
  const secret = await getHostSecretAsync();
  const token = await signInviteToken(
    {
      sub: settings.peer.id,
      room: settings.room,
      defaultRole:
        settings.peer.role === "host"
          ? "editor"
          : (settings.peer.role as "viewer" | "editor" | "reviewer"),
      pairingCode: settings.pairingCode,
    },
    secret,
  );
  base.searchParams.set("token", token);
  return base.toString();
}

export function readLANSettings(): LANSettings {
  const url = (typeof localStorage !== "undefined" && localStorage.getItem(URL_KEY)) || "";
  const room =
    (typeof localStorage !== "undefined" && localStorage.getItem(ROOM_KEY)) || "telecom-default";
  const pairingCode = (typeof localStorage !== "undefined" && localStorage.getItem(CODE_KEY)) || "";
  let peer: LANPeer | null = null;
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(PEER_KEY);
    if (raw) peer = JSON.parse(raw) as LANPeer;
  } catch {}
  if (!peer) {
    peer = {
      id: uid(),
      name: `User-${uid().slice(0, 4)}`,
      role: "editor",
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      active: true,
    };
    saveLANSettings({ url, room, pairingCode, peer });
  }
  return {
    url,
    room,
    pairingCode,
    peer: { ...peer, role: normalizeRole(peer.role) },
  };
}

export function saveLANSettings(settings: LANSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(URL_KEY, settings.url);
  localStorage.setItem(ROOM_KEY, settings.room);
  localStorage.setItem(CODE_KEY, settings.pairingCode);
  localStorage.setItem(PEER_KEY, JSON.stringify(settings.peer));
}

interface ProviderHandle {
  destroy(): void;
  disconnect?(): void;
}

let provider: ProviderHandle | null = null;
// A single shared Awareness bound to the app doc. It is reused by every provider
// (BroadcastChannel + websocket) so presence multiplexes over the live socket
// and auto-prunes on disconnect. Created lazily in the browser only.
let sharedAwareness: Awareness | null = null;
const watchers = new Set<() => void>();
let status: LANStatus = "off";
let peers: LANPeer[] = [];
let activeSettings: LANSettings | null = null;
// Server-granted access scope for the live session ("read-write"/"readonly"),
// null while disconnected. Set from Hocuspocus `onAuthenticated` — the UI must
// trust THIS, not the role the client asked for.
let sessionScope: "read-write" | "readonly" | null = null;
// Human-readable reason for the last authentication failure (wrong code, guest
// mode disabled, …) so join UIs can explain instead of showing a dead spinner.
let lastAuthError: string | null = null;

/**
 * The shared app Awareness (browser only). Delegates to the platform singleton
 * so room handles (`@/platform/collab`) and this LAN transport share ONE
 * roster — a second Awareness on the same document would duplicate every peer.
 */
function getAwareness(): Awareness | null {
  if (!sharedAwareness) sharedAwareness = getAppAwareness();
  return sharedAwareness;
}

/**
 * The shared Awareness bound to the app doc (presence + live cursors ride the
 * LAN socket through it). Null under SSR. Consumers must treat its states as
 * UNTRUSTED display data — the hub stamps `user.role`, everything else is
 * client-asserted.
 */
export function getLANAwareness(): Awareness | null {
  return getAwareness();
}

export function getLANStatus(): LANStatus {
  return status;
}

export function getLANPeers(): LANPeer[] {
  return peers;
}

export function getActiveLANSettings(): LANSettings | null {
  return activeSettings;
}

/**
 * The SERVER-granted access scope for the live session, or null when not
 * connected. "readonly" means the hub drops this client's document updates
 * regardless of any locally-claimed role.
 */
export function getLANSessionScope(): "read-write" | "readonly" | null {
  return sessionScope;
}

/**
 * Effective role for the live session: the locally-requested role clamped by
 * the server-granted scope. Null when not connected.
 */
export function getLANSessionRole(): LANRole | null {
  if (status !== "connected" || !activeSettings) return null;
  const requested = activeSettings.peer.role;
  if (sessionScope === "readonly") {
    return requested === "reviewer" ? "reviewer" : "viewer";
  }
  return requested;
}

/** Reason for the last authentication failure, cleared on the next connect. */
export function getLANAuthError(): string | null {
  return lastAuthError;
}

export function canMutateLAN(role: LANRole): boolean {
  return role === "host" || role === "editor";
}

export function subscribeLAN(fn: () => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

function emit() {
  watchers.forEach((fn) => {
    fn();
  });
}

function appendAudit(event: string, detail?: string) {
  const settings = activeSettings ?? readLANSettings();
  const entry: LANAuditEntry = {
    id: uid(),
    at: Date.now(),
    event,
    peerId: settings.peer.id,
    peerName: settings.peer.name,
    role: settings.peer.role,
    room: settings.room,
    detail,
  };
  sharedAudit.push([JSON.stringify(entry)]);
  if (sharedAudit.length > 120) sharedAudit.delete(0, sharedAudit.length - 120);
}

export function readLANAudit(): LANAuditEntry[] {
  return sharedAudit
    .toArray()
    .map((raw) => {
      try {
        return JSON.parse(raw) as LANAuditEntry;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as LANAuditEntry[];
}

export function subscribeLANAudit(fn: () => void): () => void {
  sharedAudit.observe(fn);
  return () => sharedAudit.unobserve(fn);
}

// Clear our awareness state when the tab goes away so peers prune us
// immediately instead of after the 30s awareness timeout. `pagehide` covers
// mobile Safari/bfcache where `beforeunload` is unreliable.
function handlePageHide() {
  sharedAwareness?.setLocalState(null);
}

function attachUnloadCleanup() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeunload", handlePageHide);
  window.addEventListener("pagehide", handlePageHide);
}

function detachUnloadCleanup() {
  if (typeof window === "undefined") return;
  window.removeEventListener("beforeunload", handlePageHide);
  window.removeEventListener("pagehide", handlePageHide);
}

export async function connectLAN(settings: LANSettings): Promise<void> {
  await disconnectLAN();
  if (!settings.url) {
    status = "off";
    emit();
    return;
  }
  // A scheme-less/partial URL ("192.168.1.50:4444", "w") would be resolved by
  // the websocket provider as RELATIVE to the page — ws://localhost:3000/…/<garbage>
  // — and reconnect against it forever. This is the single connect site, so
  // validate here and surface a real error instead.
  if (!/^wss?:\/\//i.test(settings.url.trim())) {
    lastAuthError = "Invalid hub URL — must start with ws:// or wss://";
    status = "error";
    emit();
    throw new Error(lastAuthError);
  }
  status = "connecting";
  activeSettings = settings;
  lastAuthError = null;
  sessionScope = null;
  emit();

  try {
    // Offline ordering invariant: load durable local content BEFORE connecting,
    // so a remote peer's state never clobbers local-only offline edits.
    await ensureAppDocPersistence();

    const awareness = getAwareness();

    const { HocuspocusProvider } = await import("@hocuspocus/provider");

    provider = new HocuspocusProvider({
      url: settings.url,
      name: settings.room,
      document: ydoc,
      // Reuse the shared Awareness so presence rides this same socket.
      awareness: awareness ?? null,
      // The access code travels in the wire-protocol Auth frame — never the
      // URL. The server decides the role from which code this matches.
      token: JSON.stringify({
        code: settings.pairingCode,
        peerId: settings.peer.id,
        peerName: settings.peer.name,
        role: settings.peer.role,
      }),
      onStatus: ({ status: next }) => {
        status = next === "connected" ? "connected" : next === "connecting" ? "connecting" : "off";
        if (status === "connected") appendAudit("peer.connected");
        emit();
      },
      onAuthenticated: ({ scope }) => {
        sessionScope = scope;
        emit();
      },
      onAuthenticationFailed: ({ reason }) => {
        lastAuthError = reason || "Invalid access code";
        sessionScope = null;
        status = "error";
        emit();
      },
    }) as unknown as ProviderHandle;

    attachUnloadCleanup();

    if (awareness) {
      awareness.setLocalStateField("user", {
        id: settings.peer.id,
        name: settings.peer.name,
        role: settings.peer.role,
        color: settings.peer.color,
        page: typeof location !== "undefined" ? `${location.pathname}${location.search}` : "",
        lastSeenAt: Date.now(),
      });
      awareness.on("change", refreshPeers);
      refreshPeers();
    }

    ydoc.transact(() => {
      sharedLanRoom.set("room", settings.room);
      sharedLanRoom.set("url", settings.url);
      sharedLanRoom.set("hostPeerId", settings.peer.id);
      sharedLanRoom.set("updatedAt", String(Date.now()));
    });
  } catch (error) {
    status = "error";
    emit();
    throw error;
  }
}

function refreshPeers() {
  const awareness = sharedAwareness;
  if (!awareness) {
    peers = [];
    emit();
    return;
  }
  const list: LANPeer[] = [];
  for (const [, state] of awareness.getStates()) {
    const s = state as {
      user?: LANPeer;
      cursor?: Partial<CursorDraft> & { at?: unknown; ts?: unknown };
    };
    if (!s?.user) continue;
    // Peer-asserted cursor values are untrusted: pick known numeric fields
    // only so a malformed remote state cannot poison local rendering.
    const c = s.cursor;
    const num = (v: unknown) => (typeof v === "number" ? v : undefined);
    const at = num(c?.at) ?? num(c?.ts);
    list.push({
      ...s.user,
      cursor:
        c && at !== undefined
          ? {
              sectionId: typeof c.sectionId === "string" ? c.sectionId : "",
              row: num(c.row),
              x: num(c.x),
              y: num(c.y),
              selectionStart: num(c.selectionStart),
              selectionEnd: num(c.selectionEnd),
              ts: at,
            }
          : undefined,
      active: true,
    });
  }
  peers = list;
  emit();
}

export async function disconnectLAN(): Promise<void> {
  if (provider) {
    try {
      appendAudit("peer.disconnected");
      detachUnloadCleanup();
      sharedAwareness?.off("change", refreshPeers);
      // Drop our local presence so remote peers prune us immediately rather
      // than waiting for the 30s awareness timeout.
      sharedAwareness?.setLocalState(null);
      provider.destroy();
    } catch {}
    provider = null;
  }
  status = "off";
  peers = [];
  activeSettings = null;
  sessionScope = null;
  emit();
}

// Throttled cursor writer: pointer/selection floods coalesce into ONE merged
// awareness write per interval. Every awareness update re-broadcasts the whole
// local state to all peers, so ~80ms (12.5 msg/s, in the 50–100ms industry
// band) is the network budget; rAF alone (60+/s) would be an order of
// magnitude chattier for zero perceived benefit once receivers interpolate.
const CURSOR_MIN_INTERVAL_MS = 80;

interface CursorDraft {
  page: string;
  sectionId?: string;
  x?: number;
  y?: number;
  selection?: string;
  row?: number;
  selectionStart?: number;
  selectionEnd?: number;
  at: number;
}

let pendingCursor: CursorDraft | null = null;
type ScheduleHandle = ReturnType<typeof requestAnimationFrame> | ReturnType<typeof setTimeout>;
let cursorRaf: ScheduleHandle | null = null;
let lastCursorFlushAt = 0;

function currentPage(): string {
  return typeof location !== "undefined" ? `${location.pathname}${location.search}` : "";
}

function flushCursor() {
  cursorRaf = null;
  const next = pendingCursor;
  const now = Date.now();
  if (next && now - lastCursorFlushAt >= CURSOR_MIN_INTERVAL_MS) {
    pendingCursor = null;
    lastCursorFlushAt = now;
    sharedAwareness?.setLocalStateField("cursor", next);
    return;
  }
  if (next) {
    // Too soon — re-schedule for the remainder of the interval.
    cursorRaf = setTimeout(flushCursor, CURSOR_MIN_INTERVAL_MS - (now - lastCursorFlushAt));
  }
}

function queueCursor(patch: Partial<CursorDraft>) {
  pendingCursor = {
    ...(pendingCursor ?? {}),
    ...patch,
    page: currentPage(),
    at: Date.now(),
  };
  if (cursorRaf !== null) return;
  cursorRaf =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(flushCursor)
      : setTimeout(flushCursor, 16);
}

/**
 * Publish DURABLE identity changes (name/role/color/page). Writes the identity
 * to awareness `user` AND mirrors the durable identity into the persisted
 * `sharedPresence` Y.Map (which survives reload / is LAN-visible). Ephemeral
 * cursor/selection is NOT written here — see `publishSelection`.
 */
export function publishPresence(patch: Partial<LANPeer>) {
  const settings = activeSettings ?? readLANSettings();
  const durable: LANPeer = {
    id: settings.peer.id,
    name: settings.peer.name,
    role: settings.peer.role,
    color: settings.peer.color,
    active: true,
    ...patch,
    lastSeenAt: Date.now(),
  };
  // Durable identity → persisted doc (small, stable; safe for IndexedDB log).
  sharedPresence.set(settings.peer.id, JSON.stringify(durable));
  // Awareness `user` carries durable identity for live peer lists.
  sharedAwareness?.setLocalStateField("user", durable);
}

/**
 * Publish EPHEMERAL cursor/selection. Goes to awareness `cursor` ONLY (never
 * the persisted doc) and is throttled. This is the high-frequency path.
 */
export function publishSelection(selection: string) {
  queueCursor({ selection });
}

/**
 * Publish the live pointer position (EPHEMERAL, awareness only, throttled).
 * `x` is a fraction (0–1) of the main content width; `y` is px from the top of
 * the content in content coordinates — see LiveCursors for the mapping.
 */
export function publishPointer(x: number, y: number) {
  queueCursor({ x, y });
}

/** Hide our pointer for peers (pointer left the shared surface). */
export function clearPointer() {
  queueCursor({ x: undefined, y: undefined });
}

/** Publish a section-anchored cursor (used by table components). Throttled. */
export function publishSectionCursor(patch: {
  sectionId: string;
  row?: number;
  x?: number;
  y?: number;
  selectionStart?: number;
  selectionEnd?: number;
}) {
  queueCursor(patch);
}

/** Clear the section cursor when the peer leaves the surface. */
export function clearSectionCursor() {
  queueCursor({
    x: undefined,
    y: undefined,
    row: undefined,
    selectionStart: undefined,
    selectionEnd: undefined,
  });
}

/** Publish a "follow me" request to a specific peer (shows a dialog on their side). */
export function requestFollowMe(targetPeerId: string, toPage: string, toTab?: string) {
  if (typeof window === "undefined") return;
  const settings = activeSettings ?? readLANSettings();
  const request: LANFollowRequest = {
    fromPeerId: settings.peer.id,
    fromPeerName: settings.peer.name,
    toPage,
    toTab,
    ts: Date.now(),
    expiresAt: Date.now() + 30_000,
  };
  sharedLanRoom.set(`followRequest:${targetPeerId}`, JSON.stringify(request));
  appendAudit("follow.request", `→ ${targetPeerId} → ${toPage}${toTab ? `#${toTab}` : ""}`);
}

/** Accept a pending follow request and signal resolution. */
export function acceptFollowMe(request: LANFollowRequest) {
  if (typeof window === "undefined") return;
  sharedLanRoom.set(`followRequest:${request.fromPeerId}`, "");
  appendAudit("follow.accept", `← ${request.fromPeerName} → ${request.toPage}`);
}

/** Decline a pending follow request. */
export function declineFollowMe(request: LANFollowRequest) {
  if (typeof window === "undefined") return;
  sharedLanRoom.set(`followRequest:${request.fromPeerId}`, "");
  appendAudit("follow.decline", `← ${request.fromPeerName} → ${request.toPage}`);
}

/** Read the most recent incoming follow request addressed to me (or null). */
export function readFollowRequest(): LANFollowRequest | null {
  if (typeof window === "undefined") return null;
  const settings = readLANSettings();
  const raw = sharedLanRoom.get(`followRequest:${settings.peer.id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LANFollowRequest;
    if (parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface FileShareMeta {
  name: string;
  size: number;
  type?: string;
}

/**
 * Announce a file share to peers over the shared CRDT doc (metadata only,
 * no bytes — peers fetch out-of-band, same contract as the Electron branch
 * of `uploadLANFile`). Use this when the caller holds path-based imports
 * rather than a `File` object (e.g. the Electron upload pipeline).
 */
export function announceFileDrop(meta: FileShareMeta, mode: "metadata" | "request" = "metadata") {
  const settings = activeSettings ?? readLANSettings();
  sharedLanRoom.set(
    "fileDrop",
    JSON.stringify({
      id: uid(),
      by: settings.peer,
      mode,
      name: meta.name,
      size: meta.size,
      type: meta.type || "application/octet-stream",
      at: Date.now(),
    }),
  );
  appendAudit("file.drop", `${meta.name} (${meta.size} bytes)`);
}

export function publishFileDrop(file: File, mode: "metadata" | "request" = "metadata") {
  announceFileDrop({ name: file.name, size: file.size, type: file.type }, mode);
}

export function readSharedFileDrop(): {
  id: string;
  by: LANPeer;
  mode: "metadata" | "request";
  name: string;
  size: number;
  type: string;
  at: number;
} | null {
  const raw = sharedLanRoom.get("fileDrop");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function subscribeLANRoom(fn: () => void): () => void {
  sharedLanRoom.observe(fn);
  return () => sharedLanRoom.unobserve(fn);
}

/**
 * A discovered LAN hub candidate (from Electron mDNS). This is the COEP-safe
 * discovery path: the renderer never makes a cross-origin HTTP fetch, the main
 * process does mDNS and hands back `ws://` candidates over IPC.
 */
export interface LANHubCandidate {
  name: string;
  host: string;
  port: number;
  /** ws:// URL ready to pass to connectLAN(). */
  url: string;
  room?: string;
  pairingRequired: boolean;
}

/**
 * Discover LAN hubs via Electron mDNS (preferred). Returns `ws://` candidates
 * with no cross-origin HTTP fetch. Empty array when the bridge is unavailable
 * (non-Electron / web build) — callers should fall back to `scanLANSubnet` or a
 * manual "enter IP" field.
 */
export async function discoverHubs(): Promise<LANHubCandidate[]> {
  const bridge = electronCollab();
  if (!bridge) return [];
  try {
    const hubs = await bridge.discover();
    return hubs.map((h) => ({
      name: h.name,
      host: h.host,
      port: h.port,
      url: h.url,
      room: h.room,
      pairingRequired: h.pairingRequired,
    }));
  } catch {
    return [];
  }
}

/**
 * Subscribe to live mDNS hub up/down events from Electron. Returns an
 * unsubscribe function; no-op (returns a no-op) when the bridge is unavailable.
 */
export function subscribeHubDiscovery(
  fn: (event: { type: "up" | "down"; hub: LANHubCandidate }) => void,
): () => void {
  const bridge = electronCollab();
  if (!bridge) return () => {};
  return bridge.onDiscovered((event) =>
    fn({
      type: event.type,
      hub: {
        name: event.hub.name,
        host: event.hub.host,
        port: event.hub.port,
        url: event.hub.url,
        room: event.hub.room,
        pairingRequired: event.hub.pairingRequired,
      },
    }),
  );
}

/**
 * Start (or reuse) the in-app Electron-main collab hub and return a ready-to-use
 * `ws://localhost:<port>` URL + pairing code. Null when no Electron bridge.
 * Lets a host spin up a LAN room without a separate `lan-server` terminal.
 */
export async function startInAppHub(input?: {
  port?: number;
  pairingCode?: string;
  guestCode?: string;
  room?: string;
}): Promise<{
  url: string;
  pairingCode: string;
  guestCode: string;
  room: string;
  websocketUrls: string[];
  ips?: Array<{ name: string; address: string }>;
} | null> {
  const bridge = electronCollab();
  if (!bridge) return null;
  const st = await bridge.start({
    port: input?.port,
    pairingCode: input?.pairingCode,
    guestCode: input?.guestCode,
    room: input?.room,
    advertise: true,
    discover: true,
  });
  if (!st.running || !st.port) return null;
  const local = `ws://127.0.0.1:${st.port}`;
  return {
    url: st.websocketUrls[0] ?? local,
    pairingCode: st.pairingCode ?? "",
    guestCode: st.guestCode ?? "",
    room: st.room ?? input?.room ?? "telecom-default",
    websocketUrls: st.websocketUrls,
    ips: st.ips,
  };
}

/** Stop the in-app Electron-main collab hub (no-op without the bridge). */
export async function stopInAppHub(): Promise<void> {
  await electronCollab()?.stop();
}

/** Current in-app hub status (null without the bridge). */
export async function getInAppHubStatus(): Promise<ElectronCollabStatus | null> {
  const bridge = electronCollab();
  if (!bridge) return null;
  try {
    return await bridge.status();
  } catch {
    return null;
  }
}

export async function discoverLAN(url: string): Promise<LANDiscovery> {
  // The HTTP sidecar fetch is a cross-origin request from the COEP:require-corp
  // renderer; it only succeeds if the hub sends `Cross-Origin-Resource-Policy:
  // cross-origin`. Prefer Electron mDNS discovery (discoverHubs) where possible.
  const res = await fetch(`${httpFromWs(url).replace(/\/$/, "")}/lan/status`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`LAN discovery failed: ${res.status}`);
  return (await res.json()) as LANDiscovery;
}

export async function scanLANSubnet({
  sampleUrl,
  timeoutMs = 450,
  limit = 254,
}: {
  sampleUrl: string;
  timeoutMs?: number;
  limit?: number;
}): Promise<LANScanResult[]> {
  // Prefer Electron mDNS discovery: if any hub is already known, return it and
  // skip the cross-origin 254-host brute force (which is CORP-blocked in the
  // isolated renderer anyway). The subnet scan stays as the non-Electron / no-
  // multicast fallback.
  const hubs = await discoverHubs();
  if (hubs.length > 0) {
    return hubs.map((hub) => ({
      url: hub.url,
      status: "found" as const,
    }));
  }

  const parsed = new URL(sampleUrl);
  const host = parsed.hostname;
  const port = parsed.port || "1234";
  const parts = host.split(".");
  if (parts.length !== 4) {
    throw new Error("Subnet scan needs an IPv4 LAN URL.");
  }
  const prefix = parts.slice(0, 3).join(".");
  const candidates = Array.from({ length: Math.min(limit, 254) }, (_, i) => {
    const ip = `${prefix}.${i + 1}`;
    return `${parsed.protocol}//${ip}:${port}`;
  });

  const batchSize = 24;
  const found: LANScanResult[] = [];
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (url): Promise<LANScanResult> => {
        const controller = new AbortController();
        const started = performance.now();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(`${httpFromWs(url)}/lan/status`, {
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!res.ok) return { url, status: "miss" };
          const discovery = (await res.json()) as LANDiscovery;
          return {
            url: wsFromHttp(url),
            status: "found",
            discovery,
            latencyMs: Math.round(performance.now() - started),
          };
        } catch (error) {
          clearTimeout(timer);
          return {
            url: wsFromHttp(url),
            status: "error",
            error: String((error as Error).message ?? error),
          };
        }
      }),
    );
    found.push(...results.filter((result) => result.status === "found"));
    if (found.length >= 8) break;
  }
  return found;
}

export async function uploadLANFile(file: File): Promise<LANSharedFile> {
  const settings = activeSettings ?? readLANSettings();
  if (!settings.url) throw new Error("LAN URL is required before upload.");

  // COEP gotcha: a cross-origin multipart POST from the isolated renderer is
  // CORP-blocked in the packaged app. Inside Electron, prefer a pure-CRDT file
  // announcement (metadata only) over the HTTP sidecar — peers fetch/transfer
  // out-of-band. The HTTP path remains for the browser/web build + zero-config
  // `lan-server.mjs` relay (which sends `CORP: cross-origin`).
  if (hasCollabHubBridge()) {
    const announced: LANSharedFile = {
      id: uid(),
      originalName: file.name,
      storedName: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      room: settings.room,
      peerId: settings.peer.id,
      peerName: settings.peer.name,
      receivedAt: new Date().toISOString(),
    };
    sharedLanRoom.set(
      "fileDrop",
      JSON.stringify({
        id: announced.id,
        by: settings.peer,
        mode: "metadata",
        name: announced.originalName,
        size: announced.size,
        type: announced.type,
        at: Date.now(),
        storedName: announced.storedName,
      }),
    );
    appendAudit("file.announced", announced.originalName);
    return announced;
  }

  const res = await fetch(`${httpFromWs(settings.url).replace(/\/$/, "")}/lan/files`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-file-name": file.name,
      "x-peer-id": settings.peer.id,
      "x-peer-name": settings.peer.name,
      "x-room": settings.room,
      "x-pairing-code": settings.pairingCode,
    },
    body: file,
  });
  const body = (await res.json()) as {
    ok: boolean;
    file?: LANSharedFile;
    error?: string;
  };
  if (!res.ok || !body.ok || !body.file) {
    throw new Error(body.error ?? `LAN file upload failed: ${res.status}`);
  }
  sharedLanRoom.set(
    "fileDrop",
    JSON.stringify({
      id: body.file.id,
      by: settings.peer,
      mode: "metadata",
      name: body.file.originalName,
      size: body.file.size,
      type: body.file.type,
      at: Date.now(),
      storedName: body.file.storedName,
    }),
  );
  appendAudit("file.uploaded", body.file.originalName);
  return body.file;
}

export function buildLANCommand(settings: LANSettings): string {
  // `settings.url` is a live-typed field (see lan-control-center.tsx's "Server
  // address" input, and the identical comment on `getLANJoinUrl` below) —
  // every keystroke re-renders this while the value is still an incomplete or
  // invalid URL (e.g. "w", "ws:"). Fall back to the default port instead of
  // throwing `TypeError: Invalid URL` through the render tree.
  let port = "1234";
  if (settings.url) {
    try {
      port = new URL(settings.url).port || "1234";
    } catch {}
  }
  // The server also prints a GUEST_CODE (view-only) — share that one with guests.
  return `PAIRING_CODE=${settings.pairingCode || "123456"} PORT=${port} pnpm run dev:lan`;
}

export function getLANJoinUrl(settings: LANSettings): string {
  try {
    const base = new URL(httpFromWs(settings.url));
    base.pathname = "/guest/join";
    base.searchParams.set("room", settings.room);
    base.searchParams.set("code", settings.pairingCode);
    base.searchParams.set("role", settings.peer.role);
    return base.toString();
  } catch {
    return "";
  }
}

export function isConnected(): boolean {
  return status === "connected";
}
