"use client";

/**
 * Data Profile screen — composition root.
 *
 * This used to be a 1977-line monolith that, on every mount, ran an
 * O(columns × scans) sequential per-column profiling loop on the renderer main
 * thread, called `setProfiles` once per column (a re-render storm), rendered an
 * un-virtualized `AnimatePresence` column list, and rebuilt five full ECharts
 * option blobs inline.
 *
 * It is now a thin wiring layer over the feature's hooks and components:
 * - `useDatasetCatalog` — IPC catalog load + Zustand mirror + auto-select.
 * - `useDatasetProfile` — Dexie cache → ONE cancel-aware SUMMARIZE scan
 *   (`profileDataset`) → Comlink worker post-process → state → persist.
 * - `useFilteredProfiles` — deferred, off-main-thread search/filter/sort.
 * - `useColumnDetail` — lazy top-K/histogram/length/reservoir-sample for the
 *   *selected* column only, with a session LRU and real validity scoring.
 * - `ColumnList` — `@tanstack/react-virtual` (60fps on 1000+ columns).
 * - `ProfileChart` — `echarts` with `notMerge`/`lazyUpdate` (no full re-init);
 *   pure option builders in `charts/options.ts` (large/progressive when wide).
 *
 * Every number traces to a DuckDB scan or the seeded validity worker — there is
 * no `Math.random`, no fabricated p-value, and no localStorage-as-DB.
 */

