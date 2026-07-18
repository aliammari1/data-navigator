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
  availableMatchKinds,
  buildCanalRule,
  type CanalMatchKind,
  comboMatchesRule,
  defaultMatchKind,
} from "@/features/telecom/lib/canal-mapping-scope";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

const CANAL_OPTIONS = Object.entries(CANAL_CONFIG) as Array<
  [Types.CanalKey, (typeof CANAL_CONFIG)[Types.CanalKey]]
>;

type Assignment = Types.CanalKey | "";

interface RowState {
  name: string;
  canal: Assignment;
  matchKind: CanalMatchKind;
  reportGroup: Types.CanalRuleReportGroup;
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
    pending.map((combo) => [
      comboKey(combo),
      {
        name: "",
        canal: "" as Assignment,
        matchKind: defaultMatchKind(combo),
        reportGroup: null,
      },
    ]),
  );
}

const DRAFT_TIMESTAMP = "2026-01-01T00:00:00.000Z";

function rowStateIsComplete(state: RowState | undefined): state is RowState & {
  canal: Types.CanalKey;
} {
  if (!state) return false;
  if (!state.name.trim()) return false;
  if (!state.canal) return false;

  if (state.canal === "voucher_for_payment" && state.reportGroup === null) {
    return false;
  }

  return true;
}

/**
 * Builds a deterministic temporary rule for coverage calculation.
 *
 * This rule is never persisted, so it must not generate a random ID or a new
 * timestamp on every render.
 */
function buildDraftRule(
  combo: Types.UnclassifiedCanalCombo,
  state: RowState,
): Types.CanalRule | null {
  if (!rowStateIsComplete(state)) {
    return null;
  }

  return buildCanalRule(combo, state.matchKind, state.canal, state.name, {
    id: `draft:${comboKey(combo)}`,
    timestamp: DRAFT_TIMESTAMP,
    reportGroup: state.reportGroup,
    origin: "custom",
    enabled: true,
  });
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

    for (const candidate of pending) {
      const candidateKey = comboKey(candidate);

      if (candidateKey === key) {
        continue;
      }

      const candidateState = rows[candidateKey];
      const rule = candidateState ? buildDraftRule(candidate, candidateState) : null;

      if (!rule) {
        continue;
      }

      if (comboMatchesRule(combo, rule)) {
        coverage.set(key, candidateKey);
        break;
      }
    }
  }

  return coverage;
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

function ComboListItem({
  combo,
  total,
  state,
  active,
  coveredBy,
  onClick,
}: {
  combo: Types.UnclassifiedCanalCombo;
  total: number;
  state: RowState;
  active: boolean;
  coveredBy?: Types.UnclassifiedCanalCombo;
  onClick: () => void;
}) {
  const pct = total > 0 ? (combo.total / total) * 100 : 0;
  const isAssigned = state.canal !== "" && state.name.trim() !== "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition-colors",
        active && "border-[#2f6bff] bg-[#2f6bff]/10 ring-1 ring-[#2f6bff]",
        !active &&
          !isAssigned &&
          "border-amber-300/60 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/5",
        !active && isAssigned && "border-border bg-card hover:bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <code className="min-w-0 text-[11px] font-semibold text-foreground">
          BRAND_D={combo.brandD || "∅"}
          {combo.accountLayerId && ` · LAYER=${combo.accountLayerId}`}
          {combo.accountGroupId && ` · GROUP=${combo.accountGroupId}`}
          {combo.accountMsisdn && ` · MSISDN=${combo.accountMsisdn}`}
        </code>

        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            coveredBy
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : isAssigned
                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
          )}
        >
          {coveredBy ? "Couvert" : isAssigned ? "Configuré" : "À classer"}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[#2f6bff]"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        <span className="text-[11px] text-muted-foreground">
          {combo.total.toLocaleString()} ({pct.toFixed(1)}%)
        </span>
      </div>

      {coveredBy && (
        <p className="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          ✓ Couvert par une règle pour BRAND_D={coveredBy.brandD}
        </p>
      )}

      {!coveredBy && isAssigned && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {state.name} · {CANAL_CONFIG[state.canal as Types.CanalKey].shortLabel}
        </p>
      )}
    </button>
  );
}

