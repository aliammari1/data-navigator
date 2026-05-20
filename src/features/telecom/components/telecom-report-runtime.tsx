"use client";
import {
  Activity,  Database,  HardDrive,  Radio,  Settings2,  Signal,  Upload,} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  createContext,  useCallback,  useContext,  useEffect,  useMemo,  useRef,  useState,} from "react";
import { toast } from "sonner";
import BlurText from "@/components/BlurText";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useTelecomSessionStore } from "@/core/stores/app-session-store";
import { useDatasets, useActiveDataset, useSetActiveDataset } from "@/core/queries/datasets";
import { useDataStore } from "@/core/stores/data-store";
import { KPI_FIELDS } from "@/features/telecom/constants";
import { useSharedOverview } from "@/features/telecom/hooks/use-shared-overview";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { useTelecomUI } from "@/features/telecom/hooks/use-telecom-ui";
import {
  type CachedAnalyticsMeta,  getCachedAnalyticsEntries,  getCachedAnalyticsForKey,} from "@/features/telecom/lib/analytics-cache";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import {
  fetchCanalHourlyMatrix as _fetchCanalHourlyMatrix,  fetchCustomerProfile as _fetchCustomerProfile,  fetchDailyTrend as _fetchDailyTrend,  fetchDestinationsForGroup as _fetchDestinationsForGroup,  fetchFiltered as _fetchFiltered,  fetchOperators as _fetchOperators,  fetchOperatorsForGroup as _fetchOperatorsForGroup,  fetchRegions as _fetchRegions,  fetchRegionsForGroup as _fetchRegionsForGroup,  fetchServiceCodeRows as _fetchServiceCodeRows,  runCustomKPIExpr as _runCustomKPIExpr,} from "@/features/telecom/lib/queries";
import {
  getDatasetReportDate,  isTelecomDataset,} from "@/features/telecom/lib/telecom-dataset";
import { DEFAULT_MAPPING, useTelecomStore } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";
import { saveAnalyticsSnapshot } from "@/platform/storage/app-db";
import { ColumnMapper } from "./column-mapper";
import { ExportPanel } from "./export-panel";
const DEFAULT_OVERVIEW_EXPORT_SECTIONS: Types.OverviewExportSectionKey[] = [  "assistant",  "revenueGroups",  "status",  "hourly",  "canalShare",  "canalAmount",  "successRate",  "canalTable",  "dailyTrend",];
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;}
export interface TelecomReportRuntimeValue {
  dashboardLoaded: boolean;
  sharedOverviewMode: boolean;
  dashboardFileName: string;
  dashboardReportDate: string;
  dashboardTableName: string;
  telecomRole: "admin" | "user";
  access: ReturnType<typeof useDashboardAccess>;
  mapping: Types.ColumnMapping;
  setMapping: React.Dispatch<React.SetStateAction<Types.ColumnMapping>>;
  statusMapping: Types.StatusMapping[];
  setStatusMapping: React.Dispatch<React.SetStateAction<Types.StatusMapping[]>>;
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  rawStatuses: Types.RawStatusRow[];
  forecast: ForecastPoint[];
  overviewKpi: Types.KPISummary | null;
  overviewCanals: Types.CanalSummary[];
  overviewHourly: Types.HourlyRow[];
  overviewStatusData: Types.StatusRow[];
  overviewForecast: ForecastPoint[];
  analyticsHistory: CachedAnalyticsMeta[];
  selectedKpis: Set<keyof Types.KPISummary>;
  toggleKpi: (key: keyof Types.KPISummary) => void;
  selectedOverviewSections: Set<Types.OverviewExportSectionKey>;
  toggleOverviewSection: (key: Types.OverviewExportSectionKey) => void;
  getTableName: () => string;
  fetchOperators: (m: Types.ColumnMapping) => Promise<Types.OperatorRow[]>;
  fetchRegions: (m: Types.ColumnMapping) => Promise<Types.RegionRow[]>;
  fetchOperatorsForGroup: (    m: Types.ColumnMapping,    groupKeys: Types.CanalKey[],  ) => Promise<Types.OperatorRow[]>;
  fetchRegionsForGroup: (    m: Types.ColumnMapping,    groupKeys: Types.CanalKey[],  ) => Promise<Types.RegionRow[]>;
  fetchDestinationsForGroup: (    m: Types.ColumnMapping,    groupKeys: Types.CanalKey[],  ) => Promise<Types.OperatorRow[]>;
  fetchCanalHourlyMatrix: (    m: Types.ColumnMapping,  ) => Promise<Types.CanalHourCell[]>;
  fetchDailyTrend: (m: Types.ColumnMapping) => Promise<Types.DailyTrendRow[]>;
  fetchFiltered: (    m: Types.ColumnMapping,    f: Types.FilterState,    sm: Types.StatusMapping[],    limit: number,    offset: number,    sortCol: string,    sortDir: Types.SortDir,  ) => Promise<{ rows: Types.RawRow[]; total: number }>;
  fetchCustomerProfile: (    m: Types.ColumnMapping,    msisdn: string,  ) => Promise<Types.CustomerProfileData | null>;
  fetchServiceCodeRows: (    m: Types.ColumnMapping,  ) => Promise<Types.ServiceCodeRow[]>;
  runCustomKPIExpr: (sqlExpr: string) => Promise<number>;
  refreshAnalyticsHistory: () => Promise<void>;
  loadAnalyticsFromHistory: (key: string) => Promise<void>;
  exportActiveDatabase: () => Promise<void>;}
