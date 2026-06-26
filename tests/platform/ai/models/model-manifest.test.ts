import { describe, it, expect } from "vitest";
import {
  LOCAL_TRANSFORMERS_PATH,
  DEFAULT_GGUF_MODEL,
  EMBED_MODEL_ID,
  MODEL_MANIFEST,
  primaryForLane,
  manifestByKey,
  transformersAssetUrl,
} from "@/platform/ai/models/model-manifest";
import type { ModelManifestEntry } from "@/platform/ai/models/model-manifest";

// ─── Constants ──────────────────────────────────────────────────────────────────

describe("MODULE CONSTANTS", () => {
  it("LOCAL_TRANSFORMERS_PATH is the expected public path prefix", () => {
    expect(LOCAL_TRANSFORMERS_PATH).toBe("/models/transformers/");
  });

  it("DEFAULT_GGUF_MODEL matches the primary GGUF filename", () => {
    expect(DEFAULT_GGUF_MODEL).toBe("qwen2.5-1.5b-instruct-q4_k_m.gguf");
  });

  it("EMBED_MODEL_ID is the Xenova MiniLM model id", () => {
    expect(EMBED_MODEL_ID).toBe("Xenova/all-MiniLM-L6-v2");
  });
});

// ─── MODEL_MANIFEST shape ────────────────────────────────────────────────────────

describe("MODEL_MANIFEST", () => {
  it("contains at least 4 entries", () => {
    expect(MODEL_MANIFEST.length).toBeGreaterThanOrEqual(4);
  });

  it("has a non-optional llm primary (qwen2.5-1.5b-instruct-q4_k_m)", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "qwen2.5-1.5b-instruct-q4_k_m");
    expect(entry).toBeDefined();
    expect(entry!.lane).toBe("llm");
    expect(entry!.presence).toBe("electron-gguf");
    expect(entry!.optional).toBe(false);
    expect(entry!.ggufFile).toBe("qwen2.5-1.5b-instruct-q4_k_m.gguf");
    expect(entry!.downloadUrl).toContain("huggingface.co");
    expect(entry!.downloadMb).toBe(1020);
  });

  it("has an optional llm fallback (qwen2.5-0.5b-instruct-q4_k_m)", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "qwen2.5-0.5b-instruct-q4_k_m");
    expect(entry).toBeDefined();
    expect(entry!.lane).toBe("llm");
    expect(entry!.optional).toBe(true);
    expect(entry!.downloadMb).toBe(400);
    expect(entry!.ggufFile).toBe("qwen2.5-0.5b-instruct-q4_k_m.gguf");
  });

  it("has an optional 7B llm upgrade (qwen2.5-7b-instruct-q4_k_m)", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "qwen2.5-7b-instruct-q4_k_m");
    expect(entry).toBeDefined();
    expect(entry!.lane).toBe("llm");
    expect(entry!.optional).toBe(true);
    expect(entry!.downloadMb).toBe(4680);
    expect(entry!.ggufFile).toBe("qwen2.5-7b-instruct-q4_k_m.gguf");
    expect(entry!.downloadUrl).toContain("Qwen2.5-7B-Instruct-GGUF");
  });

  it("has a non-optional embed entry (minilm-onnx-quantized)", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "minilm-onnx-quantized");
    expect(entry).toBeDefined();
    expect(entry!.lane).toBe("embed");
    expect(entry!.presence).toBe("transformers-asset");
    expect(entry!.optional).toBe(false);
    expect(entry!.assetPath).toBe("Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx");
    expect(entry!.downloadMb).toBe(23);
  });

  it("every entry has the required fields populated", () => {
    for (const entry of MODEL_MANIFEST) {
      expect(typeof entry.key).toBe("string");
      expect(entry.key.length).toBeGreaterThan(0);
      expect(["llm", "embed"]).toContain(entry.lane);
      expect(["electron-gguf", "transformers-asset"]).toContain(entry.presence);
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.family).toBe("string");
      expect(typeof entry.sizeLabel).toBe("string");
      expect(typeof entry.downloadMb).toBe("number");
      expect(typeof entry.optional).toBe("boolean");
    }
  });

  it("downloadUrl for GGUF entries includes the ?download=true parameter", () => {
    const ggufEntries = MODEL_MANIFEST.filter((m) => m.presence === "electron-gguf");
    for (const entry of ggufEntries) {
      expect(entry.downloadUrl).toContain("?download=true");
    }
  });

  it("all entries have sha256 and bytes fields (even if empty/zero)", () => {
    for (const entry of MODEL_MANIFEST) {
      expect(entry).toHaveProperty("sha256");
      expect(entry).toHaveProperty("bytes");
    }
  });
});

