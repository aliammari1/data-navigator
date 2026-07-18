import {
  BILL_PAYMENT_CHANNELS_RULES,
  CREDIT_TRANSFER_RULES,
  EVOUCHER_ON_DEMAND_GENERATION_RULES,
  RECHARGE_DATA_EVOUCHER_RULES,
  RECHARGE_DATA_SABBA_RULES,
  RECHARGE_VOICE_FIXED_TTCASH_RULES,
  RECHARGE_VOICE_FIXED_VOUCHER_RULES,
  RECHARGE_VOICE_MOBILE_TTCASH_RULES,
  RECHARGE_VOICE_MOBILE_VOUCHER_RULES,
  VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES,
  VOUCHER_CONVERGENT_CARTE_GENERATION_RULES,
  VOUCHER_FOR_PAYMENT_RULES,
} from "@/features/telecom/lib/report-engine";

import type { CanalRule } from "@/features/telecom/types";

export interface ChannelGroup {
  label: string;
  channels: CanalRule[];
  color?: string;
}

export const VOUCHER_FOR_PAYMENT_GENERATION = VOUCHER_FOR_PAYMENT_RULES.slice(0, 1);
export const VOUCHER_FOR_PAYMENT_REDEMPTION = VOUCHER_FOR_PAYMENT_RULES.slice(1);

export const ALL_VOICE_FIXED = [
  ...RECHARGE_VOICE_FIXED_TTCASH_RULES,
  ...RECHARGE_VOICE_FIXED_VOUCHER_RULES,
];

export const ALL_VOICE_MOBILE = [
  ...RECHARGE_VOICE_MOBILE_TTCASH_RULES,
  ...RECHARGE_VOICE_MOBILE_VOUCHER_RULES,
];

export const RECHARGE_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Fixed Lines", channels: ALL_VOICE_FIXED, color: "#89b4fa" },
  { label: "Mobile Lines", channels: ALL_VOICE_MOBILE, color: "#cba6f7" },
  { label: "Internet Sabba", channels: RECHARGE_DATA_SABBA_RULES, color: "#a6e3a1" },
  {
    label: "Data by Voucher",
    channels: RECHARGE_DATA_EVOUCHER_RULES,
    color: "#f38ba8",
  },
];

export const VOIX_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Fixed Lines", channels: ALL_VOICE_FIXED, color: "#89b4fa" },
  { label: "Mobile Lines", channels: ALL_VOICE_MOBILE, color: "#cba6f7" },
];

export const DATA_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Internet Sabba", channels: RECHARGE_DATA_SABBA_RULES, color: "#a6e3a1" },
  {
    label: "Data by Voucher",
    channels: RECHARGE_DATA_EVOUCHER_RULES,
    color: "#f38ba8",
  },
];

export const VOUCHER_PAYMENT_SUMMARY_GROUPS: ChannelGroup[] = [
  {
    label: "Génération",
    channels: VOUCHER_FOR_PAYMENT_GENERATION,
    color: "#89dceb",
  },
  {
    label: "Rédemption & Remboursement",
    channels: VOUCHER_FOR_PAYMENT_REDEMPTION,
    color: "#fab387",
  },
];

export const VOUCHER_CONVERGENT_SUMMARY_GROUPS: ChannelGroup[] = [
  {
    label: "Evoucher on Demand",
    channels: EVOUCHER_ON_DEMAND_GENERATION_RULES,
    color: "#a6e3a1",
  },
  {
    label: "Génération",
    channels: VOUCHER_CONVERGENT_CARTE_GENERATION_RULES,
    color: "#89dceb",
  },
  {
    label: "Activation",
    channels: VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES,
    color: "#f9e2af",
  },
];

export const COMPARE_GROUPS: ChannelGroup[] = [
  {
    label: "Bill Payment",
    channels: BILL_PAYMENT_CHANNELS_RULES,
    color: "#89b4fa",
  },
  {
    label: "Fixed by TTCASH",
    channels: RECHARGE_VOICE_FIXED_TTCASH_RULES,
    color: "#cba6f7",
  },
  {
    label: "Fixed by Voucher",
    channels: RECHARGE_VOICE_FIXED_VOUCHER_RULES,
    color: "#a6e3a1",
  },
  {
    label: "Mobile by TTCASH",
    channels: RECHARGE_VOICE_MOBILE_TTCASH_RULES,
    color: "#f38ba8",
  },
  {
    label: "Mobile by Voucher",
    channels: RECHARGE_VOICE_MOBILE_VOUCHER_RULES,
    color: "#fab387",
  },
  {
    label: "Internet Sabba",
    channels: RECHARGE_DATA_SABBA_RULES,
    color: "#89dceb",
  },
  {
    label: "Data by Voucher",
    channels: RECHARGE_DATA_EVOUCHER_RULES,
    color: "#f9e2af",
  },
  {
    label: "Voucher For Payment — Generation",
    channels: VOUCHER_FOR_PAYMENT_GENERATION,
    color: "#b4befe",
  },
  {
    label: "Voucher For Payment — Redemption",
    channels: VOUCHER_FOR_PAYMENT_REDEMPTION,
    color: "#eba0ac",
  },
  { label: "Credit Transfer", channels: CREDIT_TRANSFER_RULES, color: "#94e2d5" },
  {
    label: "Evoucher on Demand — Generation",
    channels: EVOUCHER_ON_DEMAND_GENERATION_RULES,
    color: "#a6e3a1",
  },
  {
    label: "Voucher Convergent — Generation",
    channels: VOUCHER_CONVERGENT_CARTE_GENERATION_RULES,
    color: "#cba6f7",
  },
  {
    label: "Voucher Convergent — Activation",
    channels: VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES,
    color: "#f9e2af",
  },
];
