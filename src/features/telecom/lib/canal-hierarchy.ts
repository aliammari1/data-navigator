/**
 * Canal hierarchy for the interactive sunburst explorer.
 *
 * Mirrors the CL1 → CL2/CL3 structure rendered in the Canaux tab as a two-level
 * tree the sunburst can draw and drill: the inner ring is the five top-level
 * sections (Bill Payment, Recharge, …), the outer ring their sub-sections. Every
 * node carries the exact `CanalRule[]` it covers, so clicking a slice can query
 * that node's status breakdown (Réussie / Instance / Annulation / Échec) without
 * re-deriving which channels belong to it.
 */

import {
  ALL_VOICE_FIXED,
  ALL_VOICE_MOBILE,
  VOUCHER_FOR_PAYMENT_GENERATION,
  VOUCHER_FOR_PAYMENT_REDEMPTION,
} from "@/features/telecom/lib/canal-groups";
import {
  BILL_PAYMENT_CHANNELS_RULES,
  CREDIT_TRANSFER_RULES,
  EVOUCHER_ON_DEMAND_GENERATION_RULES,
  RECHARGE_DATA_EVOUCHER_RULES,
  RECHARGE_DATA_SABBA_RULES,
  VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES,
  VOUCHER_CONVERGENT_CARTE_GENERATION_RULES,
} from "@/features/telecom/lib/report-engine";
import { CanalRule } from "../types";

export interface CanalNode {
  /** Stable id used for selection + lookup. */
  id: string;
  label: string;
  /** Slice colour (vivid for sections, lighter for sub-sections). */
  color: string;
  /** Every channel covered by this node (used for the status query). */
  channels: CanalRule[];
  children?: CanalNode[];
}

const leafNode = (id: string, label: string, color: string, channels: CanalRule[]): CanalNode => ({
  id,
  label,
  color,
  channels,
});

/** Build a flat section (no sub-groups) whose outer ring is its individual canals. */
function flatSection(
  id: string,
  label: string,
  color: string,
  lighter: string,
  channels: CanalRule[],
): CanalNode {
  return {
    id,
    label,
    color,
    channels,
    children: channels.map((c, i) => leafNode(`${id}:${i}`, c.name, lighter, [c])),
  };
}

export const CANAL_HIERARCHY: CanalNode[] = [
  flatSection("bill", "Bill Payment", "#3b82f6", "#93c5fd", BILL_PAYMENT_CHANNELS_RULES),
  {
    id: "recharge",
    label: "Recharge",
    color: "#10b981",
    channels: [
      ...ALL_VOICE_FIXED,
      ...ALL_VOICE_MOBILE,
      ...RECHARGE_DATA_SABBA_RULES,
      ...RECHARGE_DATA_EVOUCHER_RULES,
    ],
    children: [
      leafNode("recharge:voix-fixe", "Voix Fixe", "#34d399", ALL_VOICE_FIXED),
      leafNode("recharge:voix-mobile", "Voix Mobile", "#6ee7b7", ALL_VOICE_MOBILE),
      leafNode("recharge:data-sabba", "DATA Sabba", "#5eead4", RECHARGE_DATA_SABBA_RULES),
      leafNode("recharge:data-evoucher", "DATA Evoucher", "#99f6e4", RECHARGE_DATA_EVOUCHER_RULES),
    ],
  },
  {
    id: "vfp",
    label: "Voucher For Payment",
    color: "#06b6d4",
    channels: [...VOUCHER_FOR_PAYMENT_GENERATION, ...VOUCHER_FOR_PAYMENT_REDEMPTION],
    children: [
      leafNode("vfp:gen", "Génération", "#22d3ee", VOUCHER_FOR_PAYMENT_GENERATION),
      leafNode("vfp:red", "Rédemption & Remb.", "#67e8f9", VOUCHER_FOR_PAYMENT_REDEMPTION),
    ],
  },
  flatSection("credit", "Credit Transfer", "#f97316", "#fdba74", CREDIT_TRANSFER_RULES),
  {
    id: "conv",
    label: "Voucher Convergent",
    color: "#a855f7",
    channels: [
      ...EVOUCHER_ON_DEMAND_GENERATION_RULES,
      ...VOUCHER_CONVERGENT_CARTE_GENERATION_RULES,
      ...VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES,
    ],
    children: [
      leafNode(
        "conv:evoucher",
        "Evoucher Génération",
        "#c084fc",
        EVOUCHER_ON_DEMAND_GENERATION_RULES,
      ),
      leafNode(
        "conv:carte-gen",
        "Carte Génération",
        "#d8b4fe",
        VOUCHER_CONVERGENT_CARTE_GENERATION_RULES,
      ),
      leafNode(
        "conv:carte-act",
        "Carte Activation",
        "#e9d5ff",
        VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES,
      ),
    ],
  },
];

/** Every channel across the whole hierarchy (for the "Tous les canaux" root view). */
export const ALL_CANAL_CHANNELS: CanalRule[] = CANAL_HIERARCHY.flatMap((s) => s.channels);

/** Flat id → node lookup for both rings. */
export const CANAL_NODE_BY_ID: Map<string, CanalNode> = (() => {
  const map = new Map<string, CanalNode>();
  for (const section of CANAL_HIERARCHY) {
    map.set(section.id, section);
    for (const child of section.children ?? []) map.set(child.id, child);
  }
  return map;
})();
