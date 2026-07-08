import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the formulator Python derivation engine (python-engine.ts).
 *
 * The sandbox boundary (@/platform/python-sandbox/core) is fully mocked — no
 * worker, no Pyodide. The engine's own logic (session naming, input clamp,
 * payload parsing, column inference, traceback sanitation) runs real.
 */

import type { RunOptions, RunResult } from "@/platform/python-sandbox/core";

// ── Sandbox boundary mocks ───────────────────────────────────────────────────
// Declared before the import of the module under test so vi.mock hoisting
// picks them up; the factory closes over the spies lazily.

const ensureSandboxReadyMock = vi.fn<(onProgress?: (s: string) => void) => Promise<void>>();
const installPackagesMock =
  vi.fn<
    (sessionId: string, packages: string[], onProgress?: (s: string) => void) => Promise<void>
  >();
const loadDataFrameMock =
  vi.fn<
    (
      sessionId: string,
      varName: string,
      rows: Record<string, unknown>[],
      onProgress?: (s: string) => void,
    ) => Promise<void>
  >();
const runPythonMock = vi.fn<(code: string, opts: RunOptions) => Promise<RunResult>>();
const resetSessionMock = vi.fn<(sessionId: string) => Promise<void>>();

vi.mock("@/platform/python-sandbox/core", () => ({
  ensureSandboxReady: (...args: Parameters<typeof ensureSandboxReadyMock>) =>
    ensureSandboxReadyMock(...args),
  installPackages: (...args: Parameters<typeof installPackagesMock>) =>
    installPackagesMock(...args),
  loadDataFrame: (...args: Parameters<typeof loadDataFrameMock>) => loadDataFrameMock(...args),
  runPython: (...args: Parameters<typeof runPythonMock>) => runPythonMock(...args),
  resetSession: (...args: Parameters<typeof resetSessionMock>) => resetSessionMock(...args),
}));

import {
  MAX_DERIVED_ROWS,
  MAX_PY_INPUT_ROWS,
  PY_INPUT_VAR,
} from "@/features/data-formulator/core/formulator/model";
import {
  disposeDerivationSession,
  PAYLOAD_SENTINEL,
  runPythonDerivation,
  TRUNCATION_SENTINEL,
} from "@/features/data-formulator/core/formulator/python-engine";

// ── Helpers ──────────────────────────────────────────────────────────────────

function runResult(value: unknown): RunResult {
  return { value, stdout: "", stderr: "", durationMs: 1 };
}

function payloadOf(rows: unknown[], opts: { truncated?: boolean } = {}): string {
  return `${PAYLOAD_SENTINEL}${opts.truncated ? TRUNCATION_SENTINEL : ""}${JSON.stringify(rows)}`;
}

/**
 * Route the engine's two runPython calls: the user script never contains the
 * payload sentinel; the fixed epilogue always does.
 */
function mockPythonRuns(handlers: {
  user?: (opts: RunOptions) => Promise<RunResult>;
  epilogue?: (code: string, opts: RunOptions) => Promise<RunResult>;
}): void {
  runPythonMock.mockImplementation(async (code, opts) => {
    if (code.includes(PAYLOAD_SENTINEL)) {
      return handlers.epilogue ? handlers.epilogue(code, opts) : runResult(payloadOf([]));
    }
    return handlers.user ? handlers.user(opts) : runResult(null);
  });
}

