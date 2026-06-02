"use client";

import {
  ArrowRight,
  CheckCircle2,
  Database,
  RefreshCw,
  Signal,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { OverviewTab } from "@/features/telecom/components/overview-tab";
import { KPI_FIELDS } from "@/features/telecom/constants";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import {
  getDatasetReportDate,
  isTelecomDataset,
} from "@/features/telecom/lib/dataset-detection";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import { fetchDailyTrend as _fetchDailyTrend } from "@/features/telecom/lib/queries";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

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

export default function DashboardHomeScreen() {
  const router = useRouter();

  const datasets = useDataStore((state) => state.datasets);
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const setActiveDataset = useDataStore((state) => state.setActiveDataset);

  const firstLoad = useRef(true);
  const fileNameRef = useRef("");
  const tableNameRef = useRef("");

  const [activeTableName, setActiveTableName] = useState("");
  const [tableReady, setTableReady] = useState(false);

  const [statusMapping, setStatusMapping] = useState<Types.StatusMapping[]>([]);
  const statusMappingRef = useRef<Types.StatusMapping[]>([]);

  const [selectedKpis, setSelectedKpis] = useState<Set<keyof Types.KPISummary>>(
    () => new Set(KPI_FIELDS.map((field) => field.key)),
  );

  const [selectedOverviewSections, setSelectedOverviewSections] = useState<
    Set<Types.OverviewExportSectionKey>
  >(() => new Set(DEFAULT_OVERVIEW_EXPORT_SECTIONS));

  useEffect(() => {
    statusMappingRef.current = statusMapping;
  }, [statusMapping]);

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

  const setCurrentTableName = useCallback((tableName: string) => {
    tableNameRef.current = tableName;
    setActiveTableName(tableName);
  }, []);

  const getTableName = useCallback(() => tableNameRef.current, []);

  const fetchDailyTrend = useCallback(
    (mapping: Types.ColumnMapping) =>
      _fetchDailyTrend(tableNameRef.current, mapping),
    [],
  );

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

  const toggleKpi = useCallback((key: keyof Types.KPISummary) => {
    setSelectedKpis((prev) => {
      const next = new Set(prev);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }, []);

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
    if (!activeTelecomDataset) {
      setTableReady(false);
      setCurrentTableName("");
      fileNameRef.current = "";
      return;
    }

    const viewName =
      activeTelecomDataset.viewName || activeTelecomDataset.tableName;

    if (!viewName) {
      setTableReady(false);
      setCurrentTableName("");
      fileNameRef.current = activeTelecomDataset.name;
      return;
    }

    if (activeDatasetId !== activeTelecomDataset.id) {
      setActiveDataset(activeTelecomDataset.id);
    }

    setCurrentTableName(viewName);
    fileNameRef.current = activeTelecomDataset.name;
    firstLoad.current = true;
    setTableReady(true);
  }, [
    activeDatasetId,
    activeTelecomDataset?.id,
    activeTelecomDataset?.name,
    activeTelecomDataset?.tableName,
    activeTelecomDataset?.viewName,
    setActiveDataset,
    setCurrentTableName,
  ]);

  useEffect(() => {
    if (!tableReady || !activeTableName) return;

    analytics.runAnalytics(DEFAULT_MAPPING, statusMappingRef.current);
  }, [tableReady, activeTableName, analytics.refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportDate = getDatasetReportDate(activeTelecomDataset);

  if (!activeTelecomDataset) {
    return <DashboardHomeEmptyState />;
  }

  return (
    <div className="dn-page flex-1 overflow-y-auto">
      <div className="dn-sticky-header px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-linear-to-br from-teal-700 to-emerald-600">
              <Signal className="h-5 w-5 text-white" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-foreground">
                Vue d'ensemble Télécom
              </h1>

              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="truncate font-mono">
                  {activeTelecomDataset.name}
                </span>

                {reportDate && (
                  <>
                    <span>·</span>
                    <span>{reportDate}</span>
                  </>
                )}

                {analytics.kpi && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-teal-700 dark:text-teal-300">
                      {fmtN(analytics.kpi.totalTransactions)} tx
                    </span>
                    <span>·</span>
                    <span
                      className={
                        analytics.kpi.successRate >= 90
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      {fmtPct(analytics.kpi.successRate)} réussite
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TelecomDatasetPicker
              datasets={telecomDatasets}
              activeDatasetId={activeTelecomDataset.id}
              onSelect={(id) => {
                setActiveDataset(id);
              }}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => analytics.refresh()}
              disabled={!tableReady}
              className="h-9 rounded-xl text-xs"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Actualiser
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => router.push("/dashboard/upload?context=telecom")}
              className="h-9 rounded-xl bg-teal-700 text-xs font-bold text-white hover:bg-teal-800"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Importer
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/dashboard/telecom-report")}
              className="h-9 rounded-xl text-xs"
            >
              Rapport complet
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <main className="dn-page-shell-wide space-y-5">
        {!tableReady && (
          <DashboardLoadingState label="Préparation du dashboard…" />
        )}

        {tableReady && !analytics.kpi && (
          <DashboardLoadingState label="Analyse des transactions…" />
        )}

        {tableReady && (
          <OverviewTab
            kpi={analytics.kpi}
            canals={analytics.canals}
            hourly={analytics.hourly}
            statusData={analytics.statusData}
            forecast={analytics.forecast}
            m={DEFAULT_MAPPING}
            selectedKpis={selectedKpis}
            toggleKpi={toggleKpi}
            selectedOverviewSections={selectedOverviewSections}
            toggleOverviewSection={toggleOverviewSection}
            fetchDailyTrend={fetchDailyTrend}
          />
        )}
      </main>
    </div>
  );
}

function DashboardHomeEmptyState() {
  return (
    <div className="dn-page flex-1 overflow-y-auto">
      <div className="dn-page-shell">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-border bg-card text-muted-foreground">
            <Database className="h-9 w-9" />
          </div>

          <h1 className="mt-6 text-2xl font-bold text-foreground">
            Aucun rapport télécom disponible
          </h1>

          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Importez un fichier de transactions télécom depuis Upload. Le
            rapport sera chargé localement dans DuckDB, puis affiché ici comme
            écran d'accueil.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard/upload?context=telecom">
              <Button className="rounded-xl bg-teal-700 text-white hover:bg-teal-800">
                <Upload className="mr-2 h-4 w-4" />
                Importer un rapport
              </Button>
            </Link>

            <Link href="/dashboard/telecom-report">
              <Button variant="outline" className="rounded-xl">
                Rapport Télécom
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardLoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-2 border-teal-500/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-teal-600" />
      </div>
      <div className="mt-4 text-sm font-semibold text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function TelecomDatasetPicker({
  datasets,
  activeDatasetId,
  onSelect,
}: {
  datasets: Array<{
    id: string;
    name: string;
    tableName: string;
    viewName?: string;
    rowCount: number;
  }>;
  activeDatasetId: string;
  onSelect: (id: string) => void;
}) {
  if (datasets.length <= 1) {
    return (
      <Badge
        variant="outline"
        className="h-9 rounded-xl border-border bg-background px-3 text-xs text-muted-foreground"
      >
        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-teal-600" />
        Rapport actif
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={activeDatasetId}
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
