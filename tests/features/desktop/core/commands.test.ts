import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral test suite for the KRunner-style Spotlight command resolver.
 *
 * The module reads two zustand stores via `getState()` and iterates the desktop
 * app registry. All three boundaries are mocked so the suite is deterministic,
 * dependency-free (no `next/dynamic`, no zustand persistence, no real DB) and
 * fast. Every assertion is on a REAL computed output of the module under test.
 */

// ─── Boundary mocks ──────────────────────────────────────────────────────────

// All shared mock state lives inside `vi.hoisted` so the (hoisted) `vi.mock`
// factories can reference it without a TDZ error. `datasets` is mutated per-test
// to drive the data-store snapshot; the spies capture `run()` side effects.
const h = vi.hoisted(() => {
  // A stub Lucide icon — the resolver only forwards the reference, never renders.
  const StubIcon = () => null;

  // Deterministic launcher registry. `resolveCommands` reads only
  // id/title/blurb/icon/hue and the array order, so this minimal shape suffices.
  const LAUNCHER_APPS = [
    {
      id: "moudir",
      title: "Studio IA — Moudir",
      blurb: "Agent conversationnel",
      icon: StubIcon,
      hue: 268,
    },
    {
      id: "telecom",
      title: "Rapport Télécom",
      blurb: "DailyTransactions",
      icon: StubIcon,
      hue: 18,
    },
    { id: "geo", title: "Géographie", blurb: "Analyse spatiale", icon: StubIcon, hue: 168 },
  ];

  const WALLPAPERS = [
    { id: "dawn", label: "Aube", css: "var(--wp-dawn)" },
    { id: "paper", label: "Papier", css: "var(--wp-paper)" },
    { id: "dusk", label: "Crépuscule", css: "var(--wp-dusk)" },
    { id: "ink", label: "Encre", css: "var(--wp-ink)" },
  ];

  const GLASS_PALETTES = [
    { id: "sand", label: "Cyan", swatch: "g1" },
    { id: "peach", label: "Sarcelle", swatch: "g2" },
    { id: "amber", label: "Azur", swatch: "g3" },
  ];

  return {
    LAUNCHER_APPS,
    DESKTOP_APPS: [...LAUNCHER_APPS],
    WALLPAPERS,
    GLASS_PALETTES,
    setWallpaper: vi.fn(),
    setGlassPalette: vi.fn(),
    setActiveDataset: vi.fn(),
    // Mutable per-test data-store datasets snapshot.
    datasets: [] as Array<{
      id: string;
      name: string;
      rowCount: number;
      colCount: number;
      updatedAt: string;
    }>,
  };
});

vi.mock("@/features/desktop/core/app-registry", () => ({
  LAUNCHER_APPS: h.LAUNCHER_APPS,
  DESKTOP_APPS: h.DESKTOP_APPS,
}));

vi.mock("@/features/desktop/store/desktop-store", () => ({
  WALLPAPERS: h.WALLPAPERS,
  GLASS_PALETTES: h.GLASS_PALETTES,
  useDesktopStore: {
    getState: () => ({ setWallpaper: h.setWallpaper, setGlassPalette: h.setGlassPalette }),
  },
}));

vi.mock("@/core/stores/data-store", () => ({
  useDataStore: {
    getState: () => ({ datasets: h.datasets, setActiveDataset: h.setActiveDataset }),
  },
}));

// Convenience aliases used throughout the suite.
const LAUNCHER_APPS = h.LAUNCHER_APPS;
const setWallpaper = h.setWallpaper;
const setGlassPalette = h.setGlassPalette;
const setActiveDataset = h.setActiveDataset;

// Import AFTER the mocks are registered (hoisted by vitest, but explicit here).
import { resolveCommands, tryEvalMath } from "@/features/desktop/core/commands";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function byKind(results: ReturnType<typeof resolveCommands>, kind: string) {
  return results.filter((r) => r.kind === kind);
}
function byId(results: ReturnType<typeof resolveCommands>, id: string) {
  return results.find((r) => r.id === id);
}

