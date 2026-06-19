/**
 * TanStack Query persistence — instant cold-load paint (architecture §4).
 *
 * "Add an IndexedDB/OPFS persister so the last KPI/analytics snapshot paints
 * instantly on cold start, then revalidates." The dedicated
 * `@tanstack/query-persist-client` package is NOT installed here, so this is a
 * small self-contained persister built on the `dehydrate`/`hydrate` primitives
 * that DO ship with `@tanstack/react-query` (verified). It writes a single
 * dehydrated-cache blob to IndexedDB (Dexie) — optionally gzip-compressed — and
 * restores it before the first paint.
 *
 * Zero network: IndexedDB/OPFS only.
 *
 * Wire-in (a renderer/provider agent, not this module):
 *   1. `await restoreQueryClient(queryClient)` BEFORE first render (or gate
 *      render on its resolution) so cached data paints immediately.
 *   2. `const stop = persistQueryClient(queryClient)` to start the debounced
 *      write subscription; call `stop()` on unmount.
 */

import {
  dehydrate,
  defaultShouldDehydrateQuery,
  type DehydratedState,
  hydrate,
  type QueryClient,
} from "@tanstack/react-query";
import Dexie, { type Table } from "dexie";
import { compress, decompress } from "./compression";

// ─── Backing store (its own clearable DB) ─────────────────────────────────────

interface QueryCacheBlob {
  key: string; // singleton "default" (or a named cache bucket)
  savedAt: number;
  /** Persister format version — bump invalidates stale snapshots on upgrade. */
  buster: string;
  /** gzip(JSON(DehydratedState)) when compressed, else JSON bytes. */
  bytes: ArrayBuffer;
  compressed: boolean;
}

class QueryCacheDB extends Dexie {
  snapshots!: Table<QueryCacheBlob, string>;
  constructor() {
    super("data-navigator-query-cache-v1");
    this.version(1).stores({ snapshots: "key, savedAt" });
  }
}

const queryCacheDb = new QueryCacheDB();

// ─── Config ───────────────────────────────────────────────────────────────────

export interface QueryPersistOptions {
  /** Cache bucket key (default "default"). */
  key?: string;
  /** Discard snapshots older than this on restore. Default 24h. */
  maxAgeMs?: number;
  /**
   * Cache-bust token: when it changes, a persisted snapshot is dropped. Bump on
   * a deploy whose query shapes changed. Default "v1".
   */
  buster?: string;
  /** Debounce window for write-on-change. Default 1000ms. */
  throttleMs?: number;
  /** gzip the snapshot via CompressionStreams. Default true. */
  compress?: boolean;
  /** Restrict which queries are persisted (default: successful + non-disabled). */
  shouldDehydrateQuery?: (query: Parameters<typeof defaultShouldDehydrateQuery>[0]) => boolean;
}

const DEFAULTS = {
  key: "default",
  maxAgeMs: 24 * 60 * 60 * 1000,
  buster: "v1",
  throttleMs: 1000,
  compress: true,
} as const;

// ─── Restore (cold start) ─────────────────────────────────────────────────────

/**
 * Hydrate a `QueryClient` from the persisted snapshot if it is fresh and the
 * buster matches. Returns true when a snapshot was applied. Safe to call when no
 * snapshot exists (returns false). MUST run before first paint to be useful.
 */
export async function restoreQueryClient(
  client: QueryClient,
  options: QueryPersistOptions = {},
): Promise<boolean> {
  const key = options.key ?? DEFAULTS.key;
  const maxAgeMs = options.maxAgeMs ?? DEFAULTS.maxAgeMs;
  const buster = options.buster ?? DEFAULTS.buster;

  let blob: QueryCacheBlob | undefined;
  try {
    blob = await queryCacheDb.snapshots.get(key);
  } catch {
    return false;
  }
  if (!blob) return false;

  // Invalidate stale or mismatched snapshots.
  if (blob.buster !== buster || Date.now() - blob.savedAt > maxAgeMs) {
    await queryCacheDb.snapshots.delete(key).catch(() => {});
    return false;
  }

  try {
    const state = blob.compressed
      ? ((await decompress(blob.bytes)) as DehydratedState)
      : (JSON.parse(new TextDecoder().decode(blob.bytes)) as DehydratedState);
    hydrate(client, state);
    return true;
  } catch {
    // Corrupt snapshot — drop it so we never wedge cold start.
    await queryCacheDb.snapshots.delete(key).catch(() => {});
    return false;
  }
}

// ─── Persist (write-on-change, debounced) ─────────────────────────────────────

async function writeSnapshot(
  client: QueryClient,
  opts: Required<Omit<QueryPersistOptions, "shouldDehydrateQuery">> &
    Pick<QueryPersistOptions, "shouldDehydrateQuery">,
): Promise<void> {
  const state = dehydrate(client, {
    shouldDehydrateQuery: opts.shouldDehydrateQuery ?? defaultShouldDehydrateQuery,
  });

  let bytes: ArrayBuffer;
  let compressed = false;
  if (opts.compress) {
    bytes = await compress(state);
    compressed = true;
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(state)).buffer as ArrayBuffer;
  }

  await queryCacheDb.snapshots.put({
    key: opts.key,
    savedAt: Date.now(),
    buster: opts.buster,
    bytes,
    compressed,
  });
}

/**
 * Subscribe to the query cache and persist a debounced snapshot on change.
 * Returns an unsubscribe that flushes a final snapshot. Start this AFTER
 * `restoreQueryClient` so an empty initial cache never clobbers a good snapshot.
 */
export function persistQueryClient(
  client: QueryClient,
  options: QueryPersistOptions = {},
): () => void {
  const opts = {
    key: options.key ?? DEFAULTS.key,
    maxAgeMs: options.maxAgeMs ?? DEFAULTS.maxAgeMs,
    buster: options.buster ?? DEFAULTS.buster,
    throttleMs: options.throttleMs ?? DEFAULTS.throttleMs,
    compress: options.compress ?? DEFAULTS.compress,
    shouldDehydrateQuery: options.shouldDehydrateQuery,
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = () => {
    if (timer || stopped) return;
    timer = setTimeout(() => {
      timer = null;
      void writeSnapshot(client, opts).catch(() => {
        // best-effort; a failed snapshot just means a slower next cold start
      });
    }, opts.throttleMs);
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    // Only persist on settled data changes, not every observer add/remove.
    if (event.type === "updated" || event.type === "added" || event.type === "removed") {
      schedule();
    }
  });

  return () => {
    stopped = true;
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // Flush a final snapshot on teardown (fire-and-forget).
    void writeSnapshot(client, opts).catch(() => {});
  };
}

/** Drop the persisted snapshot(s) — wire to the Settings cache-clear control. */
export async function clearQueryCacheSnapshot(key?: string): Promise<void> {
  if (key) {
    await queryCacheDb.snapshots.delete(key);
  } else {
    await queryCacheDb.snapshots.clear();
  }
}

/** Size of the persisted query snapshot(s) in bytes (Settings storage panel). */
export async function queryCacheSnapshotSize(): Promise<number> {
  const rows = await queryCacheDb.snapshots.toArray();
  return rows.reduce((sum, r) => sum + r.bytes.byteLength, 0);
}
