"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  AlertCircle,
  FileText,
  HardDrive,
  Info,
  Layers,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Signal,
  Smartphone,
  Upload,
  Wifi,
  X,
} from "lucide-react";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import { KPI_FIELDS } from "@/features/telecom/constants";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";
import {
  fetchCanalHourlyMatrix as _fetchCanalHourlyMatrix,
  fetchCanalRows as _fetchCanalRows,
  fetchCustomerProfile as _fetchCustomerProfile,
  fetchDailyTrend as _fetchDailyTrend,
  fetchDestinationsForGroup as _fetchDestinationsForGroup,
  fetchFiltered as _fetchFiltered,
  fetchOperators as _fetchOperators,
  fetchOperatorsForGroup as _fetchOperatorsForGroup,
  fetchRegions as _fetchRegions,
  fetchRegionsForGroup as _fetchRegionsForGroup,
  fetchServiceCodeRows as _fetchServiceCodeRows,
  fetchSpecChannelStats as _fetchSpecChannelStats,
  runCustomKPIExpr as _runCustomKPIExpr,
  detectAvailableColumns as _detectAvailableColumns,
} from "@/features/telecom/lib/queries";
import { TELECOM_TABLE_BASE, telecomTableName } from "@/features/telecom/lib/names";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { useTelecomFileLoad } from "@/features/telecom/hooks/use-telecom-file-load";
import { useTelecomUI } from "@/features/telecom/hooks/use-telecom-ui";
import { AnalysisTab } from "./analysis-tab";
import { CanalTab } from "./canal-tab";
import { ColumnMapper } from "./column-mapper";
import { ConfigTab } from "./config-tab";
import { ExportPanel } from "./export-panel";
import { FileDropZone } from "./file-drop-zone";
import { GlobalSearch } from "./global-search";
import { OverviewTab } from "./overview-tab";
import { RawDataTab } from "./raw-data-tab";
import { TabBar } from "./tab-bar";

// Module-level mutable TABLE_NAME — updated when user switches active file.
// getTableName() always reads the latest value, avoiding stale closures in callbacks.
let TABLE_NAME = TELECOM_TABLE_BASE;
function getTableName() {
  return TABLE_NAME;
}

// TABLE_NAME-bound query wrappers
const detectAvailableColumns = () => _detectAvailableColumns(TABLE_NAME);
const fetchOperators = (m: Types.ColumnMapping, sm = []) =>
  _fetchOperators(TABLE_NAME, m, sm as Types.StatusMapping[]);
const fetchRegions = (m: Types.ColumnMapping, sm = []) =>
  _fetchRegions(TABLE_NAME, m, sm as Types.StatusMapping[]);
