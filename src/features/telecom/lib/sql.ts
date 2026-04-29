import type { ColumnMapping, StatusMapping, StatusSemantic, CanalKey } from "../types";
import { DEFAULT_STATUS_MAPPINGS } from "../constants";

// ─── Identifier / literal quoting ─────────────────────────────────────────────

export function qc(col: string): string {
  return `"${col.replace(/"/g, '""')}"`;
}

/** Returns a SQL expression for col, or NULL literal when col is unmapped (empty string). */
export function colExpr(col: string): string {
  return col ? qc(col) : "NULL";
}

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ─── Status normalisation ─────────────────────────────────────────────────────

export const SEMANTIC_TO_CATEGORY: Record<
  Exclude<StatusSemantic, "other">,
  string
> = {
  success: "SUCCESS",
  declined: "DECLINED",
  refund: "REFUND",
  instance: "INSTANCE",
  submitted: "SUBMITTED",
};

export const BUILTIN_STATUS_CODES: Record<
  Exclude<StatusSemantic, "other">,
  string[]
> = {
  success: ["PST", "PST1", "PST2", "PST7", "PST8", "PST9"],
  declined: [
    "DCL", "DCT", "DCA", "DCR", "DCB",
    "RDCL", "RDCT", "RDCA", "RDCR",
    "SDL1", "SDL2", "SDL3", "SDL4", "SDL7",
    "PDL", "PDL1", "REJ", "CAN", "FLD", "ERR",
  ],
  refund: ["RFD", "RFD3", "RFD4", "RVS"],
  instance: [
    "HLD", "TPP", "TTO", "PRF", "RHL",
    "RTO", "STO", "STP", "SRV", "SRV1", "SRTO",
    "RHD", "RHD3", "RHD4",
    "DBT", "DBA", "RDBT", "RDBA", "SDT", "SRDT",
    "PND", "EXP",
  ],
  submitted: ["SBM"],
};

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
  for (const [semantic, codes] of Object.entries(BUILTIN_STATUS_CODES) as Array<
    [Exclude<StatusSemantic, "other">, string[]]
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
      const cat =
        e.semantic === "other"
          ? "OTHER"
          : (SEMANTIC_TO_CATEGORY[e.semantic] ?? "OTHER");
      return `WHEN ${v} = ${sqlLiteral(code)} THEN ${sqlLiteral(cat)}`;
    });

  for (const [semantic, codes] of Object.entries(BUILTIN_STATUS_CODES) as Array<
    [Exclude<StatusSemantic, "other">, string[]]
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

export function canalWhere(m: ColumnMapping): Record<CanalKey, string> {
  const svc = qc(m.serviceCode);       // SERVICE_CLASS_NAME
  const cat = qc(m.transactionType);   // BRAND_CATEGORY_NAME
  const ch  = qc(m.canal);             // CHANNEL

  const S  = `UPPER(CAST(${svc} AS VARCHAR))`;
  const C  = `UPPER(CAST(${cat} AS VARCHAR))`;
  const H  = `UPPER(CAST(${ch}  AS VARCHAR))`;
  const BD = `TRY_CAST("BRAND_D" AS INT)`;

  return {
    bill_payment: `(
      ${S} LIKE '%BILL%' OR ${S} LIKE '%FACTURE%' OR ${S} LIKE '%PAYMENT%' OR ${S} LIKE '%PAIEMENT%'
      OR ${C} LIKE '%BILL%' OR ${C} LIKE '%FACTURE%' OR ${C} LIKE '%PAYMENT%'
    )`,
    voice_fixed_ttcash: `(
      (${S} LIKE '%TTCASH%' OR ${S} LIKE '%TT_CASH%')
      AND (${S} LIKE '%FIXE%' OR ${S} LIKE '%FIXED%' OR ${S} LIKE '%FIX%')
    )`,
    voice_fixed_voucher: `(
      (${S} LIKE '%VOUCHER%' OR ${S} LIKE '%EVOUCHER%')
      AND (${S} LIKE '%FIXE%' OR ${S} LIKE '%FIXED%' OR ${S} LIKE '%FIX%')
    )`,
    voice_mobile_ttcash: `(
      ${S} IN ('TTCASH_MOBILE','DIGITAL_TTCASH_MOBILE')
      OR (${S} LIKE '%TTCASH%MOBILE%' OR ${S} LIKE '%TTCASH%MOB%')
      OR (${C} = 'TOPUP' AND ${H} = 'GPT')
    )`,
    voice_mobile_voucher: `(
      ${S} LIKE '%EVOUCHER%REDEMPTION%MOBILE%'
      OR ${S} LIKE '%EVOUCHER%RECHARGE%REDEMPTION%'
      OR ${S} = 'DIGITAL_EVOUCHER_RECHARGE_REDEMPTION_MOBILE'
      OR ${S} IN ('EVOUCHER_RECHARGE_GENERATION','DIGITAL_EVOUCHER_RECHARGE_GENERATION','EVOUCHER_RECHARGE_MM_GENERATION')
      OR (${C} = 'EVOUCHER' AND ${S} LIKE '%GENERATION%' AND ${S} NOT LIKE '%DATA%')
      OR (${C} = 'TOPUP' AND ${H} = 'USD' AND ${S} NOT LIKE '%DATA%')
    )`,
    data_sabba: `(
      ${S} IN ('ETOPUP_DATA','DIGITAL_ETOPUP_DATA','DIGITAL_TTCASH_DATA','TTCASH_DATA','BONUS_VOIX_ACHAT_DATA')
      OR ${S} LIKE '%ETOPUP%DATA%'
      OR ${C} = 'ETOPUP_DATA_GROUP'
      OR (${C} = 'PROMOTION' AND ${S} LIKE '%DATA%')
    )`,
    data_evoucher: `(
      ${S} LIKE '%EVOUCHER%DATA%'
      OR ${S} = 'EVOUCHER_DATA_GENERATION'
      OR (${C} = 'EVOUCHER' AND ${S} LIKE '%DATA%')
    )`,
    voucher_for_payment: `(
      ${BD} IN (98, 99, 100)
    )`,
    credit_transfer: `(
      ${BD} IN (88, 89, 111, 159)
    )`,
    voucher_convergent: `(
      ${BD} IN (163, 166, 167, 119, 120, 133, 134, 150, 151, 160, 107, 115)
    )`,
  };
}

export function canalCaseExpr(m: ColumnMapping): string {
  const w = canalWhere(m);
  // data_evoucher evaluated before data_sabba to avoid data-specific EVouchers falling into ETOPUP bucket
  return `CASE
    WHEN ${w.voucher_for_payment}  THEN 'Voucher For Payment'
    WHEN ${w.credit_transfer}      THEN 'Credit Transfer'
    WHEN ${w.voucher_convergent}   THEN 'Voucher For Recharge Management'
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
