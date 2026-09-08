/**
 * Unit tests for src/platform/python-sandbox/core/index.ts
 *
 * The module wraps a Web Worker behind a promise API.  We stub the global
 * Worker constructor so no real worker is spawned, then drive the message
 * protocol synchronously to exercise every exported function and branch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock Worker factory ───────────────────────────────────────────────────────

/**
 * A lightweight fake Worker.  Tests control it through the exposed helpers:
 *   - `fakeWorker.listeners` – the "message" listeners registered by the module
 *   - `fakeWorker.postMessage` – captures requests the module sends
 *   - `fakeWorker.emit(data)` – synchronously fires a MessageEvent to all listeners
 */
function makeFakeWorker() {
  const listeners: Array<(e: MessageEvent) => void> = [];

  const worker = {
    addEventListener: vi.fn((_type: string, fn: (e: MessageEvent) => void) => {
      listeners.push(fn);
    }),
    removeEventListener: vi.fn((_type: string, fn: (e: MessageEvent) => void) => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    postMessage: vi.fn(),
    /** Fire a fake MessageEvent to every currently registered listener. */
    emit(data: unknown) {
      const event = { data } as MessageEvent;
      // Iterate over a copy because handlers remove themselves inside the callback
      [...listeners].forEach((fn) => {
        fn(event);
      });
    },
    get listenerCount() {
      return listeners.length;
    },
  };

  return worker;
}

type FakeWorker = ReturnType<typeof makeFakeWorker>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Import a freshly-isolated copy of the module under test.
 * Must be called after vi.stubGlobal("Worker", ...) so the module picks up
 * the stub when it first calls `new Worker(...)`.
 */
async function importFresh() {
  vi.resetModules();
  return import("@/platform/python-sandbox/core/index");
}

/**
 * Return a fake worker stub that is pre-installed as the global Worker
 * constructor.  The stub will be used when the module first calls
 * `new Worker(url)`.
 *
 * We use a real class so that `new Worker(url)` returns `fw` without
 * triggering the "not a constructor" error that arrow-function mocks cause.
 */
function setupFakeWorker(): FakeWorker {
  const fw = makeFakeWorker();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function FakeWorkerConstructor(this: any, _url: string) {
    // return fw directly – the constructor's return value is used
    return fw;
  }
  vi.stubGlobal("Worker", FakeWorkerConstructor);
  return fw;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── ensureSandboxReady ────────────────────────────────────────────────────────

describe("ensureSandboxReady()", () => {
  it("creates a Worker, sends an INIT request, and resolves when READY arrives", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { ensureSandboxReady } = await importFresh();

    // Act – start the call but do not await yet
    const promise = ensureSandboxReady();

    // The module should have posted an INIT message immediately
    expect(fw.postMessage).toHaveBeenCalledTimes(1);
    const request = fw.postMessage.mock.calls[0][0] as { id: string; type: string };
    expect(request.type).toBe("INIT");
    expect(request.id).toMatch(/^sbx-/);

    // Simulate the worker responding with READY
    fw.emit({ id: request.id, type: "READY" });

    // Assert – promise should now resolve (undefined / void)
    await expect(promise).resolves.toBeUndefined();
  });

  it("calls onProgress callback when LOAD_PROGRESS arrives during INIT", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { ensureSandboxReady } = await importFresh();
    const onProgress = vi.fn();

    // Act
    const promise = ensureSandboxReady(onProgress);
    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };

    fw.emit({ id, type: "LOAD_PROGRESS", text: "Loading…" });
    fw.emit({ id, type: "READY" });
    await promise;

    // Assert
    expect(onProgress).toHaveBeenCalledWith("Loading…");
  });

  it("returns the same promise on repeated calls (singleton _readyPromise)", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { ensureSandboxReady } = await importFresh();

    // Act – call twice before resolving
    const p1 = ensureSandboxReady();
    const p2 = ensureSandboxReady();

    // Only one INIT should have been sent
    expect(fw.postMessage).toHaveBeenCalledTimes(1);

    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };
    fw.emit({ id, type: "READY" });

    await p1;
    await p2;

    // Assert – both references point to the same promise object
    expect(p1).toBe(p2);
  });

  it("rejects when the worker responds with ERROR during INIT", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { ensureSandboxReady } = await importFresh();

    // Act
    const promise = ensureSandboxReady();
    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };
    fw.emit({ id, type: "ERROR", error: "Pyodide failed to load" });

    // Assert
    await expect(promise).rejects.toThrow("Pyodide failed to load");
  });

  it("ignores messages with mismatched ids", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { ensureSandboxReady } = await importFresh();

    // Act
    const promise = ensureSandboxReady();
    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };

    // Fire a message with a different id – should be ignored
    fw.emit({ id: "sbx-wrong-id", type: "READY" });

    // Now fire the correct id
    fw.emit({ id, type: "READY" });

    // Assert – promise resolved
    await expect(promise).resolves.toBeUndefined();
  });
});

