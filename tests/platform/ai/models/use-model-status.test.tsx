import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureModelsReady,
  isPrimaryLlmReady,
  useModelStatus,
} from "@/platform/ai/models/use-model-status";

// ─── Bridge fakes ───────────────────────────────────────────────────────────────
//
// `use-model-status` reads `window.electronModels` / `window.electronLlama`
// (presence + download) and `window.electronFS` + `window.electronDuckDB`
// (isElectron) live on every call, so the cheapest, most faithful boundary to
// fake is the global `window` + `fetch` + `caches` + `navigator.storage`. No
// module is mocked — only true IO/host boundaries are stubbed.

type AnyRecord = Record<string, unknown>;

const win = window as unknown as AnyRecord;

/** Mark the renderer as "running inside Electron" (isElectron() reads both). */
function makeElectron(): void {
  win.electronFS = {};
  win.electronDuckDB = {};
}

function clearElectronShell(): void {
  win.electronFS = undefined;
  win.electronDuckDB = undefined;
}

/** Install a fake `window.electronModels` with the methods the SUT touches. */
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

/** A transformers HEAD/cache/OPFS world where the embed asset is absent. */
function installEmbedMissing(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  // No Cache Storage, no OPFS.
  vi.stubGlobal("caches", undefined);
  vi.stubGlobal("navigator", { storage: undefined });
}

/** A world where the embed asset 200s on the public path. */
function installEmbedPublicPresent(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 200 })),
  );
  vi.stubGlobal("caches", undefined);
  vi.stubGlobal("navigator", { storage: undefined });
}

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  // Default: not Electron, no GGUF/embed presence anywhere.
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
  // jsdom's fetch can be left stubbed; ensure a clean baseline.
  globalThis.fetch = ORIGINAL_FETCH;
});

// ─── ensureModelsReady ──────────────────────────────────────────────────────────

