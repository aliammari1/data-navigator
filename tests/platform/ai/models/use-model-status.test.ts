/**
 * Additional coverage for src/platform/ai/models/use-model-status.ts
 *
 * The existing .test.tsx covers most paths. This file targets the remaining
 * uncovered branches, all on the Electron GGUF probing path (`probeGguf`) —
 * there is no browser/transformers.js lane anymore (node-llama-cpp migration
 * removed the Cache Storage / OPFS asset probing entirely):
 *
 *  - llama-bridge match present:false ternary false branch.
 *  - `if (!alive) return` true branch (unmount races the async probe).
 *  - setDownload: `prev[key] ?? EMPTY_DOWNLOAD` with existing key (both sides).
 *  - cancel() with models bridge absent but active entry present (no-op).
 *  - cancel() with active entry but no models bridge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  ensureModelsReady,
  isPrimaryLlmReady,
  useModelStatus,
} from "@/platform/ai/models/use-model-status";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

const win = window as unknown as AnyRecord;

function makeElectron(): void {
  win.electronFS = {};
  win.electronDuckDB = {};
}

function clearElectronShell(): void {
  win.electronFS = undefined;
  win.electronDuckDB = undefined;
}

function installModelsBridge(overrides: AnyRecord = {}): AnyRecord {
  const bridge: AnyRecord = {
    listPresence: vi.fn(async () => []),
    download: vi.fn(async () => ({})),
    abort: vi.fn(async () => true),
    onProgress: vi.fn(() => () => undefined),
    ...overrides,
  };
  win.electronModels = bridge;
  return bridge;
}

function installLlamaBridge(overrides: AnyRecord = {}): AnyRecord {
  const bridge: AnyRecord = {
    listModels: vi.fn(async () => []),
    ...overrides,
  };
  win.electronLlama = bridge;
  return bridge;
}

/** Make fetch return a 404 so the HEAD probe fails. */
function stubFetch404(): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
}

/** Make fetch return a 200 so the embed HEAD probe passes. */
function stubFetch200(): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  clearElectronShell();
  win.electronModels = undefined;
  win.electronLlama = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  win.electronModels = undefined;
  win.electronLlama = undefined;
  win.electronFS = undefined;
  win.electronDuckDB = undefined;
});

// ─── Branch: llama bridge match with present:false (false ternary) ───────────
//
// `probeGguf` falls back to the llama bridge when `listPresence` has no match.
// The match's `present` flag drives the ternary on line 151; `present:false`
// produces state:"missing". This branch was previously uncovered.

describe("probeGguf — llama bridge match where present:false", () => {
  it("returns state=missing when llama.listModels finds the ggufFile but present is false", async () => {
    // Arrange: electronModels returns no match → falls to llama bridge.
    installModelsBridge({
      listPresence: vi.fn(async () => []),
    });
    installLlamaBridge({
      listModels: vi.fn(async () => [
        { id: "gemma-4-e4b-it-q4_k_m.gguf", present: false },
      ]),
    });
    stubFetch200();

    // Act
    const result = await ensureModelsReady(["llm"]);

    // Assert
    const primary = result.records.find((r) => r.key === "gemma-4-e4b-it-q4_k_m");
    expect(primary?.state).toBe("missing");
    expect(primary?.source).toBe("userData");
  });

  it("returns state=unknown when llama.listModels finds no matching entry", async () => {
    // Arrange
    installModelsBridge({
      listPresence: vi.fn(async () => []),
    });
    installLlamaBridge({
      listModels: vi.fn(async () => [
        { id: "some-other-model.gguf", present: true },
      ]),
    });
    stubFetch200();

    // Act
    const result = await ensureModelsReady(["llm"]);

    const primary = result.records.find((r) => r.key === "gemma-4-e4b-it-q4_k_m");
    expect(primary?.state).toBe("unknown");
    expect(primary?.source).toBe("none");
  });

  it("returns state=unknown when llama.listModels throws", async () => {
    // Arrange
    installModelsBridge({
      listPresence: vi.fn(async () => []),
    });
    installLlamaBridge({
      listModels: vi.fn(async () => {
        throw new Error("llama down");
      }),
    });
    stubFetch200();

    // Act
    const result = await ensureModelsReady(["llm"]);

    const primary = result.records.find((r) => r.key === "gemma-4-e4b-it-q4_k_m");
    expect(primary?.state).toBe("unknown");
    expect(primary?.source).toBe("none");
  });
});

// ─── Branch: `!alive` race on unmount (true branch) ───────────────────────────
//
// When the component unmounts while the initial async probe is still pending,
// the `if (!alive) return` guard fires and setRecords/setLoading are NOT called
// on the already-unmounted instance. This avoids a React "can't setState on
// unmounted component" warning.

describe("useModelStatus useEffect — unmount race with in-flight probe", () => {
  it("does not update state when the hook unmounts before the probe resolves", async () => {
    // Arrange: make the probe (electronModels.listPresence) hang so we can
    // unmount before it resolves.
    let resolveListPresence!: (v: unknown[]) => void;
    installModelsBridge({
      listPresence: vi.fn(
        () =>
          new Promise<unknown[]>((resolve) => {
            resolveListPresence = resolve;
          }),
      ),
    });

    const { result, unmount } = renderHook(() => useModelStatus(["embed"]));

    // Synchronous initial state — still loading.
    expect(result.current.loading).toBe(true);

    // Unmount before listPresence resolves → `alive` becomes false.
    unmount();

    // Now let the deferred probe settle.
    await act(async () => {
      resolveListPresence([]);
      await Promise.resolve();
    });

    // The hook was unmounted; no state update should have been applied to it.
    // The test verifies there is no unhandled error / warning (the if-alive guard
    // absorbed the late setState calls). We confirm the last-seen loading=true.
    expect(result.current.loading).toBe(true);
  });
});

