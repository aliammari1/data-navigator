"use client";
/**
 * 0-100 quality scorecard derived from column profiles.
 */

import type { ColumnProfile, QualityAxis, QualityReport } from "./types";

export function scoreQuality(profiles: ColumnProfile[]): QualityReport {
  if (!profiles.length) {
    return {
      score: 0,
      axes: [],
      recommendations: [],
    };
  }

  // Completeness — average of (1 - nullRate) across columns, weighted slightly toward
  // numeric/categorical (id and text are less critical).
  const weight = (s: ColumnProfile["semantic"]): number =>
    s === "id" || s === "text" ? 0.5 : 1;
  const totalW = profiles.reduce((a, p) => a + weight(p.semantic), 0);
  const completenessRaw =
    profiles.reduce((a, p) => a + weight(p.semantic) * (1 - p.nullRate), 0) /
    Math.max(1, totalW);
  const completeness = Math.round(completenessRaw * 100);

  const completenessIssues = profiles
    .filter((p) => p.nullRate > 0.1)
    .sort((a, b) => b.nullRate - a.nullRate)
    .slice(0, 5)
    .map((p) => `${p.name} is ${(p.nullRate * 100).toFixed(0)}% null`);

  // Uniqueness — penalises columns that look like ids but have duplicates;
  // rewards datasets where ids actually identify rows.
  const idLike = profiles.filter((p) => p.semantic === "id");
  const uniqueness = idLike.length
    ? Math.round(
        (idLike.reduce(
          (a, p) =>
            a + p.cardinality / Math.max(1, p.rowCount * (1 - p.nullRate)),
          0,
        ) /
          idLike.length) *
          100,
      )
    : 80; // unknown → mid-high default

  const uniquenessIssues = idLike
    .filter((p) => p.cardinality < p.rowCount * (1 - p.nullRate))
    .map(
      (p) =>
        `${p.name} expected unique but has ${(p.rowCount * (1 - p.nullRate) - p.cardinality).toFixed(0)} duplicates`,
    );

  // Validity — placeholder rule: penalise numeric columns whose stddev is 0
  // (suggests stuck values) or ranges that look impossible for the dtype.
  const numericProfiles = profiles.filter((p) => p.semantic === "numeric");
  const validityViolations = numericProfiles.filter(
    (p) => p.stddev === 0 && p.cardinality > 1,
  );
  const validity = Math.round(
    Math.max(
      0,
      100 -
        (validityViolations.length / Math.max(1, numericProfiles.length)) * 100,
    ),
  );
  const validityIssues = validityViolations.map(
    (p) => `${p.name} has zero variance — possibly stuck value`,
  );

  // Consistency — heuristic, low-cardinality categorical columns with fewer
  // than 10 distinct values that look "clean" → +; high cardinality
  // categoricals → −.
  const cat = profiles.filter((p) => p.semantic === "categorical");
  const consistency = cat.length
    ? Math.round(
        100 -
          (cat.filter((p) => p.cardinality > p.rowCount * 0.3).length /
            cat.length) *
            100,
      )
    : 75;
  const consistencyIssues = cat
    .filter((p) => p.cardinality > p.rowCount * 0.3)
    .slice(0, 5)
    .map(
      (p) =>
        `${p.name} has unusually high cardinality (${p.cardinality}); may need standardisation`,
    );

  // Freshness — if any datetime column has a max < 30 days from now, score is high.
  const now = Date.now();
  const dateProfiles = profiles.filter(
    (p) => p.semantic === "datetime" && typeof p.max === "string",
  );
  const freshness = dateProfiles.length
    ? Math.round(
        (dateProfiles.reduce((a, p) => {
          const t = Date.parse(p.max as string);
          if (!Number.isFinite(t)) return a;
          const days = (now - t) / 86_400_000;
          return a + Math.max(0, 1 - days / 365);
        }, 0) /
          dateProfiles.length) *
          100,
      )
    : 70;

  const freshnessIssues = dateProfiles
    .filter((p) => {
      const t = Date.parse(p.max as string);
      return Number.isFinite(t) && (now - t) / 86_400_000 > 90;
    })
    .map(
      (p) =>
        `${p.name} latest value is ${Math.round((now - Date.parse(p.max as string)) / 86_400_000)} days old`,
    );

  const axes: QualityAxis[] = [
    {
      name: "completeness",
      score: completeness,
      detail: `${profiles.filter((p) => p.nullRate < 0.05).length} of ${profiles.length} columns are >95% complete`,
      issues: completenessIssues,
    },
    {
      name: "uniqueness",
      score: uniqueness,
      detail: idLike.length
        ? `${idLike.length} id-like columns checked`
        : "no id columns detected",
      issues: uniquenessIssues,
    },
    {
      name: "validity",
      score: validity,
      detail: `${numericProfiles.length} numeric columns checked`,
      issues: validityIssues,
    },
    {
      name: "consistency",
      score: consistency,
      detail: `${cat.length} categorical columns checked`,
      issues: consistencyIssues,
    },
    {
      name: "freshness",
      score: freshness,
      detail: dateProfiles.length
        ? `${dateProfiles.length} datetime columns checked`
        : "no datetime columns detected",
      issues: freshnessIssues,
    },
  ];

  const score = Math.round(axes.reduce((a, x) => a + x.score, 0) / axes.length);

  // Recommendations from issues
  const recommendations: QualityReport["recommendations"] = [];
  for (const a of axes) {
    if (a.score < 60) {
      recommendations.push({
        severity: a.score < 40 ? "danger" : "warning",
        title: `${a.name[0].toUpperCase()}${a.name.slice(1)} score is ${a.score}/100`,
        detail: a.issues[0] ?? a.detail,
        fix:
          a.name === "completeness"
            ? "Investigate the columns with high null rate; impute or drop."
            : a.name === "uniqueness"
              ? "Add a unique constraint or dedupe upstream."
              : a.name === "consistency"
                ? "Standardise category labels (case, whitespace, typos)."
                : a.name === "freshness"
                  ? "Refresh the dataset — newest record is unusually old."
                  : "Review numeric values for stuck or impossible readings.",
      });
    }
  }

  return { score, axes, recommendations };
}
