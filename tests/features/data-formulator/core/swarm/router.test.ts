import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the Tier-0 question router (zero LLM calls).
 *
 * The router classifies a prompt via MiniLM embeddings + cosine similarity into
 * navigate / lookup / analysis. We mock the embeddings boundary (`embedRaw`) and
 * the route registry so the routing DECISIONS are deterministic and independent
 * of any model. The cosine math and tier-selection thresholds are the real code.
 *
 * Embedding strategy: we hand back unit-axis vectors so cosine similarity is
 * exactly controllable. `embedRaw` is invoked for the exemplar corpora at warm
 * time and once per query; we route by which axis a text aligns with.
 */

// ── Boundaries ───────────────────────────────────────────────────────────────
const embedRaw = vi.fn<(texts: string[]) => Promise<Float32Array[]>>();

// Two fake routes; the first is the "monitor", the second the "report".
const APP_ROUTES = [
  { path: "/dashboard/monitor", label: "Monitor", hint: "live monitor watch" },
  { path: "/dashboard/report", label: "Report", hint: "telecom report grid" },
];
const resolveRoute = vi.fn<(target: string) => unknown>();

vi.mock("@/platform/ai/embeddings", () => ({
  embedRaw: (texts: string[]) => embedRaw(texts),
}));

vi.mock("@/features/data-formulator/core/navigator/routes", () => ({
  APP_ROUTES,
  resolveRoute: (target: string) => resolveRoute(target),
}));

// Import after mocks so the module binds to them. Module-level `cache` persists
// across tests, so we reset modules between cases that need a fresh warm.
let classifyTier: typeof import("@/features/data-formulator/core/swarm/router").classifyTier;
let routeQuestion: typeof import("@/features/data-formulator/core/swarm/router").routeQuestion;
let warmRouter: typeof import("@/features/data-formulator/core/swarm/router").warmRouter;

/**
 * Build a vector aligned to one axis. Dimension 0 = navigate(monitor),
 * 1 = navigate(report), 2 = lookup, 3 = analysis. The magnitude controls the
 * resulting cosine score against a same-axis exemplar.
 */
function axis(index: number, magnitude = 1): Float32Array {
  const v = new Float32Array(4);
  v[index] = magnitude;
  return v;
}

/**
 * Default embedding behavior: exemplar corpora map each input to its own axis;
 * the per-query call is configured per test via `embedRaw.mockResolvedValueOnce`.
 *
 * warmRouter calls embedRaw three times (nav, lookup, analysis exemplars).
 */
function primeWarmCorpora() {
  // nav exemplars -> one per APP_ROUTES entry, aligned to axes 0 and 1.
  embedRaw.mockResolvedValueOnce([axis(0), axis(1)]);
  // lookup exemplars (6 utterances) -> all on axis 2.
  embedRaw.mockResolvedValueOnce(Array.from({ length: 6 }, () => axis(2)));
  // analysis exemplars (5 utterances) -> all on axis 3.
  embedRaw.mockResolvedValueOnce(Array.from({ length: 5 }, () => axis(3)));
}

