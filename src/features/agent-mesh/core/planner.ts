"use client";

import { findAgentForCapability } from "./agents";
import type {
  AgentMeshInput,
  BlackboardState,
  InvestigationPhase,
  InvestigationPlan,
  InvestigationTask,
} from "./types";

function task(
  id: string,
  title: string,
  description: string,
  capabilityId: string,
  dependsOn: string[] = [],
  priority = 1,
  phase: InvestigationPhase = "analysis",
): InvestigationTask {
  const agent = findAgentForCapability(capabilityId);
  return {
    id,
    title,
    description,
    capabilityId,
    agentId: agent?.id,
    dependsOn,
    priority,
    cacheKey: `${capabilityId}:${dependsOn.join(",") || "root"}`,
    status: "idle",
    canRunInParallel: dependsOn.length > 0,
    phase,
  };
}

// ─── Shared foundation tasks ──────────────────────────────────────────────────

function foundationTasks(): InvestigationTask[] {
  return [
    task(
      "identify-table",
      "Identify active telecom table",
      "Find the best DuckDB table for telecom analysis.",
      "telecom.identifyTable",
      [],
      1,
      "foundation",
    ),
    task(
      "validate-mapping",
      "Validate telecom mapping",
      "Check mapped telecom columns against the active table.",
      "telecom.validateMapping",
      ["identify-table"],
      2,
      "foundation",
    ),
    task(
      "semantic-model",
      "Build telecom semantic model",
      "Create metrics, dimensions, status rules, and mapping caveats.",
      "telecom.buildSemanticModel",
      ["validate-mapping"],
      3,
      "foundation",
    ),
  ];
}

function acceptTask(dependsOn: string[], priority: number): InvestigationTask {
  return task(
    "accept-evidence",
    "Validate evidence",
    "Run mechanical validators and accept evidence that has enough support.",
    "evidence.validate",
    dependsOn,
    priority,
    "synthesis",
  );
}

function briefTask(priority: number): InvestigationTask {
  return task(
    "analyst-brief",
    "Draft analyst brief",
    "Turn accepted telecom evidence into the first brief and next actions.",
    "report.briefFromEvidence",
    ["accept-evidence"],
    priority,
    "synthesis",
  );
}

// ─── Plan modes ───────────────────────────────────────────────────────────────

export function createTelecomFullStoryPlan(
  input: AgentMeshInput,
): InvestigationPlan {
  const tablePart = input.preferredTable ? ` for ${input.preferredTable}` : "";
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    objective:
      input.objective?.trim() || `Give me the full telecom story${tablePart}.`,
    mode: "full_story",
    tasks: [
      ...foundationTasks(),
      task(
        "overview-kpis",
        "Compute overview KPIs",
        "Compute transaction count, success rate, failures, amount, and customer coverage.",
        "telecom.overviewKpis",
        ["semantic-model"],
        4,
      ),
      task(
        "success-trend",
        "Analyze success-rate trend",
        "Build a daily trend and identify the direction of transaction health.",
        "telecom.successRateTrend",
        ["overview-kpis"],
        5,
      ),
      task(
        "period-compare",
        "Compare latest period to baseline",
        "Compare the latest day with the prior day using canonical telecom KPIs.",
        "telecom.periodCompare",
        ["success-trend"],
        6,
      ),
      task(
        "canal-compare",
        "Compare canals",
        "Rank canals by volume, success rate, and operational risk.",
        "telecom.canalCompare",
        ["overview-kpis"],
        7,
      ),
      task(
        "failure-status",
        "Break down failure/status mix",
        "Summarize normalized status mix and identify the largest non-success bucket.",
        "telecom.failureByStatus",
        ["overview-kpis"],
        8,
      ),
      task(
        "failure-substatus",
        "Break down sub-status failures",
        "Rank raw sub-status/error signals that explain failures.",
        "telecom.failureBySubStatus",
        ["success-trend"],
        9,
      ),
      task(
        "anomaly-radar",
        "Run anomaly radar",
        "Scan canal-hour cells for success-rate drops and volume spikes.",
        "telecom.anomalyRadar",
        ["success-trend"],
        10,
      ),
      task(
        "user-concentration",
        "Find user concentration risk",
        "Rank top customers/accounts by amount and volume concentration.",
        "telecom.userConcentration",
        ["success-trend"],
        11,
      ),
      acceptTask(
        [
          "period-compare",
          "canal-compare",
          "failure-status",
          "failure-substatus",
          "anomaly-radar",
          "user-concentration",
        ],
        12,
      ),
      briefTask(13),
    ],
  };
}

