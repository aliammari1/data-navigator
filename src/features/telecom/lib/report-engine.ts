/**
 * Telecom Daily Report Engine
 * Processes DailyTransactions CSV files with pipe-delimited format.
 * All processing done offline via DuckDB WASM — zero network calls.
 *
 * NOTE: Status codes are centralized in @/features/telecom/lib/status-definitions
 * All status-related constants are imported from there.
 */

import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import {
  REPORT_DOUBT_STATUS_CODES,
  REPORT_HOLD_STATUS_CODES,
  REPORT_INSTANCE_STATUS_CODES,
  SPEC_STATUS_CODES,
  sqlStatusInList,
} from "@/features/telecom/lib/status-definitions";
import { loadDelimitedCSVToDuckDB, runQuery } from "@/platform/duckdb/duckdb";
import { createTelecomEnrichedView } from "@/features/telecom/lib/queries";

// ─── Constants ────────────────────────────────────────────────────────────────

export const REPORT_TABLE = TELECOM_TABLE_BASE;

export const TRANSACTION_COLUMNS = [
  "ACCOUNT_ID",
  "ACCOUNT_NAME",
  "ACCOUNT_MSISDN",
  "ACCOUNT_GROUP_ID",
  "ACCOUNT_LAYER_ID",
  "CUSTOMER_MSISDN",
  "CUSTOMER_NAME",
  "CUSTOMER_GROUP_NAME",
  "BRAND_D",
  "BRAND_NAME",
  "BRAND_CATEGORY_ID",
  "BRAND_CATEGORY_NAME",
  "SERVICE_CLASS_ID",
  "SERVICE_CLASS_NAME",
  "TRANSACTION_ID",
  "TRANSACTION_DATE",
  "ORIGINAL_AMOUNT",
  "SOURCE_FEE_1_AMOUNT",
  "SOURCE_FEE_2_AMOUNT",
  "SOURCE_FEE_3_AMOUNT",
  "SOURCE_TAX_AMOUNT",
  "NET_DEBIT_AMOUNT_SOURCE",
  "DEST_COMM1_AMOUNT",
  "DEST_COMM2_AMOUNT",
  "DEST_COMM3_AMOUNT",
  "NET_CREDIT_AMOUNT",
  "REQUEST_ID",
  "EXTERNAL_REFERENCE",
  "REMARK",
  "TRANSACTION_STATUS",
  "REQUESTER_ID",
  "APPROVER_ID",
  "REQUEST_DATE",
  "APPROVE_DATE",
  "CHANNEL",
  "BALANCE_BEFORE",
  "BALANCE_AFTER",
  "REFERENCE_ID",
  "CONFIRMATION_ID",
  "SALES_PERSON",
  "ACCOUNT_NUMBER",
  "GENERATION_TRANSACTION_ID",
  "GENERATION_ACCOUNT_NAME",
  "GENERATION_ACCOUNT_MOBILE_NUMBER",
  "VOUCHER_CODE",
  "SERIAL_NUMBER",
  "EXTRA_INFO1",
  "EXTRA_INFO2",
  "EXTRA_INFO3",
  "EXTRA_INFO4",
  "EXTRA_INFO5",
] as const;

// ─── Status mapping ───────────────────────────────────────────────────────────

export const STATUS_MAP = {
  HOLD: {
    label: "Instance",
    subStatuses: REPORT_HOLD_STATUS_CODES,
  },
  DOUBT: {
    label: "Instance",
    subStatuses: REPORT_DOUBT_STATUS_CODES,
  },
  SUCCESS: {
    label: "Réussie",
    subStatuses: SPEC_STATUS_CODES.success,
  },
  REFUND: {
    label: "Annulation",
    subStatuses: SPEC_STATUS_CODES.refund,
  },
  DECLINED: {
    label: "Echec",
    subStatuses: SPEC_STATUS_CODES.declined,
  },
  SUBMITTED: {
    label: "Confirmé",
    subStatuses: SPEC_STATUS_CODES.submitted,
  },
} as const;

const SUCCESS_STATUSES = STATUS_MAP.SUCCESS.subStatuses;
const INSTANCE_STATUSES = REPORT_INSTANCE_STATUS_CODES;
const REFUND_STATUSES = STATUS_MAP.REFUND.subStatuses;
const DECLINED_STATUSES = STATUS_MAP.DECLINED.subStatuses;