const TelecomReportRuntimeContext =  createContext<TelecomReportRuntimeValue | null>(null);
export function useTelecomReportRuntime() {
  const value = useContext(TelecomReportRuntimeContext);
  if (!value) {
    throw new Error(      "useTelecomReportRuntime must be used inside TelecomReportRuntimeProvider",    );
  }
  return value;}
export function TelecomReportRuntimeProvider({
  children,}: {
  children: React.ReactNode;}) {
  const router = useRouter();
  const access = useDashboardAccess();
  const firstLoad = useRef(true);
  const fileNameRef = useRef("");
  const bridgedDatasetIdRef = useRef<string | null>(null);
  const { data: datasets = [] } = useDatasets();
  const { data: activeDataset } = useActiveDataset();
  const activeDatasetId = activeDataset?.id ?? null;
  const setActiveDatasetMutation = useSetActiveDataset();
  const loadedTableNames = useDataStore((state) => state.loadedTableNames);
  const markTableLoaded = useDataStore((state) => state.markTableLoaded);
  const persistedTableName = useTelecomSessionStore((state) => state.tableName);
  const setTelecomSession = useTelecomSessionStore((state) => state.setSession);
  const setAppContext = useAppContextStore((state) => state.setContext);
  const addActivity = useActivityStore((state) => state.addEvent);
  const [analyticsHistory, setAnalyticsHistory] = useState<    CachedAnalyticsMeta[]  >([]);
  const telecomRole = access.role === "owner" ? "admin" : "user";
  const {
    mounted,    showMapper,    setShowMapper,    installPrompt,    setInstallPrompt,    mapping,    setMapping,    statusMapping,    setStatusMapping,  } = useTelecomUI({
    defaultMapping: DEFAULT_MAPPING,    fileNameRef,  });
  const telecomDatasets = useMemo(    () =>      datasets        .filter(isTelecomDataset)        .sort(          (a, b) =>            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),        ),    [datasets],  );
  const activeTelecomDataset = useMemo(() => {
    const active = datasets.find((dataset) => dataset.id === activeDatasetId);
    if (active && isTelecomDataset(active)) return active;
    return telecomDatasets[0] ?? null;
  }, [datasets, activeDatasetId, telecomDatasets]);
  const centralTelecomTableLoaded = Boolean(    activeTelecomDataset &&      loadedTableNames.includes(activeTelecomDataset.tableName),  );
  const usingCentralUpload = Boolean(activeTelecomDataset);
  const dashboardLoaded = centralTelecomTableLoaded;
  const dashboardFileName = activeTelecomDataset?.name ?? "";
  const dashboardReportDate = getDatasetReportDate(activeTelecomDataset);
  const dashboardTableName = usingCentralUpload    ? (activeTelecomDataset?.tableName ?? TELECOM_TABLE_BASE)    : persistedTableName || TELECOM_TABLE_BASE;
  const tableNameRef = useRef(dashboardTableName);
  useEffect(() => {
    tableNameRef.current = dashboardTableName;
  }, [dashboardTableName]);
  const getTableName = useCallback(() => tableNameRef.current, []);
  const fetchOperators = useCallback(    (m: Types.ColumnMapping, sm = []) =>      _fetchOperators(tableNameRef.current, m, sm as Types.StatusMapping[]),    [],  );
  const fetchRegions = useCallback(    (m: Types.ColumnMapping, sm = []) =>      _fetchRegions(tableNameRef.current, m, sm as Types.StatusMapping[]),    [],  );
  const fetchOperatorsForGroup = useCallback(    (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>      _fetchOperatorsForGroup(tableNameRef.current, m, groupKeys),    [],  );
  const fetchRegionsForGroup = useCallback(    (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>      _fetchRegionsForGroup(tableNameRef.current, m, groupKeys),    [],  );
  const fetchDestinationsForGroup = useCallback(    (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>      _fetchDestinationsForGroup(tableNameRef.current, m, groupKeys),    [],  );
  const fetchCanalHourlyMatrix = useCallback(    (m: Types.ColumnMapping) =>      _fetchCanalHourlyMatrix(tableNameRef.current, m),    [],  );
  const fetchDailyTrend = useCallback(    (m: Types.ColumnMapping) => _fetchDailyTrend(tableNameRef.current, m),    [],  );
  const fetchCustomerProfile = useCallback(    (m: Types.ColumnMapping, msisdn: string) =>      _fetchCustomerProfile(tableNameRef.current, m, msisdn),    [],  );
  const fetchFiltered = useCallback(    (      m: Types.ColumnMapping,      f: Types.FilterState,      sm: Types.StatusMapping[],      limit: number,      offset: number,      sortCol: string,      sortDir: Types.SortDir,    ) =>      _fetchFiltered(        tableNameRef.current,        m,        f,        sm,        limit,        offset,        sortCol,        sortDir,      ),    [],  );
  const fetchServiceCodeRows = useCallback(    (m: Types.ColumnMapping) => _fetchServiceCodeRows(tableNameRef.current, m),    [],  );
  const runCustomKPIExpr = useCallback(    (sqlExpr: string) => _runCustomKPIExpr(tableNameRef.current, sqlExpr),    [],  );
  const dashboardCsvCols =    activeTelecomDataset?.columns.map((column) => column.name) ?? [];
  const analytics = useTelecomAnalytics({
    getTableName,    mapping,    loaded: dashboardLoaded,    statusMapping,    firstLoad,    fileNameRef,    onStatusMappingAdditions: (additions) => {
      setStatusMapping((prev) => [...prev, ...additions]);
    },  });
// Bridge selected Upload dataset into the telecom session context.
useEffect(() => {
    if (!activeTelecomDataset) return;
    if (!loadedTableNames.includes(activeTelecomDataset.tableName)) return;
    const alreadyBridged =      bridgedDatasetIdRef.current === activeTelecomDataset.id &&      tableNameRef.current === activeTelecomDataset.tableName;
    if (alreadyBridged) return;
    fileNameRef.current = activeTelecomDataset.name;
    firstLoad.current = true;
    bridgedDatasetIdRef.current = activeTelecomDataset.id;
    setTelecomSession({
      tableName: activeTelecomDataset.tableName,      fileName: activeTelecomDataset.name,      reportDate: getDatasetReportDate(activeTelecomDataset),    });
  }, [activeTelecomDataset, loadedTableNames, setTelecomSession]);
// Analytics sourced exclusively from Zustand (via useTelecomAnalytics)
  const kpi = analytics.kpi;
  const canals = analytics.canals;
  const hourly = analytics.hourly;
  const statusData = analytics.statusData;
  const operators = analytics.operators;
  const regions = analytics.regions;
  const [persistingSnapshot, setPersistingSnapshot] = useState(false);
  const handlePersistAnalytics = useCallback(async () => {
    if (!kpi || !dashboardFileName) return;
    setPersistingSnapshot(true);
    try {
      await saveAnalyticsSnapshot({
        label: dashboardFileName,        fileName: dashboardFileName,        tableName: dashboardTableName,        kpi,        canals,        hourly,        statusData,        operators,        regions,        rawStatuses: analytics.rawStatuses ?? [],        totalTransactions: kpi.totalTransactions,        successRate: kpi.successRate,      });
      import("sonner").then(({ toast }) =>        toast("Analytics sauvegardés", { description: dashboardFileName }),      );
    } catch {
      toast.error("Échec de la sauvegarde");
    } finally {
      setPersistingSnapshot(false);
    }
  }, [    kpi,    dashboardFileName,    dashboardTableName,    canals,    hourly,    statusData,    operators,    regions,    analytics.rawStatuses,  ]);
  const [selectedKpis, setSelectedKpis] = useState<Set<keyof Types.KPISummary>>(    () => new Set(KPI_FIELDS.map((f) => f.key)),  );
  const toggleKpi = useCallback((key: keyof Types.KPISummary) => {
    setSelectedKpis((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const [selectedOverviewSections, setSelectedOverviewSections] = useState<    Set<Types.OverviewExportSectionKey>  >(() => new Set(DEFAULT_OVERVIEW_EXPORT_SECTIONS));
  const toggleOverviewSection = useCallback(    (key: Types.OverviewExportSectionKey) => {
      setSelectedOverviewSections((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },    [],  );
  useEffect(() => {
    fileNameRef.current = dashboardFileName;
  }, [dashboardFileName]);
  useEffect(() => {
    setTelecomSession({
      tableName: dashboardTableName,      fileName: dashboardFileName,      reportDate: dashboardReportDate,    });
    useTelecomStore.getState().setFileName(dashboardFileName);
    useTelecomStore.getState().setReportDate(dashboardReportDate);
    setAppContext({
      activeDomain: "telecom",      activeDatasetId: activeTelecomDataset?.id ?? activeDatasetId ?? null,      activeTableName: dashboardTableName,    });
  }, [    dashboardTableName,    dashboardFileName,    dashboardReportDate,    activeDatasetId,    activeTelecomDataset?.id,    setAppContext,    setTelecomSession,  ]);
  const { forecast, rawStatuses } = analytics;
  const { remoteOverview } = useSharedOverview({
    enabled: Boolean(dashboardLoaded && kpi),    fileName: dashboardFileName,    reportDate: dashboardReportDate,    kpi,    canals,    hourly,    statusData,    forecast,  });
  const sharedOverviewMode = !dashboardLoaded && Boolean(remoteOverview);
  const overviewKpi = sharedOverviewMode ? (remoteOverview?.kpi ?? null) : kpi;
  const overviewCanals = sharedOverviewMode    ? (remoteOverview?.canals ?? [])    : canals;
  const overviewHourly = sharedOverviewMode    ? (remoteOverview?.hourly ?? [])    : hourly;
  const overviewStatusData = sharedOverviewMode    ? (remoteOverview?.statusData ?? [])    : statusData;
  const overviewForecast = sharedOverviewMode    ? (remoteOverview?.forecast ?? [])    : forecast;
  const refreshAnalyticsHistory = useCallback(async () => {
    setAnalyticsHistory(await getCachedAnalyticsEntries());
  }, []);
  async function loadAnalyticsFromHistory(key: string) {
    const cached = await getCachedAnalyticsForKey(key);
    if (!cached) return;
    analytics.setKpi(cached.kpi as Types.KPISummary);
    analytics.setCanals(cached.canals as Types.CanalSummary[]);
    analytics.setHourly(cached.hourly as Types.HourlyRow[]);
    analytics.setStatusData(cached.statusData as Types.StatusRow[]);
    analytics.setOperators(cached.operators as Types.OperatorRow[]);
    analytics.setRegions(cached.regions as Types.RegionRow[]);
    addActivity({
      type: "dataset_selected",      message: `Loaded cached telecom analytics for ${cached.fileName}`,      tableName: dashboardTableName,    });
  }
  async function exportActiveDatabase() {
    if (!access.permissions.canExport) return;
    const { exportTableSnapshotFile } = await import(      "@/platform/duckdb/duckdb-fs"    );
    await exportTableSnapshotFile(dashboardTableName || TELECOM_TABLE_BASE);
  }
  function goToTelecomUpload() {
    addActivity({
      type: "telecom_opened",      message: "Opened telecom upload flow",      tableName: dashboardTableName,    });
    router.push("/dashboard/upload?context=telecom");
  }
  const runtimeValue: TelecomReportRuntimeValue = {
    dashboardLoaded,    sharedOverviewMode,    dashboardFileName,    dashboardReportDate,    dashboardTableName,    telecomRole,    access,    mapping,    setMapping,    statusMapping,    setStatusMapping,    kpi,    canals,    hourly,    statusData,    operators,    regions,    rawStatuses,    forecast,    overviewKpi,    overviewCanals,    overviewHourly,    overviewStatusData,    overviewForecast,    analyticsHistory,    selectedKpis,    toggleKpi,    selectedOverviewSections,    toggleOverviewSection,    getTableName,    fetchOperators,    fetchRegions,    fetchOperatorsForGroup,    fetchRegionsForGroup,    fetchDestinationsForGroup,    fetchCanalHourlyMatrix,    fetchDailyTrend,    fetchFiltered,    fetchCustomerProfile,    fetchServiceCodeRows,    runCustomKPIExpr,    refreshAnalyticsHistory,    loadAnalyticsFromHistory,    exportActiveDatabase,  };
  return (    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">      <AnimatedGridPattern        numSquares={28}
        maxOpacity={0.2}
        duration={5}
        repeatDelay={1}
        className="[mask-image:radial-gradient(900px_circle_at_center,white,transparent)] opacity-35"      />      {/* Sticky header */}
      <div className="flex-none sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border px-6 py-3">        <div className="flex items-center justify-between flex-wrap gap-3">          <div className="flex items-center gap-3 min-w-0">            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-teal-700 to-emerald-600 flex items-center justify-center flex-none">              <Signal className="w-5 h-5 text-white" />            </div>            <div className="min-w-0">              <BlurText                text="Rapport Journalier des Transactions Télécom"                animateBy="letters"                delay={18}
                stepDuration={0.24}
                className="text-sm font-bold text-foreground leading-tight truncate"              />              <div className="mt-1">                <TelecomDatasetPicker                  datasets={telecomDatasets}
                  activeDatasetId={activeTelecomDataset?.id ?? null}
                  loadedTableNames={loadedTableNames}
                  onUpload={goToTelecomUpload}
                  onSelect={(id) => {
                    setActiveDatasetMutation.mutate(id);
                    const selected = telecomDatasets.find(                      (dataset) => dataset.id === id,                    );
                    if (!selected) return;
                    if (loadedTableNames.includes(selected.tableName)) {
                      fileNameRef.current = selected.name;
                      firstLoad.current = true;
                      setTelecomSession({
                        tableName: selected.tableName,                        fileName: selected.name,                        reportDate: getDatasetReportDate(selected),                      });
                    }
                  }}
                />              </div>              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">                {dashboardFileName && (                  <span className="font-mono text-muted-foreground truncate max-w-48">                    {dashboardFileName}
                  </span>                )}
                {dashboardReportDate && (                  <>                    <span>·</span>                    <span>{dashboardReportDate}</span>                  </>                )}
                {kpi && (                  <>                    <span>·</span>                    <span className="text-teal-700 dark:text-teal-300 font-semibold">                      {fmtN(kpi.totalTransactions)} tx                    </span>                  </>                )}
                {kpi && (                  <>                    <span>·</span>                    <span                      className={
                        kpi.successRate >= 90                          ? "text-emerald-600 dark:text-emerald-400"                          : "text-amber-600 dark:text-amber-400"                      }
                    >                      {fmtPct(kpi.successRate)} réussite                    </span>                  </>                )}
              </div>            </div>          </div>          <div className="flex items-center gap-2 flex-wrap">            {dashboardLoaded && kpi && (              <button                type="button"                onClick={handlePersistAnalytics}
                disabled={persistingSnapshot}
                className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 dark:bg-teal-500/10 dark:hover:bg-teal-500/20 dark:border-teal-500/20 dark:text-teal-300 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"              >                <Database className="w-3.5 h-3.5" />                {persistingSnapshot ? "Sauvegarde…" : "Persister"}
              </button>            )}
            {mounted &&              typeof Notification !== "undefined" &&              Notification.permission === "default" && (                <button                  type="button"                  onClick={() => Notification.requestPermission()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 dark:bg-teal-500/10 dark:hover:bg-teal-500/20 dark:border-teal-500/20 dark:text-teal-300 rounded-xl text-xs font-medium transition-colors"                >                  <Activity className="w-3.5 h-3.5" /> Notifications                </button>              )}
            {installPrompt && (              <button                type="button"                onClick={() => {
                  (installPrompt as BeforeInstallPromptEvent).prompt?.();
                  setInstallPrompt(null);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-700 dark:bg-teal-600/15 dark:hover:bg-teal-600/25 dark:border-teal-500/25 dark:text-teal-300 rounded-xl text-xs font-medium transition-colors"              >                <HardDrive className="w-3.5 h-3.5" /> Installer              </button>            )}
            <button              type="button"              onClick={goToTelecomUpload}
              disabled={!access.permissions.canUpload}
              className="flex items-center gap-1.5 px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white border-transparent rounded-xl text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"            >              <Upload className="w-3.5 h-3.5" />              Importer            </button>            {dashboardLoaded && (              <>                <button                  type="button"                  onClick={() => setShowMapper(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-accent border border-border text-muted-foreground rounded-xl text-xs font-medium transition-colors"                >                  <Settings2 className="w-3.5 h-3.5" /> Colonnes                </button>                <ExportPanel                  kpi={kpi}
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
                />              </>            )}
          </div>        </div>      </div>      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">        {!dashboardLoaded && !sharedOverviewMode && (          <div className="space-y-5">            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600/10 text-teal-700 dark:text-teal-300">                <Upload className="h-5 w-5" />              </div>              <h2 className="text-sm font-bold text-foreground">                Aucun rapport télécom chargé              </h2>              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">                Les fichiers sont maintenant chargés depuis la page Upload                centrale. Après import, le rapport sera disponible ici pour                analyse.              </p>              <button                type="button"                onClick={goToTelecomUpload}
                disabled={!access.permissions.canUpload}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"              >                <Upload className="h-4 w-4" />                Ouvrir Upload              </button>            </div>            {activeTelecomDataset && !centralTelecomTableLoaded && (              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300">                Le dataset télécom existe dans le catalogue, mais sa table                DuckDB n'est pas chargée dans cette session.              </div>            )}
          </div>        )}
        {(dashboardLoaded || sharedOverviewMode) && (          <TelecomReportRuntimeContext.Provider value={runtimeValue}>            {sharedOverviewMode && remoteOverview && (              <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/8 p-4">                <div className="flex flex-wrap items-center justify-between gap-3">                  <div className="flex items-start gap-3">                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-600 text-white">                      <Radio className="h-4 w-4" />                    </div>                    <div>                      <div className="text-sm font-bold text-foreground">                        Vue d&apos;
ensemble partagée                      </div>                      <div className="text-xs text-muted-foreground">                        Analytics agrégées reçues de{" "}
                        <span className="font-semibold text-foreground">                          {remoteOverview.presenterName}
                        </span>                        . Aucun fichier source ni ligne brute n&apos;
est                        transféré sur cet appareil.                      </div>                    </div>                  </div>                  <div className="text-[11px] text-muted-foreground tabular-nums">                    {remoteOverview.fileName} · {remoteOverview.reportDate} ·{" "}
                    {new Date(remoteOverview.updatedAt).toLocaleTimeString()}
                  </div>                </div>              </div>            )}
            <div className="flex min-h-0 gap-4">              <section                id="telecom-report-panel"                aria-label="Contenu du rapport télécom"                className="min-w-0 flex-1"              >                <AnimatePresence mode="wait">                  <motion.div                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                  >                    {children}
                  </motion.div>                </AnimatePresence>              </section>            </div>          </TelecomReportRuntimeContext.Provider>        )}
      </div>      {/* Column mapper modal */}
      <AnimatePresence>        {showMapper && (          <ColumnMapper            mapping={mapping}
            columns={dashboardCsvCols}
            onChange={(m) => {
              setMapping(m);
              import("@/platform/collab/collab").then(                ({ sharedMapping: yMapping, ydoc }) => {
                  ydoc.transact(() => {
                    for (const [k, v] of Object.entries(m)) {
                      yMapping.set(k, v as string);
                    }
                  });
                },              );
            }}
            onClose={() => setShowMapper(false)}
            defaultMapping={DEFAULT_MAPPING}
          />        )}
      </AnimatePresence>    </div>  );}
export function TelecomLoadingPanel({ label }: { label: string }) {
  return (    <div className="flex flex-col items-center justify-center py-20 gap-3">      <div className="relative w-12 h-12">        <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />      </div>      <span className="text-xs text-muted-foreground">{label}</span>    </div>  );}
function TelecomDatasetPicker({
  datasets,  activeDatasetId,  loadedTableNames,  onSelect,  onUpload,}: {
  datasets: Array<{
    id: string;
    name: string;
    tableName: string;
    rowCount: number;
  }>;
  activeDatasetId: string | null;
  loadedTableNames: string[];
  onSelect: (id: string) => void;
  onUpload: () => void;}) {
  if (datasets.length === 0) {
    return (      <button        type="button"        onClick={onUpload}
        className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800"      >        <Upload className="h-4 w-4" />        Charger un rapport      </button>    );
  }
  return (    <div className="flex items-center gap-2">      <Database className="h-4 w-4 text-muted-foreground" />      <select        value={activeDatasetId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        className="h-9 max-w-72 rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"      >        {datasets.map((dataset) => {
          const loaded = loadedTableNames.includes(dataset.tableName);
          return (            <option key={dataset.id} value={dataset.id}>              {dataset.name} · {dataset.rowCount.toLocaleString()} rows              {loaded ? "" : " · reload required"}
            </option>          );
        })}
      </select>    </div>  );}