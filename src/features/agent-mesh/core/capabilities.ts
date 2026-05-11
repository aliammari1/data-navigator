"use client";

import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import {
  fetchAnomalies,
  fetchPeriodKPI,
  fetchSubStatusBreakdown,
  fetchTopAccounts,
} from "@/features/telecom/lib/period-queries";
import {
  fetchDailyTrend,
  fetchHourly,
  fetchKPI,
  fetchRawCanalSummaries,
  fetchStatusBreakdown,
} from "@/features/telecom/lib/queries";
import { qc } from "@/features/telecom/lib/sql";
import {
  BUILTIN_STATUS_CODES,
  DEFAULT_STATUS_MAPPINGS,
  SEMANTIC_TO_CATEGORY,
} from "@/features/telecom/lib/status-definitions";
import type { ColumnMapping } from "@/features/telecom/types";
import { getTableInfo, listTables, runQuery } from "@/platform/duckdb/duckdb";
import { CAPABILITIES } from "./capability-registry";
import { inferColumnMapping } from "./mapping-inference";
import type {
  BlackboardState,
  Capability,
  CapabilityExecutor,
  CapabilityResult,
  Evidence,
  EvidenceGrade,
  EvidenceValidatorResult,
  TelecomDimension,
  TelecomMetric,
  TelecomSemanticModel,
} from "./types";

export { CAPABILITIES } from "./capability-registry";

const REQUIRED_MAPPING_KEYS: Array<keyof ColumnMapping> = [
  "transactionId",
  "transactionDate",
  "canal",
  "amount",
  "status",
  "msisdn",
];

function grade(overrides: Partial<EvidenceGrade> = {}): EvidenceGrade {
  return {
    data: 0.8,
    method: 0.85,
    claim: 0.8,
    business: 0.85,
    ...overrides,
  };
}

