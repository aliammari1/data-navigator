import type { ColType } from "./types";
// ─── Helpers ──────────────────────────────────────────────────────────────────

export function inferType(dbType: string): ColType {
  const t = dbType.toUpperCase();
  if (/INT|BIGINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL/.test(t)) return "number";
  if (/DATE|TIME|TIMESTAMP/.test(t)) return "date";
  if (/BOOL/.test(t)) return "boolean";
  return "string";
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function fmtVal(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}
