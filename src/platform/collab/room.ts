/**
 * Per-room CRDT document substrate.
 *
 * `getRoomDoc(roomId)` is the single source of truth for a collaboration room:
 * comments, changes, chat, annotations, approvals, audit and meta as Yjs shared
 * types. The substrate owns the full lifecycle the screen should NOT re-invent:
 *
 *   1. durable offline persistence  (y-indexeddb, gated by `whenStored`)
 *   2. presence                     (y-protocols Awareness, auto-pruned)
 *   3. same-origin cross-tab sync   (BroadcastChannel Yjs provider)
 *   4. optional LAN transport       (y-websocket, lazy, COEP-safe ws://)
 *
 * Rooms are reference-counted: balance every `getRoomDoc`/`acquireRoom` with a
 * `releaseRoom`. The doc + persistence + awareness + providers tear down when
 * the last consumer releases.
 *
 * Crucially this replaces the localStorage/BroadcastChannel silos: the Yjs doc
 * is the ONLY source of truth, and it is durable + LAN-syncable for free.
 */

"use client";

import * as Y from "yjs";
import {
  createAwareness,
  destroyAwareness,
} from "./awareness";
import { attachPersistence, detachPersistence } from "./persistence";
import type {
  CollabConnectOptions,
  CollabRoomDoc,
  CollabTransportStatus,
} from "./types";

const BROADCAST_PREFIX = "dn-room-v1:";
const PERSIST_PREFIX = "dn-room-";

interface ProviderHandle {
  destroy(): void;
  disconnect?(): void;
  on?(ev: string, fn: (st: { status: string }) => void): void;
}

interface RoomEntry {
  room: CollabRoomDoc;
  persistName: string;
  channel: BroadcastChannel | null;
  channelTeardown: (() => void) | null;
  provider: ProviderHandle | null;
  providerStatus: CollabTransportStatus;
  statusWatchers: Set<(s: CollabTransportStatus) => void>;
  refs: number;
}

const rooms = new Map<string, RoomEntry>();

// ─── BroadcastChannel cross-tab provider ──────────────────────────────────────

function wireBroadcast(
  roomId: string,
  doc: Y.Doc,
): { channel: BroadcastChannel | null; teardown: () => void } {
  if (typeof BroadcastChannel === "undefined") {
    return { channel: null, teardown: () => {} };
  }
  const channel = new BroadcastChannel(`${BROADCAST_PREFIX}${roomId}`);

  const handleUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return; // don't echo remote-applied updates
    channel.postMessage(update);
  };
  doc.on("update", handleUpdate);

  channel.onmessage = (event: MessageEvent<ArrayBuffer | Uint8Array>) => {
    const data =
      event.data instanceof Uint8Array
        ? event.data
        : new Uint8Array(event.data);
    Y.applyUpdate(doc, data, "remote");
  };

  // Replay our state so a freshly-opened tab hydrates from existing ones.
  channel.postMessage(Y.encodeStateAsUpdate(doc));

  return {
    channel,
    teardown: () => doc.off("update", handleUpdate),
  };
}

// ─── Room construction ────────────────────────────────────────────────────────

function createRoom(roomId: string): RoomEntry {
  const doc = new Y.Doc();
  const persistName = `${PERSIST_PREFIX}${roomId}`;

  // 1. Durable offline persistence — attach BEFORE any network provider.
  const persistence = attachPersistence(persistName, doc);

  // 2. Same-origin cross-tab sync.
  const { channel, teardown: channelTeardown } = wireBroadcast(roomId, doc);

  // 3. Presence.
  const awareness = createAwareness(doc);

  const entry: RoomEntry = {
    persistName,
    channel,
    channelTeardown,
    provider: null,
    providerStatus: "off",
    statusWatchers: new Set(),
    refs: 1,
    room: {
      id: roomId,
      doc,
      comments: doc.getArray<Y.Map<unknown>>("comments"),
      changes: doc.getArray<Y.Map<unknown>>("changes"),
      chat: doc.getArray<Y.Map<unknown>>("chat"),
      annotations: doc.getMap<Y.Array<Y.Map<unknown>>>("annotations"),
      approvals: doc.getMap<Y.Map<unknown>>("approvals"),
      audit: doc.getArray<string>("audit"),
      meta: doc.getMap<unknown>("meta"),
      // Resolves once local content has loaded (or immediately under SSR).
      whenStored: persistence ? persistence.whenSynced : Promise.resolve(),
      awareness,
      destroy() {
        // Real teardown is driven by releaseRoom() ref-counting; this is the
        // last-consumer cleanup path it calls.
        teardownRoom(roomId);
      },
    },
  };

  return entry;
}

