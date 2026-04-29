"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  cacheTelecomSourceFile,
  getCachedAnalyticsForKey,
  getCachedTelecomSourceFile,
  getCachedTelecomSourceFiles,
  getTelecomFileKey,
  setCachedAnalyticsForKey,
} from "@/features/telecom/lib/analytics-cache";
import { loadDelimitedCSVFromFile, loadDelimitedCSVToDuckDB } from "@/lib/duckdb";
import { exportTableToOPFS } from "@/lib/duckdb-opfs";
import { isExcelFile, xlsxToPipeCSV } from "@/lib/xlsx-to-csv";
import { requestPersistence } from "@/lib/storage-info";
import { broadcast } from "@/features/telecom/lib/channel";
import { telecomTableName } from "@/features/telecom/lib/names";
import type * as Types from "@/features/telecom/types";

export interface LoadedFile {
  id: number;
  name: string;
  table: string;
  date: string;
  cacheKey: string;
}

export interface UseTelecomFileLoadParams {
  /** Called whenever the active DuckDB table name changes */
  onTableNameChange: (tableName: string) => void;
  /** detectAvailableColumns bound to the current TABLE_NAME */
  detectAvailableColumns: () => Promise<string[]>;
  /** Setters wired to analytics state so cache hits populate data immediately */
  setKpi: (v: Types.KPISummary) => void;
  setCanals: (v: Types.CanalSummary[]) => void;
  setHourly: (v: Types.HourlyRow[]) => void;
  setStatusData: (v: Types.StatusRow[]) => void;
  setErrors: (v: Types.ErrorRow[]) => void;
  setOperators: (v: Types.OperatorRow[]) => void;
  setRegions: (v: Types.RegionRow[]) => void;
  setComputing: (v: boolean) => void;
}

export interface UseTelecomFileLoadReturn {
  loaded: boolean;
  loadError: string;
  loadPhase: "idle" | "csv" | "analytics" | "done";
  fileName: string;
  reportDate: string;
  csvCols: string[];
  activeTableName: string;
  loadedFiles: LoadedFile[];
  activeFileIdx: number;
  setActiveFileIdx: (idx: number) => void;
  cachedBadge: boolean;
  /** Ref so analytics callbacks can read the current file name without stale closure */
  fileNameRef: React.MutableRefObject<string>;
  activeCacheKeyRef: React.MutableRefObject<string | null>;
  firstLoad: React.MutableRefObject<boolean>;
  storeHydrated: boolean;
  setStoreHydrated: (v: boolean) => void;
  /** Sync fileName from store after hydration */
  setFileName: (v: string) => void;
  setReportDate: (v: string) => void;
  handleFileLoad: (file: File) => Promise<void>;
  /** Analytics state needed for the IDB cache write effect */
  kpiForCache: Types.KPISummary | null;
  canalsForCache: Types.CanalSummary[];
  hourlyForCache: Types.HourlyRow[];
  statusDataForCache: Types.StatusRow[];
  errorsForCache: Types.ErrorRow[];
  operatorsForCache: Types.OperatorRow[];
  regionsForCache: Types.RegionRow[];
  rawStatusesForCache: Types.RawStatusRow[];
}

/**
 * useTelecomFileLoad
 *
 * Manages file ingestion into DuckDB, the multi-file list, cache restoration,
 * and the IDB analytics cache write-back.
 *
 * The hook does NOT own the analytics results (kpi, canals, …) that come from
 * runAnalytics — those live in useTelecomAnalytics.  Instead, the hook exposes
 * setters (setKpi, setCanals, …) that must be wired back from the analytics hook
 * so that cache hits can populate the UI immediately.
 *
 * TABLE_NAME is a module-level mutable in page.tsx.  The hook calls
 * `onTableNameChange` whenever the active table changes so page.tsx can keep
 * its own variable up to date.
 */
