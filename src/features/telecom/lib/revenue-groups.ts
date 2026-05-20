import type { CanalKey } from "@/features/telecom/types";

export const REVENUE_GROUPS: Record<
  string,
  { keys: CanalKey[]; color: string }
> = {
  "Bill Payment": {
    keys: ["bill_payment"],
    color: "#89b4fa",
  },
  Recharge: {
    keys: [
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
    ],
    color: "#a6e3a1",
  },
  "Voucher For Payment": {
    keys: ["voucher_for_payment"],
    color: "#94e2d5",
  },
  "Credit Transfer": {
    keys: ["credit_transfer"],
    color: "#fab387",
  },
  "Voucher Convergent": {
    keys: ["voucher_convergent"],
    color: "#cba6f7",
  },
};
