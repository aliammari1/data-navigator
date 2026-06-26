/**
 * Tests for src/platform/ai/transformers-env.ts
 *
 * Covers every exported constant, every exported function, and every branch
 * (including optional-chaining paths) in the module. The only external
 * dependency is `@huggingface/transformers`, which is mocked so no real ONNX /
 * network code runs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoist mock state so the factory can reference it ────────────────────────
const { mockEnv, mockWasm } = vi.hoisted(() => {
  const mockWasm = { wasmPaths: "" as string | undefined };
  const mockEnv = {
    allowLocalModels: false,
    localModelPath: "",
    useBrowserCache: false,
    allowRemoteModels: true,
    backends: {
      onnx: {
        wasm: mockWasm,
      },
    } as Record<string, unknown>,
  };
  return { mockEnv, mockWasm };
});

// ─── Mock @huggingface/transformers ──────────────────────────────────────────
vi.mock("@huggingface/transformers", () => ({
  env: mockEnv,
}));

// ─── Import real module AFTER mock declarations ───────────────────────────────
import {
  LOCAL_MODEL_PATH,
  LOCAL_ORT_WASM_PATH,
  configureTransformersEnv,
  isModelDownloadAllowed,
  setModelDownloadAllowed,
} from "@/platform/ai/transformers-env";

// ─── The localStorage key the module uses internally ─────────────────────────
const FLAG_KEY = "ai.allowModelDownload";

// ─── Setup: reset env mock and localStorage before every test ────────────────

beforeEach(() => {
  // Reset the mock env to a known baseline.
  mockEnv.allowLocalModels = false;
  mockEnv.localModelPath = "";
  mockEnv.useBrowserCache = false;
  mockEnv.allowRemoteModels = true;
  mockWasm.wasmPaths = "";
  mockEnv.backends = { onnx: { wasm: mockWasm } };

  // Clear the relevant localStorage key.
  localStorage.removeItem(FLAG_KEY);
});

// ─── Exported constants ───────────────────────────────────────────────────────

describe("exported constants", () => {
  it("LOCAL_ORT_WASM_PATH points to the local onnxruntime-web wasm directory", () => {
    expect(LOCAL_ORT_WASM_PATH).toBe("/models/onnx-runtime/");
  });

  it("LOCAL_MODEL_PATH points to the local transformers model directory", () => {
    expect(LOCAL_MODEL_PATH).toBe("/models/transformers/");
  });
});

// ─── isModelDownloadAllowed ───────────────────────────────────────────────────

describe("isModelDownloadAllowed", () => {
  it("returns true when localStorage has no stored value (default allow)", () => {
    // Arrange: key is absent (cleared in beforeEach)
    expect(isModelDownloadAllowed()).toBe(true);
  });

  it("returns true when the stored value is 'true'", () => {
    localStorage.setItem(FLAG_KEY, "true");
    expect(isModelDownloadAllowed()).toBe(true);
  });

  it("returns false when the stored value is exactly 'false'", () => {
    localStorage.setItem(FLAG_KEY, "false");
    expect(isModelDownloadAllowed()).toBe(false);
  });

  it("returns true when localStorage is undefined (server/worker context)", () => {
    // Temporarily hide localStorage so `typeof localStorage === "undefined"` is true.
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      expect(isModelDownloadAllowed()).toBe(true);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      }
    }
  });
});

// ─── setModelDownloadAllowed ──────────────────────────────────────────────────

describe("setModelDownloadAllowed", () => {
  it("persists 'true' to localStorage and sets env.allowRemoteModels = true", () => {
    setModelDownloadAllowed(true);

    expect(localStorage.getItem(FLAG_KEY)).toBe("true");
    expect(mockEnv.allowRemoteModels).toBe(true);
  });

  it("persists 'false' to localStorage and sets env.allowRemoteModels = false", () => {
    setModelDownloadAllowed(false);

    expect(localStorage.getItem(FLAG_KEY)).toBe("false");
    expect(mockEnv.allowRemoteModels).toBe(false);
  });

  it("sets env.allowRemoteModels even when localStorage is undefined", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      setModelDownloadAllowed(false);
      expect(mockEnv.allowRemoteModels).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      }
    }
  });

  it("covers the true branch of the ternary — flips back to true after false", () => {
    setModelDownloadAllowed(false);
    expect(localStorage.getItem(FLAG_KEY)).toBe("false");

    setModelDownloadAllowed(true);
    expect(localStorage.getItem(FLAG_KEY)).toBe("true");
    expect(mockEnv.allowRemoteModels).toBe(true);
  });
});

// ─── configureTransformersEnv ─────────────────────────────────────────────────

describe("configureTransformersEnv", () => {
  it("sets allowLocalModels, localModelPath, and useBrowserCache on env", () => {
    configureTransformersEnv();

    expect(mockEnv.allowLocalModels).toBe(true);
    expect(mockEnv.localModelPath).toBe(LOCAL_MODEL_PATH);
    expect(mockEnv.useBrowserCache).toBe(true);
  });

  it("sets wasmPaths on the wasm backend when it is present", () => {
    configureTransformersEnv();

    expect(mockWasm.wasmPaths).toBe(LOCAL_ORT_WASM_PATH);
  });

  it("does not throw and skips wasmPaths when env.backends.onnx.wasm is falsy", () => {
    // Force the wasmBackend to be falsy so the `if (wasmBackend)` branch is false.
    mockEnv.backends = { onnx: { wasm: null } };

    expect(() => configureTransformersEnv()).not.toThrow();
    expect(mockEnv.allowLocalModels).toBe(true);
  });

  it("does not throw when env.backends.onnx is undefined", () => {
    mockEnv.backends = { onnx: undefined };

    expect(() => configureTransformersEnv()).not.toThrow();
  });

  it("does not throw when env.backends itself is undefined", () => {
    mockEnv.backends = undefined;

    expect(() => configureTransformersEnv()).not.toThrow();
  });

  it("uses options.allowRemoteModels = true, overriding localStorage false", () => {
    localStorage.setItem(FLAG_KEY, "false");

    configureTransformersEnv({ allowRemoteModels: true });

    expect(mockEnv.allowRemoteModels).toBe(true);
  });

  it("uses options.allowRemoteModels = false, overriding localStorage true", () => {
    localStorage.setItem(FLAG_KEY, "true");

    configureTransformersEnv({ allowRemoteModels: false });

    expect(mockEnv.allowRemoteModels).toBe(false);
  });

  it("falls back to isModelDownloadAllowed() when allowRemoteModels is omitted (false path)", () => {
    // Make isModelDownloadAllowed() return false.
    localStorage.setItem(FLAG_KEY, "false");

    configureTransformersEnv({});

    expect(mockEnv.allowRemoteModels).toBe(false);
  });

  it("falls back to isModelDownloadAllowed() when options object is omitted entirely (true path)", () => {
    // No stored flag → isModelDownloadAllowed() returns true.
    localStorage.removeItem(FLAG_KEY);

    configureTransformersEnv();

    expect(mockEnv.allowRemoteModels).toBe(true);
  });

  it("is idempotent — calling it twice leaves env in the same final state", () => {
    mockEnv.backends = { onnx: { wasm: mockWasm } };

    configureTransformersEnv({ allowRemoteModels: true });
    configureTransformersEnv({ allowRemoteModels: true });

    expect(mockEnv.allowLocalModels).toBe(true);
    expect(mockEnv.localModelPath).toBe(LOCAL_MODEL_PATH);
    expect(mockEnv.useBrowserCache).toBe(true);
    expect(mockEnv.allowRemoteModels).toBe(true);
    expect(mockWasm.wasmPaths).toBe(LOCAL_ORT_WASM_PATH);
  });
});
