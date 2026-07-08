"use client";

import { ArrowRight, Brain, FileText, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { Rise, StaggerGrid, StaggerItem } from "@/design-system/motion-components";
import { ExploreGrid } from "@/features/dashboard-home/components/explore-grid";
import { GenericDatasetOverview } from "@/features/dashboard-home/components/generic-dataset-overview";
import { HomeHero } from "@/features/dashboard-home/components/home-hero";
import { HotSpots } from "@/features/dashboard-home/components/hot-spots";
import { RecentDatasetsCard } from "@/features/dashboard-home/components/recent-datasets-card";
import { handleLauncherClick } from "@/features/dashboard-home/lib/open-app";
import { relativeTime } from "@/features/dashboard-home/lib/relative-time";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { getDatasetReportDate, isTelecomDataset } from "@/features/telecom/lib/dataset-detection";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

/**
 * Accueil — the daily briefing AND the gate into the rest of the app. The
 * hero states the day's actual result (success rate, volume) at real scale —
 * not a greeting. Below it: the two facts that need attention (weakest
 * channel, dominant error), other datasets, then a full Explorer grouping
 * every real destination in the product, so this page is never a dead end.
 * Routes by dataset kind:
 * - no datasets        → first-run empty state with import CTA
 * - telecom dataset    → hero + points chauds + recent datasets + explorer
 *                        (summarises the report, links into it — never
 *                        re-renders the heavy telecom OverviewTab)
 * - any other dataset  → generic DuckDB SUMMARIZE-backed overview + explorer
 */
export default function DashboardHomeScreen() {
  const datasets = useDataStore((state) => state.datasets);
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);

  const hasTelecom = useMemo(() => datasets.some(isTelecomDataset), [datasets]);

  const activeDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === activeDatasetId) ?? null,
    [datasets, activeDatasetId],
  );

  if (!datasets.length) return <MissionControlEmptyState />;

  if (!hasTelecom) {
    const target = activeDataset ?? datasets[0];
    return <GenericDatasetOverview dataset={target} />;
  }

  if (activeDataset && !isTelecomDataset(activeDataset)) {
    return <GenericDatasetOverview dataset={activeDataset} />;
  }

  return <MissionControl />;
}

function MissionControl() {
  const datasets = useDataStore((state) => state.datasets);
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const setActiveDataset = useDataStore((state) => state.setActiveDataset);

  const firstLoad = useRef(true);
  const fileNameRef = useRef("");
  const tableNameRef = useRef("");

  const [activeTableName, setActiveTableName] = useState("");
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
    const active = datasets.find((dataset) => dataset.id === activeDatasetId);
    if (active && isTelecomDataset(active)) return active;
    return telecomDatasets[0] ?? null;
  }, [datasets, activeDatasetId, telecomDatasets]);

  const setCurrentTableName = useCallback((tableName: string) => {
    tableNameRef.current = tableName;
    setActiveTableName(tableName);
  }, []);

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

  // Sync active dataset + live table name into the analytics hook. Mount order
  // and the setActiveDataset call are preserved (telecom runtime coupling, risk #1).
  useEffect(() => {
    if (!activeTelecomDataset) {
      setTableReady(false);
      setCurrentTableName("");
      fileNameRef.current = "";
      return;
    }

    const viewName = activeTelecomDataset.viewName || activeTelecomDataset.tableName;
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
  }, [activeDatasetId, activeTelecomDataset, setActiveDataset, setCurrentTableName]);

  // Let the desktop menu's "Actualiser" reach the live analytics refresh.
  useAppCommands("home", {
    refresh: () => {
      if (tableReady) analytics.refresh();
    },
  });

  if (!activeTelecomDataset) return <MissionControlEmptyState />;

  const reportDate = getDatasetReportDate(activeTelecomDataset);
  const freshness = relativeTime(activeTelecomDataset.updatedAt);
  const kpi = analytics.kpi;
  const loading = !tableReady || !activeTableName || !kpi;

  const heroEyebrow = (
    <>
      {activeTelecomDataset.name}
      {reportDate ? <> · données du {reportDate}</> : null}
      {freshness ? <> · mis à jour il y a {freshness}</> : null}
    </>
  );

  const heroTertiary = loading
    ? "Analyse des transactions en cours…"
    : `${fmtAmount(kpi.totalAmount)} TND de montant total · ${fmtN(
        kpi.uniqueCustomers,
      )} abonnés uniques · pic à ${String(kpi.peakHour).padStart(2, "0")}:00`;

  const heroActions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => analytics.refresh()}
        disabled={!tableReady}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" /> Actualiser
      </Button>
      <Button type="button" variant="outline" size="sm" asChild>
        <a href="/dashboard/upload" onClick={handleLauncherClick("upload", "/dashboard/upload")}>
          <Upload className="size-3.5" aria-hidden="true" /> Importer
        </a>
      </Button>
      <Button type="button" size="sm" asChild>
        <a
          href="/dashboard/telecom-report/overview"
          onClick={handleLauncherClick("telecom", "/dashboard/telecom-report/overview")}
        >
          Ouvrir le rapport
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </a>
      </Button>
    </>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-8">
        {/* Hero — the day's headline numbers next to a real hourly trend */}
        <HomeHero
          eyebrow={heroEyebrow}
          primaryStat={{ value: loading ? "—" : fmtPct(kpi.successRate), label: "de réussite" }}
          secondaryStat={{
            value: loading ? "—" : fmtN(kpi.totalTransactions),
            label: "transactions",
          }}
          hourly={loading ? undefined : analytics.hourly}
          tertiary={heroTertiary}
          actions={heroActions}
        />

        {/* Points chauds + autres jeux de données */}
        <div className="grid gap-3 lg:grid-cols-3">
          <Rise className="lg:col-span-2">
            <HotSpots canals={analytics.canals ?? []} kpi={kpi} loading={loading} />
          </Rise>
          <Rise>
            <RecentDatasetsCard />
          </Rise>
        </div>

        <Rise>
          <ExploreGrid />
        </Rise>
      </div>
    </div>
  );
}

function MissionControlEmptyState() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Aucun rapport importé</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-black leading-tight tracking-tight text-foreground md:text-5xl">
          Votre rapport, entièrement hors ligne
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
          Importez votre fichier DailyTransactions : tout est analysé localement dans DuckDB, sans
          connexion. Importez, analysez, exportez.
        </p>

        <StaggerGrid className="mt-10 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
          {[
            {
              n: "01",
              icon: Upload,
              title: "Importer",
              text: "Glissez votre fichier DailyTransactions.",
            },
            {
              n: "02",
              icon: Brain,
              title: "Analyser",
              text: "KPIs, anomalies et prévisions locales.",
            },
            {
              n: "03",
              icon: FileText,
              title: "Exporter",
              text: "Rapports et présentations partageables.",
            },
          ].map((step) => (
            <StaggerItem key={step.n}>
              <div className="flex h-full flex-col items-start gap-1 rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
                <div className="flex w-full items-center justify-between">
                  <span className="font-mono text-3xl font-black text-primary/70">{step.n}</span>
                  <step.icon className="size-4 text-muted-foreground/50" aria-hidden="true" />
                </div>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.text}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGrid>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard/upload">
              <Upload className="size-4" aria-hidden="true" /> Importer un fichier DailyTransactions
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard/help">Visite guidée</Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pb-10 md:px-8">
        <ExploreGrid />
      </div>
    </div>
  );
}

// Re-exported for callers/tests that imported the empty state by its old name.
export { MissionControlEmptyState as DashboardHomeEmptyState };
