"use server";

const PENDING_TTL_MS = 5 * 60 * 1000;

export type PendingRole = "viewer" | "editor" | "reviewer";

export interface PendingGuest {
  id: string;
  name: string;
  role: PendingRole;
  pairingCode: string;
  room: string;
  hostSecret: string;
  hostUrl: string;
  requestedAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "denied";
  approvedRole?: PendingRole;
  sessionToken?: string;
}

interface Store {
  guests: PendingGuest[];
}

// In-memory zero-disk store scoped to the process lifecycle
const globalStore = globalThis as unknown as { __dn_pending_guests?: Store };
if (!globalStore.__dn_pending_guests) {
  globalStore.__dn_pending_guests = { guests: [] };
}
const memoryStore: Store = globalStore.__dn_pending_guests;

function readStore(): Store {
  return memoryStore;
}

function writeStore(store: Store): void {
  memoryStore.guests = store.guests;
}

function pruneExpired(store: Store): Store {
  const now = Date.now();
  const fresh = store.guests.filter((g) => g.expiresAt > now || g.status === "pending");
  if (fresh.length !== store.guests.length) {
    writeStore({ guests: fresh });
  }
  return { guests: fresh };
}

export async function createPendingGuest(input: {
  name: string;
  role: PendingRole;
  pairingCode: string;
  room: string;
  hostSecret: string;
  hostUrl: string;
}): Promise<PendingGuest> {
  const store = pruneExpired(readStore());

  const collision = store.guests.find(
    (g) =>
      g.room === input.room &&
      g.status === "pending" &&
      g.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (collision) {
    collision.requestedAt = Date.now();
    collision.expiresAt = Date.now() + PENDING_TTL_MS;
    writeStore(store);
    return collision;
  }

  const now = Date.now();
  const guest: PendingGuest = {
    id: crypto.randomUUID(),
    name: input.name,
    role: input.role,
    pairingCode: input.pairingCode,
    room: input.room,
    hostSecret: input.hostSecret,
    hostUrl: input.hostUrl,
    requestedAt: now,
    expiresAt: now + PENDING_TTL_MS,
    status: "pending",
  };
  store.guests.push(guest);
  if (store.guests.length > 100) {
    store.guests.splice(0, store.guests.length - 100);
  }
  writeStore(store);
  return guest;
}

export async function getPendingGuest(id: string): Promise<PendingGuest | null> {
  const store = pruneExpired(readStore());
  return store.guests.find((g) => g.id === id) ?? null;
}

export async function listPendingGuests(): Promise<PendingGuest[]> {
  return pruneExpired(readStore())
    .guests.filter((g) => g.status === "pending")
    .sort((a, b) => a.requestedAt - b.requestedAt);
}

export async function approvePendingGuest(
  id: string,
  approvedRole: PendingRole,
  sessionToken: string,
): Promise<PendingGuest | null> {
  const store = pruneExpired(readStore());
  const guest = store.guests.find((g) => g.id === id);
  if (!guest || guest.status !== "pending") return null;
  guest.status = "approved";
  guest.approvedRole = approvedRole;
  guest.sessionToken = sessionToken;
  guest.expiresAt = Date.now() + 30_000;
  writeStore(store);
  return guest;
}

export async function denyPendingGuest(id: string): Promise<PendingGuest | null> {
  const store = pruneExpired(readStore());
  const guest = store.guests.find((g) => g.id === id);
  if (!guest || guest.status !== "pending") return null;
  guest.status = "denied";
  guest.expiresAt = Date.now() + 30_000;
  writeStore(store);
  return guest;
}
