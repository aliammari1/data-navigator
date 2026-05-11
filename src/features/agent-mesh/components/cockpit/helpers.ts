import type { Evidence } from "@/features/agent-mesh/core/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function pct(v: number) {
  return Number.isFinite(v) ? `${Math.round(v * 100)}%` : "0%";
}
export function avgGrade(e: Evidence) {
  return (e.grade.data + e.grade.method + e.grade.claim + e.grade.business) / 4;
}
export function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
export function formatAge(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