// ─── Channel definitions ──────────────────────────────────────────────────────

export interface ChannelDef {
  name: string;
  condition: string;
}

export const BILL_PAYMENT_CHANNELS: ChannelDef[] = [
  {
    name: "IZIPAY",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 39 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21619444555'",
  },
  {
    name: "SMT",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 39 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21619777888'",
  },
  {
    name: "ENDATAO",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 39 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692507919'",
  },
  {
    name: "ATB",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 35 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 14 AND TRY_CAST(ACCOUNT_GROUP_ID AS INT) = 152",
  },
  {
    name: "KASHY",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 39 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '2160000111222'",
  },
];

export const RECHARGE_VOICE_FIXED_TTCASH: ChannelDef[] = [
  {
    name: "Espaces TT",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 61 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 12",
  },
  {
    name: "USSD 136",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 61 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 9",
  },
  {
    name: "USSD 170",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 61 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 6",
  },
  {
    name: "ATB",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 9 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 14 AND TRY_CAST(ACCOUNT_GROUP_ID AS INT) = 152",
  },
  {
    name: "STB",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 9 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 14 AND TRY_CAST(ACCOUNT_GROUP_ID AS INT) = 162",
  },
  {
    name: "SMT",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 9 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21619111222'",
  },
  {
    name: "IZIPAY",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 61 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21699270724'",
  },
  {
    name: "ENDATAO",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 61 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692509273'",
  },
  {
    name: "RUNPAY",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (61, 147) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21693033354'",
  },
  {
    name: "EDC",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 61 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21698276912'",
  },
  {
    name: "PAYPOS",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 61 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692836704'",
  },
  { name: "MyTT", condition: "TRY_CAST(BRAND_D AS INT) = 118" },
  { name: "PORTAILTT", condition: "TRY_CAST(BRAND_D AS INT) = 132" },
  { name: "PO9", condition: "TRY_CAST(BRAND_D AS INT) = 149" },
  { name: "Eshop", condition: "TRY_CAST(BRAND_D AS INT) = 156" },
  {
    name: "Callcenter/XV",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 38 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692885461'",
  },
];

export const RECHARGE_VOICE_FIXED_VOUCHER: ChannelDef[] = [
  {
    name: "USSD 123",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 108 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '2160123456789'",
  },
  {
    name: "USSD 170",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 108 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 6",
  },
  { name: "MyTT", condition: "TRY_CAST(BRAND_D AS INT) = 122" },
  { name: "PortailTT", condition: "TRY_CAST(BRAND_D AS INT) = 136" },
  { name: "CallCenter/XV", condition: "TRY_CAST(BRAND_D AS INT) = 162" },
  { name: "PO9", condition: "TRY_CAST(BRAND_D AS INT) = 153" },
];

export const RECHARGE_VOICE_MOBILE_TTCASH: ChannelDef[] = [
  {
    name: "Espaces TT",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59) AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 12",
  },
  {
    name: "USSD 136",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59) AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 9",
  },
  {
    name: "USSD 170",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59) AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 6",
  },
  {
    name: "ATB",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (8, 31) AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 14 AND TRY_CAST(ACCOUNT_GROUP_ID AS INT) = 152",
  },
  {
    name: "STB",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (8, 31) AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 14 AND TRY_CAST(ACCOUNT_GROUP_ID AS INT) = 162",
  },
  {
    name: "SMT",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21619111222'",
  },
  {
    name: "IZIPAY",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21699270724'",
  },
  {
    name: "ENDATAO",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692509273'",
  },
  {
    name: "RUNPAY",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59, 146) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21693033354'",
  },
  {
    name: "EDC",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21698276912'",
  },
  {
    name: "PAYPOS",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (56, 57, 58, 59) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692836704'",
  },
  { name: "MyTT", condition: "TRY_CAST(BRAND_D AS INT) = 117" },
  { name: "PORTAILTT", condition: "TRY_CAST(BRAND_D AS INT) = 131" },
  { name: "PO9", condition: "TRY_CAST(BRAND_D AS INT) = 148" },
  { name: "Eshop", condition: "TRY_CAST(BRAND_D AS INT) = 155" },
  {
    name: "Callcenter/XV",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (7, 37) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692885461'",
  },
  {
    name: "DTOne",
    condition: "TRY_CAST(BRAND_D AS INT) IN (42, 43, 44, 45, 46, 47)",
  },
  {
    name: "Bonus DTone",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 48 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692885410'",
  },
  {
    name: "Bonus suite recharge DATA",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 96 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692885467'",
  },
];

