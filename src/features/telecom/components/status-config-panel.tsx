"use client";

import { AlertTriangle, Brain, Check, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  SEMANTIC_STATUS_OPTIONS,
  STATUS_AUTO_SEMANTIC_BY_CODE,
} from "@/features/telecom/lib/status-definitions";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { fmtN, fmtPct } from "../lib/format";
import { useStatusMappingEditor } from "./use-status-mapping-editor";

export function StatusConfigPanel({
  rawStatuses,
  mapping,
  onUpdateMapping,
  tableName,
}: {
  rawStatuses: Types.RawStatusRow[];
  mapping: Types.StatusMapping[];
  onUpdateMapping: (m: Types.StatusMapping[]) => void;
  tableName: string;
}) {
  const editor = useStatusMappingEditor({
    rawStatuses,
    mappings: mapping,
    onMappingsChange: onUpdateMapping,
  });

  const {
    mergedStatusMappings,
    unknownRawStatuses,
    loading,
    selectedMappingRawCode,
    selectedRawStatus,
    draft,
    errors,
    updateDraft,
    selectMapping,
    selectRawStatus,
    createMapping,
    saveMapping,
    deleteMapping,
    duplicateMapping,
    refresh,
  } = editor;

  const total = rawStatuses.reduce((s, r) => s + r.count, 0);

  function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return (
      <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">
        {message}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Configuration des Statuts</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Gérez les mappings système et personnalisés pour les codes statut.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Actualiser
          </button>

          <button
            type="button"
            onClick={() => {
              const newMappings = [...mapping];
              for (const rs of unknownRawStatuses) {
                if (newMappings.some((m) => m.rawCode === rs.rawCode)) continue;
                const sem = STATUS_AUTO_SEMANTIC_BY_CODE[rs.rawCode] ?? "other";
                const opt =
                  SEMANTIC_STATUS_OPTIONS.find((o) => o.value === sem) ??
                  SEMANTIC_STATUS_OPTIONS[SEMANTIC_STATUS_OPTIONS.length - 1];
                newMappings.push({
                  rawCode: rs.rawCode,
                  label: opt.label,
                  semantic: sem,
                  color: opt.color,
                  badgeClass: opt.badgeClass,
                  origin: "custom",
                });
              }
              onUpdateMapping(newMappings);
            }}
            disabled={unknownRawStatuses.length === 0}
            className="flex h-9 items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/15 border border-primary/30 text-primary rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Brain className="w-3.5 h-3.5" /> Auto-Map All
          </button>

          <button
            type="button"
            onClick={createMapping}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            Nouveau mapping
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {/* Mapped Statuses */}
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold text-foreground">Mappings configurés</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {mergedStatusMappings.length} mapping{mergedStatusMappings.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="max-h-[400px] divide-y divide-border overflow-y-auto">
              {mergedStatusMappings.map((m) => {
                const rawStatus = rawStatuses.find((rs) => rs.rawCode === m.rawCode);
                const shareOfTotal = total > 0 && rawStatus ? (rawStatus.count / total) * 100 : 0;
                const active = selectedMappingRawCode === m.rawCode;

                return (
                  <button
                    key={m.rawCode}
                    type="button"
                    onClick={() => selectMapping(m)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-muted/40",
                      active && "bg-primary/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <code className="text-xs font-semibold font-mono text-foreground">
                            {m.rawCode}
                          </code>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                              m.origin === "default"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                                : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
                            )}
                          >
                            {m.origin === "default" ? "Système" : "Personnalisé"}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border font-semibold",
                              m.badgeClass,
                            )}
                          >
                            {m.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground capitalize">
                            {m.semantic}
                          </span>
                        </div>

                        {rawStatus && (
                          <div className="mt-1 flex items-center gap-2">
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${Math.min(shareOfTotal, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {fmtN(rawStatus.count)} transactions ({fmtPct(shareOfTotal)})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {mergedStatusMappings.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Aucun mapping configuré.
                </div>
              )}
            </div>
          </section>

          {/* Unknown Raw Statuses */}
          <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-500/25 dark:bg-amber-500/5">
            <div className="flex items-center justify-between border-b border-amber-200/70 px-4 py-3 dark:border-amber-500/20">
              <div>
                <p className="text-xs font-semibold text-foreground">Codes non mappés</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {loading
                    ? "Recherche en cours…"
                    : `${unknownRawStatuses.length} code${unknownRawStatuses.length !== 1 ? "s" : ""} inconnu${unknownRawStatuses.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            </div>

            <div className="max-h-[300px] divide-y divide-amber-200/70 overflow-y-auto dark:divide-amber-500/20">
              {unknownRawStatuses.map((rawStatus) => {
                const key = rawStatus.rawCode;
                const active = selectedRawStatus?.rawCode === key;
                const shareOfTotal = total > 0 ? (rawStatus.count / total) * 100 : 0;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectRawStatus(rawStatus)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-amber-100/50 dark:hover:bg-amber-500/10",
                      active && "bg-amber-100/70 dark:bg-amber-500/15",
                    )}
                  >
                    <code className="block break-words text-[11px] font-semibold text-foreground">
                      {rawStatus.rawCode}
                    </code>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="w-full h-1 bg-amber-200/50 rounded-full overflow-hidden max-w-[150px]">
                        <div
                          className="h-full bg-amber-600 rounded-full transition-all"
                          style={{ width: `${Math.min(shareOfTotal, 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground ml-2">
                        {rawStatus.count.toLocaleString()} transactions
                      </span>
                    </div>
                  </button>
                );
              })}

              {!loading && unknownRawStatuses.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-emerald-700 dark:text-emerald-400">
                  ✓ Tous les codes statut sont mappés.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Editor Sidebar */}
        <aside className="h-fit rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4">
          <h4 className="text-sm font-semibold text-foreground">
            {draft?.rawCode
              ? selectedMappingRawCode
                ? "Modifier le mapping"
                : "Créer un mapping"
              : "Nouveau mapping"}
          </h4>

          {!draft ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Sélectionnez un mapping ou un code non mappé, ou créez un nouveau mapping.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Code brut
                </span>
                <code className="mt-1 block h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground line-clamp-1 break-all outline-none focus:ring-2 focus:ring-primary/15">
                  {draft.rawCode}
                </code>
                <FieldError message={errors.rawCode} />
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Libellé
                </span>
                <input
                  value={draft.label}
                  aria-invalid={Boolean(errors.label)}
                  onChange={(event) => updateDraft({ label: event.target.value })}
                  placeholder="Ex. Réussie, Échec"
                  className={cn(
                    "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                    errors.label ? "border-red-400" : "border-border focus:border-primary",
                  )}
                />
                <FieldError message={errors.label} />
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Catégorie sémantique
                </span>
                <select
                  value={draft.semantic}
                  aria-invalid={Boolean(errors.semantic)}
                  onChange={(event) =>
                    updateDraft({ semantic: event.target.value as Types.StatusSemantic })
                  }
                  className={cn(
                    "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                    errors.semantic ? "border-red-400" : "border-border focus:border-primary",
                  )}
                >
                  <option value="" disabled>
                    Choisir une catégorie
                  </option>
                  {SEMANTIC_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.semantic} />
              </label>

              {draft.rawCode && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Aperçu
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-foreground">
                    <strong>{draft.label.trim() || draft.rawCode}</strong> sera classé dans{" "}
                    <strong>
                      {SEMANTIC_STATUS_OPTIONS.find((o) => o.value === draft.semantic)?.label ||
                        "une catégorie"}
                    </strong>
                    .
                  </p>
                  <div className="mt-2">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full border text-[10px] font-semibold",
                        SEMANTIC_STATUS_OPTIONS.find((o) => o.value === draft.semantic)?.badgeClass,
                      )}
                    >
                      {draft.label.trim() || draft.rawCode}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveMapping}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Check className="size-3.5" />
                  Enregistrer
                </button>

                {selectedMappingRawCode && (
                  <>
                    <button
                      type="button"
                      onClick={duplicateMapping}
                      className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                      title="Dupliquer"
                      aria-label="Dupliquer le mapping"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={deleteMapping}
                      className="grid size-9 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                      title="Supprimer"
                      aria-label="Supprimer le mapping"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-3">
          Légende des mappings actifs
        </div>
        <div className="flex flex-wrap gap-2">
          {mergedStatusMappings.slice(0, 20).map((m) => (
            <div key={m.rawCode} className="flex items-center gap-1.5">
              <code className="text-[10px] font-mono text-muted-foreground">{m.rawCode}</code>
              <span className="text-muted-foreground text-[10px]">→</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full border font-semibold",
                  m.badgeClass,
                )}
              >
                {m.label}
              </span>
            </div>
          ))}
          {mergedStatusMappings.length > 20 && (
            <span className="text-[10px] text-muted-foreground">
              +{mergedStatusMappings.length - 20} autres...
            </span>
          )}
          {mergedStatusMappings.length === 0 && (
            <span className="text-[11px] text-muted-foreground">Aucun mapping configuré.</span>
          )}
        </div>
      </div>
    </div>
  );
}
