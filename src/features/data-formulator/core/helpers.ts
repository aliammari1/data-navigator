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
  // Collision-resistant identifier. Prefer the platform crypto RNG (available in
  // both the renderer and workers) over `Math.random`, which is neither uniform
  // nor collision-safe for the volume of encoding/card/derived-field ids minted
  // here. Falls back only when `crypto` is somehow unavailable.
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, 12);
  if (c?.getRandomValues) {
    const buf = new Uint8Array(8);
    c.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtVal(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}
