// ─── Durable, queryable history log (Dexie / IndexedDB) ──────────────────────
//
// Closes the persistence-architecture gap called out in history.md §3.1: the
// app-wide write API stays the four synchronous Zustand stores, but every event
// is *also* mirrored into this append-only, time-indexed IndexedDB table so the
// history becomes a real, durable, range-queryable, exportable audit log that
// survives growth (no silent 500/200/50 in-memory truncation) and a long-running
// offline desktop session.
//
// This is a dedicated DB (separate from the shared `data-navigator-app-v1`) so
// the feature owns its schema/migrations without touching platform storage.
// Fully offline — IndexedDB only, zero network.

import Dexie, { type Table } from "dexie";

import type { HistoryRow, HistorySource } from "../model/types";

/** One durable history event. `id` is deterministic per source row so the live
 *  mirror + one-time backfill are idempotent (put-by-id never duplicates). */
export interface HistoryEvent {
  /** Stable id — mirrors the source row id (e.g. `q_<id>`, `ds_<id>`). */
  id: string;
  /** Epoch ms — primary sort. */
  ts: number;
  /** Local `YYYY-MM-DD` day key — range/group index. */
  day: string;
  source: HistorySource;
  type: string;
  message: string;
  datasetId?: string;
  tableName?: string;
}

/** Backfill guard row (see `runOnceBackfill`). */
interface BackfillMeta {
  key: string;
  version: number;
  ranAt: number;
}

class HistoryDatabase extends Dexie {
  events!: Table<HistoryEvent, string>;
  _backfill!: Table<BackfillMeta, string>;

  constructor() {
    super("data-navigator-history-v1");
    // Compound + single indexes for the screen's exact access patterns:
    // sort by ts desc, filter by source, range by day, paginate via [source+ts].
    this.version(1).stores({
      events: "id, ts, day, source, datasetId, [source+ts], [day+source]",
      _backfill: "key",
    });
  }
}

/** Module singleton — never `new` inside a component. */
export const historyDB = new HistoryDatabase();

const dayKeyOf = (ts: number): string => {
  if (!Number.isFinite(ts)) return "unknown";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Project a normalized {@link HistoryRow} into a durable {@link HistoryEvent}. */
export function toHistoryEvent(row: HistoryRow): HistoryEvent {
  const ts = new Date(row.when).getTime();
  const safeTs = Number.isFinite(ts) ? ts : 0;
  return {
    id: row.id,
    ts: safeTs,
    day: dayKeyOf(safeTs),
    source: row.source,
    type: row.type,
    message: row.message,
    datasetId: row.dataset,
    tableName: row.table,
  };
}

/** Idempotent write-through: upsert-by-id so re-mirroring the same source row
 *  (re-render, backfill, reload) never duplicates an event. */
export async function appendHistory(rows: HistoryRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await historyDB.events.bulkPut(rows.map(toHistoryEvent));
  } catch {
    // IndexedDB unavailable / blocked (e.g. private mode) — the Zustand read
    // path still works; durability is best-effort and must never throw into UI.
  }
}

/**
 * Read the durable log newest-first, optionally narrowed by source. Bounded by
 * `limit` so the renderer never loads an unbounded log; deeper history is
 * reachable via the `before` keyset cursor.
 */
export async function pageHistory(opts: {
  source?: HistorySource;
  before?: number;
  limit?: number;
}): Promise<HistoryEvent[]> {
  const limit = opts.limit ?? 2000;
  try {
    if (opts.source) {
      const upper = opts.before ?? Dexie.maxKey;
      return await historyDB.events
        .where("[source+ts]")
        .between([opts.source, Dexie.minKey], [opts.source, upper])
        .reverse()
        .limit(limit)
        .toArray();
    }
    let coll = historyDB.events.orderBy("ts");
    if (opts.before != null) {
      coll = historyDB.events.where("ts").below(opts.before);
    }
    return await coll.reverse().limit(limit).toArray();
  } catch {
    return [];
  }
}

/** Whole durable log newest-first (export source of truth). */
export async function readAllHistory(): Promise<HistoryEvent[]> {
  try {
    return await historyDB.events.orderBy("ts").reverse().toArray();
  } catch {
    return [];
  }
}

/** Durable count of persisted events. */
export async function countHistory(): Promise<number> {
  try {
    return await historyDB.events.count();
  } catch {
    return 0;
  }
}

/**
 * Durable retention/compaction — keep the newest `maxRows`, prune the oldest.
 * Run on boot/idle so the offline log can't grow without bound. Replaces the
 * arbitrary in-memory 500/200/50 caps with an explicit, persisted policy.
 */
export async function pruneHistory(maxRows = 50_000): Promise<number> {
  try {
    const total = await historyDB.events.count();
    if (total <= maxRows) return 0;
    const excess = total - maxRows;
    const oldest = await historyDB.events.orderBy("ts").limit(excess).primaryKeys();
    await historyDB.events.bulkDelete(oldest);
    return oldest.length;
  } catch {
    return 0;
  }
}
