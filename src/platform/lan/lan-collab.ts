/**
 * LAN collaboration over the local y-websocket relay.
 *
 * The relay is intentionally small: one PC hosts `scripts/lan-server.mjs` (or
 * the in-app Electron-main Hocuspocus hub), and peers join by IP address +
 * pairing code. Yjs carries shared report state, `y-protocols/awareness`
 * carries live presence (auto-pruned ~30s after a peer stalls — no hand-rolled
 * heartbeat), and discovery prefers Electron mDNS over IPC (the cross-origin
 * isolated renderer cannot reliably do cross-origin HTTP fetches under
 * COEP:require-corp — see architecture §8).
 *
 * Presence discipline: DURABLE identity (id/name/role/color) lives in awareness
 * `user` (+ the doc); EPHEMERAL cursor/selection lives in awareness `cursor`
 * ONLY — it is NOT written into the persisted `sharedPresence`/doc (that would
 * bloat the doc + the IndexedDB update log).
 */

"use client";

import { Awareness } from "y-protocols/awareness";
import {
  ensureAppDocPersistence,
  sharedAudit,
  sharedLanRoom,
  sharedPresence,
  ydoc,
} from "@/platform/collab/collab";

export type LANRole = "host" | "editor" | "reviewer" | "viewer";
export type LANStatus = "off" | "connecting" | "connected" | "error";

