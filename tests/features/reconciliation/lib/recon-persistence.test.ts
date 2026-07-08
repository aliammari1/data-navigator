import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the storage layer ────────────────────────────────────────────────────
// The target module (recon-persistence.ts) calls putReportDefinition,
// listReportDefinitions, deleteReportDefinition, and newId from @/platform/storage.
// We hoist fake implementations so the module-under-test never reaches IndexedDB.
const {
  mockPut,
  mockList,
  mockDelete,
  mockNewId,
} = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockList: vi.fn(),
  mockDelete: vi.fn(),
  mockNewId: vi.fn(),
}));

vi.mock("@/platform/storage", () => ({
  putReportDefinition: mockPut,
  listReportDefinitions: mockList,
  deleteReportDefinition: mockDelete,
  newId: mockNewId,
}));

// Import AFTER mocks are in place so the module resolves against the stubs.
import {
  deleteReconRun,
  hashRun,
  listReconRuns,
  newRunId,
  RECON_RUN_FORMAT,
  saveReconRun,
  type ReconRunRecord,
  verifyRunIntegrity,
} from "@/features/reconciliation/lib/recon-persistence";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ReconRunRecord> = {}): ReconRunRecord {
  return {
    id: "recon_abc123",
    name: "Test Run",
    createdAt: 1000,
    updatedAt: 2000,
    expectedView: "exp_view",
    actualView: "act_view",
    expectedLabel: "Expected",
    actualLabel: "Actual",
    tolerancePct: 5,
    config: {
      expectedView: "exp_view",
      actualView: "act_view",
      keyCols: [{ expected: "channel", actual: "channel" }],
      measures: [{ label: "revenue", expected: "rev", actual: "rev" }],
    },
    summary: {
      rowsTotal: 100,
      rowsChanged: 10,
      rowsAdded: 2,
      rowsRemoved: 1,
      rowsUnchanged: 87,
      rowsMaterial: 3,
      measureSums: {},
    },
    annotations: {},
    signedOff: false,
    ...overrides,
  };
}

// ── RECON_RUN_FORMAT constant ──────────────────────────────────────────────────

describe("RECON_RUN_FORMAT", () => {
  it("is the expected discriminator string", () => {
    // Any code that filters report definitions by this format field needs a
    // stable, predictable value; verify it has not been silently renamed.
    expect(RECON_RUN_FORMAT).toBe("reconciliation-run");
  });
});

// ── newRunId ──────────────────────────────────────────────────────────────────

describe("newRunId", () => {
  beforeEach(() => {
    mockNewId.mockReturnValue("uuid-1234");
  });

  it("returns a string prefixed with 'recon_'", () => {
    const id = newRunId();
    expect(id).toBe("recon_uuid-1234");
  });

  it("delegates to newId from the storage layer", () => {
    newRunId();
    expect(mockNewId).toHaveBeenCalledOnce();
  });

  it("produces a different value each time newId returns a different value", () => {
    mockNewId.mockReturnValueOnce("aaa").mockReturnValueOnce("bbb");
    expect(newRunId()).toBe("recon_aaa");
    expect(newRunId()).toBe("recon_bbb");
  });
});

// ── hashRun ───────────────────────────────────────────────────────────────────