// ─── loadDataFrame ─────────────────────────────────────────────────────────────

describe("loadDataFrame()", () => {
  it("sends INIT then LOAD_DATAFRAME, resolves on RESULT", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { loadDataFrame } = await importFresh();
    const rows = [{ col: 1 }, { col: 2 }];

    // Act
    const promise = loadDataFrame("sess-1", "df", rows);

    // First call is the INIT (from ensureSandboxReady)
    const initReq = fw.postMessage.mock.calls[0][0] as { id: string; type: string };
    expect(initReq.type).toBe("INIT");
    fw.emit({ id: initReq.id, type: "READY" });

    // Wait for the module to proceed to LOAD_DATAFRAME
    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const dfReq = fw.postMessage.mock.calls[1][0] as {
      id: string;
      type: string;
      sessionId: string;
      varName: string;
      rows: unknown[];
    };
    expect(dfReq.type).toBe("LOAD_DATAFRAME");
    expect(dfReq.sessionId).toBe("sess-1");
    expect(dfReq.varName).toBe("df");
    expect(dfReq.rows).toEqual(rows);

    // Resolve
    fw.emit({ id: dfReq.id, type: "RESULT", value: { ok: true } });
    await expect(promise).resolves.toBeUndefined();
  });

  it("forwards onProgress messages from LOAD_DATAFRAME", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { loadDataFrame } = await importFresh();
    const onProgress = vi.fn();

    // Act
    const promise = loadDataFrame("sess-2", "data", [], onProgress);

    // Resolve INIT
    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    // Wait for LOAD_DATAFRAME to be sent
    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const dfId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;

    fw.emit({ id: dfId, type: "LOAD_PROGRESS", text: "Loading df…" });
    fw.emit({ id: dfId, type: "RESULT", value: null });

    await promise;

    // Assert – onProgress should have been called at least for the LOAD_DATAFRAME phase
    expect(onProgress).toHaveBeenCalledWith("Loading df…");
  });

  it("rejects when worker returns ERROR for LOAD_DATAFRAME", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { loadDataFrame } = await importFresh();

    const promise = loadDataFrame("sess-3", "df", []);

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const dfId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;
    fw.emit({ id: dfId, type: "ERROR", error: "DataFrame load failed" });

    await expect(promise).rejects.toThrow("DataFrame load failed");
  });
});

// ─── installPackages ───────────────────────────────────────────────────────────

describe("installPackages()", () => {
  it("sends INIT then INSTALL with correct packages, resolves on RESULT", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { installPackages } = await importFresh();

    // Act
    const promise = installPackages("sess-pk", ["numpy", "pandas"]);

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const installReq = fw.postMessage.mock.calls[1][0] as {
      id: string;
      type: string;
      sessionId: string;
      packages: string[];
    };
    expect(installReq.type).toBe("INSTALL");
    expect(installReq.sessionId).toBe("sess-pk");
    expect(installReq.packages).toEqual(["numpy", "pandas"]);

    fw.emit({ id: installReq.id, type: "RESULT", value: { installed: ["numpy", "pandas"] } });
    await expect(promise).resolves.toBeUndefined();
  });

  it("forwards onProgress messages during install", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { installPackages } = await importFresh();
    const onProgress = vi.fn();

    const promise = installPackages("sess-pk2", ["scipy"], onProgress);

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const installId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;

    fw.emit({ id: installId, type: "LOAD_PROGRESS", text: "Installing scipy…" });
    fw.emit({ id: installId, type: "RESULT", value: null });

    await promise;
    expect(onProgress).toHaveBeenCalledWith("Installing scipy…");
  });

  it("rejects when worker returns ERROR for INSTALL", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { installPackages } = await importFresh();

    const promise = installPackages("sess-pk3", ["bad-pkg"]);

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const installId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;
    fw.emit({ id: installId, type: "ERROR", error: "Package not found" });

    await expect(promise).rejects.toThrow("Package not found");
  });
});

// ─── runPython ─────────────────────────────────────────────────────────────────

