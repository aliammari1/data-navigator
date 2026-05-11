"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type CachedAnalytics,
  cacheTelecomSourceFile,
  getCachedAnalyticsEntries,
  getCachedAnalyticsForKey,
  getCachedTelecomSourceFile,
  getCachedTelecomSourceFiles,
  getTelecomFileKey,
} from "@/features/telecom/lib/analytics-cache";
import { broadcast } from "@/features/telecom/lib/channel";
import { telecomTableName } from "@/features/telecom/lib/names";
import { extractReportDateFromName } from "@/features/telecom/lib/telecom-dataset";
import type * as Types from "@/features/telecom/types";
import {
  loadDelimitedCSVFromFile,
  loadDelimitedCSVToDuckDB,
} from "@/platform/duckdb/duckdb";
import { isExcelFile, xlsxToPipeCSV } from "@/platform/parsers/xlsx-to-csv";
import { saveSessionState } from "@/platform/storage/app-db";
import { requestPersistence } from "@/platform/storage/storage-info";

export interface LoadedFile {
  id: number;
  name: string;
  table: string;
  date: string;
  cacheKey: string;
  size: number;
  lastModified: number;
  sourceKeys: string[];
}

export type TelecomIngestionMode = "replace" | "append" | "replace-active";

export interface UseTelecomFileLoadParams {
  /** Called whenever the active DuckDB table name changes */
  onTableNameChange: (tableName: string) => void;
  /** detectAvailableColumns for a specific table (or active table fallback) */
  detectAvailableColumns: (tableName?: string) => Promise<string[]>;
  /** Setters wired to analytics state so cache hits populate data immediately */
  setKpi: (v: Types.KPISummary) => void;
  setCanals: (v: Types.CanalSummary[]) => void;
  setHourly: (v: Types.HourlyRow[]) => void;
  setStatusData: (v: Types.StatusRow[]) => void;
  setOperators: (v: Types.OperatorRow[]) => void;
  setRegions: (v: Types.RegionRow[]) => void;
}

export interface UseTelecomFileLoadReturn {
  loaded: boolean;
  loadError: string;
  fileName: string;
  reportDate: string;
  csvCols: string[];
  activeTableName: string;
  loadedFiles: LoadedFile[];
  activeFileIdx: number;
  setActiveFileIdx: (idx: number) => void;
  renameLoadedFile: (id: number, name: string) => void;
  cachedBadge: boolean;
  /** Ref so analytics callbacks can read the current file name without stale closure */
  fileNameRef: React.RefObject<string>;
  activeCacheKeyRef: React.RefObject<string | null>;
  firstLoad: React.RefObject<boolean>;
  /** Sync fileName from store after hydration */
  setFileName: (v: string) => void;
  setReportDate: (v: string) => void;
  handleFileLoad: (file: File, mode?: TelecomIngestionMode) => Promise<void>;
  restoredFromFastCache: boolean;
  restoreRevision: number;
  /** Analytics state needed for the IDB cache write effect */
  kpiForCache: Types.KPISummary | null;
  canalsForCache: Types.CanalSummary[];
  hourlyForCache: Types.HourlyRow[];
  statusDataForCache: Types.StatusRow[];
  operatorsForCache: Types.OperatorRow[];
  regionsForCache: Types.RegionRow[];
  rawStatusesForCache: Types.RawStatusRow[];
}

