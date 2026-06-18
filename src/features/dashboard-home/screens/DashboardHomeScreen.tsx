"use client";

import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Coins,
  FileText,
  Radio,
  RefreshCw,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { KpiStat } from "@/design-system/kpi-stat";
import { Rise, StaggerGrid, StaggerItem } from "@/design-system/motion-components";
import { ActivityCard } from "@/features/dashboard-home/components/activity-card";
import { GenericDatasetOverview } from "@/features/dashboard-home/components/generic-dataset-overview";
import { HomeHero } from "@/features/dashboard-home/components/home-hero";
import { QuickActions } from "@/features/dashboard-home/components/quick-actions";
import { RecentDatasetsCard } from "@/features/dashboard-home/components/recent-datasets-card";
import { TipCard } from "@/features/dashboard-home/components/tip-card";
import { handleLauncherClick } from "@/features/dashboard-home/lib/open-app";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { getDatasetReportDate, isTelecomDataset } from "@/features/telecom/lib/dataset-detection";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

/**
 * Accueil — warm "Édition du Jour" mission control.
 *
 * A PostHog-style overview reimagined as a paper/cream editorial briefing.
 * Routes by dataset kind:
 * - no datasets        → first-run empty state with import CTA
 * - telecom dataset    → masthead hero + real KPI row + quick actions +
 *                        recent datasets + activity + tip (summarises the
 *                        report, links into it — never re-renders the heavy
 *                        telecom OverviewTab)
 * - any other dataset  → generic DuckDB SUMMARIZE-backed overview
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

  if (!activeTelecomDataset) return <MissionControlEmptyState />;

  const reportDate = getDatasetReportDate(activeTelecomDataset);
  const freshness = relativeTime(activeTelecomDataset.updatedAt);
  const kpi = analytics.kpi;
  const loading = !tableReady || !activeTableName || !kpi;

  const heroSubtitle = (
    <>
      <span className="font-mono text-foreground/80">{activeTelecomDataset.name}</span>
      {reportDate ? <> · Données du {reportDate}</> : null}
      {freshness ? <> · importées {freshness}</> : null}
    </>
  );

  const openReport = handleLauncherClick("telecom", "/dashboard/telecom-report/overview");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-5 md:px-6">
        {/* Masthead hero */}
        <HomeHero subtitle={heroSubtitle} />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Le rapport du jour</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => analytics.refresh()}
              disabled={!tableReady}
            >
              <RefreshCw className="size-3.5" /> Actualiser
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a
                href="/dashboard/upload"
                onClick={handleLauncherClick("upload", "/dashboard/upload")}
              >
                <Upload className="size-3.5" /> Importer
              </a>
            </Button>
            <Button type="button" size="sm" asChild>
              <a
                href="/dashboard/telecom-report/overview"
                onClick={handleLauncherClick("telecom", "/dashboard/telecom-report/overview")}
              >
                Ouvrir le rapport
                <ArrowRight className="size-3.5" />
              </a>
            </Button>
          </div>
        </div>

        {/* KPI row — real telecom analytics */}
        <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StaggerItem>
            <KpiStat
              label="Transactions"
              numericValue={loading ? 0 : kpi.totalTransactions}
              icon={<FileText />}
              sub={reportDate ? `Rapport du ${reportDate}` : "Rapport actif"}
            />
          </StaggerItem>
          <StaggerItem>
            <KpiStat
              label="Taux de réussite"
              value={loading ? "—" : fmtPct(kpi.successRate)}
              icon={<CheckCircle2 />}
              trend={loading ? "neutral" : kpi.successRate >= 90 ? "up" : "down"}
              trendValue={
                loading ? undefined : kpi.successRate >= 90 ? "objectif atteint" : "sous l'objectif"
              }
            />
          </StaggerItem>
          <StaggerItem>
            <KpiStat
              label="Montant total"
              value={loading ? "—" : fmtAmount(kpi.totalAmount)}
              icon={<Coins />}
              sub="TND"
            />
          </StaggerItem>
          <StaggerItem>
            <KpiStat
              label="Abonnés uniques"
              numericValue={loading ? 0 : kpi.uniqueCustomers}
              icon={<Users />}
              sub={loading ? undefined : `Pic à ${String(kpi.peakHour).padStart(2, "0")}:00`}
            />
          </StaggerItem>
        </StaggerGrid>

        {/* Report-of-the-day summary + recent datasets */}
        <div className="grid gap-3 lg:grid-cols-3">
          <Rise className="lg:col-span-2">
            <ReportOfTheDay
              kpi={kpi}
              loading={loading}
              canalCount={analytics.canals?.length ?? 0}
              onOpenReport={openReport}
            />
          </Rise>
          <Rise>
            <RecentDatasetsCard />
          </Rise>
        </div>

        {/* Quick actions */}
        <QuickActions />

        {/* Activity + tip */}
        <div className="grid gap-3 lg:grid-cols-3">
          <Rise className="lg:col-span-2">
            <ActivityCard />
          </Rise>
          <Rise>
            <TipCard />
          </Rise>
        </div>
      </div>
    </div>
  );
}