// ─── primaryForLane ──────────────────────────────────────────────────────────────

describe("primaryForLane", () => {
  it('returns the non-optional llm entry for lane "llm"', () => {
    const result = primaryForLane("llm");
    expect(result.lane).toBe("llm");
    expect(result.optional).toBe(false);
    expect(result.key).toBe("qwen2.5-1.5b-instruct-q4_k_m");
  });

  it('returns the non-optional embed entry for lane "embed"', () => {
    const result = primaryForLane("embed");
    expect(result.lane).toBe("embed");
    expect(result.optional).toBe(false);
    expect(result.key).toBe("minilm-onnx-quantized");
  });

  it("returns a ModelManifestEntry with the correct shape", () => {
    const result = primaryForLane("llm");
    expect(result).toMatchObject({
      key: expect.any(String),
      lane: "llm",
      presence: expect.any(String),
      label: expect.any(String),
      family: expect.any(String),
      sizeLabel: expect.any(String),
      downloadMb: expect.any(Number),
      optional: false,
    });
  });

  it('throws when an unknown lane is requested (covers the "no primary" branch)', () => {
    // Cast to bypass TypeScript — exercises the runtime throw branch.
    expect(() => primaryForLane("unknown" as ModelManifestEntry["lane"])).toThrow(
      'No primary model registered for lane "unknown".',
    );
  });
});

// ─── manifestByKey ───────────────────────────────────────────────────────────────

describe("manifestByKey", () => {
  it("returns the entry for a known key", () => {
    const entry = manifestByKey("qwen2.5-1.5b-instruct-q4_k_m");
    expect(entry).toBeDefined();
    expect(entry!.key).toBe("qwen2.5-1.5b-instruct-q4_k_m");
  });

  it("returns the embed entry for its key", () => {
    const entry = manifestByKey("minilm-onnx-quantized");
    expect(entry).toBeDefined();
    expect(entry!.lane).toBe("embed");
  });

  it("returns undefined for an unknown key", () => {
    const entry = manifestByKey("this-key-does-not-exist");
    expect(entry).toBeUndefined();
  });

  it("returns undefined for an empty string key", () => {
    const entry = manifestByKey("");
    expect(entry).toBeUndefined();
  });
});

// ─── transformersAssetUrl ────────────────────────────────────────────────────────

describe("transformersAssetUrl", () => {
  it("returns the full public URL for the embed entry", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "minilm-onnx-quantized")!;
    const url = transformersAssetUrl(entry);
    expect(url).toBe(
      "/models/transformers/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx",
    );
  });

  it("prepends LOCAL_TRANSFORMERS_PATH to the assetPath", () => {
    const fakeEntry: ModelManifestEntry = {
      key: "test-embed",
      lane: "embed",
      presence: "transformers-asset",
      label: "Test Embed",
      family: "Test",
      sizeLabel: "1 MB",
      downloadMb: 1,
      optional: false,
      assetPath: "some/model/path/model.onnx",
    };
    const url = transformersAssetUrl(fakeEntry);
    expect(url).toBe(`${LOCAL_TRANSFORMERS_PATH}some/model/path/model.onnx`);
  });

  it("throws when assetPath is absent (covers the no-assetPath throw branch)", () => {
    const entryWithoutAssetPath: ModelManifestEntry = {
      key: "qwen2.5-1.5b-instruct-q4_k_m",
      lane: "llm",
      presence: "electron-gguf",
      label: "Qwen2.5 1.5B Instruct (GGUF q4)",
      family: "Qwen2.5",
      sizeLabel: "1.5B",
      downloadMb: 1020,
      optional: false,
      ggufFile: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
      // assetPath is intentionally omitted
    };
    expect(() => transformersAssetUrl(entryWithoutAssetPath)).toThrow(
      "qwen2.5-1.5b-instruct-q4_k_m has no assetPath",
    );
  });

  it("throws when assetPath is explicitly set to undefined", () => {
    const entry: ModelManifestEntry = {
      key: "no-asset-entry",
      lane: "embed",
      presence: "transformers-asset",
      label: "No Asset",
      family: "None",
      sizeLabel: "0 MB",
      downloadMb: 0,
      optional: true,
      assetPath: undefined,
    };
    expect(() => transformersAssetUrl(entry)).toThrow("no-asset-entry has no assetPath");
  });
});
