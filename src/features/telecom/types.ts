export type CanalKey =
  | "bill_payment"
  | "voice_fixed_ttcash"
  | "voice_fixed_voucher"
  | "voice_mobile_ttcash"
  | "voice_mobile_voucher"
  | "data_sabba"
  | "data_evoucher"
  | "voucher_for_payment"
  | "credit_transfer"
  | "voucher_convergent";

/**
 * A user-confirmed classification for a raw account combo that none of the 10
 * hardcoded `canalCaseExpr` rules matched. Detected via
 * `fetchUnclassifiedCanalCombos` and assigned through the "new canal
 * detected" dialog — the same resolve-unknowns flow `StatusMapping` uses for
 * unrecognised status codes (see `unknown-status-dialog.tsx`).
 *
 * BRAND_D is always the anchor (every `ChannelDef` condition in
 * report-engine.ts starts with it), but the real rules narrow by anywhere
 * from 0 to 2 more fields — never all 3. `null` on a field means "matches any
 * value", so a rule can key on just BRAND_D, BRAND_D + one field, or
 * BRAND_D + layer + group, matching how these channels are actually defined
 * (see `canal-mapping-scope.ts`).
 */
export interface CanalMapping {
  brandD: string;
  accountLayerId: string | null;
  accountGroupId: string | null;
  accountMsisdn: string | null;
  /** One of the 10 known canals. Every detected combo must be assigned a
   * real canal through the dialog — there is no "leave unclassified" option. */
  key: CanalKey;
}

/** A distinct raw account combo among rows the hardcoded rules can't
 * classify, with its transaction volume — what the "new canal detected"
 * dialog shows the user to assign. */
export interface UnclassifiedCanalCombo {
  brandD: string;
  accountLayerId: string;
  accountGroupId: string;
  accountMsisdn: string;
  total: number;
}

export type SortDir = "asc" | "desc";
export type OverviewExportSectionKey =
  | "assistant"
  | "revenueGroups"
  | "status"
  | "hourly"
  | "canalShare"
  | "canalAmount"
  | "successRate"
  | "canalTable"
  | "dailyTrend";

export interface ColumnMapping {
  transactionId: string;
  transactionDate: string;
  transactionTime: string;
  canal: string;
  serviceCode: string;
  serviceName: string;
  transactionType: string;
  subscriberType: string;
  msisdn: string;
  amount: string;
  status: string;
  errorCode: string;
  errorMessage: string;
  operator: string;
  region: string;
  processingTimeMs: string;
  previousBalance: string;
  newBalance: string;
  totalAmount: string;
  retryCount: string;
}

export interface KPISummary {
  totalTransactions: number;
  successCount: number;
  declinedCount: number;
  refundCount: number;
  instanceCount: number;
  submittedCount: number;
  successRate: number;
  totalAmount: number;
  avgAmount: number;
  avgProcessingMs: number;
  uniqueCustomers: number;
  peakHour: number;
  topErrorCode: string;
}

export interface CanalSummary {
  key: CanalKey;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  total: number;
  success: number;
  declined: number;
  refund: number;
  instance: number;
  submitted: number;
  amount: number;
  successRate: number;
  avgAmount: number;
  share: number;
}

export interface HourlyRow {
  hour: number;
  total: number;
  success: number;
  declined: number;
  amount: number;
}

export interface StatusRow {
  status: string;
  count: number;
  amount: number;
}

export interface SpecStatusResult {
  rows: Array<{ status: string; nombre: number }>;
  total: { status: string; nombre: number };
}

export interface SpecUnitAmountResult {
  rows: Array<{ unitAmount: string; nombre: number; montant: number }>;
  total: { unitAmount: string; nombre: number; montant: number };
}

export interface OperatorRow {
  operator: string;
  total: number;
  success: number;
  amount: number;
  successRate: number;
  accountType: "source" | "destination";
}

export interface RegionRow {
  region: string;
  total: number;
  success: number;
  amount: number;
}

export interface CanalHourCell {
  canal: string;
  hour: number;
  total: number;
  success: number;
}

export interface DailyTrendRow {
  day: string;
  total: number;
  success: number;
  declined: number;
  amount: number;
}

export interface CustomerProfileData {
  msisdn: string;
  name: string;
  group: string;
  total: number;
  success: number;
  declined: number;
  totalAmount: number;
  avgAmount: number;
  favoriteCanal: string;
  peakHour: number;
  topError: string;
  hourly: { hour: number; total: number }[];
  recentTx: Record<string, unknown>[];
}

export interface RawRow {
  [key: string]: unknown;
}

export interface FilterState {
  status: string;
  canal: string;
  region: string;
  operator: string;
  search: string;
  minAmount: string;
  maxAmount: string;
  hourFrom: string;
  hourTo: string;
}

export interface RawStatusRow {
  rawCode: string;
  count: number;
  amount: number;
}

export type StatusSemantic = "success" | "declined" | "refund" | "instance" | "submitted" | "other";

export interface StatusMapping {
  rawCode: string;
  label: string;
  semantic: StatusSemantic;
  color: string;
  badgeClass: string;
}

export interface ServiceCodeRow {
  serviceCode: string;
  category: string;
  count: number;
  matchedCanal: string;
}

export interface CustomKPI {
  id: string;
  label: string;
  description: string;
  sqlExpr: string;
  format: "number" | "amount" | "pct" | "duration";
  colorClass: string;
  result: number | null;
  loading: boolean;
  error: string;
}

export interface AIInsight {
  id: string;
  severity: "critical" | "warning" | "info" | "positive";
  title: string;
  body: string;
  metric: string;
}

export interface LoadedFile {
  id: number;
  name: string;
  table: string;
  date: string;
  cacheKey: string;
  size: number;
  lastModified: number;
  sourceKeys: string[];
}

export type TelecomIngestionMode = "replace" | "append" | "replace-active";
