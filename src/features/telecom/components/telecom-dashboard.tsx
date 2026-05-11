"use client";

import {
  Activity,
  AlertCircle,
  Database,
  HardDrive,
  Radio,
  Settings2,
  Signal,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import BlurText from "@/components/BlurText";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useTelecomSessionStore } from "@/core/stores/app-session-store";
import { useDataStore } from "@/core/stores/data-store";
import { KPI_FIELDS } from "@/features/telecom/constants";
import { useSharedOverview } from "@/features/telecom/hooks/use-shared-overview";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { useTelecomFileLoad } from "@/features/telecom/hooks/use-telecom-file-load";
import { useTelecomUI } from "@/features/telecom/hooks/use-telecom-ui";
import {
  type CachedAnalyticsMeta,
  getCachedAnalyticsEntries,
  getCachedAnalyticsForKey,
} from "@/features/telecom/lib/analytics-cache";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import { publishSelection } from "@/features/telecom/lib/lan-collab";
import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import {
  detectAvailableColumns as _detectAvailableColumns,
  fetchCanalHourlyMatrix as _fetchCanalHourlyMatrix,
  fetchCustomerProfile as _fetchCustomerProfile,
  fetchDailyTrend as _fetchDailyTrend,
  fetchDestinationsForGroup as _fetchDestinationsForGroup,
  fetchFiltered as _fetchFiltered,
  fetchOperators as _fetchOperators,
  fetchOperatorsForGroup as _fetchOperatorsForGroup,
  fetchRegions as _fetchRegions,
  fetchRegionsForGroup as _fetchRegionsForGroup,
  fetchServiceCodeRows as _fetchServiceCodeRows,
  runCustomKPIExpr as _runCustomKPIExpr,
} from "@/features/telecom/lib/queries";
import {
  getDatasetReportDate,
  isTelecomDataset,
} from "@/features/telecom/lib/telecom-dataset";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import { loadTableFromFS } from "@/platform/duckdb/duckdb-fs";
import { saveAnalyticsSnapshot } from "@/platform/storage/app-db";
import { AnalysisTab } from "./analysis-tab";
import { AnalyticsHistoryTab } from "./analytics-history-tab";
import { CanalTab } from "./canal-tab";
import { ColumnMapper } from "./column-mapper";
import { ConfigTab } from "./config-tab";
import { DayAnalyticsTab } from "./day-analytics-tab";
import { ExportPanel } from "./export-panel";
import { LanCollabPanel } from "./lan-collab-panel";
import { OverviewTab } from "./overview-tab";
import { PeriodStudioTab } from "./period-studio-tab";
import { RawDataTab } from "./raw-data-tab";
import { UserManagementPanel } from "./user-management-panel";

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

