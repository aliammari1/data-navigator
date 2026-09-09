/**
 * Tests for src/platform/ai/inference-client.ts
 *
 * The module is a thin renderer-side client over `window.electronEmbed` (the
 * Electron main-process node-llama-cpp embedding lane). We fake that bridge on
 * `window` so no real IPC / node-llama-cpp code runs — every branch, early
 * return, and error path in the module is exercised.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embedText, embedTexts, preloadEmbedder } from "@/platform/ai/inference-client";

type AnyRecord = Record<string, unknown>;

const win = window as unknown as AnyRecord;

function installEmbedBridge(overrides: AnyRecord = {}): AnyRecord {
  const bridge: AnyRecord = {
    ensureModel: vi.fn(async () => ({ model: "all-minilm-l6-v2-embed-q8_0.gguf", dims: 384 })),
    embedOne: vi.fn(async () => ({
      vector: [0.1, 0.2, 0.3],
      dims: 3,
      model: "all-minilm-l6-v2-embed-q8_0.gguf",
      elapsedMs: 1,
    })),
    embedBatch: vi.fn(async () => ({
      vectors: [[0.1, 0.2, 0.3]],
      dims: 3,
      model: "all-minilm-l6-v2-embed-q8_0.gguf",
      elapsedMs: 1,
    })),
    abort: vi.fn(async () => true),
    ...overrides,
  };
  win.electronEmbed = bridge;
  return bridge;
}

beforeEach(() => {
  win.electronEmbed = undefined;
});

afterEach(() => {
  win.electronEmbed = undefined;
});

// ─── embedTexts ──────────────────────────────────────────────────────────────

describe("embedTexts", () => {
  it("returns an empty array immediately when texts is empty (bridge never contacted)", async () => {
    const bridge = installEmbedBridge();

    const result = await embedTexts([]);

    expect(result).toEqual([]);
    expect(bridge.embedBatch).not.toHaveBeenCalled();
  });

  it("calls electronEmbed.embedBatch with the texts and a generated requestId", async () => {
    const bridge = installEmbedBridge({
      embedBatch: vi.fn(async () => ({
        vectors: [
          [1, 2, 3],
          [4, 5, 6],
        ],
        dims: 3,
        model: "m",
        elapsedMs: 2,
      })),
    });

    const result = await embedTexts(["hello", "world"]);

    expect(bridge.embedBatch).toHaveBeenCalledWith(
      expect.objectContaining({ texts: ["hello", "world"], requestId: expect.any(String) }),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(Array.from(result[0])).toEqual([1, 2, 3]);
    expect(Array.from(result[1])).toEqual([4, 5, 6]);
  });

  it("throws a descriptive error when window.electronEmbed is unavailable", async () => {
    await expect(embedTexts(["hello"])).rejects.toThrow(
      "Embeddings require the desktop app (window.electronEmbed is unavailable in this context).",
    );
  });
});

// ─── embedText ───────────────────────────────────────────────────────────────

describe("embedText", () => {
  it("calls electronEmbed.embedOne with the text and a generated requestId", async () => {
    const bridge = installEmbedBridge();

    const result = await embedText("hello");

    expect(bridge.embedOne).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello", requestId: expect.any(String) }),
    );
    expect(result).toBeInstanceOf(Float32Array);
    expect(Array.from(result)).toEqual(Array.from(new Float32Array([0.1, 0.2, 0.3])));
  });

  it("generates a distinct requestId per call", async () => {
    const bridge = installEmbedBridge();

    await embedText("a");
    await embedText("b");

    const ids = bridge.embedOne.mock.calls.map(
      (call: [{ requestId: string }]) => call[0].requestId,
    );
    expect(new Set(ids).size).toBe(2);
  });

  it("throws a descriptive error when window.electronEmbed is unavailable", async () => {
    await expect(embedText("hello")).rejects.toThrow(
      "Embeddings require the desktop app (window.electronEmbed is unavailable in this context).",
    );
  });
});

// ─── preloadEmbedder ─────────────────────────────────────────────────────────

describe("preloadEmbedder", () => {
  it("calls electronEmbed.ensureModel with no file when model is omitted", async () => {
    const bridge = installEmbedBridge();

    await preloadEmbedder();

    expect(bridge.ensureModel).toHaveBeenCalledWith(undefined);
  });

  it("passes model through as { file: model } when provided", async () => {
    const bridge = installEmbedBridge();

    await preloadEmbedder("custom-embed.gguf");

    expect(bridge.ensureModel).toHaveBeenCalledWith({ file: "custom-embed.gguf" });
  });

  it("throws a descriptive error when window.electronEmbed is unavailable", async () => {
    await expect(preloadEmbedder()).rejects.toThrow(
      "Embeddings require the desktop app (window.electronEmbed is unavailable in this context).",
    );
  });
});
