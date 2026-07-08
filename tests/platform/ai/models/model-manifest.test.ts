import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GGUF_MODEL,
  EMBED_MODEL_ID,
  LOCAL_TRANSFORMERS_PATH,
  manifestByKey,
  MODEL_MANIFEST,
  primaryForLane,
  transformersAssetUrl,
} from "@/platform/ai/models/model-manifest";
import type { ModelManifestEntry } from "@/platform/ai/models/model-manifest";

// electron/model-download-service.ts imports the `electron` module at the top
// level (for `app.getPath`), which isn't resolvable outside a real Electron
// process — stub it so we can import its (side-effect-free) MODEL_DOWNLOADS
// data array for the cross-check below.
vi.mock("electron", () => ({ app: { getPath: () => "" } }));

// electron/model-download-service.ts's own doc comment calls MODEL_DOWNLOADS
// "THE single source of truth for which GGUF models this app ships" and says
// every other GGUF reference (incl. this manifest) "must mirror these exact
// ... values". That makes it the independent authority to check
// model-manifest.ts's GGUF `downloadMb` figures against, instead of asserting
// them as bare literals copied from the file under test.
import { MODEL_DOWNLOADS } from "../../../../electron/model-download-service";

/** The MODEL_DOWNLOADS entry for `key`, or throws — used to derive expected values. */
function downloadEntryFor(key: string) {
  const entry = MODEL_DOWNLOADS.find((m) => m.key === key);
  if (!entry) {
    throw new Error(`No MODEL_DOWNLOADS entry for "${key}" — update the cross-check test.`);
  }
  return entry;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

describe("MODULE CONSTANTS", () => {
  it("LOCAL_TRANSFORMERS_PATH is the expected public path prefix", () => {
    expect(LOCAL_TRANSFORMERS_PATH).toBe("/models/transformers/");
  });

  it("DEFAULT_GGUF_MODEL matches the primary GGUF filename", () => {
    expect(DEFAULT_GGUF_MODEL).toBe("gemma-4-e4b-it-q4_k_m.gguf");
  });

  it("EMBED_MODEL_ID is the Xenova MiniLM model id", () => {
    expect(EMBED_MODEL_ID).toBe("Xenova/all-MiniLM-L6-v2");
  });
});

// ─── MODEL_MANIFEST shape ────────────────────────────────────────────────────────

describe("MODEL_MANIFEST", () => {
  it("contains at least 3 entries", () => {
    expect(MODEL_MANIFEST.length).toBeGreaterThanOrEqual(3);
  });

  it("has a non-optional llm primary (gemma-4-e4b-it-q4_k_m)", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "gemma-4-e4b-it-q4_k_m");
    expect(entry).toBeDefined();
    expect(entry?.lane).toBe("llm");
    expect(entry?.presence).toBe("electron-gguf");
    expect(entry?.optional).toBe(false);
    expect(entry?.ggufFile).toBe("gemma-4-e4b-it-q4_k_m.gguf");
    // Cross-check against the canonical download entry (electron/model-download-service.ts)
    // rather than a bare literal copied from this same manifest — this is the
    // only way the test could ever catch the two files drifting apart.
    expect(entry?.downloadMb).toBe(downloadEntryFor("gemma-4-e4b-it-q4_k_m").bytes / 1_000_000);
  });

  it("has an optional llm alternative (granite-4.1-3b-instruct-q4_k_m)", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "granite-4.1-3b-instruct-q4_k_m");
    expect(entry).toBeDefined();
    expect(entry?.lane).toBe("llm");
    expect(entry?.optional).toBe(true);
    // Same cross-check as above. This used to assert a bare `1800` copied
    // from this file's own (stale) comment; the canonical
    // model-download-service.ts entry actually carries `bytes: 2_100_000_000`
    // (2100 MB) — checking against it here caught and fixed that drift.
    expect(entry?.downloadMb).toBe(
      downloadEntryFor("granite-4.1-3b-instruct-q4_k_m").bytes / 1_000_000,
    );
    expect(entry?.ggufFile).toBe("granite-4.1-3b-instruct-q4_k_m.gguf");
  });

  it("has a non-optional embed entry (minilm-onnx-quantized)", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "minilm-onnx-quantized");
    expect(entry).toBeDefined();
    expect(entry?.lane).toBe("embed");
    expect(entry?.presence).toBe("transformers-asset");
    expect(entry?.optional).toBe(false);
    expect(entry?.assetPath).toBe("Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx");
    // Unlike the two GGUF entries above, there is no independent authority to
    // check this against yet: the entry's own `bytes: 0, // TODO` field, and
    // prepare-models.mjs's matching `bytes: 0, // TODO: fill exact
    // content-length` both mark the real size as not yet measured. Asserting
    // an exact `23` here would just be re-copying this same file's literal, so
    // instead assert it's a plausible positive download size (MiniLM's
    // quantized ONNX weight is documented elsewhere as tens of MB, not KB or
    // GB) until a real content-length is filled in.
    expect(entry?.downloadMb).toBeGreaterThan(0);
    expect(entry?.downloadMb).toBeLessThan(200);
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

  it("GGUF entries carry a ggufFile matching their key's model filename", () => {
    const ggufEntries = MODEL_MANIFEST.filter((m) => m.presence === "electron-gguf");
    expect(ggufEntries.length).toBeGreaterThanOrEqual(2);
    for (const entry of ggufEntries) {
      expect(entry.ggufFile).toBe(`${entry.key}.gguf`);
    }
  });
});

// ─── primaryForLane ──────────────────────────────────────────────────────────────

describe("primaryForLane", () => {
  it('returns the non-optional llm entry for lane "llm"', () => {
    const result = primaryForLane("llm");
    expect(result.lane).toBe("llm");
    expect(result.optional).toBe(false);
    expect(result.key).toBe("gemma-4-e4b-it-q4_k_m");
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
    const entry = manifestByKey("gemma-4-e4b-it-q4_k_m");
    expect(entry).toBeDefined();
    expect(entry?.key).toBe("gemma-4-e4b-it-q4_k_m");
  });

  it("returns the embed entry for its key", () => {
    const entry = manifestByKey("minilm-onnx-quantized");
    expect(entry).toBeDefined();
    expect(entry?.lane).toBe("embed");
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
    const entry = MODEL_MANIFEST.find((m) => m.key === "minilm-onnx-quantized");
    if (!entry) throw new Error("expected minilm-onnx-quantized entry to exist");
    const url = transformersAssetUrl(entry);
    expect(url).toBe("/models/transformers/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx");
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
      key: "gemma-4-e4b-it-q4_k_m",
      lane: "llm",
      presence: "electron-gguf",
      label: "Gemma 4 E4B Instruct (GGUF q4)",
      family: "Gemma 4",
      sizeLabel: "E4B",
      downloadMb: 5340,
      optional: false,
      ggufFile: "gemma-4-e4b-it-q4_k_m.gguf",
      // assetPath is intentionally omitted
    };
    expect(() => transformersAssetUrl(entryWithoutAssetPath)).toThrow(
      "gemma-4-e4b-it-q4_k_m has no assetPath",
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
