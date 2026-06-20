"use client";

/**
 * Lazy, per-selected-column detail.
 *
 * The old screen computed top-values, histograms and string-length stats for
 * **every** column up front (2–4 extra scans per column). Those views are only
 * ever shown for one selected column at a time, so this hook fetches them
 * lazily, only when a column is selected, and caches the parsed result in a
 * small session LRU so re-selecting a column is instant.
 *
 * Cancellation: each request captures the active cache key; if the selection
 * (or dataset) changes before the query resolves, the stale result is dropped
 * instead of being applied.
 */

import { useEffect, useRef, useState } from "react";
import { type RegisteredDataset, runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import type { DetailQueryResult } from "../model/summary-map";
import { isNumericType } from "../model/summary-map";
import type { ColProfile, ColumnDetail } from "../model/types";
import type { ProfileWorkerClient } from "../worker/useProfileWorker";

const SAMPLE_SIZE = 2000;
const HISTOGRAM_BINS = 20;
const MAX_MEMO_ENTRIES = 64;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

interface RawDetail {
  topRows: Array<{ val: unknown; cnt: unknown }>;
  histogramRows: Array<{ lo: unknown; hi: unknown; cnt: unknown }>;
  lengthStats?: { min_len: unknown; max_len: unknown; avg_len: unknown };
  sampleRows: Array<{ sample_value: unknown }>;
}

/**
 * Fetch the raw detail rows for a single column with the minimum number of
 * scans: top values, a histogram (numeric), length stats (string), and a
 * bounded reservoir sample used for the local validity score.
 */
async function fetchColumnDetail(view: string, profile: ColProfile): Promise<DetailQueryResult> {
  const quotedView = quoteIdentifier(view);
  const quotedCol = quoteIdentifier(profile.name);
  const numeric = isNumericType(profile.type);

  const topRows = (await runReadOnlyQuery(`
    SELECT CAST(${quotedCol} AS VARCHAR) AS val, COUNT(*) AS cnt
    FROM ${quotedView}
    WHERE ${quotedCol} IS NOT NULL
    GROUP BY val
    ORDER BY cnt DESC
    LIMIT 10
  `)) as RawDetail["topRows"];

  let histogramRows: RawDetail["histogramRows"] = [];
  if (
    numeric &&
    profile.min !== undefined &&
    profile.max !== undefined &&
    profile.max > profile.min
  ) {
    const min = profile.min;
    const binWidth = (profile.max - min) / HISTOGRAM_BINS;
    // Equi-width histogram in a single FLOOR-bucketed scan. Deterministic and
    // version-stable (no reliance on histogram()/MAP unnesting semantics).
    const bucketRows = (await runReadOnlyQuery(`
      SELECT
        LEAST(
          FLOOR((${quotedCol} - ${min}) / ${binWidth}),
          ${HISTOGRAM_BINS - 1}
        ) AS bin,
        COUNT(*) AS cnt
      FROM ${quotedView}
      WHERE ${quotedCol} IS NOT NULL
      GROUP BY bin
      ORDER BY bin
    `)) as Array<{ bin: unknown; cnt: unknown }>;

    const counts = new Array<number>(HISTOGRAM_BINS).fill(0);
    for (const row of bucketRows) {
      const index = Math.min(Math.max(0, Number(row.bin ?? 0)), HISTOGRAM_BINS - 1);
      counts[index] = Number(row.cnt ?? 0);
    }
    histogramRows = counts.map((count, index) => ({
      lo: min + index * binWidth,
      hi: min + (index + 1) * binWidth,
      cnt: count,
    }));
  }

  let lengthStats: RawDetail["lengthStats"];
  if (profile.type === "string") {
    const lengthRows = (await runReadOnlyQuery(`
      SELECT
        MIN(LENGTH(${quotedCol})) AS min_len,
        MAX(LENGTH(${quotedCol})) AS max_len,
        AVG(LENGTH(${quotedCol})) AS avg_len
      FROM ${quotedView}
      WHERE ${quotedCol} IS NOT NULL
    `)) as Array<RawDetail["lengthStats"]>;
    lengthStats = lengthRows[0];
  }

  // Bounded reservoir sample backing the real (locally computed) validity score.
  const sampleRows = (await runReadOnlyQuery(`
    SELECT CAST(${quotedCol} AS VARCHAR) AS sample_value
    FROM ${quotedView}
    WHERE ${quotedCol} IS NOT NULL
    USING SAMPLE reservoir(${SAMPLE_SIZE} ROWS)
  `)) as RawDetail["sampleRows"];

  const validitySample = sampleRows
    .map((row) =>
      row.sample_value === null || row.sample_value === undefined ? "" : String(row.sample_value),
    )
    .filter((value) => value.length > 0);

  return {
    column: profile.name,
    type: profile.type,
    rowCount: profile.rowCount,
    topRows,
    histogramRows,
    lengthStats,
    validitySample,
  };
}

export interface ColumnDetailState {
  detail: ColumnDetail | null;
  loading: boolean;
}

export function useColumnDetail(
  dataset: RegisteredDataset | null,
  profile: ColProfile | null,
  worker: ProfileWorkerClient,
): ColumnDetailState {
  const [detail, setDetail] = useState<ColumnDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const memoRef = useRef<Map<string, ColumnDetail>>(new Map());

  const view = dataset?.viewName ?? null;
  const datasetId = dataset?.id ?? null;
  const updatedAt = dataset?.updatedAt ?? "";
  const columnName = profile?.name ?? null;

  // `profile` identity is stable per selection; key on the primitives below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: profile read inside, keyed by columnName.
  useEffect(() => {
    if (!dataset || !view || !profile || !columnName) {
      setDetail(null);
      setLoading(false);
      return;
    }

    const cacheKey = `${datasetId}:${updatedAt}:${columnName}`;
    const cached = memoRef.current.get(cacheKey);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDetail(null);

    (async () => {
      try {
        const raw = await fetchColumnDetail(view, profile);
        if (cancelled) return;
        const parsed = await worker.parseDetail(raw);
        if (cancelled) return;

        // Bounded LRU: evict the oldest entry once the cap is reached.
        const memo = memoRef.current;
        if (memo.size >= MAX_MEMO_ENTRIES) {
          const oldest = memo.keys().next().value;
          if (oldest !== undefined) memo.delete(oldest);
        }
        memo.set(cacheKey, parsed);

        setDetail(parsed);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setDetail(null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataset, view, datasetId, updatedAt, columnName, worker]);

  return { detail, loading };
}
