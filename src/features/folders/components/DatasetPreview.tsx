"use client";

import { Sparkles, Table2, X } from "lucide-react";
import { useEffect } from "react";
import type { ColMeta, Dataset } from "@/core/stores/data-store";
import { usePreviewRows } from "@/features/folders/hooks/usePreviewRows";
import { formatBytes } from "../lib/format";

const PREVIEW_ROW_LIMIT = 20;

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleString("fr-FR");
  return String(value);
}

const TYPE_STYLE: Record<string, string> = {
  number: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  string: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  date: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  boolean: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  unknown: "text-muted-foreground bg-muted border-border",
};

function ColumnCard({ col, rowCount }: { col: ColMeta; rowCount: number }) {
  const fillPct = rowCount > 0 ? Math.max(0, 100 - (col.nullCount / rowCount) * 100) : 100;
  const typeStyle = TYPE_STYLE[col.type] ?? TYPE_STYLE.unknown;

  const rangeLabel =
    col.min !== undefined && col.max !== undefined ? `[${col.min}, ${col.max}]` : null;

  const meanLabel =
    col.mean !== undefined
      ? `moy. ${col.mean.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`
      : null;

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-foreground" title={col.name}>
          {col.name}
        </span>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${typeStyle}`}
        >
          {col.type}
        </span>
      </div>

      {/* Fill rate bar */}
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/60 transition-all"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
          {fillPct.toFixed(0)}% rempli
        </span>
      </div>

      {/* Distinct + numeric stats */}
      <p className="truncate text-[10px] text-muted-foreground">
        {col.distinctCount.toLocaleString("fr-FR")} val. uniques
        {meanLabel ? ` · ${meanLabel}` : ""}
        {rangeLabel ? ` · ${rangeLabel}` : ""}
      </p>
    </div>
  );
}

export interface DatasetPreviewProps {
  dataset: Dataset;
  onClose: () => void;
  onAskMoudir: () => void;
}

export function DatasetPreview({ dataset, onClose, onAskMoudir }: DatasetPreviewProps) {
  const columns = dataset.columns;
  const { rows, loading, error } = usePreviewRows(dataset.viewName, PREVIEW_ROW_LIMIT);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const avgFillPct =
    columns.length > 0 && dataset.rowCount > 0
      ? (columns.reduce((sum, col) => sum + (1 - col.nullCount / dataset.rowCount), 0) /
          columns.length) *
        100
      : 100;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; Escape handled above
    // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only backdrop dismiss; keyboard via Escape
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stop-propagation on inner dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Aperçu du jeu de données ${dataset.name}`}
        className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 truncate text-base font-semibold text-foreground">
              <Table2 className="h-4 w-4 shrink-0 text-primary" />
              {dataset.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dataset.format.toUpperCase()} · {dataset.rowCount.toLocaleString("fr-FR")} lignes ·{" "}
              {dataset.colCount} colonnes · {formatBytes(dataset.sizeBytes)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l'aperçu"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quality summary strip */}
        <div className="flex shrink-0 items-center gap-4 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <span>{columns.length} colonnes</span>
          <span className="h-3.5 w-px bg-border" aria-hidden />
          <span>
            Taux de remplissage moyen :{" "}
            <strong className="text-foreground">{avgFillPct.toFixed(1)}%</strong>
          </span>
        </div>

        {/* Column quality grid */}
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {columns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune colonne détectée.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {columns.map((col) => (
                <ColumnCard key={col.name} col={col} rowCount={dataset.rowCount} />
              ))}
            </div>
          )}

          {/* Rows preview — first PREVIEW_ROW_LIMIT rows via a single read-only query */}
          <div className="mt-4">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Aperçu des données
            </div>
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Chargement de l'aperçu…
              </div>
            ) : error ? (
              <div className="p-6 text-center text-sm text-destructive">
                Aperçu indisponible : {error}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Aucune ligne à prévisualiser.
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      {columns.map((col) => (
                        <th
                          key={col.name}
                          className="whitespace-nowrap px-3 py-2 font-semibold text-muted-foreground"
                        >
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        {columns.map((col) => (
                          <td
                            key={col.name}
                            className="max-w-[16rem] truncate px-3 py-1.5 text-foreground"
                            title={cellText(row[col.name])}
                          >
                            {cellText(row[col.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onAskMoudir}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" /> Demander à Moudir
          </button>
        </div>
      </div>
    </div>
  );
}