import {
  AlertTriangle,
  Brain,
  Compass,
  Database,
  Download,
  Eye,
  FileSearch,
  FileText,
  Hash,
  Layers,
  Microscope,
  Percent,
  RefreshCw,
  Search,
  Sigma,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/design-system/empty-state";
import { NextSteps } from "@/design-system/next-steps";
import {
  nullHeatmapOption,
  overviewQualityOption,
  profileScore,
  typeMixOption,
} from "@/features/parsed-data/charts/options";
import { ProfileChart } from "@/features/parsed-data/charts/ProfileChart";
import { ColumnList } from "@/features/parsed-data/components/ColumnList";
import { ColumnDetailPanel, type DetailTab } from "@/features/parsed-data/components/ColumnDetail";
import { QualityRing } from "@/features/parsed-data/components/profile-cards";
import { csvEscape } from "@/features/parsed-data/model/format";
import { qualityColor, qualityLabel } from "@/features/parsed-data/model/profile-format";
import type {
  ProfileQualityFilter,
  ProfileQuery,
  ProfileSortKey,
  ProfileTypeFilter,
} from "@/features/parsed-data/model/summary-map";
import { defaultProfileQuery } from "@/features/parsed-data/model/summary-map";
import { useColumnDetail } from "@/features/parsed-data/hooks/useColumnDetail";
import { useDatasetCatalog } from "@/features/parsed-data/hooks/useDatasetCatalog";
import { useDatasetProfile } from "@/features/parsed-data/hooks/useDatasetProfile";
import { useFilteredProfiles } from "@/features/parsed-data/hooks/useFilteredProfiles";
import { useProfileWorker } from "@/features/parsed-data/worker/useProfileWorker";
import { cn } from "@/shared/utils";

// ─── Small presentational helpers ─────────────────────────────────────────────

function DatasetEmptyState() {
  return (
    <div className=" flex min-h-[70vh] items-center justify-center">
      <EmptyState
        icon={Database}
        title="Aucun jeu de données chargé"
        description="Importez d'abord un fichier CSV, TXT, TSV ou Parquet. Une fois dans le catalogue DuckDB, cette page génère un profil complet des colonnes."
        action={{ label: "Importer un fichier", href: "/dashboard/upload" }}
        secondary={{ label: "Explorateur", href: "/dashboard/data-browser" }}
        className="max-w-xl"
      />
    </div>
  );
}

const PARSED_NEXT_STEPS = [
  {
    icon: Brain,
    label: "Analyser (IA)",
    hint: "Insights et anomalies",
    href: "/dashboard/ai-analysis",
  },
  {
    icon: Microscope,
    label: "Analyses approfondies",
    hint: "Cohortes, clustering",
    href: "/dashboard/deep-analytics",
  },
  {
    icon: Layers,
    label: "Transformer",
    hint: "Nettoyer et enrichir",
    href: "/dashboard/transform",
  },
  {
    icon: FileText,
    label: "Créer un rapport",
    hint: "Studio de Rapports",
    href: "/dashboard/report-studio",
  },
];

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Database;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
        </div>
        <div className={cn("rounded-2xl p-3", tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

const SORT_KEYS: ReadonlyArray<ProfileSortKey> = ["quality", "name", "nullRate", "distinctCount"];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ParsedDataScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const worker = useProfileWorker();

  const {
    catalog,
    activeDataset,
    activeDatasetId,
    loading: catalogLoading,
    error: catalogError,
    setActiveDataset,
  } = useDatasetCatalog(refreshKey);

  const {
    profiles,
    dimensions,
    status,
    error: profileError,
    fromCache,
  } = useDatasetProfile(activeDataset, worker, refreshKey);

  const profiling = status === "loading";

  // ── Column selection (auto-select first once profiles arrive) ──
  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  useEffect(() => {
    // Reset selection when the dataset changes; re-pick the first column when a
    // fresh profile set lands and nothing valid is selected.
    setSelectedCol((current) => {
      if (current && profiles.some((p) => p.name === current)) return current;
      return profiles[0]?.name ?? null;
    });
  }, [profiles]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.name === selectedCol) ?? null,
    [profiles, selectedCol],
  );

  const { detail, loading: detailLoading } = useColumnDetail(
    activeDataset,
    selectedProfile,
    worker,
  );

  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("overview");

  // ── Filter / sort query (debounced + off-main-thread) ──
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProfileTypeFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<ProfileQualityFilter>("all");
  const [sortBy, setSortBy] = useState<ProfileSortKey>(defaultProfileQuery.sortBy);
  const [sortAsc, setSortAsc] = useState(defaultProfileQuery.sortAsc);

  const query: ProfileQuery = useMemo(
    () => ({ search, typeFilter, qualityFilter, sortBy, sortAsc }),
    [search, typeFilter, qualityFilter, sortBy, sortAsc],
  );

  const filteredProfiles = useFilteredProfiles(profiles, query, worker);

  // ── Derived metrics ──
  const overallScore = useMemo(() => {
    if (profiles.length === 0) return 0;
    return profiles.reduce((sum, profile) => sum + profileScore(profile), 0) / profiles.length;
  }, [profiles]);

  const numericColumnsCount = useMemo(
    () =>
      profiles.filter((profile) => profile.type === "integer" || profile.type === "float").length,
    [profiles],
  );

  const nullColumnsCount = useMemo(
    () => profiles.filter((profile) => profile.nullCount > 0).length,
    [profiles],
  );

  // ── Pure chart options (notMerge/lazyUpdate via ProfileChart) ──
  const typeMix = useMemo(() => typeMixOption(profiles), [profiles]);
  const overviewChart = useMemo(() => overviewQualityOption(profiles), [profiles]);
  const heatmapChart = useMemo(() => nullHeatmapOption(profiles), [profiles]);

  // ── CSV export (local; SUMMARIZE-derived numbers) ──
  const activeDisplayName = activeDataset?.displayName ?? "dataset";
  const exportProfiles = useCallback(() => {
    const header = [
      "name",
      "type",
      "rowCount",
      "nullCount",
      "nullRate",
      "distinctCount",
      "uniquenessRate",
      "min",
      "max",
      "avg",
      "stddev",
      "completeness",
      "validity",
    ];

    const rows = profiles.map((profile) => [
      profile.name,
      profile.type,
      profile.rowCount,
      profile.nullCount,
      profile.nullRate.toFixed(4),
      profile.distinctCount,
      profile.uniquenessRate.toFixed(4),
      profile.min ?? "",
      profile.max ?? "",
      profile.avg ?? "",
      profile.stddev ?? "",
      profile.completeness.toFixed(4),
      profile.validity.toFixed(4),
    ]);

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeDisplayName.replace(/\W/g, "_").toLowerCase()}_column_profiles.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [profiles, activeDisplayName]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const error = catalogError ?? profileError;
  const busy = profiling || catalogLoading;
  const activeViewName = activeDataset?.viewName ?? null;

  if (!activeDataset && !busy && catalog.length === 0) {
    return <DatasetEmptyState />;
  }

  return (
    <div className=" text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-3xl border border-primary/25 bg-primary/15 text-primary shadow-[var(--shadow-1)]">
              <FileSearch className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-foreground">Profil des données</h1>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    color: qualityColor(overallScore),
                    backgroundColor: `${qualityColor(overallScore)}20`,
                  }}
                >
                  {qualityLabel(overallScore)}
                </span>
                {fromCache && (
                  <span className="rounded-full bg-[color-mix(in_oklab,var(--positive)_12%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-positive">
                    en cache
                  </span>
                )}
              </div>

              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {activeDisplayName}
                {activeViewName ? ` · ${activeViewName}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {catalog.length > 0 && (
              <select
                value={activeDataset?.id ?? activeDatasetId ?? ""}
                onChange={(event) => setActiveDataset(event.target.value)}
                className="h-10 min-w-52 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none"
              >
                {catalog.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.displayName}
                  </option>
                ))}
              </select>
            )}

            <Button asChild variant="outline" size="lg" className="rounded-xl">
              <Link href="/dashboard/data-browser">
                <Compass className="h-4 w-4" />
                Ouvrir dans l'Explorateur
              </Link>
            </Button>

            <button
              type="button"
              onClick={exportProfiles}
              disabled={busy || profiles.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Exporter
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
              Actualiser
            </button>
          </div>
        </div>

        {(busy || error) && (
          <div className="border-t border-border px-5 py-3">
            {error ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="h-4 w-4 animate-pulse text-violet-500" />
                  {catalogLoading
                    ? "Refreshing dataset catalog…"
                    : "Profiling dataset (single SUMMARIZE scan)…"}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500"
                    animate={{ width: ["8%", "70%", "92%"] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <main className=" grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Lignes"
              value={(activeDataset?.rowCount ?? 0).toLocaleString()}
              icon={Hash}
              tone="bg-primary/10 text-primary"
            />
            <MetricCard
              label="Colonnes"
              value={(activeDataset?.columns.length ?? 0).toLocaleString()}
              icon={Layers}
              tone="bg-ai/10 text-ai"
            />
            <MetricCard
              label="Numériques"
              value={numericColumnsCount.toLocaleString()}
              icon={Sigma}
              tone="bg-[color-mix(in_oklab,var(--positive)_12%,transparent)] text-positive"
            />
            <MetricCard
              label="Avec valeurs nulles"
              value={nullColumnsCount.toLocaleString()}
              icon={AlertTriangle}
              tone="bg-warning/10 text-warning"
            />
          </div>

          <div className="rounded-3xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-foreground">Column Explorer</h2>
                <p className="text-xs text-muted-foreground">Search, filter and inspect columns.</p>
              </div>
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search columns..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-violet-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as ProfileTypeFilter)}
                  className="h-9 rounded-xl border border-border bg-background px-2 text-xs text-foreground outline-none"
                >
                  <option value="all">All types</option>
                  <option value="integer">Integer</option>
                  <option value="float">Float</option>
                  <option value="string">String</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                  <option value="unknown">Unknown</option>
                </select>

                <select
                  value={qualityFilter}
                  onChange={(event) => setQualityFilter(event.target.value as ProfileQualityFilter)}
                  className="h-9 rounded-xl border border-border bg-background px-2 text-xs text-foreground outline-none"
                >
                  <option value="all">All quality</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="mr-1 text-muted-foreground">Sort</span>
                {SORT_KEYS.map((sort) => (
                  <button
                    key={sort}
                    type="button"
                    onClick={() => {
                      if (sortBy === sort) {
                        setSortAsc((value) => !value);
                      } else {
                        setSortBy(sort);
                        setSortAsc(sort === "name");
                      }
                    }}
                    className={cn(
                      "rounded-lg px-2 py-1 transition-colors",
                      sortBy === sort
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {sort === "nullRate" ? "nulls" : sort === "distinctCount" ? "distinct" : sort}
                    {sortBy === sort ? (sortAsc ? " ↑" : " ↓") : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ColumnList
            profiles={filteredProfiles}
            selected={selectedCol}
            onSelect={setSelectedCol}
            empty={profiles.length === 0}
          />
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="rounded-3xl border border-border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Dataset Quality Overview</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Summary of completeness, uniqueness, validity and consistency.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div
                      className="text-3xl font-bold"
                      style={{ color: qualityColor(overallScore) }}
                    >
                      {(overallScore * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {qualityLabel(overallScore)}
                    </div>
                  </div>
                  <QualityRing score={overallScore} size={72} />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {dimensions.map((dimension) => (
                  <div
                    key={dimension.name}
                    className="rounded-2xl border border-border bg-background p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {dimension.name}
                      </span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: qualityColor(dimension.score) }}
                      >
                        {(dimension.score * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: qualityColor(dimension.score) }}
                        initial={{ width: 0 }}
                        animate={{ width: `${dimension.score * 100}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {dimension.description}
                    </p>

                    {dimension.affected.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {dimension.affected.slice(0, 3).map((column) => (
                          <span
                            key={column}
                            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-300"
                          >
                            {column}
                          </span>
                        ))}
                        {dimension.affected.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{dimension.affected.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Layers className="h-4 w-4 text-violet-500" />
                Type Mix
              </h3>
              <div className="mt-4">
                {typeMix ? (
                  <ProfileChart option={typeMix} style={{ height: 180 }} />
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    No profile data.
                  </div>
                )}
              </div>
            </div>
          </div>

          {!selectedProfile && !profiling ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-8 text-center">
              <Eye className="h-12 w-12 text-muted-foreground/40" />
              <h2 className="mt-4 text-lg font-bold text-foreground">Select a column</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Choose a column from the explorer to inspect its statistics, distribution, quality,
                and sample frequencies.
              </p>
            </div>
          ) : null}

          {selectedProfile && (
            <ColumnDetailPanel
              profile={selectedProfile}
              detail={detail}
              detailLoading={detailLoading}
              activeTab={activeDetailTab}
              onTabChange={setActiveDetailTab}
            />
          )}

          {profiles.length > 0 && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <div className="rounded-3xl border border-border bg-card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Layers className="h-4 w-4 text-indigo-500" />
                  Completeness by Column
                </h3>
                {overviewChart && <ProfileChart option={overviewChart} style={{ height: 240 }} />}
              </div>

              <div className="rounded-3xl border border-border bg-card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Percent className="h-4 w-4 text-primary" />
                  Taux de valeurs nulles
                </h3>
                {heatmapChart && <ProfileChart option={heatmapChart} style={{ height: 240 }} />}
              </div>
            </div>
          )}

          <NextSteps steps={PARSED_NEXT_STEPS} />
        </section>
      </main>
    </div>
  );
}
