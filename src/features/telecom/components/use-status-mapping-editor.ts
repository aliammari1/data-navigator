"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_STATUS_MAPPINGS } from "@/features/telecom/lib/status-definitions";
import type { RawStatusRow, StatusMapping } from "@/features/telecom/types";
import {
  type StatusMappingDraft,
  draftFromMapping,
  draftFromRawStatus,
  duplicateStatusMappingDraft,
  emptyStatusMappingDraft,
  validateAndBuildStatusMapping,
} from "./status-mapping-domain";

export interface UseStatusMappingEditorOptions {
  rawStatuses: RawStatusRow[];
  mappings: StatusMapping[];
  onMappingsChange: (mappings: StatusMapping[]) => void;
}

export function useStatusMappingEditor({
  rawStatuses,
  mappings,
  onMappingsChange,
}: UseStatusMappingEditorOptions) {
  // Merge custom mappings with default system mappings
  const mergedStatusMappings = useMemo(() => {
    const customByRawCode = new Map<string, StatusMapping>();
    for (const mapping of mappings) {
      customByRawCode.set(mapping.rawCode, mapping);
    }
    
    const merged: StatusMapping[] = [];
    
    // Add all default mappings first
    for (const defaultMapping of DEFAULT_STATUS_MAPPINGS) {
      const customOverride = customByRawCode.get(defaultMapping.rawCode);
      if (customOverride) {
        // Use custom override instead of default mapping
        merged.push(customOverride);
      } else {
        // Use default mapping
        merged.push(defaultMapping);
      }
    }
    
    // Add any custom mappings that don't override existing defaults
    for (const customMapping of mappings) {
      if (!DEFAULT_STATUS_MAPPINGS.some(defaultMapping => defaultMapping.rawCode === customMapping.rawCode)) {
        merged.push(customMapping);
      }
    }
    
    return merged;
  }, [mappings]);

  const [unknownRawStatuses, setUnknownRawStatuses] = useState<RawStatusRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [selectedMappingRawCode, setSelectedMappingRawCode] = useState<string | null>(null);
  const [selectedRawStatus, setSelectedRawStatus] = useState<RawStatusRow | null>(null);

  const [draft, setDraft] = useState<StatusMappingDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedMapping = useMemo(
    () => (selectedMappingRawCode ? (mergedStatusMappings.find((m) => m.rawCode === selectedMappingRawCode) ?? null) : null),
    [mergedStatusMappings, selectedMappingRawCode],
  );

  // Calculate unknown raw statuses (not mapped by either default or custom mappings)
  useEffect(() => {
    const mergedRawCodes = new Set(mergedStatusMappings.map(m => m.rawCode));
    const unknown = rawStatuses.filter(rs => !mergedRawCodes.has(rs.rawCode));
    setUnknownRawStatuses(unknown);
  }, [rawStatuses, mergedStatusMappings]);

  const updateDraft = useCallback((patch: Partial<StatusMappingDraft>) => {
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

  const selectMapping = useCallback((mapping: StatusMapping) => {
    setSelectedMappingRawCode(mapping.rawCode);
    setSelectedRawStatus(null);
    
    // If this is a default mapping, create an editable custom override
    const draftForEdit = mapping.origin === "default"
      ? { ...draftFromMapping(mapping), origin: "custom" as const }
      : draftFromMapping(mapping);
    
    setDraft(draftForEdit);
    setErrors({});
  }, []);

  const selectRawStatus = useCallback((rawStatus: RawStatusRow) => {
    setSelectedMappingRawCode(null);
    setSelectedRawStatus(rawStatus);
    setDraft(draftFromRawStatus(rawStatus));
    setErrors({});
  }, []);

  const createMapping = useCallback(() => {
    setSelectedMappingRawCode(null);
    setSelectedRawStatus(null);
    setDraft(emptyStatusMappingDraft());
    setErrors({});
  }, []);

  const saveMapping = useCallback((): boolean => {
    if (!draft) return false;

    const result = validateAndBuildStatusMapping(draft);

    if (!result.success) {
      setErrors(result.errors);
      return false;
    }

    const customMapping = result.mapping;
    
    // For overrides of default mappings: find if there's already a custom mapping with this rawCode
    const existingCustomIndex = mappings.findIndex(m => m.rawCode === customMapping.rawCode);
    
    const nextMappings = existingCustomIndex >= 0
      ? mappings.map((mapping, index) => index === existingCustomIndex ? customMapping : mapping)
      : [...mappings, customMapping];

    onMappingsChange(nextMappings);

    setSelectedMappingRawCode(customMapping.rawCode);
    setSelectedRawStatus(null);
    setDraft(draftFromMapping(customMapping));
    setErrors({});

    return true;
  }, [draft, onMappingsChange, mappings]);

  const deleteMapping = useCallback(() => {
    if (!draft?.rawCode) return;

    // Only delete if it's a custom mapping (either custom origin or an override of a default mapping)
    const customMappingToDelete = mappings.find(m => m.rawCode === draft.rawCode);
    if (customMappingToDelete) {
      onMappingsChange(mappings.filter((m) => m.rawCode !== draft.rawCode));
    }

    setSelectedMappingRawCode(null);
    setSelectedRawStatus(null);
    setDraft(null);
    setErrors({});
  }, [draft, onMappingsChange, mappings]);

  const duplicateMapping = useCallback(() => {
    if (!selectedMapping) return;

    setDraft(duplicateStatusMappingDraft(selectedMapping));
    setSelectedMappingRawCode(null);
    setSelectedRawStatus(null);
    setErrors({});
  }, [selectedMapping]);

  const refresh = useCallback(() => {
    setRefreshVersion((value) => value + 1);
  }, []);

  return {
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
  };
}