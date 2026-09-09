"use client";

/**
 * KRunner-style command resolver for the desktop Spotlight.
 *
 * `resolveCommands(query)` turns a free-text query into a ranked list of
 * actionable {@link CommandResult}s. It is a pure, synchronous, dependency-free
 * function: it reads live store state via `getState()` (never hooks) so it can be
 * called from any render path or event handler, and every result carries a
 * self-contained `run()` that performs the action through documented desktop
 * contracts (CustomEvents + store actions). No network, no async.
 *
 * Result families (mirrors a KRunner):
 *  - App launches            → "ouvrir <app>" (fuzzy over the app registry)
 *  - Moudir data questions   → "Demander à Moudir : « … »" (routed to the agent)
 *  - Appearance              → set wallpaper / set glass palette
 *  - Calculator              → inline math eval ("= 12 * 3")
 *  - Report export           → "Exporter le rapport"
 *
 * The Spotlight integration consumes the returned list, renders each item with
 * {@link CommandResultCard}, and calls `result.run()` on Enter / click.
 */

import type { LucideIcon } from "lucide-react";
import { Calculator, Image as ImageIcon, Palette, Sparkles } from "lucide-react";
import { DESKTOP_APPS, LAUNCHER_APPS } from "@/features/desktop/core/app-registry";
import {
  GLASS_PALETTES,
  type GlassPaletteId,
  useDesktopStore,
  WALLPAPERS,
  type WallpaperId,
} from "@/features/desktop/store/desktop-store";

/** Coarse grouping so the integration can section / icon-tint results. */
export type CommandKind = "app" | "moudir" | "wallpaper" | "palette" | "math" | "export";

/** A single resolved, runnable command surfaced in the Spotlight list. */
export interface CommandResult {
  /** Stable id for React keys + de-duplication. */
  id: string;
  /** Family bucket (drives the trailing tag + accent in the card). */
  kind: CommandKind;
  /** Primary label (French). */
  title: string;
  /** Secondary muted line (French). Optional. */
  subtitle?: string;
  /** Lucide icon component to render on the left. */
  icon: LucideIcon;
  /**
   * Optional accent hue (0-360) for the icon tint. Falls back to a per-kind
   * default in the card when omitted (e.g. app launches reuse the app hue).
   */
  hue?: number;
  /** Relevance score (higher = better). Results are returned sorted desc. */
  score: number;
  /** Perform the command. Self-contained; safe to call from a click handler. */
  run: () => void;
}

// ─── Event helpers (documented desktop contracts) ───────────────────────────

function openAppEvent(appId: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("desktop:open-app", {
      detail: props ? { appId, props } : { appId },
    }),
  );
}

function askMoudir(prompt: string): void {
  if (typeof window === "undefined") return;
  openAppEvent("moudir-chat");
  window.dispatchEvent(new CustomEvent("moudir:ask", { detail: { prompt } }));
}

// ─── Fuzzy matching ─────────────────────────────────────────────────────────

/**
 * Subsequence fuzzy score: 0 when `term` is not a subsequence of `text`,
 * otherwise a positive score that rewards contiguous runs, word-boundary
 * starts, and an exact prefix. Case-insensitive.
 */
function fuzzyScore(text: string, term: string): number {
  if (!term) return 1;
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();

  // Strong shortcuts.
  if (haystack === needle) return 1000;
  if (haystack.startsWith(needle)) return 600 + (needle.length / haystack.length) * 100;
  if (haystack.includes(needle)) return 300 + (needle.length / haystack.length) * 100;

  // Subsequence walk.
  let score = 0;
  let ti = 0;
  let lastMatch = -2;
  for (let ni = 0; ni < needle.length; ni++) {
    const ch = needle[ni];
    let found = -1;
    for (let j = ti; j < haystack.length; j++) {
      if (haystack[j] === ch) {
        found = j;
        break;
      }
    }
    if (found === -1) return 0; // not a subsequence
    score += 10;
    if (found === lastMatch + 1) score += 8; // contiguous run bonus
    if (found === 0 || haystack[found - 1] === " ") score += 6; // word start
    lastMatch = found;
    ti = found + 1;
  }
  return score;
}

// ─── Calculator ─────────────────────────────────────────────────────────────

/**
 * Evaluate a simple arithmetic expression. Supports + - * / % ( ) and decimals.
 * Returns null when the input is not a pure math expression (so it never fights
 * with text queries). No `eval`/`Function` — a tiny shunting-yard evaluator.
 */