export const RECHARGE_VOICE_MOBILE_VOUCHER: ChannelDef[] = [
  {
    name: "USSD 123",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 109 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '2160123456789'",
  },
  {
    name: "USSD 170",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 109 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 6",
  },
  { name: "MyTT", condition: "TRY_CAST(BRAND_D AS INT) = 121" },
  { name: "PortailTT", condition: "TRY_CAST(BRAND_D AS INT) = 135" },
  { name: "CallCenter/XV", condition: "TRY_CAST(BRAND_D AS INT) = 161" },
  { name: "PO9", condition: "TRY_CAST(BRAND_D AS INT) = 152" },
];

export const RECHARGE_DATA_SABBA: ChannelDef[] = [
  {
    name: "USSD 236",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 9",
  },
  {
    name: "USSD 170",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 6",
  },
  {
    name: "ESPACES TT",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 12",
  },
  { name: "PORTAIL TT", condition: "TRY_CAST(BRAND_D AS INT) = 137" },
  { name: "MYTT", condition: "TRY_CAST(BRAND_D AS INT) = 123" },
  {
    name: "RUNPAY",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21693033354'",
  },
  {
    name: "PAYSPOS",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692836704'",
  },
  {
    name: "EDC",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21698276912'",
  },
  {
    name: "ENDATAO",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692509273'",
  },
  {
    name: "IZIPAY",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21699270724'",
  },
  {
    name: "TOPNET",
    condition:
      "TRY_CAST(BRAND_D AS INT) = 95 AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 5",
  },
];

export const RECHARGE_DATA_EVOUCHER: ChannelDef[] = [
  { name: "USSD 227", condition: "TRY_CAST(BRAND_D AS INT) = 158" },
];

export const VOUCHER_FOR_PAYMENT: ChannelDef[] = [
  {
    name: "Voucher For Payment GENERATION",
    condition: "TRY_CAST(BRAND_D AS INT) = 98",
  },
  {
    name: "Voucher For Payment REDEMPTION",
    condition: "TRY_CAST(BRAND_D AS INT) = 99",
  },
  {
    name: "REFUND OF VOUCHER REDEEMED",
    condition: "TRY_CAST(BRAND_D AS INT) = 100",
  },
];

export const CREDIT_TRANSFER: ChannelDef[] = [
  { name: "Credit Transfer", condition: "TRY_CAST(BRAND_D AS INT) = 88" },
  { name: "Credit Transfer Bonus", condition: "TRY_CAST(BRAND_D AS INT) = 89" },
  {
    name: "CreditTransfer_CashOut",
    condition: "TRY_CAST(BRAND_D AS INT) = 111",
  },
  {
    name: "Credit_Elec_Personnel_TT",
    condition: "TRY_CAST(BRAND_D AS INT) = 159",
  },
];

export const EVOUCHER_ON_DEMAND_GENERATION: ChannelDef[] = [
  {
    name: "MyTT",
    condition: "TRY_CAST(BRAND_D AS INT) IN (119, 120)",
  },
  {
    name: "PortailTT",
    condition: "TRY_CAST(BRAND_D AS INT) IN (133, 134)",
  },
  {
    name: "PO9",
    condition: "TRY_CAST(BRAND_D AS INT) IN (150, 151)",
  },
  {
    name: "AZIZA",
    condition: "TRY_CAST(BRAND_D AS INT) = 160",
  },
  {
    name: "RUNPAY",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (107, 115) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21693033354'",
  },
  {
    name: "EDC",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (107, 115) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21698276912'",
  },
  {
    name: "PAYPOS",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (107, 115) AND TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = '21692836704'",
  },
  {
    name: "USSD 170",
    condition:
      "TRY_CAST(BRAND_D AS INT) IN (107, 115) AND TRY_CAST(ACCOUNT_LAYER_ID AS INT) = 6",
  },
];

export const VOUCHER_CONVERGENT_CARTE_GENERATION: ChannelDef[] = [
  {
    name: "TBT_Carte_Convergante_Batch_Generation",
    condition: "TRY_CAST(BRAND_D AS INT) = 166",
  },
];