export function createSuccessRateDropPlan(
  input: AgentMeshInput,
): InvestigationPlan {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    objective: input.objective?.trim() || "Why did the success rate drop?",
    mode: "success_rate_drop",
    tasks: [
      ...foundationTasks(),
      task(
        "overview-kpis",
        "Compute overview KPIs",
        "Baseline KPIs before diagnosing the drop.",
        "telecom.overviewKpis",
        ["semantic-model"],
        4,
      ),
      task(
        "success-trend",
        "Analyze success-rate trend",
        "Identify when the drop started and how steep it is.",
        "telecom.successRateTrend",
        ["overview-kpis"],
        5,
      ),
      task(
        "period-compare",
        "Compare latest period to baseline",
        "Quantify the magnitude of the drop vs prior day.",
        "telecom.periodCompare",
        ["success-trend"],
        6,
      ),
      task(
        "failure-status",
        "Break down status mix",
        "Identify which status bucket grew the most during the drop.",
        "telecom.failureByStatus",
        ["overview-kpis"],
        7,
      ),
      task(
        "failure-substatus",
        "Rank sub-status failure codes",
        "Find the specific error codes driving the failure spike.",
        "telecom.failureBySubStatus",
        ["success-trend"],
        8,
      ),
      task(
        "anomaly-radar",
        "Scan for canal-hour anomalies",
        "Locate the canal and time window where the drop is concentrated.",
        "telecom.anomalyRadar",
        ["success-trend"],
        9,
      ),
      acceptTask(
        [
          "period-compare",
          "failure-status",
          "failure-substatus",
          "anomaly-radar",
        ],
        10,
      ),
      briefTask(11),
    ],
  };
}

export function createFailureRootCausePlan(
  input: AgentMeshInput,
): InvestigationPlan {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    objective:
      input.objective?.trim() || "What is driving our transaction failures?",
    mode: "failure_root_cause",
    tasks: [
      ...foundationTasks(),
      task(
        "overview-kpis",
        "Compute overview KPIs",
        "Baseline metrics for failure root-cause context.",
        "telecom.overviewKpis",
        ["semantic-model"],
        4,
      ),
      task(
        "failure-status",
        "Break down status mix",
        "Find the dominant failure category.",
        "telecom.failureByStatus",
        ["overview-kpis"],
        5,
      ),
      task(
        "failure-substatus",
        "Rank sub-status failure codes",
        "Decompose failures into specific error codes and sub-statuses.",
        "telecom.failureBySubStatus",
        ["overview-kpis"],
        6,
      ),
      task(
        "canal-compare",
        "Compare canals by failure rate",
        "Find which canal has the worst failure rate.",
        "telecom.canalCompare",
        ["overview-kpis"],
        7,
      ),
      task(
        "success-trend",
        "Trend to establish failure onset",
        "Understand when failures started to grow.",
        "telecom.successRateTrend",
        ["overview-kpis"],
        8,
      ),
      task(
        "anomaly-radar",
        "Isolate failure hot-spots",
        "Find canal-hour hot-spots with concentrated failures.",
        "telecom.anomalyRadar",
        ["success-trend"],
        9,
      ),
      acceptTask(
        [
          "failure-status",
          "failure-substatus",
          "canal-compare",
          "anomaly-radar",
        ],
        10,
      ),
      briefTask(11),
    ],
  };
}

export function createCanalComparePlan(
  input: AgentMeshInput,
): InvestigationPlan {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    objective: input.objective?.trim() || "Compare all canals in detail.",
    mode: "canal_compare",
    tasks: [
      ...foundationTasks(),
      task(
        "overview-kpis",
        "Compute overview KPIs",
        "Get the denominator for canal share calculations.",
        "telecom.overviewKpis",
        ["semantic-model"],
        4,
      ),
      task(
        "canal-compare",
        "Rank and compare canals",
        "Full canal ranking by volume, success rate, amount, and risk.",
        "telecom.canalCompare",
        ["overview-kpis"],
        5,
      ),
      task(
        "failure-status",
        "Status mix per overall dataset",
        "Cross-reference canal ranking with failure status distribution.",
        "telecom.failureByStatus",
        ["overview-kpis"],
        6,
      ),
      task(
        "anomaly-radar",
        "Detect canal anomalies",
        "Surface canal-hour cells with abnormal behaviour.",
        "telecom.anomalyRadar",
        ["overview-kpis"],
        7,
      ),
      task(
        "hourly-pattern",
        "Canal hourly patterns",
        "Show traffic distribution by hour to support canal timing decisions.",
        "telecom.hourlyPattern",
        ["overview-kpis"],
        8,
      ),
      acceptTask(
        ["canal-compare", "failure-status", "anomaly-radar", "hourly-pattern"],
        9,
      ),
      briefTask(10),
    ],
  };
}

