"use client";

import { Database, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteLocalDataset, listLocalDatasets } from "@/platform/duckdb/duckdb-fs";
import { Section } from "./section";

interface StorageInfoPanelProps {
  /**
   * Legacy compatibility.
   *
   * In the new DuckDB model this may be a dataset id, view name, or old tableName.
   */
  tableName?: string | null;

  /**
   * Prefer passing datasetId from new code.
   */
  datasetId?: string | null;
}

/**
 * Local DuckDB dataset cache for the currently active report — the one
 * genuinely telecom-specific piece of "storage". Overall device storage usage
 * and the persistent-storage toggle are the SAME device-wide state Settings >
 * Storage already shows, so that part lives there only (see
 * src/features/settings/components/panels/storage-panel.tsx) instead of being
 * duplicated here.
 */
export function StorageInfoPanel({ tableName, datasetId }: StorageInfoPanelProps) {
  const [clearing, setClearing] = useState(false);
  const [datasetCount, setDatasetCount] = useState<number | null>(null);

  const targetDatasetKey = useMemo(
    () => datasetId?.trim() || tableName?.trim() || null,
    [datasetId, tableName],
  );

  const refresh = useCallback(async () => {
    const datasets = await listLocalDatasets().catch(() => []);
    setDatasetCount(datasets.length);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleClearDatasetCache() {
    if (!targetDatasetKey) {
      toast.error("Aucun dataset actif à supprimer");
      return;
    }

    setClearing(true);

    try {
      const datasets = await listLocalDatasets();

      const dataset = datasets.find(
        (item) =>
          item.id === targetDatasetKey ||
          item.viewName === targetDatasetKey ||
          item.displayName === targetDatasetKey,
      );

      if (!dataset) {
        toast.error("Dataset introuvable dans le catalogue local");
        return;
      }

      await deleteLocalDataset(dataset.id);
      await refresh();

      toast.success("Dataset supprimé du cache local");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de supprimer le cache du dataset",
      );
    } finally {
      setClearing(false);
    }
  }

  return (
    <Section title="Stockage local" icon={<Database className="h-4 w-4" />}>
      <div className="space-y-4">
        <p className="text-[11px] text-muted-foreground">
          Espace disque global et stockage persistant sont gérés dans{" "}
          <Link href="/dashboard/settings?tab=storage" className="text-primary hover:underline">
            Réglages › Stockage
          </Link>
          .
        </p>

        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Database className="h-3.5 w-3.5 text-primary" />
                Cache dataset DuckDB
              </div>

              <div className="mt-1 text-[11px] text-muted-foreground">
                {datasetCount === null
                  ? "Catalogue local DuckDB"
                  : `${datasetCount} dataset${datasetCount === 1 ? "" : "s"} dans le catalogue local`}
              </div>

              {targetDatasetKey && (
                <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                  Actif: {targetDatasetKey}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleClearDatasetCache}
              disabled={clearing || !targetDatasetKey}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
            >
              {clearing ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}
