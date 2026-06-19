/**
 * Offline key/column auto-mapping between two datasets.
 *
 * Real reconciliation rarely has identical column names on both sides ("MSISDN"
 * vs "Phone", "rev" vs "revenue"). The legacy stub only handled an exact
 * `channel === channel` match. Here we fuzzy-match column names with the
 * already-installed `fuse.js` (no new dependency, fully offline) over the
 * *distinct column sets* — this is off the hot path, so it never touches row
 * data. The result is a best-guess mapping the user can confirm/override.
 */

import Fuse from "fuse.js";

export interface ColumnInfo {
  name: string;
  /** Normalized DuckDB type label, when known. */
  type?: string;
}

export interface MappingSuggestion {
  expected: string;
  actual: string | null;
  /** 0–1 confidence; 1 = exact (case-insensitive) match. */
  confidence: number;
}

function isNumericType(type?: string): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return (
    t.includes("int") ||
    t.includes("double") ||
    t.includes("float") ||
    t.includes("decimal") ||
    t.includes("numeric") ||
    t.includes("real") ||
    t.includes("bigint") ||
    t.includes("hugeint")
  );
}

/**
 * Suggest a best-match `actual` column for each `expected` column. Exact
 * (case-insensitive) matches win with confidence 1; otherwise fuse.js ranks by
 * fuzzy string distance.
 */
export function suggestColumnMapping(
  expectedCols: ColumnInfo[],
  actualCols: ColumnInfo[],
): MappingSuggestion[] {
  const fuse = new Fuse(actualCols, {
    keys: ["name"],
    includeScore: true,
    threshold: 0.6,
    ignoreLocation: true,
  });

  const actualByLower = new Map(actualCols.map((c) => [c.name.toLowerCase(), c.name] as const));

  return expectedCols.map((exp) => {
    const exact = actualByLower.get(exp.name.toLowerCase());
    if (exact) {
      return { expected: exp.name, actual: exact, confidence: 1 };
    }
    const hit = fuse.search(exp.name)[0];
    if (!hit) {
      return { expected: exp.name, actual: null, confidence: 0 };
    }
    // fuse score: 0 = perfect, 1 = worst.
    return {
      expected: exp.name,
      actual: hit.item.name,
      confidence: Math.max(0, 1 - (hit.score ?? 1)),
    };
  });
}

/**
 * Pick a likely default join key: the highest-confidence non-numeric column
 * mapping (keys are usually identifiers/labels, not measures).
 */
export function pickDefaultKey(
  suggestions: MappingSuggestion[],
  expectedCols: ColumnInfo[],
): MappingSuggestion | null {
  const typeByName = new Map(expectedCols.map((c) => [c.name, c.type] as const));
  const candidates = suggestions
    .filter((s) => s.actual && !isNumericType(typeByName.get(s.expected)))
    .sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}

/**
 * Pick likely default measures: confidently-mapped numeric columns (excluding
 * any chosen key).
 */
export function pickDefaultMeasures(
  suggestions: MappingSuggestion[],
  expectedCols: ColumnInfo[],
  excludeExpected: Set<string>,
  limit = 3,
): MappingSuggestion[] {
  const typeByName = new Map(expectedCols.map((c) => [c.name, c.type] as const));
  return suggestions
    .filter(
      (s) =>
        s.actual &&
        s.confidence > 0.4 &&
        isNumericType(typeByName.get(s.expected)) &&
        !excludeExpected.has(s.expected),
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

export { isNumericType };
