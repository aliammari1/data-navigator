"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  deleteLocalDataset,
  listLocalDatasets,
} from "@/platform/duckdb/duckdb-fs";
import {
  getStorageInfo,
  requestPersistence,
  type StorageInfo,
} from "@/platform/storage/storage-info";
import { cn } from "@/shared/utils";
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

function formatMB(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 100 ? 0 : 1)} MB`;
}

function storageTone(pct: number): string {
  if (pct > 80) return "bg-red-500";
  if (pct > 50) return "bg-amber-500";
  return "bg-emerald-500";
}

export function StorageInfoPanel({
  tableName,
  datasetId,
}: StorageInfoPanelProps) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [requestingPersistence, setRequestingPersistence] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [datasetCount, setDatasetCount] = useState<number | null>(null);

  const targetDatasetKey = useMemo(
    () => datasetId?.trim() || tableName?.trim() || null,
    [datasetId, tableName],
  );

  const refresh = useCallback(async () => {
    const [storage, datasets] = await Promise.all([
      getStorageInfo(),
      listLocalDatasets().catch(() => []),
    ]);

    setInfo(storage);
    setDatasetCount(datasets.length);
  }, []);

  useEffect(() => {
    refresh().catch(() => {
      setInfo({
        supported: false,
        usedMB: 0,
        quotaMB: 0,
        pct: 0,
        isPersistent: false,
      });
    });
  }, [refresh]);

  async function handlePersist() {
    setRequestingPersistence(true);

    try {
      await requestPersistence();
      await refresh();

      toast.success("Stockage persistant vérifié");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d'activer le stockage persistant",
      );
    } finally {
      setRequestingPersistence(false);
    }
  }

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
        error instanceof Error
          ? error.message
          : "Impossible de supprimer le cache du dataset",
      );
    } finally {
      setClearing(false);
    }
  }

  if (!info) {
    return (
      <Section title="Stockage local" icon={<Database className="h-4 w-4" />}>
        <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Lecture des informations de stockage…
        </div>
      </Section>
    );
  }

  if (!info.supported) {
    return (
      <Section title="Stockage local" icon={<Database className="h-4 w-4" />}>
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <div>
            <div className="font-semibold">Storage API non disponible</div>
            <div className="mt-1 text-muted-foreground">
              Le cache DuckDB natif reste géré par Electron, mais les métriques
              navigateur ne sont pas disponibles.
            </div>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Stockage local" icon={<Database className="h-4 w-4" />}>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              Espace utilisé
            </div>

            <div className="font-semibold text-foreground">
              {formatMB(info.usedMB)} / {formatMB(info.quotaMB)}
              <span className="ml-1 text-muted-foreground">
                ({info.pct.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                storageTone(info.pct),
              )}
              style={{ width: `${Math.min(info.pct, 100)}%` }}
            />
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            Cette valeur vient de l’API Storage du navigateur. Les fichiers
            DuckDB/Parquet natifs sont gérés par le processus Electron.
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/50 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Stockage persistant
            </div>

            <div className="mt-1 text-[11px] text-muted-foreground">
              {info.isPersistent
                ? "Le navigateur protège les données contre l'éviction automatique."
                : "Stockage best-effort — le navigateur peut l'effacer sous pression mémoire."}
            </div>
          </div>

          {info.isPersistent ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              Persistant
            </span>
          ) : (
            <button
              type="button"
              onClick={handlePersist}
              disabled={requestingPersistence}
              className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
            >
              {requestingPersistence ? "Demande…" : "Activer"}
            </button>
          )}
        </div>

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
