"use client";

import { AlertTriangle, Check, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { CANAL_CONFIG } from "@/features/telecom/lib/canal-config";
import type {
  CanalKey,
  CanalRule,
  ColumnMapping,
  UnclassifiedCanalCombo,
} from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { type CanalMatchKind, comboKey } from "./canal-rule-domain";
import { useCanalRulesEditor } from "./use-canal-rules-editor";

export interface CanalRulesPanelProps {
  mapping: ColumnMapping;
  rules: CanalRule[];
  onRulesChange: (rules: CanalRule[]) => void;
  fetchUnclassifiedCanalCombos: (
    mapping: ColumnMapping,
    rules: CanalRule[],
  ) => Promise<UnclassifiedCanalCombo[]>;
}

const MATCH_OPTIONS = [
  { value: "brand", label: "BRAND_D seulement" },
  { value: "brand-layer", label: "BRAND_D + Couche" },
  {
    value: "brand-layer-group",
    label: "BRAND_D + Couche + Groupe",
  },
  { value: "brand-msisdn", label: "BRAND_D + MSISDN" },
] as const satisfies ReadonlyArray<{
  value: CanalMatchKind;
  label: string;
}>;

const CANAL_OPTIONS = Object.keys(CANAL_CONFIG) as CanalKey[];

function ruleMatchSummary(rule: CanalRule): string {
  const parts = [`BRAND_D=${rule.match.brandDValues.join(", ")}`];

  switch (rule.match.kind) {
    case "brand":
      break;
    case "brand-layer":
      parts.push(`LAYER=${rule.match.accountLayerId}`);
      break;
    case "brand-layer-group":
      parts.push(`LAYER=${rule.match.accountLayerId}`);
      parts.push(`GROUP=${rule.match.accountGroupId}`);
      break;
    case "brand-msisdn":
      parts.push(`MSISDN=${rule.match.accountMsisdn}`);
      break;
  }

  return parts.join(" · ");
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function CanalRulesPanel(props: CanalRulesPanelProps) {
  const editor = useCanalRulesEditor({
    mapping: props.mapping,
    rules: props.rules,
    onRulesChange: props.onRulesChange,
    fetchUnclassifiedCanalCombos: props.fetchUnclassifiedCanalCombos,
  });

  const {
    mergedCanalRules,
    unknownCombos,
    loading,
    selectedRuleId,
    selectedComboKey,
    draft,
    errors,
    updateDraft,
    selectRule,
    selectCombo,
    createRule,
    saveRule,
    deleteRule,
    duplicateRule,
    refresh,
  } = editor;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Règles de canaux</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Gérez les règles système, les règles personnalisées et les combinaisons inconnues.
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
            onClick={createRule}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            Nouvelle règle
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold text-foreground">Règles enregistrées</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {mergedCanalRules.length} règle{mergedCanalRules.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="max-h-[440px] divide-y divide-border overflow-y-auto">
              {mergedCanalRules.map((rule) => {
                const config = CANAL_CONFIG[rule.canalKey];
                const active = selectedRuleId === rule.id;

                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => selectRule(rule)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-muted/40",
                      active && "bg-primary/10",
                      !rule.enabled && "opacity-55",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {rule.name}
                          </p>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                              rule.origin === "default"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                                : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
                            )}
                          >
                            {rule.origin === "default" ? "Système" : "Personnalisé"}
                          </span>
                          {!rule.enabled && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                              Désactivée
                            </span>
                          )}
                        </div>

                        <p className="mt-1 break-words font-mono text-[10px] text-muted-foreground">
                          {ruleMatchSummary(rule)}
                        </p>
                      </div>

                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          config.bg,
                          config.border,
                          config.color,
                        )}
                      >
                        {config.shortLabel}
                      </span>
                    </div>
                  </button>
                );
              })}

              {mergedCanalRules.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Aucune règle enregistrée.
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-500/25 dark:bg-amber-500/5">
            <div className="flex items-center justify-between border-b border-amber-200/70 px-4 py-3 dark:border-amber-500/20">
              <div>
                <p className="text-xs font-semibold text-foreground">Combinaisons à classifier</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {loading
                    ? "Recherche en cours…"
                    : `${unknownCombos.length} combinaison${unknownCombos.length !== 1 ? "s" : ""} inconnue${unknownCombos.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            </div>

            <div className="max-h-[360px] divide-y divide-amber-200/70 overflow-y-auto dark:divide-amber-500/20">
              {unknownCombos.map((combo) => {
                const key = comboKey(combo);
                const active = selectedComboKey === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectCombo(combo)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-amber-100/50 dark:hover:bg-amber-500/10",
                      active && "bg-amber-100/70 dark:bg-amber-500/15",
                    )}
                  >
                    <code className="block break-words text-[11px] font-semibold text-foreground">
                      BRAND_D={combo.brandD || "∅"}
                      {combo.accountLayerId && ` · LAYER=${combo.accountLayerId}`}
                      {combo.accountGroupId && ` · GROUP=${combo.accountGroupId}`}
                      {combo.accountMsisdn && ` · MSISDN=${combo.accountMsisdn}`}
                    </code>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {combo.total.toLocaleString()} transactions
                    </p>
                  </button>
                );
              })}

              {!loading && unknownCombos.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-emerald-700 dark:text-emerald-400">
                  ✓ Toutes les combinaisons sont classifiées.
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="h-fit rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4">
          <h4 className="text-sm font-semibold text-foreground">
            {draft?.id ? "Modifier la règle" : "Créer une règle"}
          </h4>

          {!draft ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Sélectionnez une règle ou une combinaison inconnue, ou créez une nouvelle règle.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Nom du canal
                </span>
                <input
                  value={draft.name}
                  aria-invalid={Boolean(errors.name)}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                  placeholder="Ex. IZIPAY, SMT, NEWPAY"
                  className={cn(
                    "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                    errors.name ? "border-red-400" : "border-border focus:border-primary",
                  )}
                />
                <FieldError message={errors.name} />
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Catégorie de rapport
                </span>
                <select
                  value={draft.canalKey}
                  aria-invalid={Boolean(errors.canalKey)}
                  onChange={(event) => updateDraft({ canalKey: event.target.value as CanalKey })}
                  className={cn(
                    "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                    errors.canalKey ? "border-red-400" : "border-border focus:border-primary",
                  )}
                >
                  <option value="" disabled>
                    Choisir une catégorie
                  </option>
                  {CANAL_OPTIONS.map((key) => (
                    <option key={key} value={key}>
                      {CANAL_CONFIG[key].label}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.canalKey} />
              </label>

              {draft.canalKey === "voucher_for_payment" && (
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Type Voucher For Payment
                  </span>
                  <select
                    value={draft.reportGroup ?? ""}
                    aria-invalid={Boolean(errors.reportGroup)}
                    onChange={(event) =>
                      updateDraft({
                        reportGroup:
                          event.target.value === ""
                            ? null
                            : (event.target.value as
                                | "voucher_for_payment_generation"
                                | "voucher_for_payment_redemption"),
                      })
                    }
                    className={cn(
                      "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                      errors.reportGroup ? "border-red-400" : "border-border focus:border-primary",
                    )}
                  >
                    <option value="">Choisir un type</option>
                    <option value="voucher_for_payment_generation">Génération</option>
                    <option value="voucher_for_payment_redemption">
                      Rédemption & Remboursement
                    </option>
                  </select>
                  <FieldError message={errors.reportGroup} />
                </label>
              )}

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Règle active</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Une règle désactivée reste enregistrée mais ne classe rien.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => updateDraft({ enabled: event.target.checked })}
                  className="size-4 accent-primary"
                />
              </label>

              <fieldset>
                <legend className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Portée de correspondance
                </legend>
                <div className="mt-1.5 space-y-1.5">
                  {MATCH_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
                        draft.matchKind === option.value
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/30",
                      )}
                    >
                      <input
                        type="radio"
                        name="canal-rule-match-kind"
                        checked={draft.matchKind === option.value}
                        onChange={() => updateDraft({ matchKind: option.value })}
                        className="accent-primary"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  BRAND_D (séparés par des virgules)
                </span>
                <input
                  value={draft.brandDValuesText}
                  aria-invalid={Boolean(errors.brandDValues)}
                  onChange={(event) => updateDraft({ brandDValuesText: event.target.value })}
                  placeholder="Ex. 56, 57, 58, 59"
                  className={cn(
                    "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                    errors.brandDValues ? "border-red-400" : "border-border focus:border-primary",
                  )}
                />
                <FieldError message={errors.brandDValues} />
              </label>

              {(draft.matchKind === "brand-layer" || draft.matchKind === "brand-layer-group") && (
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ACCOUNT_LAYER_ID
                  </span>
                  <input
                    value={draft.accountLayerId}
                    aria-invalid={Boolean(errors.accountLayerId)}
                    onChange={(event) => updateDraft({ accountLayerId: event.target.value })}
                    className={cn(
                      "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                      errors.accountLayerId
                        ? "border-red-400"
                        : "border-border focus:border-primary",
                    )}
                  />
                  <FieldError message={errors.accountLayerId} />
                </label>
              )}

              {draft.matchKind === "brand-layer-group" && (
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ACCOUNT_GROUP_ID
                  </span>
                  <input
                    value={draft.accountGroupId}
                    aria-invalid={Boolean(errors.accountGroupId)}
                    onChange={(event) => updateDraft({ accountGroupId: event.target.value })}
                    className={cn(
                      "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                      errors.accountGroupId
                        ? "border-red-400"
                        : "border-border focus:border-primary",
                    )}
                  />
                  <FieldError message={errors.accountGroupId} />
                </label>
              )}

              {draft.matchKind === "brand-msisdn" && (
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ACCOUNT_MSISDN
                  </span>
                  <input
                    value={draft.accountMsisdn}
                    aria-invalid={Boolean(errors.accountMsisdn)}
                    onChange={(event) => updateDraft({ accountMsisdn: event.target.value })}
                    className={cn(
                      "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/15",
                      errors.accountMsisdn
                        ? "border-red-400"
                        : "border-border focus:border-primary",
                    )}
                  />
                  <FieldError message={errors.accountMsisdn} />
                </label>
              )}

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Résultat
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-foreground">
                  <strong>{draft.name.trim() || "Ce canal"}</strong> sera classé dans{" "}
                  <strong>
                    {draft.canalKey ? CANAL_CONFIG[draft.canalKey].label : "une catégorie"}
                  </strong>
                  .
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveRule}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Check className="size-3.5" />
                  Enregistrer
                </button>

                {draft.id && (
                  <>
                    <button
                      type="button"
                      onClick={duplicateRule}
                      className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                      title="Dupliquer"
                      aria-label="Dupliquer la règle"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={deleteRule}
                      className="grid size-9 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                      title="Supprimer"
                      aria-label="Supprimer la règle"
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
    </div>
  );
}
