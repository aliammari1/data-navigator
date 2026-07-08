"use client";

/**
 * Moudir Navigator — app route registry.
 *
 * The "agentic OS" surface: Moudir can take you places. This is the canonical
 * list of destinations the planner is allowed to navigate to, derived from the
 * single source of truth (`nav-config`). The planner (an LLM) decides whether a
 * request is navigation vs analysis — there is no rule-based keyword routing.
 */

import { ALL_ITEMS } from "@/features/dashboard-shell/nav/nav-config";

export interface AppRoute {
  /** Canonical path (also used as the id). */
  path: string;
  /** Human label shown to the user ("Opening X"). */
  label: string;
  /** Short hint + keywords to help the model match intent. */
  hint: string;
}

/** Every navigable destination, deduped by path. */
export const APP_ROUTES: AppRoute[] = (() => {
  const seen = new Set<string>();
  const routes: AppRoute[] = [];
  const push = (path: string, label: string, hint: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    routes.push({ path, label, hint });
  };

  for (const item of ALL_ITEMS) {
    push(
      item.href,
      item.title,
      [item.description, ...(item.keywords ?? [])].filter(Boolean).join(" · "),
    );
  }
  return routes;
})();

/** A compact, model-readable list of destinations for the planner prompt. */
export function formatRoutesForPrompt(): string {
  return APP_ROUTES.map((r) => `- ${r.path} — ${r.label}: ${r.hint}`).join("\n");
}

/** Resolve a model-emitted destination (path or label) to a known route. */
export function resolveRoute(target: string): AppRoute | null {
  const t = target.trim().toLowerCase();
  return (
    APP_ROUTES.find((r) => r.path.toLowerCase() === t) ??
    APP_ROUTES.find((r) => r.path.toLowerCase().startsWith(t)) ??
    APP_ROUTES.find((r) => r.label.toLowerCase() === t) ??
    APP_ROUTES.find((r) => r.label.toLowerCase().includes(t) && t.length > 3) ??
    null
  );
}
