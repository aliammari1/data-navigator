import { describe, expect, it } from "vitest";
import {
  CollabStartSchema,
  DatasetOnlySchema,
  EmbedBatchSchema,
  EmbedEnsureModelSchema,
  EmbedOneSchema,
  LlamaGenerateSchema,
  ModelDownloadSchema,
  parseIpc,
  RegisterCsvSchema,
  SqlSchema,
} from "../../electron/ipc-validation";

/**
 * IPC payload validation tests. A regression here weakens the renderer→main
 * trust boundary (defense-in-depth over the trusted-sender origin guard).
 */

describe("parseIpc", () => {
  it("returns parsed data on success", () => {
    expect(parseIpc(SqlSchema, "SELECT 1", "duckdb:runReadOnlyQuery")).toBe("SELECT 1");
  });
  it("throws a channel-tagged error on failure", () => {
    expect(() => parseIpc(SqlSchema, 42, "duckdb:runReadOnlyQuery")).toThrow(
      /duckdb:runReadOnlyQuery/,
    );
  });
});

describe("SqlSchema", () => {
  it("accepts a non-empty string", () => {
    expect(SqlSchema.safeParse("SELECT * FROM v").success).toBe(true);
  });
  it("rejects empty, non-string, and oversized SQL", () => {
    expect(SqlSchema.safeParse("").success).toBe(false);
    expect(SqlSchema.safeParse(123).success).toBe(false);
    expect(SqlSchema.safeParse("x".repeat(200_001)).success).toBe(false);
  });
});

describe("RegisterCsvSchema", () => {
  it("accepts a minimal valid payload and the documented optionals", () => {
    expect(RegisterCsvSchema.safeParse({ filePath: "C:/data/x.csv" }).success).toBe(true);
    expect(
      RegisterCsvSchema.safeParse({
        filePath: "C:/data/x.csv",
        encoding: "utf-8",
        hasHeader: true,
        sampleSize: -1,
      }).success,
    ).toBe(true);
  });
  it("requires a string filePath", () => {
    expect(RegisterCsvSchema.safeParse({}).success).toBe(false);
    expect(RegisterCsvSchema.safeParse({ filePath: 5 }).success).toBe(false);
  });
  it("rejects an unknown encoding", () => {
    expect(RegisterCsvSchema.safeParse({ filePath: "x", encoding: "utf-32" }).success).toBe(false);
  });
  it("strips unknown keys (prototype-pollution / extra-field defense)", () => {
    const parsed = parseIpc(
      RegisterCsvSchema,
      { filePath: "x", __proto__: { polluted: true }, evil: 1 },
      "duckdb:registerCSVPathDataset",
    );
    expect("evil" in parsed).toBe(false);
    expect(Object.keys(parsed)).toEqual(["filePath"]);
  });
});

describe("DatasetOnlySchema", () => {
  it("requires a non-empty datasetId", () => {
    expect(DatasetOnlySchema.safeParse({ datasetId: "ds_1" }).success).toBe(true);
    expect(DatasetOnlySchema.safeParse({ datasetId: "" }).success).toBe(false);
    expect(DatasetOnlySchema.safeParse({}).success).toBe(false);
  });
});

describe("ModelDownloadSchema", () => {
  it("requires a non-empty key", () => {
    // ModelKeySchema is an allowlist mirroring MODEL_DOWNLOADS' keys in
    // electron/model-download-service.ts, not a free-form string.
    expect(ModelDownloadSchema.safeParse({ key: "gemma-4-e4b-it-q4_k_m" }).success).toBe(true);
    expect(ModelDownloadSchema.safeParse({ key: "" }).success).toBe(false);
    expect(ModelDownloadSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a key that isn't in the model-download allowlist", () => {
    expect(ModelDownloadSchema.safeParse({ key: "qwen-1.5b" }).success).toBe(false);
    expect(ModelDownloadSchema.safeParse({ key: "not-a-real-model" }).success).toBe(false);
  });

  it("accepts the embedding-lane model key", () => {
    expect(ModelDownloadSchema.safeParse({ key: "all-minilm-l6-v2-embed-q8_0" }).success).toBe(
      true,
    );
  });
});

describe("LlamaGenerateSchema", () => {
  it("requires a prompt and caps its length", () => {
    expect(LlamaGenerateSchema.safeParse({ prompt: "hi" }).success).toBe(true);
    expect(LlamaGenerateSchema.safeParse({}).success).toBe(false);
    expect(LlamaGenerateSchema.safeParse({ prompt: "x".repeat(1_000_001) }).success).toBe(false);
  });
});

describe("EmbedEnsureModelSchema", () => {
  it("accepts undefined and an optional file", () => {
    expect(EmbedEnsureModelSchema.safeParse(undefined).success).toBe(true);
    expect(EmbedEnsureModelSchema.safeParse({ file: "custom.gguf" }).success).toBe(true);
  });
  it("rejects an oversized file string", () => {
    expect(EmbedEnsureModelSchema.safeParse({ file: "x".repeat(513) }).success).toBe(false);
  });
});

describe("EmbedOneSchema", () => {
  it("requires a non-empty text and caps its length", () => {
    expect(EmbedOneSchema.safeParse({ text: "hello" }).success).toBe(true);
    expect(EmbedOneSchema.safeParse({ text: "" }).success).toBe(false);
    expect(EmbedOneSchema.safeParse({}).success).toBe(false);
    expect(EmbedOneSchema.safeParse({ text: "x".repeat(20_001) }).success).toBe(false);
  });
  it("accepts an optional requestId", () => {
    expect(EmbedOneSchema.safeParse({ text: "hi", requestId: "req-1" }).success).toBe(true);
  });
});

describe("EmbedBatchSchema", () => {
  it("requires a non-empty array of non-empty strings", () => {
    expect(EmbedBatchSchema.safeParse({ texts: ["a", "b"] }).success).toBe(true);
    expect(EmbedBatchSchema.safeParse({ texts: [] }).success).toBe(false);
    expect(EmbedBatchSchema.safeParse({ texts: [""] }).success).toBe(false);
    expect(EmbedBatchSchema.safeParse({}).success).toBe(false);
  });
  it("rejects a batch larger than the item cap", () => {
    expect(
      EmbedBatchSchema.safeParse({ texts: Array.from({ length: 513 }, () => "x") }).success,
    ).toBe(false);
  });
});

describe("CollabStartSchema", () => {
  it("accepts undefined and a valid partial config", () => {
    expect(CollabStartSchema.safeParse(undefined).success).toBe(true);
    expect(CollabStartSchema.safeParse({ port: 1234, advertise: true }).success).toBe(true);
  });
  it("rejects an out-of-range port", () => {
    expect(CollabStartSchema.safeParse({ port: 99999 }).success).toBe(false);
  });
});
