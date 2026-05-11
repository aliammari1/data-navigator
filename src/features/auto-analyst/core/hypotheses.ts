"use client";
/**
 * Deterministic hypothesis generation. Surface ~6 investigable questions
 * for any dataset based on column shapes.
 */

import type { ColumnProfile, Hypothesis } from "./types";

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function generateHypotheses(profiles: ColumnProfile[]): Hypothesis[] {
  const num = profiles.filter((p) => p.semantic === "numeric");
  const cat = profiles.filter(
    (p) => p.semantic === "categorical" && p.cardinality <= 50,
  );
  const date = profiles.filter((p) => p.semantic === "datetime");

  const out: Hypothesis[] = [];

  // 1. Trend
  if (date[0] && num[0]) {
    out.push({
      id: genId(),
      question: `How has ${num[0].name} evolved over ${date[0].name}?`,
      rationale:
        "Combining a time column with a numeric metric is the foundation of any trend analysis.",
      priority: "high",
      parents: [date[0].name, num[0].name],
    });
  }

  // 2. Group differences
  if (cat[0] && num[0]) {
    out.push({
      id: genId(),
      question: `Does ${num[0].name} differ significantly across ${cat[0].name}?`,
      rationale:
        "Compare group means to surface which categories drive the metric — t-test / ANOVA territory.",
      priority: "high",
      parents: [cat[0].name, num[0].name],
    });
  }

  // 3. Pair correlation
  if (num.length >= 2) {
    out.push({
      id: genId(),
      question: `Is there a correlation between ${num[0].name} and ${num[1].name}?`,
      rationale:
        "Pearson + Spearman tests will reveal linear / monotonic links.",
      priority: "medium",
      parents: [num[0].name, num[1].name],
    });
  }

  // 4. Top contributors
  if (cat[0] && num[0]) {
    out.push({
      id: genId(),
      question: `Which ${cat[0].name} contribute most to ${num[0].name}?`,
      rationale: "Pareto / contribution analysis often reveals 80/20 shapes.",
      priority: "medium",
      parents: [cat[0].name, num[0].name],
    });
  }

  // 5. Anomaly investigation
  const skewed = num.find(
    (p) =>
      p.median !== undefined &&
      p.avg !== undefined &&
      Math.abs(p.avg - p.median) > p.median * 0.3,
  );
  if (skewed) {
    out.push({
      id: genId(),
      question: `Why is ${skewed.name} so skewed (mean ≠ median)?`,
      rationale:
        "Heavy skew often hides outliers, mixed populations, or capped readings.",
      priority: "high",
      parents: [skewed.name],
    });
  }

  // 6. Missingness
  const high = profiles.find((p) => p.nullRate > 0.1);
  if (high) {
    out.push({
      id: genId(),
      question: `What's missing in ${high.name}? Is it MAR / MCAR / MNAR?`,
      rationale: `${(high.nullRate * 100).toFixed(0)}% of rows have a NULL — pattern matters.`,
      priority: "low",
      parents: [high.name],
    });
  }

  // 7. High cardinality category
  const sprawl = profiles.find(
    (p) => p.semantic === "categorical" && p.cardinality > 100,
  );
  if (sprawl) {
    out.push({
      id: genId(),
      question: `Should ${sprawl.name} be grouped or normalised?`,
      rationale: `${sprawl.cardinality} distinct values — likely contains typos or sub-categories.`,
      priority: "low",
      parents: [sprawl.name],
    });
  }

  return out.slice(0, 8);
}
