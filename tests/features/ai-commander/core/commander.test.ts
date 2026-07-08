import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit test suite for the AI Commander core module.
 *
 * The module has no IO or native dependencies other than LAUNCHER_APPS from
 * the app-registry. We mock that boundary so no next/dynamic, no real registry
 * import, and no JSX environment is required for a clean, fast test run.
 *
 * Coverage goal: 100% lines / branches / functions for commander.ts.
 */

// ─── Boundary mocks ──────────────────────────────────────────────────────────

// Keep all hoisted mock state inside vi.hoisted so the (hoisted) vi.mock
// factories can close over it without a TDZ error.
const h = vi.hoisted(() => {
  // Minimal DesktopApp shape — the commander module only reads id/title/blurb.
  const LAUNCHER_APPS = [
    { id: "telecom", title: "Rapport Télécom", blurb: "DailyTransactions" },
    { id: "moudir", title: "Studio IA — Moudir", blurb: "Agent conversationnel" },
    { id: "geo", title: "Géographie", blurb: "Analyse spatiale" },
    { id: "ai-briefing", title: "Briefing IA", blurb: "Synthèses narratives" },
  ];
  return { LAUNCHER_APPS };
});

// Mock the app-registry so next/dynamic is never evaluated.
vi.mock("@/features/desktop/core/app-registry", () => ({
  LAUNCHER_APPS: h.LAUNCHER_APPS,
  DESKTOP_APPS: h.LAUNCHER_APPS,
}));

// Also mock lucide-react icons so no ESM icon resolution is required.
vi.mock("lucide-react", () => ({
  ImageIcon: () => null,
  LayoutDashboard: () => null,
  LayoutGrid: () => null,
  Sparkles: () => null,
}));

// Import the real target module AFTER mocks are registered.
import {
  COMMANDER_CAPABILITIES,
  CommanderResultSchema,
  WALLPAPER_IDS,
  WALLPAPER_LABELS,
  buildCommanderSystemPrompt,
  resolveAppId,
} from "@/features/ai-commander/core/commander";

// ─── WALLPAPER_IDS ───────────────────────────────────────────────────────────

describe("WALLPAPER_IDS", () => {
  it("exports the four expected wallpaper ids as a readonly tuple", () => {
    expect(WALLPAPER_IDS).toEqual(["dawn", "paper", "dusk", "ink"]);
  });

  it("contains exactly four entries", () => {
    expect(WALLPAPER_IDS).toHaveLength(4);
  });
});

// ─── WALLPAPER_LABELS ────────────────────────────────────────────────────────

describe("WALLPAPER_LABELS", () => {
  it("maps every WALLPAPER_ID to a non-empty French string", () => {
    for (const id of WALLPAPER_IDS) {
      expect(typeof WALLPAPER_LABELS[id]).toBe("string");
      expect(WALLPAPER_LABELS[id].length).toBeGreaterThan(0);
    }
  });

  it("has the correct French label for each id", () => {
    expect(WALLPAPER_LABELS.dawn).toBe("Aube");
    expect(WALLPAPER_LABELS.paper).toBe("Papier");
    expect(WALLPAPER_LABELS.dusk).toBe("Crépuscule");
    expect(WALLPAPER_LABELS.ink).toBe("Encre");
  });
});

// ─── COMMANDER_CAPABILITIES ──────────────────────────────────────────────────

describe("COMMANDER_CAPABILITIES", () => {
  it("exports an array of exactly four capability tiles", () => {
    expect(Array.isArray(COMMANDER_CAPABILITIES)).toBe(true);
    expect(COMMANDER_CAPABILITIES).toHaveLength(4);
  });

  it("each capability has a non-empty id, title, hint, and example", () => {
    for (const cap of COMMANDER_CAPABILITIES) {
      expect(typeof cap.id).toBe("string");
      expect(cap.id.length).toBeGreaterThan(0);
      expect(typeof cap.title).toBe("string");
      expect(cap.title.length).toBeGreaterThan(0);
      expect(typeof cap.hint).toBe("string");
      expect(cap.hint.length).toBeGreaterThan(0);
      expect(typeof cap.example).toBe("string");
      expect(cap.example.length).toBeGreaterThan(0);
    }
  });

  it("each capability has an icon (non-null) and a numeric hue", () => {
    for (const cap of COMMANDER_CAPABILITIES) {
      // icon is a LucideIcon component reference — it is truthy (not null/undefined)
      expect(cap.icon).toBeDefined();
      expect(typeof cap.hue).toBe("number");
      expect(cap.hue).toBeGreaterThan(0);
    }
  });

  it("contains the 'open', 'ask', 'scene', and 'organize' ids", () => {
    const ids = COMMANDER_CAPABILITIES.map((c) => c.id);
    expect(ids).toContain("open");
    expect(ids).toContain("ask");
    expect(ids).toContain("scene");
    expect(ids).toContain("organize");
  });
});