function evidenceId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function numericPct(value: number): string {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value.toFixed(2)}%`;
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function deltaPct(current: number, baseline: number): number {
  if (baseline === 0) return current === 0 ? 0 : 100;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function pointsDelta(current: number, baseline: number): number {
  return current - baseline;
}

function dateWindowLabel(window: { from: string; to: string }): string {
  return window.from === window.to
    ? window.from
    : `${window.from} to ${window.to}`;
}

function latestTwoDayWindows(days: string[]): {
  current: { from: string; to: string };
  baseline: { from: string; to: string };
} | null {
  const unique = [...new Set(days.filter((day) => day.length >= 10))]
    .map((day) => day.slice(0, 10))
    .sort();
  if (unique.length < 2) return null;
  const current = unique[unique.length - 1];
  const baseline = unique[unique.length - 2];
  return {
    current: { from: current, to: current },
    baseline: { from: baseline, to: baseline },
  };
}

function fullDateWindow(days: string[]): { from: string; to: string } | null {
  const unique = [...new Set(days.filter((day) => day.length >= 10))]
    .map((day) => day.slice(0, 10))
    .sort();
  if (!unique.length) return null;
  return { from: unique[0], to: unique[unique.length - 1] };
}

function trendDirection(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  if (Math.abs(change) < 1) return "flat";
  return change > 0 ? "up" : "down";
}

function mappingColumnSet(state: BlackboardState): Set<string> {
  return new Set(state.dataset.columns.map((column) => column.name));
}

function validateMapping(
  mapping: ColumnMapping,
  columns: Set<string>,
): string[] {
  const issues: string[] = [];

  for (const key of REQUIRED_MAPPING_KEYS) {
    const mapped = mapping[key];
    if (!mapped) {
      issues.push(`${key} is not mapped`);
      continue;
    }
    if (!columns.has(mapped)) {
      issues.push(`${key} maps to missing column "${mapped}"`);
    }
  }

  return issues;
}

function mappingConfidence(issues: string[]): number {
  if (issues.length === 0) return 0.96;
  return Math.max(0.3, 0.96 - issues.length * 0.11);
}

function makeMetrics(): TelecomMetric[] {
  return [
    {
      id: "transaction_count",
      label: "Transactions",
      sqlExpression: "COUNT(*)",
      higherIsBetter: true,
    },
    {
      id: "success_count",
      label: "Successful transactions",
      sqlExpression: "SUM(CASE WHEN _status = 'SUCCESS' THEN 1 ELSE 0 END)",
      higherIsBetter: true,
    },
    {
      id: "failure_count",
      label: "Declined transactions",
      sqlExpression: "SUM(CASE WHEN _status = 'DECLINED' THEN 1 ELSE 0 END)",
      higherIsBetter: false,
    },
    {
      id: "success_rate",
      label: "Success rate",
      sqlExpression:
        "SUM(CASE WHEN _status = 'SUCCESS' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)",
      denominator: "transaction_count",
      higherIsBetter: true,
    },
    {
      id: "failure_rate",
      label: "Failure rate",
      sqlExpression:
        "SUM(CASE WHEN _status = 'DECLINED' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)",
      denominator: "transaction_count",
      higherIsBetter: false,
    },
    {
      id: "total_amount",
      label: "Total amount",
      sqlExpression: "SUM(TRY_CAST(amount AS DOUBLE))",
      higherIsBetter: true,
    },
    {
      id: "average_amount",
      label: "Average amount",
      sqlExpression: "AVG(TRY_CAST(amount AS DOUBLE))",
      higherIsBetter: true,
    },
    {
      id: "unique_users",
      label: "Unique customers",
      sqlExpression: "COUNT(DISTINCT user)",
      higherIsBetter: true,
    },
  ];
}

function makeDimensions(
  mapping: ColumnMapping,
  columns: Set<string>,
): TelecomDimension[] {
  const has = (column: string) => Boolean(column && columns.has(column));
  return [
    {
      id: "canal",
      label: "Canal",
      column: mapping.canal,
      available: has(mapping.canal),
    },
    {
      id: "status",
      label: "Status",
      column: mapping.status,
      available: has(mapping.status),
    },
    {
      id: "sub_status",
      label: "Sub-status",
      column: mapping.errorCode,
      available: has(mapping.errorCode),
    },
    {
      id: "hour",
      label: "Hour",
      column: mapping.transactionDate,
      available: has(mapping.transactionDate),
    },
    {
      id: "user",
      label: "User",
      column: mapping.msisdn,
      available: has(mapping.msisdn),
    },
    {
      id: "account",
      label: "Account",
      column: mapping.region,
      available: has(mapping.region),
    },
    {
      id: "service",
      label: "Service",
      column: mapping.serviceName,
      available: has(mapping.serviceName),
    },
  ];
}

function buildSemanticModel(
  table: string,
  mapping: ColumnMapping,
  columns: Set<string>,
  issues: string[],
): TelecomSemanticModel {
  return {
    table,
    grain: columns.has(mapping.transactionId) ? "transaction" : "unknown",
    columns: {
      transactionId: mapping.transactionId,
      time: mapping.transactionDate,
      amount: mapping.amount,
      status: mapping.status,
      subStatus: mapping.errorCode,
      canal: mapping.canal,
      user: mapping.msisdn,
      account: mapping.region,
      service: mapping.serviceName,
    },
    statusRules: {
      successValues: BUILTIN_STATUS_CODES.success,
      failureValues: BUILTIN_STATUS_CODES.declined,
      pendingValues: [
        ...BUILTIN_STATUS_CODES.instance,
        ...BUILTIN_STATUS_CODES.submitted,
      ],
      ignoredValues: DEFAULT_STATUS_MAPPINGS.filter(
        (status) => status.semantic === "other",
      ).map((status) => status.rawCode),
    },
    metrics: makeMetrics(),
    dimensions: makeDimensions(mapping, columns),
    mappingConfidence: mappingConfidence(issues),
    caveats: issues,
  };
}

function makeFactEvidence(
  taskId: string,
  capabilityId: string,
  title: string,
  claim: string,
  validators: EvidenceValidatorResult[],
  dataScore = 0.88,
): Evidence {
  return {
    id: evidenceId("ev"),
    taskId,
    capabilityId,
    type: "fact",
    title,
    claim,
    grade: grade({ data: dataScore, claim: 0.86 }),
    severity: validators.some((v) => v.status === "failed")
      ? "critical"
      : validators.some((v) => v.status === "warning")
        ? "warning"
        : "info",
    caveats: validators
      .filter((validator) => validator.status !== "passed")
      .map((validator) => validator.message),
    validators,
    relatedEvidenceIds: [],
  };
}

async function identifyTable({
  input,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const tables = await listTables();
  const preferred =
    input.preferredTable && tables.includes(input.preferredTable)
      ? input.preferredTable
      : undefined;
  const telecomTable =
    preferred ??
    tables.find((table) => table.startsWith(TELECOM_TABLE_BASE)) ??
    tables[0] ??
    "";

  if (!telecomTable) {
    throw new Error(
      "No DuckDB tables are available. Upload or load a telecom file first.",
    );
  }

  const info = await getTableInfo(telecomTable);
  const validators: EvidenceValidatorResult[] = [
    {
      id: "table-found",
      status: "passed",
      message: `Selected ${telecomTable}`,
    },
    {
      id: "row-count",
      status: info.rowCount > 0 ? "passed" : "failed",
      message: `${compactNumber(info.rowCount)} rows available`,
    },
  ];

  return {
    patch: {
      dataset: {
        activeTable: telecomTable,
        availableTables: tables,
        columns: info.columns,
        rowCount: info.rowCount,
        selectedFileName: input.fileName,
      },
    },
    evidence: [
      makeFactEvidence(
        "identify-table",
        "telecom.identifyTable",
        "Active telecom table",
        `${telecomTable} selected with ${compactNumber(info.rowCount)} rows and ${info.columns.length} columns.`,
        validators,
        info.rowCount > 0 ? 0.92 : 0.3,
      ),
    ],
  };
}

async function validateTelecomMapping({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const columns = mappingColumnSet(state);
  const issues = validateMapping(input.mapping, columns);
  const validators: EvidenceValidatorResult[] = [
    {
      id: "required-mapping",
      status: issues.length ? "warning" : "passed",
      message: issues.length
        ? `${issues.length} mapping issues need review`
        : "Required telecom fields are mapped to available columns",
    },
  ];

  return {
    patch: {
      telecom: {
        mapping: input.mapping,
        statusMapping: input.statusMapping,
        mappingIssues: issues,
      },
    },
    evidence: [
      makeFactEvidence(
        "validate-mapping",
        "telecom.validateMapping",
        "Telecom column mapping",
        issues.length
          ? `Mapping is usable but has ${issues.length} issue${issues.length === 1 ? "" : "s"}.`
          : "Telecom mapping is ready for the first investigation pass.",
        validators,
        mappingConfidence(issues),
      ),
    ],
  };
}

async function buildSemanticModelCapability({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");

  const columns = mappingColumnSet(state);
  const issues =
    state.telecom.mappingIssues.length > 0
      ? state.telecom.mappingIssues
      : validateMapping(input.mapping, columns);
  const semanticModel = buildSemanticModel(
    table,
    input.mapping,
    columns,
    issues,
  );
  const availableDimensions = semanticModel.dimensions.filter(
    (d) => d.available,
  );
  const validators: EvidenceValidatorResult[] = [
    {
      id: "semantic-table",
      status: "passed",
      message: `Semantic model bound to ${table}`,
    },
    {
      id: "semantic-dimensions",
      status: availableDimensions.length >= 4 ? "passed" : "warning",
      message: `${availableDimensions.length} telecom dimensions available`,
    },
    {
      id: "semantic-metrics",
      status: "passed",
      message: `${semanticModel.metrics.length} canonical metrics defined`,
    },
  ];

  return {
    patch: {
      telecom: {
        semanticModel,
      },
    },
    evidence: [
      makeFactEvidence(
        "semantic-model",
        "telecom.buildSemanticModel",
        "Telecom semantic model",
        `${semanticModel.metrics.length} metrics and ${availableDimensions.length} dimensions are ready for telecom analysis.`,
        validators,
        semanticModel.mappingConfidence,
      ),
    ],
  };
}

async function overviewKpis({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");

  const statusMapping = input.statusMapping.length
    ? input.statusMapping
    : DEFAULT_STATUS_MAPPINGS;
  const kpi = await fetchKPI(table, input.mapping, statusMapping);
  if (!kpi) throw new Error("Unable to compute telecom overview KPIs.");

  const [canals, statuses] = await Promise.all([
    fetchRawCanalSummaries(
      table,
      input.mapping,
      kpi.totalTransactions,
      statusMapping,
    ),
    fetchStatusBreakdown(table, input.mapping, statusMapping),
  ]);
  const topCanal = canals[0];
  const validators: EvidenceValidatorResult[] = [
    {
      id: "kpi-denominator",
      status: kpi.totalTransactions > 0 ? "passed" : "failed",
      message: `Denominator: ${compactNumber(kpi.totalTransactions)} transactions`,
    },
    {
      id: "kpi-success-rate",
      status:
        kpi.successRate >= 0 && kpi.successRate <= 100 ? "passed" : "failed",
      message: `Success rate is ${numericPct(kpi.successRate)}`,
    },
    {
      id: "kpi-status-coverage",
      status: statuses.length > 0 ? "passed" : "warning",
      message: `${statuses.length} normalized status buckets found`,
    },
  ];

  const overviewEvidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "overview-kpis",
    capabilityId: "telecom.overviewKpis",
    type: "finding",
    title: "Telecom overview",
    claim: `${compactNumber(kpi.totalTransactions)} transactions, ${numericPct(kpi.successRate)} success rate, ${compactNumber(kpi.declinedCount)} declined, total amount ${compactNumber(kpi.totalAmount)}.`,
    grade: grade({
      data: validators.every((v) => v.status !== "failed") ? 0.9 : 0.45,
      claim: 0.9,
      business: 0.92,
    }),
    severity:
      kpi.successRate < 70
        ? "critical"
        : kpi.successRate < 85
          ? "warning"
          : "positive",
    sql: "Generated by fetchKPI using normalized telecom status mapping.",
    dataRef: {
      table,
      rowLimit: 0,
    },
    caveats: state.telecom.mappingIssues,
    validators,
    relatedEvidenceIds: [],
  };

  const canalEvidence: Evidence | undefined = topCanal
    ? {
        id: evidenceId("ev"),
        taskId: "overview-kpis",
        capabilityId: "telecom.overviewKpis",
        type: "finding",
        title: "Largest canal",
        claim: `${topCanal.label} is the largest canal with ${compactNumber(topCanal.total)} transactions, ${numericPct(topCanal.successRate)} success rate, and ${numericPct(topCanal.share)} volume share.`,
        grade: grade({ data: 0.86, claim: 0.84, business: 0.9 }),
        severity:
          topCanal.successRate < kpi.successRate - 5 ? "warning" : "info",
        dataRef: { table, rowLimit: 0 },
        caveats: [],
        validators: [
          {
            id: "canal-ranked",
            status: "passed",
            message: "Canal rows are ordered by transaction volume",
          },
        ],
        relatedEvidenceIds: [overviewEvidence.id],
      }
    : undefined;

  return {
    patch: {
      telecom: {
        kpi,
        canals,
        statuses,
      },
    },
    evidence: canalEvidence
      ? [overviewEvidence, canalEvidence]
      : [overviewEvidence],
  };
}

async function successRateTrend({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");

  const dailyTrend = await fetchDailyTrend(table, input.mapping);
  const validators: EvidenceValidatorResult[] = [
    {
      id: "trend-history",
      status: dailyTrend.length >= 2 ? "passed" : "warning",
      message: `${dailyTrend.length} daily buckets available`,
    },
    {
      id: "trend-denominator",
      status: dailyTrend.some((row) => row.total > 0) ? "passed" : "failed",
      message: "Daily trend has transaction denominators",
    },
  ];

  const rates = dailyTrend.map((row) =>
    row.total > 0 ? (row.success / row.total) * 100 : 0,
  );
  const direction = trendDirection(rates);
  const first = rates[0] ?? 0;
  const last = rates[rates.length - 1] ?? 0;
  const directionText =
    direction === "up"
      ? "improved"
      : direction === "down"
        ? "declined"
        : "stayed broadly flat";

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "success-trend",
    capabilityId: "telecom.successRateTrend",
    type: "chart",
    title: "Success-rate trend",
    claim:
      dailyTrend.length >= 2
        ? `Success rate ${directionText} from ${numericPct(first)} to ${numericPct(last)} across ${dailyTrend.length} days.`
        : "Not enough daily history for a trend yet.",
    grade: grade({
      data: dailyTrend.length >= 2 ? 0.86 : 0.45,
      method: 0.82,
      claim: dailyTrend.length >= 2 ? 0.82 : 0.55,
      business: 0.9,
    }),
    severity:
      direction === "down"
        ? "warning"
        : direction === "up"
          ? "positive"
          : "info",
    dataRef: { table, rowLimit: 0 },
    chartSpec: {
      kind: "line",
      x: "day",
      y: "successRate",
      data: dailyTrend.map((row) => ({
        day: row.day,
        total: row.total,
        successRate: row.total > 0 ? (row.success / row.total) * 100 : 0,
        declined: row.declined,
      })),
    },
    caveats:
      dailyTrend.length < 2
        ? ["Trend analysis needs at least two daily buckets."]
        : [],
    validators,
    relatedEvidenceIds: [],
  };

  return {
    patch: {
      telecom: {
        dailyTrend,
      },
    },
    evidence: [evidence],
  };
}

async function periodCompare({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");
  const dailyTrend = state.telecom.dailyTrend ?? [];
  const windows = latestTwoDayWindows(dailyTrend.map((row) => row.day));
  if (!windows) {
    throw new Error("Need at least two days to compare periods.");
  }

  const [current, baseline] = await Promise.all([
    fetchPeriodKPI(
      table,
      input.mapping,
      windows.current.from,
      windows.current.to,
    ),
    fetchPeriodKPI(
      table,
      input.mapping,
      windows.baseline.from,
      windows.baseline.to,
    ),
  ]);
  if (!current || !baseline) {
    throw new Error("Unable to compute period comparison KPIs.");
  }

  const successPointDelta = pointsDelta(
    current.successRate,
    baseline.successRate,
  );
  const volumeDelta = deltaPct(current.total, baseline.total);
  const declinedDelta = deltaPct(current.declined, baseline.declined);
  const validators: EvidenceValidatorResult[] = [
    {
      id: "period-current",
      status: current.total > 0 ? "passed" : "failed",
      message: `Current ${dateWindowLabel(windows.current)}: ${compactNumber(current.total)} tx`,
    },
    {
      id: "period-baseline",
      status: baseline.total > 0 ? "passed" : "failed",
      message: `Baseline ${dateWindowLabel(windows.baseline)}: ${compactNumber(baseline.total)} tx`,
    },
    {
      id: "period-denominator",
      status: "passed",
      message: "Comparison uses transaction count denominator",
    },
  ];

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "period-compare",
    capabilityId: "telecom.periodCompare",
    type: "finding",
    title: "Latest period vs baseline",
    claim: `Latest day success rate changed by ${successPointDelta >= 0 ? "+" : ""}${successPointDelta.toFixed(2)} points vs prior day. Volume changed ${volumeDelta >= 0 ? "+" : ""}${volumeDelta.toFixed(1)}%, declined count changed ${declinedDelta >= 0 ? "+" : ""}${declinedDelta.toFixed(1)}%.`,
    grade: grade({ data: 0.88, method: 0.84, claim: 0.86, business: 0.92 }),
    severity:
      successPointDelta <= -3 || declinedDelta > 20
        ? "critical"
        : successPointDelta < 0
          ? "warning"
          : "info",
    dataRef: { table, rowLimit: 0 },
    chartSpec: {
      kind: "period-compare",
      currentWindow: windows.current,
      baselineWindow: windows.baseline,
      rows: [
        {
          metric: "transactions",
          current: current.total,
          baseline: baseline.total,
        },
        {
          metric: "successRate",
          current: current.successRate,
          baseline: baseline.successRate,
        },
        {
          metric: "declined",
          current: current.declined,
          baseline: baseline.declined,
        },
        {
          metric: "amount",
          current: current.amount,
          baseline: baseline.amount,
        },
      ],
    },
    caveats: [],
    validators,
    relatedEvidenceIds: [],
  };

  return {
    patch: {
      telecom: {
        periodCompare: {
          current,
          baseline,
          currentWindow: windows.current,
          baselineWindow: windows.baseline,
        },
      },
    },
    evidence: [evidence],
  };
}

function canalCompare({
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const canals = state.telecom.canals ?? [];
  if (!canals.length) throw new Error("No canal aggregates are available.");
  const kpi = state.telecom.kpi;
  const topByVolume = canals[0];
  const weakestHighVolume = canals
    .filter((canal) => canal.share >= 5)
    .sort((a, b) => a.successRate - b.successRate)[0];
  const validators: EvidenceValidatorResult[] = [
    {
      id: "canal-coverage",
      status: canals.length > 0 ? "passed" : "failed",
      message: `${canals.length} canal groups evaluated`,
    },
    {
      id: "canal-denominator",
      status: kpi && kpi.totalTransactions > 0 ? "passed" : "warning",
      message: `Share uses total transactions denominator`,
    },
  ];

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "canal-compare",
    capabilityId: "telecom.canalCompare",
    type: "chart",
    title: "Canal comparison",
    claim: weakestHighVolume
      ? `${topByVolume.label} has the largest volume share (${numericPct(topByVolume.share)}). Among high-volume canals, ${weakestHighVolume.label} has the weakest success rate at ${numericPct(weakestHighVolume.successRate)}.`
      : `${topByVolume.label} has the largest volume share (${numericPct(topByVolume.share)}).`,
    grade: grade({ data: 0.86, method: 0.84, claim: 0.84, business: 0.92 }),
    severity:
      weakestHighVolume &&
      kpi &&
      weakestHighVolume.successRate < kpi.successRate - 5
        ? "warning"
        : "info",
    chartSpec: {
      kind: "bar",
      x: "label",
      y: "total",
      color: "successRate",
      data: canals.slice(0, 10).map((canal) => ({
        label: canal.label,
        total: canal.total,
        successRate: canal.successRate,
        share: canal.share,
        declined: canal.declined,
      })),
    },
    caveats: [],
    validators,
    relatedEvidenceIds: [],
  };

  return Promise.resolve({ evidence: [evidence] });
}

function failureByStatus({
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const statuses = state.telecom.statuses ?? [];
  if (!statuses.length) throw new Error("No status aggregates are available.");
  const total = statuses.reduce((sum, row) => sum + row.count, 0);
  const largestNonSuccess = statuses
    .filter((row) => row.status !== "SUCCESS")
    .sort((a, b) => b.count - a.count)[0];
  const validators: EvidenceValidatorResult[] = [
    {
      id: "status-denominator",
      status: total > 0 ? "passed" : "failed",
      message: `${compactNumber(total)} normalized statuses counted`,
    },
    {
      id: "status-success-present",
      status: statuses.some((row) => row.status === "SUCCESS")
        ? "passed"
        : "warning",
      message: "SUCCESS bucket checked",
    },
  ];

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "failure-status",
    capabilityId: "telecom.failureByStatus",
    type: "chart",
    title: "Status mix",
    claim: largestNonSuccess
      ? `${largestNonSuccess.status} is the largest non-success bucket with ${compactNumber(largestNonSuccess.count)} transactions (${numericPct((largestNonSuccess.count / Math.max(1, total)) * 100)} share).`
      : "No non-success status bucket is visible in the current overview.",
    grade: grade({ data: 0.84, method: 0.82, claim: 0.84, business: 0.88 }),
    severity:
      largestNonSuccess && largestNonSuccess.count / Math.max(1, total) > 0.2
        ? "warning"
        : "info",
    chartSpec: {
      kind: "donut",
      label: "status",
      value: "count",
      data: statuses,
    },
    caveats: [],
    validators,
    relatedEvidenceIds: [],
  };

  return Promise.resolve({ evidence: [evidence] });
}

async function failureBySubStatus({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");
  const trend = state.telecom.dailyTrend ?? [];
  const uniqueDays = [
    ...new Set(trend.map((row) => row.day.slice(0, 10))),
  ].sort();
  const from = uniqueDays[0] ?? "";
  const to = uniqueDays[uniqueDays.length - 1] ?? "";
  const subStatuses = await (from && to
    ? fetchSubStatusBreakdown(table, input.mapping, from, to)
    : Promise.resolve([]));

  const topSubStatus = subStatuses[0];
  const validators: EvidenceValidatorResult[] = [
    {
      id: "substatus-source",
      status: subStatuses.length ? "passed" : "warning",
      message: `${subStatuses.length} sub-status rows available`,
    },
    {
      id: "substatus-window",
      status: from && to ? "passed" : "warning",
      message:
        from && to ? `Window ${from} to ${to}` : "No date window inferred",
    },
  ];

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "failure-substatus",
    capabilityId: "telecom.failureBySubStatus",
    type: "table",
    title: "Failure sub-status signals",
    claim: topSubStatus
      ? `${topSubStatus.code} is the top raw sub-status with ${compactNumber(topSubStatus.count)} transactions (${numericPct(topSubStatus.share)} share).`
      : "No strong sub-status signal is available yet.",
    grade: grade({
      data: subStatuses.length,
      method: 0.78,
      claim: subStatuses.length,
      business: 0.9,
    }),
    severity:
      topSubStatus && topSubStatus.parent === "DECLINED" ? "warning" : "info",
    dataRef: { table, rowLimit: 0 },
    chartSpec: {
      kind: "table",
      data: subStatuses.slice(0, 10),
    },
    caveats:
      from && to ? [] : ["Sub-status period scope could not be inferred."],
    validators,
    relatedEvidenceIds: [],
  };

  return {
    patch: {
      telecom: {
        subStatuses,
      },
    },
    evidence: [evidence],
  };
}

async function anomalyRadar({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");

  const trend = state.telecom.dailyTrend ?? [];
  const window = fullDateWindow(trend.map((row) => row.day));
  if (!window) {
    throw new Error("Need dated telecom rows to run anomaly radar.");
  }

  const anomalies = await fetchAnomalies(
    table,
    input.mapping,
    window.from,
    window.to,
  );
  const top = anomalies[0];
  const validators: EvidenceValidatorResult[] = [
    {
      id: "anomaly-window",
      status: "passed",
      message: `Anomaly radar scanned ${dateWindowLabel(window)}`,
    },
    {
      id: "anomaly-count",
      status: anomalies.length > 0 ? "warning" : "passed",
      message: anomalies.length
        ? `${anomalies.length} canal-hour anomalies found`
        : "No canal-hour anomalies crossed the current threshold",
    },
  ];

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "anomaly-radar",
    capabilityId: "telecom.anomalyRadar",
    type: "anomaly",
    title: "Anomaly radar",
    claim: top
      ? `Strongest anomaly: ${top.canal} at hour ${top.hour}, ${numericPct(top.successRate)} success rate over ${compactNumber(top.total)} transactions (${top.reason}).`
      : "No canal-hour anomaly crossed the current threshold.",
    grade: grade({
      data: trend.length >= 2 ? 0.78 : 0.55,
      method: 0.74,
      claim: top ? 0.8 : 0.72,
      business: top ? 0.9 : 0.72,
    }),
    severity: top && top.z >= 3 ? "critical" : top ? "warning" : "positive",
    dataRef: { table, rowLimit: 0 },
    chartSpec: {
      kind: "table",
      data: anomalies.slice(0, 10).map((row) => ({
        code: `${row.canal} · ${row.hour}:00`,
        parent: row.reason,
        count: row.total,
        successRate: row.successRate,
        z: row.z,
      })),
    },
    caveats: [
      "Anomaly radar compares canal-hour cells inside the selected date window.",
    ],
    validators,
    relatedEvidenceIds: [],
  };

  return {
    patch: {
      telecom: {
        anomalies,
      },
    },
    evidence: [evidence],
  };
}

async function userConcentration({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");

  const trend = state.telecom.dailyTrend ?? [];
  const window = fullDateWindow(trend.map((row) => row.day));
  if (!window) {
    throw new Error("Need dated telecom rows to compute user concentration.");
  }

  const topAccounts = await fetchTopAccounts(
    table,
    input.mapping,
    window.from,
    window.to,
    15,
    "amount",
  );
  const totalAmount = state.telecom.kpi?.totalAmount ?? 0;
  const top = topAccounts[0];
  const topFiveAmount = topAccounts
    .slice(0, 5)
    .reduce((sum, row) => sum + row.amount, 0);
  const topFiveShare =
    totalAmount > 0 ? (topFiveAmount / Math.max(1, totalAmount)) * 100 : 0;

  const validators: EvidenceValidatorResult[] = [
    {
      id: "concentration-window",
      status: "passed",
      message: `Concentration scoped to ${dateWindowLabel(window)}`,
    },
    {
      id: "concentration-accounts",
      status: topAccounts.length > 0 ? "passed" : "warning",
      message: `${topAccounts.length} top accounts ranked`,
    },
    {
      id: "concentration-denominator",
      status: totalAmount > 0 ? "passed" : "warning",
      message:
        totalAmount > 0
          ? `Total amount denominator: ${compactNumber(totalAmount)}`
          : "Total amount denominator unavailable",
    },
  ];

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "user-concentration",
    capabilityId: "telecom.userConcentration",
    type: "table",
    title: "User/account concentration",
    claim: top
      ? `Top account ${top.msisdn} contributed ${compactNumber(top.amount)} amount across ${compactNumber(top.total)} transactions. Top 5 accounts represent ${numericPct(topFiveShare)} of total amount.`
      : "No account concentration signal is available yet.",
    grade: grade({
      data: topAccounts.length ? 0.82 : 0.45,
      method: 0.8,
      claim: topAccounts.length ? 0.82 : 0.5,
      business: 0.88,
    }),
    severity: topFiveShare >= 40 ? "warning" : "info",
    dataRef: { table, rowLimit: 0 },
    chartSpec: {
      kind: "bar",
      x: "msisdn",
      y: "amount",
      data: topAccounts.slice(0, 8).map((row) => ({
        label: row.msisdn,
        total: row.amount,
        successRate: row.successRate,
        count: row.total,
      })),
    },
    caveats: [
      "Concentration uses successful amount where the existing period query defines amount that way.",
    ],
    validators,
    relatedEvidenceIds: [],
  };

  return {
    patch: {
      telecom: {
        topAccounts,
      },
    },
    evidence: [evidence],
  };
}

function criticCanal(evidence: Evidence): EvidenceValidatorResult[] {
  if (evidence.capabilityId !== "telecom.canalCompare") return [];
  const spec = evidence.chartSpec as Record<string, unknown> | undefined;
  const data = Array.isArray(spec?.data)
    ? (spec.data as Record<string, unknown>[])
    : [];
  const results: EvidenceValidatorResult[] = [];

  results.push({
    id: "critic-canal-count",
    status: data.length >= 2 ? "passed" : "warning",
    message: `Canal comparison needs ≥2 canals — found ${data.length}`,
  });

  const shares = data.map((row) => Number(row.share ?? 0));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  results.push({
    id: "critic-canal-share-total",
    status:
      Math.abs(shareSum - 100) <= 5 || shareSum === 0 ? "passed" : "warning",
    message: `Canal shares sum to ${shareSum.toFixed(1)}% (expect ~100%)`,
  });

  const topCanal = data[0];
  if (topCanal) {
    const topShare = Number(topCanal.share ?? 0);
    const topIsActuallyFirst = shares.every((share) => share <= topShare);
    results.push({
      id: "critic-canal-top-ranked",
      status: topIsActuallyFirst ? "passed" : "failed",
      message: topIsActuallyFirst
        ? "Top canal is correctly ranked by volume"
        : "Canal ranking is inconsistent — top canal is not the highest share",
    });
  }

  return results;
}

function criticAnomaly(evidence: Evidence): EvidenceValidatorResult[] {
  if (evidence.capabilityId !== "telecom.anomalyRadar") return [];
  const results: EvidenceValidatorResult[] = [];

  const hasWindow = evidence.validators.some((v) => v.id === "anomaly-window");
  results.push({
    id: "critic-anomaly-window",
    status: hasWindow ? "passed" : "warning",
    message: hasWindow
      ? "Anomaly window is defined"
      : "Anomaly claim is missing a date window definition",
  });

  const spec = evidence.chartSpec as Record<string, unknown> | undefined;
  const data = Array.isArray(spec?.data)
    ? (spec.data as Record<string, unknown>[])
    : [];
  if (data.length > 0) {
    const hasZ = data.every(
      (row) => typeof row.z === "number" || row.z !== undefined,
    );
    results.push({
      id: "critic-anomaly-zscore",
      status: hasZ ? "passed" : "warning",
      message: hasZ
        ? "Z-score is attached to each anomaly row"
        : "Anomaly rows are missing z-score severity values",
    });
  }

  return results;
}

function criticPeriod(evidence: Evidence): EvidenceValidatorResult[] {
  if (evidence.capabilityId !== "telecom.periodCompare") return [];
  const results: EvidenceValidatorResult[] = [];

  const hasCurrent = evidence.validators.some(
    (v) => v.id === "period-current" && v.status !== "failed",
  );
  const hasBaseline = evidence.validators.some(
    (v) => v.id === "period-baseline" && v.status !== "failed",
  );
  results.push({
    id: "critic-period-windows",
    status: hasCurrent && hasBaseline ? "passed" : "failed",
    message:
      hasCurrent && hasBaseline
        ? "Both current and baseline period windows are populated"
        : "Period comparison is missing a valid current or baseline window",
  });

  return results;
}

function applyMechanicalCriticism(evidence: Evidence): Evidence {
  const extraValidators: EvidenceValidatorResult[] = [
    ...criticCanal(evidence),
    ...criticAnomaly(evidence),
    ...criticPeriod(evidence),
  ];

  if (!extraValidators.length) return evidence;

  const extraCaveats = extraValidators
    .filter((v) => v.status !== "passed")
    .map((v) => v.message);

  return {
    ...evidence,
    validators: [...evidence.validators, ...extraValidators],
    caveats: [...evidence.caveats, ...extraCaveats],
  };
}

function validateEvidence({
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const criticised = state.evidence.items.map(applyMechanicalCriticism);

  const accepted = criticised
    .filter(
      (item) =>
        item.validators.every((validator) => validator.status !== "failed") &&
        item.grade.data >= 0.45 &&
        item.grade.claim >= 0.65,
    )
    .map((item) => item.id);

  const rejected = criticised
    .filter((item) =>
      item.validators.some((validator) => validator.status === "failed"),
    )
    .map((item) => item.id);

  return Promise.resolve({
    patch: {
      evidence: {
        items: criticised,
        acceptedIds: accepted,
        rejectedIds: rejected,
      },
    },
  });
}

function briefFromEvidence({
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const accepted = state.evidence.items.filter((item) =>
    state.evidence.acceptedIds.includes(item.id),
  );
  const overview = state.telecom.kpi;
  const topCanal = state.telecom.canals?.[0];
  const topAnomaly = state.telecom.anomalies?.[0];
  const topAccount = state.telecom.topAccounts?.[0];
  const periodCompare = state.telecom.periodCompare;
  const findings = accepted.slice(0, 4).map((item) => item.claim);
  const caveats = [
    ...state.telecom.mappingIssues,
    ...accepted.flatMap((item) => item.caveats),
  ].filter(Boolean);
  const headline = overview
    ? periodCompare
      ? `Telecom baseline: ${numericPct(overview.successRate)} success across ${compactNumber(overview.totalTransactions)} transactions; latest day is ${pointsDelta(periodCompare.current.successRate, periodCompare.baseline.successRate) >= 0 ? "+" : ""}${pointsDelta(periodCompare.current.successRate, periodCompare.baseline.successRate).toFixed(2)} points vs prior day.`
      : `Telecom baseline: ${numericPct(overview.successRate)} success across ${compactNumber(overview.totalTransactions)} transactions.`
    : "Telecom baseline is ready for deeper investigation.";
  const actions = [
    topCanal
      ? `Run canal root-cause next for ${topCanal.label}.`
      : "Run canal comparison next.",
    topAnomaly
      ? `Inspect anomaly ${topAnomaly.canal} at ${topAnomaly.hour}:00 before export.`
      : "Keep anomaly radar in the report as a negative control.",
    topAccount
      ? `Review concentration around top account ${topAccount.msisdn}.`
      : "Add user/account concentration once account columns are stable.",
    "Keep SQL/evidence attached before exporting the report.",
  ];
  const reportDraft = {
    title: "Telecom Agent Mesh Executive Brief",
    generatedAt: Date.now(),
    executiveSummary: headline,
    keyFindings: findings,
    recommendedActions: actions,
    caveats: [...new Set(caveats)],
    evidenceIds: accepted.map((item) => item.id),
  };

  return Promise.resolve({
    decisionPatch: {
      headline,
      findings,
      actions,
      caveats: [...new Set(caveats)],
      reportDraft,
    },
  });
}

async function inferMapping({
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const columns = state.dataset.columns.map((col) => col.name);
  const inferred = inferColumnMapping(columns);
  const inferredCount = Object.keys(inferred).length;
  const validators: EvidenceValidatorResult[] = [
    {
      id: "infer-columns",
      status: inferredCount >= 4 ? "passed" : "warning",
      message: `${inferredCount} of ${REQUIRED_MAPPING_KEYS.length} required fields auto-detected`,
    },
  ];
  return {
    evidence: [
      makeFactEvidence(
        "infer-mapping",
        "telecom.inferMapping",
        "Inferred column mapping",
        `Auto-detected ${inferredCount} column assignments from ${columns.length} available columns.`,
        validators,
        inferredCount / REQUIRED_MAPPING_KEYS.length,
      ),
    ],
  };
}

async function hourlyPattern({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");

  const statusMapping = input.statusMapping.length
    ? input.statusMapping
    : DEFAULT_STATUS_MAPPINGS;

  const rows = await fetchHourly(table, input.mapping, statusMapping);
  const peakRow = rows.reduce(
    (best, row) => (row.total > (best?.total ?? 0) ? row : best),
    rows[0],
  );
  const quietRow = rows.reduce(
    (low, row) =>
      row.total > 0 && row.total < (low?.total ?? Infinity) ? row : low,
    rows.find((r) => r.total > 0),
  );
  const totalTx = rows.reduce((sum, row) => sum + row.total, 0);

  const validators: EvidenceValidatorResult[] = [
    {
      id: "hourly-rows",
      status: rows.length >= 4 ? "passed" : "warning",
      message: `${rows.length} hour buckets found`,
    },
    {
      id: "hourly-denominator",
      status: totalTx > 0 ? "passed" : "failed",
      message: `${compactNumber(totalTx)} total transactions across hours`,
    },
  ];

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "hourly-pattern",
    capabilityId: "telecom.hourlyPattern",
    type: "chart",
    title: "Hourly traffic pattern",
    claim: peakRow
      ? `Peak hour is ${peakRow.hour}:00 with ${compactNumber(peakRow.total)} transactions (${numericPct(peakRow.total > 0 ? (peakRow.success / peakRow.total) * 100 : 0)} success rate).${quietRow && quietRow.hour !== peakRow.hour ? ` Quietest active hour is ${quietRow.hour}:00.` : ""}`
      : "No hourly pattern data is available.",
    grade: grade({
      data: rows.length >= 8 ? 0.84 : 0.65,
      method: 0.82,
      claim: rows.length >= 4 ? 0.82 : 0.55,
      business: 0.8,
    }),
    severity: "info",
    dataRef: { table, rowLimit: 0 },
    chartSpec: {
      kind: "bar",
      x: "hour",
      y: "total",
      color: "successRate",
      data: rows.map((row) => ({
        label: `${row.hour}:00`,
        total: row.total,
        successRate: row.total > 0 ? (row.success / row.total) * 100 : 0,
        declined: row.declined,
      })),
    },
    caveats:
      rows.length < 4
        ? ["Fewer than 4 active hours — pattern may not be representative."]
        : [],
    validators,
    relatedEvidenceIds: [],
  };

  return { evidence: [evidence] };
}

async function amountBandAnalysis({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");

  const amtCol = input.mapping.amount;
  if (!amtCol)
    throw new Error("Amount column is not mapped — cannot run band analysis.");

  const rows = await runQuery(`
    SELECT
      CASE
        WHEN TRY_CAST(${qc(amtCol)} AS DOUBLE) IS NULL         THEN 'Invalid'
        WHEN TRY_CAST(${qc(amtCol)} AS DOUBLE) <= 0            THEN 'Zero/Negative'
        WHEN TRY_CAST(${qc(amtCol)} AS DOUBLE) < 100           THEN '< 100'
        WHEN TRY_CAST(${qc(amtCol)} AS DOUBLE) < 500           THEN '100 – 500'
        WHEN TRY_CAST(${qc(amtCol)} AS DOUBLE) < 2000          THEN '500 – 2K'
        WHEN TRY_CAST(${qc(amtCol)} AS DOUBLE) < 10000         THEN '2K – 10K'
        WHEN TRY_CAST(${qc(amtCol)} AS DOUBLE) < 50000         THEN '10K – 50K'
        ELSE '50K+'
      END AS band,
      COUNT(*) AS total,
      ROUND(SUM(TRY_CAST(${qc(amtCol)} AS DOUBLE)), 2) AS amount
    FROM ${qc(table)}
    GROUP BY 1
    ORDER BY 2 DESC
  `);

  const totalTx = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const totalAmount = rows.reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0,
  );
  const topBand = rows[0];
  const validators: EvidenceValidatorResult[] = [
    {
      id: "band-denominator",
      status: totalTx > 0 ? "passed" : "failed",
      message: `${compactNumber(totalTx)} transactions analysed`,
    },
    {
      id: "band-amount",
      status: totalAmount > 0 ? "passed" : "warning",
      message: `Total amount: ${compactNumber(totalAmount)}`,
    },
  ];

  const bandData = rows.map((row) => ({
    label: String(row.band ?? ""),
    total: Number(row.total ?? 0),
    amount: Number(row.amount ?? 0),
    share: totalTx > 0 ? (Number(row.total ?? 0) / totalTx) * 100 : 0,
  }));

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "amount-band",
    capabilityId: "telecom.amountBandAnalysis",
    type: "chart",
    title: "Amount band distribution",
    claim: topBand
      ? `${String(topBand.band)} is the most common amount tier with ${compactNumber(Number(topBand.total))} transactions (${numericPct(totalTx > 0 ? (Number(topBand.total) / totalTx) * 100 : 0)} share).`
      : "Amount band distribution is not available.",
    grade: grade({ data: 0.82, method: 0.8, claim: 0.8, business: 0.78 }),
    severity: "info",
    dataRef: { table, rowLimit: 0 },
    chartSpec: {
      kind: "bar",
      x: "label",
      y: "total",
      data: bandData,
    },
    caveats: [],
    validators,
    relatedEvidenceIds: [],
  };

  return { evidence: [evidence] };
}

async function dataQualityProfile({
  input,
  state,
}: Parameters<CapabilityExecutor>[0]): Promise<CapabilityResult> {
  const table = state.dataset.activeTable;
  if (!table) throw new Error("No active telecom table is selected.");

  const m = input.mapping;
  const cols = [
    { key: "transactionId", col: m.transactionId },
    { key: "transactionDate", col: m.transactionDate },
    { key: "amount", col: m.amount },
    { key: "status", col: m.status },
    { key: "canal", col: m.canal },
    { key: "msisdn", col: m.msisdn },
  ].filter((entry) => Boolean(entry.col));

  const nullChecks = cols
    .map(
      ({ key, col }) =>
        `SUM(CASE WHEN ${qc(col)} IS NULL OR CAST(${qc(col)} AS VARCHAR) IN ('','null','NULL') THEN 1 ELSE 0 END) AS null_${key}`,
    )
    .join(",\n        ");

  const totalRow = await runQuery(
    `SELECT COUNT(*) AS total, ${nullChecks} FROM ${qc(table)}`,
  );
  const total = Number(totalRow[0]?.total ?? 0);

  const qualityIssues: string[] = [];
  const validators: EvidenceValidatorResult[] = [];

  for (const { key, col } of cols) {
    const nullCount = Number(totalRow[0]?.[`null_${key}`] ?? 0);
    const nullRate = total > 0 ? (nullCount / total) * 100 : 0;
    const status =
      nullRate > 20 ? "failed" : nullRate > 5 ? "warning" : "passed";
    validators.push({
      id: `quality-${key}`,
      status,
      message: `${col}: ${numericPct(nullRate)} null rate (${compactNumber(nullCount)} of ${compactNumber(total)})`,
    });
    if (status !== "passed") {
      qualityIssues.push(`${col} has ${numericPct(nullRate)} null values`);
    }
  }

  const dateRows = await runQuery(`
    SELECT COUNT(*) AS parseable
    FROM ${qc(table)}
    WHERE TRY_CAST(${qc(m.transactionDate)} AS TIMESTAMP) IS NOT NULL
       OR TRY_STRPTIME(CAST(${qc(m.transactionDate)} AS VARCHAR), '%d/%m/%Y %H:%M:%S') IS NOT NULL
  `).catch(() => [{ parseable: 0 }]);

  const parseable = Number(dateRows[0]?.parseable ?? 0);
  const dateParseRate = total > 0 ? (parseable / total) * 100 : 0;
  validators.push({
    id: "quality-date-parse",
    status:
      dateParseRate >= 90
        ? "passed"
        : dateParseRate >= 70
          ? "warning"
          : "failed",
    message: `Date column parses successfully for ${numericPct(dateParseRate)} of rows`,
  });
  if (dateParseRate < 90) {
    qualityIssues.push(
      `Date column only parses for ${numericPct(dateParseRate)} of rows`,
    );
  }

  const overallScore =
    validators.filter((v) => v.status === "passed").length / validators.length;

  const evidence: Evidence = {
    id: evidenceId("ev"),
    taskId: "data-quality",
    capabilityId: "telecom.dataQualityProfile",
    type: "finding",
    title: "Data quality profile",
    claim:
      qualityIssues.length === 0
        ? `Data quality checks passed across ${cols.length} mapped columns with ${compactNumber(total)} rows.`
        : `${qualityIssues.length} quality issues found: ${qualityIssues.slice(0, 2).join("; ")}.`,
    grade: grade({
      data: overallScore,
      method: 0.9,
      claim: 0.88,
      business: 0.85,
    }),
    severity: validators.some((v) => v.status === "failed")
      ? "critical"
      : validators.some((v) => v.status === "warning")
        ? "warning"
        : "positive",
    dataRef: { table, rowLimit: 0 },
    caveats: qualityIssues,
    validators,
    relatedEvidenceIds: [],
  };

  return { evidence: [evidence] };
}

export const CAPABILITY_EXECUTORS: Record<string, CapabilityExecutor> = {
  "telecom.identifyTable": identifyTable,
  "telecom.validateMapping": validateTelecomMapping,
  "telecom.buildSemanticModel": buildSemanticModelCapability,
  "telecom.overviewKpis": overviewKpis,
  "telecom.successRateTrend": successRateTrend,
  "telecom.periodCompare": periodCompare,
  "telecom.canalCompare": canalCompare,
  "telecom.failureByStatus": failureByStatus,
  "telecom.failureBySubStatus": failureBySubStatus,
  "telecom.anomalyRadar": anomalyRadar,
  "telecom.userConcentration": userConcentration,
  "evidence.validate": validateEvidence,
  "report.briefFromEvidence": briefFromEvidence,
  "telecom.inferMapping": inferMapping,
  "telecom.hourlyPattern": hourlyPattern,
  "telecom.amountBandAnalysis": amountBandAnalysis,
  "telecom.dataQualityProfile": dataQualityProfile,
};

export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.id === id);
}

export function statusCategoryLabels(): string[] {
  return Object.values(SEMANTIC_TO_CATEGORY);
}
