import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for insight-agent.ts, the opt-in "Analyser" call that grounds a
 * short LLM-written analysis strictly in the chart's own aggregated rows.
 *
 * The only collaborator boundary is `resolveRuntime` (derive-agent.ts), which
 * hands back a provider stub whose `generateStructured` delegates to the spy
 * below — no real model/provider registry is touched.
 */

const generateStructured = vi.fn();
const resolveRuntimeMock = vi.fn();
vi.mock("@/features/data-formulator/core/formulator/derive-agent", () => ({
  resolveRuntime: () => resolveRuntimeMock(),
}));

import {
  ChartInsightSchema,
  generateChartInsight,
} from "@/features/data-formulator/core/formulator/insight-agent";
import type { TableNode } from "@/features/data-formulator/core/formulator/model";
import { safeJsonStringify } from "@/features/data-formulator/core/json";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const node: TableNode = {
  id: "t1",
  name: "ventes_par_canal",
  kind: "derived",
  parentId: "root",
  engine: "sql",
  code: "SELECT 1",
  columns: [],
  rowCount: 120,
  createdAt: 0,
};

const validInsight = { headline: "Le canal SMS domine.", bullets: ["a", "b"], caveat: "" };

beforeEach(() => {
  generateStructured.mockReset();
  resolveRuntimeMock.mockReset();
  resolveRuntimeMock.mockResolvedValue({
    provider: { generateStructured: (req: unknown, schema: unknown) => generateStructured(req, schema) },
    model: "stub.gguf",
  });
});

// ─── generateChartInsight ──────────────────────────────────────────────────────

describe("generateChartInsight", () => {
  it("grounds the prompt in the node name, row count, chart type and instruction, and returns the parsed insight", async () => {
    // Parse through the REAL schema, proving it accepts a well-formed reply
    // (as the grammar lane would).
    generateStructured.mockImplementation(async (_req, schema) =>
      (schema as typeof ChartInsightSchema).parse(validInsight),
    );
    const rows = [
      { canal: "USSD", n: 12 },
      { canal: "SMS", n: 8 },
    ];

    const result = await generateChartInsight({
      node,
      chartType: "bar",
      rows,
      instruction: "compare les canaux",
    });

    expect(result).toEqual(validInsight);
    const [req, schema] = generateStructured.mock.calls[0];
    expect(schema).toBe(ChartInsightSchema);
    expect(req.model).toBe("stub.gguf");
    expect(req.maxTokens).toBe(512);
    expect(req.temperature).toBe(0.2);
    expect(req.system).toContain("Answer in French");
    expect(req.prompt).toContain("Table: ventes_par_canal (120 lignes source)");
    expect(req.prompt).toContain("Question d'origine: compare les canaux");
    expect(req.prompt).toContain("Type de graphique: bar");
    expect(req.prompt).toContain("Données du graphique (2 lignes):");
    expect(req.prompt).toContain(safeJsonStringify(rows));
    expect(req.prompt).toContain("Analyse ces données.");
  });

  it("omits the instruction line entirely when none is given", async () => {
    generateStructured.mockResolvedValue(validInsight);

    await generateChartInsight({ node, chartType: "line", rows: [{ a: 1 }] });

    const [req] = generateStructured.mock.calls[0];
    expect(req.prompt).not.toContain("Question d'origine");
  });

  it("clamps the embedded sample to 30 rows and notes the truncation in the prompt", async () => {
    generateStructured.mockResolvedValue(validInsight);
    const rows = Array.from({ length: 35 }, (_, i) => ({ i }));

    await generateChartInsight({ node, chartType: "bar", rows });

    const [req] = generateStructured.mock.calls[0];
    expect(req.prompt).toContain("Données du graphique (30 sur 35 lignes):");
    expect(req.prompt).toContain(safeJsonStringify(rows.slice(0, 30)));
    expect(req.prompt).not.toContain(safeJsonStringify(rows.slice(0, 31)));
  });

  it("does not mention a truncation when the rows already fit within the cap", async () => {
    generateStructured.mockResolvedValue(validInsight);
    const rows = Array.from({ length: 5 }, (_, i) => ({ i }));

    await generateChartInsight({ node, chartType: "bar", rows });

    const [req] = generateStructured.mock.calls[0];
    expect(req.prompt).toContain("Données du graphique (5 lignes):");
    expect(req.prompt).not.toContain(" sur ");
  });

  it("forwards the abort signal to the underlying provider call", async () => {
    generateStructured.mockResolvedValue(validInsight);
    const controller = new AbortController();

    await generateChartInsight({
      node,
      chartType: "bar",
      rows: [{ a: 1 }],
      signal: controller.signal,
    });

    const [req] = generateStructured.mock.calls[0];
    expect(req.signal).toBe(controller.signal);
  });

  it("propagates a resolveRuntime failure (no offline model ready) to the caller", async () => {
    resolveRuntimeMock.mockRejectedValue(new Error("No offline AI model is ready"));

    await expect(generateChartInsight({ node, chartType: "bar", rows: [] })).rejects.toThrow(
      "No offline AI model is ready",
    );
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
