import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_MANIFEST, primaryForLane } from "@/platform/ai/models/model-manifest";
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
// fake is the global `window`. No module is mocked — only true IO/host
// boundaries are stubbed. Both the chat GGUF and the embedding GGUF are
// `electron-gguf` entries now, so both are probed the same way (no more
// fetch/Cache Storage/OPFS simulation for a separate transformers.js lane).

type AnyRecord = Record<string, unknown>;

const win = window as unknown as AnyRecord;

// The primaries are DERIVED from the manifest so a catalog change updates the
// pins instead of failing them.
const LLM_KEY = primaryForLane("llm").key;
const LLM_FILE = primaryForLane("llm").ggufFile ?? "";
const EMBED_PRIMARY = primaryForLane("embed");
const EMBED_KEY = EMBED_PRIMARY.key;
const EMBED_FILE = EMBED_PRIMARY.ggufFile ?? "";

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

/** A `listPresence()` row for a given key/file. */
function presenceRow(key: string, file: string, present: boolean, sizeBytes = 0): AnyRecord {
  return { key, file, present, sizeBytes };
}

beforeEach(() => {
  // Default: not Electron, no bridges installed → every model probes "unknown".
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

// ─── ensureModelsReady ──────────────────────────────────────────────────────────

describe("ensureModelsReady", () => {
  it("reports ready=false with the GGUF + embed primaries missing when no bridge is installed", async () => {
    const result = await ensureModelsReady();

    // Two non-optional primaries exist: the Gemma GGUF and the MiniLM embed GGUF.
    expect(result.ready).toBe(false);
    expect(result.missing.map((r) => r.key).sort()).toEqual([EMBED_KEY, LLM_KEY].sort());
    // records covers every manifest entry in the default ["llm","embed"] lanes.
    expect(result.records.length).toBe(MODEL_MANIFEST.length);
  });

  it("excludes optional models from `missing` even when they are absent", async () => {
    const result = await ensureModelsReady();

    // The Granite GGUF is optional → present in records, absent from missing.
    const recordKeys = result.records.map((r) => r.key);
    expect(recordKeys).toContain("granite-4.1-3b-instruct-q4_k_m");
    expect(result.missing.every((r) => r.optional === false)).toBe(true);
  });

  it("reports ready=true once both non-optional primaries are present", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => [
        presenceRow(LLM_KEY, LLM_FILE, true, 1_070_000_000),
        presenceRow(EMBED_KEY, EMBED_FILE, true, 25_008_064),
      ]),
    });

    const result = await ensureModelsReady();

    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("restricts probing to the requested lanes", async () => {
    const result = await ensureModelsReady(["embed"]);

    // Only the single embed entry is probed when lane filter is ["embed"].
    expect(result.records.map((r) => r.key)).toEqual([EMBED_KEY]);
    expect(result.missing.map((r) => r.key)).toEqual([EMBED_KEY]);
  });

  it("returns empty records + ready=true for an empty lane list", async () => {
    const result = await ensureModelsReady([]);

    // No wanted models → nothing missing → vacuously ready.
    expect(result.records).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.ready).toBe(true);
  });

  it("treats an `unknown` GGUF state as still-missing (blocks readiness)", async () => {
    // No bridges at all → probeGguf returns state:"unknown".
    const result = await ensureModelsReady(["llm"]);

    const primary = result.records.find((r) => r.key === LLM_KEY);
    expect(primary?.state).toBe("unknown");
    // `missing` is `state !== "present"`, so "unknown" counts as blocking.
    expect(result.missing.map((r) => r.key)).toContain(LLM_KEY);
    expect(result.ready).toBe(false);
  });

  it("falls back to the llama bridge when listPresence has no matching entry", async () => {
    installModelsBridge({
      // Returns a list, but nothing matching the primary's key/file.
      listPresence: vi.fn(async () => [presenceRow("some-other", "other.gguf", true, 1)]),
    });
    installLlamaBridge({
      listModels: vi.fn(async () => [{ id: LLM_FILE, present: true }]),
    });

    const result = await ensureModelsReady(["llm"]);

    const primary = result.records.find((r) => r.key === LLM_KEY);
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
      listModels: vi.fn(async () => [{ id: LLM_FILE, present: true }]),
    });

    const result = await ensureModelsReady(["llm"]);

    expect(result.records.find((r) => r.key === LLM_KEY)?.state).toBe("present");
  });

  it("matches a GGUF by file when key differs but ggufFile matches", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => [
        // key mismatch, but `file` equals the primary's ggufFile → matched.
        presenceRow("mismatched", LLM_FILE, false, 0),
      ]),
    });

    const result = await ensureModelsReady(["llm"]);

    const primary = result.records.find((r) => r.key === LLM_KEY);
    expect(primary?.state).toBe("missing");
    expect(primary?.source).toBe("userData");
  });

  it("carries sizeBytes from listPresence onto the GGUF record", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => [presenceRow(LLM_KEY, LLM_FILE, true, 1_234_567)]),
    });

    const result = await ensureModelsReady(["llm"]);

    expect(result.records.find((r) => r.key === LLM_KEY)?.sizeBytes).toBe(1_234_567);
  });

  it("marks the GGUF record downloadable only inside Electron with the models bridge", async () => {
    makeElectron();
    installModelsBridge();

    const result = await ensureModelsReady(["llm"]);

    expect(result.records.find((r) => r.key === LLM_KEY)?.downloadable).toBe(true);
  });

  it("marks the GGUF record NOT downloadable in a browser (no Electron shell)", async () => {
    // models bridge present but not Electron → downloadable false.
    installModelsBridge();

    const result = await ensureModelsReady(["llm"]);

    expect(result.records.find((r) => r.key === LLM_KEY)?.downloadable).toBe(false);
  });

  it("marks the embed record downloadable exactly like the llm record (same electron-gguf rule)", async () => {
    makeElectron();
    installModelsBridge();

    const result = await ensureModelsReady(["embed"]);

    expect(result.records[0].downloadable).toBe(true);
  });
});

