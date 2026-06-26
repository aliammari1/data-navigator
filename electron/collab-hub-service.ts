/**
 * LAN Collaboration Hub — Electron MAIN process edition (OPTIONAL in-app hub).
 *
 * Mental model (mirrors duckdb-service.ts / voice-service.ts):
 * - The DEFAULT offline collab path stays renderer + `scripts/lan-server.mjs`
 *   (zero new deps). This service is the opt-in upgrade: an embedded
 *   `@hocuspocus/server` LAN hub (so no separate terminal) with SQLite
 *   persistence + `bonjour-service` mDNS auto-discovery — all in the main
 *   process, behind IPC (`collabHub:*`). The renderer connects to it as an
 *   ordinary `y-websocket` client (the collab-client agent owns that side).
 * - @hocuspocus/server + bonjour-service pull in Node APIs and MUST NOT be
 *   imported in the renderer. They are lazy-imported here so the cost is only
 *   paid when the hub is actually started.
 * - SQLite + mDNS advertise/discover, pairing-code auth, read-only
 *   reviewer/viewer roles — matching the existing `lan-server.mjs` contract.
 *
 * Public API (exposed over IPC as window.electronCollab.*):
 * - start()       — boot the embedded hub + begin mDNS advertise
 * - stop()        — destroy the hub + stop advertising
 * - status()      — running?, port, pairing code, LAN URLs
 * - discover()    — list mDNS-discovered peer hubs (ws:// candidates)
 * - getDiscovered()
 */

import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { generatePairingCode, pairingCodesMatch } from "./collab-pairing";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CollabHubStartInput = {
  port?: number;
  pairingCode?: string;
  room?: string;
  /** Advertise this hub over mDNS so peers can auto-discover it. */
  advertise?: boolean;
  /** Begin browsing for peer hubs over mDNS on start. */
  discover?: boolean;
};

export type CollabHubStatus = {
  running: boolean;
  port: number | null;
  pairingCode: string | null;
  room: string | null;
  advertising: boolean;
  discovering: boolean;
  /** ws:// URLs this host is reachable on (one per LAN IPv4 NIC). */
  websocketUrls: string[];
  ips: Array<{ name: string; address: string }>;
  dbPath: string | null;
  startedAt: string | null;
};

export type DiscoveredHub = {
  name: string;
  host: string;
  port: number;
  /** ws:// URL built from the first IPv4 address. */
  url: string;
  addresses: string[];
  room?: string;
  pairingRequired: boolean;
};

/** Sink for discovery events → wired in main.ts to `webContents.send`. */
export type DiscoveryListener = (event: { type: "up" | "down"; hub: DiscoveredHub }) => void;

// Minimal structural types so this file does not need the hocuspocus/bonjour
// type packages at compile time (they are lazy-imported as `unknown`).
type HocuspocusServer = {
  listen(): Promise<unknown> | unknown;
  destroy(): Promise<unknown> | unknown;
};
type BonjourInstance = {
  publish(opts: Record<string, unknown>): unknown;
  find(opts: Record<string, unknown>): BonjourBrowser;
  unpublishAll(cb?: () => void): void;
  destroy(): void;
};
type BonjourBrowser = {
  on(event: "up" | "down", cb: (svc: BonjourService) => void): void;
  stop?(): void;
};
type BonjourService = {
  name?: string;
  type?: string;
  port: number;
  host?: string;
  addresses?: string[];
  txt?: Record<string, string>;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_PORT = 1234;
const SERVICE_TYPE = "dn-collab"; // becomes _dn-collab._tcp
const SERVICE_NAME = "Data Navigator LAN";
const HUB_NAME = "data-navigator-hub";

// ─── Module state ───────────────────────────────────────────────────────────

let server: HocuspocusServer | null = null;
let bonjour: BonjourInstance | null = null;
let publishedService: unknown = null;
let browser: BonjourBrowser | null = null;

let activePort: number | null = null;
let activePairingCode: string | null = null;
let activeRoom: string | null = null;
let startedAt: string | null = null;
let dbPath: string | null = null;

const discovered = new Map<string, DiscoveredHub>();
let discoveryListener: DiscoveryListener | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function dataDir(): string {
  return path.join(app.getPath("userData"), "data-navigator", "collab");
}

function lanAddresses(): Array<{ name: string; address: string }> {
  const nets = os.networkInterfaces();
  const lans: Array<{ name: string; address: string }> = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        lans.push({ name, address: net.address });
      }
    }
  }
  return lans;
}

