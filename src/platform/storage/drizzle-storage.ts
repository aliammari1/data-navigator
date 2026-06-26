/**
 * A zustand `StateStorage` backed by drizzle (`app_setting` table) with a
 * synchronous localStorage write-through cache.
 *
 * Why this shape:
 * - The renderer cannot touch better-sqlite3 directly, so durable writes go
 *   through the Electron settings IPC bridge (see settings-client.ts).
 * - localStorage is kept as a synchronous working copy so store hydration stays
 *   instant in the common (warm-cache) case — no UI flash of default state.
 * - On a single-user desktop build the "remote" is just this machine's SQLite
 *   file, so reconciliation is simple: the localStorage working copy wins when
 *   present; SQLite is the durable backup that restores state when localStorage
 *   was cleared (or on a fresh renderer profile). Every write fans out to both.
 *
 * Usage:
 *   persist(creator, {
 *     name: "data-navigator-settings",
 *     storage: createJSONStorage(() => createDrizzleStorage()),
 *   })
 *
 * The persist `name` is used as the `app_setting` key under `namespace`
 * (default "store"), so each store occupies one durable, exportable row.
 */

import {
  canUseSettingsApi,
  deleteAppSettingRemote,
  getAppSettingRemote,
  putAppSettingRemote,
} from "@/platform/settings/settings-client";

/** Matches zustand's `StateStorage` without importing from zustand/middleware. */
export interface StateStorage {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
}

export type DrizzleStorageOptions = {
  /** app_setting namespace bucket for these rows. Default: "store". */
  namespace?: string;
  /**
   * Called (once per failed remote op) so callers can surface/telemeter
   * persistence failures. Defaults to a console warning.
   */
  onError?: (op: "get" | "set" | "remove", name: string, error: unknown) => void;
};

const DEFAULT_NAMESPACE = "store";

/**
 * Keys whose localStorage working copy has already been mirrored into drizzle
 * this session. Prevents a write storm while still guaranteeing that pre-existing
 * localStorage data (e.g. from an app version before drizzle backing existed) is
 * lifted into the durable store exactly once after load.
 */
const durablySynced = new Set<string>();

/** Test-only: clears the once-per-session durable-sync dedup set. */
export function __resetDurableSyncForTests(): void {
  durablySynced.clear();
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readLocal(name: string): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

function writeLocal(name: string, value: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(name, value);
  } catch {
    // quota / private-mode — drizzle still holds the durable copy
  }
}

function removeLocal(name: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(name);
  } catch {
    // ignore
  }
}

/**
 * Create a drizzle-backed `StateStorage` for use with zustand's
 * `createJSONStorage`. The stored values are the opaque persisted strings that
 * zustand produces; this adapter never interprets them.
 */
export function createDrizzleStorage(options: DrizzleStorageOptions = {}): StateStorage {
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  const onError =
    options.onError ??
    ((op, name, error) => {
      console.warn(`[drizzle-storage] ${op} failed for ${namespace}/${name}`, error);
    });

  return {
    async getItem(name: string): Promise<string | null> {
      // Warm path: localStorage working copy hydrates synchronously-fast.
      const local = readLocal(name);
      if (local !== null) {
        // One-time durable mirror: lift the existing working copy into drizzle
        // so a later localStorage wipe (or upgrade from a pre-drizzle version)
        // doesn't lose it. Idempotent upsert, fire-and-forget, once per key.
        const syncKey = `${namespace}:${name}`;
        if (!durablySynced.has(syncKey) && canUseSettingsApi()) {
          durablySynced.add(syncKey);
          void putAppSettingRemote(namespace, name, local).catch((error) =>
            onError("set", name, error),
          );
        }
        return local;
      }

      // Cold path: restore the durable copy from SQLite (fresh profile or
      // cleared localStorage). Only here do we pay a round-trip.
      if (!canUseSettingsApi()) return null;
      try {
        const { value } = await getAppSettingRemote<string>(namespace, name);
        if (typeof value === "string") {
          writeLocal(name, value);
          return value;
        }
      } catch (error) {
        onError("get", name, error);
      }
      return null;
    },

    setItem(name: string, value: string): void {
      // Working copy first (sync), then fan out the durable write.
      writeLocal(name, value);
      durablySynced.add(`${namespace}:${name}`);
      void putAppSettingRemote(namespace, name, value).catch((error) =>
        onError("set", name, error),
      );
    },

    removeItem(name: string): void {
      removeLocal(name);
      void deleteAppSettingRemote(namespace, name).catch((error) => onError("remove", name, error));
    },
  };
}
