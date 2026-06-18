import { describe, expect, it } from "vitest";
import { validateArtifact } from "@/features/data-formulator/core/swarm/agents/validate";
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
  model: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
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
});