function websocketUrls(port: number): string[] {
  return lanAddresses().map((ip) => `ws://${ip.address}:${port}`);
}

function pickIpv4(addresses: string[] | undefined): string | undefined {
  return addresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
}

function serviceKey(svc: BonjourService): string {
  return `${svc.name ?? svc.host ?? "hub"}:${svc.port}`;
}

function toDiscoveredHub(svc: BonjourService): DiscoveredHub | null {
  const ip = pickIpv4(svc.addresses) ?? svc.host;
  if (!ip) return null;
  return {
    name: svc.name ?? SERVICE_NAME,
    host: svc.host ?? ip,
    port: svc.port,
    url: `ws://${ip}:${svc.port}`,
    addresses: svc.addresses ?? [],
    room: svc.txt?.room,
    pairingRequired: svc.txt?.pairingRequired === "1",
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Register a listener for mDNS discovery up/down events (set once from main.ts). */
export function setDiscoveryListener(listener: DiscoveryListener | null): void {
  discoveryListener = listener;
}

/** Boot the embedded Hocuspocus LAN hub (+ optional mDNS advertise/discover). */
export async function start(input: CollabHubStartInput = {}): Promise<CollabHubStatus> {
  if (server) {
    // Already running — return current status (idempotent).
    return status();
  }

  const port = input.port ?? DEFAULT_PORT;
  const pairingCode = input.pairingCode?.trim() || generatePairingCode();
  const room = input.room ?? "telecom-default";

  const { Server } = (await import("@hocuspocus/server")) as {
    Server: new (opts: Record<string, unknown>) => HocuspocusServer;
  };
  const { SQLite } = (await import("@hocuspocus/extension-sqlite")) as {
    SQLite: new (opts: Record<string, unknown>) => unknown;
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir(dataDir(), { recursive: true });
  dbPath = path.join(dataDir(), "collab-hub.sqlite");

  const instance = new Server({
    name: HUB_NAME,
    port,
    quiet: true,
    extensions: [new SQLite({ database: dbPath })],

    // v4: payload is web-standard. Read query params via URLSearchParams.get.
    // Pairing-code gate = the existing lan-server.mjs contract.
    async onAuthenticate(payload: {
      requestParameters: URLSearchParams;
      connection: { readOnly: boolean };
      documentName: string;
    }) {
      // Fail-closed, constant-time pairing-code check (see collab-pairing.ts):
      // a missing/empty/wrong code is rejected, and the comparison does not leak
      // via timing how many leading digits matched.
      const code = payload.requestParameters.get("pairingCode");
      if (!pairingCodesMatch(pairingCode, code)) {
        throw new Error("Invalid pairing code");
      }
      const role = payload.requestParameters.get("role");
      // Server-side role enforcement: read-only roles cannot mutate the doc.
      if (role === "viewer" || role === "reviewer") {
        payload.connection.readOnly = true;
      }
      return { role, documentName: payload.documentName };
    },

    async onListen() {
      if (input.advertise !== false) {
        startAdvertising(port, room, Boolean(pairingCode));
      }
    },
  });

  await instance.listen();
  server = instance;
  activePort = port;
  activePairingCode = pairingCode;
  activeRoom = room;
  startedAt = new Date().toISOString();

  if (input.discover) {
    startDiscovery();
  }

  return status();
}

/** Destroy the hub, stop mDNS advertising + discovery. */
export async function stop(): Promise<{ stopped: boolean }> {
  stopDiscovery();
  await stopAdvertising();

  if (server) {
    try {
      await server.destroy();
    } catch (error) {
      console.warn("[collab-hub] server destroy error:", error);
    }
    server = null;
  }

  activePort = null;
  activePairingCode = null;
  activeRoom = null;
  startedAt = null;
  dbPath = null;
  return { stopped: true };
}

/** Current hub status (never throws). */
export function status(): CollabHubStatus {
  return {
    running: server !== null,
    port: activePort,
    pairingCode: activePairingCode,
    room: activeRoom,
    advertising: publishedService !== null,
    discovering: browser !== null,
    websocketUrls: activePort ? websocketUrls(activePort) : [],
    ips: lanAddresses(),
    dbPath,
    startedAt,
  };
}

/**
 * Begin mDNS discovery and return the hubs currently known. The renderer can
 * also subscribe to live up/down events via the `collab:discovered` channel.
 */
export async function discover(): Promise<DiscoveredHub[]> {
  startDiscovery();
  return [...discovered.values()];
}

/** Snapshot of hubs discovered so far (no side effects). */
export function getDiscovered(): DiscoveredHub[] {
  return [...discovered.values()];
}

// ─── mDNS advertise/discover ──────────────────────────────────────────────────

async function ensureBonjour(): Promise<BonjourInstance> {
  if (!bonjour) {
    const mod = (await import("bonjour-service")) as unknown as {
      Bonjour: new (...args: unknown[]) => BonjourInstance;
      default?: new (...args: unknown[]) => BonjourInstance;
    };
    const Ctor = mod.Bonjour ?? mod.default;
    if (!Ctor) throw new Error("bonjour-service: missing Bonjour export");
    bonjour = new Ctor();
  }
  return bonjour;
}

function startAdvertising(port: number, room: string, pairingRequired: boolean): void {
  void (async () => {
    try {
      const inst = await ensureBonjour();
      publishedService = inst.publish({
        name: SERVICE_NAME,
        type: SERVICE_TYPE,
        port,
        protocol: "tcp",
        txt: { room, pairingRequired: pairingRequired ? "1" : "0" },
      });
    } catch (error) {
      console.warn("[collab-hub] mDNS advertise failed:", error);
    }
  })();
}

async function stopAdvertising(): Promise<void> {
  if (!publishedService) return;
  publishedService = null;
  const inst = bonjour;
  if (inst) {
    await new Promise<void>((resolve) => {
      try {
        inst.unpublishAll(() => resolve());
      } catch {
        resolve();
      }
    });
  }
}

function startDiscovery(): void {
  if (browser) return;
  void (async () => {
    try {
      const inst = await ensureBonjour();
      const b = inst.find({ type: SERVICE_TYPE });
      browser = b;
      b.on("up", (svc) => {
        const hub = toDiscoveredHub(svc);
        if (!hub) return;
        discovered.set(serviceKey(svc), hub);
        discoveryListener?.({ type: "up", hub });
      });
      b.on("down", (svc) => {
        const key = serviceKey(svc);
        const hub = discovered.get(key);
        discovered.delete(key);
        if (hub) discoveryListener?.({ type: "down", hub });
      });
    } catch (error) {
      console.warn("[collab-hub] mDNS discovery failed:", error);
    }
  })();
}

function stopDiscovery(): void {
  if (browser) {
    try {
      browser.stop?.();
    } catch {
      // ignore
    }
    browser = null;
  }
  discovered.clear();
}

/** Best-effort full teardown on app quit. */
export async function dispose(): Promise<void> {
  await stop();
  if (bonjour) {
    try {
      bonjour.destroy();
    } catch {
      // ignore
    }
    bonjour = null;
  }
}