export const VOUCHER_CONVERGENT_CARTE_ACTIVATION: ChannelDef[] = [
  {
    name: "Activation des cartes de recharge convergente",
    condition: "TRY_CAST(BRAND_D AS INT) = 163",
  },
  {
    name: "Annulation de l'activation des cartes de recharge",
    condition: "TRY_CAST(BRAND_D AS INT) = 167",
  },
];

export const VOUCHER_CONVERGENT: ChannelDef[] = [
  ...EVOUCHER_ON_DEMAND_GENERATION,
  ...VOUCHER_CONVERGENT_CARTE_GENERATION,
  ...VOUCHER_CONVERGENT_CARTE_ACTIVATION,
];

// ─── Report section definition ────────────────────────────────────────────────

export interface ReportSection {
  id: string;
  title: string;
  subtitle?: string;
  channels: ChannelDef[];
}

export const REPORT_SECTIONS: ReportSection[] = [
  {
    id: "bill-payment",
    title: "I. Paiement des factures",
    channels: BILL_PAYMENT_CHANNELS,
  },
  {
    id: "voice-fixed-ttcash",
    title: "II. Recharge Voix — Lignes Fixes — TTCASH",
    channels: RECHARGE_VOICE_FIXED_TTCASH,
  },
  {
    id: "voice-fixed-voucher",
    title: "II. Recharge Voix — Lignes Fixes — Voucher",
    channels: RECHARGE_VOICE_FIXED_VOUCHER,
  },
  {
    id: "voice-mobile-ttcash",
    title: "II. Recharge Voix — Lignes Mobiles — TTCASH",
    channels: RECHARGE_VOICE_MOBILE_TTCASH,
  },
  {
    id: "voice-mobile-voucher",
    title: "II. Recharge Voix — Lignes Mobiles — Voucher",
    channels: RECHARGE_VOICE_MOBILE_VOUCHER,
  },
  {
    id: "data-sabba",
    title: "III. DATA — Internet Sabba (électronique)",
    channels: RECHARGE_DATA_SABBA,
  },
  {
    id: "data-evoucher",
    title: "III. DATA — Evoucher",
    channels: RECHARGE_DATA_EVOUCHER,
  },
  {
    id: "voucher-for-payment",
    title: "IV. Voucher For Payment",
    channels: VOUCHER_FOR_PAYMENT,
  },
  {
    id: "credit-transfer",
    title: "V. Credit Transfer",
    channels: CREDIT_TRANSFER,
  },
  {
    id: "evoucher-on-demand",
    title: "VI. Voucher Convergent — Evoucher on Demand — Génération",
    channels: EVOUCHER_ON_DEMAND_GENERATION,
  },
  {
    id: "voucher-convergent-carte-generation",
    title: "VI. Voucher Convergent — Génération",
    channels: VOUCHER_CONVERGENT_CARTE_GENERATION,
  },
  {
    id: "voucher-convergent-carte-activation",
    title: "VI. Voucher Convergent — Activation",
    channels: VOUCHER_CONVERGENT_CARTE_ACTIVATION,
  },
];

// ─── Query builders ───────────────────────────────────────────────────────────

const successFilter = `TRIM(TRANSACTION_STATUS) IN (${sqlStatusInList(SUCCESS_STATUSES)})`;
const instanceFilter = `TRIM(TRANSACTION_STATUS) IN (${sqlStatusInList(INSTANCE_STATUSES)})`;
const refundFilter = `TRIM(TRANSACTION_STATUS) IN (${sqlStatusInList(REFUND_STATUSES)})`;
const declinedFilter = `TRIM(TRANSACTION_STATUS) IN (${sqlStatusInList(DECLINED_STATUSES)})`;

export interface StatusSummary {
  reussie: number;
  annulation: number;
  instance: number;
  echec: number;
  total: number;
}