export function createPeriodComparePlan(
  input: AgentMeshInput,
): InvestigationPlan {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    objective:
      input.objective?.trim() ||
      "Compare the latest period to the prior period.",
    mode: "period_compare",
    tasks: [
      ...foundationTasks(),
      task(
        "overview-kpis",
        "Compute overview KPIs",
        "Establish baseline numbers for comparison.",
        "telecom.overviewKpis",
        ["semantic-model"],
        4,
      ),
      task(
        "success-trend",
        "Build daily trend",
        "Identify trend direction before period comparison.",
        "telecom.successRateTrend",
        ["overview-kpis"],
        5,
      ),
      task(
        "period-compare",
        "Compare latest vs baseline period",
        "Head-to-head comparison of current day vs prior day across all KPIs.",
        "telecom.periodCompare",
        ["success-trend"],
        6,
      ),
      task(
        "canal-compare",
        "Canal share in each period",
        "Check if canal mix shifted between periods.",
        "telecom.canalCompare",
        ["overview-kpis"],
        7,
      ),
      acceptTask(["period-compare", "canal-compare"], 8),
      briefTask(9),
    ],
  };
}

export function createAnomalyRadarPlan(
  input: AgentMeshInput,
): InvestigationPlan {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    objective:
      input.objective?.trim() || "Find all anomalies in this telecom dataset.",
    mode: "anomaly_radar",
    tasks: [
      ...foundationTasks(),
      task(
        "overview-kpis",
        "Compute overview KPIs",
        "Baseline context before anomaly scan.",
        "telecom.overviewKpis",
        ["semantic-model"],
        4,
      ),
      task(
        "success-trend",
        "Build daily trend",
        "Trend history needed to establish baselines for anomaly detection.",
        "telecom.successRateTrend",
        ["overview-kpis"],
        5,
      ),
      task(
        "anomaly-radar",
        "Run full anomaly radar",
        "Scan every canal-hour cell for z-score outliers.",
        "telecom.anomalyRadar",
        ["success-trend"],
        6,
      ),
      task(
        "hourly-pattern",
        "Hourly volume pattern",
        "Show normal hourly distribution to contextualise anomalies.",
        "telecom.hourlyPattern",
        ["overview-kpis"],
        7,
      ),
      acceptTask(["anomaly-radar", "hourly-pattern"], 8),
      briefTask(9),
    ],
  };
}

export function createUserConcentrationPlan(
  input: AgentMeshInput,
): InvestigationPlan {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    objective:
      input.objective?.trim() || "Who are the most impactful accounts?",
    mode: "user_concentration",
    tasks: [
      ...foundationTasks(),
      task(
        "overview-kpis",
        "Compute overview KPIs",
        "Total amount denominator for concentration shares.",
        "telecom.overviewKpis",
        ["semantic-model"],
        4,
      ),
      task(
        "success-trend",
        "Build daily trend",
        "Date window needed for account-level queries.",
        "telecom.successRateTrend",
        ["overview-kpis"],
        5,
      ),
      task(
        "user-concentration",
        "Rank user/account concentration",
        "Top 15 accounts by amount and volume, with concentration risk.",
        "telecom.userConcentration",
        ["success-trend"],
        6,
      ),
      task(
        "amount-band",
        "Amount band distribution",
        "Show how transactions are distributed across amount tiers.",
        "telecom.amountBandAnalysis",
        ["overview-kpis"],
        7,
      ),
      acceptTask(["user-concentration", "amount-band"], 8),
      briefTask(9),
    ],
  };
}

