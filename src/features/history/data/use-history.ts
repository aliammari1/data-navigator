"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Fuse from "fuse.js";

import { useActivityStore } from "@/core/stores/activity-store";
import { useDataStore } from "@/core/stores/data-store";

import { dayKey, dayLabel, toTimestamp } from "../model/format";
import type { HistoryDayGroup, HistoryRow, HistorySource, IndexedHistoryRow } from "../model/types";
import { buildRows } from "./normalize";

export type SourceFilter = "all" | HistorySource;

export interface HistoryCounts {
  datasets: number;
  transforms: number;
  queries: number;
  activities: number;
}

export interface UseHistoryResult {
  /** Raw search text (drives the controlled input). */
  qRaw: string;
  setQRaw: (value: string) => void;
  source: SourceFilter;
  setSource: (value: SourceFilter) => void;

  /** Total normalized rows across all sources (pre-filter). */
  total: number;
  /** Per-source counts for the KPI cards. */
  counts: HistoryCounts;

  /** Filtered rows (source + deferred fuzzy text), newest first. */
  rows: IndexedHistoryRow[];
  /** Filtered rows grouped by local day, newest day first. */
  groups: HistoryDayGroup[];
}

function indexRow(row: HistoryRow): IndexedHistoryRow {
  const ts = toTimestamp(row.when);
  const safeTs = Number.isFinite(ts) ? ts : 0;
  return {
    ...row,
    _ts: safeTs,
    _day: dayKey(safeTs),
    _hay: `${row.message} ${row.type} ${row.table ?? ""} ${row.dataset ?? ""}`.toLowerCase(),
  };
}

/**
 * Aggregated, indexed, searchable history timeline.
 *
 * The four backing Zustand stores remain the app-wide write API. This hook only
 * owns the read path: it normalizes each store into a common row shape with
 * precomputed timestamp / day key / search haystack ONCE per store change, then
 * applies the (deferred) source + fuzzy-text filter and groups by day.
 *
 * Heavy date parsing and string lowercasing happen in the build memo, not on
 * every keystroke; the keystroke path only re-runs the (bounded) filter.
 */
export function useHistory(): UseHistoryResult {
  const [qRaw, setQRaw] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");

  const datasets = useDataStore((s) => s.datasets);
  const transforms = useDataStore((s) => s.transforms);
  const queryHistory = useDataStore((s) => s.queryHistory);
  const events = useActivityStore((s) => s.events);

  // Deferred query: keeps the input + scroll responsive while the filtered list
  // catches up. Zero-dependency alternative to a manual debounce timer.
  const q = useDeferredValue(qRaw);

  const counts = useMemo<HistoryCounts>(
    () => ({
      datasets: datasets.length,
      transforms: transforms.length,
      queries: queryHistory.length,
      activities: events.length,
    }),
    [datasets.length, transforms.length, queryHistory.length, events.length],
  );

  // Build + sort the unified, indexed list ONCE per store change. Row shaping
  // is shared with the durable Dexie mirror via `buildRows` so ids/messages/
  // sources never drift between the live read path and the persisted log.
  const indexed = useMemo<IndexedHistoryRow[]>(() => {
    const all = buildRows({ datasets, transforms, queryHistory, events }).map(indexRow);
    all.sort((a, b) => b._ts - a._ts);
    return all;
  }, [datasets, events, queryHistory, transforms]);

  // Source filter first (cheap, narrows the fuzzy haystack).
  const sourceFiltered = useMemo<IndexedHistoryRow[]>(
    () => (source === "all" ? indexed : indexed.filter((r) => r.source === source)),
    [indexed, source],
  );

  // Fuse instance rebuilt only when the source-filtered set changes. Searching
  // the precomputed `_hay` keeps tokenization cheap and ranking relevant.
  const fuse = useMemo(
    () =>
      new Fuse(sourceFiltered, {
        keys: ["_hay"],
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [sourceFiltered],
  );

  const rows = useMemo<IndexedHistoryRow[]>(() => {
    const term = q.trim();
    if (term.length === 0) return sourceFiltered;
    // Fuse preserves relevance order; rows are already newest-first within the
    // haystack, so ties keep recency.
    return fuse.search(term).map((res) => res.item);
  }, [fuse, q, sourceFiltered]);

  const groups = useMemo<HistoryDayGroup[]>(() => {
    const map = new Map<string, IndexedHistoryRow[]>();
    for (const row of rows) {
      const list = map.get(row._day);
      if (list) list.push(row);
      else map.set(row._day, [row]);
    }
    const out: HistoryDayGroup[] = [];
    for (const [key, groupRows] of map) {
      out.push({
        key,
        // Format the human label ONCE per group, not per row.
        label: dayLabel(groupRows[0]?._ts ?? Number.NaN),
        rows: groupRows,
      });
    }
    return out;
  }, [rows]);

  return {
    qRaw,
    setQRaw,
    source,
    setSource,
    total: indexed.length,
    counts,
    rows,
    groups,
  };
}
