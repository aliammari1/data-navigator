"use client";

import { ArrowRight, Database, FileSpreadsheet } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { EmptyState } from "@/design-system/empty-state";
import { type DesktopAppId, handleLauncherClick } from "@/features/dashboard-home/lib/open-app";
import { relativeTime } from "@/features/dashboard-home/lib/relative-time";
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
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Database className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Jeux de données récents
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {datasets.length > 0 ? `${datasets.length} au catalogue` : "Catalogue local"}
          </p>
        </div>
        {recent.length > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <DatasetLink appId="folders" route="/dashboard/folders">
              Catalogue <ArrowRight className="size-3.5" aria-hidden="true" />
            </DatasetLink>
          </Button>
        ) : null}
      </div>

      {recent.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Aucun jeu de données pour l'instant"
          action={{
            kind: "link",
            label: "Importer des données",
            href: "/dashboard/upload",
            onClick: handleLauncherClick("upload", "/dashboard/upload"),
          }}
          className="flex-1 border-none bg-transparent py-8"
        />
      ) : (
        <ul className="-mx-1 flex flex-col">
          {recent.map((dataset) => (
            <li key={dataset.id}>
              <button
                type="button"
                onClick={() => setActiveDataset(dataset.id)}
                className="group flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-8 flex-none items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
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
