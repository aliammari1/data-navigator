"use client";

/**
 * use-geo-data
 *
 * Wires the geo-analysis screen to the real active dataset through DuckDB.
 *
 * Responsibilities:
 *  - resolve the active dataset's view name (from the data store) and the
 *    telecom column mapping (from the telecom store);
 *  - run region rollups, the channel/region matrix and channel/region flows in
 *    SQL (pushdown, off the main thread) via the cached `useDuckDBQuery` hook;
 *  - geocode region labels to centroids with the offline gazetteer so they can
 *    be plotted, while keeping un-geocodable regions in the tabular views;
 *  - derive ranks, dominant channels and spread once (memoized) for the UI.
 *
 * When no dataset with a usable region column is active, `ready` is false and
 * the screen renders an explicit empty state instead of fake numbers.
 */

import { useMemo } from "react";
import { useDuckDBQuery } from "@/core/queries/duckdb";
import { useDataStore } from "@/core/stores/data-store";
import { safeNum } from "@/features/telecom/lib/format";
import {
  type ColumnMapping,
  normalizeColumnMapping,
  type StatusMapping,
  useTelecomStore,
} from "@/features/telecom/store";
import { geocodeRegion } from "../lib/gazetteer";
import {
  type ChannelFlowRow,
  type ChannelRegionRow,
  channelFlowSql,
  channelRegionMatrixSql,
  type RegionRollupRow,
  regionRollupSql,
} from "../lib/geo-sql";

const STALE_TIME = 60_000;
const REGION_LIMIT = 200;
const MATRIX_REGION_LIMIT = 12;

export interface GeoRegion {
  name: string;
  transactions: number;
  revenue: number;
  successRate: number;
  /** 1-based rank by transaction volume. */
  rank: number;
  /** Centroid when the region was geocoded against the gazetteer. */
  lat: number | null;
  lon: number | null;
}

export interface ChannelMatrix {
  /** Region row labels (busiest first). */
  regions: string[];
  /** Channel column labels (globally busiest first). */
  channels: string[];
  /** matrix[regionIndex][channelIndex] = share of that region's volume (%). */
  shares: number[][];
  /** Raw transaction counts, same indexing as {@link shares}. */
  counts: number[][];
}

export interface GeoFlow {
  channel: string;
  region: string;
  transactions: number;
  successRate: number;
  /** Region centroid, present only when geocoded. */
  to: [number, number] | null;
}

export interface UseGeoDataResult {
  ready: boolean;
  loading: boolean;
  error: string | null;
  datasetName: string | null;
  regions: GeoRegion[];
  /** Subset of {@link regions} that resolved to a centroid. */
  mappedRegions: GeoRegion[];
  totalTransactions: number;
  totalRevenue: number;
  avgSuccessRate: number;
  matrix: ChannelMatrix;
  flows: GeoFlow[];
  dominantChannels: Array<{ region: string; channel: string; pct: number; channelIndex: number }>;
  channelSpread: Array<{ channel: string; regionCount: number }>;
}

function useActiveView(): { view: string | null; name: string | null } {
  const datasets = useDataStore((s) => s.datasets);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  return useMemo(() => {
    const dataset = datasets.find((d) => d.id === activeDatasetId) ?? datasets[0];
    return {
      view: dataset?.viewName || dataset?.tableName || null,
      name: dataset?.name ?? null,
    };
  }, [datasets, activeDatasetId]);
}

function useMapping(): { mapping: ColumnMapping; statusMapping: StatusMapping[] } {
  const rawMapping = useTelecomStore((s) => s.columnMapping);
  const statusMapping = useTelecomStore((s) => s.statusMapping);
  const mapping = useMemo(() => normalizeColumnMapping(rawMapping), [rawMapping]);
  return { mapping, statusMapping };
}

const EMPTY_MATRIX: ChannelMatrix = { regions: [], channels: [], shares: [], counts: [] };

