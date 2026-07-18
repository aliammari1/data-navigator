import type { CanalKey } from "@/features/telecom/types";

// 3-Level Hierarchical Revenue Groups
// Level 1: Main Categories
// Level 2: Sub-Categories  
// Level 3: Individual Canal Types
export const REVENUE_GROUPS: Record<string, { keys: CanalKey[]; color: string; level?: number; parent?: string }> = {
  // Level 1 - Main Categories
  "Payments": {
    keys: ["bill_payment", "voucher_for_payment", "credit_transfer"],
    color: "#89b4fa",
    level: 1,
  },
  "Recharge": {
    keys: [
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
    ],
    color: "#a6e3a1",
    level: 1,
  },
  "Voucher Management": {
    keys: ["voucher_convergent"],
    color: "#cba6f7",
    level: 1,
  },
  // Level 2 - Sub-Categories (optional, for future expansion)
  "Bill Payment": {
    keys: ["bill_payment"],
    color: "#89b4fa",
    level: 2,
    parent: "Payments",
  },
  "Voucher For Payment": {
    keys: ["voucher_for_payment"],
    color: "#94e2d5",
    level: 2,
    parent: "Payments",
  },
  "Credit Transfer": {
    keys: ["credit_transfer"],
    color: "#fab387",
    level: 2,
    parent: "Payments",
  },
  "Voice Recharge": {
    keys: ["voice_fixed_ttcash", "voice_fixed_voucher", "voice_mobile_ttcash", "voice_mobile_voucher"],
    color: "#a6e3a1",
    level: 2,
    parent: "Recharge",
  },
  "Data Recharge": {
    keys: ["data_sabba", "data_evoucher"],
    color: "#94e2d5",
    level: 2,
    parent: "Recharge",
  },
  // Level 3 - Individual Canal Types (for granular filtering)
  "Fixed TTCASH": {
    keys: ["voice_fixed_ttcash"],
    color: "#89b4fa",
    level: 3,
    parent: "Voice Recharge",
  },
  "Fixed Voucher": {
    keys: ["voice_fixed_voucher"],
    color: "#a6e3a1",
    level: 3,
    parent: "Voice Recharge",
  },
  "Mobile TTCASH": {
    keys: ["voice_mobile_ttcash"],
    color: "#f38ba8",
    level: 3,
    parent: "Voice Recharge",
  },
  "Mobile Voucher": {
    keys: ["voice_mobile_voucher"],
    color: "#fab387",
    level: 3,
    parent: "Voice Recharge",
  },
  "Internet Sabba": {
    keys: ["data_sabba"],
    color: "#cba6f7",
    level: 3,
    parent: "Data Recharge",
  },
  "Data Evoucher": {
    keys: ["data_evoucher"],
    color: "#94e2d5",
    level: 3,
    parent: "Data Recharge",
  },
  "Voucher Convergent": {
    keys: ["voucher_convergent"],
    color: "#cba6f7",
    level: 2,
    parent: "Voucher Management",
  },
};

// Get only top-level groups for the UI
export const TOP_LEVEL_GROUPS = Object.entries(REVENUE_GROUPS)
  .filter(([_, v]) => v.level === 1)
  .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as Record<string, { keys: CanalKey[]; color: string; level?: number; parent?: string }>);

// Get all groups for a specific level
export function getGroupsByLevel(level: number) {
  return Object.entries(REVENUE_GROUPS)
    .filter(([_, v]) => v.level === level)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as Record<string, { keys: CanalKey[]; color: string; level?: number; parent?: string }>);
}
