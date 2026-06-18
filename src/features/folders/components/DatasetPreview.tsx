"use client";

import { BarChart3, ExternalLink, Layers, Sparkles, Table2, X } from "lucide-react";
import { useEffect } from "react";
import type { Dataset } from "@/core/stores/data-store";
import { usePreviewRows } from "@/features/folders/hooks/usePreviewRows";
import { formatBytes } from "../lib/format";

/**
 * DatasetPreview — a modal "review of the file": instant schema chips (from the
 * in-store column metadata) plus the first rows (a single read-only LIMIT query
 * via {@link usePreviewRows}). It is deliberately a quick peek, not the Explorer;
 * the primary CTA hands off to the full Explorer screen, and secondary actions
 * deep-link to Profil / Transformations / Moudir.
 */

const PREVIEW_ROW_LIMIT = 20;

export interface DatasetPreviewProps {
  dataset: Dataset;
  onClose: () => void;
  onOpenExplorer: () => void;
  onProfile: () => void;
  onTransform: () => void;
  onAskMoudir: () => void;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleString("fr-FR");
  return String(value);
}

export function DatasetPreview({
  dataset,
  onClose,
  onOpenExplorer,
  onProfile,
  onTransform,
  onAskMoudir,
}: DatasetPreviewProps) {
  const { rows, loading, error } = usePreviewRows(dataset.viewName, PREVIEW_ROW_LIMIT);
  const columns = dataset.columns;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close is a standard modal affordance; Escape is handled above.
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is pointer-only; keyboard users dismiss via Escape (handled above).
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: inner stop-propagation only; dialog keyboard handling is global Escape. */}
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

        {/* Schema chips */}
        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Schéma ({columns.length})
          </div>
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
            {columns.map((col) => (
              <span
                key={col.name}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px]"
              >
                <span className="font-medium text-foreground">{col.name}</span>
                <span className="text-muted-foreground">{col.type}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Rows preview */}
        <div className="min-h-0 flex-1 overflow-auto">
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
          )}
        </div>

        {/* Footer hint + actions */}
        <div className="shrink-0 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Aperçu des {PREVIEW_ROW_LIMIT} premières lignes — ouvrez l'Explorateur pour filtrer, trier
          et tout parcourir.
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onOpenExplorer}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ExternalLink className="h-4 w-4" /> Ouvrir dans l'Explorateur
          </button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={onProfile}
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm transition-colors hover:bg-accent/80"
          >
            <BarChart3 className="h-4 w-4" /> Profiler
          </button>
          <button
            type="button"
            onClick={onTransform}
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm transition-colors hover:bg-accent/80"
          >
            <Layers className="h-4 w-4" /> Transformer
          </button>
          <button
            type="button"
            onClick={onAskMoudir}
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm transition-colors hover:bg-accent/80"
          >
            <Sparkles className="h-4 w-4" /> Demander à Moudir
          </button>
        </div>
      </div>
    </div>
  );
}
