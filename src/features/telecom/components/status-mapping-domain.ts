import type {
  RawStatusRow,
  StatusMapping,
  StatusMappingOrigin,
  StatusSemantic,
} from "@/features/telecom/types";
import {
  SEMANTIC_STATUS_OPTIONS,
  STATUS_AUTO_SEMANTIC_BY_CODE,
  STATUS_PRESENTATION,
} from "@/features/telecom/lib/status-definitions";

export interface StatusMappingDraft {
  rawCode: string;
  label: string;
  semantic: StatusSemantic;
  origin: StatusMappingOrigin;
}

export type StatusMappingValidationField = "rawCode" | "label" | "semantic";

export type StatusMappingValidationErrors = Partial<Record<StatusMappingValidationField, string>>;

export type StatusMappingValidationResult =
  | {
      success: true;
      mapping: StatusMapping;
    }
  | {
      success: false;
      errors: StatusMappingValidationErrors;
    };

export function emptyStatusMappingDraft(): StatusMappingDraft {
  return {
    rawCode: "",
    label: "",
    semantic: "other",
    origin: "custom",
  };
}

export function draftFromRawStatus(rawStatus: RawStatusRow): StatusMappingDraft {
  const autoSemantic = STATUS_AUTO_SEMANTIC_BY_CODE[rawStatus.rawCode] ?? "other";
  const presentation = STATUS_PRESENTATION[autoSemantic];
  
  return {
    rawCode: rawStatus.rawCode,
    label: presentation.label,
    semantic: autoSemantic,
    origin: "custom",
  };
}

export function draftFromMapping(mapping: StatusMapping): StatusMappingDraft {
  return {
    rawCode: mapping.rawCode,
    label: mapping.label,
    semantic: mapping.semantic,
    origin: mapping.origin ?? "custom",
  };
}

export function validateAndBuildStatusMapping(
  draft: StatusMappingDraft,
): StatusMappingValidationResult {
  const errors: StatusMappingValidationErrors = {};

  const rawCode = draft.rawCode.trim().toUpperCase();
  const label = draft.label.trim();
  const semantic = draft.semantic;

  if (!rawCode) {
    errors.rawCode = "Le code brut est obligatoire.";
  }

  if (!label) {
    errors.label = "Le libellé est obligatoire.";
  }

  if (!semantic) {
    errors.semantic = "La catégorie sémantique est obligatoire.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
    };
  }

  const presentation = STATUS_PRESENTATION[semantic];
  
  return {
    success: true,
    mapping: {
      rawCode,
      label,
      semantic,
      color: presentation.color,
      badgeClass: presentation.badgeClass,
      origin: draft.origin,
    },
  };
}

export function duplicateStatusMappingDraft(mapping: StatusMapping): StatusMappingDraft {
  return {
    ...draftFromMapping(mapping),
    label: `${mapping.label} — copie`,
    origin: "custom",
  };
}