export interface LANPeer {
  id: string;
  name: string;
  role: LANRole;
  color: string;
  active: boolean;
  page?: string;
  selection?: string;
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

const PEER_KEY = "telecom-lan-peer-v2";
const URL_KEY = "telecom-lan-ws-url-v2";
const ROOM_KEY = "telecom-lan-room-v2";
const CODE_KEY = "telecom-lan-pairing-code-v1";
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

interface ElectronCollabStatus {
  running: boolean;
  port: number | null;
  pairingCode: string | null;
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

function _joinUrl(opts: LANSettings): string {
  const url = new URL(opts.url);
  url.pathname = `/${encodeURIComponent(opts.room)}`;
  url.searchParams.set("peerId", opts.peer.id);
  url.searchParams.set("peerName", opts.peer.name);
  url.searchParams.set("role", opts.peer.role);
  url.searchParams.set("pairingCode", opts.pairingCode);
  return url.toString();
}

export function makeJoinHttpUrl(settings: LANSettings): string {
  const base = new URL(httpFromWs(settings.url));
  base.searchParams.set("room", settings.room);
  base.searchParams.set("code", settings.pairingCode);
  base.searchParams.set("role", settings.peer.role);
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
  awareness?: Awareness;
  on?(ev: string, fn: (st: { status: string }) => void): void;
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

/** Lazily create the shared Awareness for the app doc (browser only). */
function getAwareness(): Awareness | null {
  if (typeof window === "undefined") return null;
  if (!sharedAwareness) sharedAwareness = new Awareness(ydoc);
  return sharedAwareness;
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

export async function connectLAN(settings: LANSettings): Promise<void> {
  await disconnectLAN();
  if (!settings.url) {
    status = "off";
    emit();
    return;
  }
  status = "connecting";
  activeSettings = settings;
  emit();

  try {
    // Offline ordering invariant: load durable local content BEFORE connecting,
    // so a remote peer's state never clobbers local-only offline edits.
    await ensureAppDocPersistence();

    const awareness = getAwareness();

    const mod = await import("y-websocket");
    const WebsocketProvider = (
      mod as unknown as {
        WebsocketProvider: new (
          url: string,
          room: string,
          ydoc: unknown,
          opts?: Record<string, unknown>,
        ) => ProviderHandle;
      }
    ).WebsocketProvider;

    provider = new WebsocketProvider(settings.url, settings.room, ydoc, {
      connect: true,
      // Reuse the shared Awareness so presence rides this same socket.
      awareness: awareness ?? undefined,
      params: {
        peerId: settings.peer.id,
        peerName: settings.peer.name,
        role: settings.peer.role,
        pairingCode: settings.pairingCode,
      },
    });

    provider.on?.("status", (event: { status: string }) => {
      status =
        event.status === "connected"
          ? "connected"
          : event.status === "connecting"
            ? "connecting"
            : "off";
      if (status === "connected") appendAudit("peer.connected");
      emit();
    });

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
    const user = (state as { user?: LANPeer }).user;
    if (user) list.push({ ...user, active: true });
  }
  peers = list;
  emit();
}

export async function disconnectLAN(): Promise<void> {
  if (provider) {
    try {
      appendAudit("peer.disconnected");
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
  emit();
}

// rAF-throttled cursor writer: a flood of selection/scroll events coalesces to
// at most one awareness write per frame, so remote peers don't re-render every
// subscriber on a medium CPU.
let pendingCursor: { page: string; selection?: string; at: number } | null = null;
let cursorRaf: number | null = null;

function flushCursor() {
  cursorRaf = null;
  const next = pendingCursor;
  pendingCursor = null;
  if (next) sharedAwareness?.setLocalStateField("cursor", next);
}

/**
 * Publish DURABLE identity changes (name/role/color/page). Writes the identity
 * to awareness `user` AND mirrors the durable identity into the persisted
 * `sharedPresence` Y.Map (which survives reload / is LAN-visible). Ephemeral
 * cursor/selection is NOT written here — see `publishSelection`.
 */
export function publishPresence(patch: Partial<LANPeer>) {
  const settings = activeSettings ?? readLANSettings();
  // Strip ephemeral cursor/selection from the durable record we persist.
  const { selection: _selection, ...durablePatch } = patch;
  const durable: LANPeer = {
    id: settings.peer.id,
    name: settings.peer.name,
    role: settings.peer.role,
    color: settings.peer.color,
    active: true,
    ...durablePatch,
    lastSeenAt: Date.now(),
  };
  // Durable identity → persisted doc (small, stable; safe for IndexedDB log).
  sharedPresence.set(settings.peer.id, JSON.stringify(durable));
  // Awareness `user` carries durable identity for live peer lists.
  sharedAwareness?.setLocalStateField("user", durable);
}

/**
 * Publish EPHEMERAL cursor/selection. Goes to awareness `cursor` ONLY (never
 * the persisted doc) and is rAF-throttled. This is the high-frequency path.
 */
export function publishSelection(selection: string) {
  pendingCursor = {
    page: typeof location !== "undefined" ? `${location.pathname}${location.search}` : "",
    selection,
    at: Date.now(),
  };
  if (cursorRaf !== null) return;
  cursorRaf =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(flushCursor)
      : (setTimeout(flushCursor, 16) as unknown as number);
}

export function publishFileDrop(file: File, mode: "metadata" | "request" = "metadata") {
  const settings = activeSettings ?? readLANSettings();
  sharedLanRoom.set(
    "fileDrop",
    JSON.stringify({
      id: uid(),
      by: settings.peer,
      mode,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      at: Date.now(),
    }),
  );
  appendAudit("file.drop", `${file.name} (${file.size} bytes)`);
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
  room?: string;
}): Promise<{
  url: string;
  pairingCode: string;
  room: string;
  websocketUrls: string[];
} | null> {
  const bridge = electronCollab();
  if (!bridge) return null;
  const st = await bridge.start({
    port: input?.port,
    pairingCode: input?.pairingCode,
    room: input?.room,
    advertise: true,
    discover: true,
  });
  if (!st.running || !st.port) return null;
  const local = `ws://127.0.0.1:${st.port}`;
  return {
    url: st.websocketUrls[0] ?? local,
    pairingCode: st.pairingCode ?? "",
    room: st.room ?? input?.room ?? "telecom-default",
    websocketUrls: st.websocketUrls,
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
  const port = settings.url ? new URL(settings.url).port || "1234" : "1234";
  return `PAIRING_CODE=${settings.pairingCode || "123456"} PORT=${port} npm run lan-server`;
}

export function getLANJoinUrl(settings: LANSettings): string {
  return makeJoinHttpUrl(settings);
}

export function isConnected(): boolean {
  return status === "connected";
}
