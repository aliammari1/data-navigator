"use client";

/**
 * Blocking dialog shown whenever a newly uploaded file contains transactions
 * that match none of the 10 hardcoded canal rules (`canalCaseExpr` in
 * sql.ts). The user must assign every combo to one of the 10 canals before
 * the dialog can be confirmed — there is no "leave unclassified" option.
 * Mirrors `unknown-status-dialog.tsx`, which resolves unrecognised status
 * codes the same way; this is the canal-classification equivalent.
 *
 * Unlike status codes (one raw value per code), a canal rule can key on
 * BRAND_D alone, or BRAND_D plus any subset of layer/group/msisdn — see
 * `canal-mapping-scope.ts`. Each row lets the user pick which fields actually
 * belong in the match, and any other pending combo that a chosen rule
 * already covers (e.g. "this whole BRAND_D") is auto-resolved instead of
 * asking the user to classify each near-duplicate combo separately.
 */

import { AlertTriangle, Check, ChevronDown, SplitSquareHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CANAL_CONFIG } from "@/features/telecom/lib/canal-config";
import {
  buildCanalMapping,
  type CanalFieldChoice,
  comboMatchesRule,
  defaultFieldChoice,
} from "@/features/telecom/lib/canal-mapping-scope";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

const CANAL_OPTIONS = Object.entries(CANAL_CONFIG) as Array<
  [Types.CanalKey, (typeof CANAL_CONFIG)[Types.CanalKey]]
>;

type Assignment = Types.CanalKey | "";

interface RowState {
  canal: Assignment;
  fields: CanalFieldChoice;
}

function comboKey(p: {
  brandD: string;
  accountLayerId: string;
  accountGroupId: string;
  accountMsisdn: string;
}): string {
  return [p.brandD, p.accountLayerId, p.accountGroupId, p.accountMsisdn].join("|");
}

function initialRows(pending: Types.UnclassifiedCanalCombo[]): Record<string, RowState> {
  return Object.fromEntries(
    pending.map((p) => [comboKey(p), { canal: "" as Assignment, fields: defaultFieldChoice(p) }]),
  );
}

/** For each combo, the comboKey of another pending combo whose CURRENTLY
 * assigned rule already covers it (so it doesn't need its own assignment).
 * Only combos with a canal chosen can cover others — no transitive chains. */
function computeCoverage(
  pending: Types.UnclassifiedCanalCombo[],
  rows: Record<string, RowState>,
): Map<string, string> {
  const coverage = new Map<string, string>();
  for (const combo of pending) {
    const key = comboKey(combo);
    for (const other of pending) {
      const otherKey = comboKey(other);
      if (otherKey === key) continue;
      const otherState = rows[otherKey];
      if (!otherState?.canal) continue;
      const rule = buildCanalMapping(other, otherState.fields, otherState.canal);
      if (comboMatchesRule(combo, rule)) {
        coverage.set(key, otherKey);
        break;
      }
    }
  }
  return coverage;
}

/* ─── Field-scope chips ─────────────────────────────────────────────────── */

function FieldChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
        checked
          ? "border-[#2f6bff]/40 bg-[#2f6bff]/10 text-[#2f6bff]"
          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
      )}
    >
      + {label}
    </button>
  );
}

/* ─── Canal selector ────────────────────────────────────────────────────── */

