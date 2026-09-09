"use client";

import {
  Calendar,
  Database,
  Folder as FolderIcon,
  Hash,
  Layers,
  Table as TableIcon,
  ToggleLeft,
  Type as TypeIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTablePreview } from "@/core/queries/duckdb";
import { type ColMeta, type ColType, type Dataset, useDataStore } from "@/core/stores/data-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import { useContextBusActions, useSelection } from "@/features/desktop/core/context-bus";

/**
 * QuickLook — a macOS-style "press Space to preview" overlay for the desktop.
 *
 * It watches the global context-bus selection (`useSelection`). When a
 * `dataset` or `folder` is selected and the user presses Space (and they are
 * not typing into a field), a centered glass popover fades in:
 *
 *  - dataset → name, table/view name, row + column counts, a sample-rows mini
 *    table (read-only DuckDB preview) and a tiny per-column type + null% list
 *    built from `dataset.columns` when available, otherwise a tasteful
 *    "Aperçu" of whatever metadata exists.
 *  - folder → a grid of the datasets that live inside it.
 *
 * Escape or a click on the backdrop closes it. Selection is left untouched on
 * close so the next Space re-opens the same preview. Smooth spring motion.
 *
 * This is a self-contained overlay: mount a single `<QuickLook />` once inside
 * the desktop tree. It renders nothing until Space is pressed on a previewable
 * selection.
 */

// ─── Local UI state ─────────────────────────────────────────────────────────
// QuickLook owns only its own open/closed flag. The *target* of the preview is
// always read live from the context-bus at open time, so we never go stale.

// We keep open-state in a module-free way using a tiny reducer over the
// selection + a local React state, so no new store/file is introduced.

// ─── Helpers ────────────────────────────────────────────────────────────────

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function formatInt(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR");
}

function nullPct(col: ColMeta, rowCount: number): number {
  if (!rowCount || rowCount <= 0) return 0;
  return Math.min(100, Math.round((col.nullCount / rowCount) * 100));
}

const TYPE_META: Record<ColType, { label: string; icon: typeof Hash; hue: number }> = {
  number: { label: "Nombre", icon: Hash, hue: 210 },
  string: { label: "Texte", icon: TypeIcon, hue: 268 },
  date: { label: "Date", icon: Calendar, hue: 150 },
  boolean: { label: "Booléen", icon: ToggleLeft, hue: 30 },
  unknown: { label: "Inconnu", icon: Layers, hue: 0 },
};

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toLocaleString("fr-FR");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ─── Dataset preview ────────────────────────────────────────────────────────