beforeEach(() => {
  ensureSandboxReadyMock.mockResolvedValue(undefined);
  installPackagesMock.mockResolvedValue(undefined);
  loadDataFrameMock.mockResolvedValue(undefined);
  resetSessionMock.mockResolvedValue(undefined);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("runPythonDerivation", () => {
  it("runs the script and materializes rows with inferred columns", async () => {
    const derived = [
      { mois: "2024-01-01T00:00:00.000", total: 42.5, canal: "sms", actif: true, note: null },
      { mois: "2024-02-01T00:00:00.000", total: 10, canal: "ussd", actif: false, note: 3 },
    ];
    mockPythonRuns({
      user: async (opts) => {
        opts.onStdout?.("hello from pandas\n");
        return runResult(null);
      },
      epilogue: async () => runResult(payloadOf(derived)),
    });

    const userCode = "result = df.groupby('canal').sum()";
    const res = await runPythonDerivation({
      parentRows: [{ canal: "sms", montant: 5 }],
      code: userCode,
      nodeId: "node-1",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toEqual(derived);
    expect(res.rowCount).toBe(2);
    expect(res.truncated).toBe(false);
    expect(res.stdout).toContain("hello from pandas");
    expect(res.columns).toEqual([
      expect.objectContaining({ name: "mois", type: "date" }),
      expect.objectContaining({ name: "total", type: "number" }),
      expect.objectContaining({ name: "canal", type: "string" }),
      expect.objectContaining({ name: "actif", type: "boolean" }),
      // null in row 0 — inference must scan past it to the number in row 1
      expect.objectContaining({ name: "note", type: "number" }),
    ]);

    // user script reaches the sandbox verbatim, before the epilogue run
    expect(runPythonMock.mock.calls[0]?.[0]).toBe(userCode);
    expect(runPythonMock.mock.calls[1]?.[0]).toContain(PAYLOAD_SENTINEL);
    // parent rows are loaded under the PY_INPUT_VAR contract name
    expect(loadDataFrameMock.mock.calls[0]?.slice(0, 3)).toEqual([
      expect.stringContaining("node-1"),
      PY_INPUT_VAR,
      [{ canal: "sms", montant: 5 }],
    ]);
  });

  it("clamps sandbox input to MAX_PY_INPUT_ROWS", async () => {
    mockPythonRuns({});
    const parentRows = Array.from({ length: MAX_PY_INPUT_ROWS + 25 }, (_, i) => ({ i }));

    const res = await runPythonDerivation({
      parentRows,
      code: "result = df",
      nodeId: "n-clamp",
    });

    expect(res.ok).toBe(true);
    const sent = loadDataFrameMock.mock.calls[0]?.[2];
    expect(sent).toHaveLength(MAX_PY_INPUT_ROWS);
    expect(sent?.[0]).toEqual({ i: 0 });
    expect(sent?.[MAX_PY_INPUT_ROWS - 1]).toEqual({ i: MAX_PY_INPUT_ROWS - 1 });
  });

  it("flags truncation when the epilogue reports the output clamp", async () => {
    const rows = [{ v: 1 }, { v: 2 }];
    let epilogueCode = "";
    mockPythonRuns({
      epilogue: async (code) => {
        epilogueCode = code;
        return runResult(payloadOf(rows, { truncated: true }));
      },
    });

    const res = await runPythonDerivation({
      parentRows: [{ v: 0 }],
      code: "result = df",
      nodeId: "n-trunc",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.truncated).toBe(true);
    expect(res.rows).toEqual(rows);
    // the clamp itself lives in the epilogue script
    expect(epilogueCode).toContain(`.head(${MAX_DERIVED_ROWS})`);
    expect(epilogueCode).toContain('to_json(orient="records", date_format="iso")');
  });

  it("returns the sanitized traceback tail when `result` is missing", async () => {
    const spamFrames = Array.from(
      { length: 12 },
      (_, i) =>
        `  File "/lib/python311.zip/_pyodide/_base.py", line ${300 + i}, in run\n    coroutine = eval(self.code, globals, locals)`,
    ).join("\n");
    const message = [
      "PythonError: Traceback (most recent call last):",
      spamFrames,
      '  File "<exec>", line 12, in <module>',
      "RuntimeError: the script must assign a pandas DataFrame to the variable 'result'",
    ].join("\n");
    mockPythonRuns({
      user: async (opts) => {
        opts.onStdout?.("partial output\n");
        return runResult(null);
      },
      epilogue: async () => {
        throw new Error(message);
      },
    });

    const res = await runPythonDerivation({
      parentRows: [{ a: 1 }],
      code: "x = 1",
      nodeId: "n-missing",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("must assign a pandas DataFrame");
    expect(res.error).toContain('File "<exec>"');
    expect(res.error).not.toContain("_pyodide/_base.py");
    expect(res.error.split("\n").length).toBeLessThanOrEqual(15);
    // stdout produced before the failure is still surfaced
    expect(res.stdout).toContain("partial output");
  });

  it("appends captured stderr to the repair error", async () => {
    mockPythonRuns({
      user: async (opts) => {
        opts.onStderr?.("Traceback (most recent call last):\n");
        opts.onStderr?.('  File "<sandbox>", line 2, in <module>\n');
        opts.onStderr?.("ZeroDivisionError: division by zero\n");
        throw new Error("PythonError: script failed");
      },
    });

    const res = await runPythonDerivation({
      parentRows: [{ a: 1 }],
      code: "1/0",
      nodeId: "n-stderr",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("PythonError: script failed");
    expect(res.error).toContain('File "<sandbox>", line 2');
    expect(res.error).toContain("ZeroDivisionError: division by zero");
  });

  it("falls back to the stdout payload line when the worker returns no expression value", async () => {
    const rows = [{ canal: "sms", n: 2 }];
    mockPythonRuns({
      epilogue: async (_code, opts) => {
        opts.onStdout?.(`${payloadOf(rows)}\n`);
        // the worker's exec() wrapper discards trailing-expression values
        return runResult(null);
      },
    });

    const res = await runPythonDerivation({
      parentRows: [{ canal: "sms" }],
      code: "result = df",
      nodeId: "n-fallback",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toEqual(rows);
    // the payload line is wire format, not user stdout
    expect(res.stdout).not.toContain(PAYLOAD_SENTINEL);
  });

  it("fails cleanly when the epilogue yields no payload at all", async () => {
    mockPythonRuns({ epilogue: async () => runResult(null) });

    const res = await runPythonDerivation({
      parentRows: [],
      code: "result = df",
      nodeId: "n-nopayload",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("no 'result' payload");
  });

  it("rejects a payload that is not a JSON array of records", async () => {
    mockPythonRuns({
      epilogue: async () => runResult(`${PAYLOAD_SENTINEL}{"a":1}`),
    });

    const res = await runPythonDerivation({
      parentRows: [],
      code: "result = df",
      nodeId: "n-object",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("JSON array");
  });

  it("derives a stable session per nodeId and resets it before each run", async () => {
    mockPythonRuns({});

    await runPythonDerivation({ parentRows: [], code: "result = df", nodeId: "node-A" });
    await runPythonDerivation({ parentRows: [], code: "result = df", nodeId: "node-A" });
    await runPythonDerivation({ parentRows: [], code: "result = df", nodeId: "node-B" });

    const sessions = loadDataFrameMock.mock.calls.map((c) => c[0]);
    expect(sessions[0]).toBe(sessions[1]);
    expect(sessions[2]).not.toBe(sessions[0]);
    // each run resets its own session before loading the frame
    expect(resetSessionMock).toHaveBeenNthCalledWith(1, sessions[0]);
    expect(resetSessionMock).toHaveBeenNthCalledWith(2, sessions[0]);
    expect(resetSessionMock).toHaveBeenNthCalledWith(3, sessions[2]);
  });
});

describe("disposeDerivationSession", () => {
  it("resets the same session the run used", async () => {
    mockPythonRuns({});
    await runPythonDerivation({ parentRows: [], code: "result = df", nodeId: "node-D" });
    const runSession = loadDataFrameMock.mock.calls[0]?.[0];

    resetSessionMock.mockClear();
    await disposeDerivationSession("node-D");

    expect(resetSessionMock).toHaveBeenCalledTimes(1);
    expect(resetSessionMock).toHaveBeenCalledWith(runSession);
  });
});
