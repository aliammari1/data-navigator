#!/usr/bin/env node
// @ts-check

/**
 * Generate the deterministic synthetic DailyTransactions dataset used for the
 * PFE defense. The output contains no real subscriber/account identifiers.
 *
 * Usage:
 *   node scripts/generate-defense-dataset.mjs
 *   node scripts/generate-defense-dataset.mjs --rows 10000 --date 20260918 --out ./DailyTransactions_DEFENSE_SYNTHETIC_20260918.csv
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const rows = Number.parseInt(arg("--rows", "10000"), 10);
const dateToken = arg("--date", "20260918");
if (!Number.isInteger(rows) || rows <= 0) throw new Error("--rows must be a positive integer");
if (!/^\d{8}$/.test(dateToken)) throw new Error("--date must use YYYYMMDD");

const out = resolve(
  arg("--out", `./DailyTransactions_DEFENSE_SYNTHETIC_${dateToken}.csv`),
);
const manifestPath = `${out}.manifest.json`;

const columns = [
  "ACCOUNT_ID","ACCOUNT_NAME","ACCOUNT_MSISDN","ACCOUNT_GROUP_ID","ACCOUNT_LAYER_ID",
  "CUSTOMER_MSISDN","CUSTOMER_NAME","CUSTOMER_GROUP_NAME","BRAND_D","BRAND_NAME",
  "BRAND_CATEGORY_ID","BRAND_CATEGORY_NAME","SERVICE_CLASS_ID","SERVICE_CLASS_NAME",
  "TRANSACTION_ID","TRANSACTION_DATE","ORIGINAL_AMOUNT","SOURCE_FEE_1_AMOUNT",
  "SOURCE_FEE_2_AMOUNT","SOURCE_FEE_3_AMOUNT","SOURCE_TAX_AMOUNT",
  "NET_DEBIT_AMOUNT_SOURCE","DEST_COMM1_AMOUNT","DEST_COMM2_AMOUNT","DEST_COMM3_AMOUNT",
  "NET_CREDIT_AMOUNT","REQUEST_ID","EXTERNAL_REFERENCE","REMARK","TRANSACTION_STATUS",
  "REQUESTER_ID","APPROVER_ID","REQUEST_DATE","APPROVE_DATE","CHANNEL","BALANCE_BEFORE",
  "BALANCE_AFTER","REFERENCE_ID","CONFIRMATION_ID","SALES_PERSON","ACCOUNT_NUMBER",
  "GENERATION_TRANSACTION_ID","GENERATION_ACCOUNT_NAME",
  "GENERATION_ACCOUNT_MOBILE_NUMBER","VOUCHER_CODE","SERIAL_NUMBER","EXTRA_INFO1",
  "EXTRA_INFO2","EXTRA_INFO3","EXTRA_INFO4","EXTRA_INFO5",
];

const required = [
  "ACCOUNT_ID","BRAND_D","TRANSACTION_ID","TRANSACTION_DATE",
  "ORIGINAL_AMOUNT","TRANSACTION_STATUS","CHANNEL","ACCOUNT_MSISDN",
];
for (const name of required) {
  if (!columns.includes(name)) throw new Error(`missing required telecom column: ${name}`);
}

const channels = ["MyTT", "PORTAILTT", "PO9", "Eshop"];
const brandIds = ["118", "132", "149", "156"];
const serviceClasses = ["VOICE", "DATA", "BILL", "TRANSFER"];
const categories = ["RECHARGE", "PAYMENT", "TRANSFER", "GENERATION"];
const regions = ["NORTH", "SOUTH", "EAST", "WEST"];
const operators = ["SYN_OP_A", "SYN_OP_B", "SYN_OP_C"];

function statusFor(i) {
  const n = i % 20;
  if (n < 14) return "PST";   // 70% success
  if (n < 17) return "DCL";   // 15% declined
  if (n === 17) return "RFD"; // 5% refund
  if (n === 18) return "HLD"; // 5% instance
  return "SBM";               // 5% submitted
}

function pad(n, width = 6) {
  return String(n).padStart(width, "0");
}

function txnDate(i) {
  const yyyy = dateToken.slice(0, 4);
  const mm = dateToken.slice(4, 6);
  const dd = dateToken.slice(6, 8);
  const hh = pad(i % 24, 2);
  const mi = pad((i * 7) % 60, 2);
  const ss = pad((i * 11) % 60, 2);
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

const counts = {
  total: 0,
  success: 0,
  declined: 0,
  refund: 0,
  instance: 0,
  submitted: 0,
  byChannel: Object.fromEntries(channels.map((c) => [c, 0])),
  byChannelStatus: Object.fromEntries(
    channels.map((c) => [
      c,
      { total: 0, success: 0, declined: 0, refund: 0, instance: 0, submitted: 0 },
    ]),
  ),
  amountTotal: 0,
};

const lines = [columns.join("|")];
for (let i = 0; i < rows; i++) {
  const channel = channels[i % channels.length];
  const status = statusFor(i);
  const amountCents = 100 + ((i * 37) % 9901); // 1.00 .. 100.00
  const amount = (amountCents / 100).toFixed(2);
  const before = (100000 + ((i * 17) % 500000)) / 100;
  const after = Math.max(0, before - amountCents / 100);

  counts.total++;
  counts.byChannel[channel]++;
  const channelCounts = counts.byChannelStatus[channel];
  channelCounts.total++;
  counts.amountTotal += amountCents / 100;
  if (status === "PST") {
    counts.success++;
    channelCounts.success++;
  } else if (status === "DCL") {
    counts.declined++;
    channelCounts.declined++;
  } else if (status === "RFD") {
    counts.refund++;
    channelCounts.refund++;
  } else if (status === "HLD") {
    counts.instance++;
    channelCounts.instance++;
  } else if (status === "SBM") {
    counts.submitted++;
    channelCounts.submitted++;
  }

  const row = {
    ACCOUNT_ID: `SYN_ACC_${pad(i % 500)}`,
    ACCOUNT_NAME: `Synthetic Account ${pad(i % 500)}`,
    ACCOUNT_MSISDN: `SYN_ACCOUNT_ID_${pad(i % 500)}`,
    ACCOUNT_GROUP_ID: regions[i % regions.length],
    ACCOUNT_LAYER_ID: String([12, 9, 6, 14][i % 4]),
    CUSTOMER_MSISDN: `SYN_CUSTOMER_ID_${pad(i % 2000)}`,
    CUSTOMER_NAME: `Synthetic Customer ${pad(i % 2000)}`,
    CUSTOMER_GROUP_NAME: `SYN_GROUP_${i % 8}`,
    BRAND_D: brandIds[i % brandIds.length],
    BRAND_NAME: `Synthetic Brand ${brandIds[i % brandIds.length]}`,
    BRAND_CATEGORY_ID: String((i % 4) + 1),
    BRAND_CATEGORY_NAME: categories[i % categories.length],
    SERVICE_CLASS_ID: String((i % 4) + 1),
    SERVICE_CLASS_NAME: serviceClasses[i % serviceClasses.length],
    TRANSACTION_ID: `SYN_TX_${dateToken}_${pad(i + 1, 7)}`,
    TRANSACTION_DATE: txnDate(i),
    ORIGINAL_AMOUNT: amount,
    SOURCE_FEE_1_AMOUNT: "0.00",
    SOURCE_FEE_2_AMOUNT: "0.00",
    SOURCE_FEE_3_AMOUNT: "0.00",
    SOURCE_TAX_AMOUNT: "0.00",
    NET_DEBIT_AMOUNT_SOURCE: amount,
    DEST_COMM1_AMOUNT: "0.00",
    DEST_COMM2_AMOUNT: "0.00",
    DEST_COMM3_AMOUNT: "0.00",
    NET_CREDIT_AMOUNT: amount,
    REQUEST_ID: `SYN_REQ_${pad(i + 1, 7)}`,
    EXTERNAL_REFERENCE: `SYN_EXT_${pad(i + 1, 7)}`,
    REMARK: status === "PST" ? "SYNTHETIC_OK" : `SYNTHETIC_${status}`,
    TRANSACTION_STATUS: status,
    REQUESTER_ID: `SYN_REQ_USER_${i % 20}`,
    APPROVER_ID: `SYN_APP_USER_${i % 10}`,
    REQUEST_DATE: txnDate(i),
    APPROVE_DATE: txnDate(i),
    CHANNEL: channel,
    BALANCE_BEFORE: before.toFixed(2),
    BALANCE_AFTER: after.toFixed(2),
    REFERENCE_ID: `SYN_REF_${pad(i + 1, 7)}`,
    CONFIRMATION_ID: `SYN_CONF_${pad(i + 1, 7)}`,
    SALES_PERSON: operators[i % operators.length],
    ACCOUNT_NUMBER: `SYN_ACCOUNT_NO_${pad(i % 500)}`,
    GENERATION_TRANSACTION_ID: `SYN_GEN_TX_${pad(i + 1, 7)}`,
    GENERATION_ACCOUNT_NAME: `Synthetic Generator ${i % 12}`,
    GENERATION_ACCOUNT_MOBILE_NUMBER: `SYN_GEN_ID_${pad(i % 12)}`,
    VOUCHER_CODE: `SYN_VOUCHER_${pad(i + 1, 7)}`,
    SERIAL_NUMBER: `SYN_SERIAL_${pad(i + 1, 7)}`,
    EXTRA_INFO1: "SYNTHETIC_DEFENSE_DATA",
    EXTRA_INFO2: `ROW_${pad(i + 1, 7)}`,
    EXTRA_INFO3: "",
    EXTRA_INFO4: "",
    EXTRA_INFO5: "",
  };

  lines.push(columns.map((name) => String(row[name] ?? "")).join("|"));
}

const csv = `${lines.join("\n")}\n`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, csv, "utf8");

const sha256 = createHash("sha256").update(csv, "utf8").digest("hex");
const byChannelSuccessRatePct = Object.fromEntries(
  channels.map((channel) => {
    const channelCounts = counts.byChannelStatus[channel];
    const rate = channelCounts.total === 0 ? 0 : (channelCounts.success / channelCounts.total) * 100;
    return [channel, Number(rate.toFixed(2))];
  }),
);
const manifest = {
  kind: "data-navigator-defense-dataset",
  generator: "dn-defense-synth-v1",
  synthetic: true,
  containsRealPII: false,
  dateToken,
  rows,
  columns: columns.length,
  delimiter: "|",
  sha256,
  expected: {
    ...counts,
    amountTotal: Number(counts.amountTotal.toFixed(2)),
    successRatePct: Number(((counts.success / counts.total) * 100).toFixed(2)),
    byChannelSuccessRatePct,
  },
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ out, manifestPath, ...manifest }, null, 2));