export function createDataQualityAuditPlan(
  input: AgentMeshInput,
): InvestigationPlan {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    objective:
      input.objective?.trim() || "Audit the data quality of this telecom file.",
    mode: "data_quality_audit",
    tasks: [
      ...foundationTasks(),
      task(
        "data-quality",
        "Profile data quality",
        "Check null rates, date parsing, amount validity, and mapping coverage.",
        "telecom.dataQualityProfile",
        ["semantic-model"],
        4,
      ),
      task(
        "overview-kpis",
        "Compute overview KPIs",
        "Confirm metrics are computable after quality check.",
        "telecom.overviewKpis",
        ["data-quality"],
        5,
      ),
      task(
        "failure-substatus",
        "Check error code distribution",
        "Inspect raw status codes for unexpected or unmapped values.",
        "telecom.failureBySubStatus",
        ["overview-kpis"],
        6,
      ),
      acceptTask(["data-quality", "failure-substatus"], 7),
      briefTask(8),
    ],
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createInvestigationPlan(
  input: AgentMeshInput,
): InvestigationPlan {
  switch (input.mode ?? "full_story") {
    case "success_rate_drop":
      return createSuccessRateDropPlan(input);
    case "failure_root_cause":
      return createFailureRootCausePlan(input);
    case "canal_compare":
      return createCanalComparePlan(input);
    case "period_compare":
      return createPeriodComparePlan(input);
    case "anomaly_radar":
      return createAnomalyRadarPlan(input);
    case "user_concentration":
      return createUserConcentrationPlan(input);
    case "data_quality_audit":
      return createDataQualityAuditPlan(input);
    case "full_story":
    default:
      return createTelecomFullStoryPlan(input);
  }
}

// ─── Dynamic plan expansion ───────────────────────────────────────────────────

export function expandPlanDynamically(
  state: BlackboardState,
  existingIds: Set<string>,
  trigger: string,
): { tasks: InvestigationTask[]; reasons: string[] } {
  const newTasks: InvestigationTask[] = [];
  const reasons: string[] = [];
  let nextPriority = 50;

  const kpi = state.telecom.kpi;
  const anomalies = state.telecom.anomalies ?? [];
  const canals = state.telecom.canals ?? [];

  function inject(
    id: string,
    title: string,
    description: string,
    capabilityId: string,
    dependsOn: string[],
    reason: string,
  ) {
    if (existingIds.has(id)) return;
    const t: InvestigationTask = {
      ...task(
        id,
        title,
        description,
        capabilityId,
        dependsOn,
        nextPriority++,
        "deep-dive",
      ),
      injectedAt: Date.now(),
      injectionReason: reason,
    };
    newTasks.push(t);
    reasons.push(reason);
  }

  // ── Trigger: overview KPIs just finished ────────────────────────────────────
  if (trigger === "overview-kpis" && kpi) {
    // Poor success rate → drill into failure codes
    if (kpi.successRate < 90 && !existingIds.has("failure-substatus")) {
      inject(
        "failure-substatus-deep",
        "Investigate failure codes",
        "Drill into raw error codes driving the low success rate.",
        "telecom.failureBySubStatus",
        ["overview-kpis"],
        `Success rate ${kpi.successRate.toFixed(1)}% — investigating failure signals`,
      );
    }

    // Multiple canals not yet compared
    if (canals.length > 1 && !existingIds.has("canal-compare")) {
      inject(
        "canal-compare-deep",
        "Compare channel performance",
        "Rank all channels by volume and success rate.",
        "telecom.canalCompare",
        ["overview-kpis"],
        `${canals.length} channels detected — comparing performance`,
      );
    }

    // Large dataset → worth analyzing amount distribution
    if (kpi.totalTransactions > 5000 && !existingIds.has("amount-band")) {
      inject(
        "amount-band-deep",
        "Analyze transaction amounts",
        "Distribution of transactions across amount bands.",
        "telecom.amountBandAnalysis",
        ["overview-kpis"],
        `${kpi.totalTransactions.toLocaleString()} transactions — analyzing amount distribution`,
      );
    }
  }

  // ── Trigger: anomaly radar just finished ────────────────────────────────────
  if (trigger === "anomaly-radar") {
    if (anomalies.length > 2 && !existingIds.has("hourly-pattern")) {
      inject(
        "hourly-pattern-deep",
        "Map hourly traffic patterns",
        "Show normal hourly distribution to contextualise the anomalies.",
        "telecom.hourlyPattern",
        ["overview-kpis"],
        `${anomalies.length} anomalies detected — mapping hourly baseline`,
      );
    }

    const criticalCount = anomalies.filter((a) => a.successRate < 50).length;
    if (criticalCount > 0 && !existingIds.has("user-concentration")) {
      inject(
        "user-concentration-deep",
        "Find accounts at risk",
        "Identify which accounts are most exposed to the critical anomalies.",
        "telecom.userConcentration",
        existingIds.has("success-trend")
          ? ["success-trend"]
          : ["overview-kpis"],
        `${criticalCount} critical anomaly cell${criticalCount > 1 ? "s" : ""} — identifying affected accounts`,
      );
    }
  }

  return { tasks: newTasks, reasons };
}