function teardownRoom(roomId: string): void {
  const entry = rooms.get(roomId);
  if (!entry) return;
  try {
    entry.provider?.destroy();
  } catch {
    // ignore
  }
  if (entry.room.awareness) {
    try {
      destroyAwareness(entry.room.awareness);
    } catch {
      // ignore
    }
  }
  try {
    entry.channelTeardown?.();
    entry.channel?.close();
  } catch {
    // ignore
  }
  // Detach persistence (keep the data on disk for next open).
  void detachPersistence(entry.persistName);
  try {
    entry.room.doc.destroy();
  } catch {
    // ignore
  }
  rooms.delete(roomId);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Acquire (or create) the shared room document. Reference-counted: each call
 * must be balanced with `releaseRoom(roomId)`.
 */
export function getRoomDoc(roomId: string): CollabRoomDoc {
  const existing = rooms.get(roomId);
  if (existing) {
    existing.refs += 1;
    return existing.room;
  }
  const entry = createRoom(roomId);
  rooms.set(roomId, entry);
  return entry.room;
}

/** Alias kept for parity with the feature-layer naming (`acquireRoom`). */
export const acquireRoom = getRoomDoc;

/** Release one reference; the room tears down when the last consumer leaves. */
export function releaseRoom(roomId: string): void {
  const entry = rooms.get(roomId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  teardownRoom(roomId);
}

/** Snapshot of the current LAN transport status for a room. */
export function getRoomStatus(roomId: string): CollabTransportStatus {
  return rooms.get(roomId)?.providerStatus ?? "off";
}

/** Subscribe to LAN transport status changes for a room. */
export function subscribeRoomStatus(
  roomId: string,
  fn: (status: CollabTransportStatus) => void,
): () => void {
  const entry = rooms.get(roomId);
  if (!entry) return () => {};
  entry.statusWatchers.add(fn);
  return () => entry.statusWatchers.delete(fn);
}

function emitRoomStatus(entry: RoomEntry, status: CollabTransportStatus): void {
  entry.providerStatus = status;
  entry.statusWatchers.forEach((fn) => {
    fn(status);
  });
}

/**
 * Attach a room doc to a LAN hub over y-websocket. Lazy-imports y-websocket so
 * the provider stays out of routes that never collaborate.
 *
 * Honors the offline ordering invariant: awaits `whenStored` (local load)
 * before connecting so offline edits are never clobbered by remote state.
 */
export async function connectRoomLAN(
  roomId: string,
  opts: CollabConnectOptions,
): Promise<void> {
  const entry = rooms.get(roomId);
  if (!entry) throw new Error(`connectRoomLAN: room "${roomId}" not acquired`);
  if (!opts.url) return;

  // Ordering invariant: load local content first.
  await entry.room.whenStored;

  // Tear down any prior provider on this room.
  if (entry.provider) {
    try {
      entry.provider.destroy();
    } catch {
      // ignore
    }
    entry.provider = null;
  }

  emitRoomStatus(entry, "connecting");

  const mod = await import("y-websocket");
  const WebsocketProvider = (
    mod as unknown as {
      WebsocketProvider: new (
        url: string,
        room: string,
        doc: Y.Doc,
        config?: Record<string, unknown>,
      ) => ProviderHandle;
    }
  ).WebsocketProvider;

  // Reuse the room's awareness so presence rides the same socket as the doc.
  const provider = new WebsocketProvider(opts.url, opts.room, entry.room.doc, {
    connect: true,
    awareness: entry.room.awareness ?? undefined,
    params: {
      peerId: opts.identity.id,
      peerName: opts.identity.name,
      role: opts.identity.role,
      pairingCode: opts.pairingCode,
    },
  });

  provider.on?.("status", (event: { status: string }) => {
    const next: CollabTransportStatus =
      event.status === "connected"
        ? "connected"
        : event.status === "connecting"
          ? "connecting"
          : "disconnected";
    emitRoomStatus(entry, next);
  });

  entry.provider = provider;
}

/** Disconnect (but keep) a room's LAN provider. */
export function disconnectRoomLAN(roomId: string): void {
  const entry = rooms.get(roomId);
  if (!entry?.provider) return;
  try {
    entry.provider.disconnect?.();
    entry.provider.destroy();
  } catch {
    // ignore
  }
  entry.provider = null;
  emitRoomStatus(entry, "off");
}
