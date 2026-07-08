import { fmtAmount, fmtN, fmtPct } from "./lib/format";
import type { KPISummary } from "./types";

export { DEFAULT_STATUS_MAPPINGS } from "./lib/status-definitions";

export const KPI_FIELDS: Array<{
  key: keyof KPISummary;
  label: string;
  fmt?: (v: number | string) => string;
}> = [
  {
    key: "totalTransactions",
    label: "Transactions Totales",
    fmt: (v) => fmtN(Number(v)),
  },
  { key: "successCount", label: "Réussies", fmt: (v) => fmtN(Number(v)) },
  {
    key: "declinedCount",
    label: "Échecs (Refusés)",
    fmt: (v) => fmtN(Number(v)),
  },
  {
    key: "instanceCount",
    label: "Instance (En attente)",
    fmt: (v) => fmtN(Number(v)),
  },
  {
    key: "refundCount",
    label: "Annulations (Remboursements)",
    fmt: (v) => fmtN(Number(v)),
  },
  { key: "submittedCount", label: "Confirmés", fmt: (v) => fmtN(Number(v)) },
  {
    key: "successRate",
    label: "Taux de Réussite (%)",
    fmt: (v) => fmtPct(Number(v)),
  },
  {
    key: "totalAmount",
    label: "Montant Total (TND)",
    fmt: (v) => fmtAmount(Number(v)),
  },
  {
    key: "avgAmount",
    label: "Montant Moyen (TND)",
    fmt: (v) => fmtAmount(Number(v)),
  },
  {
    key: "avgProcessingMs",
    label: "Temps Moyen de Traitement (ms)",
    fmt: (v) => String(Math.round(Number(v))),
  },
  {
    key: "uniqueCustomers",
    label: "Abonnés Uniques",
    fmt: (v) => fmtN(Number(v)),
  },
  {
    key: "peakHour",
    label: "Heure de Pointe",
    fmt: (v) => `${String(v).padStart(2, "0")}:00`,
  },
  { key: "topErrorCode", label: "Code d'Erreur Principal" },
];
