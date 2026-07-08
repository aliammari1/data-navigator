import { describe, expect, it, vi } from "vitest";
import type { ModelManifestEntry } from "@/platform/ai/models/model-manifest";
import {
  DEFAULT_GGUF_MODEL,
  EMBED_MODEL_ID,
  MODEL_MANIFEST,
  manifestByKey,
  primaryForLane,
} from "@/platform/ai/models/model-manifest";

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
  it("DEFAULT_GGUF_MODEL matches the primary GGUF filename", () => {
    expect(DEFAULT_GGUF_MODEL).toBe("gemma-4-e4b-it-q4_k_m.gguf");
  });

  it("EMBED_MODEL_ID is the Qwen3 Embedding GGUF filename", () => {
    expect(EMBED_MODEL_ID).toBe("qwen3-embedding-0.6b-q8_0.gguf");
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

  it("has a non-optional embed entry (qwen3-embedding-0.6b-q8_0)", () => {
    const entry = MODEL_MANIFEST.find((m) => m.key === "qwen3-embedding-0.6b-q8_0");
    expect(entry).toBeDefined();
    expect(entry?.lane).toBe("embed");
    expect(entry?.presence).toBe("electron-gguf");
    expect(entry?.optional).toBe(false);
    expect(entry?.ggufFile).toBe("qwen3-embedding-0.6b-q8_0.gguf");
    // Same cross-check pattern as the two llm entries above — the embed model
    // now rides the same GGUF download/progress/sha256/IPC infrastructure
    // (node-llama-cpp), replacing the old transformers.js MiniLM ONNX asset.
    expect(entry?.downloadMb).toBe(downloadEntryFor("qwen3-embedding-0.6b-q8_0").bytes / 1_000_000);
  });

  it("every entry has the required fields populated", () => {
    for (const entry of MODEL_MANIFEST) {
      expect(typeof entry.key).toBe("string");
      expect(entry.key.length).toBeGreaterThan(0);
      expect(["llm", "embed"]).toContain(entry.lane);
      expect(entry.presence).toBe("electron-gguf");
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.family).toBe("string");
      expect(typeof entry.sizeLabel).toBe("string");
      expect(typeof entry.downloadMb).toBe("number");
      expect(typeof entry.optional).toBe("boolean");
    }
  });

  it("GGUF entries carry a ggufFile matching their key's model filename", () => {
    const ggufEntries = MODEL_MANIFEST.filter((m) => m.presence === "electron-gguf");
    expect(ggufEntries.length).toBe(MODEL_MANIFEST.length);
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
    expect(result.key).toBe("qwen3-embedding-0.6b-q8_0");
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
    const entry = manifestByKey("qwen3-embedding-0.6b-q8_0");
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
