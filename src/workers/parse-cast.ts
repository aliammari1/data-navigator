/**
 * CSP-safe type detection + value casting for the parse.worker.
 *
 * The uDSV typed methods (`typedCols`) use `new Function()` codegen which a
 * strict CSP without `unsafe-eval` blocks. To stay CSP-safe we parse with
 * uDSV's STRING methods (`stringCols`) and cast here ourselves — no codegen.
 */

import type { ColType } from "./parse-types";

const BOOLEAN_TRUE = new Set(["true", "yes", "y", "1", "t"]);
const BOOLEAN_FALSE = new Set(["false", "no", "n", "0", "f"]);

function isBooleanToken(s: string): boolean {
  const l = s.toLowerCase();
  return BOOLEAN_TRUE.has(l) || BOOLEAN_FALSE.has(l);
}

function isNumeric(s: string): boolean {
  if (s === "") return false;
  // Reject thousands-separated / currency to keep detection conservative.
  return Number.isFinite(Number(s));
}

function isDateLike(s: string): boolean {
  if (s.length < 6) return false;
  // ISO-ish or common date — let Date.parse decide but guard against numbers.
  if (isNumeric(s)) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

/** Infer a column type from a sample of string cells (empties ignored). */
export function detectType(values: string[]): ColType {
  let numeric = 0;
  let boolean = 0;
  let date = 0;
  let nonEmpty = 0;
  const sample = values.length > 1000 ? values.slice(0, 1000) : values;
  for (const raw of sample) {
    const v = (raw ?? "").trim();
    if (v === "") continue;
    nonEmpty++;
    if (isNumeric(v)) numeric++;
    else if (isBooleanToken(v)) boolean++;
    else if (isDateLike(v)) date++;
  }
  if (nonEmpty === 0) return "string";
  const ratio = (c: number) => c / nonEmpty;
  if (ratio(numeric) >= 0.9) return "number";
  if (ratio(boolean) >= 0.9) return "boolean";
  if (ratio(date) >= 0.8) return "date";
  return "string";
}

/** Cast a string cell to the inferred column type. */
export function castValue(value: string | null | undefined, type: ColType): unknown {
  const v = (value ?? "").trim();
  if (v === "") return null;
  switch (type) {
    case "number": {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case "boolean": {
      const l = v.toLowerCase();
      if (BOOLEAN_TRUE.has(l)) return true;
      if (BOOLEAN_FALSE.has(l)) return false;
      return null;
    }
    case "date": {
      const t = Date.parse(v);
      return Number.isFinite(t) ? new Date(t).toISOString() : v;
    }
    default:
      return v;
  }
}

/**
 * Map a uDSV-inferred schema type CODE to our ColType.
 * uDSV codes: 's' string · 'n' number · 'd' date · 't' timestamp · 'j' json ·
 * 'b:*' boolean variants.
 */
export function mapUdsvType(code: string): ColType {
  if (code === "n") return "number";
  if (code === "d" || code === "t") return "date";
  if (code.startsWith("b")) return "boolean";
  // 's' | 'j' | anything else → string
  return "string";
}
