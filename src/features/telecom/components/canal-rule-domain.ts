import type {
  CanalKey,
  CanalRule,
  CanalRuleMatch,
  CanalRuleOrigin,
  CanalRuleReportGroup,
  NonEmptyArray,
  UnclassifiedCanalCombo,
} from "@/features/telecom/types";

export type CanalMatchKind = CanalRuleMatch["kind"];

export interface CanalRuleDraft {
  id: string | null;
  name: string;
  canalKey: CanalKey | "";
  brandDValuesText: string;
  matchKind: CanalMatchKind;
  accountLayerId: string;
  accountGroupId: string;
  accountMsisdn: string;
  reportGroup: CanalRuleReportGroup;
  enabled: boolean;
  origin: CanalRuleOrigin;
  createdAt: string | null;
}

export type CanalRuleValidationField =
  | "name"
  | "canalKey"
  | "brandDValues"
  | "accountLayerId"
  | "accountGroupId"
  | "accountMsisdn"
  | "reportGroup";

export type CanalRuleValidationErrors = Partial<Record<CanalRuleValidationField, string>>;

export type CanalRuleValidationResult =
  | {
      success: true;
      rule: CanalRule;
    }
  | {
      success: false;
      errors: CanalRuleValidationErrors;
    };

export function comboKey(combo: UnclassifiedCanalCombo): string {
  return [combo.brandD, combo.accountLayerId, combo.accountGroupId, combo.accountMsisdn].join("|");
}