function ReportOfTheDay({
  kpi,
  loading,
  canalCount,
  onOpenReport,
}: {
  kpi: Types.KPISummary | null;
  loading: boolean;
  canalCount: number;
  onOpenReport: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl border border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-300">
            <Radio className="size-4" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">Rapport du jour</h2>
        </div>
        <Button asChild variant="ghost" size="sm">
          <a href="/dashboard/telecom-report/overview" onClick={onOpenReport}>
            Détails <ArrowRight className="size-3.5" />
          </a>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat
          label="Réussies"
          value={loading || !kpi ? "—" : fmtN(kpi.successCount)}
          tone="positive"
        />
        <MiniStat
          label="Échecs"
          value={loading || !kpi ? "—" : fmtN(kpi.declinedCount)}
          tone="negative"
        />
        <MiniStat label="En attente" value={loading || !kpi ? "—" : fmtN(kpi.instanceCount)} />
        <MiniStat label="Canaux" value={loading ? "—" : fmtN(canalCount)} />
      </div>
      <p className="mt-auto text-sm leading-relaxed text-muted-foreground">
        {loading || !kpi
          ? "Analyse des transactions en cours…"
          : `${fmtN(kpi.totalTransactions)} transactions traitées, ${fmtPct(
              kpi.successRate,
            )} de réussite. Code d'erreur principal : ${kpi.topErrorCode || "—"}.`}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="text-xs uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div
        className={
          tone === "positive"
            ? "mt-1 font-mono text-lg font-semibold tabular-nums text-positive"
            : tone === "negative"
              ? "mt-1 font-mono text-lg font-semibold tabular-nums text-negative"
              : "mt-1 font-mono text-lg font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </div>
    </div>
  );
}

function MissionControlEmptyState() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-16 text-center">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-amber-500 font-serif text-xs font-bold text-white">
          é
        </span>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
          L'Édition du Jour
        </p>
      </div>
      <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">
        Votre rapport, entièrement hors ligne
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
        Importez votre fichier DailyTransactions : tout est analysé localement dans DuckDB, sans
        connexion. Importez, analysez, exportez.
      </p>

      <StaggerGrid className="mt-10 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {[
          {
            n: "1",
            icon: Upload,
            title: "Importer",
            text: "Glissez votre fichier DailyTransactions.",
          },
          {
            n: "2",
            icon: Brain,
            title: "Analyser",
            text: "KPIs, anomalies et prévisions locales.",
          },
          {
            n: "3",
            icon: FileText,
            title: "Exporter",
            text: "Rapports et présentations partageables.",
          },
        ].map((step) => (
          <StaggerItem key={step.n}>
            <div className="flex h-full flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
              <span className="flex size-10 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 [&_svg]:size-5 dark:text-amber-300">
                <step.icon aria-hidden="true" />
              </span>
              <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.text}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerGrid>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/dashboard/upload">
            <Upload className="size-4" /> Importer un fichier DailyTransactions
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/dashboard/help">Visite guidée</Link>
        </Button>
      </div>
    </div>
  );
}

/** Compact French relative time ("il y a 2 h", "il y a 3 j"). */
function relativeTime(input: string | number | Date | undefined): string | null {
  if (!input) return null;
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return null;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

// Re-exported for callers/tests that imported the empty state by its old name.
export { MissionControlEmptyState as DashboardHomeEmptyState };