export function useGeoData(): UseGeoDataResult {
  const { view, name } = useActiveView();
  const { mapping, statusMapping } = useMapping();
  const enabled = Boolean(view);

  const rollupSql = useMemo(
    () => (view ? regionRollupSql(view, mapping, statusMapping, REGION_LIMIT) : ""),
    [view, mapping, statusMapping],
  );
  const matrixSql = useMemo(
    () => (view ? channelRegionMatrixSql(view, mapping, MATRIX_REGION_LIMIT) : ""),
    [view, mapping],
  );
  const flowSql = useMemo(
    () => (view ? channelFlowSql(view, mapping, statusMapping) : ""),
    [view, mapping, statusMapping],
  );

  const rollupQuery = useDuckDBQuery(rollupSql, [view], { enabled, staleTime: STALE_TIME });
  const matrixQuery = useDuckDBQuery(matrixSql, [view], { enabled, staleTime: STALE_TIME });
  const flowQuery = useDuckDBQuery(flowSql, [view], { enabled, staleTime: STALE_TIME });

  const regions = useMemo<GeoRegion[]>(() => {
    const rows = (rollupQuery.data ?? []) as unknown as RegionRollupRow[];
    return rows.map((row, index) => {
      const transactions = safeNum(row.transactions);
      const success = safeNum(row.success);
      const hit = geocodeRegion(String(row.region ?? ""));
      return {
        name: String(row.region ?? "Inconnu"),
        transactions,
        revenue: safeNum(row.revenue),
        successRate: transactions > 0 ? (success / transactions) * 100 : 0,
        rank: index + 1,
        lat: hit?.lat ?? null,
        lon: hit?.lon ?? null,
      };
    });
  }, [rollupQuery.data]);

  const mappedRegions = useMemo(
    () => regions.filter((r) => r.lat !== null && r.lon !== null),
    [regions],
  );

  const totals = useMemo(() => {
    let tx = 0;
    let revenue = 0;
    let weightedSuccess = 0;
    for (const region of regions) {
      tx += region.transactions;
      revenue += region.revenue;
      weightedSuccess += (region.successRate / 100) * region.transactions;
    }
    return {
      totalTransactions: tx,
      totalRevenue: revenue,
      avgSuccessRate: tx > 0 ? (weightedSuccess / tx) * 100 : 0,
    };
  }, [regions]);

  const matrix = useMemo<ChannelMatrix>(() => {
    const rows = (matrixQuery.data ?? []) as unknown as ChannelRegionRow[];
    if (rows.length === 0) return EMPTY_MATRIX;

    // Preserve region order by total volume; rank channels by global volume.
    const regionTotals = new Map<string, number>();
    const channelTotals = new Map<string, number>();
    const cells = new Map<string, number>();

    for (const row of rows) {
      const region = String(row.region ?? "Inconnu");
      const channel = String(row.channel ?? "Other");
      const n = safeNum(row.transactions);
      regionTotals.set(region, (regionTotals.get(region) ?? 0) + n);
      channelTotals.set(channel, (channelTotals.get(channel) ?? 0) + n);
      cells.set(`${region}\u0000${channel}`, n);
    }

    const regionLabels = [...regionTotals.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
    const channelLabels = [...channelTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

    const counts = regionLabels.map((region) =>
      channelLabels.map((channel) => cells.get(`${region}\u0000${channel}`) ?? 0),
    );
    const shares = counts.map((row) => {
      const total = row.reduce((a, b) => a + b, 0);
      return total > 0 ? row.map((v) => (v / total) * 100) : row.map(() => 0);
    });

    return { regions: regionLabels, channels: channelLabels, shares, counts };
  }, [matrixQuery.data]);

  const dominantChannels = useMemo(() => {
    return matrix.regions.map((region, ri) => {
      const row = matrix.shares[ri] ?? [];
      let maxIdx = 0;
      let maxVal = -1;
      for (let ci = 0; ci < row.length; ci++) {
        if (row[ci] > maxVal) {
          maxVal = row[ci];
          maxIdx = ci;
        }
      }
      return {
        region,
        channel: matrix.channels[maxIdx] ?? "—",
        pct: maxVal < 0 ? 0 : maxVal,
        channelIndex: maxIdx,
      };
    });
  }, [matrix]);

  const channelSpread = useMemo(() => {
    return matrix.channels
      .map((channel, ci) => ({
        channel,
        regionCount: matrix.shares.reduce((acc, row) => acc + ((row[ci] ?? 0) > 15 ? 1 : 0), 0),
      }))
      .sort((a, b) => b.regionCount - a.regionCount);
  }, [matrix]);

  const flows = useMemo<GeoFlow[]>(() => {
    const rows = (flowQuery.data ?? []) as unknown as ChannelFlowRow[];
    return rows.map((row) => {
      const transactions = safeNum(row.transactions);
      const success = safeNum(row.success);
      const region = String(row.region ?? "Inconnu");
      const hit = geocodeRegion(region);
      return {
        channel: String(row.channel ?? "Other"),
        region,
        transactions,
        successRate: transactions > 0 ? (success / transactions) * 100 : 0,
        to: hit ? [hit.lon, hit.lat] : null,
      };
    });
  }, [flowQuery.data]);

  const loading =
    enabled && (rollupQuery.isLoading || matrixQuery.isLoading || flowQuery.isLoading);
  const error =
    (rollupQuery.error as Error | null)?.message ??
    (matrixQuery.error as Error | null)?.message ??
    (flowQuery.error as Error | null)?.message ??
    null;

  const ready = enabled && !loading && !error && regions.length > 0;

  return {
    ready,
    loading,
    error,
    datasetName: name,
    regions,
    mappedRegions,
    totalTransactions: totals.totalTransactions,
    totalRevenue: totals.totalRevenue,
    avgSuccessRate: totals.avgSuccessRate,
    matrix,
    flows,
    dominantChannels,
    channelSpread,
  };
}
