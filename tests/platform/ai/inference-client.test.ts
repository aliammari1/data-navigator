/**
 * Tests for src/platform/ai/inference-client.ts
 *
 * inference-client.ts is a thin main-thread wrapper around the
 * `window.electronLlama` IPC bridge (electron/preload.ts →
 * electron/embed-service.ts). No Worker, no Comlink, no ONNX — every branch
 * here is about the bridge lookup and the two embed entry points.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { embedText, embedTexts, preloadEmbedder } from "@/platform/ai/inference-client";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a mock electronLlama API exposing only what inference-client.ts uses. */
function makeApi() {
  return {
    embed: vi.fn<(texts: string[]) => Promise<Float32Array[]>>(),
    ensureEmbedModel: vi.fn<(input?: { file?: string }) => Promise<void>>(),
  };
}

/** Install a mock electronLlama on the window and return it. */
function installLlama() {
  const api = makeApi();
  Object.defineProperty(window, "electronLlama", {
    value: api,
    writable: true,
    configurable: true,
  });
  return api;
}

/** Remove electronLlama from the window so bridge() falls through to null. */
function uninstallLlama() {
  Object.defineProperty(window, "electronLlama", {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  uninstallLlama();
  vi.unstubAllGlobals();
});

// ─── embedTexts ──────────────────────────────────────────────────────────────

describe("embedTexts", () => {
  it("returns an empty array immediately when texts is empty, without touching the bridge", async () => {
    // Arrange: no electronLlama installed at all — the empty-array early
    // return must short-circuit before the bridge is ever consulted.
    uninstallLlama();

    // Act
    const result = await embedTexts([]);

    // Assert
    expect(result).toEqual([]);
  });

  it("calls electronLlama.embed with the provided texts and returns its result", async () => {
    // Arrange
    const api = installLlama();
    const expected = [new Float32Array([1, 2, 3])];
    api.embed.mockResolvedValue(expected);

    // Act
    const result = await embedTexts(["hello", "world"]);

    // Assert
    expect(api.embed).toHaveBeenCalledWith(["hello", "world"]);
    expect(result).toBe(expected);
  });

  it("throws when window is undefined (non-browser context)", async () => {
    // Arrange
    const originalWindow = globalThis.window;
    // @ts-expect-error — intentionally removing window for test.
    delete globalThis.window;

    try {
      // Act / Assert
      await expect(embedTexts(["hello"])).rejects.toThrow(
        "node-llama-cpp embeddings require the Electron desktop app.",
      );
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("throws when electronLlama is not present on window", async () => {
    // Arrange
    uninstallLlama();

    // Act / Assert
    await expect(embedTexts(["hello"])).rejects.toThrow(
      "node-llama-cpp embeddings require the Electron desktop app.",
    );
  });
});

// ─── embedText ───────────────────────────────────────────────────────────────

describe("embedText", () => {
  beforeEach(() => {
    installLlama();
  });

  it("embeds a single text and returns the first vector", async () => {
    // Arrange
    const api = vi.mocked(window.electronLlama);
    const expected = new Float32Array([0.1, 0.2]);
    api.embed.mockResolvedValue([expected]);

    // Act
    const result = await embedText("hello");

    // Assert: embedText delegates to embedTexts with a single-item array.
    expect(api.embed).toHaveBeenCalledWith(["hello"]);
    expect(result).toBe(expected);
  });

  it("throws when the bridge is unavailable", async () => {
    // Arrange
    uninstallLlama();

    // Act / Assert
    await expect(embedText("hello")).rejects.toThrow(
      "node-llama-cpp embeddings require the Electron desktop app.",
    );
  });
});

// ─── preloadEmbedder ─────────────────────────────────────────────────────────

describe("preloadEmbedder", () => {
  it("calls electronLlama.ensureEmbedModel to warm the embedding model", async () => {
    // Arrange
    const api = installLlama();
    api.ensureEmbedModel.mockResolvedValue(undefined);

    // Act
    await preloadEmbedder();

    // Assert
    expect(api.ensureEmbedModel).toHaveBeenCalledOnce();
  });

  it("throws when the bridge is unavailable", async () => {
    // Arrange
    uninstallLlama();

    // Act / Assert
    await expect(preloadEmbedder()).rejects.toThrow(
      "node-llama-cpp embeddings require the Electron desktop app.",
    );
  });
});