describe("runPython()", () => {
  it("resolves with value, concatenated stdout, stderr, and a numeric durationMs", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { runPython } = await importFresh();

    // Act
    const promise = runPython("print('hi')", { sessionId: "run-1" });

    // Resolve INIT
    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const runReq = fw.postMessage.mock.calls[1][0] as {
      id: string;
      type: string;
      code: string;
      sessionId: string;
    };
    expect(runReq.type).toBe("RUN");
    expect(runReq.code).toBe("print('hi')");
    expect(runReq.sessionId).toBe("run-1");

    // Emit streaming output then the result
    fw.emit({ id: runReq.id, type: "STDOUT", text: "hello " });
    fw.emit({ id: runReq.id, type: "STDOUT", text: "world\n" });
    fw.emit({ id: runReq.id, type: "STDERR", text: "warning\n" });
    fw.emit({ id: runReq.id, type: "RESULT", value: 42 });

    const result = await promise;

    // Assert
    expect(result.value).toBe(42);
    expect(result.stdout).toBe("hello world\n");
    expect(result.stderr).toBe("warning\n");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls onStdout callback with each stdout chunk", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { runPython } = await importFresh();
    const onStdout = vi.fn();

    const promise = runPython("x=1", { sessionId: "run-2", onStdout });

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const runId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;

    fw.emit({ id: runId, type: "STDOUT", text: "chunk1" });
    fw.emit({ id: runId, type: "STDOUT", text: "chunk2" });
    fw.emit({ id: runId, type: "RESULT", value: null });

    await promise;
    expect(onStdout).toHaveBeenCalledWith("chunk1");
    expect(onStdout).toHaveBeenCalledWith("chunk2");
    expect(onStdout).toHaveBeenCalledTimes(2);
  });

  it("calls onStderr callback with each stderr chunk", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { runPython } = await importFresh();
    const onStderr = vi.fn();

    const promise = runPython("1/0", { sessionId: "run-3", onStderr });

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const runId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;

    fw.emit({ id: runId, type: "STDERR", text: "ZeroDivisionError" });
    fw.emit({ id: runId, type: "RESULT", value: null });

    await promise;
    expect(onStderr).toHaveBeenCalledWith("ZeroDivisionError");
  });

  it("calls onProgress callback when LOAD_PROGRESS arrives during RUN", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { runPython } = await importFresh();
    const onProgress = vi.fn();

    const promise = runPython("import numpy", { sessionId: "run-4", onProgress });

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const runId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;

    fw.emit({ id: runId, type: "LOAD_PROGRESS", text: "Loading numpy…" });
    fw.emit({ id: runId, type: "RESULT", value: null });

    await promise;
    expect(onProgress).toHaveBeenCalledWith("Loading numpy…");
  });

  it("rejects when the worker returns ERROR during RUN", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { runPython } = await importFresh();

    const promise = runPython("raise ValueError('oops')", { sessionId: "run-5" });

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const runId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;
    fw.emit({ id: runId, type: "ERROR", error: "ValueError: oops" });

    await expect(promise).rejects.toThrow("ValueError: oops");
  });

  it("accumulates multiple stdout chunks into a single string", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { runPython } = await importFresh();

    const promise = runPython("for i in range(3): print(i)", { sessionId: "run-6" });

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const runId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;

    fw.emit({ id: runId, type: "STDOUT", text: "0\n" });
    fw.emit({ id: runId, type: "STDOUT", text: "1\n" });
    fw.emit({ id: runId, type: "STDOUT", text: "2\n" });
    fw.emit({ id: runId, type: "RESULT", value: null });

    const result = await promise;
    expect(result.stdout).toBe("0\n1\n2\n");
  });

  it("works without optional callbacks (no-op path)", async () => {
    // Arrange – no onStdout / onStderr / onProgress provided
    const fw = setupFakeWorker();
    const { runPython } = await importFresh();

    const promise = runPython("x=1", { sessionId: "run-7" });

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const runId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;

    // Emit without any listener side effects – should not throw
    fw.emit({ id: runId, type: "STDOUT", text: "some output" });
    fw.emit({ id: runId, type: "STDERR", text: "some error" });
    fw.emit({ id: runId, type: "RESULT", value: undefined });

    const result = await promise;
    expect(result.stdout).toBe("some output");
    expect(result.stderr).toBe("some error");
  });
});

// ─── resetSession ──────────────────────────────────────────────────────────────

describe("resetSession()", () => {
  it("sends a RESET request and resolves on RESULT", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { resetSession } = await importFresh();

    // resetSession does NOT call ensureSandboxReady so INIT is not sent first.
    // It goes straight to send().
    const promise = resetSession("sess-reset");

    // The first (and only so far) postMessage is the RESET
    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(1));
    const resetReq = fw.postMessage.mock.calls[0][0] as {
      id: string;
      type: string;
      sessionId: string;
    };
    expect(resetReq.type).toBe("RESET");
    expect(resetReq.sessionId).toBe("sess-reset");

    fw.emit({ id: resetReq.id, type: "RESULT", value: { ok: true } });
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when the worker returns ERROR during RESET", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { resetSession } = await importFresh();

    const promise = resetSession("sess-err");

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(1));
    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };
    fw.emit({ id, type: "ERROR", error: "Reset failed" });

    await expect(promise).rejects.toThrow("Reset failed");
  });
});

// ─── Worker singleton (getWorker) ─────────────────────────────────────────────

