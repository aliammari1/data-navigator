"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_CANAL_CHANNELS } from "@/features/telecom/lib/canal-hierarchy";
import {
  type CanalRuleDraft,
  comboKey,
  draftFromCombo,
  draftFromRule,
  duplicateCanalRuleDraft,
  emptyCanalRuleDraft,
  validateAndBuildCanalRule,
} from "./canal-rule-domain";
import type { CanalRule, ColumnMapping, UnclassifiedCanalCombo } from "@/features/telecom/types";

export interface UseCanalRulesEditorOptions {
  mapping: ColumnMapping;
  rules: CanalRule[];

  onRulesChange: (rules: CanalRule[]) => void;

  fetchUnclassifiedCanalCombos: (
    mapping: ColumnMapping,
    rules: CanalRule[],
  ) => Promise<UnclassifiedCanalCombo[]>;
}

export function useCanalRulesEditor({
  mapping,
  rules,
  onRulesChange,
  fetchUnclassifiedCanalCombos,
}: UseCanalRulesEditorOptions) {
  // Merge custom rules with default system rules
  // Custom rules (including overrides) take precedence over default rules
  const mergedCanalRules = useMemo(() => {
    const customById = new Map<string, CanalRule>();
    for (const rule of rules) {
      customById.set(rule.id, rule);
    }
    const merged: CanalRule[] = [];
    
    // Add all default rules first
    for (const defaultRule of ALL_CANAL_CHANNELS) {
      const customOverride = customById.get(defaultRule.id);
      if (customOverride) {
        // Use custom override instead of default rule
        merged.push(customOverride);
      } else {
        // Use default rule
        merged.push(defaultRule);
      }
    }
    
    // Add any custom rules that don't override existing defaults
    for (const customRule of rules) {
      if (!ALL_CANAL_CHANNELS.some(defaultRule => defaultRule.id === customRule.id)) {
        merged.push(customRule);
      }
    }
    
    return merged;
  }, [rules]);

  const [unknownCombos, setUnknownCombos] = useState<UnclassifiedCanalCombo[]>([]);

  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(mergedCanalRules[0]?.id ?? null);

  const [selectedComboKey, setSelectedComboKey] = useState<string | null>(null);

  const [draft, setDraft] = useState<CanalRuleDraft | null>(
    mergedCanalRules[0] ? draftFromRule(mergedCanalRules[0]) : null,
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedRule = useMemo(
    () => (selectedRuleId ? (mergedCanalRules.find((rule) => rule.id === selectedRuleId) ?? null) : null),
    [mergedCanalRules, selectedRuleId],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        // Pass merged rules (defaults + custom) to ensure all default rules are considered
        const result = await fetchUnclassifiedCanalCombos(mapping, mergedCanalRules);

        if (!cancelled) {
          setUnknownCombos(result);
        }
      } catch (error) {
        console.error("[CanalRulesEditor] Unable to load unknown combinations", error);

        if (!cancelled) {
          setUnknownCombos([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [fetchUnclassifiedCanalCombos, mapping, refreshVersion, mergedCanalRules]);

  const updateDraft = useCallback((patch: Partial<CanalRuleDraft>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            ...patch,
          }
        : current,
    );

    setErrors({});
  }, []);

  const selectRule = useCallback((rule: CanalRule) => {
    setSelectedRuleId(rule.id);
    setSelectedComboKey(null);
    
    // If this is a default rule, create an editable custom override
    const draftForEdit = rule.origin === "default" 
      ? { ...draftFromRule(rule), origin: "custom" as const }
      : draftFromRule(rule);
    
    setDraft(draftForEdit);
    setErrors({});
  }, []);

  const selectCombo = useCallback((combo: UnclassifiedCanalCombo) => {
    setSelectedRuleId(null);
    setSelectedComboKey(comboKey(combo));
    setDraft(draftFromCombo(combo));
    setErrors({});
  }, []);

  const createRule = useCallback(() => {
    setSelectedRuleId(null);
    setSelectedComboKey(null);
    setDraft(emptyCanalRuleDraft());
    setErrors({});
  }, []);

  const saveRule = useCallback((): boolean => {
    if (!draft) return false;

    const result = validateAndBuildCanalRule(
      draft,
      () => crypto.randomUUID(),
      () => new Date().toISOString(),
    );

    if (!result.success) {
      setErrors(result.errors);
      return false;
    }

    const customRule = result.rule;
    
    // For overrides of default rules: find if there's already a custom rule with this ID
    const existingCustomIndex = rules.findIndex(rule => rule.id === customRule.id);
    
    const nextRules = existingCustomIndex >= 0
      ? rules.map((rule, index) => index === existingCustomIndex ? customRule : rule)
      : [...rules, customRule];

    onRulesChange(nextRules);

    setSelectedRuleId(customRule.id);
    setSelectedComboKey(null);
    setDraft(draftFromRule(customRule));
    setErrors({});

    return true;
  }, [draft, onRulesChange, rules]);

  const deleteRule = useCallback(() => {
    if (!draft?.id) return;

    // Only delete if it's a custom rule (either custom origin or an override of a default rule)
    const customRuleToDelete = rules.find(rule => rule.id === draft.id);
    if (customRuleToDelete) {
      onRulesChange(rules.filter((rule) => rule.id !== draft.id));
    }

    setSelectedRuleId(null);
    setSelectedComboKey(null);
    setDraft(null);
    setErrors({});
  }, [draft, onRulesChange, rules]);

  const duplicateRule = useCallback(() => {
    if (!selectedRule) return;

    setDraft(duplicateCanalRuleDraft(selectedRule));
    setSelectedRuleId(null);
    setSelectedComboKey(null);
    setErrors({});
  }, [selectedRule]);

  const refresh = useCallback(() => {
    setRefreshVersion((value) => value + 1);
  }, []);

  return {
    rules,
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
  };
}
