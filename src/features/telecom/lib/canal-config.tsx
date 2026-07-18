import { FileText, Layers, Phone, Signal, Smartphone, Tag, Wifi, Zap } from "lucide-react";
import type { RawCanalRow } from "@/features/telecom/lib/queries";
import { STATUS_PRESENTATION } from "@/features/telecom/lib/status-definitions";
import type { CanalKey, CanalSummary } from "@/features/telecom/types";

/**
 * SINGLE SOURCE OF TRUTH for canal and status visual configuration.
 * All canal styling comes from CANAL_CONFIG, all status colors from status-definitions.ts.
 */

// ─── Canal visual configuration ───────────────────────────────────────────────

export const CANAL_CONFIG: Record<
  CanalKey,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    border: string;
    shortLabel: string;
  }
> = {
  bill_payment: {
    label: "Bill Payment",
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/25",
    shortLabel: "Bill Payment",
  },
  voice_fixed_ttcash: {
    label: "Fixed by TTCASH",
    icon: Phone,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/25",
    shortLabel: "Fixed by TTCASH",
  },
  voice_fixed_voucher: {
    label: "Fixed by Voucher",
    icon: Phone,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-500/10",
    border: "border-teal-200 dark:border-teal-500/25",
    shortLabel: "Fixed by Voucher",
  },
  voice_mobile_ttcash: {
    label: "Mobile by TTCASH",
    icon: Smartphone,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/25",
    shortLabel: "Mobile by TTCASH",
  },
  voice_mobile_voucher: {
    label: "Mobile by Voucher",
    icon: Smartphone,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-500/10",
    border: "border-purple-200 dark:border-purple-500/25",
    shortLabel: "Mobile by Voucher",
  },
  data_sabba: {
    label: "Internet Sabba",
    icon: Wifi,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/25",
    shortLabel: "Internet Sabba",
  },
  data_evoucher: {
    label: "Data by Voucher",
    icon: Signal,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-200 dark:border-rose-500/25",
    shortLabel: "Data by Voucher",
  },
  voucher_for_payment: {
    label: "Voucher For Payment",
    icon: Tag,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
    border: "border-cyan-200 dark:border-cyan-500/25",
    shortLabel: "Voucher For Payment",
  },
  credit_transfer: {
    label: "Credit Transfer",
    icon: Zap,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-500/10",
    border: "border-orange-200 dark:border-orange-500/25",
    shortLabel: "Credit Transfer",
  },
  voucher_convergent: {
    label: "Voucher Convergent Management",
    icon: Layers,
    color: "text-lime-600 dark:text-lime-400",
    bg: "bg-lime-50 dark:bg-lime-500/10",
    border: "border-lime-200 dark:border-lime-500/25",
    shortLabel: "Voucher Convergent",
  },
  evoucher_on_demand: {
    label: "Evoucher on Demand",
    icon: Zap,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-500/10",
    border: "border-green-200 dark:border-green-500/25",
    shortLabel: "Evoucher on Demand",
  },

  voucher_convergent_carte_generation: {
    label: "Voucher Convergent — Generation",
    icon: Layers,
    color: "text-lime-600 dark:text-lime-400",
    bg: "bg-lime-50 dark:bg-lime-500/10",
    border: "border-lime-200 dark:border-lime-500/25",
    shortLabel: "Convergent — Génération",
  },

  voucher_convergent_carte_activation: {
    label: "Voucher Convergent — Activation",
    icon: Layers,
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-500/10",
    border: "border-yellow-200 dark:border-yellow-500/25",
    shortLabel: "Convergent — Activation",
  },
};

// ─── Status and chart colours ─────────────────────────────────────────────────

// DERIVED from STATUS_PRESENTATION in status-definitions.ts (single source of truth)
export const STATUS_COLORS: Record<string, string> = {
  SUCCESS: STATUS_PRESENTATION.success.color,
  DECLINED: STATUS_PRESENTATION.declined.color,
  REFUND: STATUS_PRESENTATION.refund.color,
  INSTANCE: STATUS_PRESENTATION.instance.color,
  SUBMITTED: STATUS_PRESENTATION.submitted.color,
  OTHER: STATUS_PRESENTATION.other.color,
};

export const CHART_PALETTE = [
  "#89b4fa",
  "#a6e3a1",
  "#f38ba8",
  "#fab387",
  "#cba6f7",
  "#94e2d5",
  "#f9e2af",
  "#89dceb",
];

// ─── Canal enrichment ─────────────────────────────────────────────────────────

/** Takes raw canal rows from queries.ts and adds icon/color/bgColor/borderColor from CANAL_CONFIG. */
export function enrichCanalSummaries(raw: RawCanalRow[]): CanalSummary[] {
  return raw.map((r) => {
    const cfg = CANAL_CONFIG[r.key];
    return {
      ...r,
      icon: cfg.icon,
      color: cfg.color,
      bgColor: cfg.bg,
      borderColor: cfg.border,
    };
  });
}

/** `CanalSummary` minus the `icon` component reference — the only field that
 * can't cross the Electron IPC boundary (structured clone rejects functions). */
export type PersistableCanalSummary = Omit<CanalSummary, "icon">;

/**
 * Drop the `icon` component reference before sending canals through an IPC
 * bridge (analytics-snapshot save, SQLite auto-save). Passing the enriched
 * `CanalSummary[]` as-is throws `DataCloneError: An object could not be
 * cloned` at the contextBridge boundary, since `icon` is a live React
 * component function.
 */
export function stripCanalIconsForPersist(canals: CanalSummary[]): PersistableCanalSummary[] {
  return canals.map(({ icon: _icon, ...rest }) => rest);
}

/** Re-derive `icon` from `CANAL_CONFIG` after loading canals back from persistence. */
export function reattachCanalIcons(canals: PersistableCanalSummary[]): CanalSummary[] {
  return canals.map((c) => ({ ...c, icon: CANAL_CONFIG[c.key].icon }));
}