describe("ensureModelsReady", () => {
  it("reports ready=false with the GGUF + embed primaries missing in a bare browser", async () => {
    installEmbedMissing();

    const result = await ensureModelsReady();

    // Two non-optional primaries exist: the 1.5B GGUF and the MiniLM embed.
    expect(result.ready).toBe(false);
    expect(result.missing.map((r) => r.key).sort()).toEqual(
      ["minilm-onnx-quantized", "qwen2.5-1.5b-instruct-q4_k_m"].sort(),
    );
    // records covers every manifest entry in the default ["llm","embed"] lanes.
    expect(result.records.length).toBe(4);
  });

  it("excludes optional models from `missing` even when they are absent", async () => {
    installEmbedMissing();

    const result = await ensureModelsReady();

    // The 0.5B + 7B GGUFs are optional → present in records, absent from missing.
    const recordKeys = result.records.map((r) => r.key);
    expect(recordKeys).toContain("qwen2.5-0.5b-instruct-q4_k_m");
    expect(recordKeys).toContain("qwen2.5-7b-instruct-q4_k_m");
    expect(result.missing.every((r) => r.optional === false)).toBe(true);
  });

  it("reports ready=true once both non-optional primaries are present", async () => {
    // GGUF primary present via listPresence; embed present via public HEAD 200.
    installModelsBridge({
      listPresence: vi.fn(async () => [
        {
          key: "qwen2.5-1.5b-instruct-q4_k_m",
          file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
          present: true,
          sizeBytes: 1_070_000_000,
        },
      ]),
    });
    installEmbedPublicPresent();

    const result = await ensureModelsReady();

    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("restricts probing to the requested lanes", async () => {
    installEmbedMissing();

    const result = await ensureModelsReady(["embed"]);

    // Only the single embed entry is probed when lane filter is ["embed"].
    expect(result.records.map((r) => r.key)).toEqual(["minilm-onnx-quantized"]);
    expect(result.missing.map((r) => r.key)).toEqual(["minilm-onnx-quantized"]);
  });

  it("returns empty records + ready=true for an empty lane list", async () => {
    installEmbedMissing();

    const result = await ensureModelsReady([]);

    // No wanted models → nothing missing → vacuously ready.
    expect(result.records).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.ready).toBe(true);
  });

  it("treats an `unknown` GGUF state as still-missing (blocks readiness)", async () => {
    // No bridges at all → probeGguf returns state:"unknown".
    installEmbedPublicPresent();

    const result = await ensureModelsReady(["llm"]);

    const primary = result.records.find((r) => r.key === "qwen2.5-1.5b-instruct-q4_k_m");
    expect(primary?.state).toBe("unknown");
    // `missing` is `state !== "present"`, so "unknown" counts as blocking.
    expect(result.missing.map((r) => r.key)).toContain("qwen2.5-1.5b-instruct-q4_k_m");
    expect(result.ready).toBe(false);
  });

  it("falls back to the llama bridge when listPresence has no matching entry", async () => {
    installModelsBridge({
      // Returns a list, but nothing matching the primary's key/file.
      listPresence: vi.fn(async () => [
        { key: "some-other", file: "other.gguf", present: true, sizeBytes: 1 },
      ]),
    });
    installLlamaBridge({
      listModels: vi.fn(async () => [
        { id: "qwen2.5-1.5b-instruct-q4_k_m.gguf", present: true },
      ]),
    });
    installEmbedPublicPresent();

    const result = await ensureModelsReady(["llm"]);

    const primary = result.records.find((r) => r.key === "qwen2.5-1.5b-instruct-q4_k_m");
    expect(primary?.state).toBe("present");
    expect(primary?.source).toBe("userData");
  });

  it("falls back to the llama bridge when listPresence throws", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => {
        throw new Error("ipc down");
      }),
    });
    installLlamaBridge({
      listModels: vi.fn(async () => [
        { id: "qwen2.5-1.5b-instruct-q4_k_m.gguf", present: true },
      ]),
    });
    installEmbedPublicPresent();

    const result = await ensureModelsReady(["llm"]);

    expect(result.records.find((r) => r.key === "qwen2.5-1.5b-instruct-q4_k_m")?.state).toBe(
      "present",
    );
  });

  it("matches a GGUF by file when key differs but ggufFile matches", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => [
        // key mismatch, but `file` equals the primary's ggufFile → matched.
        { key: "mismatched", file: "qwen2.5-1.5b-instruct-q4_k_m.gguf", present: false, sizeBytes: 0 },
      ]),
    });
    installEmbedPublicPresent();

    const result = await ensureModelsReady(["llm"]);

    const primary = result.records.find((r) => r.key === "qwen2.5-1.5b-instruct-q4_k_m");
    expect(primary?.state).toBe("missing");
    expect(primary?.source).toBe("userData");
  });

  it("carries sizeBytes from listPresence onto the GGUF record", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => [
        {
          key: "qwen2.5-1.5b-instruct-q4_k_m",
          file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
          present: true,
          sizeBytes: 1_234_567,
        },
      ]),
    });
    installEmbedPublicPresent();

    const result = await ensureModelsReady(["llm"]);

    expect(result.records.find((r) => r.key === "qwen2.5-1.5b-instruct-q4_k_m")?.sizeBytes).toBe(
      1_234_567,
    );
  });

  it("marks the GGUF record downloadable only inside Electron with the models bridge", async () => {
    makeElectron();
    installModelsBridge({
      listPresence: vi.fn(async () => []),
    });
    installEmbedMissing();

    const result = await ensureModelsReady(["llm"]);

    expect(
      result.records.find((r) => r.key === "qwen2.5-1.5b-instruct-q4_k_m")?.downloadable,
    ).toBe(true);
  });

  it("marks the GGUF record NOT downloadable in a browser (no Electron shell)", async () => {
    // models bridge present but not Electron → downloadable false.
    installModelsBridge();
    installEmbedMissing();

    const result = await ensureModelsReady(["llm"]);

    expect(
      result.records.find((r) => r.key === "qwen2.5-1.5b-instruct-q4_k_m")?.downloadable,
    ).toBe(false);
  });

  it("never marks the transformers/embed record downloadable", async () => {
    makeElectron();
    installModelsBridge();
    installEmbedPublicPresent();

    const result = await ensureModelsReady(["embed"]);

    expect(result.records[0].downloadable).toBe(false);
  });
});

// ─── transformers-asset presence probing (via ensureModelsReady) ─────────────────