beforeEach(async () => {
  vi.resetModules();
  embedRaw.mockReset();
  resolveRoute.mockReset();
  resolveRoute.mockReturnValue(null);
  const mod = await import("@/features/data-formulator/core/swarm/router");
  classifyTier = mod.classifyTier;
  routeQuestion = mod.routeQuestion;
  warmRouter = mod.warmRouter;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("classifyTier", () => {
  it("classifies a strong navigation query as navigate with the matched route index", async () => {
    primeWarmCorpora();
    embedRaw.mockResolvedValueOnce([axis(1)]); // query aligns to the second route

    const r = await classifyTier("open the report");

    expect(r.tier).toBe("navigate");
    expect(r.navIdx).toBe(1);
    expect(r.score).toBeCloseTo(1, 5);
  });

  it("classifies a data question that aligns to lookup as lookup", async () => {
    primeWarmCorpora();
    embedRaw.mockResolvedValueOnce([axis(2)]); // pure lookup axis

    const r = await classifyTier("top 5 channels by volume");

    expect(r.tier).toBe("lookup");
    expect(r.navIdx).toBe(-1);
    expect(r.score).toBeCloseTo(1, 5);
  });

  it("classifies a causal question that aligns to analysis as analysis", async () => {
    primeWarmCorpora();
    embedRaw.mockResolvedValueOnce([axis(3)]);

    const r = await classifyTier("why did the success rate drop");

    expect(r.tier).toBe("analysis");
    expect(r.navIdx).toBe(-1);
  });

  it("escalates to analysis when navigation similarity is below the 0.5 threshold", async () => {
    primeWarmCorpora();
    // Weak nav alignment (0.4) plus equal weak lookup/analysis: nav must lose.
    const q = new Float32Array([0.4, 0, 0.3, 0.45]);
    embedRaw.mockResolvedValueOnce([q]);

    const r = await classifyTier("vaguely worded request");

    expect(r.tier).not.toBe("navigate");
    expect(r.tier).toBe("analysis");
  });

  it("prefers lookup over analysis when lookup similarity is strictly higher", async () => {
    primeWarmCorpora();
    // Below nav threshold; lookup component > analysis component.
    const q = new Float32Array([0, 0, 0.9, 0.2]);
    embedRaw.mockResolvedValueOnce([q]);

    const r = await classifyTier("a data question");

    expect(r.tier).toBe("lookup");
  });

  it("falls back to analysis on a lookup/analysis tie (analysis is the safe default)", async () => {
    primeWarmCorpora();
    const q = new Float32Array([0, 0, 0.5, 0.5]); // equal lookup & analysis
    embedRaw.mockResolvedValueOnce([q]);

    const r = await classifyTier("ambiguous question");

    expect(r.tier).toBe("analysis");
  });

  it("only embeds the exemplar corpora once across repeated classifications (warm cache)", async () => {
    primeWarmCorpora();
    embedRaw.mockResolvedValueOnce([axis(2)]);
    embedRaw.mockResolvedValueOnce([axis(3)]);

    await classifyTier("first question");
    await classifyTier("second question");

    // 3 warm corpora calls + 1 per query = 5 total, NOT re-warmed.
    expect(embedRaw).toHaveBeenCalledTimes(5);
  });
});

describe("routeQuestion", () => {
  it("resolves the destination route object for a navigate classification", async () => {
    primeWarmCorpora();
    embedRaw.mockResolvedValueOnce([axis(0)]); // aligns to the monitor route

    const r = await routeQuestion("take me to the monitor");

    expect(r.tier).toBe("navigate");
    if (r.tier === "navigate") {
      expect(r.route.path).toBe("/dashboard/monitor");
      expect(r.route.label).toBe("Monitor");
    }
  });

  it("returns a lookup tier with no route for a lookup classification", async () => {
    primeWarmCorpora();
    embedRaw.mockResolvedValueOnce([axis(2)]);

    const r = await routeQuestion("count transactions today");

    expect(r).toEqual({ tier: "lookup" });
  });

  it("returns an analysis tier for an analysis classification", async () => {
    primeWarmCorpora();
    embedRaw.mockResolvedValueOnce([axis(3)]);

    const r = await routeQuestion("explain the drop in revenue");

    expect(r).toEqual({ tier: "analysis" });
  });

  it("routes a below-threshold prompt to analysis (never auto-navigates on weak match)", async () => {
    primeWarmCorpora();
    // Weak nav signal (0.3 < 0.5 threshold) with a slightly stronger analysis lean.
    embedRaw.mockResolvedValueOnce([new Float32Array([0.3, 0, 0.2, 0.4])]);

    const r = await routeQuestion("something only loosely about the monitor");

    expect(r).toEqual({ tier: "analysis" });
  });
});

describe("warmRouter", () => {
  it("precomputes all three exemplar corpora exactly once and is idempotent", async () => {
    primeWarmCorpora();

    await warmRouter();
    await warmRouter();

    expect(embedRaw).toHaveBeenCalledTimes(3);
  });
});

// ── Additional branch-coverage tests ─────────────────────────────────────────

describe("cosine — zero-vector guard (denom === 0 branch)", () => {
  it("returns a score of 0 when the query is a zero vector (avoids division by zero)", async () => {
    // Prime warm with axis vectors so cosine is exercised against a zero query.
    primeWarmCorpora();
    // A zero vector has magnitude 0 → denom === 0 → cosine must return 0.
    const zeroVec = new Float32Array(4); // all zeros
    embedRaw.mockResolvedValueOnce([zeroVec]);

    const r = await classifyTier("empty embedding");

    // navBest=0, lookupBest=0, analysisBest=0 → falls to analysis (tie/low confidence).
    expect(r.tier).toBe("analysis");
    expect(r.score).toBe(0);
  });
});

describe("classifyTier — empty navVecs branch (navScores.length === 0)", () => {
  it("returns 0 for navBest when the nav exemplar list is empty", async () => {
    // Make warmRouter store an empty navVecs array by returning [] for the nav corpus.
    embedRaw.mockResolvedValueOnce([]); // nav corpora → 0 nav vecs
    embedRaw.mockResolvedValueOnce(Array.from({ length: 6 }, () => axis(2))); // lookup
    embedRaw.mockResolvedValueOnce(Array.from({ length: 5 }, () => axis(3))); // analysis

    // Query strongly aligned to lookup axis so we get a deterministic tier.
    embedRaw.mockResolvedValueOnce([axis(2)]);

    const r = await classifyTier("top 5 channels");

    // With no nav vecs, navBest must be 0 (the else branch). Lookup wins.
    expect(r.tier).toBe("lookup");
  });
});

describe("routeQuestion — navigate fallback paths", () => {
  it("calls resolveRoute when navIdx is out of APP_ROUTES bounds and returns its result", async () => {
    // Prime warm with THREE nav vecs even though APP_ROUTES only has two entries.
    // The third vec (axis 5, but we use a 5-dim vec aligned to index 4) will win.
    const extra = new Float32Array(5);
    extra[4] = 1; // dimension outside the 4-dim test space → unique axis
    embedRaw.mockResolvedValueOnce([axis(0), axis(1), extra]); // 3 nav vecs
    embedRaw.mockResolvedValueOnce(Array.from({ length: 6 }, () => axis(2)));
    embedRaw.mockResolvedValueOnce(Array.from({ length: 5 }, () => axis(3)));

    // Query aligns with `extra` — index 2 in navScores, which is out of APP_ROUTES.
    embedRaw.mockResolvedValueOnce([extra]);

    const fakeRoute = { path: "/dashboard/monitor", label: "Monitor", hint: "" };
    resolveRoute.mockReturnValue(fakeRoute);

    const r = await routeQuestion("navigate to the third thing");

    // APP_ROUTES[2] is undefined → ?? resolveRoute(...) is called.
    expect(resolveRoute).toHaveBeenCalledWith("navigate to the third thing");
    expect(r.tier).toBe("navigate");
    if (r.tier === "navigate") {
      expect(r.route).toBe(fakeRoute);
    }
  });

  it("falls back to analysis when navIdx is out of bounds AND resolveRoute returns null", async () => {
    const extra = new Float32Array(5);
    extra[4] = 1;
    embedRaw.mockResolvedValueOnce([axis(0), axis(1), extra]);
    embedRaw.mockResolvedValueOnce(Array.from({ length: 6 }, () => axis(2)));
    embedRaw.mockResolvedValueOnce(Array.from({ length: 5 }, () => axis(3)));

    embedRaw.mockResolvedValueOnce([extra]);

    // resolveRoute already returns null by default (reset in beforeEach).
    resolveRoute.mockReturnValue(null);

    const r = await routeQuestion("navigate to something unknown");

    expect(resolveRoute).toHaveBeenCalled();
    // route is null → { tier: "analysis" }
    expect(r).toEqual({ tier: "analysis" });
  });
});
