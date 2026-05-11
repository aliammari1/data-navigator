/**
 * LAN collaboration over the local y-websocket relay.
 *
 * The relay is intentionally small: one PC hosts `scripts/lan-server.mjs`, and
 * peers join by IP address + pairing code. Yjs carries shared report state,
 * awareness carries live presence, and the HTTP sidecar exposes discovery,
 * audit, and room health.
 */

"use client";

import {
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
    peers: Array<{ id: string; name: string; role: LANRole; lastSeenAt: number }>;
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

function joinUrl(opts: LANSettings): string {
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
  const url =
    (typeof localStorage !== "undefined" && localStorage.getItem(URL_KEY)) ||
    "";
  const room =
    (typeof localStorage !== "undefined" && localStorage.getItem(ROOM_KEY)) ||
    "telecom-default";
  const pairingCode =
    (typeof localStorage !== "undefined" && localStorage.getItem(CODE_KEY)) ||
    "";
  let peer: LANPeer | null = null;
  try {
    const raw =
      typeof localStorage !== "undefined" && localStorage.getItem(PEER_KEY);
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
  awareness?: {
    setLocalStateField(k: string, v: unknown): void;
    getStates(): Map<number, unknown>;
    on(event: string, fn: () => void): void;
    off(event: string, fn: () => void): void;
  };
  on?(ev: string, fn: (st: { status: string }) => void): void;
}

let provider: ProviderHandle | null = null;
let watchers = new Set<() => void>();
let status: LANStatus = "off";
let peers: LANPeer[] = [];
let activeSettings: LANSettings | null = null;

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
  watchers.forEach((fn) => fn());
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

    if (provider.awareness) {
      provider.awareness.setLocalStateField("user", {
        id: settings.peer.id,
        name: settings.peer.name,
        role: settings.peer.role,
        color: settings.peer.color,
        page:
          typeof location !== "undefined"
            ? `${location.pathname}${location.search}`
            : "",
        lastSeenAt: Date.now(),
      });
      provider.awareness.on("change", refreshPeers);
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
  if (!provider?.awareness) {
    peers = [];
    emit();
    return;
  }
  const list: LANPeer[] = [];
  for (const [, state] of provider.awareness.getStates()) {
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
      provider.awareness?.off("change", refreshPeers);
      provider.destroy();
    } catch {}
    provider = null;
  }
  status = "off";
  peers = [];
  activeSettings = null;
  emit();
}

export function publishPresence(patch: Partial<LANPeer>) {
  const settings = activeSettings ?? readLANSettings();
  const next = {
    ...settings.peer,
    ...patch,
    lastSeenAt: Date.now(),
  };
  sharedPresence.set(settings.peer.id, JSON.stringify(next));
  provider?.awareness?.setLocalStateField("user", next);
}

export function publishSelection(selection: string) {
  publishPresence({
    page:
      typeof location !== "undefined"
        ? `${location.pathname}${location.search}`
        : "",
    selection,
  });
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

export function readSharedFileDrop():
  | {
      id: string;
      by: LANPeer;
      mode: "metadata" | "request";
      name: string;
      size: number;
      type: string;
      at: number;
    }
  | null {
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

export async function discoverLAN(url: string): Promise<LANDiscovery> {
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
  const body = (await res.json()) as { ok: boolean; file?: LANSharedFile; error?: string };
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
  return `PAIRING_CODE=${settings.pairingCode || "123456"} PORT=${port} bun run lan-server`;
}

export function getLANJoinUrl(settings: LANSettings): string {
  return makeJoinHttpUrl(settings);
}

export function isConnected(): boolean {
  return status === "connected";
}