describe("transformers asset probing", () => {
  it("reports present + public-asset when the HEAD probe 200s", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("navigator", { storage: undefined });

    const result = await ensureModelsReady(["embed"]);

    expect(result.records[0].state).toBe("present");
    expect(result.records[0].source).toBe("public-asset");
    // HEAD avoids downloading the body.
    expect(fetchMock).toHaveBeenCalledWith(
      "/models/transformers/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx",
      { method: "HEAD" },
    );
  });

  it("falls through to Cache Storage when HEAD is non-OK and a cached weight exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const cache = {
      keys: vi.fn(async () => [
        { url: "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx" },
      ]),
    };
    vi.stubGlobal("caches", {
      keys: vi.fn(async () => ["transformers-cache"]),
      open: vi.fn(async () => cache),
    });
    vi.stubGlobal("navigator", { storage: undefined });

    const result = await ensureModelsReady(["embed"]);

    expect(result.records[0].state).toBe("present");
    expect(result.records[0].source).toBe("browser-cache");
  });

  it("ignores cached requests that do not match the model weight URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const cache = {
      // URL lacks `model_quantized` → no match → keep probing.
      keys: vi.fn(async () => [{ url: "https://example.com/all-MiniLM-L6-v2/tokenizer.json" }]),
    };
    vi.stubGlobal("caches", {
      keys: vi.fn(async () => ["c"]),
      open: vi.fn(async () => cache),
    });
    vi.stubGlobal("navigator", { storage: undefined });

    const result = await ensureModelsReady(["embed"]);

    expect(result.records[0].state).toBe("missing");
    expect(result.records[0].source).toBe("none");
  });

  it("falls through to OPFS when the model dir is walkable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    vi.stubGlobal("caches", undefined);

    const minilmDir = {};
    const xenovaDir = {
      getDirectoryHandle: vi.fn(async (name: string) =>
        name === "all-MiniLM-L6-v2" ? minilmDir : undefined,
      ),
    };
    const modelsDir = {
      getDirectoryHandle: vi.fn(async (name: string) =>
        name === "Xenova" ? xenovaDir : undefined,
      ),
    };
    const root = {
      getDirectoryHandle: vi.fn(async (name: string) =>
        name === "models" ? modelsDir : undefined,
      ),
    };
    vi.stubGlobal("navigator", {
      storage: { getDirectory: vi.fn(async () => root) },
    });

    const result = await ensureModelsReady(["embed"]);

    expect(result.records[0].state).toBe("present");
    expect(result.records[0].source).toBe("browser-cache");
  });

  it("reports missing when the OPFS model dir is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    vi.stubGlobal("caches", undefined);
    const root = {
      // No "models" directory → getDirectoryHandle rejects.
      getDirectoryHandle: vi.fn(async () => {
        throw new Error("not found");
      }),
    };
    vi.stubGlobal("navigator", {
      storage: { getDirectory: vi.fn(async () => root) },
    });

    const result = await ensureModelsReady(["embed"]);

    expect(result.records[0].state).toBe("missing");
    expect(result.records[0].source).toBe("none");
  });

  it("treats a thrown HEAD fetch as non-present and continues to the cache probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("navigator", { storage: undefined });

    const result = await ensureModelsReady(["embed"]);

    // fetch threw, no caches, no OPFS → missing/none (no crash).
    expect(result.records[0].state).toBe("missing");
    expect(result.records[0].source).toBe("none");
  });

  it("swallows a throwing Cache Storage probe and falls through to missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    vi.stubGlobal("caches", {
      keys: vi.fn(async () => {
        throw new Error("cache exploded");
      }),
    });
    vi.stubGlobal("navigator", { storage: undefined });

    const result = await ensureModelsReady(["embed"]);

    expect(result.records[0].state).toBe("missing");
  });
});

// ─── isPrimaryLlmReady ──────────────────────────────────────────────────────────