function DatasetPreview({ dataset }: { dataset: Dataset }) {
  const tableName = dataset.viewName || dataset.tableName;
  // Read-only preview — renderer DuckDB is read-only; this is a plain SELECT.
  const { data: rows, isLoading } = useTablePreview(tableName || null, 8);

  const previewRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  // Column order: prefer the dataset's declared columns, else infer from rows.
  const columnNames = useMemo(() => {
    if (dataset.columns.length > 0) {
      return dataset.columns.map((c) => c.name);
    }
    const first = previewRows[0];
    return first ? Object.keys(first) : [];
  }, [dataset.columns, previewRows]);

  const hasColumnMeta = dataset.columns.length > 0;

  return (
    <div className="flex max-h-[70vh] flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-[var(--glass-hairline)] px-5 pb-4 pt-5">
        <div
          className="grid size-11 shrink-0 place-items-center rounded-xl"
          style={{
            background: "hsl(var(--glass-accent) / 0.16)",
            color: "hsl(var(--glass-accent))",
          }}
        >
          <Database className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-[17px] font-semibold leading-tight"
            style={{ color: "var(--glass-text)" }}
            title={dataset.name}
          >
            {dataset.name || "Jeu de données"}
          </h2>
          {tableName && (
            <p
              className="mt-0.5 truncate font-mono text-[11px]"
              style={{ color: "var(--glass-text-dim)" }}
              title={tableName}
            >
              {tableName}
            </p>
          )}
        </div>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 px-5 py-3">
        <Stat icon={TableIcon} label="Lignes" value={formatInt(dataset.rowCount)} />
        <Stat
          icon={Layers}
          label="Colonnes"
          value={formatInt(dataset.colCount || columnNames.length || dataset.columns.length)}
        />
        {dataset.format && <Stat icon={Hash} label="Format" value={dataset.format.toUpperCase()} />}
        {typeof dataset.qualityScore === "number" && dataset.qualityScore > 0 && (
          <Stat icon={Layers} label="Qualité" value={`${dataset.qualityScore}%`} />
        )}
      </div>

      {/* Sample rows */}
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-2">
        <SectionLabel>Aperçu des lignes</SectionLabel>
        {isLoading ? (
          <SkeletonTable cols={Math.max(2, Math.min(columnNames.length, 5))} />
        ) : previewRows.length === 0 ? (
          <EmptyHint>Aucune ligne à prévisualiser.</EmptyHint>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--glass-hairline)]">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr>
                  {columnNames.slice(0, 6).map((name) => (
                    <th
                      key={name}
                      className="truncate px-2.5 py-1.5 text-left font-medium"
                      style={{
                        color: "var(--glass-text-dim)",
                        background: "var(--glass-bg-strong)",
                        maxWidth: 140,
                      }}
                      title={name}
                    >
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral preview rows have no stable id
                    key={ri}
                    className="border-t border-[var(--glass-hairline)]"
                  >
                    {columnNames.slice(0, 6).map((name) => (
                      <td
                        key={name}
                        className="truncate px-2.5 py-1.5"
                        style={{ color: "var(--glass-text)", maxWidth: 140 }}
                        title={cellToString(row[name])}
                      >
                        {cellToString(row[name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-column type / null% list */}
      <div className="border-t border-[var(--glass-hairline)] px-5 py-3">
        <SectionLabel>Colonnes</SectionLabel>
        {hasColumnMeta ? (
          <div className="grid max-h-40 grid-cols-1 gap-1 overflow-auto sm:grid-cols-2">
            {dataset.columns.slice(0, 24).map((col) => {
              const meta = TYPE_META[col.type] ?? TYPE_META.unknown;
              const Icon = meta.icon;
              const pct = nullPct(col, dataset.rowCount);
              return (
                <div
                  key={col.name}
                  className="flex items-center gap-2 rounded-md px-2 py-1"
                  style={{ background: "var(--glass-bg)" }}
                >
                  <Icon
                    className="size-3.5 shrink-0"
                    style={{ color: `hsl(${meta.hue} 55% 50%)` }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[11.5px]"
                    style={{ color: "var(--glass-text)" }}
                    title={col.name}
                  >
                    {col.name}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--glass-text-dim)" }}>
                    {meta.label}
                  </span>
                  {pct > 0 && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums"
                      style={{
                        color: pct > 30 ? "#d13438" : "var(--glass-text-dim)",
                        background: pct > 30 ? "rgba(209,52,56,0.12)" : "var(--glass-bg-strong)",
                      }}
                      title={`${pct}% de valeurs nulles`}
                    >
                      {pct}% null
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyHint>
            Métadonnées de colonnes indisponibles. Ouvrez le navigateur de données pour le détail.
          </EmptyHint>
        )}
      </div>
    </div>
  );
}

// ─── Folder preview ─────────────────────────────────────────────────────────

function FolderPreview({ folderId, label }: { folderId: string; label?: string }) {
  const datasets = useDataStore((s) => s.datasets);
  const folders = useFoldersStore((s) => s.folders);
  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);
  const setActive = useDataStore((s) => s.setActiveDataset);
  const { setSelection } = useContextBusActions();

  const folder = folders.find((f) => f.id === folderId);
  const name = folder?.name ?? label ?? "Dossier";

  const inFolder = useMemo(
    () => datasets.filter((d) => (datasetFolderMap[d.id] ?? null) === folderId),
    [datasets, datasetFolderMap, folderId],
  );

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--glass-hairline)] px-5 pb-4 pt-5">
        <div
          className="grid size-11 shrink-0 place-items-center rounded-xl"
          style={{
            background: "hsl(var(--glass-accent) / 0.16)",
            color: "hsl(var(--glass-accent))",
          }}
        >
          <FolderIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-[17px] font-semibold leading-tight"
            style={{ color: "var(--glass-text)" }}
            title={name}
          >
            {name}
          </h2>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--glass-text-dim)" }}>
            {inFolder.length} jeu{inFolder.length > 1 ? "x" : ""} de données
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {inFolder.length === 0 ? (
          <EmptyHint>Ce dossier est vide.</EmptyHint>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {inFolder.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setActive(d.id);
                  setSelection({
                    kind: "dataset",
                    id: d.id,
                    label: d.name,
                  });
                }}
                className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--glass-hairline)] p-3 text-left transition"
                style={{ background: "var(--glass-bg)" }}
              >
                <div
                  className="grid size-8 place-items-center rounded-lg"
                  style={{
                    background: "hsl(var(--glass-accent) / 0.14)",
                    color: "hsl(var(--glass-accent))",
                  }}
                >
                  <Database className="size-4" />
                </div>
                <span
                  className="line-clamp-2 text-[12px] font-medium leading-tight"
                  style={{ color: "var(--glass-text)" }}
                  title={d.name}
                >
                  {d.name}
                </span>
                <span className="text-[10px]" style={{ color: "var(--glass-text-dim)" }}>
                  {formatInt(d.rowCount)} lignes
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small shared bits ──────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value }: { icon: typeof Hash; label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
      style={{ background: "var(--glass-bg)" }}
    >
      <Icon className="size-3.5" style={{ color: "var(--glass-text-dim)" }} />
      <span className="text-[11px]" style={{ color: "var(--glass-text-dim)" }}>
        {label}
      </span>
      <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--glass-text)" }}>
        {value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1.5 mt-1 text-xs font-semibold uppercase tracking-wider"
      style={{ color: "var(--glass-text-dim)" }}
    >
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border border-dashed border-[var(--glass-hairline)] px-3 py-4 text-center text-[12px]"
      style={{ color: "var(--glass-text-dim)" }}
    >
      {children}
    </div>
  );
}

function SkeletonTable({ cols }: { cols: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 5 }).map((_, ri) => (
        <div key={ri} className="flex gap-1.5">
          {Array.from({ length: cols }).map((__, ci) => (
            <div
              key={ci}
              className="h-5 flex-1 animate-pulse rounded"
              style={{ background: "var(--glass-bg-strong)" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Root overlay ───────────────────────────────────────────────────────────

/**
 * QuickLook — mount once inside the desktop. Renders nothing until the user
 * presses Space on a dataset/folder selection in the context-bus.
 *
 * Props: none.
 */
export function QuickLook() {
  const selection = useSelection();
  const getDatasetById = useDataStore((s) => s.getDatasetById);
  const [open, setOpen] = useState(false);

  // Open on Space when a previewable selection exists; close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTypingTarget(e.target)) return;
      const previewable = selection.kind === "dataset" || selection.kind === "folder";
      if (!previewable || !selection.id) return;
      // Space would otherwise scroll the page / toggle buttons.
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection.kind, selection.id, open]);

  // If selection becomes non-previewable while open, close.
  useEffect(() => {
    if (!open) return;
    const previewable = selection.kind === "dataset" || selection.kind === "folder";
    if (!previewable || !selection.id) setOpen(false);
  }, [open, selection.kind, selection.id]);

  const dataset =
    open && selection.kind === "dataset" && selection.id ? getDatasetById(selection.id) : undefined;

  const showFolder = open && selection.kind === "folder" && Boolean(selection.id);

  // Nothing valid to show.
  const hasContent = Boolean(dataset) || showFolder;

  return (
    <AnimatePresence>
      {open && hasContent && (
        <motion.div
          key="quick-look-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[var(--z-palette)] flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.22)" }}
          onPointerDown={() => setOpen(false)}
        >
          <motion.div
            key="quick-look-card"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border"
            style={{
              background: "var(--glass-bg-strong)",
              borderColor: "var(--glass-border)",
              boxShadow: "var(--glass-shadow)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              fontFamily: "var(--font-nerd, inherit)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Aperçu rapide"
          >
            {dataset ? (
              <DatasetPreview dataset={dataset} />
            ) : showFolder && selection.id ? (
              <FolderPreview folderId={selection.id} label={selection.label} />
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default QuickLook;
