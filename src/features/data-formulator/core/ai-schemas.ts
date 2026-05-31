"use client";

/**
 * AI Schemas — Structured output contracts for edge AI JSON generation.
 * Every schema is a Zod-like plain object included in the local model prompt.
 */

// ─── Manager Intent ───────────────────────────────────────────────────────────

export interface ManagerIntentSchema {
  intent:
    | "ask"
    | "kpi"
    | "dashboard"
    | "investigate"
    | "signal"
    | "brief"
    | "scenario"
    | "setup"
    | "clarify";
  normalizedPrompt: string;
  language: "auto" | "tounsi" | "fr" | "en" | "ar";
  confidence: "high" | "medium" | "low";
}

export const ManagerIntentJsonSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "ask",
        "kpi",
        "dashboard",
        "investigate",
        "signal",
        "brief",
        "scenario",
        "setup",
        "clarify",
      ],
    },
    normalizedPrompt: { type: "string" },
    language: { type: "string", enum: ["auto", "tounsi", "fr", "en", "ar"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["intent", "normalizedPrompt", "language", "confidence"],
} as const;

// ─── Clarification Question ───────────────────────────────────────────────────

export interface ClarificationQuestionSchema {
  needsClarification: boolean;
  question: string;
  suggestedAnswers: string[];
  missingInfo: string[];
}

export const ClarificationQuestionJsonSchema = {
  type: "object",
  properties: {
    needsClarification: { type: "boolean" },
    question: { type: "string" },
    suggestedAnswers: { type: "array", items: { type: "string" } },
    missingInfo: { type: "array", items: { type: "string" } },
  },
  required: [
    "needsClarification",
    "question",
    "suggestedAnswers",
    "missingInfo",
  ],
} as const;

// ─── KPI Draft ──────────────────────────────────────────────────────────────────

export interface KpiDraftSchema {
  name: string;
  goal: string;
  numerator: string;
  denominator: string;
  exclusions: string[];
  timeGrain: "hour" | "day" | "week" | "month" | "custom";
  segments: string[];
  owner: string;
  reviewStatus: "draft" | "pending" | "approved" | "rejected";
  sql: string;
  confidence: "high" | "medium" | "low";
  assumptions: string[];
  edgeCases: string[];
}

export const KpiDraftJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    goal: { type: "string" },
    numerator: { type: "string" },
    denominator: { type: "string" },
    exclusions: { type: "array", items: { type: "string" } },
    timeGrain: {
      type: "string",
      enum: ["hour", "day", "week", "month", "custom"],
    },
    segments: { type: "array", items: { type: "string" } },
    owner: { type: "string" },
    reviewStatus: {
      type: "string",
      enum: ["draft", "pending", "approved", "rejected"],
    },
    sql: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    assumptions: { type: "array", items: { type: "string" } },
    edgeCases: { type: "array", items: { type: "string" } },
  },
  required: [
    "name",
    "goal",
    "numerator",
    "denominator",
    "timeGrain",
    "sql",
    "confidence",
    "assumptions",
  ],
} as const;

// ─── Dashboard Plan ─────────────────────────────────────────────────────────────

export interface DashboardPlanSchema {
  title: string;
  description: string;
  widgets: Array<{
    type: "chart" | "kpi" | "table" | "text" | "filter";
    title: string;
    chartType?: "bar" | "line" | "area" | "scatter" | "pie" | "table";
    encodings: Record<string, string>;
    filters: Array<{ field: string; op: string; value: string }>;
    sql?: string;
  }>;
  layout: "bento" | "grid" | "free";
  globalFilters: Array<{ field: string; op: string; value: string }>;
}

export const DashboardPlanJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    widgets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["chart", "kpi", "table", "text", "filter"],
          },
          title: { type: "string" },
          chartType: {
            type: "string",
            enum: ["bar", "line", "area", "scatter", "pie", "table"],
          },
          encodings: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          filters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                op: { type: "string" },
                value: { type: "string" },
              },
              required: ["field", "op", "value"],
            },
          },
          sql: { type: "string" },
        },
        required: ["type", "title"],
      },
    },
    layout: { type: "string", enum: ["bento", "grid", "free"] },
    globalFilters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          op: { type: "string" },
          value: { type: "string" },
        },
        required: ["field", "op", "value"],
      },
    },
  },
  required: ["title", "description", "widgets", "layout"],
} as const;

// ─── Investigation Plan ───────────────────────────────────────────────────────

export interface InvestigationPlanSchema {
  targetMetric: string;
  currentPeriod: { start: string; end: string };
  baselinePeriod: { start: string; end: string };
  segmentationSteps: Array<{
    dimension: string;
    reason: string;
    sql: string;
  }>;
  hypothesis: string;
  confidence: "high" | "medium" | "low";
}

