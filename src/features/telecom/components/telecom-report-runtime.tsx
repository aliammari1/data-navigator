"use client";

import { Database, HardDrive, Settings2, Signal, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { useActiveDataset, useDatasets, useSetActiveDataset } from "@/core/queries/datasets";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useTelecomSessionStore } from "@/core/stores/app-session-store";
import { useDataStore } from "@/core/stores/data-store";
import { KPI_FIELDS } from "@/features/telecom/constants";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { useTelecomUI } from "@/features/telecom/hooks/use-telecom-ui";
import { migrateLegacyDexieAnalyticsSnapshots } from "@/features/telecom/lib/analytics-snapshot-legacy-migration";
import {
  type AnalyticsSnapshotHistoryMeta,
  getAnalyticsSnapshot,
  listAnalyticsSnapshotMeta,
  loadAnalyticsSnapshotFromSQLite,
  type SQLiteAnalyticsSnapshot,
  saveAnalyticsSnapshot,
  saveAnalyticsSnapshotToSQLite,
} from "@/features/telecom/lib/analytics-sqlite-snapshot";
import { reattachCanalIcons, stripCanalIconsForPersist } from "@/features/telecom/lib/canal-config";
import { ALL_CANAL_CHANNELS } from "@/features/telecom/lib/canal-hierarchy";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  fetchCanalHourlyMatrix as _fetchCanalHourlyMatrix,
  fetchCustomerProfile as _fetchCustomerProfile,
  fetchDailyTrend as _fetchDailyTrend,
  fetchDestinationsForGroup as _fetchDestinationsForGroup,
  fetchFiltered as _fetchFiltered,
  fetchFilteredCount as _fetchFilteredCount,
  fetchFilteredPage as _fetchFilteredPage,
  fetchOperators as _fetchOperators,
  fetchOperatorsForGroup as _fetchOperatorsForGroup,
  fetchRegions as _fetchRegions,
  fetchRegionsForGroup as _fetchRegionsForGroup,
  fetchServiceCodeRows as _fetchServiceCodeRows,
  fetchUnclassifiedCanalCombos as _fetchUnclassifiedCanalCombos,
  runCustomKPIExpr as _runCustomKPIExpr,
} from "@/features/telecom/lib/queries";
import { getDatasetReportDate, isTelecomDataset } from "@/features/telecom/lib/telecom-dataset";
import { DEFAULT_MAPPING, useTelecomStore } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";
import { listRegisteredDatasets } from "@/platform/duckdb/duckdb";
import { exportDatasetSnapshotFile } from "@/platform/duckdb/duckdb-fs";
import { ColumnMapper } from "./column-mapper";
import { ExportPanel } from "./export-panel";
import { TelecomTabStrip } from "./telecom-tab-strip";
import { UnknownCanalDialog } from "./unknown-canal-dialog";
import { UnknownStatusDialog } from "./unknown-status-dialog";