// ─── isPrimaryLlmReady ──────────────────────────────────────────────────────────

describe("isPrimaryLlmReady", () => {
  it("returns false immediately when not running in Electron", async () => {
    // Even if a models bridge claims presence, the browser short-circuits.
    installModelsBridge({
      listPresence: vi.fn(async () => [presenceRow(LLM_KEY, LLM_FILE, true, 1)]),
    });

    await expect(isPrimaryLlmReady()).resolves.toBe(false);
  });

  it("returns true when in Electron and the primary GGUF is present", async () => {
    makeElectron();
    installModelsBridge({
      listPresence: vi.fn(async () => [presenceRow(LLM_KEY, LLM_FILE, true, 1)]),
    });

    await expect(isPrimaryLlmReady()).resolves.toBe(true);
  });

  it("returns false when in Electron but the primary GGUF is missing", async () => {
    makeElectron();
    installModelsBridge({
      listPresence: vi.fn(async () => [presenceRow(LLM_KEY, LLM_FILE, false, 0)]),
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
    const { result } = renderHook(() => useModelStatus());

    // Initial synchronous state: loading, empty.
    expect(result.current.loading).toBe(true);
    expect(result.current.records).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records.length).toBe(7);
    // Nothing present → not ready.
    expect(result.current.ready).toBe(false);
  });

  it("computes ready=true when every non-optional tracked model is present", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => [
        presenceRow(LLM_KEY, LLM_FILE, true, 1),
        presenceRow(EMBED_KEY, EMBED_FILE, true, 1),
      ]),
    });

    const { result } = renderHook(() => useModelStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(true);
  });

  it("tracks only the requested lane when given a lane filter", async () => {
    installModelsBridge({
      listPresence: vi.fn(async () => [presenceRow(EMBED_KEY, EMBED_FILE, true, 1)]),
    });

    const { result } = renderHook(() => useModelStatus(["embed"]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records.map((r) => r.key)).toEqual([EMBED_KEY]);
    // The single tracked non-optional model is present → ready.
    expect(result.current.ready).toBe(true);
  });

  it("refresh() re-probes and reflects newly-present models", async () => {
    let present = false;
    installModelsBridge({
      listPresence: vi.fn(async () => [
        { key: LLM_KEY, file: LLM_FILE, present, sizeBytes: present ? 1 : 0 },
      ]),
    });

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
    const { result } = renderHook(() => useModelStatus(["embed"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.download(EMBED_KEY);
    });

    expect(result.current.downloads[EMBED_KEY]).toMatchObject({
      error: "Model download requires the desktop app.",
    });
    expect(result.current.downloads[EMBED_KEY].active).toBe(false);
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
        key: LLM_KEY,
        present: true,
        sizeBytes: 1,
      })),
      // After download, refresh() re-probes; report present.
      listPresence: vi.fn(async () => [presenceRow(LLM_KEY, LLM_FILE, true, 1)]),
    });

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const p = result.current.download(LLM_KEY);
      // Drive a mid-flight progress event before download resolves.
      emit?.({ percent: 42, receivedBytes: 420, totalBytes: 1000, done: false });
      await p;
    });

    const state = result.current.downloads[LLM_KEY];
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
      await result.current.download(LLM_KEY);
    });

    const state = result.current.downloads[LLM_KEY];
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
      await result.current.download(LLM_KEY);
    });

    expect(result.current.downloads[LLM_KEY].error).toBe("plain string failure");
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
      const p = result.current.download(LLM_KEY);
      emit?.({ percent: 100, receivedBytes: 1000, totalBytes: 1000, done: true });
      await p;
    });

    // active:false comes from the done:true event AND the success branch.
    expect(result.current.downloads[LLM_KEY].active).toBe(false);
  });

  it("cancel() is a no-op when there is no active download for the key", async () => {
    const bridge = installModelsBridge();

    const { result } = renderHook(() => useModelStatus(["llm"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.cancel(LLM_KEY);
    });

    // No active entry → abort never called, no download state created.
    expect(bridge.abort).not.toHaveBeenCalled();
    expect(result.current.downloads[LLM_KEY]).toBeUndefined();
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
      downloadPromise = result.current.download(LLM_KEY);
      // Let the synchronous body register the active entry.
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.cancel(LLM_KEY);
    });

    expect(abort).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalled();
    expect(result.current.downloads[LLM_KEY].active).toBe(false);

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
      result.current.download(LLM_KEY);
      await Promise.resolve();
    });

    // Should not throw despite abort() rejecting.
    await act(async () => {
      await result.current.cancel(LLM_KEY);
    });

    expect(result.current.downloads[LLM_KEY].active).toBe(false);

    await act(async () => {
      resolveDownload?.({ present: true });
    });
  });
});