export function TelecomDashboard() {
  const router = useRouter();
  const access = useDashboardAccess();

  const firstLoad = useRef(true);
  const fileNameRef = useRef("");
  const skippedFastCacheAnalyticsRef = useRef(false);
  const bridgedDatasetIdRef = useRef<string | null>(null);

  const datasets = useDataStore((state) => state.datasets);
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const setActiveDataset = useDataStore((state) => state.setActiveDataset);
  const loadedTableNames = useDataStore((state) => state.loadedTableNames);
  const markTableLoaded = useDataStore((state) => state.markTableLoaded);
  const persistedTableName = useTelecomSessionStore((state) => state.tableName);
  const setTelecomSession = useTelecomSessionStore((state) => state.setSession);
  const setAppContext = useAppContextStore((state) => state.setContext);
  const addActivity = useActivityStore((state) => state.addEvent);

  const [cachedKpi, setCachedKpi] = useState<Types.KPISummary | null>(null);
  const [cachedCanals, setCachedCanals] = useState<Types.CanalSummary[]>([]);
  const [cachedHourly, setCachedHourly] = useState<Types.HourlyRow[]>([]);
  const [cachedStatusData, setCachedStatusData] = useState<Types.StatusRow[]>(
    [],
  );
  const [cachedOperators, setCachedOperators] = useState<Types.OperatorRow[]>(
    [],
  );
  const [cachedRegions, setCachedRegions] = useState<Types.RegionRow[]>([]);

  const [analyticsHistory, setAnalyticsHistory] = useState<
    CachedAnalyticsMeta[]
  >([]);
  const [restoringCentralTable, setRestoringCentralTable] = useState(false);
  const [centralRestoreError, setCentralRestoreError] = useState<string | null>(
    null,
  );

  const telecomRole = access.role === "owner" ? "admin" : "user";

  const {
    mounted,
    activeTab,
    switchTab,
    showMapper,
    setShowMapper,
    installPrompt,
    setInstallPrompt,
    mapping,
    setMapping,
    statusMapping,
    setStatusMapping,
    statusMappingRef,
  } = useTelecomUI({
    defaultMapping: DEFAULT_MAPPING,
    fileNameRef,
  });

  const fileLoad = useTelecomFileLoad({
    onTableNameChange: (name) => {
      setTelecomSession({ tableName: name });
    },
    detectAvailableColumns,
    setKpi: setCachedKpi,
    setCanals: setCachedCanals,
    setHourly: setCachedHourly,
    setStatusData: setCachedStatusData,
    setOperators: setCachedOperators,
    setRegions: setCachedRegions,
  });

  const {
    loaded,
    loadError,
    csvCols,
    activeTableName,
    loadedFiles,
    cachedBadge,
    activeCacheKeyRef,
  } = fileLoad;

  const telecomDatasets = useMemo(
    () =>
      datasets
        .filter(isTelecomDataset)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [datasets],
  );

  const activeTelecomDataset = useMemo(() => {
    const active = datasets.find((dataset) => dataset.id === activeDatasetId);

    if (active && isTelecomDataset(active)) return active;

    return telecomDatasets[0] ?? null;
  }, [datasets, activeDatasetId, telecomDatasets]);

  const centralTelecomTableLoaded = Boolean(
    activeTelecomDataset &&
      loadedTableNames.includes(activeTelecomDataset.tableName),
  );

  const usingCentralUpload = Boolean(activeTelecomDataset);

  const dashboardLoaded = usingCentralUpload
    ? centralTelecomTableLoaded
    : loaded;

  const dashboardFileName = usingCentralUpload
    ? (activeTelecomDataset?.name ?? "")
    : fileLoad.fileName;

  const dashboardReportDate = usingCentralUpload
    ? getDatasetReportDate(activeTelecomDataset)
    : fileLoad.reportDate;

  const dashboardTableName = usingCentralUpload
    ? (activeTelecomDataset?.tableName ?? TELECOM_TABLE_BASE)
    : activeTableName || persistedTableName || TELECOM_TABLE_BASE;

  const tableNameRef = useRef(dashboardTableName);

  useEffect(() => {
    tableNameRef.current = dashboardTableName;
  }, [dashboardTableName]);

  const getTableName = useCallback(() => tableNameRef.current, []);

  function detectAvailableColumns(tableName?: string) {
    return _detectAvailableColumns(tableName ?? tableNameRef.current);
  }

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
      _fetchOperatorsForGroup(tableNameRef.current, m, groupKeys),
    [],
  );

  const fetchRegionsForGroup = useCallback(
    (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>
      _fetchRegionsForGroup(tableNameRef.current, m, groupKeys),
    [],
  );

  const fetchDestinationsForGroup = useCallback(
    (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>
      _fetchDestinationsForGroup(tableNameRef.current, m, groupKeys),
    [],
  );

  const fetchCanalHourlyMatrix = useCallback(
    (m: Types.ColumnMapping) =>
      _fetchCanalHourlyMatrix(tableNameRef.current, m),
    [],
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
    ) =>
      _fetchFiltered(
        tableNameRef.current,
        m,
        f,
        sm,
        limit,
        offset,
        sortCol,
        sortDir,
      ),
    [],
  );

  const fetchServiceCodeRows = useCallback(
    (m: Types.ColumnMapping) => _fetchServiceCodeRows(tableNameRef.current, m),
    [],
  );

  const runCustomKPIExpr = useCallback(
    (sqlExpr: string) => _runCustomKPIExpr(tableNameRef.current, sqlExpr),
    [],
  );

  const dashboardCsvCols = usingCentralUpload
    ? (activeTelecomDataset?.columns.map((column) => column.name) ?? [])
    : csvCols;

  const analytics = useTelecomAnalytics({
    getTableName,
    mapping,
    loaded: dashboardLoaded,
    statusMappingRef,
    firstLoad,
    fileNameRef,
    onStatusMappingAdditions: (additions) => {
      setStatusMapping((prev) => [...prev, ...additions]);
    },
  });

  useEffect(() => {
    if (!activeTelecomDataset) return;

    const tableName = activeTelecomDataset.tableName;

    if (loadedTableNames.includes(tableName)) {
      setCentralRestoreError(null);
      return;
    }

    let cancelled = false;

    setRestoringCentralTable(true);
    setCentralRestoreError(null);

    loadTableFromFS(tableName)
      .then((restored) => {
        if (cancelled) return;
        if (restored) {
          markTableLoaded(tableName);
          setCentralRestoreError(null);
        } else {
          setCentralRestoreError(
            "Le dataset télécom existe dans le catalogue, mais sa table DuckDB locale est introuvable. Rechargez le fichier depuis Upload.",
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCentralRestoreError(
          "Impossible de restaurer la table DuckDB locale. Rechargez le fichier depuis Upload.",
        );
      })
      .finally(() => {
        if (!cancelled) setRestoringCentralTable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTelecomDataset, loadedTableNames, markTableLoaded]);

  // Bridge selected Upload dataset into the telecom session context.
  useEffect(() => {
    if (!activeTelecomDataset) return;
    if (!loadedTableNames.includes(activeTelecomDataset.tableName)) return;

    const alreadyBridged =
      bridgedDatasetIdRef.current === activeTelecomDataset.id &&
      tableNameRef.current === activeTelecomDataset.tableName;

    if (alreadyBridged) return;

    fileNameRef.current = activeTelecomDataset.name;
    firstLoad.current = true;
    bridgedDatasetIdRef.current = activeTelecomDataset.id;
    setTelecomSession({
      tableName: activeTelecomDataset.tableName,
      fileName: activeTelecomDataset.name,
      reportDate: getDatasetReportDate(activeTelecomDataset),
    });

    analytics.setRefreshKey((key) => key + 1);
  }, [
    activeTelecomDataset,
    loadedTableNames,
    analytics.setRefreshKey,
    setTelecomSession,
  ]);

  const kpi = analytics.kpi ?? (usingCentralUpload ? null : cachedKpi);

  const canals =
    analytics.canals.length > 0
      ? analytics.canals
      : usingCentralUpload
        ? []
        : cachedCanals;

  const hourly =
    analytics.hourly.length > 0
      ? analytics.hourly
      : usingCentralUpload
        ? []
        : cachedHourly;

  const statusData =
    analytics.statusData.length > 0
      ? analytics.statusData
      : usingCentralUpload
        ? []
        : cachedStatusData;

  const operators =
    analytics.operators.length > 0
      ? analytics.operators
      : usingCentralUpload
        ? []
        : cachedOperators;

  const regions =
    analytics.regions.length > 0
      ? analytics.regions
      : usingCentralUpload
        ? []
        : cachedRegions;

  const [persistingSnapshot, setPersistingSnapshot] = useState(false);

  const handlePersistAnalytics = useCallback(async () => {
    if (!kpi || !dashboardFileName) return;
    setPersistingSnapshot(true);
    try {
      await saveAnalyticsSnapshot({
        label: dashboardFileName,
        fileName: dashboardFileName,
        tableName: dashboardTableName,
        kpi,
        canals,
        hourly,
        statusData,
        operators,
        regions,
        rawStatuses: analytics.rawStatuses ?? [],
        totalTransactions: kpi.totalTransactions,
        successRate: kpi.successRate,
      });
      import("sonner").then(({ toast }) =>
        toast("Analytics sauvegardés", { description: dashboardFileName }),
      );
    } catch {
      toast.error("Échec de la sauvegarde");
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
  ]);

  const [selectedKpis, setSelectedKpis] = useState<Set<keyof Types.KPISummary>>(
    () => new Set(KPI_FIELDS.map((f) => f.key)),
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

  const toggleOverviewSection = useCallback(
    (key: Types.OverviewExportSectionKey) => {
      setSelectedOverviewSections((prev) => {
        const next = new Set(prev);

        if (next.has(key)) next.delete(key);
        else next.add(key);

        return next;
      });
    },
    [],
  );

  useEffect(() => {
    fileNameRef.current = dashboardFileName;
  }, [dashboardFileName]);

  useEffect(() => {
    setTelecomSession({
      tableName: dashboardTableName,
      fileName: dashboardFileName,
      reportDate: dashboardReportDate,
    });
    setAppContext({
      activeDomain: "telecom",
      activeDatasetId: activeTelecomDataset?.id ?? activeDatasetId ?? null,
      activeTableName: dashboardTableName,
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

  useEffect(() => {
    if (usingCentralUpload) return;

    const f = fileLoad.loadedFiles.find((x) => x.id === fileLoad.activeFileIdx);

    if (!f) return;
    if (tableNameRef.current === f.table) return;

    setTelecomSession({
      tableName: f.table,
      fileName: f.name,
      reportDate: f.date,
    });
    analytics.setRefreshKey((k) => k + 1);
  }, [
    usingCentralUpload,
    fileLoad.activeFileIdx,
    fileLoad.loadedFiles,
    analytics,
    setTelecomSession,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: statusMappingRef intentionally supplies the latest mapping without retriggering legacy analytics refreshes.
  useEffect(() => {
    if (
      !usingCentralUpload &&
      fileLoad.restoredFromFastCache &&
      !skippedFastCacheAnalyticsRef.current &&
      analytics.refreshKey === 0
    ) {
      skippedFastCacheAnalyticsRef.current = true;
      return;
    }

    if (dashboardLoaded) {
      analytics.runAnalytics(mapping, statusMappingRef.current);
    }
  }, [
    usingCentralUpload,
    dashboardLoaded,
    fileLoad.restoredFromFastCache,
    mapping,
    analytics.refreshKey,
    analytics.runAnalytics,
  ]);

  // Legacy analytics cache write-back only applies to the old fileLoad path.
  useEffect(() => {
    if (usingCentralUpload) return;

    const cacheKey = activeCacheKeyRef.current;

    if (analytics.kpi && cacheKey) {
      import("@/features/telecom/lib/analytics-cache").then(
        ({ setCachedAnalyticsForKey }) => {
          setCachedAnalyticsForKey(cacheKey, {
            fileName: fileNameRef.current,
            kpi: analytics.kpi as Types.KPISummary,
            canals: analytics.canals,
            hourly: analytics.hourly,
            statusData: analytics.statusData,
            operators: analytics.operators,
            regions: analytics.regions,
            rawStatuses: analytics.rawStatuses,
          }).catch(() => {});
        },
      );
    }
  }, [
    usingCentralUpload,
    analytics.kpi,
    analytics.canals,
    analytics.hourly,
    analytics.statusData,
    analytics.operators,
    analytics.regions,
    analytics.rawStatuses,
    activeCacheKeyRef,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const { forecast, rawStatuses } = analytics;

  const { remoteOverview } = useSharedOverview({
    enabled: Boolean(dashboardLoaded && kpi),
    fileName: dashboardFileName,
    reportDate: dashboardReportDate,
    kpi,
    canals,
    hourly,
    statusData,
    forecast,
  });

  const sharedOverviewMode = !dashboardLoaded && Boolean(remoteOverview);

  const overviewKpi = sharedOverviewMode ? (remoteOverview?.kpi ?? null) : kpi;

  const overviewCanals = sharedOverviewMode
    ? (remoteOverview?.canals ?? [])
    : canals;

  const overviewHourly = sharedOverviewMode
    ? (remoteOverview?.hourly ?? [])
    : hourly;

  const overviewStatusData = sharedOverviewMode
    ? (remoteOverview?.statusData ?? [])
    : statusData;

  const overviewForecast = sharedOverviewMode
    ? (remoteOverview?.forecast ?? [])
    : forecast;

  useEffect(() => {
    if (sharedOverviewMode && activeTab !== "overview") switchTab("overview");
  }, [activeTab, sharedOverviewMode, switchTab]);

  useEffect(() => {
    publishSelection(`telecom:${activeTab}`);
  }, [activeTab]);

  const tabCounts: Record<string, number> = {
    overview: overviewKpi?.totalTransactions ?? 0,
    canals: overviewCanals.length,
    grid: kpi?.totalTransactions ?? 0,
    period: kpi?.totalTransactions ?? 0,
    day: 0,
    history: analyticsHistory.length,
    config: 0,
  };

  async function refreshAnalyticsHistory() {
    setAnalyticsHistory(await getCachedAnalyticsEntries());
  }

  // Keep external telecom sidebar selection behavior aligned with the internal
  // report sidebar, which refreshes history before opening that tab.
  useEffect(() => {
    if (activeTab === "history") void refreshAnalyticsHistory();
  }, [activeTab]);

  async function loadAnalyticsFromHistory(key: string) {
    const cached = await getCachedAnalyticsForKey(key);

    if (!cached) return;

    fileLoad.activeCacheKeyRef.current = key;

    analytics.setKpi(cached.kpi as Types.KPISummary);
    analytics.setCanals(cached.canals as Types.CanalSummary[]);
    analytics.setHourly(cached.hourly as Types.HourlyRow[]);
    analytics.setStatusData(cached.statusData as Types.StatusRow[]);
    analytics.setOperators(cached.operators as Types.OperatorRow[]);
    analytics.setRegions(cached.regions as Types.RegionRow[]);

    const match = cached.fileName.match(/(\d{8})/);
    const d = match?.[1];

    fileLoad.setFileName(cached.fileName);
    fileLoad.setReportDate(
      d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "",
    );
    addActivity({
      type: "dataset_selected",
      message: `Loaded cached telecom analytics for ${cached.fileName}`,
      tableName: dashboardTableName,
    });
  }

  async function exportActiveDatabase() {
    if (!access.permissions.canExport) return;

    const { exportTableSnapshotFile } = await import(
      "@/platform/duckdb/duckdb-fs"
    );

    await exportTableSnapshotFile(dashboardTableName || TELECOM_TABLE_BASE);
  }

  function goToTelecomUpload() {
    addActivity({
      type: "telecom_opened",
      message: "Opened telecom upload flow",
      tableName: dashboardTableName,
    });
    router.push("/dashboard/upload?context=telecom");
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      <AnimatedGridPattern
        numSquares={28}
        maxOpacity={0.2}
        duration={5}
        repeatDelay={1}
        className="[mask-image:radial-gradient(900px_circle_at_center,white,transparent)] opacity-35"
      />
      {/* Sticky header */}
      <div className="flex-none sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-teal-700 to-emerald-600 flex items-center justify-center flex-none">
              <Signal className="w-5 h-5 text-white" />
            </div>

            <div className="min-w-0">
              <BlurText
                text="Rapport Journalier des Transactions Télécom"
                animateBy="letters"
                delay={18}
                stepDuration={0.24}
                className="text-sm font-bold text-foreground leading-tight truncate"
              />

              <div className="mt-1">
                <TelecomDatasetPicker
                  datasets={telecomDatasets}
                  activeDatasetId={activeTelecomDataset?.id ?? null}
                  loadedTableNames={loadedTableNames}
                  onUpload={goToTelecomUpload}
                  onSelect={(id) => {
                    setActiveDataset(id);

                    const selected = telecomDatasets.find(
                      (dataset) => dataset.id === id,
                    );

                    if (!selected) return;

                    if (loadedTableNames.includes(selected.tableName)) {
                      fileNameRef.current = selected.name;
                      firstLoad.current = true;
                      setTelecomSession({
                        tableName: selected.tableName,
                        fileName: selected.name,
                        reportDate: getDatasetReportDate(selected),
                      });
                      analytics.setRefreshKey((key) => key + 1);
                    }
                  }}
                />
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                {dashboardFileName && (
                  <span className="font-mono text-muted-foreground truncate max-w-48">
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
                    <span className="text-teal-700 dark:text-teal-300 font-semibold">
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
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!usingCentralUpload && cachedBadge && (
              <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/25 dark:text-amber-300 rounded-lg text-[10px] font-medium">
                <HardDrive className="w-3 h-3" /> Cache · Actualisation…
              </span>
            )}

            {dashboardLoaded && kpi && (
              <button
                type="button"
                onClick={handlePersistAnalytics}
                disabled={persistingSnapshot}
                className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 dark:bg-teal-500/10 dark:hover:bg-teal-500/20 dark:border-teal-500/20 dark:text-teal-300 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Database className="w-3.5 h-3.5" />
                {persistingSnapshot ? "Sauvegarde…" : "Persister"}
              </button>
            )}

            {mounted &&
              typeof Notification !== "undefined" &&
              Notification.permission === "default" && (
                <button
                  type="button"
                  onClick={() => Notification.requestPermission()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 dark:bg-teal-500/10 dark:hover:bg-teal-500/20 dark:border-teal-500/20 dark:text-teal-300 rounded-xl text-xs font-medium transition-colors"
                >
                  <Activity className="w-3.5 h-3.5" /> Notifications
                </button>
              )}

            {installPrompt && (
              <button
                type="button"
                onClick={() => {
                  (installPrompt as BeforeInstallPromptEvent).prompt?.();
                  setInstallPrompt(null);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-700 dark:bg-teal-600/15 dark:hover:bg-teal-600/25 dark:border-teal-500/25 dark:text-teal-300 rounded-xl text-xs font-medium transition-colors"
              >
                <HardDrive className="w-3.5 h-3.5" /> Installer
              </button>
            )}

            <button
              type="button"
              onClick={goToTelecomUpload}
              disabled={!access.permissions.canUpload}
              className="flex items-center gap-1.5 px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white border-transparent rounded-xl text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              Importer
            </button>

            {dashboardLoaded && (
              <>
                <button
                  type="button"
                  onClick={() => setShowMapper(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-accent border border-border text-muted-foreground rounded-xl text-xs font-medium transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Colonnes
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
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {restoringCentralTable && (
          <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-xs text-teal-700 dark:text-teal-300">
            Restauration de la table DuckDB locale…
          </div>
        )}

        {centralRestoreError && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            <div>{centralRestoreError}</div>

            <button
              type="button"
              onClick={goToTelecomUpload}
              className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
            >
              Recharger depuis Upload
            </button>
          </div>
        )}

        {!dashboardLoaded && !sharedOverviewMode && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600/10 text-teal-700 dark:text-teal-300">
                <Upload className="h-5 w-5" />
              </div>

              <h2 className="text-sm font-bold text-foreground">
                Aucun rapport télécom chargé
              </h2>

              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Les fichiers sont maintenant chargés depuis la page Upload
                centrale. Après import, le rapport sera disponible ici pour
                analyse.
              </p>

              <button
                type="button"
                onClick={goToTelecomUpload}
                disabled={!access.permissions.canUpload}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Ouvrir Upload
              </button>
            </div>

            {activeTelecomDataset && !centralTelecomTableLoaded && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300">
                Le dataset télécom existe dans le catalogue, mais sa table
                DuckDB n'est pas chargée dans cette session.
              </div>
            )}
          </div>
        )}

        {!usingCentralUpload && loaded && !kpi && (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-pulse" />
              <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />
              <div className="absolute inset-3 flex items-center justify-center">
                <Signal className="w-7 h-7 text-indigo-500 dark:text-indigo-400" />
              </div>
            </div>
            <div className="text-sm font-semibold text-muted-foreground">
              Chargement du fichier…
            </div>
            <div className="text-xs text-muted-foreground">
              Ingestion CSV dans DuckDB — {dashboardFileName}
            </div>
          </div>
        )}

        {(dashboardLoaded || sharedOverviewMode) &&
          (sharedOverviewMode || kpi) && (
            <>
              {sharedOverviewMode && remoteOverview && (
                <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/8 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-600 text-white">
                        <Radio className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">
                          Vue d&apos;ensemble partagée
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Analytics agrégées reçues de{" "}
                          <span className="font-semibold text-foreground">
                            {remoteOverview.presenterName}
                          </span>
                          . Aucun fichier source ni ligne brute n&apos;est
                          transféré sur cet appareil.
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {remoteOverview.fileName} · {remoteOverview.reportDate} ·{" "}
                      {new Date(remoteOverview.updatedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex min-h-0 gap-4">
                <section
                  id="telecom-report-panel"
                  aria-label="Contenu du rapport télécom"
                  className="min-w-0 flex-1"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                    >
                      {(activeTab === "overview" || sharedOverviewMode) && (
                        <OverviewTab
                          kpi={overviewKpi}
                          canals={overviewCanals}
                          hourly={overviewHourly}
                          statusData={overviewStatusData}
                          forecast={overviewForecast}
                          m={mapping}
                          selectedKpis={selectedKpis}
                          toggleKpi={toggleKpi}
                          selectedOverviewSections={selectedOverviewSections}
                          toggleOverviewSection={toggleOverviewSection}
                          fetchDailyTrend={
                            sharedOverviewMode
                              ? async () => []
                              : () => fetchDailyTrend(mapping)
                          }
                        />
                      )}

                      {activeTab === "canals" && (
                        <CanalTab getTableName={getTableName} />
                      )}

                      {activeTab === "analysis" && kpi && (
                        <AnalysisTab
                          operators={operators}
                          regions={regions}
                          hourly={hourly}
                          kpi={kpi}
                          m={mapping}
                          fetchOperators={fetchOperators}
                          fetchRegions={fetchRegions}
                          fetchOperatorsForGroup={fetchOperatorsForGroup}
                          fetchDestinationsForGroup={fetchDestinationsForGroup}
                          fetchRegionsForGroup={fetchRegionsForGroup}
                          fetchCanalHourlyMatrix={fetchCanalHourlyMatrix}
                        />
                      )}

                      {activeTab === "analysis" && !kpi && (
                        <LoadingPanel label="Chargement de l'analyse…" />
                      )}

                      {activeTab === "grid" && (
                        <RawDataTab
                          m={mapping}
                          operators={operators}
                          regions={regions}
                          statusMapping={statusMapping}
                          tableName={dashboardTableName}
                          fetchFiltered={fetchFiltered}
                          fetchCustomerProfile={fetchCustomerProfile}
                        />
                      )}

                      {activeTab === "period" && (
                        <PeriodStudioTab
                          table={dashboardTableName}
                          mapping={mapping}
                        />
                      )}

                      {activeTab === "day" && (
                        <DayAnalyticsTab
                          table={dashboardTableName}
                          mapping={mapping}
                          fileName={dashboardFileName}
                          loadedFiles={loadedFiles}
                        />
                      )}

                      {activeTab === "history" && (
                        <AnalyticsHistoryTab
                          entries={analyticsHistory}
                          onRefresh={refreshAnalyticsHistory}
                          onLoad={loadAnalyticsFromHistory}
                          onExportDatabase={exportActiveDatabase}
                        />
                      )}

                      {activeTab === "config" && kpi && (
                        <div className="space-y-4">
                          <UserManagementPanel
                            currentRole={telecomRole}
                            onRoleChange={(role) =>
                              access.setRole(
                                role === "admin" ? "owner" : "viewer",
                              )
                            }
                          />
                          <LanCollabPanel />
                          <ConfigTab
                            kpi={kpi}
                            canals={canals}
                            hourly={hourly}
                            statusData={statusData}
                            m={mapping}
                            rawStatuses={rawStatuses}
                            statusMapping={statusMapping}
                            onStatusMappingChange={(m) => {
                              setStatusMapping(m);
                              analytics.setRefreshKey((k) => k + 1);
                            }}
                            reportDate={dashboardReportDate}
                            tableName={dashboardTableName}
                            fetchServiceCodeRows={fetchServiceCodeRows}
                            runCustomKPIExpr={runCustomKPIExpr}
                          />
                        </div>
                      )}

                      {activeTab === "config" && !kpi && (
                        <LoadingPanel label="Chargement de la configuration…" />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </section>
              </div>
            </>
          )}

        {!usingCentralUpload && loadError && loaded && (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-none mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
                  Erreur d&apos;analyse
                </div>
                <div className="text-xs text-red-600/80 dark:text-red-400/80 font-mono break-all">
                  {loadError}
                </div>
                <button
                  type="button"
                  onClick={() => setShowMapper(true)}
                  className="mt-3 text-xs text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200 underline underline-offset-2"
                >
                  Ouvrir le mappage des colonnes →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Column mapper modal */}
      <AnimatePresence>
        {showMapper && (
          <ColumnMapper
            mapping={mapping}
            columns={dashboardCsvCols}
            onChange={(m) => {
              setMapping(m);
              analytics.setRefreshKey((k) => k + 1);
              import("@/platform/collab/collab").then(
                ({ sharedMapping: yMapping, ydoc }) => {
                  ydoc.transact(() => {
                    for (const [k, v] of Object.entries(m)) {
                      yMapping.set(k, v as string);
                    }
                  });
                },
              );
            }}
            onClose={() => setShowMapper(false)}
            defaultMapping={DEFAULT_MAPPING}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TelecomDatasetPicker({
  datasets,
  activeDatasetId,
  loadedTableNames,
  onSelect,
  onUpload,
}: {
  datasets: Array<{
    id: string;
    name: string;
    tableName: string;
    rowCount: number;
  }>;
  activeDatasetId: string | null;
  loadedTableNames: string[];
  onSelect: (id: string) => void;
  onUpload: () => void;
}) {
  if (datasets.length === 0) {
    return (
      <button
        type="button"
        onClick={onUpload}
        className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800"
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
        {datasets.map((dataset) => {
          const loaded = loadedTableNames.includes(dataset.tableName);

          return (
            <option key={dataset.id} value={dataset.id}>
              {dataset.name} · {dataset.rowCount.toLocaleString()} rows
              {loaded ? "" : " · reload required"}
            </option>
          );
        })}
      </select>
    </div>
  );
}
