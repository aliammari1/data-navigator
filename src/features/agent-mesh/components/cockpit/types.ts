import type {
  Evidence,
  InvestigationPlan,
  InvestigationTask,
} from "@/features/agent-mesh/core/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanMode = InvestigationPlan["mode"];
export type TaskStatus = InvestigationTask["status"];
export type EvidenceSeverity = Evidence["severity"];
export type EvidenceType = Evidence["type"];
export type RightTab = "summary" | "details" | "history";
export type MainTab = "findings" | "analysis" | "data" | "report";
export type EvidenceFilter = "all" | EvidenceType;