describe("isPrimaryLlmReady", () => {
  it("returns false immediately when not running in Electron", async () => {
    // Even if a models bridge claims presence, the browser short-circuits.
    installModelsBridge({
      listPresence: vi.fn(async () => [
        {
          key: "qwen2.5-1.5b-instruct-q4_k_m",
          file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
          present: true,
          sizeBytes: 1,
        },
      ]),
    });

    await expect(isPrimaryLlmReady()).resolves.toBe(false);
  });

  it("returns true when in Electron and the primary GGUF is present", async () => {
    makeElectron();
    installModelsBridge({
      listPresence: vi.fn(async () => [
        {
          key: "qwen2.5-1.5b-instruct-q4_k_m",
          file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
          present: true,
          sizeBytes: 1,
        },
      ]),
    });

    await expect(isPrimaryLlmReady()).resolves.toBe(true);
  });

  it("returns false when in Electron but the primary GGUF is missing", async () => {
    makeElectron();
    installModelsBridge({
      listPresence: vi.fn(async () => [
        {
          key: "qwen2.5-1.5b-instruct-q4_k_m",
          file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
          present: false,
          sizeBytes: 0,
        },
      ]),
    });

    await expect(isPrimaryLlmReady()).resolves.toBe(false);
  });

  it("returns false when in Electron but presence is unknown (no bridges resolve it)", async () => {
    makeElectron();
    // electronFS+DuckDB set, but no electronModels/electronLlama → state "unknown".

    await expect(isPrimaryLlmReady()).resolves.toBe(false);
  });
});

// ─── useModelStatus hook ────────────────────────────────────────────────────────

