"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { isTelecomDataset } from "@/features/telecom/lib/dataset-detection";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

/**
 * Live telecom analytics for the desktop widgets layer.
 *
 * Desktop widgets render on the bare canvas, outside the
 * `TelecomReportRuntimeProvider`, so we self-wire `useTelecomAnalytics` exactly
 * like `MissionControl` does: pick the freshest telecom dataset, feed its view
 * name into the hook, and surface only the read-only result + a `ready` flag.
 *
 * Call this ONCE (in `WidgetsLayer`) and pass the result down to each widget so
 * the (relatively heavy) DuckDB analytics pipeline runs a single time for all
 * tiles instead of once per widget.
 */
export interface WidgetTelecomData {
  /** Whether a telecom dataset is loaded and its KPIs are available. */
  ready: boolean;
  /** Name of the active telecom report (for labels). Empty when none. */
  fileName: string;
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
}

export function useWidgetTelecomData(): WidgetTelecomData {
  const datasets = useDataStore((s) => s.datasets);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);

  const firstLoad = useRef(true);
  const fileNameRef = useRef("");
  const tableNameRef = useRef("");

  const [tableReady, setTableReady] = useState(false);
  const [statusMapping, setStatusMapping] = useState<Types.StatusMapping[]>([]);

  const telecomDatasets = useMemo(
    () =>
      datasets
        .filter(isTelecomDataset)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [datasets],
  );

  const activeTelecomDataset = useMemo(() => {
    const active = datasets.find((d) => d.id === activeDatasetId);
    if (active && isTelecomDataset(active)) return active;
    return telecomDatasets[0] ?? null;
  }, [datasets, activeDatasetId, telecomDatasets]);

  const getTableName = useCallback(() => tableNameRef.current, []);

  const analytics = useTelecomAnalytics({
    getTableName,
    mapping: DEFAULT_MAPPING,
    loaded: tableReady,
    statusMapping,
    firstLoad,
    fileNameRef,
    onStatusMappingAdditions: (additions) => {
      setStatusMapping((prev) => [...prev, ...additions]);
    },
  });

  useEffect(() => {
    if (!activeTelecomDataset) {
      setTableReady(false);
      tableNameRef.current = "";
      fileNameRef.current = "";
      return;
    }
    const viewName = activeTelecomDataset.viewName || activeTelecomDataset.tableName;
    if (!viewName) {
      setTableReady(false);
      tableNameRef.current = "";
      fileNameRef.current = activeTelecomDataset.name;
      return;
    }
    tableNameRef.current = viewName;
    fileNameRef.current = activeTelecomDataset.name;
    firstLoad.current = true;
    setTableReady(true);
  }, [activeTelecomDataset]);

  return {
    ready: tableReady && Boolean(analytics.kpi),
    fileName: activeTelecomDataset?.name ?? "",
    kpi: analytics.kpi,
    canals: analytics.canals,
    hourly: analytics.hourly,
  };
}
