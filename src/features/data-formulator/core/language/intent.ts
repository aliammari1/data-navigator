"use client";

import { normalizeArabizi } from "./arabizi";
import { normalizeWithLexicon } from "./domain-lexicon";

export type ManagerIntent =
  | "ask"
  | "kpi"
  | "dashboard"
  | "investigate"
  | "signal"
  | "brief"
  | "scenario"
  | "setup";

export interface IntentProfile {
  intent: ManagerIntent;
  label: string;
  description: string;
}

const INTENT_LABELS: Record<ManagerIntent, Omit<IntentProfile, "intent">> = {
  ask: {
    label: "Ask",
    description: "Answer a business question with evidence.",
  },
  kpi: {
    label: "KPI",
    description: "Define or validate a custom metric.",
  },
  dashboard: {
    label: "Dashboard",
    description: "Create a focused AI dashboard.",
  },
  investigate: {
    label: "Investigate",
    description: "Explain why a metric changed.",
  },
  signal: {
    label: "Signals",
    description: "Find important changes and risks.",
  },
  brief: {
    label: "Brief",
    description: "Prepare an executive summary.",
  },
  scenario: {
    label: "Scenario",
    description: "Estimate a what-if impact.",
  },
  setup: {
    label: "Setup",
    description: "Fix AI/model readiness.",
  },
};

export const INTENT_PROFILES: IntentProfile[] = Object.entries(
  INTENT_LABELS,
).map(([intent, value]) => ({
  intent: intent as ManagerIntent,
  ...value,
}));

export function classifyManagerIntent(prompt: string): ManagerIntent {
  const text = prompt.toLowerCase();

  if (
    /\b(kpi|metric|measure|formula|success rate|taux|taux najah|نسبة|مؤشر)\b/.test(
      text,
    )
  ) {
    return "kpi";
  }

  if (/\b(dashboard|board|overview|vue|tableau|direction)\b/.test(text)) {
    return "dashboard";
  }

  if (
    /\b(why|root cause|explain|investigate|3lech|علاش|لماذا|cause|سبب)\b/.test(
      text,
    )
  ) {
    return "investigate";
  }

  if (
    /\b(anomaly|anomalies|signal|risk|alert|spike|drop|ta7|هبط|زاد)\b/.test(
      text,
    )
  ) {
    return "signal";
  }

  if (/\b(brief|summary|resume|résumé|dg|meeting|executive)\b/.test(text)) {
    return "brief";
  }

  if (/\b(if|what if|scenario|simulate|impact|suppose|ken|لو)\b/.test(text)) {
    return "scenario";
  }

  if (/\b(edge ai|model|setup|install|voice|tts|stt)\b/.test(text)) {
    return "setup";
  }

  return "ask";
}

export function getIntentProfile(intent: ManagerIntent): IntentProfile {
  const meta = INTENT_LABELS[intent];
  return { intent, ...meta };
}

export function normalizeTunisianPrompt(prompt: string): string {
  // Step 1: Normalize Arabizi words to English/French
  const arabiziResult = normalizeArabizi(prompt);
  let normalized = arabiziResult.normalized;

  // Step 2: Apply domain lexicon replacements
  normalized = normalizeWithLexicon(normalized);

  // Step 3: Remaining Tunisian colloquialisms
  normalized = normalized
    .replace(/\ba3melli\b/gi, "create")
    .replace(/\bchouf\b/gi, "show")
    .replace(/\b3lech\b/gi, "why")
    .replace(/\bta7\b/gi, "dropped")
    .replace(/\bflous\b/gi, "amount")
    .replace(/\bmtaa\b/gi, "of")
    .replace(/\bhedhi\b/gi, "this")
    .replace(/\bli fet(et)?\b/gi, "previous")
    .replace(/\bwarri\b/gi, "show")
    .replace(/\ba3tini\b/gi, "give me")
    .replace(/\bnhar\b/gi, "day")
    .replace(/\bsemaine\b/gi, "week")
    .replace(/\bmois\b/gi, "month")
    .trim();

  return normalized;
}

export interface NormalizationResult {
  original: string;
  normalized: string;
  detectedLanguage: "arabizi" | "french" | "english" | "arabic" | "mixed";
  confidence: "high" | "medium" | "low";
}
