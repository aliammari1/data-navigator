import { describe, expect, it } from "vitest";
import {
  childrenOf,
  lineagePath,
  sanitizeName,
  type TableNode,
} from "@/features/data-formulator/core/formulator/model";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function node(overrides: Partial<TableNode> & Pick<TableNode, "id" | "parentId">): TableNode {
  return {
    name: overrides.id,
    kind: overrides.kind ?? (overrides.parentId ? "derived" : "original"),
    columns: [],
    rowCount: 0,
    createdAt: 0,
    ...overrides,
  };
}

// ─── lineagePath ──────────────────────────────────────────────────────────────

describe("lineagePath", () => {
  it("returns just the root when the leaf has no parent", () => {
    const nodes = [node({ id: "root", parentId: null })];
    expect(lineagePath(nodes, "root").map((n) => n.id)).toEqual(["root"]);
  });

  it("walks parentId links from leaf up to the root, oldest first", () => {
    const nodes = [
      node({ id: "root", parentId: null }),
      node({ id: "mid", parentId: "root" }),
      node({ id: "leaf", parentId: "mid" }),
    ];
    expect(lineagePath(nodes, "leaf").map((n) => n.id)).toEqual(["root", "mid", "leaf"]);
  });

  it("returns an empty array when the leafId does not exist", () => {
    const nodes = [node({ id: "root", parentId: null })];
    expect(lineagePath(nodes, "missing")).toEqual([]);
  });

  it("stops rather than looping forever on a corrupt cycle", () => {
    // a -> b -> a: a corrupt graph that would infinite-loop without the `seen` guard.
    const nodes = [node({ id: "a", parentId: "b" }), node({ id: "b", parentId: "a" })];
    const path = lineagePath(nodes, "a");
    // Must terminate and contain each node at most once.
    expect(path.length).toBeLessThanOrEqual(2);
    expect(new Set(path.map((n) => n.id)).size).toBe(path.length);
  });
});

// ─── childrenOf ───────────────────────────────────────────────────────────────

describe("childrenOf", () => {
  it("returns direct children of a parent id", () => {
    const nodes = [
      node({ id: "root", parentId: null }),
      node({ id: "child1", parentId: "root" }),
      node({ id: "child2", parentId: "root" }),
      node({ id: "grandchild", parentId: "child1" }),
    ];
    expect(childrenOf(nodes, "root").map((n) => n.id).sort()).toEqual(["child1", "child2"]);
  });

  it("returns an empty array when the node has no children (leaf)", () => {
    const nodes = [node({ id: "root", parentId: null }), node({ id: "leaf", parentId: "root" })];
    expect(childrenOf(nodes, "leaf")).toEqual([]);
  });

  it("treats >1 child as thread branching", () => {
    const nodes = [
      node({ id: "root", parentId: null }),
      node({ id: "branch-a", parentId: "root" }),
      node({ id: "branch-b", parentId: "root" }),
    ];
    expect(childrenOf(nodes, "root").length).toBeGreaterThan(1);
  });
});

// ─── sanitizeName ─────────────────────────────────────────────────────────────

describe("sanitizeName", () => {
  it("lowercases a simple ASCII name", () => {
    expect(sanitizeName("VentesParMois", "fallback")).toBe("ventesparmois");
  });

  it("strips accents/diacritics via NFD normalization", () => {
    // "ventes_échec" -> the combining accent on é is stripped, leaving 'e'.
    expect(sanitizeName("échec_taux", "fallback")).toBe("echec_taux");
  });

  it("replaces runs of non-alphanumeric characters with a single underscore", () => {
    expect(sanitizeName("ventes par mois!!", "fallback")).toBe("ventes_par_mois");
  });

  it("collapses multiple consecutive invalid characters into one underscore", () => {
    expect(sanitizeName("a---b   c", "fallback")).toBe("a_b_c");
  });

  it("trims leading and trailing underscores produced by leading/trailing punctuation", () => {
    expect(sanitizeName("!!!ventes!!!", "fallback")).toBe("ventes");
  });

  it("falls back when the cleaned result is empty (all characters stripped)", () => {
    expect(sanitizeName("!!!???", "fallback_name")).toBe("fallback_name");
  });

  it("falls back for an empty input string", () => {
    expect(sanitizeName("", "fallback_name")).toBe("fallback_name");
  });

  it("caps the result at 64 characters", () => {
    const long = "a".repeat(100);
    const result = sanitizeName(long, "fallback");
    expect(result.length).toBe(64);
    expect(result).toBe("a".repeat(64));
  });

  it("preserves underscores and digits already present", () => {
    expect(sanitizeName("taux_echec_2026", "fallback")).toBe("taux_echec_2026");
  });
});
