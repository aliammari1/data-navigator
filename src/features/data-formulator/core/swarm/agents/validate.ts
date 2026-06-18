import type { Artifact, SwarmContext } from "../types";

export interface ValidationResult {
  /** True when a mechanically-certain failure makes the artifact untrustworthy. */
  hardFail: boolean;
  reasons: string[];
}

/**
 * Deterministic, zero-LLM artifact validation. Catches the dangerous, mechanically
 * checkable failure modes (fabricated columns, empty results, non-finite numbers)
 * a small model must NEVER be allowed to overrule. Pure and synchronous, so it runs
 * in the parallel IO lane and overlaps everything. This REPLACES most of what the
 * per-task LLM critic was nominally doing.
 */
export function validateArtifact(artifact: Artifact, ctx: SwarmContext): ValidationResult {
  const reasons: string[] = [];
  const validColumns = new Set(ctx.columns.map((c) => c.name));

  switch (artifact.kind) {
    case "table":
      if (artifact.rows.length === 0) reasons.push("Table returned no rows.");
      break;
    case "chart":
      if (artifact.rows.length === 0) reasons.push("Chart returned no rows.");
      for (const enc of artifact.spec.encodings) {
        if (!validColumns.has(enc.field)) {
          reasons.push(`Chart encodes a non-existent column: "${enc.field}".`);
        }
      }
      break;
    case "kpi":
      if (artifact.value.trim() === "") reasons.push("KPI has an empty value.");
      if (artifact.delta !== undefined && !Number.isFinite(artifact.delta)) {
        reasons.push("KPI delta is not a finite number.");
      }
      break;
    case "insight":
      if (!artifact.body.trim()) reasons.push("Insight has an empty body.");
      break;
  }

  return { hardFail: reasons.length > 0, reasons };
}

/**
 * Risk tier per artifact kind. Tables/KPIs/charts come from an already-executed,
 * read-only, schema-validated SQL query, so they are LOW risk (validators suffice).
 * Insights (anomaly prose) are interpretive -> HIGH risk -> eligible for the judge.
 */
export function isHighRisk(artifact: Artifact): boolean {
  return artifact.kind === "insight";
}
