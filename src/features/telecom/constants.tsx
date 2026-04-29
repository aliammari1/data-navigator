import { fmtAmount, fmtN, fmtPct } from "./lib/format";
import type { KPISummary, StatusMapping } from "./types";

export const DEFAULT_STATUS_MAPPINGS: StatusMapping[] = [
  // SUCCESS (Réussie)
  {
    rawCode: "PST",
    label: "Réussie",
    semantic: "success",
    color: "#10b981",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  {
    rawCode: "PST1",
    label: "Réussie",
    semantic: "success",
    color: "#10b981",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  {
    rawCode: "PST2",
    label: "Réussie",
    semantic: "success",
    color: "#10b981",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  {
    rawCode: "PST7",
    label: "Réussie",
    semantic: "success",
    color: "#10b981",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  {
    rawCode: "PST8",
    label: "Réussie",
    semantic: "success",
    color: "#10b981",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  {
    rawCode: "PST9",
    label: "Réussie",
    semantic: "success",
    color: "#10b981",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  // DECLINED (Échec)
  {
    rawCode: "DCL",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "DCT",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "DCA",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "DCR",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "DCB",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "RDCL",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "RDCT",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "RDCA",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "RDCR",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "SDL1",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "SDL2",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "SDL3",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "SDL4",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "SDL7",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "PDL",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "PDL1",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "REJ",
    label: "Échec",
    semantic: "declined",
    color: "#ef4444",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
  {
    rawCode: "CAN",
    label: "Échec",
    semantic: "declined",
    color: "#f97316",
    badgeClass:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
  },
  {
    rawCode: "FLD",
    label: "Échec",
    semantic: "declined",
    color: "#dc2626",
    badgeClass:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-600/15 dark:text-red-300 dark:border-red-600/30",
  },
  {
    rawCode: "ERR",
    label: "Échec",
    semantic: "declined",
    color: "#b91c1c",
    badgeClass:
      "bg-red-100 text-red-900 border-red-300 dark:bg-red-700/15 dark:text-red-300 dark:border-red-700/30",
  },
  // REFUND (Annulation)
  {
    rawCode: "RFD",
    label: "Annulation",
    semantic: "refund",
    color: "#8b5cf6",
    badgeClass:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  },
  {
    rawCode: "RFD3",
    label: "Annulation",
    semantic: "refund",
    color: "#8b5cf6",
    badgeClass:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  },
  {
    rawCode: "RFD4",
    label: "Annulation",
    semantic: "refund",
    color: "#8b5cf6",
    badgeClass:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  },
  {
    rawCode: "RVS",
    label: "Annulation",
    semantic: "refund",
    color: "#8b5cf6",
    badgeClass:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  },
  // INSTANCE (Instance) — Hold & Doubt
  {
    rawCode: "HLD",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    rawCode: "TPP",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    rawCode: "TTO",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    rawCode: "PRF",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    rawCode: "RHL",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    rawCode: "DBT",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    rawCode: "DBA",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    rawCode: "PND",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    rawCode: "EXP",
    label: "Instance",
    semantic: "instance",
    color: "#f59e0b",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  // SUBMITTED (Confirmé)
  {
    rawCode: "SBM",
    label: "Confirmé",
    semantic: "submitted",
    color: "#3b82f6",
    badgeClass:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  },
];

export const KPI_FIELDS: Array<{
  key: keyof KPISummary;
  label: string;
  fmt?: (v: number | string) => string;
}> = [
  { key: "totalTransactions", label: "Transactions Totales", fmt: (v) => fmtN(Number(v)) },
  { key: "successCount", label: "Réussies", fmt: (v) => fmtN(Number(v)) },
  { key: "declinedCount", label: "Échecs (Refusés)", fmt: (v) => fmtN(Number(v)) },
  { key: "instanceCount", label: "Instance (En attente)", fmt: (v) => fmtN(Number(v)) },
  { key: "refundCount", label: "Annulations (Remboursements)", fmt: (v) => fmtN(Number(v)) },
  { key: "submittedCount", label: "Confirmés", fmt: (v) => fmtN(Number(v)) },
  { key: "successRate", label: "Taux de Réussite (%)", fmt: (v) => fmtPct(Number(v)) },
  { key: "totalAmount", label: "Montant Total (TND)", fmt: (v) => fmtAmount(Number(v)) },
  { key: "avgAmount", label: "Montant Moyen (TND)", fmt: (v) => fmtAmount(Number(v)) },
  { key: "avgProcessingMs", label: "Temps Moyen de Traitement (ms)", fmt: (v) => String(Math.round(Number(v))) },
  { key: "uniqueCustomers", label: "Abonnés Uniques", fmt: (v) => fmtN(Number(v)) },
  { key: "peakHour", label: "Heure de Pointe", fmt: (v) => `${String(v).padStart(2, "0")}:00` },
  { key: "topErrorCode", label: "Code d'Erreur Principal" },
];
