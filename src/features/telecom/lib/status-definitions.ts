import type { StatusMapping, StatusSemantic } from "@/features/telecom/types";

export type ClassifiedStatusSemantic = Exclude<StatusSemantic, "other">;

export const SEMANTIC_TO_CATEGORY: Record<ClassifiedStatusSemantic, string> = {
  success: "SUCCESS",
  declined: "DECLINED",
  refund: "REFUND",
  instance: "INSTANCE",
  submitted: "SUBMITTED",
};

export const STATUS_PRESENTATION: Record<
  StatusSemantic,
  {
    label: string;
    color: string;
    badgeClass: string;
  }
> = {
  success: {
    label: "Réussie",
    color: "#10b981",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  declined: {
    label: "Échec",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  refund: {
    label: "Annulation",
    color: "#F59E0B",
    badgeClass:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  },
  instance: {
    label: "Instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  submitted: {
    label: "Confirmé",
    color: "#3b82f6",
    badgeClass:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  },
  other: {
    label: "Other",
    color: "#94a3b8",
    badgeClass: "bg-muted/30 text-muted-foreground border-border",
  },
};

export const SEMANTIC_STATUS_OPTIONS: Array<{
  value: StatusSemantic;
  label: string;
  badgeClass: string;
  color: string;
}> = (["success", "declined", "instance", "refund", "submitted", "other"] as StatusSemantic[]).map(
  (value) => ({
    value,
    ...STATUS_PRESENTATION[value],
  }),
);

export const BUILTIN_STATUS_CODES: Record<ClassifiedStatusSemantic, string[]> = {
  success: ["PST", "PST1", "PST2", "PST7", "PST8", "PST9"],
  declined: [
    "DCL",
    "DCT",
    "DCA",
    "DCR",
    "DCB",
    "RDCL",
    "RDCT",
    "RDCA",
    "RDCR",
    "SDL1",
    "SDL2",
    "SDL3",
    "SDL4",
    "SDL7",
    "PDL",
    "PDL1",
    "REJ",
    "CAN",
    "FLD",
    "ERR",
  ],
  refund: ["RFD", "RFD3", "RFD4", "RVS"],
  instance: [
    "HLD",
    "TPP",
    "TTO",
    "PRF",
    "RHL",
    "RTO",
    "STO",
    "STP",
    "SRV",
    "SRV1",
    "SRTO",
    "RHD",
    "RHD3",
    "RHD4",
    "DBT",
    "DBA",
    "RDBT",
    "RDBA",
    "SDT",
    "SRDT",
    "PND",
    "EXP",
  ],
  submitted: ["SBM"],
};

export const REPORT_HOLD_STATUS_CODES = [
  "HLD",
  "TPP",
  "TTO",
  "PRF",
  "RHL",
  "RTO",
  "STO",
  "STP",
  "SRV",
  "SRV1",
  "SRTO",
  "RHD",
  "RHD3",
  "RHD4",
];

export const REPORT_DOUBT_STATUS_CODES = ["DBT", "DBA", "RDBT", "RDBA", "SDT", "SRDT"];

export const REPORT_INSTANCE_STATUS_CODES = [
  ...REPORT_HOLD_STATUS_CODES,
  ...REPORT_DOUBT_STATUS_CODES,
];

export const SPEC_STATUS_CODES: Record<ClassifiedStatusSemantic, string[]> = {
  success: BUILTIN_STATUS_CODES.success,
  declined: [
    "DCL",
    "DCT",
    "DCA",
    "DCR",
    "DCB",
    "RDCL",
    "RDCT",
    "RDCA",
    "RDCR",
    "SDL1",
    "SDL2",
    "SDL3",
    "SDL4",
    "SDL7",
    "PDL",
    "PDL1",
  ],
  refund: ["RFD", "RFD3", "RFD4"],
  instance: REPORT_INSTANCE_STATUS_CODES,
  submitted: ["SBM"],
};

const DEFAULT_STATUS_MAPPING_DEFS: Array<{
  rawCode: string;
  semantic: StatusSemantic;
  color?: string;
  badgeClass?: string;
}> = [
  ...BUILTIN_STATUS_CODES.success.map((rawCode) => ({
    rawCode,
    semantic: "success" as const,
  })),
  ...SPEC_STATUS_CODES.declined.map((rawCode) => ({
    rawCode,
    semantic: "declined" as const,
  })),
  { rawCode: "REJ", semantic: "declined" },
  {
    rawCode: "CAN",
    semantic: "declined",
    color: "#f97316",
    badgeClass:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
  },
  {
    rawCode: "FLD",
    semantic: "declined",
    color: "#dc2626",
    badgeClass:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-600/15 dark:text-red-300 dark:border-red-600/30",
  },
  {
    rawCode: "ERR",
    semantic: "declined",
    color: "#b91c1c",
    badgeClass:
      "bg-red-100 text-red-900 border-red-300 dark:bg-red-700/15 dark:text-red-300 dark:border-red-700/30",
  },
  ...SPEC_STATUS_CODES.refund.map((rawCode) => ({
    rawCode,
    semantic: "refund" as const,
  })),
  { rawCode: "RVS", semantic: "refund" },
  ...["HLD", "TPP", "TTO", "PRF", "RHL", "DBT", "DBA", "PND", "EXP"].map((rawCode) => ({
    rawCode,
    semantic: "instance" as const,
  })),
  { rawCode: "SBM", semantic: "submitted" },
];

export const DEFAULT_STATUS_MAPPINGS: StatusMapping[] = DEFAULT_STATUS_MAPPING_DEFS.map(
  ({ rawCode, semantic, color, badgeClass }) => {
    const presentation = STATUS_PRESENTATION[semantic];

    return {
      rawCode,
      label: presentation.label,
      semantic,
      color: color ?? presentation.color,
      badgeClass: badgeClass ?? presentation.badgeClass,
    };
  },
);

export const STATUS_AUTO_SEMANTIC_BY_CODE: Record<string, StatusSemantic> = {
  PST: "success",
  SUC: "success",
  OK: "success",
  SUCCESS: "success",
  POSTED: "success",
  SUCC: "success",
  REJ: "declined",
  FAIL: "declined",
  FAILED: "declined",
  ERR: "declined",
  FLD: "declined",
  CAN: "declined",
  REJECT: "declined",
  PND: "instance",
  PENDING: "instance",
  WAIT: "instance",
  RVS: "refund",
  RVS_: "refund",
  REVERSED: "refund",
  REVERSAL: "refund",
  EXP: "instance",
  EXPIRED: "instance",
  TIMEOUT: "instance",
};

function sqlLiteral(value: string): string {
  return `'${value.replace("'", "''")}'`;
}

export function sqlStatusInList(codes: string[]): string {
  return codes.map(sqlLiteral).join(",");
}

export const RAW_TRANSACTION_STATUS_EXPR = "UPPER(TRIM(CAST(TRANSACTION_STATUS AS VARCHAR)))";

export function buildRawStatusFilter(codes: string[]): string {
  return `${RAW_TRANSACTION_STATUS_EXPR} IN (${sqlStatusInList(codes)})`;
}

/** Build a raw-status filter for an arbitrary column expression (e.g. mapped column). */
export function buildRawStatusFilterForColumn(columnExpr: string, codes: string[]): string {
  return `UPPER(TRIM(CAST(${columnExpr} AS VARCHAR))) IN (${sqlStatusInList(codes)})`;
}

export const SPEC_SUCCESS_FILTER = buildRawStatusFilter(SPEC_STATUS_CODES.success);
export const SPEC_REFUND_FILTER = buildRawStatusFilter(SPEC_STATUS_CODES.refund);
export const SPEC_INSTANCE_FILTER = buildRawStatusFilter(SPEC_STATUS_CODES.instance);
export const SPEC_DECLINED_FILTER = buildRawStatusFilter(SPEC_STATUS_CODES.declined);
export const SPEC_SUBMITTED_FILTER = buildRawStatusFilter(SPEC_STATUS_CODES.submitted);
