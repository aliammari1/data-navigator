"use client";

import { ArrowRight, Database, FileSpreadsheet, Upload } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { type DesktopAppId, handleLauncherClick } from "@/features/dashboard-home/lib/open-app";
import { fmtCompact } from "@/features/telecom/lib/format";

/**
 * Datasets récents — real catalogue card sourced from the data store. Lists the
 * most recently updated datasets with row counts; clicking one focuses it as the
 * active dataset and opens the catalogue. Shows a tasteful import CTA when empty.
 */
export function RecentDatasetsCard() {
  const datasets = useDataStore((s) => s.datasets);
  const setActiveDataset = useDataStore((s) => s.setActiveDataset);

  const recent = useMemo(
    () =>
      [...datasets]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [datasets],
  );

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <Database className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Jeux de données récents</h2>
            <p className="text-xs text-muted-foreground">
              {datasets.length > 0 ? `${datasets.length} au catalogue` : "Catalogue local"}
            </p>
          </div>
        </div>
        {recent.length > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <DatasetLink appId="folders" route="/dashboard/folders">
              Catalogue <ArrowRight className="size-3.5" />
            </DatasetLink>
          </Button>
        ) : null}
      </div>

      {recent.length === 0 ? (
        <EmptyDatasets />
      ) : (
        <ul className="-mx-1 flex flex-col">
          {recent.map((dataset) => (
            <li key={dataset.id}>
              <button
                type="button"
                onClick={() => setActiveDataset(dataset.id)}
                className="group flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-8 flex-none items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                  <FileSpreadsheet className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {dataset.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {fmtCompact(dataset.rowCount)} lignes · {dataset.colCount} colonnes
                  </span>
                </span>
                <span className="flex-none text-xs text-muted-foreground/70">
                  {relativeTime(dataset.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyDatasets() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-4 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
        <Database className="size-5" />
      </span>
      <p className="text-sm text-muted-foreground">Aucun jeu de données pour l'instant.</p>
      <Button asChild size="sm">
        <DatasetLink appId="upload" route="/dashboard/upload">
          <Upload className="size-3.5" /> Importer des données
        </DatasetLink>
      </Button>
    </div>
  );
}

/** A desktop-aware link (event + route fallback), reused for the card CTAs. */
function DatasetLink({
  appId,
  route,
  children,
}: {
  appId: DesktopAppId;
  route: string;
  children: React.ReactNode;
}) {
  return (
    <a href={route} onClick={handleLauncherClick(appId, route)}>
      {children}
    </a>
  );
}

/** Compact French relative time. */
function relativeTime(input: string | number | Date | undefined): string {
  if (!input) return "";
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "";
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const day = Math.round(h / 24);
  return `${day} j`;
}