export async function getStatusSummary(): Promise<StatusSummary> {
  const [success, refund, instance, declined, total] = await Promise.all([
    runQuery(
      `SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}" WHERE ${successFilter}`,
    ),
    runQuery(
      `SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}" WHERE ${refundFilter}`,
    ),
    runQuery(
      `SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}" WHERE ${instanceFilter}`,
    ),
    runQuery(
      `SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}" WHERE ${declinedFilter}`,
    ),
    runQuery(`SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}"`),
  ]);
  return {
    reussie: Number(success[0]?.cnt ?? 0),
    annulation: Number(refund[0]?.cnt ?? 0),
    instance: Number(instance[0]?.cnt ?? 0),
    echec: Number(declined[0]?.cnt ?? 0),
    total: Number(total[0]?.cnt ?? 0),
  };
}

export interface ChannelResult {
  canal: string;
  nombre: number;
  montant: number;
}

function buildDateFilter(dateFrom?: string, dateTo?: string): string {
  if (!dateFrom && !dateTo) return "";
  const dateExpr = `TRY_STRPTIME(SPLIT_PART(CAST(TRANSACTION_DATE AS VARCHAR),' ',1),'%d/%m/%Y')`;
  if (dateFrom && dateTo)
    return ` AND ${dateExpr} BETWEEN STRPTIME('${dateFrom}','%Y-%m-%d') AND STRPTIME('${dateTo}','%Y-%m-%d')`;
  if (dateFrom) return ` AND ${dateExpr} >= STRPTIME('${dateFrom}','%Y-%m-%d')`;
  return ` AND ${dateExpr} <= STRPTIME('${dateTo}','%Y-%m-%d')`;
}

export async function getChannelStats(
  channels: ChannelDef[],
  dateFrom?: string,
  dateTo?: string,
): Promise<{
  rows: ChannelResult[];
  totals: { nombre: number; montant: number };
}> {
  const df = buildDateFilter(dateFrom, dateTo);
  const results: ChannelResult[] = [];
  let totalNombre = 0;
  let totalMontant = 0;

  for (const ch of channels) {
    const sql = `
      SELECT
        COUNT(*) as nombre,
        COALESCE(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)), 0) as montant
      FROM "${REPORT_TABLE}"
      WHERE ${successFilter}
        AND (${ch.condition})${df}
    `;
    const rows = await runQuery(sql);
    const nombre = Number(rows[0]?.nombre ?? 0);
    const montant = Number(rows[0]?.montant ?? 0);
    results.push({ canal: ch.name, nombre, montant });
    totalNombre += nombre;
    totalMontant += montant;
  }

  return {
    rows: results,
    totals: { nombre: totalNombre, montant: totalMontant },
  };
}

export async function loadReportCSV(
  csvContent: string,
  mapping?: import("@/features/telecom/types").ColumnMapping,
): Promise<{ rowCount: number; columns: string[] }> {
  await loadDelimitedCSVToDuckDB(REPORT_TABLE, csvContent, "|");
  const info = await runQuery(`SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}"`);
  const cols = await runQuery(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${REPORT_TABLE}'`,
  );
  // Build enriched view for faster downstream queries
  if (mapping) {
    try {
      await createTelecomEnrichedView(REPORT_TABLE, mapping);
    } catch (e) {
      console.warn("[loadReportCSV] Failed to create enriched view:", e);
    }
  }
  return {
    rowCount: Number(info[0]?.cnt ?? 0),
    columns: cols.map((c) => String(c.column_name)),
  };
}

export async function getTopTransactionsByAmount(
  limit = 20,
): Promise<Record<string, unknown>[]> {
  return runQuery(`
    SELECT TRANSACTION_ID, TRANSACTION_DATE, ORIGINAL_AMOUNT, ACCOUNT_NAME, CUSTOMER_NAME, TRANSACTION_STATUS, BRAND_NAME, CHANNEL
    FROM "${REPORT_TABLE}"
    WHERE ${successFilter}
    ORDER BY TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE) DESC
    LIMIT ${limit}
  `);
}

export async function getHourlyDistribution(): Promise<
  { hour: number; count: number; amount: number }[]
> {
  const rows = await runQuery(`
    SELECT
      EXTRACT(HOUR FROM TRY_CAST(TRANSACTION_DATE AS TIMESTAMP)) as hour,
      COUNT(*) as count,
      COALESCE(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)), 0) as amount
    FROM "${REPORT_TABLE}"
    WHERE ${successFilter}
    GROUP BY 1
    ORDER BY 1
  `);
  return rows.map((r) => ({
    hour: Number(r.hour ?? 0),
    count: Number(r.count ?? 0),
    amount: Number(r.amount ?? 0),
  }));
}