// ─── CommanderResultSchema ────────────────────────────────────────────────────

describe("CommanderResultSchema — valid payloads", () => {
  it("accepts a minimal none action with a reply", () => {
    const result = CommanderResultSchema.parse({
      action: { kind: "none" },
      reply: "Pas de souci.",
    });
    expect(result.action.kind).toBe("none");
    expect(result.reply).toBe("Pas de souci.");
  });

  it("accepts an open_app action with an appId", () => {
    const result = CommanderResultSchema.parse({
      action: { kind: "open_app", appId: "telecom" },
      reply: "J'ouvre le rapport télécom.",
    });
    expect(result.action.kind).toBe("open_app");
    expect(result.action.appId).toBe("telecom");
  });

  it("accepts an ask_data action with a query", () => {
    const result = CommanderResultSchema.parse({
      action: { kind: "ask_data", query: "Quels canaux ont le plus d'erreurs ?" },
      reply: "Je pose la question à Moudir.",
    });
    expect(result.action.kind).toBe("ask_data");
    expect(result.action.query).toBe("Quels canaux ont le plus d'erreurs ?");
  });

  it("accepts a set_wallpaper action with each valid wallpaper id", () => {
    for (const wp of WALLPAPER_IDS) {
      const result = CommanderResultSchema.parse({
        action: { kind: "set_wallpaper", wallpaper: wp },
        reply: "Fond modifié.",
      });
      expect(result.action.wallpaper).toBe(wp);
    }
  });

  it("accepts an arrange action", () => {
    const result = CommanderResultSchema.parse({
      action: { kind: "arrange" },
      reply: "Fenêtres rangées.",
    });
    expect(result.action.kind).toBe("arrange");
  });

  it("accepts a close_all action", () => {
    const result = CommanderResultSchema.parse({
      action: { kind: "close_all" },
      reply: "Tout fermé.",
    });
    expect(result.action.kind).toBe("close_all");
  });

  it("optional fields (appId, query, wallpaper) are absent when not provided", () => {
    const result = CommanderResultSchema.parse({
      action: { kind: "none" },
      reply: "D'accord.",
    });
    expect(result.action.appId).toBeUndefined();
    expect(result.action.query).toBeUndefined();
    expect(result.action.wallpaper).toBeUndefined();
  });
});

describe("CommanderResultSchema — invalid payloads", () => {
  it("rejects an unknown action kind", () => {
    expect(() =>
      CommanderResultSchema.parse({
        action: { kind: "fly_to_moon" },
        reply: "Impossible.",
      }),
    ).toThrow();
  });

  it("rejects a missing reply field", () => {
    expect(() =>
      CommanderResultSchema.parse({
        action: { kind: "none" },
      }),
    ).toThrow();
  });

  it("rejects an unknown wallpaper id", () => {
    expect(() =>
      CommanderResultSchema.parse({
        action: { kind: "set_wallpaper", wallpaper: "rainbow" },
        reply: "Fond modifié.",
      }),
    ).toThrow();
  });

  it("rejects a missing action field", () => {
    expect(() =>
      CommanderResultSchema.parse({
        reply: "Bonjour.",
      }),
    ).toThrow();
  });
});

// ─── buildCommanderSystemPrompt ───────────────────────────────────────────────