function CanalSelect({
  value,
  onChange,
}: {
  value: Assignment;
  onChange: (v: Assignment) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Assignment)}
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
          — Choisir un canal —
        </option>
        {CANAL_OPTIONS.map(([key, cfg]) => (
          <option key={key} value={key}>
            {cfg.shortLabel}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/* ─── Row ───────────────────────────────────────────────────────────────── */

function ComboRow({
  combo,
  total,
  state,
  onCanalChange,
  onFieldsChange,
}: {
  combo: Types.UnclassifiedCanalCombo;
  total: number;
  state: RowState;
  onCanalChange: (v: Assignment) => void;
  onFieldsChange: (v: CanalFieldChoice) => void;
}) {
  const pct = total > 0 ? (combo.total / total) * 100 : 0;
  const isUnassigned = state.canal === "";
  const cfg = state.canal ? CANAL_CONFIG[state.canal] : null;

  const hasLayer = combo.accountLayerId !== "";
  const hasGroup = combo.accountGroupId !== "";
  const hasMsisdn = combo.accountMsisdn !== "";
  const showScopeChips = hasLayer || hasGroup || hasMsisdn;

  // Group requires layer in every real rule (report-engine.ts never uses
  // GROUP alone) — keep the toggle UI consistent with that.
  const toggleLayer = (v: boolean) =>
    onFieldsChange({ ...state.fields, layer: v, group: v ? state.fields.group : false });
  const toggleGroup = (v: boolean) =>
    onFieldsChange({ ...state.fields, layer: v || state.fields.layer, group: v });
  const toggleMsisdn = (v: boolean) => onFieldsChange({ ...state.fields, msisdn: v });

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_220px] items-start gap-4 rounded-xl border px-4 py-3 transition-colors",
        isUnassigned
          ? "border-amber-300/60 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/5"
          : "border-border bg-card",
      )}
    >
      {/* Raw account combo + volume + match scope */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {isUnassigned && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />}
          <code className="text-[12px] font-semibold tracking-wide text-foreground">
            BRAND_D={combo.brandD || "∅"}
            {hasLayer && ` · LAYER=${combo.accountLayerId}`}
            {hasGroup && ` · GROUP=${combo.accountGroupId}`}
            {hasMsisdn && ` · MSISDN=${combo.accountMsisdn}`}
          </code>
          {cfg && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                cfg.bg,
                cfg.border,
                cfg.color,
              )}
            >
              {cfg.shortLabel}
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
            {combo.total.toLocaleString()} ({pct.toFixed(1)}%)
          </span>
        </div>

        {showScopeChips && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Restreindre aussi par :
            </span>
            {hasLayer && (
              <FieldChip label="Couche" checked={state.fields.layer} onChange={toggleLayer} />
            )}
            {hasGroup && (
              <FieldChip label="Groupe" checked={state.fields.group} onChange={toggleGroup} />
            )}
            {hasMsisdn && (
              <FieldChip label="MSISDN" checked={state.fields.msisdn} onChange={toggleMsisdn} />
            )}
          </div>
        )}
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
      <CanalSelect value={state.canal} onChange={onCanalChange} />
    </div>
  );
}

/* ─── Covered row (auto-resolved by a broader rule above) ──────────────── */

function CoveredRow({
  combo,
  coveringCombo,
  onSplitOut,
}: {
  combo: Types.UnclassifiedCanalCombo;
  coveringCombo: Types.UnclassifiedCanalCombo;
  onSplitOut: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Check className="size-3.5 shrink-0 text-emerald-500/70" />
        <code className="truncate text-[11px] text-muted-foreground">
          BRAND_D={combo.brandD} · LAYER={combo.accountLayerId || "∅"} · GROUP=
          {combo.accountGroupId || "∅"} · MSISDN={combo.accountMsisdn || "∅"}
        </code>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          — couvert par la règle BRAND_D={coveringCombo.brandD} ci-dessus
        </span>
      </div>
      <button
        type="button"
        onClick={onSplitOut}
        className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#2f6bff] hover:underline"
      >
        <SplitSquareHorizontal className="size-3" />
        Classifier séparément
      </button>
    </div>
  );
}

/* ─── Dialog ────────────────────────────────────────────────────────────── */

export interface UnknownCanalDialogProps {
  /** New combos detected in the uploaded file that match none of the 10 canal rules. */
  pending: Types.UnclassifiedCanalCombo[];
  /** Called when the user confirms — receives the finalized mappings. */
  onConfirm: (confirmed: Types.CanalMapping[]) => void;
}