const fetchOperatorsForGroup = (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>
  _fetchOperatorsForGroup(TABLE_NAME, m, groupKeys);
const fetchRegionsForGroup = (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>
  _fetchRegionsForGroup(TABLE_NAME, m, groupKeys);
const fetchDestinationsForGroup = (m: Types.ColumnMapping, groupKeys: Types.CanalKey[]) =>
  _fetchDestinationsForGroup(TABLE_NAME, m, groupKeys);
const fetchCanalHourlyMatrix = (m: Types.ColumnMapping) =>
  _fetchCanalHourlyMatrix(TABLE_NAME, m);
const fetchDailyTrend = (m: Types.ColumnMapping) => _fetchDailyTrend(TABLE_NAME, m);
const fetchCustomerProfile = (m: Types.ColumnMapping, msisdn: string) =>
  _fetchCustomerProfile(TABLE_NAME, m, msisdn);
const fetchFiltered = (
  m: Types.ColumnMapping,
  f: Types.FilterState,
  sm: Types.StatusMapping[],
  limit: number,
  offset: number,
  sortCol: string,
  sortDir: Types.SortDir,
) => _fetchFiltered(TABLE_NAME, m, f, sm, limit, offset, sortCol, sortDir);
const fetchServiceCodeRows = (m: Types.ColumnMapping) =>
  _fetchServiceCodeRows(TABLE_NAME, m);
const runCustomKPIExpr = (sqlExpr: string) => _runCustomKPIExpr(TABLE_NAME, sqlExpr);

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function TelecomDashboard() {
  // ── Refs for inter-hook communication ──────────────────────────────────────
  const firstLoad = useRef(true);
  const fileNameRef = useRef("");

  // Local state bridging fileLoad → analytics (setComputing for cache-hit path)
  const [fileLoadComputing, setFileLoadComputing] = useState(false);

  // Pending analytics state from IDB cache hits (populated before analytics runs)
  const [cachedKpi, setCachedKpi] = useState<Types.KPISummary | null>(null);
  const [cachedCanals, setCachedCanals] = useState<Types.CanalSummary[]>([]);
  const [cachedHourly, setCachedHourly] = useState<Types.HourlyRow[]>([]);
  const [cachedStatusData, setCachedStatusData] = useState<Types.StatusRow[]>([]);
  const [cachedErrors, setCachedErrors] = useState<Types.ErrorRow[]>([]);
  const [cachedOperators, setCachedOperators] = useState<Types.OperatorRow[]>([]);
  const [cachedRegions, setCachedRegions] = useState<Types.RegionRow[]>([]);

  // ── UI hook (tabs, mapping, status mapping, install prompt, ⌘K, PWA) ───────
  const {
    mounted,
    activeTab,
    switchTab,
    showMapper,
    setShowMapper,
    commandOpen,
    setCommandOpen,
    installPrompt,
    setInstallPrompt,
    mapping,
    setMapping,
    statusMapping,
    setStatusMapping,
    statusMappingRef,
  } = useTelecomUI({
    defaultMapping: DEFAULT_MAPPING,
    storeHydrated: false,
    fileNameRef,
  });

  // ── File load hook (loads CSV/xlsx into DuckDB, caching, multi-file) ────────
  const fileLoad = useTelecomFileLoad({
    onTableNameChange: (name) => {
      TABLE_NAME = name;
    },
    detectAvailableColumns,
    setKpi: setCachedKpi,
    setCanals: setCachedCanals,
    setHourly: setCachedHourly,
    setStatusData: setCachedStatusData,
    setErrors: setCachedErrors,
    setOperators: setCachedOperators,
    setRegions: setCachedRegions,
    setComputing: setFileLoadComputing,
  });

  // ── Analytics hook (KPI, canals, hourly, errors, forecast, runAnalytics) ────
  const analytics = useTelecomAnalytics({
    getTableName,
    mapping,
    loaded: fileLoad.loaded,
    statusMappingRef,
    firstLoad,
    fileNameRef,
    onStatusMappingAdditions: (additions) => {
      setStatusMapping((prev) => [...prev, ...additions]);
    },
  });

  // Merge: prefer live analytics results, fall back to cached values during initial load
  const kpi = analytics.kpi ?? cachedKpi;
  const canals = analytics.canals.length > 0 ? analytics.canals : cachedCanals;
  const hourly = analytics.hourly.length > 0 ? analytics.hourly : cachedHourly;
  const statusData = analytics.statusData.length > 0 ? analytics.statusData : cachedStatusData;
  const errors = analytics.errors.length > 0 ? analytics.errors : cachedErrors;
  const operators = analytics.operators.length > 0 ? analytics.operators : cachedOperators;
  const regions = analytics.regions.length > 0 ? analytics.regions : cachedRegions;
  const computing = analytics.computing || fileLoadComputing;

  // ── selectedKpis for ExportPanel ────────────────────────────────────────────
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

  // ── Sync fileNameRef when fileName changes ───────────────────────────────────
  useEffect(() => {
    fileNameRef.current = fileLoad.fileName;
  }, [fileLoad.fileName]);

  // ── Multi-file switch: update TABLE_NAME when user picks a different file ────
  useEffect(() => {
    const f = fileLoad.loadedFiles.find((x) => x.id === fileLoad.activeFileIdx);
    if (!f) return;
    if (TABLE_NAME === f.table) return;
    TABLE_NAME = f.table;
    analytics.setRefreshKey((k) => k + 1);
  }, [fileLoad.activeFileIdx, fileLoad.loadedFiles, analytics]);

  // ── Re-run analytics when loaded/mapping/refreshKey change ──────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey triggers intentional re-run
  useEffect(() => {
    if (fileLoad.loaded) analytics.runAnalytics(mapping, statusMappingRef.current);
  }, [fileLoad.loaded, mapping, analytics.refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── IDB cache write: persist fresh analytics results ─────────────────────────
  useEffect(() => {
    const cacheKey = fileLoad.activeCacheKeyRef.current;
    if (analytics.kpi && cacheKey) {
      import("@/features/telecom/lib/analytics-cache").then(
        ({ setCachedAnalyticsForKey }) => {
          setCachedAnalyticsForKey(cacheKey, {
            fileName: fileNameRef.current,
            kpi: analytics.kpi as Types.KPISummary,
            canals: analytics.canals,
            hourly: analytics.hourly,
            statusData: analytics.statusData,
            errors: analytics.errors,
            operators: analytics.operators,
            regions: analytics.regions,
            rawStatuses: analytics.rawStatuses,
          }).catch(() => {});
        },
      );
    }
  }, [
    analytics.kpi,
    analytics.canals,
    analytics.hourly,
    analytics.statusData,
    analytics.errors,
    analytics.operators,
    analytics.regions,
    analytics.rawStatuses,
    fileLoad.activeCacheKeyRef,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
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
    handleFileLoad,
    activeCacheKeyRef,
  } = fileLoad;

  const { forecast, rawStatuses } = analytics;

  const tabCounts: Record<string, number> = {
    overview: kpi?.totalTransactions ?? 0,
    canals: canals.length,
    analysis: errors.length,
    grid: kpi?.totalTransactions ?? 0,
    config: 0,
  };

  function openFilePicker(onPick: (f: File) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.txt,.xlsx,.xls";
    input.onchange = (ev) => {
      const picked = (ev.target as HTMLInputElement).files?.[0];
      if (picked) onPick(picked);
    };
    input.click();
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sticky header */}
      <div className="flex-none sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-none">
              <Signal className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground leading-tight truncate">
                Rapport Journalier des Transactions Télécom
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                {fileName && (
                  <span className="font-mono text-muted-foreground truncate max-w-48">
                    {fileName}
                  </span>
                )}
                {reportDate && (
                  <>
                    <span>·</span>
                    <span>{reportDate}</span>
                  </>
                )}
                {kpi && (
                  <>
                    <span>·</span>
                    <span className="text-indigo-700 dark:text-indigo-300 font-semibold">
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
            {cachedBadge && (
              <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/25 dark:text-amber-300 rounded-lg text-[10px] font-medium">
                <HardDrive className="w-3 h-3" /> Cache · Actualisation…
              </span>
            )}

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-accent border border-border text-muted-foreground rounded-xl text-xs font-medium transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rechercher</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1 py-0.5 bg-background border border-border rounded text-[10px] text-muted-foreground/70 font-mono">
                ⌘K
              </kbd>
            </button>

            {loaded && (
              <GlobalSearch
                canals={canals}
                operators={operators}
                errors={errors}
                onNavigate={switchTab}
              />
            )}

            {mounted && typeof Notification !== "undefined" && Notification.permission === "default" && (
              <button
                type="button"
                onClick={() => Notification.requestPermission()}
                className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 dark:border-violet-500/20 dark:text-violet-300 rounded-xl text-xs font-medium transition-colors"
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
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 dark:bg-indigo-600/15 dark:hover:bg-indigo-600/25 dark:border-indigo-500/25 dark:text-indigo-300 rounded-xl text-xs font-medium transition-colors"
              >
                <HardDrive className="w-3.5 h-3.5" /> Installer
              </button>
            )}

            {loaded && (
              <>
                {loadedFiles.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground flex-none" />
                    <select
                      value={activeFileIdx}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        const f = loadedFiles.find((x) => x.id === id);
                        if (!f) return;
                        activeCacheKeyRef.current = f.cacheKey;
                        setActiveFileIdx(id);
                      }}
                      className="h-8 px-2 pr-6 rounded-xl border border-border bg-muted text-xs text-foreground font-medium appearance-none cursor-pointer hover:bg-accent transition-colors focus:outline-none focus:ring-1 focus:ring-ring max-w-48 truncate"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                      }}
                    >
                      {loadedFiles.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title="Charger un autre fichier"
                      onClick={() => openFilePicker(handleFileLoad)}
                      className="flex items-center gap-1 px-2 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowMapper(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-accent border border-border text-muted-foreground rounded-xl text-xs font-medium transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Colonnes
                </button>
                <button
                  type="button"
                  onClick={() => analytics.setRefreshKey((k) => k + 1)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-accent border border-border text-muted-foreground rounded-xl text-xs font-medium transition-colors"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", computing && "animate-spin")} />{" "}
                  Actualiser
                </button>
                <ExportPanel
                  kpi={kpi}
                  canals={canals}
                  reportDate={reportDate}
                  fileName={fileName}
                  errors={errors}
                  hourly={hourly}
                  operators={operators}
                  regions={regions}
                  statusData={statusData}
                  selectedKpis={selectedKpis}
                />
              </>
            )}

            {!loaded && (
              <button
                type="button"
                onClick={() => openFilePicker(handleFileLoad)}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white border-transparent rounded-xl text-xs font-medium transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Charger un fichier
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Upload state */}
        {!loaded && (
          <div className="space-y-5">
            <FileDropZone onLoad={handleFileLoad} />
            {loadError && (
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/25 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-none mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-0.5">
                    Erreur de chargement du fichier
                  </div>
                  <div className="text-xs text-red-600/80 dark:text-red-400/80 font-mono">
                    {loadError}
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-muted/30 p-6">
              <div className="flex items-center gap-2 mb-5">
                <Info className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <span className="text-sm font-bold text-foreground">
                  Format de Fichier Attendu & Classification des Canaux
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {[
                  {
                    title: "Paiement de Factures",
                    desc: "CANAL ∈ {BILLPAYMENT, BP, …} OR SERVICE_CODE LIKE 'BP%'",
                    color: "text-blue-600 dark:text-blue-400",
                    border: "border-blue-500/20 bg-blue-500/5",
                    icon: FileText,
                  },
                  {
                    title: "Voix Lignes Fixes",
                    desc: "TRANSACTION_TYPE ∈ {TTCASH, VOUCHER} AND SUBSCRIBER_TYPE ∈ {FIXED, FIXE}",
                    color: "text-emerald-600 dark:text-emerald-400",
                    border: "border-emerald-500/20 bg-emerald-500/5",
                    icon: Phone,
                  },
                  {
                    title: "Voix Lignes Mobiles",
                    desc: "TRANSACTION_TYPE ∈ {TTCASH, VOUCHER} AND SUBSCRIBER_TYPE ∈ {MOBILE, GSM}",
                    color: "text-violet-600 dark:text-violet-400",
                    border: "border-violet-500/20 bg-violet-500/5",
                    icon: Smartphone,
                  },
                  {
                    title: "DATA Internet",
                    desc: "CANAL ∈ {SABBA, EVOUCHER} OR TRANSACTION_TYPE ∈ {SABBA, EVOUCHER}",
                    color: "text-amber-600 dark:text-amber-400",
                    border: "border-amber-500/20 bg-amber-500/5",
                    icon: Wifi,
                  },
                ].map((g) => (
                  <div key={g.title} className={cn("rounded-xl border p-3.5", g.border)}>
                    <div className={cn("flex items-center gap-2 mb-2 font-semibold text-xs", g.color)}>
                      <g.icon className="w-3.5 h-3.5" /> {g.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed">{g.desc}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-background border border-border p-3.5">
                <div className="text-[10px] text-muted-foreground mb-2 font-semibold uppercase tracking-wide">
                  Exemple de ligne (séparée par des pipes, 51 colonnes)
                </div>
                <code className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono break-all leading-relaxed">
                  TXN0001|2024-01-15|08:32:15|TTCASH|RECHARGE_MOB|Mobile Recharge|VOUCHER|MOBILE|21600001|5.000|TND|SUCCESS|||OPT_TUN|TUNIS|120|||5.000|0|…
                </code>
              </div>
            </div>
          </div>
        )}

        {/* CSV loading spinner */}
        {loaded && loadPhase === "csv" && !kpi && (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-pulse" />
              <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />
              <div className="absolute inset-3 flex items-center justify-center">
                <Signal className="w-7 h-7 text-indigo-500 dark:text-indigo-400" />
              </div>
            </div>
            <div className="text-sm font-semibold text-muted-foreground">Chargement du fichier…</div>
            <div className="text-xs text-muted-foreground">
              Ingestion CSV dans DuckDB — {fileName}
            </div>
          </div>
        )}

        {/* Progressive dashboard */}
        {loaded && (loadPhase !== "csv" || kpi) && (
          <>
            {computing && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="relative w-4 h-4">
                    <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Analyse en cours — les résultats apparaissent en temps réel…
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-indigo-500/60 rounded-full animate-pulse"
                    style={{ width: kpi ? "60%" : "20%" }}
                  />
                </div>
              </div>
            )}

            <TabBar active={activeTab} onChange={switchTab} counts={tabCounts} />

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {activeTab === "overview" && (
                  <OverviewTab
                    kpi={kpi}
                    canals={canals}
                    hourly={hourly}
                    statusData={statusData}
                    forecast={forecast}
                    m={mapping}
                    selectedKpis={selectedKpis}
                    toggleKpi={toggleKpi}
                    fetchDailyTrend={fetchDailyTrend}
                  />
                )}

                {activeTab === "canals" && <CanalTab getTableName={getTableName} />}

                {activeTab === "analysis" && kpi && (
                  <AnalysisTab
                    errors={errors}
                    operators={operators}
                    regions={regions}
                    hourly={hourly}
                    kpi={kpi}
                    canals={canals}
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
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Chargement de l&apos;analyse…
                    </span>
                  </div>
                )}

                {activeTab === "grid" && (
                  <div className="space-y-6">
                    <RawDataTab
                      m={mapping}
                      operators={operators}
                      regions={regions}
                      statusMapping={statusMapping}
                      tableName={activeTableName}
                      fetchFiltered={fetchFiltered}
                      fetchCustomerProfile={fetchCustomerProfile}
                    />
                  </div>
                )}

                {activeTab === "config" && kpi && (
                  <ConfigTab
                    kpi={kpi}
                    canals={canals}
                    hourly={hourly}
                    errors={errors}
                    statusData={statusData}
                    m={mapping}
                    rawStatuses={rawStatuses}
                    statusMapping={statusMapping}
                    onStatusMappingChange={(m) => {
                      setStatusMapping(m);
                      analytics.setRefreshKey((k) => k + 1);
                    }}
                    reportDate={reportDate}
                    tableName={activeTableName}
                    fetchServiceCodeRows={fetchServiceCodeRows}
                    runCustomKPIExpr={runCustomKPIExpr}
                  />
                )}
                {activeTab === "config" && !kpi && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Chargement de la configuration…
                    </span>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}

        {/* Error banner */}
        {loadError && loaded && !computing && (
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
            columns={csvCols}
            onChange={(m) => {
              setMapping(m);
              analytics.setRefreshKey((k) => k + 1);
              import("@/lib/collab").then(({ sharedMapping: yMapping, ydoc }) => {
                ydoc.transact(() => {
                  for (const [k, v] of Object.entries(m)) yMapping.set(k, v as string);
                });
              });
            }}
            onClose={() => setShowMapper(false)}
            defaultMapping={DEFAULT_MAPPING}
          />
        )}
      </AnimatePresence>

      {/* ⌘K Command Palette */}
      <Command.Dialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        label="Palette de commandes"
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm p-0 m-0 border-0 max-w-none max-h-none w-full h-full"
      >
        <div className="w-full max-w-lg mx-4 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
          <Command className="w-full">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground flex-none" />
              <Command.Input
                placeholder="Rechercher une action, canal, erreur…"
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setCommandOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                Aucun résultat
              </Command.Empty>
              <Command.Group
                heading="Navigation"
                className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider px-2 py-1.5"
              >
                {(["overview", "canals", "analysis", "grid", "config"] as Types.MainTab[]).map(
                  (tab) => (
                    <Command.Item
                      key={tab}
                      onSelect={() => {
                        switchTab(tab);
                        setCommandOpen(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-accent text-foreground data-[selected=true]:bg-accent"
                    >
                      <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                      {
                        {
                          overview: "Vue d'ensemble",
                          canals: "Analyse par Groupe",
                          analysis: "Analyse Approfondie",
                          grid: "Données Brutes",
                          config: "Config & IA",
                        }[tab] ?? tab
                      }
                    </Command.Item>
                  ),
                )}
              </Command.Group>
              <Command.Group
                heading="Actions"
                className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider px-2 py-1.5 mt-1"
              >
                <Command.Item
                  onSelect={() => {
                    analytics.setRefreshKey((k) => k + 1);
                    setCommandOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-accent text-foreground data-[selected=true]:bg-accent"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /> Relancer l&apos;analyse
                </Command.Item>
                <Command.Item
                  onSelect={() => {
                    setShowMapper(true);
                    setCommandOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-accent text-foreground data-[selected=true]:bg-accent"
                >
                  <Settings2 className="w-3.5 h-3.5 text-muted-foreground" /> Mapper les colonnes
                </Command.Item>
                <Command.Item
                  onSelect={() => {
                    openFilePicker(handleFileLoad);
                    setCommandOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-accent text-foreground data-[selected=true]:bg-accent"
                >
                  <Upload className="w-3.5 h-3.5 text-muted-foreground" /> Charger un nouveau fichier
                </Command.Item>
              </Command.Group>
              {canals.length > 0 && (
                <Command.Group
                  heading="Canaux"
                  className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider px-2 py-1.5 mt-1"
                >
                  {canals.map((c) => (
                    <Command.Item
                      key={c.key}
                      onSelect={() => {
                        switchTab("canals");
                        setCommandOpen(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-accent text-foreground data-[selected=true]:bg-accent"
                    >
                      <Signal className="w-3.5 h-3.5 text-muted-foreground" />
                      {c.label}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {fmtPct(c.successRate)}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {errors.length > 0 && (
                <Command.Group
                  heading="Erreurs fréquentes"
                  className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider px-2 py-1.5 mt-1"
                >
                  {errors.slice(0, 5).map((e) => (
                    <Command.Item
                      key={e.error_code}
                      onSelect={() => {
                        switchTab("analysis");
                        setCommandOpen(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-accent text-foreground data-[selected=true]:bg-accent"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                      {e.error_code}
                      <span className="ml-1 text-muted-foreground text-xs truncate">
                        {e.error_message}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">{fmtN(e.count)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </div>
      </Command.Dialog>
    </div>
  );
}
