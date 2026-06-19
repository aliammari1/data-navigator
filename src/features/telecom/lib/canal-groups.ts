import {
  BILL_PAYMENT_CHANNELS,
  type ChannelDef,
  CREDIT_TRANSFER,
  EVOUCHER_ON_DEMAND_GENERATION,
  RECHARGE_DATA_EVOUCHER,
  RECHARGE_DATA_SABBA,
  RECHARGE_VOICE_FIXED_TTCASH,
  RECHARGE_VOICE_FIXED_VOUCHER,
  RECHARGE_VOICE_MOBILE_TTCASH,
  RECHARGE_VOICE_MOBILE_VOUCHER,
  VOUCHER_CONVERGENT_CARTE_ACTIVATION,
  VOUCHER_CONVERGENT_CARTE_GENERATION,
  VOUCHER_FOR_PAYMENT,
} from "@/features/telecom/lib/report-engine";

export interface ChannelGroup {
  label: string;
  channels: ChannelDef[];
  color?: string;
}

export const VOUCHER_FOR_PAYMENT_GENERATION = [VOUCHER_FOR_PAYMENT[0]];
export const VOUCHER_FOR_PAYMENT_REDEMPTION = VOUCHER_FOR_PAYMENT.slice(1);

export const ALL_VOICE_FIXED = [...RECHARGE_VOICE_FIXED_TTCASH, ...RECHARGE_VOICE_FIXED_VOUCHER];

export const ALL_VOICE_MOBILE = [...RECHARGE_VOICE_MOBILE_TTCASH, ...RECHARGE_VOICE_MOBILE_VOUCHER];

export const RECHARGE_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Fixed Lines", channels: ALL_VOICE_FIXED, color: "#89b4fa" },
  { label: "Mobile Lines", channels: ALL_VOICE_MOBILE, color: "#cba6f7" },
  { label: "Internet Sabba", channels: RECHARGE_DATA_SABBA, color: "#a6e3a1" },
  {
    label: "Data by Voucher",
    channels: RECHARGE_DATA_EVOUCHER,
    color: "#f38ba8",
  },
];

export const VOIX_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Fixed Lines", channels: ALL_VOICE_FIXED, color: "#89b4fa" },
  { label: "Mobile Lines", channels: ALL_VOICE_MOBILE, color: "#cba6f7" },
];

export const DATA_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Internet Sabba", channels: RECHARGE_DATA_SABBA, color: "#a6e3a1" },
  {
    label: "Data by Voucher",
    channels: RECHARGE_DATA_EVOUCHER,
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
    channels: EVOUCHER_ON_DEMAND_GENERATION,
    color: "#a6e3a1",
  },
  {
    label: "Génération",
    channels: VOUCHER_CONVERGENT_CARTE_GENERATION,
    color: "#89dceb",
  },
  {
    label: "Activation",
    channels: VOUCHER_CONVERGENT_CARTE_ACTIVATION,
    color: "#f9e2af",
  },
];

export const COMPARE_GROUPS: ChannelGroup[] = [
  {
    label: "Bill Payment",
    channels: BILL_PAYMENT_CHANNELS,
    color: "#89b4fa",
  },
  {
    label: "Fixed by TTCASH",
    channels: RECHARGE_VOICE_FIXED_TTCASH,
    color: "#cba6f7",
  },
  {
    label: "Fixed by Voucher",
    channels: RECHARGE_VOICE_FIXED_VOUCHER,
    color: "#a6e3a1",
  },
  {
    label: "Mobile by TTCASH",
    channels: RECHARGE_VOICE_MOBILE_TTCASH,
    color: "#f38ba8",
  },
  {
    label: "Mobile by Voucher",
    channels: RECHARGE_VOICE_MOBILE_VOUCHER,
    color: "#fab387",
  },
  {
    label: "Internet Sabba",
    channels: RECHARGE_DATA_SABBA,
    color: "#89dceb",
  },
  {
    label: "Data by Voucher",
    channels: RECHARGE_DATA_EVOUCHER,
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
  { label: "Credit Transfer", channels: CREDIT_TRANSFER, color: "#94e2d5" },
  {
    label: "Evoucher on Demand — Generation",
    channels: EVOUCHER_ON_DEMAND_GENERATION,
    color: "#a6e3a1",
  },
  {
    label: "Voucher Convergent — Generation",
    channels: VOUCHER_CONVERGENT_CARTE_GENERATION,
    color: "#cba6f7",
  },
  {
    label: "Voucher Convergent — Activation",
    channels: VOUCHER_CONVERGENT_CARTE_ACTIVATION,
    color: "#f9e2af",
  },
];
