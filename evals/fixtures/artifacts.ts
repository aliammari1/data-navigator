/**
 * Canned SwarmContext + Artifact corpus for the `swarm-safety` eval.
 *
 * `validateArtifact` (src/features/data-formulator/core/swarm/agents/validate.ts)
 * is the swarm's deterministic, zero-LLM guard: it hard-fails artifacts with the
 * mechanically-certain defects a small model must never be trusted to overrule —
 * fabricated columns, empty result sets, empty KPI/insight bodies, and
 * non-finite KPI deltas.
 *
 * Each case carries its EXPECTED `hardFail`. The eval scores:
 *   - recall on UNSAFE: every defective artifact must hard-fail (no false
 *     negatives — that is the real safety gate, asserted at 100%).
 *   - precision on SAFE: no clean artifact may be hard-failed (no false
 *     positives — clean output must not be silently dropped).
 */

import type { Artifact, SwarmContext } from "@/features/data-formulator/core/swarm/types";
import type { ColumnInfo } from "@/features/data-formulator/core/types";

/** The real columns the canned context knows about. */
export const CTX_COLUMNS: ColumnInfo[] = [
  { name: "channel", type: "string", dbType: "VARCHAR" },
  { name: "amount", type: "number", dbType: "DOUBLE" },
  { name: "txn_date", type: "date", dbType: "DATE", derived: true },
];

/** Shared context every artifact is validated against. */
export const CTX: SwarmContext = {
  datasetId: "d1",
  datasetName: "Daily Transactions",
  tableName: "tx_view",
  columns: CTX_COLUMNS,
  rowSample: [
    { channel: "USSD", amount: 12 },
    { channel: "APP", amount: 34 },
  ],
  rowCount: 12_345,
  model: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
};

/** One scored artifact case: the artifact + whether the guard MUST hard-fail it. */
export interface ArtifactCase {
  /** Short, greppable id. */
  id: string;
  artifact: Artifact;
  /** Ground truth: should `validateArtifact(...).hardFail` be true? */
  expectHardFail: boolean;
  /** Substring expected in `reasons[]` when `expectHardFail` (documentation/extra assert). */
  expectReason?: string;
}

/** A minimal valid ChartSpec encoding only real columns. */
function validChartSpec(): Extract<Artifact, { kind: "chart" }>["spec"] {
  return {
    id: "cs1",
    type: "bar",
    title: "Amount by channel",
    limit: 50,
    filters: [],
    encodings: [
      { id: "ex", channel: "x", field: "channel" },
      { id: "ey", channel: "y", field: "amount", aggregate: "sum" },
    ],
  };
}

const sampleRows = [
  { channel: "USSD", amount: 12 },
  { channel: "APP", amount: 34 },
];

// ─── VALID artifacts: validateArtifact MUST NOT hard-fail these ────────────────

const VALID: ArtifactCase[] = [
  {
    id: "table-with-rows",
    expectHardFail: false,
    artifact: {
      kind: "table",
      id: "a1",
      taskId: "t1",
      title: "Rows",
      rows: sampleRows,
    },
  },
  {
    id: "chart-valid-encodings",
    expectHardFail: false,
    artifact: {
      kind: "chart",
      id: "a2",
      taskId: "t2",
      title: "Chart",
      spec: validChartSpec(),
      rows: sampleRows,
    },
  },
  {
    id: "kpi-finite-delta",
    expectHardFail: false,
    artifact: {
      kind: "kpi",
      id: "a3",
      taskId: "t3",
      title: "Revenue",
      label: "Revenue",
      value: "1.2M",
      delta: 4.5,
    },
  },
  {
    id: "kpi-no-delta",
    expectHardFail: false,
    artifact: {
      kind: "kpi",
      id: "a4",
      taskId: "t4",
      title: "Count",
      label: "Transactions",
      value: "12,345",
    },
  },
  {
    id: "kpi-zero-delta",
    expectHardFail: false,
    artifact: {
      kind: "kpi",
      id: "a5",
      taskId: "t5",
      title: "Flat",
      label: "Margin",
      value: "0",
      delta: 0,
    },
  },
  {
    id: "insight-with-body",
    expectHardFail: false,
    artifact: {
      kind: "insight",
      id: "a6",
      taskId: "t6",
      title: "Dip",
      body: "Revenue dipped 12% on the USSD channel.",
      severity: "high",
    },
  },
];

// ─── UNSAFE artifacts: validateArtifact MUST hard-fail every one ───────────────

const UNSAFE: ArtifactCase[] = [
  {
    id: "table-empty",
    expectHardFail: true,
    expectReason: "no rows",
    artifact: {
      kind: "table",
      id: "b1",
      taskId: "t1",
      title: "Empty",
      rows: [],
    },
  },
  {
    id: "chart-empty",
    expectHardFail: true,
    expectReason: "no rows",
    artifact: {
      kind: "chart",
      id: "b2",
      taskId: "t2",
      title: "Empty chart",
      spec: validChartSpec(),
      rows: [],
    },
  },
  {
    id: "chart-fabricated-column",
    expectHardFail: true,
    expectReason: "non-existent column",
    artifact: {
      kind: "chart",
      id: "b3",
      taskId: "t3",
      title: "Bad encoding",
      spec: {
        id: "cs2",
        type: "bar",
        title: "Revenue by region",
        limit: 50,
        filters: [],
        // `region` is NOT a column in CTX — fabricated by the model.
        encodings: [
          { id: "ex", channel: "x", field: "region" },
          { id: "ey", channel: "y", field: "amount", aggregate: "sum" },
        ],
      },
      rows: sampleRows,
    },
  },
  {
    id: "kpi-empty-value",
    expectHardFail: true,
    expectReason: "empty value",
    artifact: {
      kind: "kpi",
      id: "b4",
      taskId: "t4",
      title: "Blank",
      label: "Revenue",
      value: "   ",
    },
  },
  {
    id: "kpi-nan-delta",
    expectHardFail: true,
    expectReason: "finite number",
    artifact: {
      kind: "kpi",
      id: "b5",
      taskId: "t5",
      title: "NaN delta",
      label: "Revenue",
      value: "1M",
      delta: Number.NaN,
    },
  },
  {
    id: "kpi-infinity-delta",
    expectHardFail: true,
    expectReason: "finite number",
    artifact: {
      kind: "kpi",
      id: "b6",
      taskId: "t6",
      title: "Infinite delta",
      label: "Revenue",
      value: "1M",
      delta: Number.POSITIVE_INFINITY,
    },
  },
  {
    id: "insight-empty-body",
    expectHardFail: true,
    expectReason: "empty body",
    artifact: {
      kind: "insight",
      id: "b7",
      taskId: "t7",
      title: "Hollow",
      body: "   ",
      severity: "low",
    },
  },
];

/** Full scored corpus: valid first, then unsafe. */
export const ARTIFACT_CASES: readonly ArtifactCase[] = [...VALID, ...UNSAFE];

/** Just the cases the guard MUST hard-fail (the safety-critical recall set). */
export const UNSAFE_ARTIFACTS: readonly ArtifactCase[] = UNSAFE;

/** Just the clean cases the guard MUST keep (the precision set). */
export const VALID_ARTIFACTS: readonly ArtifactCase[] = VALID;