describe("useModelStatus", () => {
  it("starts loading then resolves records + ready for the default lanes", async () => {
    installEmbedMissing();

    const { result } = renderHook(() => useModelStatus());

    // Initial synchronous state: loading, empty.
    expect(result.current.loading).toBe(true);
    expect(result.current.records).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records.length).toBe(4);
    // Nothing present → not ready.
    expect(result.current.ready).toBe(false);
  });

  it("computes ready=true when every non-optional tracked model is present", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => [
        {
          key: "qwen2.5-1.5b-instruct-q4_k_m",
          file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
          present: true,
          sizeBytes: 1,
        },
      ]),
    });
    installEmbedPublicPresent();

    const { result } = renderHook(() => useModelStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(true);
  });

  it("tracks only the requested lane when given a lane filter", async () => {
    installEmbedPublicPresent();

    const { result } = renderHook(() => useModelStatus(["embed"]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records.map((r) => r.key)).toEqual(["minilm-onnx-quantized"]);
    // The single tracked non-optional model is present → ready.
    expect(result.current.ready).toBe(true);
  });

  it("refresh() re-probes and reflects newly-present models", async () => {
    let present = false;
    installModelsBridge({
      listPresence: vi.fn(async () => [
        {
          key: "qwen2.5-1.5b-instruct-q4_k_m",
          file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
          present,
          sizeBytes: present ? 1 : 0,
        },
      ]),
    });
    installEmbedPublicPresent();

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(false);

    // Flip the world and refresh.
    present = true;
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.ready).toBe(true);
  });

  it("download() sets an error and no-ops when the models bridge is absent", async () => {
    // No electronModels installed.
    installEmbedMissing();

    const { result } = renderHook(() => useModelStatus(["embed"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.download("minilm-onnx-quantized");
    });

    expect(result.current.downloads["minilm-onnx-quantized"]).toMatchObject({
      error: "Model download requires the desktop app.",
    });
    expect(result.current.downloads["minilm-onnx-quantized"].active).toBe(false);
  });

  it("download() subscribes to progress, drives percent, then completes at 100", async () => {
    let emit: ((p: AnyRecord) => void) | undefined;
    const unsubscribe = vi.fn();
    const bridge = installModelsBridge({
      onProgress: vi.fn((_requestId: string, cb: (p: AnyRecord) => void) => {
        emit = cb;
        return unsubscribe;
      }),
      download: vi.fn(async () => ({
        key: "qwen2.5-1.5b-instruct-q4_k_m",
        present: true,
        sizeBytes: 1,
      })),
      // After download, refresh() re-probes; report present.
      listPresence: vi.fn(async () => [
        {
          key: "qwen2.5-1.5b-instruct-q4_k_m",
          file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
          present: true,
          sizeBytes: 1,
        },
      ]),
    });

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const p = result.current.download("qwen2.5-1.5b-instruct-q4_k_m");
      // Drive a mid-flight progress event before download resolves.
      emit?.({ percent: 42, receivedBytes: 420, totalBytes: 1000, done: false });
      await p;
    });

    const state = result.current.downloads["qwen2.5-1.5b-instruct-q4_k_m"];
    // Terminal state after a successful download.
    expect(state.percent).toBe(100);
    expect(state.active).toBe(false);
    expect(state.error).toBeNull();
    // The progress event was applied at least once.
    expect(bridge.onProgress).toHaveBeenCalled();
    // Listener torn down in finally.
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("download() records the error message when the bridge download rejects", async () => {
    const unsubscribe = vi.fn();
    installModelsBridge({
      onProgress: vi.fn(() => unsubscribe),
      download: vi.fn(async () => {
        throw new Error("disk full");
      }),
    });

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.download("qwen2.5-1.5b-instruct-q4_k_m");
    });

    const state = result.current.downloads["qwen2.5-1.5b-instruct-q4_k_m"];
    expect(state.error).toBe("disk full");
    expect(state.active).toBe(false);
    // Still cleaned up even on failure.
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("download() stringifies non-Error rejections", async () => {
    installModelsBridge({
      onProgress: vi.fn(() => () => undefined),
      download: vi.fn(async () => {
        // Reject with a non-Error value.
        return Promise.reject("plain string failure");
      }),
    });

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.download("qwen2.5-1.5b-instruct-q4_k_m");
    });

    expect(result.current.downloads["qwen2.5-1.5b-instruct-q4_k_m"].error).toBe(
      "plain string failure",
    );
  });

  it("a progress event with done=true clears the active flag", async () => {
    let emit: ((p: AnyRecord) => void) | undefined;
    installModelsBridge({
      onProgress: vi.fn((_id: string, cb: (p: AnyRecord) => void) => {
        emit = cb;
        return () => undefined;
      }),
      download: vi.fn(
        () =>
          new Promise((resolve) => {
            // Resolve on the next tick so we can observe the in-flight event.
            setTimeout(() => resolve({ present: true }), 0);
          }),
      ),
      listPresence: vi.fn(async () => []),
    });

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const p = result.current.download("qwen2.5-1.5b-instruct-q4_k_m");
      emit?.({ percent: 100, receivedBytes: 1000, totalBytes: 1000, done: true });
      await p;
    });

    // active:false comes from the done:true event AND the success branch.
    expect(result.current.downloads["qwen2.5-1.5b-instruct-q4_k_m"].active).toBe(false);
  });

  it("cancel() is a no-op when there is no active download for the key", async () => {
    const bridge = installModelsBridge();

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.cancel("qwen2.5-1.5b-instruct-q4_k_m");
    });

    // No active entry → abort never called, no download state created.
    expect(bridge.abort).not.toHaveBeenCalled();
    expect(result.current.downloads["qwen2.5-1.5b-instruct-q4_k_m"]).toBeUndefined();
  });

  it("cancel() aborts an in-flight download, unsubscribes, and marks inactive", async () => {
    const unsubscribe = vi.fn();
    let resolveDownload: ((v: unknown) => void) | undefined;
    const abort = vi.fn(async () => true);
    installModelsBridge({
      abort,
      onProgress: vi.fn(() => unsubscribe),
      download: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveDownload = resolve;
          }),
      ),
      listPresence: vi.fn(async () => []),
    });

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Kick off a download that never resolves until we cancel.
    let downloadPromise: Promise<void> | undefined;
    await act(async () => {
      downloadPromise = result.current.download("qwen2.5-1.5b-instruct-q4_k_m");
      // Let the synchronous body register the active entry.
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.cancel("qwen2.5-1.5b-instruct-q4_k_m");
    });

    expect(abort).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalled();
    expect(result.current.downloads["qwen2.5-1.5b-instruct-q4_k_m"].active).toBe(false);

    // Let the dangling download promise settle so no unhandled rejection leaks.
    await act(async () => {
      resolveDownload?.({ present: true });
      await downloadPromise;
    });
  });

  it("cancel() swallows an aborting bridge that rejects", async () => {
    const unsubscribe = vi.fn();
    let resolveDownload: ((v: unknown) => void) | undefined;
    installModelsBridge({
      abort: vi.fn(async () => {
        throw new Error("abort failed");
      }),
      onProgress: vi.fn(() => unsubscribe),
      download: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveDownload = resolve;
          }),
      ),
      listPresence: vi.fn(async () => []),
    });

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.download("qwen2.5-1.5b-instruct-q4_k_m");
      await Promise.resolve();
    });

    // Should not throw despite abort() rejecting.
    await act(async () => {
      await result.current.cancel("qwen2.5-1.5b-instruct-q4_k_m");
    });

    expect(result.current.downloads["qwen2.5-1.5b-instruct-q4_k_m"].active).toBe(false);

    await act(async () => {
      resolveDownload?.({ present: true });
    });
  });
});
