// ─── History timeline types ──────────────────────────────────────────────────
//
// The history feature is a read-only aggregated timeline merged from four
// Zustand stores (datasets, transforms, query history, activity events). These
// types describe the normalized row shape the screen renders, plus a derived,
// indexed variant used for cheap per-keystroke filtering and grouping.

export type HistorySource = "activity" | "dataset" | "transform" | "query";

export interface HistoryRow {
  id: string;
  /** Original ISO timestamp from the source store. */
  when: string;
  type: string;
  message: string;
  dataset?: string;
  table?: string;
  source: HistorySource;
}

/**
 * A {@link HistoryRow} enriched with precomputed values so the hot filter/sort/
 * group path never re-parses dates or re-lowercases strings per keystroke.
 *
 * - `_ts`  numeric epoch ms (sortable, group-key friendly)
 * - `_day` sortable `YYYY-MM-DD` key derived once from `_ts`
 * - `_hay` lowercased searchable haystack over message/type/table/dataset
 */
export interface IndexedHistoryRow extends HistoryRow {
  _ts: number;
  _day: string;
  _hay: string;
}

/** A day group: a sortable key, its human label, and its rows. */
export interface HistoryDayGroup {
  /** Sortable `YYYY-MM-DD` key (or `"unknown"` for unparseable timestamps). */
  key: string;
  /** Human label, formatted once per group. */
  label: string;
  rows: IndexedHistoryRow[];
}

/**
 * Flattened item for virtualization: day groups are inlined as header items
 * followed by their row items so a single windowed list can render the whole
 * grouped timeline.
 */
export type FlatHistoryItem =
  | { kind: "header"; key: string; label: string; count: number }
  | { kind: "row"; row: IndexedHistoryRow };

export type HistoryExportFormat = "csv" | "json" | "xlsx";