const DEFAULT_OVERVIEW_EXPORT_SECTIONS: Types.OverviewExportSectionKey[] = [
  "assistant",
  "revenueGroups",
  "status",
  "hourly",
  "canalShare",
  "canalAmount",
  "successRate",
  "canalTable",
  "dailyTrend",
];

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface TelecomReportRuntimeValue {
  dashboardLoaded: boolean;
  dashboardFileName: string;
  dashboardReportDate: string;
  dashboardTableName: string;
  mapping: Types.ColumnMapping;
  setMapping: React.Dispatch<React.SetStateAction<Types.ColumnMapping>>;
  statusMapping: Types.StatusMapping[];
  setStatusMapping: React.Dispatch<React.SetStateAction<Types.StatusMapping[]>>;
  canalRule: Types.CanalRule[];
  setCanalRule: React.Dispatch<React.SetStateAction<Types.CanalRule[]>>;
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  rawStatuses: Types.RawStatusRow[];
  overviewKpi: Types.KPISummary | null;
  overviewCanals: Types.CanalSummary[];
  overviewHourly: Types.HourlyRow[];
  overviewStatusData: Types.StatusRow[];
  analyticsHistory: AnalyticsSnapshotHistoryMeta[];
  snapshotedAt: number | null;
  selectedKpis: Set<keyof Types.KPISummary>;
  toggleKpi: (key: keyof Types.KPISummary) => void;
  selectedOverviewSections: Set<Types.OverviewExportSectionKey>;
  toggleOverviewSection: (key: Types.OverviewExportSectionKey) => void;
  getTableName: () => string;
  fetchOperators: (m: Types.ColumnMapping) => Promise<Types.OperatorRow[]>;
  fetchRegions: (m: Types.ColumnMapping) => Promise<Types.RegionRow[]>;
  fetchOperatorsForGroup: (
    m: Types.ColumnMapping,
    groupKeys: Types.CanalKey[],
  ) => Promise<Types.OperatorRow[]>;
  fetchRegionsForGroup: (
    m: Types.ColumnMapping,
    groupKeys: Types.CanalKey[],
  ) => Promise<Types.RegionRow[]>;
  fetchDestinationsForGroup: (
    m: Types.ColumnMapping,
    groupKeys: Types.CanalKey[],
  ) => Promise<Types.OperatorRow[]>;
  fetchCanalHourlyMatrix: (m: Types.ColumnMapping) => Promise<Types.CanalHourCell[]>;
  fetchDailyTrend: (m: Types.ColumnMapping) => Promise<Types.DailyTrendRow[]>;
  fetchFiltered: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
    limit: number,
    offset: number,
    sortCol: string,
    sortDir: Types.SortDir,
  ) => Promise<{ rows: Types.RawRow[]; total: number }>;
  fetchFilteredCount: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
  ) => Promise<number>;
  fetchFilteredPage: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
    limit: number,
    offset: number,
    sortCol: string,
    sortDir: Types.SortDir,
  ) => Promise<Types.RawRow[]>;
  fetchCustomerProfile: (
    m: Types.ColumnMapping,
    msisdn: string,
  ) => Promise<Types.CustomerProfileData | null>;
  fetchServiceCodeRows: (m: Types.ColumnMapping) => Promise<Types.ServiceCodeRow[]>;
  runCustomKPIExpr: (sqlExpr: string) => Promise<number>;
  refreshAnalyticsHistory: () => Promise<void>;
  loadAnalyticsFromHistory: (id: number) => Promise<void>;
  exportActiveDatabase: () => Promise<void>;
  fetchUnclassifiedCanalCombos: (
    m: Types.ColumnMapping,
    mappings: Types.CanalRule[],
  ) => Promise<Types.UnclassifiedCanalCombo[]>;
}

const TelecomReportRuntimeContext = createContext<TelecomReportRuntimeValue | null>(null);

export function useTelecomReportRuntime() {
  const value = useContext(TelecomReportRuntimeContext);

  if (!value) {
    throw new Error("useTelecomReportRuntime must be used inside TelecomReportRuntimeProvider");
  }

  return value;
}

function msAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "snapshot";
  if (mins < 60) return `snapshot · ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `snapshot · ${hrs}h`;
  return `snapshot · ${Math.floor(hrs / 24)}d`;
}

function getDatasetViewName(
  dataset:
    | {
        tableName?: string;
        viewName?: string;
      }
    | null
    | undefined,
): string {
  return dataset?.viewName || dataset?.tableName || "";
}

export function TelecomReportRuntimeProvider({
  children,
  /** Desktop-window mode: currently active tab segment (skips URL routing). */
  activeTab: activeTabProp,
  /** Desktop-window mode: called instead of router.push when switching tabs. */
  onTabChange,
}: {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (seg: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const firstLoad = useRef(true);
  const fileNameRef = useRef("");
  const tableNameRef = useRef("");
  const snapshotLoadedForRef = useRef("");
  const lastAutoSavedRef = useRef<string | null>(null);

  const { data: datasets = [] } = useDatasets();
  const { data: activeDataset } = useActiveDataset();
  const activeDatasetId = activeDataset?.id ?? null;
  const setActiveDatasetMutation = useSetActiveDataset();

  const replaceDatasetsFromCatalog = useDataStore((state) => state.replaceDatasetsFromCatalog);

  const setTelecomSession = useTelecomSessionStore((state) => state.setSession);
  const setAppContext = useAppContextStore((state) => state.setContext);
  const addActivity = useActivityStore((state) => state.addEvent);

  const [analyticsHistory, setAnalyticsHistory] = useState<AnalyticsSnapshotHistoryMeta[]>([]);

  // Codes in the new file that aren't in the known taxonomy — shown in the
  // blocking dialog until the user explicitly assigns each one.
  const [pendingUnknown, setPendingUnknown] = useState<Types.StatusMapping[] | null>(null);

  // Account combos in the new file that match none of the 10 canal rules —
  // shown in the blocking dialog until the user assigns or acknowledges each
  // one. Left unresolved, these transactions would count toward "Transactions
  // Totales" but stay invisible in every canal/product/revenue breakdown.
  const [pendingUnknownCanals, setPendingUnknownCanals] = useState<
    Types.UnclassifiedCanalCombo[] | null
  >(null);

  const refreshAnalyticsHistory = useCallback(async () => {
    setAnalyticsHistory(await listAnalyticsSnapshotMeta());
  }, []);

  // One-time, idempotent: lift any snapshots left over in the legacy Dexie
  // store onto the durable SQLite history table, then refresh the list so
  // they show up immediately. No-ops instantly on every run after the first.
  useEffect(() => {
    let cancelled = false;
    void migrateLegacyDexieAnalyticsSnapshots().then(({ migrated }) => {
      if (!cancelled && migrated > 0) void refreshAnalyticsHistory();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshAnalyticsHistory]);

  useEffect(() => {
    let cancelled = false;

    async function syncDuckDBCatalog() {
      try {
        const catalog = await listRegisteredDatasets();

        if (!cancelled) {
          replaceDatasetsFromCatalog(catalog);
        }
      } catch {
        // DuckDB may not be ready during first render. The UI can still hydrate.
      }
    }

    syncDuckDBCatalog();

    return () => {
      cancelled = true;
    };
  }, [replaceDatasetsFromCatalog]);

  const {
    showMapper,
    setShowMapper,
    installPrompt,
    setInstallPrompt,
    mapping,
    setMapping,
    statusMapping,
    setStatusMapping,
    canalRule,
    setCanalRule,
  } = useTelecomUI({
    defaultMapping: DEFAULT_MAPPING,
    fileNameRef,
  });

  // Canal classification needs default system rules layered under any custom
  // overrides — canalRule only holds the custom/persisted subset. Without this
  // merge, canal-filtered queries (Top 50, canal heatmap) see zero rules and
  // every row falls through to "Other", so nothing ever matches a group.
  const mergedCanalRule = useMemo(() => {
    const customById = new Map<string, Types.CanalRule>();
    for (const rule of canalRule) {
      customById.set(rule.id, rule);
    }
    const merged: Types.CanalRule[] = [...canalRule];
    for (const defaultRule of ALL_CANAL_CHANNELS) {
      if (!customById.has(defaultRule.id)) {
        merged.push(defaultRule);
      }
    }
    return merged;
  }, [canalRule]);

  const telecomDatasets = useMemo(
    () =>
      datasets
        .filter(isTelecomDataset)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [datasets],
  );

  const activeTelecomDataset = useMemo(() => {
    const active = datasets.find((dataset) => dataset.id === activeDatasetId);

    if (active && isTelecomDataset(active)) return active;

    return telecomDatasets[0] ?? null;
  }, [datasets, activeDatasetId, telecomDatasets]);

  const dashboardTableName = getDatasetViewName(activeTelecomDataset);
  const dashboardLoaded = Boolean(activeTelecomDataset && dashboardTableName);
  // Falls back to the table name so this is never empty when dashboardLoaded is
  // true — activeTelecomDataset.name can be blank for datasets restored through
  // the legacy zustand-persist migration (data-store.ts's migrateDataset), which
  // backfills tableName/viewName independently of name.
  const dashboardFileName = activeTelecomDataset?.name || dashboardTableName || "";
  const dashboardReportDate = getDatasetReportDate(activeTelecomDataset);

  useEffect(() => {
    tableNameRef.current = dashboardTableName;
  }, [dashboardTableName]);

  const getTableName = useCallback(() => tableNameRef.current, []);

  const fetchOperators = useCallback(
    (m: Types.ColumnMapping, sm = []) =>
      _fetchOperators(tableNameRef.current, m, sm as Types.StatusMapping[]),
    [],
  );

  const fetchRegions = useCallback(
    (m: Types.ColumnMapping, sm = []) =>
      _fetchRegions(tableNameRef.current, m, sm as Types.StatusMapping[]),
    [],
  );

  const fetchOperatorsForGroup = useCallback(
    (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>
      _fetchOperatorsForGroup(tableNameRef.current, m, groupKeys, undefined, mergedCanalRule),
    [mergedCanalRule],
  );

  const fetchRegionsForGroup = useCallback(
    (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>
      _fetchRegionsForGroup(tableNameRef.current, m, groupKeys, undefined, mergedCanalRule),
    [mergedCanalRule],
  );

  const fetchDestinationsForGroup = useCallback(
    (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>
      _fetchDestinationsForGroup(tableNameRef.current, m, groupKeys, undefined, mergedCanalRule),
    [mergedCanalRule],
  );

  const fetchCanalHourlyMatrix = useCallback(
    (m: Types.ColumnMapping) => _fetchCanalHourlyMatrix(tableNameRef.current, m, mergedCanalRule),
    [mergedCanalRule],
  );

  const fetchDailyTrend = useCallback(
    (m: Types.ColumnMapping) => _fetchDailyTrend(tableNameRef.current, m),
    [],
  );

  const fetchCustomerProfile = useCallback(
    (m: Types.ColumnMapping, msisdn: string) =>
      _fetchCustomerProfile(tableNameRef.current, m, msisdn),
    [],
  );

  const fetchFiltered = useCallback(
    (
      m: Types.ColumnMapping,
      f: Types.FilterState,
      sm: Types.StatusMapping[],
      limit: number,
      offset: number,
      sortCol: string,
      sortDir: Types.SortDir,
    ) => _fetchFiltered(tableNameRef.current, m, f, sm, limit, offset, sortCol, sortDir),
    [],
  );

  const fetchFilteredCount = useCallback(
    (m: Types.ColumnMapping, f: Types.FilterState, sm: Types.StatusMapping[]) =>
      _fetchFilteredCount(tableNameRef.current, m, f, sm),
    [],
  );

  const fetchFilteredPage = useCallback(
    (
      m: Types.ColumnMapping,
      f: Types.FilterState,
      sm: Types.StatusMapping[],
      limit: number,
      offset: number,
      sortCol: string,
      sortDir: Types.SortDir,
    ) => _fetchFilteredPage(tableNameRef.current, m, f, sm, limit, offset, sortCol, sortDir),
    [],
  );

  const fetchServiceCodeRows = useCallback(
    (m: Types.ColumnMapping) => _fetchServiceCodeRows(tableNameRef.current, m),
    [],
  );

  const fetchUnclassifiedCanalCombos = useCallback(
    (m: Types.ColumnMapping, mappings: Types.CanalRule[]) =>
      _fetchUnclassifiedCanalCombos(tableNameRef.current, m, mappings),
    [],
  );

  const runCustomKPIExpr = useCallback(
    (sqlExpr: string) => _runCustomKPIExpr(tableNameRef.current, sqlExpr),
    [],
  );

  const dashboardCsvCols = activeTelecomDataset?.columns.map((column) => column.name) ?? [];

  const analytics = useTelecomAnalytics({
    getTableName,
    mapping,
    loaded: dashboardLoaded,
    statusMapping,
    canalRule,
    firstLoad,
    fileNameRef,
    onStatusMappingAdditions: (additions) => {
      // Show the blocking dialog — do NOT merge into statusMapping yet.
      // The user must explicitly assign every code before we proceed.
      setPendingUnknown(additions);
    },
    onUnclassifiedCanalCombos: (combos) => {
      // Show the blocking dialog — do NOT merge into canalRule yet.
      // The user must explicitly assign a real canal to every combo first.
      setPendingUnknownCanals(combos);
    },
  });

  useEffect(() => {
    if (!activeTelecomDataset || !dashboardTableName) return;

    if (activeDatasetId !== activeTelecomDataset.id) {
      setActiveDatasetMutation.mutate(activeTelecomDataset.id);
    }

    fileNameRef.current = activeTelecomDataset.name;
    firstLoad.current = true;

    setTelecomSession({
      tableName: dashboardTableName,
      fileName: activeTelecomDataset.name,
      reportDate: getDatasetReportDate(activeTelecomDataset),
    });
  }, [
    activeDatasetId,
    activeTelecomDataset,
    dashboardTableName,
    setActiveDatasetMutation,
    setTelecomSession,
  ]);

  const kpi = analytics.kpi;
  const canals = analytics.canals;
  const hourly = analytics.hourly;
  const statusData = analytics.statusData;
  const operators = analytics.operators;
  const regions = analytics.regions;

  const [persistingSnapshot, setPersistingSnapshot] = useState(false);
  const [snapshotedAt, setSnapshotedAt] = useState<number | null>(null);

  const handlePersistAnalytics = useCallback(async () => {
    if (!kpi || !dashboardFileName || !dashboardTableName) {
      toast.error("Impossible de sauvegarder : aucun jeu de données actif");
      return;
    }

    setPersistingSnapshot(true);

    try {
      await saveAnalyticsSnapshot({
        label: dashboardFileName,
        fileName: dashboardFileName,
        tableName: dashboardTableName,
        kpi,
        canals: stripCanalIconsForPersist(canals),
        hourly,
        statusData,
        operators,
        regions,
        rawStatuses: analytics.rawStatuses ?? [],
        totalTransactions: kpi.totalTransactions,
        successRate: kpi.successRate,
      });

      await refreshAnalyticsHistory();

      addActivity({
        type: "telecom_analysis_saved",
        message: `Saved telecom analytics for ${dashboardFileName}`,
        tableName: dashboardTableName,
        metadata: {
          totalTransactions: kpi.totalTransactions,
          successRate: kpi.successRate,
        },
      });

      toast("Analytics sauvegardés", {
        description: dashboardFileName,
      });
    } catch (err) {
      console.error("[telecom] handlePersistAnalytics failed:", err);
      const detail = err instanceof Error ? err.message : String(err);
      toast.error("Échec de la sauvegarde", { description: detail });
    } finally {
      setPersistingSnapshot(false);
    }
  }, [
    kpi,
    dashboardFileName,
    dashboardTableName,
    canals,
    hourly,
    statusData,
    operators,
    regions,
    analytics.rawStatuses,
    refreshAnalyticsHistory,
    addActivity,
  ]);

  const [selectedKpis, setSelectedKpis] = useState<Set<keyof Types.KPISummary>>(
    () => new Set(KPI_FIELDS.map((field) => field.key)),
  );

  const toggleKpi = useCallback((key: keyof Types.KPISummary) => {
    setSelectedKpis((prev) => {
      const next = new Set(prev);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }, []);

  const [selectedOverviewSections, setSelectedOverviewSections] = useState<
    Set<Types.OverviewExportSectionKey>
  >(() => new Set(DEFAULT_OVERVIEW_EXPORT_SECTIONS));

  const toggleOverviewSection = useCallback((key: Types.OverviewExportSectionKey) => {
    setSelectedOverviewSections((prev) => {
      const next = new Set(prev);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }, []);

  useEffect(() => {
    fileNameRef.current = dashboardFileName;
  }, [dashboardFileName]);

  useEffect(() => {
    setTelecomSession({
      tableName: dashboardTableName,
      fileName: dashboardFileName,
      reportDate: dashboardReportDate,
    });

    useTelecomStore.getState().setFileName(dashboardFileName);
    useTelecomStore.getState().setReportDate(dashboardReportDate);

    setAppContext({
      activeDomain: "telecom",
      activeDatasetId: activeTelecomDataset?.id ?? activeDatasetId ?? null,
      activeTableName: dashboardTableName || null,
    });
  }, [
    dashboardTableName,
    dashboardFileName,
    dashboardReportDate,
    activeDatasetId,
    activeTelecomDataset?.id,
    setAppContext,
    setTelecomSession,
  ]);

  const { rawStatuses, isFetching: analyticsIsFetching } = analytics;

  // Reset snapshot tracking whenever the active table changes (dataset switch).
  // biome-ignore lint/correctness/useExhaustiveDependencies: dashboardTableName is only a re-run trigger, not read in the body
  useEffect(() => {
    snapshotLoadedForRef.current = "";
    setSnapshotedAt(null);
  }, [dashboardTableName]);

  // Auto-load: when analytics settle with no data (DuckDB table absent), restore
  // the last SQLite snapshot for this dataset so the UI shows something immediately.
  // biome-ignore lint/correctness/useExhaustiveDependencies: analytics setters are stable useCallback refs
  useEffect(() => {
    if (!dashboardLoaded || analyticsIsFetching || kpi !== null || !dashboardTableName) return;
    if (snapshotLoadedForRef.current === dashboardTableName) return;
    snapshotLoadedForRef.current = dashboardTableName;

    let cancelled = false;
    void loadAnalyticsSnapshotFromSQLite(dashboardTableName).then((snapshot) => {
      if (cancelled || !snapshot?.kpi) return;
      analytics.setKpi(snapshot.kpi as Types.KPISummary);
      analytics.setCanals(reattachCanalIcons(snapshot.canals));
      analytics.setHourly(snapshot.hourly as Types.HourlyRow[]);
      analytics.setStatusData(snapshot.statusData as Types.StatusRow[]);
      analytics.setOperators(snapshot.operators as Types.OperatorRow[]);
      analytics.setRegions(snapshot.regions as Types.RegionRow[]);
      analytics.setRawStatuses((snapshot.rawStatuses ?? []) as Types.RawStatusRow[]);
      setSnapshotedAt(snapshot.computedAt);
    });
    return () => {
      cancelled = true;
    };
  }, [dashboardLoaded, analyticsIsFetching, kpi, dashboardTableName]);

  // Auto-save: when fresh analytics complete, snapshot them to SQLite and clear
  // the snapshot indicator (we are now showing live data, not a stored snapshot).
  useEffect(() => {
    if (!kpi || !dashboardTableName || analyticsIsFetching) return;
    const saveKey = `${dashboardTableName}:${kpi.totalTransactions}`;
    if (lastAutoSavedRef.current === saveKey) return;
    lastAutoSavedRef.current = saveKey;
    setSnapshotedAt(null);

    const payload: SQLiteAnalyticsSnapshot = {
      tableName: dashboardTableName,
      fileName: dashboardFileName,
      kpi,
      canals: stripCanalIconsForPersist(canals),
      hourly,
      statusData,
      operators,
      regions,
      rawStatuses: rawStatuses ?? [],
      computedAt: Date.now(),
    };
    void saveAnalyticsSnapshotToSQLite(payload).catch((err) => {
      console.error("[telecom] auto-save snapshot failed:", err);
    });
  }, [
    kpi,
    dashboardTableName,
    analyticsIsFetching,
    dashboardFileName,
    canals,
    hourly,
    statusData,
    operators,
    regions,
    rawStatuses,
  ]);

  const restoredSnapshotMode = Boolean(kpi) && !dashboardLoaded;
  // In desktop-window mode use the local activeTab state; otherwise derive from URL.
  const historyRoute = activeTabProp
    ? activeTabProp === "history"
    : pathname.endsWith("/telecom-report/history");

  const reportContentVisible = dashboardLoaded || restoredSnapshotMode || historyRoute;

  const overviewKpi = kpi;
  const overviewCanals = canals;
  const overviewHourly = hourly;
  const overviewStatusData = statusData;

  async function loadAnalyticsFromHistory(id: number) {
    const cached = await getAnalyticsSnapshot(id);

    if (!cached) return;

    analytics.setKpi(cached.kpi);
    analytics.setCanals(reattachCanalIcons(cached.canals));
    analytics.setHourly(cached.hourly);
    analytics.setStatusData(cached.statusData);
    analytics.setOperators(cached.operators);
    analytics.setRegions(cached.regions);
    analytics.setRawStatuses(cached.rawStatuses);

    addActivity({
      type: "dataset_selected",
      message: `Loaded saved telecom analytics for ${cached.fileName}`,
      tableName: cached.tableName,
    });

    if (onTabChange) onTabChange("overview");
    else router.push("/dashboard/telecom-report/overview");
  }

  async function exportActiveDatabase() {
    if (!activeTelecomDataset?.id) {
      toast.error("Aucun dataset actif à exporter");
      return;
    }

    await exportDatasetSnapshotFile({
      datasetId: activeTelecomDataset.id,
      defaultPath: `${dashboardFileName || activeTelecomDataset.name || activeTelecomDataset.id}.parquet`,
    });
  }

  function goToTelecomUpload() {
    addActivity({
      type: "telecom_opened",
      message: "Opened telecom upload flow",
      tableName: dashboardTableName,
    });

    router.push("/dashboard/upload?context=telecom");
  }

  const runtimeValue: TelecomReportRuntimeValue = {
    dashboardLoaded,
    dashboardFileName,
    dashboardReportDate,
    dashboardTableName,
    mapping,
    setMapping,
    statusMapping,
    setStatusMapping,
    canalRule,
    setCanalRule,
    kpi,
    canals,
    hourly,
    statusData,
    operators,
    regions,
    rawStatuses,
    overviewKpi,
    overviewCanals,
    overviewHourly,
    overviewStatusData,
    analyticsHistory,
    snapshotedAt,
    selectedKpis,
    toggleKpi,
    selectedOverviewSections,
    toggleOverviewSection,
    getTableName,
    fetchOperators,
    fetchRegions,
    fetchOperatorsForGroup,
    fetchRegionsForGroup,
    fetchDestinationsForGroup,
    fetchCanalHourlyMatrix,
    fetchDailyTrend,
    fetchFiltered,
    fetchFilteredCount,
    fetchFilteredPage,
    fetchCustomerProfile,
    fetchServiceCodeRows,
    runCustomKPIExpr,
    refreshAnalyticsHistory,
    loadAnalyticsFromHistory,
    exportActiveDatabase,
    fetchUnclassifiedCanalCombos,
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <AnimatedGridPattern
        numSquares={28}
        maxOpacity={0.2}
        duration={5}
        repeatDelay={1}
        className="mask-[radial-gradient(900px_circle_at_center,white,transparent)] opacity-35"
      />

      <div className="sticky top-0 z-30 flex-none border-b border-border bg-background/95 px-6 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-linear-to-br from-primary to-primary/80">
              <Signal className="h-5 w-5 text-primary-foreground" />
            </div>

            <div className="min-w-0">
              <div className="text-sm font-bold text-foreground">
                Rapport Journalier des Transactions Télécom
              </div>

              <div className="mt-1">
                <TelecomDatasetPicker
                  datasets={telecomDatasets}
                  activeDatasetId={activeTelecomDataset?.id ?? null}
                  onUpload={goToTelecomUpload}
                  onSelect={(id) => {
                    setActiveDatasetMutation.mutate(id);

                    const selected = telecomDatasets.find((dataset) => dataset.id === id);

                    if (!selected) return;

                    const selectedViewName = getDatasetViewName(selected);

                    if (!selectedViewName) return;

                    fileNameRef.current = selected.name;
                    firstLoad.current = true;

                    setTelecomSession({
                      tableName: selectedViewName,
                      fileName: selected.name,
                      reportDate: getDatasetReportDate(selected),
                    });
                  }}
                />
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {dashboardFileName && (
                  <span className="max-w-48 truncate font-mono text-muted-foreground">
                    {dashboardFileName}
                  </span>
                )}

                {dashboardReportDate && (
                  <>
                    <span>·</span>
                    <span>{dashboardReportDate}</span>
                  </>
                )}

                {kpi && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-primary">
                      {fmtN(kpi.totalTransactions)} tx
                    </span>
                  </>
                )}

                {kpi && (
                  <>
                    <span>·</span>
                    <span
                      className={
                        kpi.successRate >= 90
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      {fmtPct(kpi.successRate)} réussite
                    </span>
                  </>
                )}

                {snapshotedAt && (
                  <>
                    <span>·</span>
                    <span
                      title={`Snapshot calculé le ${new Date(snapshotedAt).toLocaleString()}`}
                      className="flex items-center gap-0.5 text-amber-500 dark:text-amber-400"
                    >
                      <HardDrive className="h-3 w-3" />
                      {msAgo(snapshotedAt)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {dashboardLoaded && kpi && (
              <button
                type="button"
                onClick={handlePersistAnalytics}
                disabled={persistingSnapshot}
                className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
              >
                <Database className="h-3.5 w-3.5" />
                {persistingSnapshot ? "Sauvegarde…" : "Persister"}
              </button>
            )}

            {installPrompt && (
              <button
                type="button"
                onClick={() => {
                  (installPrompt as BeforeInstallPromptEvent).prompt?.();
                  setInstallPrompt(null);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
              >
                <HardDrive className="h-3.5 w-3.5" />
                Installer
              </button>
            )}

            <button
              type="button"
              onClick={goToTelecomUpload}
              className="flex items-center gap-1.5 rounded-xl border-transparent bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              Importer
            </button>

            {dashboardLoaded && (
              <>
                <button
                  type="button"
                  onClick={() => setShowMapper(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Colonnes
                </button>

                <ExportPanel
                  kpi={kpi}
                  canals={canals}
                  reportDate={dashboardReportDate}
                  fileName={dashboardFileName}
                  hourly={hourly}
                  operators={operators}
                  regions={regions}
                  statusData={statusData}
                  selectedKpis={selectedKpis}
                  selectedOverviewSections={selectedOverviewSections}
                  fetchDailyTrend={() => fetchDailyTrend(mapping)}
                />
              </>
            )}
          </div>
        </div>

        {onTabChange && (
          <div className="mt-3 border-b border-border">
            <TelecomTabStrip activeTab={activeTabProp} onTabChange={onTabChange} />
          </div>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {!reportContentVisible && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Upload className="h-5 w-5" />
              </div>

              <h2 className="text-sm font-bold text-foreground">Aucun rapport télécom chargé</h2>

              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Les fichiers sont chargés depuis la page Upload centrale. Après import, le rapport
                sera disponible ici pour analyse.
              </p>

              <button
                type="button"
                onClick={goToTelecomUpload}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Ouvrir Upload
              </button>
            </div>
          </div>
        )}

        {reportContentVisible && (
          <TelecomReportRuntimeContext.Provider value={runtimeValue}>
            <div className="flex min-h-0 gap-4">
              <section
                id="telecom-report-panel"
                aria-label="Contenu du rapport télécom"
                className="min-w-0 flex-1"
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </section>
            </div>
          </TelecomReportRuntimeContext.Provider>
        )}
      </div>

      <AnimatePresence>
        {showMapper && (
          <ColumnMapper
            mapping={mapping}
            columns={dashboardCsvCols}
            onChange={(m) => {
              setMapping(m);
            }}
            onClose={() => setShowMapper(false)}
            defaultMapping={DEFAULT_MAPPING}
          />
        )}
      </AnimatePresence>

      {/* ── Unknown-status gate — blocks interaction until all codes are assigned ── */}
      {pendingUnknown && pendingUnknown.length > 0 && (
        <UnknownStatusDialog
          pending={pendingUnknown}
          rawStatuses={rawStatuses ?? []}
          onConfirm={(confirmed) => {
            setStatusMapping((prev) => [...prev, ...confirmed]);
            setPendingUnknown(null);
          }}
        />
      )}

      {/* ── Unknown-canal gate — resolves after the status gate above so the two
          blocking dialogs never stack when a file introduces both at once. ── */}
      {(!pendingUnknown || pendingUnknown.length === 0) &&
        pendingUnknownCanals &&
        pendingUnknownCanals.length > 0 && (
          <UnknownCanalDialog
            pending={pendingUnknownCanals}
            onConfirm={(confirmed) => {
              setCanalRule((prev) => [...prev, ...confirmed]);
              setPendingUnknownCanals(null);
            }}
          />
        )}
    </div>
  );
}

export function TelecomLoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-primary" />
      </div>

      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TelecomDatasetPicker({
  datasets,
  activeDatasetId,
  onSelect,
  onUpload,
}: {
  datasets: Array<{
    id: string;
    name: string;
    tableName: string;
    viewName?: string;
    rowCount: number;
  }>;
  activeDatasetId: string | null;
  onSelect: (id: string) => void;
  onUpload: () => void;
}) {
  if (datasets.length === 0) {
    return (
      <button
        type="button"
        onClick={onUpload}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
      >
        <Upload className="h-4 w-4" />
        Charger un rapport
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Database className="h-4 w-4 text-muted-foreground" />

      <select
        value={activeDatasetId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        className="h-9 max-w-72 rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {datasets.map((dataset) => (
          <option key={dataset.id} value={dataset.id}>
            {dataset.name} · {dataset.rowCount.toLocaleString()} rows
          </option>
        ))}
      </select>
    </div>
  );
}
