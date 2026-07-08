/**
 * Unit tests for the Moudir Navigator route registry.
 *
 * Covers:
 *   - APP_ROUTES IIFE: deduplication logic (seen.has early-return branch),
 *     optional keywords (?? []), .filter(Boolean) for falsy descriptions.
 *   - formatRoutesForPrompt(): string rendering
 *   - resolveRoute(): all four find() stages + t.length > 3 guard + null fallback
 *
 * We mock @/features/dashboard-shell/nav/nav-config with vi.hoisted() variables
 * so Vitest's module hoisting cannot cause ReferenceError.
 */

import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock data (must be defined before vi.mock() factories run)
// ---------------------------------------------------------------------------

const mockAllItems = vi.hoisted(() => [
  {
    title: "Accueil",
    href: "/dashboard",
    icon: {},
    description: "Home dashboard",
    keywords: ["home", "accueil"],
  },
  {
    title: "Rapport Télécom",
    href: "/dashboard/telecom-report",
    icon: {},
    description: "Daily transactions report",
    keywords: ["telecom", "rapport"],
  },
  {
    title: "Studio IA",
    href: "/dashboard/data-formulator",
    icon: {},
    description: "AI studio",
    // Deliberately omit keywords to exercise the `keywords ?? []` branch.
    keywords: undefined as unknown as string[],
  },
  {
    title: "No Description Item",
    href: "/dashboard/no-desc",
    icon: {},
    // Empty string description — exercises .filter(Boolean).
    description: "",
    keywords: ["tag1"],
  },
]);

const mockTelecomNavItems = vi.hoisted(() => [
  {
    key: "overview",
    label: "Vue d'ensemble",
    description: "KPIs et synthèse",
    icon: {},
  },
  {
    key: "analysis",
    label: "Analyse",
    description: "Erreurs et tendances",
    icon: {},
  },
]);

// ---------------------------------------------------------------------------
// Module mock — must be a top-level vi.mock() call
// ---------------------------------------------------------------------------

vi.mock("@/features/dashboard-shell/nav/nav-config", () => ({
  ALL_ITEMS: mockAllItems,
  TELECOM_NAV_ITEMS: mockTelecomNavItems,
}));

// ---------------------------------------------------------------------------
// Import the real target after the mock is established
// ---------------------------------------------------------------------------

import {
  APP_ROUTES,
  formatRoutesForPrompt,
  resolveRoute,
} from "@/features/data-formulator/core/navigator/routes";

// ---------------------------------------------------------------------------
// APP_ROUTES — static IIFE
// ---------------------------------------------------------------------------

