/**
 * Channel catalog. Shared by every tab so the list is defined once.
 * When real DuckDB metrics are available the live channel set is derived from
 * the data (see `data/metrics-source.ts`); this catalog provides stable labels
 * and the demo fallback set.
 */

export interface ChannelDef {
  key: string;
  label: string;
}

export const CHANNELS: ChannelDef[] = [
  { key: "bill_payment", label: "Bill Payment" },
  { key: "voice_fixed_ttcash", label: "Voice Fixed TT-Cash" },
  { key: "voice_fixed_voucher", label: "Voice Fixed Voucher" },
  { key: "voice_mobile_ttcash", label: "Voice Mobile TT-Cash" },
  { key: "voice_mobile_voucher", label: "Voice Mobile Voucher" },
  { key: "data_sabba", label: "Data Sabba" },
  { key: "data_evoucher", label: "Data E-Voucher" },
  { key: "voucher_for_payment", label: "Voucher for Payment" },
  { key: "credit_transfer", label: "Credit Transfer" },
  { key: "voucher_convergent", label: "Voucher Convergent" },
];

const LABEL_BY_KEY = new Map(CHANNELS.map((c) => [c.key, c.label]));

/** Resolve a friendly label, falling back to the raw key. */
export function channelLabel(key: string): string {
  return LABEL_BY_KEY.get(key) ?? key;
}
