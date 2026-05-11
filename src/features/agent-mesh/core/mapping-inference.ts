import type { ColumnMapping } from "@/features/telecom/types";
// ─── Column name patterns for infer-mapping ──────────────────────────────────

const FIELD_PATTERNS: Array<{
  field: keyof ColumnMapping;
  patterns: RegExp[];
}> = [
  {
    field: "transactionId",
    patterns: [/transaction_?id/i, /tx_?id/i, /ref_?no/i, /order_?id/i],
  },
  {
    field: "transactionDate",
    patterns: [
      /transaction_?date/i,
      /tx_?date/i,
      /created_?at/i,
      /date_?op/i,
      /date/i,
    ],
  },
  {
    field: "amount",
    patterns: [/original_?amount/i, /amount/i, /montant/i, /price/i],
  },
  {
    field: "status",
    patterns: [/transaction_?status/i, /tx_?status/i, /status/i, /etat/i],
  },
  {
    field: "errorCode",
    patterns: [
      /error_?code/i,
      /err_?code/i,
      /sub_?status/i,
      /substatus/i,
      /code_?err/i,
    ],
  },
  {
    field: "canal",
    patterns: [/canal/i, /channel/i, /product_?code/i],
  },
  {
    field: "msisdn",
    patterns: [
      /msisdn/i,
      /customer_?msisdn/i,
      /phone/i,
      /mobile/i,
      /subscriber/i,
    ],
  },
  {
    field: "amount",
    patterns: [/amount/i],
  },
  {
    field: "region",
    patterns: [/account_?id/i, /account/i, /region/i, /zone/i],
  },
  {
    field: "serviceName",
    patterns: [/service_?name/i, /brand_?name/i, /product_?name/i, /service/i],
  },
  {
    field: "operator",
    patterns: [/operator/i, /brand_?d/i, /brand/i, /operateur/i],
  },
];

export function inferColumnMapping(columns: string[]): Partial<ColumnMapping> {
  const result: Partial<ColumnMapping> = {};
  for (const { field, patterns } of FIELD_PATTERNS) {
    if (result[field]) continue;
    for (const pattern of patterns) {
      const match = columns.find((col) => pattern.test(col));
      if (match) {
        (result as Record<string, string>)[field] = match;
        break;
      }
    }
  }
  return result;
}