describe("hashRun", () => {
  const base = makeRecord();

  it("returns an 8-character lowercase hex string", () => {
    const h = hashRun(base);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic: same record produces the same hash twice", () => {
    expect(hashRun(base)).toBe(hashRun(base));
  });

  it("changes when expectedView changes", () => {
    const altered = { ...base, expectedView: "different_view" };
    expect(hashRun(altered)).not.toBe(hashRun(base));
  });

  it("changes when actualView changes", () => {
    const altered = { ...base, actualView: "different_act" };
    expect(hashRun(altered)).not.toBe(hashRun(base));
  });

  it("changes when config changes", () => {
    const altered = {
      ...base,
      config: { ...base.config, tolerancePct: 99 } as typeof base.config,
    };
    expect(hashRun(altered)).not.toBe(hashRun(base));
  });

  it("changes when summary changes", () => {
    const altered = {
      ...base,
      summary: { ...base.summary, rowsChanged: 999 },
    };
    expect(hashRun(altered)).not.toBe(hashRun(base));
  });

  it("changes when annotations change", () => {
    const withAnnotation = {
      ...base,
      annotations: {
        key1: {
          reasonCode: "rounding",
          notes: "small delta",
          escalated: false,
          hypothesis: "",
        },
      },
    };
    expect(hashRun(withAnnotation)).not.toBe(hashRun(base));
  });

  it("is order-independent: annotation key order does not affect the hash", () => {
    // Build two records with annotations in different insertion orders.
    const ann1 = {
      ...base,
      annotations: {
        z_key: { reasonCode: "a", notes: "", escalated: false, hypothesis: "" },
        a_key: { reasonCode: "b", notes: "", escalated: false, hypothesis: "" },
      },
    };
    const ann2 = {
      ...base,
      annotations: {
        a_key: { reasonCode: "b", notes: "", escalated: false, hypothesis: "" },
        z_key: { reasonCode: "a", notes: "", escalated: false, hypothesis: "" },
      },
    };
    expect(hashRun(ann1)).toBe(hashRun(ann2));
  });

  it("handles an empty-string record without throwing", () => {
    const minimal = {
      ...base,
      expectedView: "",
      actualView: "",
      annotations: {},
    };
    expect(() => hashRun(minimal)).not.toThrow();
    expect(hashRun(minimal)).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ── saveReconRun ──────────────────────────────────────────────────────────────

describe("saveReconRun", () => {
  beforeEach(() => {
    mockPut.mockResolvedValue(undefined);
  });

  it("calls putReportDefinition with the run id, name, and correct format", async () => {
    // Arrange
    const record = makeRecord();

    // Act
    const returnedId = await saveReconRun(record);

    // Assert
    expect(mockPut).toHaveBeenCalledOnce();
    const arg = mockPut.mock.calls[0][0];
    expect(arg.id).toBe("recon_abc123");
    expect(arg.name).toBe("Test Run");
    expect(arg.format).toBe(RECON_RUN_FORMAT);
    expect(returnedId).toBe("recon_abc123");
  });

  it("embeds the record data inside a { __recon: true, record } config blob", async () => {
    // Arrange
    const record = makeRecord();

    // Act
    await saveReconRun(record);

    // Assert — verify the persisted config shape
    const { config } = mockPut.mock.calls[0][0];
    expect(config.__recon).toBe(true);
    expect(config.record).toBeDefined();
    // id/name/updatedAt must NOT appear inside the inner record (they live at
    // the top-level ReportDefinitionRecord level).
    expect(config.record.id).toBeUndefined();
    expect(config.record.name).toBeUndefined();
    expect(config.record.updatedAt).toBeUndefined();
    // Rest of the fields ARE present inside
    expect(config.record.createdAt).toBe(1000);
    expect(config.record.signedOff).toBe(false);
  });

  it("does NOT stamp a contentHash on unsigned runs", async () => {
    // Arrange
    const record = makeRecord({ signedOff: false });

    // Act
    await saveReconRun(record);

    // Assert
    const { config } = mockPut.mock.calls[0][0];
    expect(config.record.contentHash).toBeUndefined();
  });

  it("stamps a contentHash on signed-off runs when none is already present", async () => {
    // Arrange
    const record = makeRecord({ signedOff: true, contentHash: undefined });

    // Act
    await saveReconRun(record);

    // Assert
    const { config } = mockPut.mock.calls[0][0];
    expect(config.record.contentHash).toBeDefined();
    expect(typeof config.record.contentHash).toBe("string");
    expect(config.record.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("preserves an existing contentHash on signed-off runs (no re-hash)", async () => {
    // Arrange — already has a hash, perhaps from a previous sign-off
    const record = makeRecord({ signedOff: true, contentHash: "deadbeef" });

    // Act
    await saveReconRun(record);

    // Assert
    const { config } = mockPut.mock.calls[0][0];
    expect(config.record.contentHash).toBe("deadbeef");
  });

  it("returns the run id", async () => {
    // Arrange
    const record = makeRecord({ id: "recon_xyz" });

    // Act
    const id = await saveReconRun(record);

    // Assert
    expect(id).toBe("recon_xyz");
  });

  it("returns the signed-off run id (not altered after sign-off)", async () => {
    // Arrange
    const record = makeRecord({ id: "recon_so1", signedOff: true });

    // Act
    const id = await saveReconRun(record);

    // Assert
    expect(id).toBe("recon_so1");
  });
});

// ── listReconRuns ─────────────────────────────────────────────────────────────

describe("listReconRuns", () => {
  const goodConfig = {
    __recon: true,
    record: {
      createdAt: 1000,
      expectedView: "exp",
      actualView: "act",
      expectedLabel: "E",
      actualLabel: "A",
      tolerancePct: 5,
      config: {
        expectedView: "exp",
        actualView: "act",
        keyCols: [],
        measures: [],
      },
      summary: {
        rowsTotal: 0,
        rowsChanged: 0,
        rowsAdded: 0,
        rowsRemoved: 0,
        rowsUnchanged: 0,
        rowsMaterial: 0,
        measureSums: {},
      },
      annotations: {},
      signedOff: false,
    },
  };

  it("returns an empty array when no report definitions exist", async () => {
    // Arrange
    mockList.mockResolvedValue([]);

    // Act
    const runs = await listReconRuns();

    // Assert
    expect(runs).toEqual([]);
  });

  it("filters out non-reconciliation report definitions", async () => {
    // Arrange — two defs, only one with the right format
    mockList.mockResolvedValue([
      {
        id: "rpt_1",
        name: "CSV Report",
        format: "csv-export",
        updatedAt: 1000,
        config: null,
      },
      {
        id: "recon_1",
        name: "Recon Run",
        format: RECON_RUN_FORMAT,
        updatedAt: 2000,
        config: goodConfig,
      },
    ]);

    // Act
    const runs = await listReconRuns();

    // Assert
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe("recon_1");
  });

  it("filters out reconciliation defs whose config blob is malformed", async () => {
    // Arrange — valid format, but config lacks __recon marker
    mockList.mockResolvedValue([
      {
        id: "recon_bad",
        name: "Bad",
        format: RECON_RUN_FORMAT,
        updatedAt: 5000,
        config: { someOtherShape: true },
      },
    ]);

    // Act
    const runs = await listReconRuns();

    // Assert — fromReportRecord returns null for bad config → filtered out
    expect(runs).toHaveLength(0);
  });

  it("filters out reconciliation defs whose config is null", async () => {
    // Arrange
    mockList.mockResolvedValue([
      {
        id: "recon_null",
        name: "Null Config",
        format: RECON_RUN_FORMAT,
        updatedAt: 5000,
        config: null,
      },
    ]);

    // Act
    const runs = await listReconRuns();

    // Assert
    expect(runs).toHaveLength(0);
  });

  it("filters out reconciliation defs where __recon is not exactly true", async () => {
    // Arrange — __recon present but wrong value
    mockList.mockResolvedValue([
      {
        id: "recon_wrong",
        name: "Wrong",
        format: RECON_RUN_FORMAT,
        updatedAt: 3000,
        config: { __recon: "yes", record: goodConfig.record },
      },
    ]);

    // Act
    const runs = await listReconRuns();

    // Assert
    expect(runs).toHaveLength(0);
  });

  it("filters out reconciliation defs where record is missing", async () => {
    // Arrange
    mockList.mockResolvedValue([
      {
        id: "recon_norecord",
        name: "No record",
        format: RECON_RUN_FORMAT,
        updatedAt: 3000,
        config: { __recon: true },
      },
    ]);

    // Act
    const runs = await listReconRuns();

    // Assert
    expect(runs).toHaveLength(0);
  });

  it("reconstructs a valid ReconRunRecord with top-level id/name/updatedAt", async () => {
    // Arrange
    mockList.mockResolvedValue([
      {
        id: "recon_ok",
        name: "My Recon",
        format: RECON_RUN_FORMAT,
        updatedAt: 9999,
        config: goodConfig,
      },
    ]);

    // Act
    const [run] = await listReconRuns();

    // Assert
    expect(run.id).toBe("recon_ok");
    expect(run.name).toBe("My Recon");
    expect(run.updatedAt).toBe(9999);
    expect(run.createdAt).toBe(1000);
    expect(run.signedOff).toBe(false);
  });

  it("sorts runs newest-first by createdAt", async () => {
    // Arrange
    const makeReconDef = (id: string, createdAt: number) => ({
      id,
      name: id,
      format: RECON_RUN_FORMAT,
      updatedAt: createdAt,
      config: {
        __recon: true,
        record: { ...goodConfig.record, createdAt },
      },
    });
    mockList.mockResolvedValue([
      makeReconDef("older", 1000),
      makeReconDef("newest", 3000),
      makeReconDef("middle", 2000),
    ]);

    // Act
    const runs = await listReconRuns();

    // Assert — descending createdAt order
    expect(runs.map((r) => r.id)).toEqual(["newest", "middle", "older"]);
  });
});

// ── deleteReconRun ────────────────────────────────────────────────────────────

describe("deleteReconRun", () => {
  beforeEach(() => {
    mockDelete.mockResolvedValue(undefined);
  });

  it("delegates to deleteReportDefinition with the given id", async () => {
    // Arrange
    const id = "recon_del1";

    // Act
    await deleteReconRun(id);

    // Assert
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledWith(id);
  });

  it("resolves without a return value (void)", async () => {
    // Arrange / Act
    const result = await deleteReconRun("recon_any");

    // Assert
    expect(result).toBeUndefined();
  });
});

// ── verifyRunIntegrity ────────────────────────────────────────────────────────

describe("verifyRunIntegrity", () => {
  it("returns true for an unsigned run (signedOff: false)", () => {
    // Arrange
    const record = makeRecord({ signedOff: false });

    // Act / Assert
    expect(verifyRunIntegrity(record)).toBe(true);
  });

  it("returns true for a signed-off run with no stored contentHash", () => {
    // Arrange — contentHash is undefined (legacy record or race)
    const record = makeRecord({ signedOff: true, contentHash: undefined });

    // Act / Assert
    expect(verifyRunIntegrity(record)).toBe(true);
  });

  it("returns true for a signed-off run whose stored hash matches the computed hash", () => {
    // Arrange — compute the expected hash first, then embed it
    const base = makeRecord({ signedOff: true });
    const correctHash = hashRun(base);
    const record = { ...base, contentHash: correctHash };

    // Act / Assert
    expect(verifyRunIntegrity(record)).toBe(true);
  });

  it("returns false when the stored hash differs from the recomputed hash (tamper detected)", () => {
    // Arrange — a hash that will not match
    const record = makeRecord({
      signedOff: true,
      contentHash: "00000000",
    });
    // Make sure "00000000" is not the real hash of the default record
    const realHash = hashRun(record);
    // Only proceed if the tampered hash is actually wrong (sanity guard)
    expect(realHash).not.toBe("00000000");

    // Act / Assert
    expect(verifyRunIntegrity(record)).toBe(false);
  });

  it("detects tamper even if only the expectedView was changed after sign-off", () => {
    // Arrange
    const base = makeRecord({ signedOff: true });
    const correctHash = hashRun(base);
    // Mutate expectedView post-sign-off
    const tampered = {
      ...base,
      expectedView: "TAMPERED",
      contentHash: correctHash, // hash was for the original record
    };

    // Act / Assert
    expect(verifyRunIntegrity(tampered)).toBe(false);
  });

  it("detects tamper when annotations were altered after sign-off", () => {
    // Arrange
    const base = makeRecord({ signedOff: true });
    const originalHash = hashRun(base);
    const tampered = {
      ...base,
      annotations: {
        extra_key: { reasonCode: "injected", notes: "", escalated: false, hypothesis: "" },
      },
      contentHash: originalHash,
    };

    // Act / Assert
    expect(verifyRunIntegrity(tampered)).toBe(false);
  });
});
