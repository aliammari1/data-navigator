"use client";

import { Calendar, CalendarDays, Clock, FolderTree, Layers, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { useFoldersActions, useFoldersStore } from "@/core/stores/folders-store";
import {
  analyzeTemporalDatasets,
  applyTemporalOrganization,
  type TemporalGranularity,
} from "../lib/date-organizer";

interface DateOrganizeModalProps {
  open: boolean;
  onClose: () => void;
  onApplied?: (count: number) => void;
}

export function DateOrganizeModal({ open, onClose, onApplied }: DateOrganizeModalProps) {
  const datasets = useDataStore((s) => s.datasets);
  const folders = useFoldersStore((s) => s.folders);
  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);
  const { addFolder, moveDataset } = useFoldersActions();

  const [granularity, setGranularity] = useState<TemporalGranularity>("year-month");
  const [onlyUngrouped, setOnlyUngrouped] = useState(true);
  const [includeUncategorized, setIncludeUncategorized] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

  // Filter datasets based on whether user wants only ungrouped or all
  const targetDatasets = useMemo(() => {
    if (onlyUngrouped) {
      return datasets.filter((ds) => !datasetFolderMap[ds.id]);
    }
    return datasets;
  }, [datasets, datasetFolderMap, onlyUngrouped]);

  // Analyze all target datasets
  const extractions = useMemo(() => {
    return analyzeTemporalDatasets(targetDatasets, granularity, includeUncategorized);
  }, [targetDatasets, granularity, includeUncategorized]);

  // Initialize selection when opening or changing target datasets
  const effectiveSelectedIds = useMemo(() => {
    if (!hasInitializedSelection) {
      // By default select all that have a proposed path
      return new Set(extractions.filter((e) => e.proposedPath.length > 0).map((e) => e.datasetId));
    }
    return selectedIds;
  }, [extractions, hasInitializedSelection, selectedIds]);

  const toggleSelect = (id: string) => {
    setHasInitializedSelection(true);
    setSelectedIds((prev) => {
      const next = new Set(
        prev.size === 0 && !hasInitializedSelection ? effectiveSelectedIds : prev,
      );
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setHasInitializedSelection(true);
    const validCount = extractions.filter((e) => e.proposedPath.length > 0).length;
    if (effectiveSelectedIds.size === validCount) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(
        new Set(extractions.filter((e) => e.proposedPath.length > 0).map((e) => e.datasetId)),
      );
    }
  };

  // Execution
  const handleApply = () => {
    const toApply = extractions.filter(
      (e) => effectiveSelectedIds.has(e.datasetId) && e.proposedPath.length > 0,
    );
    if (toApply.length === 0) return;

    const result = applyTemporalOrganization({
      extractions: toApply,
      existingFolders: folders,
      addFolder,
      moveDataset,
    });

    onApplied?.(result.datasetsMoved);
    onClose();
  };

  if (!open) return null;

  const validCount = extractions.filter((e) => e.proposedPath.length > 0).length;
  const activeCount = effectiveSelectedIds.size;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          className="relative flex h-[85vh] max-h-[780px] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden text-foreground"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Organisation Temporelle IA</h2>
                <p className="text-xs text-muted-foreground">
                  Détecte automatiquement les dates, mois, trimestres et fréquences dans les noms de
                  fichiers.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Config Controls */}
          <div className="grid grid-cols-1 gap-4 border-b border-border bg-card/50 p-6 md:grid-cols-2">
            {/* Granularity Selection */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Structure hiérarchique
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGranularity("year-month")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    granularity === "year-month"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <Calendar className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <div>Année &gt; Mois</div>
                    <div className="text-[10px] text-muted-foreground">2024 / 03 - Mars</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setGranularity("year-quarter")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    granularity === "year-quarter"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <div>Année &gt; Trimestre</div>
                    <div className="text-[10px] text-muted-foreground">2024 / T1 (Jan - Mar)</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setGranularity("year-month-day")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    granularity === "year-month-day"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <div>Année &gt; Mois &gt; Jour</div>
                    <div className="text-[10px] text-muted-foreground">2024 / 03 / Jour 15</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setGranularity("frequency-year")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    granularity === "frequency-year"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <Clock className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <div>Fréquence &gt; Période</div>
                    <div className="text-[10px] text-muted-foreground">Quotidien / 2024</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Scope & Options */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Portée & Options
              </label>
              <div className="mt-2 space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyUngrouped}
                    onChange={(e) => {
                      setOnlyUngrouped(e.target.checked);
                      setHasInitializedSelection(false);
                    }}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>
                    Uniquement les fichiers non classés (
                    {datasets.filter((ds) => !datasetFolderMap[ds.id]).length})
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeUncategorized}
                    onChange={(e) => setIncludeUncategorized(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Placer aussi les fichiers sans date dans « Autres (Sans date) »</span>
                </label>
              </div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold text-muted-foreground">
                Prévisualisation des classements ({validCount} fichier(s) détecté(s))
              </div>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {activeCount === validCount ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            </div>

            {extractions.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <FolderTree className="h-10 w-10 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-sm font-medium">Aucun jeu de données à organiser.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {extractions.map((item) => {
                  const isSelected = effectiveSelectedIds.has(item.datasetId);
                  const hasPath = item.proposedPath.length > 0;

                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: clickable preview row
                    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard toggling handled by checkbox
                    <div
                      key={item.datasetId}
                      onClick={() => hasPath && toggleSelect(item.datasetId)}
                      className={`flex items-center gap-4 px-4 py-3 text-xs transition-colors cursor-pointer ${
                        !hasPath
                          ? "opacity-50 cursor-not-allowed bg-muted/20"
                          : isSelected
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "hover:bg-accent/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!hasPath}
                        onChange={() => hasPath && toggleSelect(item.datasetId)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 shrink-0"
                      />

                      {/* File details */}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground truncate">
                          {item.datasetName}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.2 font-mono font-medium ${
                              item.confidence === "high"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : item.confidence === "medium"
                                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                  : item.confidence === "low"
                                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                    : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {item.sourceExplanation}
                          </span>
                        </div>
                      </div>

                      {/* Proposed Destination */}
                      <div className="shrink-0 text-right">
                        {hasPath ? (
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            {item.proposedPath.map((segment, idx) => (
                              <span key={segment} className="flex items-center gap-1">
                                {idx > 0 && <span className="text-muted-foreground">/</span>}
                                <span className="rounded bg-accent px-1.5 py-0.5 text-[11px]">
                                  {segment}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Non modifié</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
            <div className="text-xs text-muted-foreground">
              {activeCount} fichier{activeCount > 1 ? "s" : ""} sélectionné
              {activeCount > 1 ? "s" : ""} sur {validCount}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-accent"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={activeCount === 0}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Appliquer le classement ({activeCount})
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