function RuleEditor({
  combo,
  state,
  onChange,
}: {
  combo: Types.UnclassifiedCanalCombo;
  state: RowState;
  onChange: (patch: Partial<RowState>) => void;
}) {
  const availableKinds = availableMatchKinds(combo);

  const category = state.canal ? CANAL_CONFIG[state.canal] : null;

  return (
    <aside className="h-fit rounded-xl border border-border bg-card p-4 md:sticky md:top-0">
      <h3 className="text-[13px] font-semibold text-foreground">Créer la règle</h3>

      <p className="mt-1 text-[11px] text-muted-foreground">BRAND_D={combo.brandD || "∅"}</p>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nom du canal
          </span>

          <input
            type="text"
            value={state.name}
            onChange={(event) =>
              onChange({
                name: event.target.value,
              })
            }
            placeholder="Ex. IZIPAY, SMT, NEWPAY"
            autoComplete="off"
            className={cn(
              "mt-1 h-9 w-full rounded-lg border bg-background px-3",
              "text-[13px] text-foreground outline-none",
              "placeholder:text-muted-foreground/60",
              "focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15",
              state.name.trim() ? "border-border" : "border-amber-300 dark:border-amber-500/40",
            )}
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Catégorie de rapport
          </span>

          <div className="mt-1">
            <CanalSelect
              value={state.canal}
              onChange={(canal) =>
                onChange({
                  canal,
                  /*
                   * A report group is only meaningful for Voucher For
                   * Payment. Clear it when another category is selected.
                   */
                  reportGroup: canal === "voucher_for_payment" ? state.reportGroup : null,
                })
              }
            />
          </div>
        </label>

        {state.canal === "voucher_for_payment" && (
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type Voucher For Payment
            </span>

            <select
              value={state.reportGroup ?? ""}
              onChange={(event) =>
                onChange({
                  reportGroup:
                    event.target.value === ""
                      ? null
                      : (event.target.value as Exclude<Types.CanalRuleReportGroup, null>),
                })
              }
              className={cn(
                "mt-1 h-9 w-full rounded-lg border bg-background px-3",
                "text-[13px] text-foreground outline-none",
                "focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15",
                state.reportGroup ? "border-border" : "border-amber-300 dark:border-amber-500/40",
              )}
            >
              <option value="" disabled>
                Choisir un type
              </option>

              <option value="voucher_for_payment_generation">Génération</option>

              <option value="voucher_for_payment_redemption">Rédemption & Remboursement</option>
            </select>
          </label>
        )}

        <fieldset>
          <legend className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Appliquer la règle à
          </legend>

          <div className="mt-1.5 space-y-1.5">
            {(
              [
                ["brand", "BRAND_D seulement"],
                ["brand-layer", "BRAND_D + Couche"],
                ["brand-layer-group", "BRAND_D + Couche + Groupe"],
                ["brand-msisdn", "BRAND_D + MSISDN"],
              ] as const satisfies ReadonlyArray<readonly [CanalMatchKind, string]>
            ).map(([matchKind, label]) => {
              const enabled = availableKinds.includes(matchKind);

              return (
                <label
                  key={matchKind}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
                    state.matchKind === matchKind
                      ? "border-[#2f6bff] bg-[#2f6bff]/10"
                      : "border-border bg-muted/30",
                    !enabled && "cursor-not-allowed opacity-45",
                  )}
                >
                  <input
                    type="radio"
                    name={`match-${comboKey(combo)}`}
                    checked={state.matchKind === matchKind}
                    disabled={!enabled}
                    onChange={() =>
                      onChange({
                        matchKind,
                      })
                    }
                    className="accent-[#2f6bff]"
                  />

                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>

        {state.canal && state.name.trim() && category && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Résultat
            </p>

            <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">
              Cette règle classera <strong>{state.name.trim()}</strong> dans{" "}
              <strong>{category.label}</strong>.
            </p>
          </div>
        )}
      </div>
    </aside>
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
  onConfirm: (confirmed: Types.CanalRule[]) => void;
}

export function UnknownCanalDialog({ pending, onConfirm }: UnknownCanalDialogProps) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => initialRows(pending));
  const [selectedKey, setSelectedKey] = useState<string>(() =>
    pending[0] ? comboKey(pending[0]) : "",
  );
  // Combos the user explicitly pulled out of an auto-covering rule to
  // classify on their own, even though a broader rule would otherwise cover them.
  const [splitOut, setSplitOut] = useState<Set<string>>(new Set());

  // Re-init if the pending set changes (new file uploaded while dialog is open)
  useEffect(() => {
    setRows(initialRows(pending));
    setSplitOut(new Set());
    setSelectedKey(pending[0] ? comboKey(pending[0]) : "");
  }, [pending]);

  const total = pending.reduce((s, p) => s + p.total, 0);

  const coverage = useMemo(() => computeCoverage(pending, rows), [pending, rows]);

  const isCovered = (key: string) => coverage.has(key) && !splitOut.has(key);

  const selectedCombo = pending.find((combo) => comboKey(combo) === selectedKey) ?? pending[0];

  const selectedState = selectedCombo ? rows[comboKey(selectedCombo)] : undefined;

  function updateSelectedRow(patch: Partial<RowState>) {
    if (!selectedCombo) return;

    const key = comboKey(selectedCombo);

    setRows((previous) => ({
      ...previous,
      [key]: {
        ...previous[key],
        ...patch,
      },
    }));
  }

  const unresolved = pending.filter((combo) => {
    const key = comboKey(combo);

    if (isCovered(key)) {
      return false;
    }

    return !rowStateIsComplete(rows[key]);
  });

  const canConfirm = unresolved.length === 0;

  const handleConfirm = () => {
    if (!canConfirm) return;

    const confirmed: Types.CanalRule[] = [];
    const timestamp = new Date().toISOString();

    for (const combo of pending) {
      const key = comboKey(combo);

      if (isCovered(key)) {
        continue;
      }

      const state = rows[key];

      if (!rowStateIsComplete(state)) {
        continue;
      }

      confirmed.push(
        buildCanalRule(combo, state.matchKind, state.canal, state.name, {
          id: crypto.randomUUID(),
          timestamp,
          reportGroup: state.reportGroup,
          origin: "custom",
          enabled: true,
        }),
      );
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
        className="flex w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
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
          <div className="grid gap-5 md:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-2.5">
              {pending.map((combo) => {
                const key = comboKey(combo);
                const coveringKey = coverage.get(key);

                const coveringCombo = coveringKey
                  ? pending.find((item) => comboKey(item) === coveringKey)
                  : undefined;

                return (
                  <ComboListItem
                    key={key}
                    combo={combo}
                    total={total}
                    state={rows[key]}
                    active={key === selectedKey}
                    coveredBy={coveringCombo && !splitOut.has(key) ? coveringCombo : undefined}
                    onClick={() => {
                      setSelectedKey(key);

                      if (splitOut.has(key)) return;

                      setSplitOut((previous) => {
                        const next = new Set(previous);
                        next.add(key);
                        return next;
                      });
                    }}
                  />
                );
              })}
            </div>

            {selectedCombo && selectedState && (
              <RuleEditor
                combo={selectedCombo}
                state={selectedState}
                onChange={updateSelectedRow}
              />
            )}
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