describe("Worker singleton", () => {
  it("creates only one Worker instance even when multiple functions are called", async () => {
    // Arrange
    const fw = makeFakeWorker();
    let workerCallCount = 0;
    function FakeWorkerConstructor(_url: string) {
      workerCallCount++;
      return fw;
    }
    vi.stubGlobal("Worker", FakeWorkerConstructor);

    const { ensureSandboxReady, resetSession } = await importFresh();

    // Act – trigger two operations that both need the worker
    const p1 = ensureSandboxReady();
    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });
    await p1;

    const p2 = resetSession("sess-a");
    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const resetId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;
    fw.emit({ id: resetId, type: "RESULT", value: null });
    await p2;

    // Assert – Worker constructor called exactly once
    expect(workerCallCount).toBe(1);
  });
});

// ─── Message handler ignores unrelated message types ──────────────────────────

describe("send() message handler", () => {
  it("ignores STDOUT/STDERR messages before resolving on RESULT", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { resetSession } = await importFresh();

    const promise = resetSession("sess-msg");

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(1));
    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };

    // STDOUT and STDERR with the same id should not resolve/reject the promise
    fw.emit({ id, type: "STDOUT", text: "ignored" });
    fw.emit({ id, type: "STDERR", text: "also ignored" });

    // Now resolve
    fw.emit({ id, type: "RESULT", value: null });
    await expect(promise).resolves.toBeUndefined();
  });

  it("calls onStdout/onStderr/onProgress callbacks on matching message types when provided via send opts", async () => {
    // Arrange – test through runPython which passes all three callbacks
    const fw = setupFakeWorker();
    const { runPython } = await importFresh();
    const onStdout = vi.fn();
    const onStderr = vi.fn();
    const onProgress = vi.fn();

    const promise = runPython("x", { sessionId: "cb-test", onStdout, onStderr, onProgress });

    const initId = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: initId, type: "READY" });

    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const runId = (fw.postMessage.mock.calls[1][0] as { id: string }).id;

    // Fire every callback-triggering message type
    fw.emit({ id: runId, type: "LOAD_PROGRESS", text: "progress text" });
    fw.emit({ id: runId, type: "STDOUT", text: "stdout text" });
    fw.emit({ id: runId, type: "STDERR", text: "stderr text" });
    fw.emit({ id: runId, type: "RESULT", value: null });

    await promise;

    expect(onProgress).toHaveBeenCalledWith("progress text");
    expect(onStdout).toHaveBeenCalledWith("stdout text");
    expect(onStderr).toHaveBeenCalledWith("stderr text");
  });

  it("removes the listener after RESULT so stale messages do not cause side effects", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { resetSession } = await importFresh();

    const promise = resetSession("sess-cleanup");
    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(1));
    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };

    const listenerCountBefore = fw.listenerCount;
    fw.emit({ id, type: "RESULT", value: null });
    await promise;

    // After resolution the handler should have been removed
    expect(fw.listenerCount).toBe(listenerCountBefore - 1);
  });

  it("removes the listener after ERROR so stale messages do not cause side effects", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { resetSession } = await importFresh();

    const promise = resetSession("sess-err-cleanup");
    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(1));
    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };

    const listenerCountBefore = fw.listenerCount;
    fw.emit({ id, type: "ERROR", error: "oops" });
    await promise.catch(() => {});

    // After rejection the handler should have been removed
    expect(fw.listenerCount).toBe(listenerCountBefore - 1);
  });

  it("removes the listener after READY so stale messages do not cause side effects", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { ensureSandboxReady } = await importFresh();

    const promise = ensureSandboxReady();
    const { id } = fw.postMessage.mock.calls[0][0] as { id: string };

    const listenerCountBefore = fw.listenerCount;
    fw.emit({ id, type: "READY" });
    await promise;

    expect(fw.listenerCount).toBe(listenerCountBefore - 1);
  });
});

// ─── nextId uniqueness ────────────────────────────────────────────────────────

describe("request id generation", () => {
  it("generates unique ids for consecutive requests", async () => {
    // Arrange
    const fw = setupFakeWorker();
    const { resetSession } = await importFresh();

    // Fire two resets back-to-back
    const p1 = resetSession("a");
    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(1));
    const id1 = (fw.postMessage.mock.calls[0][0] as { id: string }).id;
    fw.emit({ id: id1, type: "RESULT", value: null });
    await p1;

    const p2 = resetSession("b");
    await vi.waitFor(() => expect(fw.postMessage).toHaveBeenCalledTimes(2));
    const id2 = (fw.postMessage.mock.calls[1][0] as { id: string }).id;
    fw.emit({ id: id2, type: "RESULT", value: null });
    await p2;

    // Assert – ids differ (extremely high probability given Date.now + random)
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^sbx-\d+-[a-z0-9]+$/);
    expect(id2).toMatch(/^sbx-\d+-[a-z0-9]+$/);
  });
});
