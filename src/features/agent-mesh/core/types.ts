"use client";

import type {
  ColumnMapping,
  DailyTrendRow,
  KPISummary,
  StatusMapping,
  StatusRow,
} from "@/features/telecom/types";
import type { RawCanalRow } from "@/features/telecom/lib/queries";
import type {
  PeriodKPI,
  RowAnomaly,
  SubStatusRow,
  TopAccountRow,
} from "@/features/telecom/lib/period-queries";

export type AgentTeam =
  | "control"
  | "telecom"
  | "governance"
  | "output"
  | "interaction";

export type CapabilityArea =
  | "data"
  | "telecom"
  | "metric"
  | "duckdb"
  | "analysis"
  | "visualization"
  | "governance"
  | "output";

export type CapabilityRuntime =
  | "main"
  | "duckdb-worker"
  | "parser-worker"
  | "ml-worker"
  | "python-worker"
  | "local-llm";

export type ExecutionCost = "instant" | "fast" | "deep" | "forensic";

export type TaskStatus =
  | "idle"
  | "queued"
  | "running"
  | "done"
  | "error"
  | "blocked";

export type EvidenceSeverity = "info" | "positive" | "warning" | "critical";

export interface AgentCard {
  id: string;
  label: string;
  team: AgentTeam;
  capabilities: string[];
  inputTypes: string[];
  outputTypes: string[];
  cost: ExecutionCost;
  offline: boolean;
  confidence: number;
}

export interface Capability {
  id: string;
  label: string;
  area: CapabilityArea;
  requires: string[];
  produces: string[];
  runtime: CapabilityRuntime;
  cost: ExecutionCost;
  offline: boolean;
  cacheable: boolean;
  deterministic: boolean;
  approvalRequired: boolean;
}

export interface EvidenceGrade {
  data: number;
  method: number;
  claim: number;
  business: number;
}

export interface EvidenceValidatorResult {
  id: string;
  status: "passed" | "failed" | "warning";
  message: string;
}

export interface Evidence {
  id: string;
  taskId: string;
  capabilityId: string;
  type:
    | "fact"
    | "finding"
    | "chart"
    | "table"
    | "anomaly"
    | "recommendation"
    | "lineage";
  title: string;
  claim: string;
  grade: EvidenceGrade;
  severity: EvidenceSeverity;
  dataRef?: {
    table?: string;
    view?: string;
    filter?: string;
    rowLimit?: number;
  };
  sql?: string;
  chartSpec?: unknown;
  caveats: string[];
  validators: EvidenceValidatorResult[];
  relatedEvidenceIds: string[];
}

export interface TelecomMetric {
  id:
    | "transaction_count"
    | "success_count"
    | "failure_count"
    | "success_rate"
    | "failure_rate"
    | "total_amount"
    | "average_amount"
    | "unique_users";
  label: string;
  sqlExpression: string;
  denominator?: string;
  higherIsBetter: boolean;
}

export interface TelecomDimension {
  id:
    | "canal"
    | "status"
    | "sub_status"
    | "hour"
    | "user"
    | "account"
    | "service";
  label: string;
  column?: string;
  available: boolean;
}

export interface TelecomSemanticModel {
  table: string;
  grain: "transaction" | "daily_summary" | "unknown";
  columns: {
    transactionId?: string;
    time?: string;
    amount?: string;
    status?: string;
    subStatus?: string;
    canal?: string;
    user?: string;
    account?: string;
    service?: string;
  };
  statusRules: {
    successValues: string[];
    failureValues: string[];
    pendingValues: string[];
    ignoredValues: string[];
  };
  metrics: TelecomMetric[];
  dimensions: TelecomDimension[];
  mappingConfidence: number;
  caveats: string[];
}

export type InvestigationPhase =
  | "foundation"
  | "analysis"
  | "deep-dive"
  | "synthesis";

export interface InvestigationTask {
  id: string;
  title: string;
  description: string;
  agentId?: string;
  capabilityId: string;
  dependsOn: string[];
  priority: number;
  cacheKey: string;
  status: TaskStatus;
  canRunInParallel: boolean;
  phase?: InvestigationPhase;
  injectedAt?: number;
  injectionReason?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface InvestigationPlan {
  id: string;
  objective: string;
  mode:
    | "full_story"
    | "success_rate_drop"
    | "failure_root_cause"
    | "canal_compare"
    | "period_compare"
    | "anomaly_radar"
    | "user_concentration"
    | "data_quality_audit"
    | "executive_report";
  tasks: InvestigationTask[];
}

export interface DatasetLane {
  activeTable?: string;
  availableTables: string[];
  rowCount?: number;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  selectedFileName?: string;
}

export interface TelecomLane {
  mapping: ColumnMapping;
  statusMapping: StatusMapping[];
  semanticModel?: TelecomSemanticModel;
  mappingIssues: string[];
  kpi?: KPISummary;
  canals?: RawCanalRow[];
  statuses?: StatusRow[];
  dailyTrend?: DailyTrendRow[];
  periodCompare?: {
    current: PeriodKPI;
    baseline: PeriodKPI;
    currentWindow: { from: string; to: string };
    baselineWindow: { from: string; to: string };
  };
  subStatuses?: SubStatusRow[];
  anomalies?: RowAnomaly[];
  topAccounts?: TopAccountRow[];
}

export interface PlanExpansion {
  at: number;
  reason: string;
  addedTaskIds: string[];
}

export interface PlanLane {
  activePlan?: InvestigationPlan;
  activeTaskId?: string;
  running: boolean;
  startedAt?: number;
  finishedAt?: number;
  maxParallelTasks?: number;
  completedTaskIds: string[];
  blockedTaskIds: string[];
  errors: Array<{ taskId: string; message: string }>;
  expansions: PlanExpansion[];
}

export interface EvidenceLane {
  items: Evidence[];
  acceptedIds: string[];
  rejectedIds: string[];
}

export interface DecisionLane {
  headline?: string;
  findings: string[];
  actions: string[];
  caveats: string[];
  reportDraft?: {
    title: string;
    generatedAt: number;
    executiveSummary: string;
    keyFindings: string[];
    recommendedActions: string[];
    caveats: string[];
    evidenceIds: string[];
  };
}

export interface UiLane {
  selectedEvidenceId?: string;
  pinnedEvidenceIds: string[];
  mode: "instant" | "fast" | "deep" | "forensic";
}

export interface BlackboardState {
  dataset: DatasetLane;
  telecom: TelecomLane;
  plan: PlanLane;
  evidence: EvidenceLane;
  decisions: DecisionLane;
  ui: UiLane;
}

export interface BlackboardPatch {
  dataset?: Partial<DatasetLane>;
  telecom?: Partial<TelecomLane>;
  plan?: Partial<PlanLane>;
  evidence?: Partial<EvidenceLane>;
  decisions?: Partial<DecisionLane>;
  ui?: Partial<UiLane>;
}

export interface AgentMeshInput {
  objective: string;
  mode?: InvestigationPlan["mode"];
  preferredTable?: string;
  fileName?: string;
  mapping: ColumnMapping;
  statusMapping: StatusMapping[];
}

export interface CapabilityContext {
  input: AgentMeshInput;
  state: BlackboardState;
  signal?: AbortSignal;
}

export interface CapabilityResult {
  patch?: BlackboardPatch;
  evidence?: Evidence[];
  decisionPatch?: Partial<DecisionLane>;
}

export type CapabilityExecutor = (
  context: CapabilityContext,
  task: InvestigationTask,
) => Promise<CapabilityResult>;