export function parseBrandDValues(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function toNonEmptyArray<T>(values: T[]): NonEmptyArray<T> | null {
  const [first, ...rest] = values;

  if (first === undefined) {
    return null;
  }

  return [first, ...rest];
}

export function matchKindFromCombo(combo: UnclassifiedCanalCombo): CanalMatchKind {
  if (combo.accountLayerId && combo.accountGroupId) {
    return "brand-layer-group";
  }

  if (combo.accountLayerId) {
    return "brand-layer";
  }

  if (combo.accountMsisdn) {
    return "brand-msisdn";
  }

  return "brand";
}

export function emptyCanalRuleDraft(): CanalRuleDraft {
  return {
    id: null,
    name: "",
    canalKey: "",
    brandDValuesText: "",
    matchKind: "brand",
    accountLayerId: "",
    accountGroupId: "",
    accountMsisdn: "",
    reportGroup: null,
    enabled: true,
    origin: "custom",
    createdAt: null,
  };
}

export function draftFromCombo(combo: UnclassifiedCanalCombo): CanalRuleDraft {
  return {
    ...emptyCanalRuleDraft(),
    brandDValuesText: combo.brandD,
    matchKind: matchKindFromCombo(combo),
    accountLayerId: combo.accountLayerId,
    accountGroupId: combo.accountGroupId,
    accountMsisdn: combo.accountMsisdn,
  };
}

export function draftFromRule(rule: CanalRule): CanalRuleDraft {
  const base: CanalRuleDraft = {
    id: rule.id,
    name: rule.name,
    canalKey: rule.canalKey,
    brandDValuesText: rule.match.brandDValues.join(", "),
    matchKind: rule.match.kind,
    accountLayerId: "",
    accountGroupId: "",
    accountMsisdn: "",
    reportGroup: rule.reportGroup,
    enabled: rule.enabled,
    origin: rule.origin,
    createdAt: rule.createdAt,
  };

  switch (rule.match.kind) {
    case "brand":
      return base;

    case "brand-layer":
      return {
        ...base,
        accountLayerId: rule.match.accountLayerId,
      };

    case "brand-layer-group":
      return {
        ...base,
        accountLayerId: rule.match.accountLayerId,
        accountGroupId: rule.match.accountGroupId,
      };

    case "brand-msisdn":
      return {
        ...base,
        accountMsisdn: rule.match.accountMsisdn,
      };
  }
}

function buildMatch(
  draft: CanalRuleDraft,
  brandDValues: NonEmptyArray<string>,
): CanalRuleMatch | null {
  switch (draft.matchKind) {
    case "brand":
      return {
        kind: "brand",
        brandDValues,
      };

    case "brand-layer": {
      const accountLayerId = draft.accountLayerId.trim();

      return accountLayerId
        ? {
            kind: "brand-layer",
            brandDValues,
            accountLayerId,
          }
        : null;
    }

    case "brand-layer-group": {
      const accountLayerId = draft.accountLayerId.trim();
      const accountGroupId = draft.accountGroupId.trim();

      return accountLayerId && accountGroupId
        ? {
            kind: "brand-layer-group",
            brandDValues,
            accountLayerId,
            accountGroupId,
          }
        : null;
    }

    case "brand-msisdn": {
      const accountMsisdn = draft.accountMsisdn.trim();

      return accountMsisdn
        ? {
            kind: "brand-msisdn",
            brandDValues,
            accountMsisdn,
          }
        : null;
    }
  }
}

export function validateAndBuildCanalRule(
  draft: CanalRuleDraft,
  generateId: () => string,
  now: () => string,
): CanalRuleValidationResult {
  const errors: CanalRuleValidationErrors = {};

  const name = draft.name.trim();
  const canalKey = draft.canalKey;

  const brandDValues = toNonEmptyArray(parseBrandDValues(draft.brandDValuesText));

  if (!name) {
    errors.name = "Le nom du canal est obligatoire.";
  }

  if (!canalKey) {
    errors.canalKey = "Sélectionnez une catégorie.";
  }

  if (!brandDValues) {
    errors.brandDValues = "Ajoutez au moins une valeur BRAND_D.";
  }

  switch (draft.matchKind) {
    case "brand":
      break;

    case "brand-layer":
      if (!draft.accountLayerId.trim()) {
        errors.accountLayerId = "ACCOUNT_LAYER_ID est obligatoire.";
      }
      break;

    case "brand-layer-group":
      if (!draft.accountLayerId.trim()) {
        errors.accountLayerId = "ACCOUNT_LAYER_ID est obligatoire.";
      }

      if (!draft.accountGroupId.trim()) {
        errors.accountGroupId = "ACCOUNT_GROUP_ID est obligatoire.";
      }
      break;

    case "brand-msisdn":
      if (!draft.accountMsisdn.trim()) {
        errors.accountMsisdn = "ACCOUNT_MSISDN est obligatoire.";
      }
      break;
  }

  if (canalKey === "voucher_for_payment" && draft.reportGroup === null) {
    errors.reportGroup = "Sélectionnez le type Voucher For Payment.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
    };
  }

  /*
   * TypeScript cannot infer from Object.keys(errors) that these values are
   * present, so retain an explicit guard before building the domain entity.
   */
  if (!name || !canalKey || !brandDValues) {
    return {
      success: false,
      errors: {
        brandDValues: "La règle est invalide.",
      },
    };
  }

  const match = buildMatch(draft, brandDValues);

  if (!match) {
    return {
      success: false,
      errors: {
        brandDValues: "La règle est invalide.",
      },
    };
  }

  const timestamp = now();

  return {
    success: true,
    rule: {
      id: draft.id ?? generateId(),
      name,
      canalKey,
      match,
      reportGroup: canalKey === "voucher_for_payment" ? draft.reportGroup : null,
      enabled: draft.enabled,
      origin: draft.origin,
      createdAt: draft.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}

export function duplicateCanalRuleDraft(rule: CanalRule): CanalRuleDraft {
  return {
    ...draftFromRule(rule),
    id: null,
    name: `${rule.name} — copie`,
    origin: "custom",
    createdAt: null,
  };
}

export function comboMatchesRule(combo: UnclassifiedCanalCombo, rule: CanalRule): boolean {
  if (!rule.enabled || !rule.match.brandDValues.includes(combo.brandD)) {
    return false;
  }

  switch (rule.match.kind) {
    case "brand":
      return true;

    case "brand-layer":
      return combo.accountLayerId === rule.match.accountLayerId;

    case "brand-layer-group":
      return (
        combo.accountLayerId === rule.match.accountLayerId &&
        combo.accountGroupId === rule.match.accountGroupId
      );

    case "brand-msisdn":
      return combo.accountMsisdn === rule.match.accountMsisdn;
  }
}