describe("buildCommanderSystemPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = buildCommanderSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("builds the exact prompt from the mocked app list", () => {
    // buildCommanderSystemPrompt has no LLM call to wire-test — its entire
    // observable behavior IS this string. With LAUNCHER_APPS fully mocked and
    // deterministic (above), a full exact match is stronger than the individual
    // toContain() checks this replaces: those could only ever catch removal of
    // one specific word, and would miss a rewritten action list, a dropped
    // action kind, a wrong wallpaper id, or a language-support regression that
    // happened to keep one matching keyword.
    const prompt = buildCommanderSystemPrompt();
    expect(prompt).toBe(
      [
        "You are the Commander, the navigator of a local-first telecom analytics desktop app.",
        "You translate ONE user instruction into ONE structured action. Reply in the user's language (French by default; support English and Arabic).",
        "",
        "Decide the single best action:",
        '- "open_app": open a feature window. Set appId to one of the app ids below.',
        '- "ask_data": the user asked an analytical/data question about their transactions. Put a clear, self-contained question in `query` (this is sent to the Moudir data agent which writes SQL + charts).',
        '- "set_wallpaper": change the desktop background. Set wallpaper to dawn|paper|dusk|ink.',
        '- "arrange": tidy / cascade the open windows.',
        '- "close_all": close every open window.',
        '- "none": small talk or unclear — just reply, take no action.',
        "",
        "Available apps (appId: title):",
        "- telecom: Rapport Télécom (DailyTransactions)",
        "- moudir: Studio IA — Moudir (Agent conversationnel)",
        "- geo: Géographie (Analyse spatiale)",
        "- ai-briefing: Briefing IA (Synthèses narratives)",
        "",
        "Rules: prefer ask_data for any question about numbers, trends, channels, errors, regions, days, forecasts. Prefer open_app when the user names a tool/screen. Keep `reply` short and confirm what you did.",
      ].join("\n"),
    );
  });
});

// ─── resolveAppId ─────────────────────────────────────────────────────────────

describe("resolveAppId — falsy / missing input (early return branch)", () => {
  it("returns undefined for undefined input", () => {
    expect(resolveAppId(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(resolveAppId("")).toBeUndefined();
  });

  it("passes through whitespace-only string (truthy raw) and matches first app via empty-includes", () => {
    // "   " is truthy so !raw is false; id = "" after trim.
    // a.title.toLowerCase().includes("") is true for any title → matches first LAUNCHER_APP.
    // This characterises the real behavior: a whitespace-only input fuzzy-matches the first app.
    const result = resolveAppId("   ");
    // The first mocked app is "telecom" — empty-string includes always returns the first hit.
    expect(result).toBe("telecom");
  });
});

describe("resolveAppId — exact match branch", () => {
  it("returns the exact id for a known app id (lowercase)", () => {
    expect(resolveAppId("telecom")).toBe("telecom");
  });

  it("returns the exact id for another known app", () => {
    expect(resolveAppId("moudir")).toBe("moudir");
  });

  it("normalises upper-case input to the exact match", () => {
    // The function does raw.trim().toLowerCase() before comparing.
    expect(resolveAppId("TELECOM")).toBe("telecom");
  });

  it("normalises mixed-case with surrounding spaces", () => {
    expect(resolveAppId("  GEO  ")).toBe("geo");
  });
});

describe("resolveAppId — fuzzy match branch (no exact match)", () => {
  it("matches by title substring — partial title word", () => {
    // "géographie" is a substring of "Géographie" (case-insensitive via toLowerCase).
    expect(resolveAppId("géographie")).toBe("geo");
  });

  it("matches when the query contains the app id as a substring (id.includes check)", () => {
    // "telecom-report" contains "telecom" (the id) so `id.includes(a.id)` is true.
    expect(resolveAppId("telecom-report")).toBe("telecom");
  });

  it("falls through to undefined when query only matches a blurb (not title or id)", () => {
    // The fuzzy search only checks title and id, NOT blurb.
    // "conversationnel" is only in the blurb of moudir, not in any title or id.
    expect(resolveAppId("conversationnel")).toBeUndefined();
  });

  it("returns undefined when neither exact nor fuzzy match exists", () => {
    expect(resolveAppId("xyznomatch999")).toBeUndefined();
  });

  it("returns undefined for a query that produces no match anywhere", () => {
    expect(resolveAppId("completelyunknownapp")).toBeUndefined();
  });
});

describe("resolveAppId — edge cases", () => {
  it("handles a single-character query that is not an id prefix", () => {
    // "z" is not a match for any app id/title/blurb in the mock registry.
    expect(resolveAppId("z")).toBeUndefined();
  });

  it("handles numeric-only string input gracefully", () => {
    expect(resolveAppId("1234")).toBeUndefined();
  });

  it("handles special characters without throwing", () => {
    expect(() => resolveAppId("!@#$%")).not.toThrow();
    expect(resolveAppId("!@#$%")).toBeUndefined();
  });
});