async function loadTelecomFileToTable(
  file: File | Blob,
  tableName: string,
  append: boolean,
) {
  const sourceFile =
    file instanceof File ? file : new File([file], "telecom-source");

  if (isExcelFile(sourceFile)) {
    const csvText = await xlsxToPipeCSV(sourceFile);
    await loadDelimitedCSVToDuckDB(tableName, csvText, "|", append);
    return;
  }

  await loadDelimitedCSVFromFile(tableName, sourceFile, "|", append);
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
  setOperators,
  setRegions,
}: UseTelecomFileLoadParams): UseTelecomFileLoadReturn {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [fileName, setFileName] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [csvCols, setCsvCols] = useState<string[]>([]);

  const [activeTableName, setActiveTableName] = useState("");
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [activeFileIdx, setActiveFileIdx] = useState<number>(0);
  const renameLoadedFile = useCallback(
    (id: number, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setLoadedFiles((prev) =>
        prev.map((file) =>
          file.id === id ? { ...file, name: trimmed } : file,
        ),
      );
      if (id === activeFileIdx) setFileName(trimmed);
    },
    [activeFileIdx],
  );

  const [cachedBadge, setCachedBadge] = useState(false);
  const [restoredFromFastCache, setRestoredFromFastCache] = useState(false);
  const [restoreRevision, setRestoreRevision] = useState(0);

  // Mirror analytics state that flows back from useTelecomAnalytics for the
  // IDB cache write-back effect below.
  const [kpiForCache, setKpiForCache] = useState<Types.KPISummary | null>(null);
  const [canalsForCache, setCanalsForCache] = useState<Types.CanalSummary[]>(
    [],
  );
  const [hourlyForCache, setHourlyForCache] = useState<Types.HourlyRow[]>([]);
  const [statusDataForCache, setStatusDataForCache] = useState<
    Types.StatusRow[]
  >([]);
  const [operatorsForCache, setOperatorsForCache] = useState<
    Types.OperatorRow[]
  >([]);
  const [regionsForCache, setRegionsForCache] = useState<Types.RegionRow[]>([]);
  const [rawStatusesForCache] = useState<Types.RawStatusRow[]>([]);

  const fileCounterRef = useRef(0);
  const activeCacheKeyRef = useRef<string | null>(null);
  const restoredFromCacheRef = useRef(false);
  const fileNameRef = useRef("");
  const firstLoad = useRef(true);

  const applyCachedAnalytics = useCallback(
    (cached: CachedAnalytics) => {
      setKpi(cached.kpi as Types.KPISummary);
      setKpiForCache(cached.kpi as Types.KPISummary);
      setCanals(cached.canals as Types.CanalSummary[]);
      setCanalsForCache(cached.canals as Types.CanalSummary[]);
      setHourly(cached.hourly as Types.HourlyRow[]);
      setHourlyForCache(cached.hourly as Types.HourlyRow[]);
      setStatusData(cached.statusData as Types.StatusRow[]);
      setStatusDataForCache(cached.statusData as Types.StatusRow[]);
      setOperators(cached.operators as Types.OperatorRow[]);
      setOperatorsForCache(cached.operators as Types.OperatorRow[]);
      setRegions(cached.regions as Types.RegionRow[]);
      setRegionsForCache(cached.regions as Types.RegionRow[]);
    },
    [setKpi, setCanals, setHourly, setStatusData, setOperators, setRegions],
  );

  // Keep fileNameRef in sync with the fileName state
  useEffect(() => {
    fileNameRef.current = fileName;
  }, [fileName]);

  // ── handleFileLoad ──────────────────────────────────────────────────────────
  const handleFileLoad = useCallback(
    async (file: File, mode: TelecomIngestionMode = "replace") => {
      setLoadError("");
      firstLoad.current = true;

      const appendToCurrent = Boolean(
        mode === "append" && loaded && activeTableName,
      );
      const replaceActive = Boolean(
        mode === "replace-active" && loaded && activeTableName,
      );
      const fileIdx = appendToCurrent
        ? activeFileIdx
        : replaceActive
          ? activeFileIdx
          : fileCounterRef.current++;
      const newTable = appendToCurrent
        ? activeTableName
        : telecomTableName(fileIdx);
      const cacheKey = getTelecomFileKey(file);
      activeCacheKeyRef.current = appendToCurrent
        ? `${activeCacheKeyRef.current ?? activeTableName}+${cacheKey}`
        : cacheKey;

      // F3 — Check IndexedDB cache first so the UI populates instantly
      if (!appendToCurrent) {
        try {
          const cached = await getCachedAnalyticsForKey(cacheKey);
          if (cached) {
            applyCachedAnalytics(cached);
            setCachedBadge(true);
          }
        } catch {
          // Cache miss or error — proceed normally
        }
      }

      cacheTelecomSourceFile(file).catch(() => {});

      try {
        await loadTelecomFileToTable(file, newTable, appendToCurrent);

        const dateStr =
          extractReportDateFromName(file.name) ||
          new Date().toISOString().slice(0, 10);

        const newEntry: LoadedFile = {
          id: fileIdx,
          name: appendToCurrent
            ? `${loadedFiles.find((f) => f.id === activeFileIdx)?.name ?? "Période"} + ${file.name}`
            : file.name,
          table: newTable,
          date: appendToCurrent
            ? `${reportDate || dateStr} → ${dateStr}`
            : dateStr,
          cacheKey: activeCacheKeyRef.current ?? cacheKey,
          size:
            (appendToCurrent
              ? (loadedFiles.find((f) => f.id === activeFileIdx)?.size ?? 0)
              : 0) + file.size,
          lastModified: file.lastModified,
          sourceKeys: appendToCurrent
            ? [
                ...(loadedFiles.find((f) => f.id === activeFileIdx)
                  ?.sourceKeys ?? []),
                cacheKey,
              ]
            : [cacheKey],
        };

        setLoadedFiles((prev) => {
          if (appendToCurrent) {
            return prev.map((f) => (f.id === activeFileIdx ? newEntry : f));
          }
          if (replaceActive) {
            return prev.map((f) => (f.id === activeFileIdx ? newEntry : f));
          }
          const existing = prev.findIndex((f) => f.name === file.name);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = newEntry;
            return updated;
          }
          return mode === "replace" ? [newEntry] : [...prev, newEntry];
        });

        // Notify page.tsx to update its module-level TABLE_NAME
        onTableNameChange(newTable);
        setActiveTableName(newTable);
        setActiveFileIdx(fileIdx);

        const cols = await detectAvailableColumns(newTable);
        setCsvCols([...new Set(cols)]);

        setReportDate(newEntry.date);
        setFileName(newEntry.name);
        fileNameRef.current = newEntry.name;
        setLoaded(true);

        broadcast({
          type: "FILE_LOADED",
          fileName: newEntry.name,
          reportDate: newEntry.date,
        });

        requestPersistence().catch(() => {});
        saveSessionState({
          activeTableName: newTable,
          fileName: newEntry.name,
          reportDate: newEntry.date,
          fileKey: activeCacheKeyRef.current ?? cacheKey,
        }).catch(() => {});
      } catch (e) {
        setLoadError(`Failed to load: ${String(e)}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      onTableNameChange,
      detectAvailableColumns,
      loaded,
      activeFileIdx,
      activeTableName,
      loadedFiles,
      reportDate,
      applyCachedAnalytics,
    ],
  );

  // F3 — Restore the most recent telecom source file from IndexedDB on reload
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot boot restore guarded by restoredFromCacheRef; adding setter deps can recreate the restore callback during hydration
  useEffect(() => {
    if (loaded || restoredFromCacheRef.current) return;
    restoredFromCacheRef.current = true;
    let cancelled = false;

    (async () => {
      const [sourceLatest] = await getCachedTelecomSourceFiles();
      const [analyticsLatest] = sourceLatest
        ? []
        : await getCachedAnalyticsEntries();
      const latest = sourceLatest ?? analyticsLatest;
      if (!latest || cancelled) return;

      const tableName = telecomTableName(0);
      const dateStr =
        extractReportDateFromName(latest.fileName) ||
        new Date(latest.savedAt).toISOString().slice(0, 10);
      const restoredEntry: LoadedFile = {
        id: 0,
        name: latest.fileName,
        table: tableName,
        date: dateStr,
        cacheKey: latest.key,
        size: "size" in latest ? latest.size : 0,
        lastModified: "lastModified" in latest ? latest.lastModified : 0,
        sourceKeys: [latest.key],
      };

      const cachedAnalytics = await getCachedAnalyticsForKey(latest.key);
      if (cachedAnalytics && !cancelled) {
        applyCachedAnalytics(cachedAnalytics);

        activeCacheKeyRef.current = latest.key;
        fileCounterRef.current = 1;
        onTableNameChange(tableName);
        setActiveTableName(tableName);
        setActiveFileIdx(0);
        setLoadedFiles([restoredEntry]);
        setReportDate(dateStr);
        setFileName(latest.fileName);
        fileNameRef.current = latest.fileName;
        setCachedBadge(true);
        setRestoredFromFastCache(true);
        setLoaded(true);

        toast("Session restaurée", {
          description: `Dashboard restauré instantanément depuis le cache local`,
        });

        (async () => {
          const sourceFile = await getCachedTelecomSourceFile(latest.key);
          if (!sourceFile || cancelled) return;
          await loadTelecomFileToTable(sourceFile, tableName, false);
          const cols = await detectAvailableColumns(tableName);
          if (!cancelled) {
            setCsvCols([...new Set(cols)]);
            setRestoreRevision((rev) => rev + 1);
          }
        })().catch(() => {});

        return;
      }

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
  }, [loaded, handleFileLoad]);

  // Multi-file: when user switches active file via dropdown, update active table
  useEffect(() => {
    const f = loadedFiles.find((x) => x.id === activeFileIdx);
    if (!f) return;
    activeCacheKeyRef.current = f.cacheKey;
    setActiveTableName(f.table);
    setFileName(f.name);
    setReportDate(f.date);
    onTableNameChange(f.table);
  }, [activeFileIdx, loadedFiles, onTableNameChange]);

  return {
    loaded,
    loadError,
    fileName,
    reportDate,
    csvCols,
    activeTableName,
    loadedFiles,
    activeFileIdx,
    setActiveFileIdx,
    renameLoadedFile,
    cachedBadge,
    restoredFromFastCache,
    restoreRevision,
    fileNameRef,
    activeCacheKeyRef,
    firstLoad,
    setFileName,
    setReportDate,
    handleFileLoad,
    kpiForCache,
    canalsForCache,
    hourlyForCache,
    statusDataForCache,
    operatorsForCache,
    regionsForCache,
    rawStatusesForCache,
  };
}