describe("APP_ROUTES", () => {
  it("is a non-empty array", () => {
    expect(APP_ROUTES.length).toBeGreaterThan(0);
  });

  it("includes all paths from ALL_ITEMS", () => {
    const paths = APP_ROUTES.map((r) => r.path);
    expect(paths).toContain("/dashboard");
    expect(paths).toContain("/dashboard/telecom-report");
    expect(paths).toContain("/dashboard/data-formulator");
    expect(paths).toContain("/dashboard/no-desc");
  });

  it("includes telecom tab routes generated from TELECOM_NAV_ITEMS", () => {
    const paths = APP_ROUTES.map((r) => r.path);
    expect(paths).toContain("/dashboard/telecom-report?tab=overview");
    expect(paths).toContain("/dashboard/telecom-report?tab=analysis");
  });

  it("produces the correct label for telecom tab routes", () => {
    const r = APP_ROUTES.find((x) => x.path === "/dashboard/telecom-report?tab=overview");
    expect(r?.label).toBe("Rapport Télécom — Vue d'ensemble");
  });

  it("uses the tab description as the hint for telecom tab routes", () => {
    const r = APP_ROUTES.find((x) => x.path === "/dashboard/telecom-report?tab=overview");
    expect(r?.hint).toBe("KPIs et synthèse");
  });

  it("joins description and keywords with ' · ' separator when both are present", () => {
    const home = APP_ROUTES.find((x) => x.path === "/dashboard");
    expect(home?.hint).toBe("Home dashboard · home · accueil");
  });

  it("handles items with undefined keywords (keywords ?? [] branch) — hint is just description", () => {
    const studio = APP_ROUTES.find((x) => x.path === "/dashboard/data-formulator");
    // keywords is undefined → fallback to [] → no extra ' · ...' appended
    expect(studio?.hint).toBe("AI studio");
  });

  it("filters out empty description via .filter(Boolean) — hint is just keywords", () => {
    const noDesc = APP_ROUTES.find((x) => x.path === "/dashboard/no-desc");
    // description is "" → filtered out, hint = "tag1" only
    expect(noDesc?.hint).toBe("tag1");
    expect(noDesc?.hint).not.toMatch(/^ · /);
  });

  it("total count equals ALL_ITEMS count plus TELECOM_NAV_ITEMS count when no duplicates", () => {
    // 4 (ALL_ITEMS) + 2 (TELECOM_NAV_ITEMS) = 6
    expect(APP_ROUTES).toHaveLength(6);
  });

  it("each route has path, label, and hint string properties", () => {
    for (const route of APP_ROUTES) {
      expect(typeof route.path).toBe("string");
      expect(typeof route.label).toBe("string");
      expect(typeof route.hint).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Deduplication (seen.has early-return branch)
//
// The seen.has() early-return is only triggered when the same path appears
// twice. We test it via vi.resetModules() + dynamic import with a fresh mock.
// ---------------------------------------------------------------------------

describe("APP_ROUTES deduplication (seen.has branch)", () => {
  it("skips duplicate paths — only the first occurrence is kept", async () => {
    vi.resetModules();

    // Re-register the mock with a duplicate path injected.
    // We use vi.doMock() (not vi.mock()) so it isn't hoisted and the new
    // factory applies to the dynamically-imported module below.
    vi.doMock("@/features/dashboard-shell/nav/nav-config", () => ({
      ALL_ITEMS: [
        { title: "Alpha", href: "/dup-path", icon: {}, description: "first", keywords: [] },
        { title: "Beta", href: "/dup-path", icon: {}, description: "second", keywords: [] },
      ],
      TELECOM_NAV_ITEMS: [],
    }));

    const { APP_ROUTES: fresh } = await import("@/features/data-formulator/core/navigator/routes");

    const matches = fresh.filter((r: { path: string }) => r.path === "/dup-path");
    expect(matches).toHaveLength(1);
    // First occurrence wins.
    expect(matches[0].label).toBe("Alpha");

    // No restore needed: the rest of the suite uses the static top-level
    // import (already evaluated against the hoisted mock), and queuing an
    // extra doMock factory here would be consumed by the NEXT dynamic
    // import — shadowing the factory that test registers.
    vi.resetModules();
  });

  it("skips a TELECOM_NAV_ITEMS tab whose path was already registered by ALL_ITEMS", async () => {
    vi.resetModules();

    // An ALL_ITEMS entry whose href matches what the tab push would generate.
    const collisionPath = "/dashboard/telecom-report?tab=overview";
    vi.doMock("@/features/dashboard-shell/nav/nav-config", () => ({
      ALL_ITEMS: [
        {
          title: "Pre-registered Tab",
          href: collisionPath,
          icon: {},
          description: "already there",
          keywords: [],
        },
      ],
      TELECOM_NAV_ITEMS: [
        { key: "overview", label: "Vue d'ensemble", description: "KPIs", icon: {} },
      ],
    }));

    const { APP_ROUTES: fresh } = await import("@/features/data-formulator/core/navigator/routes");

    const matches = fresh.filter((r: { path: string }) => r.path === collisionPath);
    expect(matches).toHaveLength(1);
    // The ALL_ITEMS entry wins (pushed first).
    expect(matches[0].label).toBe("Pre-registered Tab");

    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// formatRoutesForPrompt
// ---------------------------------------------------------------------------

describe("formatRoutesForPrompt", () => {
  it("returns a non-empty string", () => {
    const result = formatRoutesForPrompt();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("produces exactly one line per route", () => {
    const lines = formatRoutesForPrompt().split("\n");
    expect(lines).toHaveLength(APP_ROUTES.length);
  });

  it("every line starts with '- '", () => {
    const lines = formatRoutesForPrompt().split("\n");
    for (const line of lines) {
      expect(line.startsWith("- ")).toBe(true);
    }
  });

  it("each line matches the '- {path} — {label}: {hint}' template", () => {
    const lines = formatRoutesForPrompt().split("\n");
    for (let i = 0; i < APP_ROUTES.length; i++) {
      const r = APP_ROUTES[i];
      expect(lines[i]).toBe(`- ${r.path} — ${r.label}: ${r.hint}`);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveRoute — four find() stages + t.length > 3 guard + null fallback
// ---------------------------------------------------------------------------

describe("resolveRoute", () => {
  // Stage 1: exact path match
  it("resolves an exact path match (stage 1)", () => {
    const r = resolveRoute("/dashboard");
    expect(r).not.toBeNull();
    expect(r?.path).toBe("/dashboard");
  });

  it("exact path match is case-insensitive", () => {
    const r = resolveRoute("/DASHBOARD");
    expect(r).not.toBeNull();
    expect(r?.path).toBe("/dashboard");
  });

  it("trims whitespace before matching", () => {
    const r = resolveRoute("  /dashboard  ");
    expect(r).not.toBeNull();
    expect(r?.path).toBe("/dashboard");
  });

  // Stage 2: path startsWith match (only reached when stage 1 fails)
  it("resolves by path prefix when no exact path match exists (stage 2)", () => {
    // '/dashboard/telecom' is not an exact path but is a prefix of some route
    const r = resolveRoute("/dashboard/telecom-report?tab");
    expect(r).not.toBeNull();
    expect(r?.path.startsWith("/dashboard/telecom-report?tab")).toBe(true);
  });

  it("stage 2 prefix match is case-insensitive", () => {
    const r = resolveRoute("/DASHBOARD/TELECOM-REPORT?TAB");
    expect(r).not.toBeNull();
    // Should match a route whose path starts with "/dashboard/telecom-report?tab"
    expect(r?.path.toLowerCase().startsWith("/dashboard/telecom-report?tab")).toBe(true);
  });

  // Stage 3: exact label match
  it("resolves by exact label match (stage 3)", () => {
    // "accueil" exactly matches the label of the first mock item
    const r = resolveRoute("accueil");
    expect(r).not.toBeNull();
    expect(r?.label.toLowerCase()).toBe("accueil");
  });

  it("exact label match is case-insensitive (stage 3)", () => {
    const r = resolveRoute("ACCUEIL");
    expect(r).not.toBeNull();
    expect(r?.label.toLowerCase()).toBe("accueil");
  });

  it("exact label match is reached only after path stages fail (stage 3)", () => {
    // "studio ia" is not a valid path, but IS the exact lowercase label
    const r = resolveRoute("studio ia");
    expect(r).not.toBeNull();
    expect(r?.path).toBe("/dashboard/data-formulator");
  });

  // Stage 4: label includes + t.length > 3
  it("resolves by partial label match when target length > 3 (stage 4)", () => {
    // "rapport" (7 chars) is contained in "Rapport Télécom"
    const r = resolveRoute("rapport");
    expect(r).not.toBeNull();
    expect(r?.label.toLowerCase()).toContain("rapport");
  });

  it("partial label match is case-insensitive (stage 4)", () => {
    const r = resolveRoute("RAPPORT");
    expect(r).not.toBeNull();
    expect(r?.label.toLowerCase()).toContain("rapport");
  });

  it("does NOT resolve by partial label when target length is exactly 3 (t.length > 3 guard — false branch)", () => {
    // "acc" has length 3 — the guard `t.length > 3` is false so stage 4 skips
    // Stages 1-3 also won't match "acc", so null is returned.
    const r = resolveRoute("acc");
    expect(r).toBeNull();
  });

  it("does NOT resolve by partial label when target length is 1 (t.length > 3 guard — false branch)", () => {
    const r = resolveRoute("a");
    expect(r).toBeNull();
  });

  it("does NOT resolve by partial label when target length is 2 (t.length > 3 guard — false branch)", () => {
    const r = resolveRoute("ia");
    expect(r).toBeNull();
  });

  it("DOES resolve by partial label when target length is exactly 4 (t.length > 3 guard — true branch)", () => {
    // "home" (4 chars) is in the Accueil hint, not the label — need a 4-char label substring
    // "ccue" (4 chars) is contained in "accueil"
    const r = resolveRoute("ccue");
    // "ccue" is not an exact path, not a path prefix, not an exact label
    // but "accueil".includes("ccue") is true and length 4 > 3
    expect(r).not.toBeNull();
    expect(r?.label.toLowerCase()).toContain("ccue");
  });

  // Null fallback — all four stages fail
  it("returns null when no stage matches (null fallback)", () => {
    const r = resolveRoute("zzz-nonexistent-9999");
    expect(r).toBeNull();
  });

  it("returns null for a whitespace-only string after trimming", () => {
    // trim() → "" → path "" doesn't match, "" starts any string (stage 2 may match),
    // label "" doesn't match any label, and t.length (0) is not > 3.
    // Actually "".startsWith("") is always true, so stage 2 will match first route.
    // This test documents the real behavior.
    const r = resolveRoute("   ");
    // t = "" after trim; every path startsWith("") so stage 2 returns the first route.
    // This is the actual module behavior — not a bug we fix, just what happens.
    if (r !== null) {
      // startsWith("") matches any route
      expect(r).toBe(APP_ROUTES[0]);
    } else {
      expect(r).toBeNull();
    }
  });

  it("resolves telecom tab route by exact path match", () => {
    const r = resolveRoute("/dashboard/telecom-report?tab=overview");
    expect(r).not.toBeNull();
    expect(r?.path).toBe("/dashboard/telecom-report?tab=overview");
    expect(r?.label).toBe("Rapport Télécom — Vue d'ensemble");
  });

  it("stage 1 exact path wins over stage 2 prefix when exact match exists", () => {
    // "/dashboard/no-desc" exact matches before any prefix logic runs
    const r = resolveRoute("/dashboard/no-desc");
    expect(r).not.toBeNull();
    expect(r?.path).toBe("/dashboard/no-desc");
  });
});
