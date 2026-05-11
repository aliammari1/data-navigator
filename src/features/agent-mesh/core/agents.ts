"use client";

import type { AgentCard } from "./types";

export const AGENT_CARDS: AgentCard[] = [
  {
    id: "chief-orchestrator",
    label: "Chief Orchestrator",
    team: "control",
    capabilities: [
      "plan.fullStory",
      "route.capabilities",
      "decide.evidenceSufficiency",
    ],
    inputTypes: ["AgentMeshInput", "BlackboardState"],
    outputTypes: ["InvestigationPlan"],
    cost: "instant",
    offline: true,
    confidence: 0.9,
  },
  {
    id: "telecom-domain-agent",
    label: "Telecom Domain Agent",
    team: "telecom",
    capabilities: [
      "telecom.validateMapping",
      "telecom.defineMetrics",
      "telecom.overviewKpis",
      "telecom.successRateTrend",
      "telecom.periodCompare",
      "telecom.canalCompare",
      "telecom.failureByStatus",
      "telecom.failureBySubStatus",
      "telecom.anomalyRadar",
      "telecom.userConcentration",
    ],
    inputTypes: ["ColumnMapping", "TableInfo"],
    outputTypes: ["TelecomSemanticModel", "Evidence"],
    cost: "fast",
    offline: true,
    confidence: 0.86,
  },
  {
    id: "evidence-auditor",
    label: "Evidence Auditor",
    team: "governance",
    capabilities: ["evidence.validate", "decision.acceptEvidence"],
    inputTypes: ["Evidence"],
    outputTypes: ["EvidenceValidatorResult", "DecisionLane"],
    cost: "instant",
    offline: true,
    confidence: 0.84,
  },
  {
    id: "report-agent",
    label: "Report Agent",
    team: "output",
    capabilities: ["report.briefFromEvidence", "report.nextActions"],
    inputTypes: ["EvidenceLane", "TelecomSemanticModel"],
    outputTypes: ["DecisionLane"],
    cost: "fast",
    offline: true,
    confidence: 0.78,
  },
  {
    id: "interaction-agent",
    label: "Interaction Agent",
    team: "interaction",
    capabilities: ["ui.drilldown", "ui.pinEvidence", "ui.rerunTask"],
    inputTypes: ["UiLane", "Evidence"],
    outputTypes: ["UiLane", "InvestigationPlan"],
    cost: "instant",
    offline: true,
    confidence: 0.76,
  },
];

export function findAgentForCapability(capabilityId: string): AgentCard | null {
  return (
    AGENT_CARDS.find((agent) =>
      agent.capabilities.some(
        (capability) =>
          capabilityId === capability ||
          capabilityId.startsWith(`${capability}.`),
      ),
    ) ?? null
  );
}
