/**
 * Telecom Daily Report Engine
 * Processes DailyTransactions CSV files with pipe-delimited format.
 * All processing done offline via DuckDB WASM — zero network calls.
 *
 * NOTE: Status codes are centralized in @/features/telecom/lib/status-definitions
 * All status-related constants are imported from there.
 */

import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import { createTelecomEnrichedView } from "@/features/telecom/lib/queries";
import {
  REPORT_DOUBT_STATUS_CODES,
  REPORT_HOLD_STATUS_CODES,
  REPORT_INSTANCE_STATUS_CODES,
  SPEC_STATUS_CODES,
  sqlStatusInList,
} from "@/features/telecom/lib/status-definitions";
import * as Types from "@/features/telecom/types";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { registerLocalDatasetFile } from "@/platform/duckdb/duckdb-fs";
import { localDataPath, writeLocalFile } from "@/platform/electron/electron-fs";
import { canalRuleCondition } from "./canal-rule-condition";
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
    label: "Échec",
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

const SYSTEM_RULE_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export const BILL_PAYMENT_CHANNELS_RULES: Types.CanalRule[] = [
  {
    id: "bill-payment-izipay",
    name: "IZIPAY",
    canalKey: "bill_payment",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["39"],
      accountMsisdn: "21619444555",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "bill-payment-smt",
    name: "SMT",
    canalKey: "bill_payment",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["39"],
      accountMsisdn: "21619777888",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "bill-payment-endatao",
    name: "ENDATAO",
    canalKey: "bill_payment",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["39"],
      accountMsisdn: "21692507919",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "bill-payment-atb",
    name: "ATB",
    canalKey: "bill_payment",
    match: {
      kind: "brand-layer-group",
      brandDValues: ["35"],
      accountLayerId: "14",
      accountGroupId: "152",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "bill-payment-kashy",
    name: "KASHY",
    canalKey: "bill_payment",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["39"],
      accountMsisdn: "2160000111222",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const RECHARGE_VOICE_FIXED_TTCASH_RULES: Types.CanalRule[] = [
  {
    id: "voice-fixed-ttcash-espaces-tt",
    name: "Espaces TT",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-layer",
      brandDValues: ["61"],
      accountLayerId: "12",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-ussd-136",
    name: "USSD 136",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-layer",
      brandDValues: ["61"],
      accountLayerId: "9",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-ussd-170",
    name: "USSD 170",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-layer",
      brandDValues: ["61"],
      accountLayerId: "6",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-atb",
    name: "ATB",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-layer-group",
      brandDValues: ["9"],
      accountLayerId: "14",
      accountGroupId: "152",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-stb",
    name: "STB",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-layer-group",
      brandDValues: ["9"],
      accountLayerId: "14",
      accountGroupId: "162",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-smt",
    name: "SMT",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["9"],
      accountMsisdn: "21619111222",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-izipay",
    name: "IZIPAY",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["61"],
      accountMsisdn: "21699270724",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-endatao",
    name: "ENDATAO",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["61"],
      accountMsisdn: "21692509273",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-runpay",
    name: "RUNPAY",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["61", "147"],
      accountMsisdn: "21693033354",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-edc",
    name: "EDC",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["61"],
      accountMsisdn: "21698276912",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-paypos",
    name: "PAYPOS",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["61"],
      accountMsisdn: "21692836704",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-mytt",
    name: "MyTT",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["118"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-portailtt",
    name: "PORTAILTT",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["132"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-po9",
    name: "PO9",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["149"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-eshop",
    name: "Eshop",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["156"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-ttcash-callcenter-xv",
    name: "Callcenter/XV",
    canalKey: "voice_fixed_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["38"],
      accountMsisdn: "21692885461",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const RECHARGE_VOICE_FIXED_VOUCHER_RULES: Types.CanalRule[] = [
  {
    id: "voice-fixed-voucher-ussd-123",
    name: "USSD 123",
    canalKey: "voice_fixed_voucher",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["108"],
      accountMsisdn: "2160123456789",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-voucher-ussd-170",
    name: "USSD 170",
    canalKey: "voice_fixed_voucher",
    match: {
      kind: "brand-layer",
      brandDValues: ["108"],
      accountLayerId: "6",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-voucher-mytt",
    name: "MyTT",
    canalKey: "voice_fixed_voucher",
    match: {
      kind: "brand",
      brandDValues: ["122"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-voucher-portailtt",
    name: "PortailTT",
    canalKey: "voice_fixed_voucher",
    match: {
      kind: "brand",
      brandDValues: ["136"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-voucher-callcenter-xv",
    name: "CallCenter/XV",
    canalKey: "voice_fixed_voucher",
    match: {
      kind: "brand",
      brandDValues: ["162"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-fixed-voucher-po9",
    name: "PO9",
    canalKey: "voice_fixed_voucher",
    match: {
      kind: "brand",
      brandDValues: ["153"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const RECHARGE_VOICE_MOBILE_TTCASH_RULES: Types.CanalRule[] = [
  {
    id: "voice-mobile-ttcash-espaces-tt",
    name: "Espaces TT",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-layer",
      brandDValues: ["56", "57", "58", "59"],
      accountLayerId: "12",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-ussd-136",
    name: "USSD 136",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-layer",
      brandDValues: ["56", "57", "58", "59"],
      accountLayerId: "9",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-ussd-170",
    name: "USSD 170",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-layer",
      brandDValues: ["56", "57", "58", "59"],
      accountLayerId: "6",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-atb",
    name: "ATB",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-layer-group",
      brandDValues: ["8", "31"],
      accountLayerId: "14",
      accountGroupId: "152",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-stb",
    name: "STB",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-layer-group",
      brandDValues: ["8", "31"],
      accountLayerId: "14",
      accountGroupId: "162",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-smt",
    name: "SMT",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["56", "57", "58", "59"],
      accountMsisdn: "21619111222",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-izipay",
    name: "IZIPAY",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["56", "57", "58", "59"],
      accountMsisdn: "21699270724",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-endatao",
    name: "ENDATAO",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["56", "57", "58", "59"],
      accountMsisdn: "21692509273",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-runpay",
    name: "RUNPAY",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["56", "57", "58", "59", "146"],
      accountMsisdn: "21693033354",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-edc",
    name: "EDC",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["56", "57", "58", "59"],
      accountMsisdn: "21698276912",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-paypos",
    name: "PAYPOS",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["56", "57", "58", "59"],
      accountMsisdn: "21692836704",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-mytt",
    name: "MyTT",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["117"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-portailtt",
    name: "PORTAILTT",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["131"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-po9",
    name: "PO9",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["148"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-eshop",
    name: "Eshop",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["155"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-callcenter-xv",
    name: "Callcenter/XV",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["7", "37"],
      accountMsisdn: "21692885461",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-dtone",
    name: "DTOne",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand",
      brandDValues: ["42", "43", "44", "45", "46", "47"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-bonus-dtone",
    name: "Bonus DTone",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["48"],
      accountMsisdn: "21692885410",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-ttcash-bonus-suite-recharge-data",
    name: "Bonus suite recharge DATA",
    canalKey: "voice_mobile_ttcash",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["96"],
      accountMsisdn: "21692885467",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const RECHARGE_VOICE_MOBILE_VOUCHER_RULES: Types.CanalRule[] = [
  {
    id: "voice-mobile-voucher-ussd-123",
    name: "USSD 123",
    canalKey: "voice_mobile_voucher",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["109"],
      accountMsisdn: "2160123456789",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-voucher-ussd-170",
    name: "USSD 170",
    canalKey: "voice_mobile_voucher",
    match: {
      kind: "brand-layer",
      brandDValues: ["109"],
      accountLayerId: "6",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-voucher-mytt",
    name: "MyTT",
    canalKey: "voice_mobile_voucher",
    match: {
      kind: "brand",
      brandDValues: ["121"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-voucher-portailtt",
    name: "PortailTT",
    canalKey: "voice_mobile_voucher",
    match: {
      kind: "brand",
      brandDValues: ["135"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-voucher-callcenter-xv",
    name: "CallCenter/XV",
    canalKey: "voice_mobile_voucher",
    match: {
      kind: "brand",
      brandDValues: ["161"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voice-mobile-voucher-po9",
    name: "PO9",
    canalKey: "voice_mobile_voucher",
    match: {
      kind: "brand",
      brandDValues: ["152"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const RECHARGE_DATA_SABBA_RULES: Types.CanalRule[] = [
  {
    id: "data-sabba-ussd-236",
    name: "USSD 236",
    canalKey: "data_sabba",
    match: {
      kind: "brand-layer",
      brandDValues: ["95"],
      accountLayerId: "9",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-ussd-170",
    name: "USSD 170",
    canalKey: "data_sabba",
    match: {
      kind: "brand-layer",
      brandDValues: ["95"],
      accountLayerId: "6",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-espaces-tt",
    name: "ESPACES TT",
    canalKey: "data_sabba",
    match: {
      kind: "brand-layer",
      brandDValues: ["95"],
      accountLayerId: "12",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-portail-tt",
    name: "PORTAIL TT",
    canalKey: "data_sabba",
    match: {
      kind: "brand",
      brandDValues: ["137"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-mytt",
    name: "MYTT",
    canalKey: "data_sabba",
    match: {
      kind: "brand",
      brandDValues: ["123"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-runpay",
    name: "RUNPAY",
    canalKey: "data_sabba",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["95"],
      accountMsisdn: "21693033354",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-payspos",
    name: "PAYSPOS",
    canalKey: "data_sabba",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["95"],
      accountMsisdn: "21692836704",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-edc",
    name: "EDC",
    canalKey: "data_sabba",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["95"],
      accountMsisdn: "21698276912",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-endatao",
    name: "ENDATAO",
    canalKey: "data_sabba",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["95"],
      accountMsisdn: "21692509273",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-izipay",
    name: "IZIPAY",
    canalKey: "data_sabba",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["95"],
      accountMsisdn: "21699270724",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "data-sabba-topnet",
    name: "TOPNET",
    canalKey: "data_sabba",
    match: {
      kind: "brand-layer",
      brandDValues: ["95"],
      accountLayerId: "5",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const RECHARGE_DATA_EVOUCHER_RULES: Types.CanalRule[] = [
  {
    id: "data-evoucher-ussd-227",
    name: "USSD 227",
    canalKey: "data_evoucher",
    match: {
      kind: "brand",
      brandDValues: ["158"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const VOUCHER_FOR_PAYMENT_RULES: Types.CanalRule[] = [
  {
    id: "voucher-for-payment-voucher-for-payment-generation",
    name: "Voucher For Payment GENERATION",
    canalKey: "voucher_for_payment",
    match: {
      kind: "brand",
      brandDValues: ["98"],
    },
    reportGroup: "voucher_for_payment_generation",
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voucher-for-payment-voucher-for-payment-redemption",
    name: "Voucher For Payment REDEMPTION",
    canalKey: "voucher_for_payment",
    match: {
      kind: "brand",
      brandDValues: ["99"],
    },
    reportGroup: "voucher_for_payment_redemption",
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voucher-for-payment-refund-of-voucher-redeemed",
    name: "REFUND OF VOUCHER REDEEMED",
    canalKey: "voucher_for_payment",
    match: {
      kind: "brand",
      brandDValues: ["100"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const CREDIT_TRANSFER_RULES: Types.CanalRule[] = [
  {
    id: "credit-transfer-credit-transfer",
    name: "Credit Transfer",
    canalKey: "credit_transfer",
    match: {
      kind: "brand",
      brandDValues: ["88"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "credit-transfer-credit-transfer-bonus",
    name: "Credit Transfer Bonus",
    canalKey: "credit_transfer",
    match: {
      kind: "brand",
      brandDValues: ["89"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "credit-transfer-credittransfer-cashout",
    name: "CreditTransfer_CashOut",
    canalKey: "credit_transfer",
    match: {
      kind: "brand",
      brandDValues: ["111"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "credit-transfer-credit-elec-personnel-tt",
    name: "Credit_Elec_Personnel_TT",
    canalKey: "credit_transfer",
    match: {
      kind: "brand",
      brandDValues: ["159"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const EVOUCHER_ON_DEMAND_GENERATION_RULES: Types.CanalRule[] = [
  {
    id: "evoucher-on-demand-mytt",
    name: "MyTT",
    canalKey: "evoucher_on_demand",
    match: {
      kind: "brand",
      brandDValues: ["119", "120"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "evoucher-on-demand-portailtt",
    name: "PortailTT",
    canalKey: "evoucher_on_demand",
    match: {
      kind: "brand",
      brandDValues: ["133", "134"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "evoucher-on-demand-po9",
    name: "PO9",
    canalKey: "evoucher_on_demand",
    match: {
      kind: "brand",
      brandDValues: ["150", "151"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "evoucher-on-demand-aziza",
    name: "AZIZA",
    canalKey: "evoucher_on_demand",
    match: {
      kind: "brand",
      brandDValues: ["160"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "evoucher-on-demand-runpay",
    name: "RUNPAY",
    canalKey: "evoucher_on_demand",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["107", "115"],
      accountMsisdn: "21693033354",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "evoucher-on-demand-edc",
    name: "EDC",
    canalKey: "evoucher_on_demand",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["107", "115"],
      accountMsisdn: "21698276912",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "evoucher-on-demand-paypos",
    name: "PAYPOS",
    canalKey: "evoucher_on_demand",
    match: {
      kind: "brand-msisdn",
      brandDValues: ["107", "115"],
      accountMsisdn: "21692836704",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "evoucher-on-demand-ussd-170",
    name: "USSD 170",
    canalKey: "evoucher_on_demand",
    match: {
      kind: "brand-layer",
      brandDValues: ["107", "115"],
      accountLayerId: "6",
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const VOUCHER_CONVERGENT_CARTE_GENERATION_RULES: Types.CanalRule[] = [
  {
    id: "voucher-convergent-carte-generation-tbt-carte-convergante-batch-generation",
    name: "TBT_Carte_Convergante_Batch_Generation",
    canalKey: "voucher_convergent_carte_generation",
    match: {
      kind: "brand",
      brandDValues: ["166"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES: Types.CanalRule[] = [
  {
    id: "voucher-convergent-carte-activation-activation-des-cartes-de-recharge-convergente",
    name: "Activation des cartes de recharge convergente",
    canalKey: "voucher_convergent_carte_activation",
    match: {
      kind: "brand",
      brandDValues: ["163"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
  {
    id: "voucher-convergent-carte-activation-annulation-de-l-activation-des-cartes-de-recharge",
    name: "Annulation de l'activation des cartes de recharge",
    canalKey: "voucher_convergent_carte_activation",
    match: {
      kind: "brand",
      brandDValues: ["167"],
    },
    reportGroup: null,
    enabled: true,
    origin: "default",
    createdAt: SYSTEM_RULE_TIMESTAMP,
    updatedAt: SYSTEM_RULE_TIMESTAMP,
  },
];

export const VOUCHER_CONVERGENT: Types.CanalRule[] = [
  ...EVOUCHER_ON_DEMAND_GENERATION_RULES,
  ...VOUCHER_CONVERGENT_CARTE_GENERATION_RULES,
  ...VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES,
];

// ─── Report section definition ────────────────────────────────────────────────

export interface ReportSection {
  id: Types.CanalKey;
  title: string;
  subtitle?: string;
  channels: Types.CanalRule[];
}

export const REPORT_SECTIONS: ReportSection[] = [
  {
    id: "bill_payment",
    title: "I. Paiement des factures",
    channels: BILL_PAYMENT_CHANNELS_RULES,
  },
  {
    id: "voice_fixed_ttcash",
    title: "II. Recharge Voix — Lignes Fixes — TTCASH",
    channels: RECHARGE_VOICE_FIXED_TTCASH_RULES,
  },
  {
    id: "voice_fixed_voucher",
    title: "II. Recharge Voix — Lignes Fixes — Voucher",
    channels: RECHARGE_VOICE_FIXED_VOUCHER_RULES,
  },
  {
    id: "voice_mobile_ttcash",
    title: "II. Recharge Voix — Lignes Mobiles — TTCASH",
    channels: RECHARGE_VOICE_MOBILE_TTCASH_RULES,
  },
  {
    id: "voice_mobile_voucher",
    title: "II. Recharge Voix — Lignes Mobiles — Voucher",
    channels: RECHARGE_VOICE_MOBILE_VOUCHER_RULES,
  },
  {
    id: "data_sabba",
    title: "III. DATA — Internet Sabba (électronique)",
    channels: RECHARGE_DATA_SABBA_RULES,
  },
  {
    id: "data_evoucher",
    title: "III. DATA — Evoucher",
    channels: RECHARGE_DATA_EVOUCHER_RULES,
  },
  {
    id: "voucher_for_payment",
    title: "IV. Voucher For Payment",
    channels: VOUCHER_FOR_PAYMENT_RULES,
  },
  {
    id: "credit_transfer",
    title: "V. Credit Transfer",
    channels: CREDIT_TRANSFER_RULES,
  },
  {
    id: "evoucher_on_demand",
    title: "VI. Voucher Convergent — Evoucher on Demand — Génération",
    channels: EVOUCHER_ON_DEMAND_GENERATION_RULES,
  },
  {
    id: "voucher_convergent_carte_generation",
    title: "VI. Voucher Convergent — Génération",
    channels: VOUCHER_CONVERGENT_CARTE_GENERATION_RULES,
  },
  {
    id: "voucher_convergent_carte_activation",
    title: "VI. Voucher Convergent — Activation",
    channels: VOUCHER_CONVERGENT_CARTE_ACTIVATION_RULES,
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
    runReadOnlyQuery(`SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}" WHERE ${successFilter}`),
    runReadOnlyQuery(`SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}" WHERE ${refundFilter}`),
    runReadOnlyQuery(`SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}" WHERE ${instanceFilter}`),
    runReadOnlyQuery(`SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}" WHERE ${declinedFilter}`),
    runReadOnlyQuery(`SELECT COUNT(*) as cnt FROM "${REPORT_TABLE}"`),
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
  channels: Types.CanalRule[],
  dateFrom?: string,
  dateTo?: string,
): Promise<{
  rows: ChannelResult[];
  totals: { nombre: number; montant: number };
}> {
  const dateFilter = buildDateFilter(dateFrom, dateTo);

  const enabledChannels = channels.filter((rule) => rule.enabled);

  const results: ChannelResult[] = [];
  let totalNombre = 0;
  let totalMontant = 0;

  for (const rule of enabledChannels) {
    const condition = canalRuleCondition(rule);

    const sql = `
      SELECT
        COUNT(*) AS nombre,
        COALESCE(
          SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)),
          0
        ) AS montant
      FROM "${REPORT_TABLE}"
      WHERE ${successFilter}
        AND (${condition})${dateFilter}
    `;

    const rows = await runReadOnlyQuery(sql);

    const nombre = Number(rows[0]?.nombre ?? 0);
    const montant = Number(rows[0]?.montant ?? 0);

    results.push({
      canal: rule.name,
      nombre,
      montant,
    });

    totalNombre += nombre;
    totalMontant += montant;
  }

  return {
    rows: results,
    totals: {
      nombre: totalNombre,
      montant: totalMontant,
    },
  };
}

function textToArrayBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);

  return buffer;
}

function safeTelecomReportName(): string {
  return `telecom_report_${Date.now()}`;
}

export async function loadReportCSV(
  csvContent: string,
  mapping?: Types.ColumnMapping,
): Promise<{
  datasetId: string;
  tableName: string;
  viewName: string;
  rowCount: number;
  columns: string[];
}> {
  const displayName = safeTelecomReportName();
  const filePath = await localDataPath(`imports/${displayName}.csv`);

  await writeLocalFile(filePath, textToArrayBuffer(csvContent));

  const dataset = await registerLocalDatasetFile({
    filePath,
    displayName,
    hasHeader: true,
    delimiter: ",",
    previewLimit: 100,
  });

  const viewName = dataset.viewName;

  if (mapping) {
    try {
      await createTelecomEnrichedView(viewName, mapping);
    } catch (error) {
      console.warn("[loadReportCSV] Failed to create enriched view:", error);
    }
  }

  return {
    datasetId: dataset.id,
    tableName: viewName,
    viewName,
    rowCount: dataset.rowCount,
    columns: dataset.columns.map((column) => column.name),
  };
}
export async function getTopTransactionsByAmount(limit = 20): Promise<Record<string, unknown>[]> {
  return runReadOnlyQuery(`
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
  const rows = await runReadOnlyQuery(`
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
