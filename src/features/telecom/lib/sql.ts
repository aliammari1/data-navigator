import {
  type ClassifiedStatusSemantic,
  DEFAULT_STATUS_MAPPINGS,
  SEMANTIC_TO_CATEGORY,
  SPEC_STATUS_CODES,
} from "@/features/telecom/lib/status-definitions";
import type { CanalKey, ColumnMapping, StatusMapping } from "../types";
import {
  BILL_PAYMENT_CHANNELS,
  type ChannelDef,
  CREDIT_TRANSFER,
  RECHARGE_DATA_EVOUCHER,
  RECHARGE_DATA_SABBA,
  RECHARGE_VOICE_FIXED_TTCASH,
  RECHARGE_VOICE_FIXED_VOUCHER,
  RECHARGE_VOICE_MOBILE_TTCASH,
  RECHARGE_VOICE_MOBILE_VOUCHER,
  VOUCHER_CONVERGENT,
  VOUCHER_FOR_PAYMENT,
} from "./report-engine";

export { SEMANTIC_TO_CATEGORY, SPEC_STATUS_CODES };

// ─── Identifier / literal quoting ─────────────────────────────────────────────

/** Safe SQL identifier quoting. Rejects identifiers containing dangerous characters. */
export function qc(col: string): string {
  if (!col || typeof col !== "string") {
    throw new TypeError("Invalid column identifier: must be a non-empty string");
  }
  // Reject identifiers that could be used for SQL injection
  if (/[;\\]|--|\/\*|\*\//.test(col)) {
    throw new Error(`Unsafe column identifier rejected: ${col}`);
  }
  return `"${col.replaceAll('"', '""')}"`;
}

/** Returns a SQL expression for col, or NULL literal when col is unmapped (empty string). */
export function colExpr(col: string): string {
  return col ? qc(col) : "NULL";
}

export function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// ─── Status normalisation ─────────────────────────────────────────────────────

export function normalizeStatusCode(
  status: string,
  mapping: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): string {
  const code = status.trim().toUpperCase();
  if (!code) return "";
  const configured = mapping.find((m) => m.rawCode.toUpperCase() === code);
  if (configured) {
    return configured.semantic === "other"
      ? "OTHER"
      : (SEMANTIC_TO_CATEGORY[configured.semantic] ?? "OTHER");
  }
  for (const [semantic, codes] of Object.entries(SPEC_STATUS_CODES) as Array<
    [ClassifiedStatusSemantic, string[]]
  >) {
    if (codes.includes(code)) return SEMANTIC_TO_CATEGORY[semantic];
  }
  return "OTHER";
}

export function statusNorm(
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): string {
  const s = qc(m.status);
  const v = `UPPER(TRIM(CAST(${s} AS VARCHAR)))`;
  const configuredCodes = new Set(sm.map((e) => e.rawCode.trim().toUpperCase()));
  const whenClauses = sm
    .filter((e) => e.rawCode.trim())
    .map((e) => {
      const code = e.rawCode.trim().toUpperCase();
      const cat = e.semantic === "other" ? "OTHER" : (SEMANTIC_TO_CATEGORY[e.semantic] ?? "OTHER");
      return `WHEN ${v} = ${sqlLiteral(code)} THEN ${sqlLiteral(cat)}`;
    });

  for (const [semantic, codes] of Object.entries(SPEC_STATUS_CODES) as Array<
    [ClassifiedStatusSemantic, string[]]
  >) {
    const missingCodes = codes.filter((code) => !configuredCodes.has(code));
    if (missingCodes.length === 0) continue;
    whenClauses.push(
      `WHEN ${v} IN (${missingCodes.map(sqlLiteral).join(",")}) THEN ${sqlLiteral(
        SEMANTIC_TO_CATEGORY[semantic],
      )}`,
    );
  }

  if (whenClauses.length > 0) {
    return `CASE
    ${whenClauses.join("\n    ")}
    WHEN ${v} = '' THEN 'OTHER'
    ELSE 'OTHER'
  END`;
  }

  return "'OTHER'";
}

// ─── Hour extraction ──────────────────────────────────────────────────────────

/** Extract hour (0–23) from TRANSACTION_DATE column. Format: "DD/MM/YYYY HH:MM:SS" */
export function hourExpr(m: ColumnMapping): string {
  const d = qc(m.transactionDate);
  return `TRY_CAST(SPLIT_PART(SPLIT_PART(CAST(${d} AS VARCHAR),' ',2),':',1) AS INTEGER)`;
}

// ─── Canal classification ─────────────────────────────────────────────────────

function anyChannel(channels: ChannelDef[]): string {
  return `(${channels.map((ch) => `(${ch.condition})`).join(" OR ")})`;
}

export function canalWhere(m: ColumnMapping): Record<CanalKey, string> {
  void m;
  return {
    bill_payment: anyChannel(BILL_PAYMENT_CHANNELS),
    voice_fixed_ttcash: anyChannel(RECHARGE_VOICE_FIXED_TTCASH),
    voice_fixed_voucher: anyChannel(RECHARGE_VOICE_FIXED_VOUCHER),
    voice_mobile_ttcash: anyChannel(RECHARGE_VOICE_MOBILE_TTCASH),
    voice_mobile_voucher: anyChannel(RECHARGE_VOICE_MOBILE_VOUCHER),
    data_sabba: anyChannel(RECHARGE_DATA_SABBA),
    data_evoucher: anyChannel(RECHARGE_DATA_EVOUCHER),
    voucher_for_payment: anyChannel(VOUCHER_FOR_PAYMENT),
    credit_transfer: anyChannel(CREDIT_TRANSFER),
    voucher_convergent: anyChannel(VOUCHER_CONVERGENT),
  };
}

export function canalCaseExpr(m: ColumnMapping): string {
  const w = canalWhere(m);
  return `CASE
    WHEN ${w.voucher_for_payment}  THEN 'Voucher For Payment'
    WHEN ${w.credit_transfer}      THEN 'Credit Transfer'
    WHEN ${w.voucher_convergent}   THEN 'Voucher Convergent Management'
    WHEN ${w.bill_payment}         THEN 'Bill Payment'
    WHEN ${w.voice_fixed_ttcash}   THEN 'Fixed by TTCASH'
    WHEN ${w.voice_fixed_voucher}  THEN 'Fixed by Voucher'
    WHEN ${w.voice_mobile_ttcash}  THEN 'Mobile by TTCASH'
    WHEN ${w.data_evoucher}        THEN 'Data by Voucher'
    WHEN ${w.data_sabba}           THEN 'Internet Sabba'
    WHEN ${w.voice_mobile_voucher} THEN 'Mobile by Voucher'
    ELSE 'Other'
  END`;
}
