import { describe, expect, it } from "vitest";
import { isHighRisk, validateArtifact } from "@/features/data-formulator/core/swarm/agents/validate";
import type { Artifact, SwarmContext } from "@/features/data-formulator/core/swarm/types";

const ctx = {
  datasetId: "d1",
  datasetName: "tx",
  tableName: "tx_view",
  columns: [
    { name: "channel", type: "string" },
    { name: "amount", type: "number" },
  ],
  rowSample: [],
  rowCount: 100,
  model: "gemma-4-e4b-it-q4_k_m.gguf",
} as unknown as SwarmContext;

function chart(rows: Record<string, unknown>[], field: string): Artifact {
  return {
    kind: "chart",
    id: "a1",
    taskId: "t1",
    title: "c",
    spec: {
      id: "s1",
      type: "bar",
      title: "c",
      limit: 50,
      filters: [],
      encodings: [{ id: "e1", channel: "x", field }],
    },
    rows,
  } as Artifact;
}

describe("validateArtifact", () => {
  it("hard-fails a chart that encodes a non-existent column", () => {
    const r = validateArtifact(chart([{ channel: "A" }], "nope"), ctx);
    expect(r.hardFail).toBe(true);
    expect(r.reasons[0]).toMatch(/non-existent column/);
  });
  it("hard-fails an empty table", () => {
    const r = validateArtifact(
      { kind: "table", id: "a", taskId: "t", title: "t", rows: [] } as Artifact,
      ctx,
    );
    expect(r.hardFail).toBe(true);
  });
  it("passes a chart over a real column with rows", () => {
    const r = validateArtifact(chart([{ channel: "A" }], "channel"), ctx);
    expect(r.hardFail).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });
  it("hard-fails a KPI with a non-finite delta", () => {
    const r = validateArtifact(
      {
        kind: "kpi",
        id: "a",
        taskId: "t",
        title: "k",
        label: "L",
        value: "5",
        delta: Number.NaN,
      } as Artifact,
      ctx,
    );
    expect(r.hardFail).toBe(true);
  });

  it("hard-fails a chart with no rows", () => {
    const r = validateArtifact(chart([], "channel"), ctx);
    expect(r.hardFail).toBe(true);
    expect(r.reasons[0]).toMatch(/no rows/);
  });

  it("passes a table with rows", () => {
    const r = validateArtifact(
      { kind: "table", id: "a", taskId: "t", title: "t", rows: [{ channel: "A" }] } as Artifact,
      ctx,
    );
    expect(r.hardFail).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });

  it("hard-fails a KPI with an empty value", () => {
    const r = validateArtifact(
      {
        kind: "kpi",
        id: "a",
        taskId: "t",
        title: "k",
        label: "L",
        value: "   ",
        delta: undefined,
      } as unknown as Artifact,
      ctx,
    );
    expect(r.hardFail).toBe(true);
    expect(r.reasons[0]).toMatch(/empty value/);
  });

  it("passes a KPI with a valid value and no delta", () => {
    const r = validateArtifact(
      {
        kind: "kpi",
        id: "a",
        taskId: "t",
        title: "k",
        label: "L",
        value: "42",
        delta: undefined,
      } as unknown as Artifact,
      ctx,
    );
    expect(r.hardFail).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });

  it("passes a KPI with a finite delta", () => {
    const r = validateArtifact(
      {
        kind: "kpi",
        id: "a",
        taskId: "t",
        title: "k",
        label: "L",
        value: "42",
        delta: 3.14,
      } as Artifact,
      ctx,
    );
    expect(r.hardFail).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });

  it("hard-fails an insight with an empty body", () => {
    const r = validateArtifact(
      {
        kind: "insight",
        id: "a",
        taskId: "t",
        title: "i",
        body: "   ",
      } as Artifact,
      ctx,
    );
    expect(r.hardFail).toBe(true);
    expect(r.reasons[0]).toMatch(/empty body/);
  });

  it("passes an insight with a non-empty body", () => {
    const r = validateArtifact(
      {
        kind: "insight",
        id: "a",
        taskId: "t",
        title: "i",
        body: "Some interesting observation.",
      } as Artifact,
      ctx,
    );
    expect(r.hardFail).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });
});

describe("isHighRisk", () => {
  it("returns true for insight artifacts", () => {
    const artifact = {
      kind: "insight",
      id: "a",
      taskId: "t",
      title: "i",
      body: "Some text.",
    } as Artifact;
    expect(isHighRisk(artifact)).toBe(true);
  });

  it("returns false for table artifacts", () => {
    const artifact = {
      kind: "table",
      id: "a",
      taskId: "t",
      title: "t",
      rows: [],
    } as Artifact;
    expect(isHighRisk(artifact)).toBe(false);
  });

  it("returns false for chart artifacts", () => {
    expect(isHighRisk(chart([{ channel: "A" }], "channel"))).toBe(false);
  });

  it("returns false for kpi artifacts", () => {
    const artifact = {
      kind: "kpi",
      id: "a",
      taskId: "t",
      title: "k",
      label: "L",
      value: "42",
    } as Artifact;
    expect(isHighRisk(artifact)).toBe(false);
  });
});