export function tryEvalMath(input: string): number | null {
  const raw = input.trim().replace(/^=\s*/, "");
  if (!raw) return null;
  // Must look like math: digits + operators only (allow spaces, dot, parens).
  if (!/^[\d\s+\-*/%().]+$/.test(raw)) return null;
  if (!/\d/.test(raw)) return null;
  // Require at least one operator OR parens so a bare "5" is not "math noise".
  if (!/[+\-*/%()]/.test(raw)) return null;

  const tokens = raw.match(/\d+\.?\d*|\.\d+|[+\-*/%()]/g);
  if (!tokens) return null;

  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
  const output: number[] = [];
  const ops: string[] = [];

  const apply = (op: string): boolean => {
    const b = output.pop();
    const a = output.pop();
    if (a === undefined || b === undefined) return false;
    switch (op) {
      case "+":
        output.push(a + b);
        break;
      case "-":
        output.push(a - b);
        break;
      case "*":
        output.push(a * b);
        break;
      case "/":
        if (b === 0) return false;
        output.push(a / b);
        break;
      case "%":
        if (b === 0) return false;
        output.push(a % b);
        break;
      default:
        return false;
    }
    return true;
  };

  let prevType: "num" | "op" | "open" | "close" | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[\d.]/.test(t)) {
      const n = Number(t);
      if (!Number.isFinite(n)) return null;
      output.push(n);
      prevType = "num";
    } else if (t === "(") {
      ops.push(t);
      prevType = "open";
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") {
        if (!apply(ops.pop() as string)) return null;
      }
      if (ops.pop() !== "(") return null; // unbalanced
      prevType = "close";
    } else {
      // Operator. Handle unary minus/plus at start or after an operator/open.
      if (
        (t === "-" || t === "+") &&
        (prevType === null || prevType === "op" || prevType === "open")
      ) {
        output.push(0); // turn unary into binary (0 - x / 0 + x)
      }
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[t]) {
        if (!apply(ops.pop() as string)) return null;
      }
      ops.push(t);
      prevType = "op";
    }
  }
  while (ops.length) {
    const op = ops.pop() as string;
    if (op === "(") return null; // unbalanced
    if (!apply(op)) return null;
  }
  if (output.length !== 1) return null;
  const result = output[0];
  return Number.isFinite(result) ? result : null;
}

function formatNumber(n: number): string {
  // Trim float noise, then group thousands the French way.
  const rounded = Math.round(n * 1e10) / 1e10;
  return rounded.toLocaleString("fr-FR", { maximumFractionDigits: 10 });
}

// ─── Resolver ────────────────────────────────────────────────────────────────

const MAX_RESULTS = 8;

/**
 * Resolve a Spotlight query into a ranked list of runnable commands.
 *
 * Pure + synchronous. Reads live store snapshots via `getState()`. When `query`
 * is empty, returns a small set of pinned defaults (top apps + a Moudir hint).
 */
export function resolveCommands(query: string): CommandResult[] {
  const term = query.trim();
  const results: CommandResult[] = [];

  // 1) Calculator — highest priority when the query is pure math.
  const math = tryEvalMath(term);
  if (math !== null) {
    const value = formatNumber(math);
    results.push({
      id: "math",
      kind: "math",
      title: `= ${value}`,
      subtitle: "Copier le résultat",
      icon: Calculator,
      hue: 142,
      score: 10000,
      run: () => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(value).catch(() => {});
        }
      },
    });
  }

  // 2) App launches — fuzzy over the launcher registry.
  for (const app of LAUNCHER_APPS) {
    const s = term ? Math.max(fuzzyScore(app.title, term), fuzzyScore(app.blurb, term)) : 0;
    if (term && s <= 0) continue;
    results.push({
      id: `app:${app.id}`,
      kind: "app",
      title: app.title,
      subtitle: app.blurb,
      icon: app.icon,
      hue: app.hue,
      // Apps rank just under exact-intent commands; empty query keeps order.
      score: term ? 2000 + s : 50 - LAUNCHER_APPS.indexOf(app),
      run: () => openAppEvent(app.id),
    });
  }

  // 4) Appearance — set wallpaper (matches "fond", "papier peint", or label).
  if (term && /fond|papier|wall|theme|thème|aube|encre|crépus|cr.pus|papier/i.test(term)) {
    const { setWallpaper } = useDesktopStore.getState();
    for (const wp of WALLPAPERS) {
      const s = Math.max(fuzzyScore(wp.label, term), fuzzyScore(`fond ${wp.label}`, term));
      if (s <= 0) continue;
      results.push({
        id: `wallpaper:${wp.id}`,
        kind: "wallpaper",
        title: `Fond d'écran : ${wp.label}`,
        subtitle: "Changer le papier peint du bureau",
        icon: ImageIcon,
        hue: 36,
        score: 1200 + s,
        run: () => setWallpaper(wp.id as WallpaperId),
      });
    }
  }

  // 5) Appearance — set glass palette (matches "palette", "couleur", or label).
  if (term && /palette|couleur|verre|glass|sable|p.che|peche|ambre/i.test(term)) {
    const { setGlassPalette } = useDesktopStore.getState();
    for (const gp of GLASS_PALETTES) {
      const s = Math.max(fuzzyScore(gp.label, term), fuzzyScore(`palette ${gp.label}`, term));
      if (s <= 0) continue;
      results.push({
        id: `palette:${gp.id}`,
        kind: "palette",
        title: `Palette : ${gp.label}`,
        subtitle: "Changer la teinte du verre dépoli",
        icon: Palette,
        hue: 286,
        score: 1200 + s,
        run: () => setGlassPalette(gp.id as GlassPaletteId),
      });
    }
  }

  // 7) Moudir fallback — always offered for any non-empty text query so a
  //    free-form data question never dead-ends. Ranked below concrete matches
  //    unless nothing else matched (then it floats up).
  if (term) {
    const hasStrong = results.some((r) => r.score >= 2000);
    results.push({
      id: "moudir",
      kind: "moudir",
      title: `Demander à Moudir : « ${term} »`,
      subtitle: "Poser une question sur vos données",
      icon: Sparkles,
      hue: 268,
      score: hasStrong ? 800 : 2500,
      run: () => askMoudir(term),
    });
  } else {
    // Empty query: gentle Moudir hint at the very bottom.
    results.push({
      id: "moudir-hint",
      kind: "moudir",
      title: "Demander à Moudir",
      subtitle: "Posez une question sur vos données",
      icon: Sparkles,
      hue: 268,
      score: 1,
      run: () => openAppEvent("moudir-chat"),
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

/** Re-export the full registry list for integrations that want raw app data. */
export { DESKTOP_APPS, LAUNCHER_APPS };
