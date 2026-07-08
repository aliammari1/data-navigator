"use client";

/**
 * Blocking dialog shown whenever a newly uploaded file contains status codes
 * that are not in the known taxonomy. The user must assign every code to a
 * semantic category before the dialog can be confirmed — there is no way to
 * dismiss it without completing all assignments.
 */

import { AlertTriangle, Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  SEMANTIC_STATUS_OPTIONS,
  STATUS_PRESENTATION,
} from "@/features/telecom/lib/status-definitions";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

/* ─── Semantic selector ─────────────────────────────────────────────────── */

function SemanticSelect({
  value,
  onChange,
}: {
  value: Types.StatusSemantic | "";
  onChange: (v: Types.StatusSemantic) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Types.StatusSemantic)}
        className={cn(
          "h-9 w-full appearance-none rounded-lg border pl-3 pr-8 text-[13px] font-medium",
          "outline-none transition-colors",
          "focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15",
          value === ""
            ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-300"
            : "border-border bg-background text-foreground",
        )}
      >
        <option value="" disabled>
          — Choisir une catégorie —
        </option>
        {SEMANTIC_STATUS_OPTIONS.filter((o) => o.value !== "other").map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value="other">Autre (non classifié)</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/* ─── Row ───────────────────────────────────────────────────────────────── */

function StatusRow({
  code,
  count,
  total,
  semantic,
  onChange,
}: {
  code: string;
  count: number;
  total: number;
  semantic: Types.StatusSemantic | "";
  onChange: (v: Types.StatusSemantic) => void;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const presentation = semantic ? STATUS_PRESENTATION[semantic] : null;
  const isUnassigned = semantic === "";

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_220px] items-center gap-4 rounded-xl border px-4 py-3 transition-colors",
        isUnassigned
          ? "border-amber-300/60 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/5"
          : "border-border bg-card",
      )}
    >
      {/* Code + volume */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {isUnassigned && (
            <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
          )}
          <code className="text-[13px] font-semibold tracking-wide text-foreground">
            {code}
          </code>
          {presentation && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                presentation.badgeClass,
              )}
            >
              {presentation.label}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#2f6bff]/60 transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {count.toLocaleString()} ({pct.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex size-6 items-center justify-center">
        {isUnassigned ? (
          <span className="size-2 rounded-full bg-amber-400" />
        ) : (
          <Check className="size-4 text-emerald-500" />
        )}
      </div>

      {/* Selector */}
      <SemanticSelect value={semantic} onChange={onChange} />
    </div>
  );
}

/* ─── Dialog ────────────────────────────────────────────────────────────── */

export interface UnknownStatusDialogProps {
  /** The new codes detected in the uploaded file, with auto-guessed semantics. */
  pending: Types.StatusMapping[];
  /** Raw status rows for volume counts. */
  rawStatuses: Types.RawStatusRow[];
  /** Called when user confirms — receives the finalized mappings. */
  onConfirm: (confirmed: Types.StatusMapping[]) => void;
}

export function UnknownStatusDialog({
  pending,
  rawStatuses,
  onConfirm,
}: UnknownStatusDialogProps) {
  // Initialize: codes auto-guessed as "other" start blank (must be explicitly chosen)
  const [assignments, setAssignments] = useState<Record<string, Types.StatusSemantic | "">>(() =>
    Object.fromEntries(
      pending.map((p) => [
        p.rawCode,
        // Keep confident auto-detections; reset ambiguous "other" to blank
        p.semantic !== "other" ? p.semantic : "",
      ]),
    ),
  );

  // Re-init if the pending set changes (new file uploaded while dialog is open)
  useEffect(() => {
    setAssignments(
      Object.fromEntries(
        pending.map((p) => [p.rawCode, p.semantic !== "other" ? p.semantic : ""]),
      ),
    );
  }, [pending]);

  const total = rawStatuses.reduce((s, r) => s + r.count, 0);

  const unassigned = useMemo(
    () => Object.values(assignments).filter((v) => v === "").length,
    [assignments],
  );

  const canConfirm = unassigned === 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const confirmed: Types.StatusMapping[] = pending.map((p) => {
      const semantic = (assignments[p.rawCode] as Types.StatusSemantic) ?? "other";
      const presentation = STATUS_PRESENTATION[semantic];
      return {
        rawCode: p.rawCode,
        label: presentation.label,
        semantic,
        color: presentation.color,
        badgeClass: presentation.badgeClass,
      };
    });
    onConfirm(confirmed);
  };

  return (
    /* Full-screen overlay — pointer-events block everything underneath */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        style={{ maxHeight: "min(680px, 90vh)" }}
      >
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 dark:bg-amber-500/15">
              <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-foreground">
                Nouveaux statuts détectés
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Ce fichier contient{" "}
                <strong className="text-foreground">{pending.length}</strong> code
                {pending.length > 1 ? "s" : ""} de statut inconnu
                {pending.length > 1 ? "s" : ""}. Vous devez les classifier avant de continuer.
              </p>
            </div>
          </div>

          {/* Progress pill */}
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#2f6bff] transition-all duration-300"
                style={{ width: `${((pending.length - unassigned) / pending.length) * 100}%` }}
              />
            </div>
            <span className="text-[12px] font-medium text-muted-foreground tabular-nums">
              {pending.length - unassigned} / {pending.length}
            </span>
          </div>
        </div>

        {/* ── Scrollable code list ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-2.5">
            {pending.map((p) => {
              const rs = rawStatuses.find((r) => r.rawCode === p.rawCode);
              return (
                <StatusRow
                  key={p.rawCode}
                  code={p.rawCode}
                  count={rs?.count ?? 0}
                  total={total}
                  semantic={assignments[p.rawCode] ?? ""}
                  onChange={(v) =>
                    setAssignments((prev) => ({ ...prev, [p.rawCode]: v }))
                  }
                />
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[12px] text-muted-foreground">
              {unassigned > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  {unassigned} code{unassigned > 1 ? "s" : ""} restant
                  {unassigned > 1 ? "s" : ""} à classifier
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">
                  Tous les codes sont classifiés
                </span>
              )}
            </p>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold",
                "text-white transition-all",
                canConfirm
                  ? "bg-[#2f6bff] hover:bg-[#1d5ce0] active:scale-[0.98]"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              {canConfirm && <Check className="size-4" strokeWidth={2.5} />}
              Confirmer et continuer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