export const InvestigationPlanJsonSchema = {
  type: "object",
  properties: {
    targetMetric: { type: "string" },
    currentPeriod: {
      type: "object",
      properties: {
        start: { type: "string" },
        end: { type: "string" },
      },
      required: ["start", "end"],
    },
    baselinePeriod: {
      type: "object",
      properties: {
        start: { type: "string" },
        end: { type: "string" },
      },
      required: ["start", "end"],
    },
    segmentationSteps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          reason: { type: "string" },
          sql: { type: "string" },
        },
        required: ["dimension", "reason", "sql"],
      },
    },
    hypothesis: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: [
    "targetMetric",
    "currentPeriod",
    "baselinePeriod",
    "segmentationSteps",
    "hypothesis",
    "confidence",
  ],
} as const;

// ─── Signal Scan ────────────────────────────────────────────────────────────────

export interface SignalScanSchema {
  signals: Array<{
    severity: "high" | "medium" | "low";
    metric: string;
    whatChanged: string;
    likelyReason: string;
    evidence: string;
    suggestedAction: string;
    sql: string;
  }>;
  overallConfidence: "high" | "medium" | "low";
}

export const SignalScanJsonSchema = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["high", "medium", "low"] },
          metric: { type: "string" },
          whatChanged: { type: "string" },
          likelyReason: { type: "string" },
          evidence: { type: "string" },
          suggestedAction: { type: "string" },
          sql: { type: "string" },
        },
        required: [
          "severity",
          "metric",
          "whatChanged",
          "likelyReason",
          "evidence",
          "suggestedAction",
          "sql",
        ],
      },
    },
    overallConfidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["signals", "overallConfidence"],
} as const;

// ─── Tool Call ──────────────────────────────────────────────────────────────────

export interface ToolCallSchema {
  tool: string;
  arguments: Record<string, unknown>;
  reasoning: string;
}

export const ToolCallJsonSchema = {
  type: "object",
  properties: {
    tool: { type: "string" },
    arguments: { type: "object" },
    reasoning: { type: "string" },
  },
  required: ["tool", "arguments", "reasoning"],
} as const;

// ─── Manager Answer ─────────────────────────────────────────────────────────────

export interface ManagerAnswerSchema {
  title: string;
  summary: string;
  decision?: string;
  impact?: string;
  nextAction?: string;
  assumptions: string[];
  evidence: string[];
  followUps: string[];
  confidence: "high" | "medium" | "low";
  language: "auto" | "tounsi" | "fr" | "en" | "ar";
  needsReview: boolean;
  traceVisible: boolean;
}

export const ManagerAnswerJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    decision: { type: "string" },
    impact: { type: "string" },
    nextAction: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    followUps: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    language: { type: "string", enum: ["auto", "tounsi", "fr", "en", "ar"] },
    needsReview: { type: "boolean" },
    traceVisible: { type: "boolean" },
  },
  required: [
    "title",
    "summary",
    "assumptions",
    "evidence",
    "followUps",
    "confidence",
    "language",
  ],
} as const;

// ─── Scenario Simulator ───────────────────────────────────────────────────────

export interface ScenarioSchema {
  name: string;
  assumptions: Array<{ variable: string; change: string; value: number }>;
  baseCaseSql: string;
  scenarioSql: string;
  estimatedImpact: {
    metric: string;
    baseValue: number;
    scenarioValue: number;
    delta: number;
    deltaPercent: number;
  };
  confidence: "high" | "medium" | "low";
  caveats: string[];
}

export const ScenarioJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    assumptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          variable: { type: "string" },
          change: { type: "string" },
          value: { type: "number" },
        },
        required: ["variable", "change", "value"],
      },
    },
    baseCaseSql: { type: "string" },
    scenarioSql: { type: "string" },
    estimatedImpact: {
      type: "object",
      properties: {
        metric: { type: "string" },
        baseValue: { type: "number" },
        scenarioValue: { type: "number" },
        delta: { type: "number" },
        deltaPercent: { type: "number" },
      },
      required: [
        "metric",
        "baseValue",
        "scenarioValue",
        "delta",
        "deltaPercent",
      ],
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    caveats: { type: "array", items: { type: "string" } },
  },
  required: [
    "name",
    "assumptions",
    "baseCaseSql",
    "scenarioSql",
    "estimatedImpact",
    "confidence",
  ],
} as const;

// ─── Executive Brief ────────────────────────────────────────────────────────────

export interface BriefSchema {
  title: string;
  audience: string;
  durationSeconds: number;
  keyPoints: string[];
  recommendations: string[];
  risks: string[];
  nextSteps: string[];
  tone: "formal" | "casual" | "technical";
}

export const BriefJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    audience: { type: "string" },
    durationSeconds: { type: "number" },
    keyPoints: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } },
    tone: { type: "string", enum: ["formal", "casual", "technical"] },
  },
  required: [
    "title",
    "audience",
    "durationSeconds",
    "keyPoints",
    "recommendations",
    "nextSteps",
  ],
} as const;

// ─── Schema Validation Helpers ──────────────────────────────────────────────────

export function validateSchema<T>(
  value: unknown,
  required: string[],
): { valid: true; data: T } | { valid: false; error: string } {
  if (!value || typeof value !== "object") {
    return { valid: false, error: `Expected object, got ${typeof value}` };
  }
  const obj = value as Record<string, unknown>;
  for (const key of required) {
    if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
      return { valid: false, error: `Missing required field: ${key}` };
    }
  }
  return { valid: true, data: value as T };
}