export function useTelecomFileLoad({
  onTableNameChange,
  detectAvailableColumns,
  setKpi,
  setCanals,
  setHourly,
  setStatusData,
  setErrors,
  setOperators,
  setRegions,
  setComputing,
}: UseTelecomFileLoadParams): UseTelecomFileLoadReturn {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadPhase, setLoadPhase] = useState<"idle" | "csv" | "analytics" | "done">("idle");

  const [fileName, setFileName] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [csvCols, setCsvCols] = useState<string[]>([]);

  const [activeTableName, setActiveTableName] = useState("");
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [activeFileIdx, setActiveFileIdx] = useState<number>(0);

  const [cachedBadge, setCachedBadge] = useState(false);

  // Store-hydration gating — mirrors the same flag in useTelecomStoreSync
  const [storeHydrated, setStoreHydrated] = useState(false);

  // Mirror analytics state that flows back from useTelecomAnalytics for the
  // IDB cache write-back effect below.
  const [kpiForCache, setKpiForCache] = useState<Types.KPISummary | null>(null);
  const [canalsForCache, setCanalsForCache] = useState<Types.CanalSummary[]>([]);
  const [hourlyForCache, setHourlyForCache] = useState<Types.HourlyRow[]>([]);
  const [statusDataForCache, setStatusDataForCache] = useState<Types.StatusRow[]>([]);
  const [errorsForCache, setErrorsForCache] = useState<Types.ErrorRow[]>([]);
  const [operatorsForCache, setOperatorsForCache] = useState<Types.OperatorRow[]>([]);
  const [regionsForCache, setRegionsForCache] = useState<Types.RegionRow[]>([]);
  const [rawStatusesForCache, setRawStatusesForCache] = useState<Types.RawStatusRow[]>([]);

  const fileCounterRef = useRef(0);
  const activeCacheKeyRef = useRef<string | null>(null);
  const restoredFromCacheRef = useRef(false);
  const fileNameRef = useRef("");
  const firstLoad = useRef(true);

  // Keep fileNameRef in sync with the fileName state
  useEffect(() => {
    fileNameRef.current = fileName;
  }, [fileName]);

  // ── handleFileLoad ──────────────────────────────────────────────────────────
  const handleFileLoad = useCallback(
    async (file: File) => {
      setLoadError("");
      setComputing(true);
      setLoadPhase("csv");
      firstLoad.current = true;

      const fileIdx = fileCounterRef.current++;
      const newTable = telecomTableName(fileIdx);
      const cacheKey = getTelecomFileKey(file);
      activeCacheKeyRef.current = cacheKey;

      // F3 — Check IndexedDB cache first so the UI populates instantly
      try {
        const cached = await getCachedAnalyticsForKey(cacheKey);
        if (cached) {
          setKpi(cached.kpi as Types.KPISummary);
          setKpiForCache(cached.kpi as Types.KPISummary);
          setCanals(cached.canals as Types.CanalSummary[]);
          setCanalsForCache(cached.canals as Types.CanalSummary[]);
          setHourly(cached.hourly as Types.HourlyRow[]);
          setHourlyForCache(cached.hourly as Types.HourlyRow[]);
          setStatusData(cached.statusData as Types.StatusRow[]);
          setStatusDataForCache(cached.statusData as Types.StatusRow[]);
          setErrors(cached.errors as Types.ErrorRow[]);
          setErrorsForCache(cached.errors as Types.ErrorRow[]);
          setOperators(cached.operators as Types.OperatorRow[]);
          setOperatorsForCache(cached.operators as Types.OperatorRow[]);
          setRegions(cached.regions as Types.RegionRow[]);
          setRegionsForCache(cached.regions as Types.RegionRow[]);
          setCachedBadge(true);
        }
      } catch {
        // Cache miss or error — proceed normally
      }

      cacheTelecomSourceFile(file).catch(() => {});

      try {
        if (isExcelFile(file)) {
          const csvText = await xlsxToPipeCSV(file);
          await loadDelimitedCSVToDuckDB(newTable, csvText, "|", false);
        } else {
          await loadDelimitedCSVFromFile(newTable, file, "|", false);
        }

        const match = file.name.match(/(\d{8})/);
        const d = match?.[1];
        const dateStr = d
          ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
          : new Date().toISOString().slice(0, 10);

        const newEntry: LoadedFile = {
          id: fileIdx,
          name: file.name,
          table: newTable,
          date: dateStr,
          cacheKey,
        };

        setLoadedFiles((prev) => {
          const existing = prev.findIndex((f) => f.name === file.name);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = newEntry;
            return updated;
          }
          return [...prev, newEntry];
        });

        // Notify page.tsx to update its module-level TABLE_NAME
        onTableNameChange(newTable);
        setActiveTableName(newTable);
        setActiveFileIdx(fileIdx);

        const cols = await detectAvailableColumns();
        setCsvCols([...new Set(cols)]);

        setReportDate(dateStr);
        setFileName(file.name);
        fileNameRef.current = file.name;
        setLoaded(true);
        setComputing(false);

        broadcast({ type: "FILE_LOADED", fileName: file.name, reportDate: dateStr });

        requestPersistence().catch(() => {});
        exportTableToOPFS(newTable).catch(() => {});
      } catch (e) {
        setLoadError(`Failed to load: ${String(e)}`);
        setComputing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onTableNameChange, detectAvailableColumns, setKpi, setCanals, setHourly, setStatusData, setErrors, setOperators, setRegions, setComputing],
  );

  // F3 — Restore the most recent telecom source file from IndexedDB on reload
  useEffect(() => {
    if (!storeHydrated || loaded || restoredFromCacheRef.current) return;
    restoredFromCacheRef.current = true;
    let cancelled = false;

    (async () => {
      const [latest] = await getCachedTelecomSourceFiles();
      if (!latest || cancelled) return;

      const file = await getCachedTelecomSourceFile(latest.key);
      if (!file || cancelled) return;

      activeCacheKeyRef.current = latest.key;
      toast("Session restaurée", {
        description: `Chargement local de ${latest.fileName}`,
      });
      await handleFileLoad(file);
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [storeHydrated, loaded, handleFileLoad]);

  // Multi-file: when user switches active file via dropdown, update active table
  useEffect(() => {
    const f = loadedFiles.find((x) => x.id === activeFileIdx);
    if (!f) return;
    activeCacheKeyRef.current = f.cacheKey;
    setActiveTableName(f.table);
    setFileName(f.name);
    setReportDate(f.date);
    onTableNameChange(f.table);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileIdx, loadedFiles]);

  return {
    loaded,
    loadError,
    loadPhase,
    fileName,
    reportDate,
    csvCols,
    activeTableName,
    loadedFiles,
    activeFileIdx,
    setActiveFileIdx,
    cachedBadge,
    fileNameRef,
    activeCacheKeyRef,
    firstLoad,
    storeHydrated,
    setStoreHydrated,
    setFileName,
    setReportDate,
    handleFileLoad,
    kpiForCache,
    canalsForCache,
    hourlyForCache,
    statusDataForCache,
    errorsForCache,
    operatorsForCache,
    regionsForCache,
    rawStatusesForCache,
  };
}