export function UnknownCanalDialog({ pending, onConfirm }: UnknownCanalDialogProps) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => initialRows(pending));
  // Combos the user explicitly pulled out of an auto-covering rule to
  // classify on their own, even though a broader rule would otherwise cover them.
  const [splitOut, setSplitOut] = useState<Set<string>>(new Set());

  // Re-init if the pending set changes (new file uploaded while dialog is open)
  useEffect(() => {
    setRows(initialRows(pending));
    setSplitOut(new Set());
  }, [pending]);

  const total = pending.reduce((s, p) => s + p.total, 0);

  const coverage = useMemo(() => computeCoverage(pending, rows), [pending, rows]);

  const isCovered = (key: string) => coverage.has(key) && !splitOut.has(key);

  const unresolved = pending.filter(
    (p) => !isCovered(comboKey(p)) && rows[comboKey(p)]?.canal === "",
  );

  const canConfirm = unresolved.length === 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const confirmed: Types.CanalMapping[] = [];
    for (const p of pending) {
      const key = comboKey(p);
      if (isCovered(key)) continue; // already resolved by another rule below
      const state = rows[key];
      confirmed.push(buildCanalMapping(p, state.fields, state.canal as Types.CanalKey));
    }
    onConfirm(confirmed);
  };

  const resolvedCount = pending.length - unresolved.length;

  return (
    /* Full-screen overlay — pointer-events block everything underneath */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        style={{ maxHeight: "min(720px, 90vh)" }}
      >
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 dark:bg-amber-500/15">
              <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-foreground">
                Nouveaux canaux détectés
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Ce fichier contient <strong className="text-foreground">{pending.length}</strong>{" "}
                combinaison{pending.length > 1 ? "s" : ""} de compte inconnue
                {pending.length > 1 ? "s" : ""} ({total.toLocaleString()} transaction
                {total > 1 ? "s" : ""}) qui ne correspond{pending.length > 1 ? "ent" : ""} à aucun
                canal du cahier des charges. Classifiez-les avant de continuer — sinon elles
                resteront invisibles du total par produit/canal.
              </p>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Chaque règle peut se limiter à Brand D seul, ou se restreindre par couche, groupe ou
                MSISDN — comme dans le cahier des charges. Une règle plus large couvre
                automatiquement les autres combinaisons concernées ci-dessous.
              </p>
            </div>
          </div>

          {/* Progress pill */}
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#2f6bff] transition-all duration-300"
                style={{ width: `${(resolvedCount / pending.length) * 100}%` }}
              />
            </div>
            <span className="text-[12px] font-medium text-muted-foreground tabular-nums">
              {resolvedCount} / {pending.length}
            </span>
          </div>
        </div>

        {/* ── Scrollable combo list ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-2.5">
            {pending.map((p) => {
              const key = comboKey(p);
              const coveringKey = coverage.get(key);
              if (coveringKey && !splitOut.has(key)) {
                const coveringCombo = pending.find((c) => comboKey(c) === coveringKey);
                if (coveringCombo) {
                  return (
                    <CoveredRow
                      key={key}
                      combo={p}
                      coveringCombo={coveringCombo}
                      onSplitOut={() => setSplitOut((prev) => new Set(prev).add(key))}
                    />
                  );
                }
              }
              return (
                <ComboRow
                  key={key}
                  combo={p}
                  total={total}
                  state={rows[key]}
                  onCanalChange={(v) =>
                    setRows((prev) => ({ ...prev, [key]: { ...prev[key], canal: v } }))
                  }
                  onFieldsChange={(fields) =>
                    setRows((prev) => ({ ...prev, [key]: { ...prev[key], fields } }))
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
              {unresolved.length > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  {unresolved.length} combinaison{unresolved.length > 1 ? "s" : ""} restante
                  {unresolved.length > 1 ? "s" : ""} à classifier
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">
                  Toutes les combinaisons sont classifiées
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