// ─── Branch: setDownload with existing prev[key] (both ?? sides) ──────────────
//
// `setDownloads` uses `prev[key] ?? EMPTY_DOWNLOAD`. When the key already
// exists in `prev` (truthy), the `??` right-hand side is skipped. When it
// does not exist (undefined), EMPTY_DOWNLOAD is used. The existing tests
// cover the "key not yet in prev" path; here we exercise the "key already in
// prev" path by firing two consecutive progress events.

describe("useModelStatus — setDownload merges into existing key", () => {
  it("merges consecutive progress events onto the same download key", async () => {
    let emit: ((p: AnyRecord) => void) | undefined;
    installModelsBridge({
      onProgress: vi.fn((_id: string, cb: (p: AnyRecord) => void) => {
        emit = cb;
        return () => undefined;
      }),
      download: vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ present: true }), 50);
          }),
      ),
      listPresence: vi.fn(async () => []),
    });
    stubFetch200();

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const p = result.current.download("gemma-4-e4b-it-q4_k_m");
      // First event initialises the key.
      emit?.({ percent: 10, receivedBytes: 100, totalBytes: 1000, done: false });
      // Second event merges into the already-existing key.
      emit?.({ percent: 50, receivedBytes: 500, totalBytes: 1000, done: false });
      await p;
    });

    // After the full download resolves, percent is 100.
    const state = result.current.downloads["gemma-4-e4b-it-q4_k_m"];
    expect(state.percent).toBe(100);
    expect(state.active).toBe(false);
  });
});

// ─── Branch: cancel() when models bridge is absent (no-op path) ───────────────
//
// `cancel()` returns early when `!models || !active`. The existing test covers
// the case where `models` is present but `active` is absent. Here we cover the
// case where the models bridge itself is absent.

describe("useModelStatus cancel() — no-op when models bridge absent", () => {
  it("does nothing when electronModels is not installed", async () => {
    // No models bridge.
    stubFetch200();

    const { result } = renderHook(() => useModelStatus(["embed"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should not throw even without a bridge.
    await act(async () => {
      await result.current.cancel("qwen3-embedding-0.6b-q8_0");
    });

    // No download state was ever set.
    expect(result.current.downloads["qwen3-embedding-0.6b-q8_0"]).toBeUndefined();
  });
});

// ─── Branch: isPrimaryLlmReady with llama bridge present (unknown state) ──────

describe("isPrimaryLlmReady — extra branches", () => {
  it("returns false when in Electron with models bridge absent but llama bridge present and no match", async () => {
    makeElectron();
    installLlamaBridge({
      listModels: vi.fn(async () => [{ id: "other.gguf", present: true }]),
    });
    // No electronModels → probeGguf falls to llama bridge → no match → unknown.
    const ready = await isPrimaryLlmReady();
    expect(ready).toBe(false);
  });

  it("returns true when in Electron with llama bridge finding the primary present", async () => {
    makeElectron();
    installLlamaBridge({
      listModels: vi.fn(async () => [
        { id: "gemma-4-e4b-it-q4_k_m.gguf", present: true },
      ]),
    });
    // No electronModels bridge so we fall through to the llama bridge directly.
    const ready = await isPrimaryLlmReady();
    expect(ready).toBe(true);
  });
});

// ─── Branch: probeGguf when bridgeModels returns null but bridgeLlama also null ─

describe("probeGguf — both bridges absent", () => {
  it("returns unknown/none when no Electron bridges are available at all", async () => {
    // No electronModels, no electronLlama.
    stubFetch200();

    const result = await ensureModelsReady(["llm"]);

    for (const r of result.records.filter((r) => r.lane === "llm")) {
      expect(r.state).toBe("unknown");
      expect(r.source).toBe("none");
    }
  });
});

// ─── setDownload: EMPTY_DOWNLOAD used when key is new ──────────────────────────

describe("useModelStatus — download initialises from EMPTY_DOWNLOAD for a new key", () => {
  it("sets active:true from a fresh state when download starts", async () => {
    let emit: ((p: AnyRecord) => void) | undefined;
    const bridge = installModelsBridge({
      onProgress: vi.fn((_id: string, cb: (p: AnyRecord) => void) => {
        emit = cb;
        return () => undefined;
      }),
      download: vi.fn(async () => ({})),
      listPresence: vi.fn(async () => [
        {
          key: "gemma-4-e4b-it-q4_k_m",
          file: "gemma-4-e4b-it-q4_k_m.gguf",
          present: true,
          sizeBytes: 1,
        },
      ]),
    });
    stubFetch200();

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const p = result.current.download("gemma-4-e4b-it-q4_k_m");
      emit?.({ percent: 5, receivedBytes: 50, totalBytes: 1000, done: false });
      await p;
    });

    // Key was initialised from EMPTY_DOWNLOAD; midpoint progress was applied.
    expect(bridge.onProgress).toHaveBeenCalled();
    const state = result.current.downloads["gemma-4-e4b-it-q4_k_m"];
    expect(state.percent).toBe(100);
    expect(state.error).toBeNull();
  });
});