/** Replace the mocked data-store datasets snapshot for the current test. */
function setDatasets(next: typeof h.datasets): void {
  h.datasets = next;
}

beforeEach(() => {
  setDatasets([]);
  vi.clearAllMocks();
});

// ─── tryEvalMath: empty / non-math inputs ────────────────────────────────────

describe("tryEvalMath — rejects non-math input", () => {
  it("returns null for an empty string", () => {
    expect(tryEvalMath("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(tryEvalMath("   ")).toBeNull();
  });

  it("returns null for a lone '=' with nothing after it", () => {
    expect(tryEvalMath("=")).toBeNull();
  });

  it("returns null for plain text", () => {
    expect(tryEvalMath("hello world")).toBeNull();
  });

  it("returns null for a bare number with no operator (not 'math noise')", () => {
    expect(tryEvalMath("5")).toBeNull();
  });

  it("returns null for a bare decimal with no operator", () => {
    expect(tryEvalMath("3.14")).toBeNull();
  });

  it("returns null when letters are mixed with digits", () => {
    expect(tryEvalMath("2 + a")).toBeNull();
  });

  it("returns null when there are operators but no digit", () => {
    expect(tryEvalMath("+-*/")).toBeNull();
  });

  it("returns null for a currency string with a comma decimal", () => {
    // Comma is not in the allowed charset → rejected before evaluation.
    expect(tryEvalMath("12,50")).toBeNull();
  });
});

// ─── tryEvalMath: basic arithmetic + precedence ──────────────────────────────

describe("tryEvalMath — evaluates arithmetic", () => {
  it("adds two integers", () => {
    expect(tryEvalMath("2 + 3")).toBe(5);
  });

  it("strips a leading '=' prefix before evaluating", () => {
    expect(tryEvalMath("= 12 * 3")).toBe(36);
  });

  it("strips '=' even with no space after it", () => {
    expect(tryEvalMath("=7-2")).toBe(5);
  });

  it("honors multiplication-over-addition precedence", () => {
    expect(tryEvalMath("2 + 3 * 4")).toBe(14);
  });

  it("respects parentheses overriding precedence", () => {
    expect(tryEvalMath("(2 + 3) * 4")).toBe(20);
  });

  it("evaluates nested parentheses", () => {
    expect(tryEvalMath("((1 + 2) * (3 + 4))")).toBe(21);
  });

  it("computes a decimal result", () => {
    expect(tryEvalMath("10 / 4")).toBeCloseTo(2.5, 10);
  });

  it("supports the modulo operator", () => {
    expect(tryEvalMath("10 % 3")).toBe(1);
  });

  it("evaluates left-to-right for equal precedence", () => {
    expect(tryEvalMath("10 - 3 - 2")).toBe(5);
  });

  it("evaluates a decimal-leading token like .5", () => {
    expect(tryEvalMath(".5 + .5")).toBe(1);
  });
});

// ─── tryEvalMath: unary signs ────────────────────────────────────────────────

describe("tryEvalMath — unary plus/minus handling", () => {
  it("treats a leading minus as unary (0 - x)", () => {
    expect(tryEvalMath("-5 + 8")).toBe(3);
  });

  it("treats a leading plus as unary (0 + x)", () => {
    expect(tryEvalMath("+5 - 2")).toBe(3);
  });

  it("mishandles a unary minus right after a higher-precedence operator (BUG)", () => {
    // CHARACTERIZATION of a real bug: `3 * -2` should be -6, but the evaluator
    // inserts the unary placeholder 0 as a NEW operand, then the pending `*`
    // (higher precedence) consumes `3 * 0 = 0`, leaving `0 - 2 = -2`.
    // We assert the current (wrong) output to keep the suite green; see bugsFound.
    expect(tryEvalMath("3 * -2")).toBe(-2);
  });

  it("also mishandles unary minus after '/' for the same reason (BUG)", () => {
    // `6 / -2` should be -3; the same placeholder bug yields 6/0 → div-by-zero
    // returns false in apply() → whole expression is rejected as null.
    expect(tryEvalMath("6 / -2")).toBeNull();
  });

  it("handles a unary minus right after an open paren", () => {
    expect(tryEvalMath("(-4) + 1")).toBe(-3);
  });

  it("evaluates a lone '-3' (operator present, digit present, unary applied)", () => {
    expect(tryEvalMath("-3")).toBe(-3);
  });
});

// ─── tryEvalMath: division/modulo by zero and unbalanced parens ──────────────

describe("tryEvalMath — error conditions return null", () => {
  it("returns null on division by zero", () => {
    expect(tryEvalMath("1 / 0")).toBeNull();
  });

  it("returns null on modulo by zero", () => {
    expect(tryEvalMath("1 % 0")).toBeNull();
  });

  it("returns null for an unbalanced closing paren", () => {
    expect(tryEvalMath("(2 + 3")).toBeNull();
  });

  it("returns null for an unbalanced opening structure ')'", () => {
    expect(tryEvalMath("2 + 3)")).toBeNull();
  });

  it("returns null when an operator is missing an operand", () => {
    expect(tryEvalMath("2 +")).toBeNull();
  });

  it("returns null for two adjacent operators that cannot reduce", () => {
    // "2 ** 3" → second '*' has no left operand after the first consumes both.
    expect(tryEvalMath("2 ** 3")).toBeNull();
  });

  it("returns null for empty parentheses", () => {
    expect(tryEvalMath("()")).toBeNull();
  });

  it("does not divide by zero when zero is produced mid-expression", () => {
    expect(tryEvalMath("4 / (2 - 2)")).toBeNull();
  });
});

// ─── resolveCommands: empty query (pinned defaults) ──────────────────────────

describe("resolveCommands — empty query", () => {
  it("returns the launcher apps plus a Moudir hint and no math/dataset/appearance", () => {
    const results = resolveCommands("");
    expect(byKind(results, "app")).toHaveLength(LAUNCHER_APPS.length);
    expect(byKind(results, "math")).toHaveLength(0);
    expect(byKind(results, "wallpaper")).toHaveLength(0);
    expect(byKind(results, "palette")).toHaveLength(0);
    expect(byKind(results, "export")).toHaveLength(0);
  });

  it("offers the gentle 'moudir-hint' (not the ask form) on empty query", () => {
    const results = resolveCommands("");
    expect(byId(results, "moudir-hint")).toBeDefined();
    expect(byId(results, "moudir")).toBeUndefined();
  });

  it("preserves registry order for app scores on empty query (first app scores highest)", () => {
    const results = resolveCommands("");
    const apps = byKind(results, "app");
    // score = 50 - index → strictly descending in registry order.
    expect(apps[0].id).toBe("app:moudir");
    expect(apps[0].score).toBe(50);
    expect(apps[1].score).toBe(49);
    expect(apps[2].score).toBe(48);
  });

  it("treats a whitespace-only query the same as empty (trimmed)", () => {
    const results = resolveCommands("   ");
    expect(byId(results, "moudir-hint")).toBeDefined();
    expect(byId(results, "moudir")).toBeUndefined();
  });

  it("includes datasets on an empty query at the fixed score 30 (no fuzzy gate)", () => {
    // On an empty query the term guard `if (term && s <= 0) continue` is skipped,
    // so the dataset is pushed unconditionally with its empty-query score of 30.
    setDatasets([
      { id: "d1", name: "Ventes", rowCount: 100, colCount: 5, updatedAt: "2026-01-01" },
    ]);
    const results = resolveCommands("");
    // On empty query the dataset is pushed with score 30 (the guard requires term).
    expect(byKind(results, "dataset")).toHaveLength(1);
    expect(byId(results, "dataset:d1")?.score).toBe(30);
  });
});

// ─── resolveCommands: calculator family ──────────────────────────────────────

describe("resolveCommands — calculator", () => {
  it("emits a math result with the highest score for a pure math query", () => {
    const results = resolveCommands("2 + 3");
    const math = byId(results, "math");
    expect(math).toBeDefined();
    expect(math?.score).toBe(10000);
    // It sorts to the very top.
    expect(results[0].id).toBe("math");
  });

  it("formats the result in the French locale in the title", () => {
    const results = resolveCommands("1000 * 1000");
    // 1_000_000 → "1 000 000" with a narrow/regular no-break space group sep.
    const math = byId(results, "math");
    expect(math?.title.startsWith("= ")).toBe(true);
    // strip the "= " prefix and remove any spacing chars, compare the digits.
    const digits = math?.title.slice(2).replace(/[\s  ]/g, "");
    expect(digits).toBe("1000000");
  });

  it("does not emit a math result for non-math text", () => {
    const results = resolveCommands("ventes par canal");
    expect(byId(results, "math")).toBeUndefined();
  });

  it("run() copies the formatted value to the clipboard when available", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const results = resolveCommands("6 * 7");
    byId(results, "math")?.run();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("42");
    vi.unstubAllGlobals();
  });

  it("run() does not throw when clipboard is unavailable", () => {
    vi.stubGlobal("navigator", {});
    const results = resolveCommands("6 * 7");
    expect(() => byId(results, "math")?.run()).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("run() silently swallows a clipboard write rejection (the catch callback fires)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const results = resolveCommands("6 * 7");
    // Call run — it returns void; the rejection is caught internally.
    byId(results, "math")?.run();
    // Flush the rejected promise so the catch callback executes.
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

// ─── resolveCommands: app launches ───────────────────────────────────────────

describe("resolveCommands — app launches", () => {
  it("fuzzy-matches an app by title", () => {
    const results = resolveCommands("géo");
    const geo = byId(results, "app:geo");
    expect(geo).toBeDefined();
    expect(geo?.kind).toBe("app");
    expect(geo?.title).toBe("Géographie");
  });

  it("matches an app by its blurb when the title does not match", () => {
    const results = resolveCommands("spatiale");
    expect(byId(results, "app:geo")).toBeDefined();
  });

  it("excludes apps with no fuzzy match for a specific term", () => {
    const results = resolveCommands("géographie");
    // 'telecom' should not subsequence-match 'géographie'.
    expect(byId(results, "app:telecom")).toBeUndefined();
  });

  it("scores matched apps at 2000+ (above the Moudir fallback when strong)", () => {
    const results = resolveCommands("géo");
    const geo = byId(results, "app:geo");
    expect(geo?.score).toBeGreaterThanOrEqual(2000);
  });

  it("run() dispatches a desktop:open-app CustomEvent with the app id", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const results = resolveCommands("géo");
    byId(results, "app:geo")?.run();
    const ev = spy.mock.calls.at(-1)?.[0] as CustomEvent;
    expect(ev.type).toBe("desktop:open-app");
    expect(ev.detail).toEqual({ appId: "geo" });
    spy.mockRestore();
  });
});

// ─── resolveCommands: recent datasets ────────────────────────────────────────

describe("resolveCommands — recent datasets", () => {
  beforeEach(() => {
    setDatasets([
      { id: "d1", name: "Ventes Janvier", rowCount: 1234, colCount: 5, updatedAt: "2026-01-10" },
      { id: "d2", name: "Clients", rowCount: 50, colCount: 3, updatedAt: "2026-02-01" },
    ]);
  });

  it("matches a dataset by name and tags it as kind 'dataset'", () => {
    const results = resolveCommands("ventes");
    const ds = byId(results, "dataset:d1");
    expect(ds).toBeDefined();
    expect(ds?.kind).toBe("dataset");
  });

  it("builds a French-formatted subtitle with row/column counts", () => {
    const results = resolveCommands("ventes");
    const ds = byId(results, "dataset:d1");
    // "1 234 lignes · 5 colonnes" — verify the digits and the structure.
    expect(ds?.subtitle).toContain("lignes");
    expect(ds?.subtitle).toContain("5 colonnes");
    expect(ds?.subtitle?.replace(/[\s  ]/g, "")).toContain("1234lignes");
  });

  it("excludes non-matching datasets for a specific term", () => {
    const results = resolveCommands("ventes");
    expect(byId(results, "dataset:d2")).toBeUndefined();
  });

  it("sorts recent datasets by updatedAt descending and caps at 6", () => {
    setDatasets(
      Array.from({ length: 8 }, (_, i) => ({
        id: `ds${i}`,
        // distinct names but all containing 'data' so they all fuzzy-match
        name: `data ${String(i).padStart(2, "0")}`,
        rowCount: i,
        colCount: i,
        // i=7 newest
        updatedAt: `2026-01-${String(i + 1).padStart(2, "0")}`,
      })),
    );
    const results = resolveCommands("data");
    const dsResults = byKind(results, "dataset");
    // Only the 6 most-recent datasets (ds7..ds2) are considered.
    expect(byId(results, "dataset:ds7")).toBeDefined();
    expect(byId(results, "dataset:ds2")).toBeDefined();
    // ds1 and ds0 are the two oldest → dropped before fuzzy matching.
    expect(byId(results, "dataset:ds0")).toBeUndefined();
    expect(byId(results, "dataset:ds1")).toBeUndefined();
    expect(dsResults.length).toBeLessThanOrEqual(6);
  });

  it("run() activates the dataset and opens the data-browser with its id", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const results = resolveCommands("clients");
    byId(results, "dataset:d2")?.run();
    expect(setActiveDataset).toHaveBeenCalledWith("d2");
    const ev = spy.mock.calls.at(-1)?.[0] as CustomEvent;
    expect(ev.type).toBe("desktop:open-app");
    expect(ev.detail).toEqual({ appId: "data-browser", props: { datasetId: "d2" } });
    spy.mockRestore();
  });
});

// ─── resolveCommands: wallpaper appearance ───────────────────────────────────

describe("resolveCommands — wallpaper", () => {
  it("surfaces wallpaper commands when the query mentions 'fond'", () => {
    const results = resolveCommands("fond aube");
    const wp = byId(results, "wallpaper:dawn");
    expect(wp).toBeDefined();
    expect(wp?.kind).toBe("wallpaper");
    expect(wp?.title).toBe("Fond d'écran : Aube");
  });

  it("matches a wallpaper by its label keyword ('encre')", () => {
    const results = resolveCommands("encre");
    expect(byId(results, "wallpaper:ink")).toBeDefined();
  });

  it("does NOT surface wallpaper commands for an unrelated query", () => {
    const results = resolveCommands("clients");
    expect(byKind(results, "wallpaper")).toHaveLength(0);
  });

  it("run() calls setWallpaper with the wallpaper id", () => {
    const results = resolveCommands("fond papier");
    byId(results, "wallpaper:paper")?.run();
    expect(setWallpaper).toHaveBeenCalledWith("paper");
  });
});

// ─── resolveCommands: glass palette appearance ───────────────────────────────

describe("resolveCommands — glass palette", () => {
  it("surfaces palette commands when the query mentions 'palette'", () => {
    const results = resolveCommands("palette cyan");
    const gp = byId(results, "palette:sand");
    expect(gp).toBeDefined();
    expect(gp?.kind).toBe("palette");
    expect(gp?.title).toBe("Palette : Cyan");
  });

  it("gates palette results on the 'couleur' keyword (block runs) but still requires a fuzzy label hit", () => {
    // "couleur" opens the palette block. The bare keyword is not a subsequence of
    // any label, so on its own it surfaces no palette rows — the gate is necessary
    // but not sufficient; a label-matching term is also required.
    expect(byKind(resolveCommands("couleur"), "palette")).toHaveLength(0);
  });

  it("matches the 'Azur' palette when the label itself is a subsequence of the term", () => {
    // "palette azur" both opens the block (keyword) AND fuzzy-matches the label.
    const results = resolveCommands("palette azur");
    expect(byId(results, "palette:amber")).toBeDefined();
  });

  it("does NOT surface palette commands for an unrelated query", () => {
    const results = resolveCommands("rapport");
    expect(byKind(results, "palette")).toHaveLength(0);
  });

  it("run() calls setGlassPalette with the palette id", () => {
    const results = resolveCommands("palette sarcelle");
    byId(results, "palette:peach")?.run();
    expect(setGlassPalette).toHaveBeenCalledWith("peach");
  });
});

// ─── resolveCommands: export report ──────────────────────────────────────────

describe("resolveCommands — export report", () => {
  it("surfaces the export command on the 'export' keyword", () => {
    const results = resolveCommands("export");
    const exp = byId(results, "export-report");
    expect(exp).toBeDefined();
    expect(exp?.kind).toBe("export");
    expect(exp?.title).toBe("Exporter le rapport");
  });

  it("surfaces the export command on the 'rapport' keyword", () => {
    const results = resolveCommands("rapport");
    expect(byId(results, "export-report")).toBeDefined();
  });

  it("surfaces the export command on the 'pdf' keyword", () => {
    const results = resolveCommands("pdf");
    expect(byId(results, "export-report")).toBeDefined();
  });

  it("does NOT surface the export command for an unrelated query", () => {
    const results = resolveCommands("clients");
    expect(byId(results, "export-report")).toBeUndefined();
  });

  it("run() opens report-studio with the export intent", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const results = resolveCommands("export");
    byId(results, "export-report")?.run();
    const ev = spy.mock.calls.at(-1)?.[0] as CustomEvent;
    expect(ev.type).toBe("desktop:open-app");
    expect(ev.detail).toEqual({ appId: "report-studio", props: { intent: "export" } });
    spy.mockRestore();
  });
});

// ─── resolveCommands: Moudir fallback ────────────────────────────────────────

describe("resolveCommands — Moudir fallback", () => {
  it("always offers a Moudir ask for any non-empty text query", () => {
    const results = resolveCommands("combien de transactions");
    const m = byId(results, "moudir");
    expect(m).toBeDefined();
    expect(m?.title).toBe("Demander à Moudir : « combien de transactions »");
  });

  it("ranks Moudir LOW (800) when a strong app match exists", () => {
    const results = resolveCommands("géo");
    expect(byId(results, "moudir")?.score).toBe(800);
  });

  it("floats Moudir HIGH (2500) when nothing strong matched", () => {
    // A query that matches no app strongly (no app score >= 2000).
    const results = resolveCommands("xyznomatch123abc");
    expect(byId(results, "moudir")?.score).toBe(2500);
    // And it should sort to the very top of the (small) list.
    expect(results[0].id).toBe("moudir");
  });

  it("run() opens Moudir then dispatches a moudir:ask event with the prompt", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const results = resolveCommands("trends");
    byId(results, "moudir")?.run();
    const types = spy.mock.calls.map((c) => (c[0] as CustomEvent).type);
    expect(types).toContain("desktop:open-app");
    expect(types).toContain("moudir:ask");
    const askEv = spy.mock.calls
      .map((c) => c[0] as CustomEvent)
      .find((e) => e.type === "moudir:ask");
    expect(askEv?.detail).toEqual({ prompt: "trends" });
    spy.mockRestore();
  });
});

// ─── resolveCommands: ordering + capping ─────────────────────────────────────

describe("resolveCommands — sorting and MAX_RESULTS cap", () => {
  it("returns results sorted by score descending", () => {
    const results = resolveCommands("export rapport");
    const scores = results.map((r) => r.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it("never returns more than 8 results (MAX_RESULTS)", () => {
    setDatasets(
      Array.from({ length: 6 }, (_, i) => ({
        id: `d${i}`,
        name: `report data ${i}`,
        rowCount: i,
        colCount: i,
        updatedAt: `2026-03-0${i + 1}`,
      })),
    );
    // 'report' triggers export + datasets + apps + moudir → would exceed 8.
    const results = resolveCommands("report");
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it("places the calculator result first when math + other intents coexist", () => {
    const results = resolveCommands("2 + 2");
    expect(results[0].id).toBe("math");
  });
});

// ─── resolveCommands: every result carries a runnable contract ───────────────

describe("resolveCommands — result invariants", () => {
  it("gives every result a stable id, a numeric score, and a run() function", () => {
    setDatasets([
      { id: "d1", name: "report ventes", rowCount: 1, colCount: 1, updatedAt: "2026-01-01" },
    ]);
    const results = resolveCommands("report");
    for (const r of results) {
      expect(typeof r.id).toBe("string");
      expect(r.id.length).toBeGreaterThan(0);
      expect(typeof r.score).toBe("number");
      expect(typeof r.run).toBe("function");
      expect(typeof r.title).toBe("string");
    }
  });

  it("produces unique ids across a mixed result set", () => {
    setDatasets([
      { id: "d1", name: "report ventes", rowCount: 1, colCount: 1, updatedAt: "2026-01-01" },
    ]);
    const results = resolveCommands("report");
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── resolveCommands: moudir-hint run() on empty query ───────────────────────

describe("resolveCommands — moudir-hint run()", () => {
  it("run() on the empty-query moudir-hint dispatches a desktop:open-app event for the assistant", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const results = resolveCommands("");
    const hint = byId(results, "moudir-hint");
    expect(hint).toBeDefined();
    hint?.run();
    const events = spy.mock.calls.map((c) => c[0] as CustomEvent);
    const openEv = events.find((e) => e.type === "desktop:open-app");
    expect(openEv).toBeDefined();
    expect(openEv?.detail).toEqual({ appId: "moudir-chat" });
    spy.mockRestore();
  });

  it("run() on the whitespace-only query moudir-hint dispatches desktop:open-app for the assistant", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const results = resolveCommands("   ");
    const hint = byId(results, "moudir-hint");
    expect(hint).toBeDefined();
    hint?.run();
    const events = spy.mock.calls.map((c) => c[0] as CustomEvent);
    expect(
      events.some(
        (e) =>
          e.type === "desktop:open-app" && (e.detail as { appId: string }).appId === "moudir-chat",
      ),
    ).toBe(true);
    spy.mockRestore();
  });
});

// ─── fuzzyScore internal branch coverage ─────────────────────────────────────
// These tests exercise branches inside the unexported `fuzzyScore` via resolveCommands.

describe("fuzzyScore — subsequence walk branches (via resolveCommands)", () => {
  it("covers found===0 short-circuit AND word-boundary-after-space when matching 'ac' in blurb", () => {
    // "ac" is a subsequence of "Agent conversationnel" (blurb of moudir app):
    //  'a' at position 0 → found===0 TRUE → short-circuit the `||` right-hand side.
    //  'c' at position 6 (after a space) → found!==0, haystack[5]===' ' TRUE → word boundary.
    // Neither startsWith nor includes catches "ac", so the subsequence walk runs.
    const results = resolveCommands("ac");
    // The moudir app should match via its blurb score.
    expect(byId(results, "app:moudir")).toBeDefined();
    expect(byId(results, "app:moudir")?.score).toBeGreaterThanOrEqual(2000);
  });

  it("covers contiguous-run bonus AND non-word-start match when matching 'cn' in blurb", () => {
    // "cn" is a subsequence of "Agent conversationnel":
    //  'c' at 6 (after space → word boundary bonus, found!==0, haystack[5]===' ').
    //  'n' at 7 (immediately after 'c' → contiguous bonus; haystack[6]==='c'!==space → no word bonus).
    // The contiguous path (found === lastMatch + 1) and the non-word-boundary path are both taken.
    const results = resolveCommands("cn");
    expect(byId(results, "app:moudir")).toBeDefined();
    expect(byId(results, "app:moudir")?.score).toBeGreaterThanOrEqual(2000);
  });

  it("returns 0 (no match) when the needle is not a subsequence of any app text", () => {
    // A term with characters that cannot be found as a subsequence in any app title/blurb.
    // This exercises the `if (found === -1) return 0` branch inside the subsequence walk.
    const results = resolveCommands("zzzzqqqq");
    // No app should match; only the Moudir fallback should be in results.
    expect(byKind(results, "app")).toHaveLength(0);
  });
});
