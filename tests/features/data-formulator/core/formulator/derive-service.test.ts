import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for derive-service.ts, the module that binds derive-agent (LLM
 * goal + code), lineage (sql lane) and python-engine (python lane) into the
 * TableNode-producing `deriveNode` call the store uses.
 *
 * Every collaborator boundary is mocked: `deriveData` itself (so we can drive
 * its injected `runSql`/`runPython` engines directly, exactly like the real
 * orchestrator would), the lineage compiler/introspection helpers, the python
 * sandbox engine, and the single DuckDB read used to fetch parent rows for
 * the python lane. `model.ts` (sanitizeName, MAX_PY_INPUT_ROWS) is left real —
 * it is pure and is the contract this module is built on.
 */

const runReadOnlyQueryMock = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQueryMock(sql),
}));

const deriveDataMock = vi.fn();
vi.mock("@/features/data-formulator/core/formulator/derive-agent", () => ({
  deriveData: (...args: unknown[]) => deriveDataMock(...args),
}));

const buildLineageSQLMock = vi.fn();
const countDerivedRowsMock = vi.fn();
const fetchDerivedPreviewMock = vi.fn();
const introspectDerivedMock = vi.fn();
const sqlChainEligibleMock = vi.fn();
const validateDerivedSQLMock = vi.fn();
vi.mock("@/features/data-formulator/core/formulator/lineage", () => ({
  LEAF_PLACEHOLDER: "<leaf>",
  buildLineageSQL: (...args: unknown[]) => buildLineageSQLMock(...args),
  countDerivedRows: (...args: unknown[]) => countDerivedRowsMock(...args),
  fetchDerivedPreview: (...args: unknown[]) => fetchDerivedPreviewMock(...args),
  introspectDerived: (...args: unknown[]) => introspectDerivedMock(...args),
  sqlChainEligible: (...args: unknown[]) => sqlChainEligibleMock(...args),
  validateDerivedSQL: (...args: unknown[]) => validateDerivedSQLMock(...args),
}));

const runPythonDerivationMock = vi.fn();
vi.mock("@/features/data-formulator/core/formulator/python-engine", () => ({
  runPythonDerivation: (...args: unknown[]) => runPythonDerivationMock(...args),
}));

import { deriveNode } from "@/features/data-formulator/core/formulator/derive-service";
import {
  MAX_PY_INPUT_ROWS,
  type RefinedGoal,
  sanitizeName,
  type TableNode,
} from "@/features/data-formulator/core/formulator/model";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeGoal(overrides: Partial<RefinedGoal> = {}): RefinedGoal {
  return {
    engine: "sql",
    detailed_instruction: "Compute the failure rate per channel.",
    display_label: "Taux d'échec par canal",
    output_fields: [{ name: "taux_echec", type: "number" }],
    chart_type: "bar",
    reason: "Aggregation per channel.",
    ...overrides,
  };
}

const originalParent: TableNode = {
  id: "t1",
  name: "transactions",
  kind: "original",
  parentId: null,
  duckdbView: "tx_view",
  columns: [],
  rowCount: 100,
  createdAt: 0,
};

function baseInput(overrides: Partial<Parameters<typeof deriveNode>[0]> = {}) {
  return {
    tables: [originalParent],
    parentId: "t1",
    instruction: "calcule le taux d'échec par canal",
    shelfFields: ["channel"],
    unknownFields: ["taux_echec"],
    chartType: "bar",
    ...overrides,
  };
}

beforeEach(() => {
  runReadOnlyQueryMock.mockReset();
  deriveDataMock.mockReset();
  buildLineageSQLMock.mockReset();
  countDerivedRowsMock.mockReset();
  fetchDerivedPreviewMock.mockReset();
  introspectDerivedMock.mockReset();
  sqlChainEligibleMock.mockReset();
  validateDerivedSQLMock.mockReset();
  runPythonDerivationMock.mockReset();
});

// ─── Short-circuit paths (no execution reached) ───────────────────────────────

describe("deriveNode — short-circuit outcomes", () => {
  it("returns deriveData's failure verbatim without touching the sql/python lanes", async () => {
    sqlChainEligibleMock.mockReturnValue(true);
    deriveDataMock.mockResolvedValue({
      failed: true,
      goal: null,
      error: "no offline model is ready",
    });

    const out = await deriveNode(baseInput());

    expect(out).toEqual({ failed: true, goal: null, error: "no offline model is ready" });
    expect(introspectDerivedMock).not.toHaveBeenCalled();
    expect(runPythonDerivationMock).not.toHaveBeenCalled();
  });

  it("wraps a thrown deriveData error into a failed outcome with goal: null", async () => {
    sqlChainEligibleMock.mockReturnValue(true);
    deriveDataMock.mockRejectedValue(new Error("boom"));

    const out = await deriveNode(baseInput());

    expect(out).toEqual({ failed: true, goal: null, error: "boom" });
  });

  it("stringifies a non-Error thrown value from deriveData", async () => {
    sqlChainEligibleMock.mockReturnValue(true);
    // Exercises the `String(error)` fallback for a thrown non-Error value.
    deriveDataMock.mockRejectedValue("a plain string rejection");

    const out = await deriveNode(baseInput());

    expect(out).toEqual({ failed: true, goal: null, error: "a plain string rejection" });
  });

  it("returns a cancelled failure when the signal is already aborted once deriveData resolves", async () => {
    sqlChainEligibleMock.mockReturnValue(true);
    const goal = makeGoal();
    deriveDataMock.mockResolvedValue({
      goal,
      engine: "sql",
      code: "SELECT 1 FROM src",
      attempts: 1,
      dialog: [],
    });
    const controller = new AbortController();
    controller.abort();

    const out = await deriveNode(baseInput({ signal: controller.signal }));

    expect(out).toEqual({
      failed: true,
      goal,
      code: "SELECT 1 FROM src",
      error: "Dérivation annulée",
      cancelled: true,
    });
    // Cancellation short-circuits before any DuckDB introspection.
    expect(introspectDerivedMock).not.toHaveBeenCalled();
  });

  it("computes sqlEligible via sqlChainEligible before invoking deriveData", async () => {
    sqlChainEligibleMock.mockReturnValue(false);
    deriveDataMock.mockImplementation(async (_input, engines) => {
      expect(engines.sqlEligible).toBe(false);
      return { failed: true, goal: null, error: "stop here" };
    });

    await deriveNode(baseInput());

    expect(sqlChainEligibleMock).toHaveBeenCalledWith([originalParent], "t1");
  });
});

// ─── sql lane ─────────────────────────────────────────────────────────────────

describe("deriveNode — sql lane", () => {
  it("builds a TableNode from schema/count/preview over the compiled WITH chain after execution succeeds", async () => {
    sqlChainEligibleMock.mockReturnValue(true);
    validateDerivedSQLMock.mockResolvedValue({ ok: true });
    const goal = makeGoal();
    deriveDataMock.mockImplementation(async (_input, engines) => {
      const run = await engines.runSql("SELECT channel FROM src");
      expect(run).toEqual({ ok: true });
      return {
        goal,
        engine: "sql",
        code: "SELECT channel FROM src",
        attempts: 1,
        dialog: [{ role: "user", content: "x" }],
      };
    });
    introspectDerivedMock.mockResolvedValue([{ name: "channel", type: "string", dbType: "VARCHAR" }]);
    countDerivedRowsMock.mockResolvedValue(7);
    fetchDerivedPreviewMock.mockResolvedValue([{ channel: "USSD" }]);
    const onProgress = vi.fn();

    const out = await deriveNode(baseInput({ onProgress }));

    if ("failed" in out) throw new Error(`expected success, got: ${out.error}`);
    expect(out.outcome).toEqual({
      goal,
      engine: "sql",
      code: "SELECT channel FROM src",
      attempts: 1,
      dialog: [{ role: "user", content: "x" }],
    });
    expect(out.truncated).toBe(false);
    expect(out.node.engine).toBe("sql");
    expect(out.node.code).toBe("SELECT channel FROM src");
    expect(out.node.parentId).toBe("t1");
    expect(out.node.id).toMatch(/^t-/);
    expect(out.node.name).toBe(sanitizeName(goal.display_label, out.node.id));
    expect(out.node.columns).toEqual([{ name: "channel", type: "string", dbType: "VARCHAR" }]);
    expect(out.node.rowCount).toBe(7);
    expect(out.node.rows).toEqual([{ channel: "USSD" }]);

    // Validation happens through the sql lane, schema/count/preview run over
    // [...tables, base] — the base node just derived, appended to the chain.
    expect(validateDerivedSQLMock).toHaveBeenCalledWith(
      [originalParent],
      "t1",
      "SELECT channel FROM src",
    );
    const [withNode, nodeId] = introspectDerivedMock.mock.calls[0];
    expect(withNode).toHaveLength(2);
    expect(withNode[1]).toMatchObject({ id: nodeId, kind: "derived", engine: "sql" });
    expect(countDerivedRowsMock).toHaveBeenCalledWith(withNode, nodeId);
    expect(fetchDerivedPreviewMock).toHaveBeenCalledWith(withNode, nodeId);

    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      "Validation du SQL généré…",
      "Lecture du schéma dérivé…",
    ]);
    // sql lane never touches the python sandbox.
    expect(runPythonDerivationMock).not.toHaveBeenCalled();
  });

  it("wraps a post-success DuckDB introspection failure into a failed outcome carrying goal + code", async () => {
    sqlChainEligibleMock.mockReturnValue(true);
    validateDerivedSQLMock.mockResolvedValue({ ok: true });
    const goal = makeGoal();
    deriveDataMock.mockImplementation(async (_input, engines) => {
      await engines.runSql("SELECT 1 FROM src");
      return { goal, engine: "sql", code: "SELECT 1 FROM src", attempts: 1, dialog: [] };
    });
    introspectDerivedMock.mockRejectedValue(new Error('Binder Error: column "x" not found'));

    const out = await deriveNode(baseInput());

    expect(out).toEqual({
      failed: true,
      goal,
      code: "SELECT 1 FROM src",
      error: 'Binder Error: column "x" not found',
    });
  });

  it("stringifies a non-Error thrown value from the post-success introspection step", async () => {
    sqlChainEligibleMock.mockReturnValue(true);
    validateDerivedSQLMock.mockResolvedValue({ ok: true });
    const goal = makeGoal();
    deriveDataMock.mockImplementation(async (_input, engines) => {
      await engines.runSql("SELECT 1 FROM src");
      return { goal, engine: "sql", code: "SELECT 1 FROM src", attempts: 1, dialog: [] };
    });
    // Exercises the `String(error)` fallback for a thrown non-Error value.
    introspectDerivedMock.mockRejectedValue("plain string failure");

    const out = await deriveNode(baseInput());

    expect(out).toEqual({
      failed: true,
      goal,
      code: "SELECT 1 FROM src",
      error: "plain string failure",
    });
  });
});

// ─── python lane ──────────────────────────────────────────────────────────────

describe("deriveNode — python lane", () => {
  it("materializes the node straight from the captured pandas result, using in-memory parent rows and no re-execution", async () => {
    const pythonParent: TableNode = {
      id: "p1",
      name: "prior_python_table",
      kind: "derived",
      parentId: "root",
      engine: "python",
      code: "result = df",
      columns: [],
      rowCount: 3,
      rows: [{ a: 1 }, { a: 2 }, { a: 3 }],
      createdAt: 0,
    };
    sqlChainEligibleMock.mockReturnValue(false);
    runPythonDerivationMock.mockResolvedValue({
      ok: true,
      rows: [{ a: 1, b: 2 }],
      columns: [{ name: "a", type: "number", dbType: "DOUBLE" }],
      rowCount: 1,
      truncated: true,
      stdout: "",
    });
    const goal = makeGoal({ engine: "python" });
    deriveDataMock.mockImplementation(async (_input, engines) => {
      const run = await engines.runPython("result = df.head(1)");
      expect(run).toEqual({ ok: true });
      return { goal, engine: "python", code: "result = df.head(1)", attempts: 1, dialog: [] };
    });
    const onProgress = vi.fn();

    const out = await deriveNode(
      baseInput({ tables: [pythonParent], parentId: "p1", onProgress }),
    );

    if ("failed" in out) throw new Error(`expected success, got: ${out.error}`);
    expect(out.node.columns).toEqual([{ name: "a", type: "number", dbType: "DOUBLE" }]);
    expect(out.node.rowCount).toBe(1);
    expect(out.node.rows).toEqual([{ a: 1, b: 2 }]);
    expect(out.truncated).toBe(true);

    // No DuckDB round-trip at all: parent rows served from memory, and the
    // python lane never introspects the chain (execution IS materialization).
    expect(runReadOnlyQueryMock).not.toHaveBeenCalled();
    expect(introspectDerivedMock).not.toHaveBeenCalled();
    expect(countDerivedRowsMock).not.toHaveBeenCalled();
    expect(fetchDerivedPreviewMock).not.toHaveBeenCalled();

    expect(runPythonDerivationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentRows: [{ a: 1 }, { a: 2 }, { a: 3 }],
        code: "result = df.head(1)",
        nodeId: expect.any(String),
        onProgress,
      }),
    );
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual(["Exécution pandas dans le bac à sable…"]);
  });

  it("fetches parent rows through the compiled lineage SQL when the parent's data lives in DuckDB", async () => {
    sqlChainEligibleMock.mockReturnValue(false);
    buildLineageSQLMock.mockReturnValue("SELECT * FROM tx_view LIMIT 10000");
    runReadOnlyQueryMock.mockResolvedValue([{ channel: "SMS" }]);
    runPythonDerivationMock.mockResolvedValue({
      ok: true,
      rows: [{ channel: "SMS" }],
      columns: [],
      rowCount: 1,
      truncated: false,
      stdout: "",
    });
    const goal = makeGoal({ engine: "python" });
    deriveDataMock.mockImplementation(async (_input, engines) => {
      await engines.runPython("result = df");
      return { goal, engine: "python", code: "result = df", attempts: 1, dialog: [] };
    });

    const out = await deriveNode(baseInput());

    if ("failed" in out) throw new Error(`expected success, got: ${out.error}`);
    expect(out.node.rows).toEqual([{ channel: "SMS" }]);
    expect(buildLineageSQLMock).toHaveBeenCalledWith(
      [originalParent],
      "t1",
      `SELECT * FROM <leaf> LIMIT ${MAX_PY_INPUT_ROWS}`,
    );
    expect(runReadOnlyQueryMock).toHaveBeenCalledWith("SELECT * FROM tx_view LIMIT 10000");
  });

  it("surfaces a runPythonDerivation failure through the injected runPython call", async () => {
    sqlChainEligibleMock.mockReturnValue(false);
    runPythonDerivationMock.mockResolvedValue({
      ok: false,
      error: "RuntimeError: the script must assign a pandas DataFrame to 'result'",
      stdout: "",
    });
    deriveDataMock.mockImplementation(async (_input, engines) => {
      const run = await engines.runPython("x = 1");
      expect(run).toEqual({
        ok: false,
        error: "RuntimeError: the script must assign a pandas DataFrame to 'result'",
      });
      return {
        failed: true,
        goal: makeGoal({ engine: "python" }),
        error: run.error,
        code: "x = 1",
      };
    });

    const out = await deriveNode(baseInput());

    expect(out).toEqual({
      failed: true,
      goal: makeGoal({ engine: "python" }),
      error: "RuntimeError: the script must assign a pandas DataFrame to 'result'",
      code: "x = 1",
    });
  });

  it("fetches parent rows through the compiled lineage SQL when the parent is a sql-lane derived node (not python)", async () => {
    const sqlDerivedParent: TableNode = {
      id: "d1",
      name: "sql_derived",
      kind: "derived",
      parentId: "root",
      engine: "sql",
      code: "SELECT * FROM src",
      columns: [],
      rowCount: 4,
      createdAt: 0,
    };
    sqlChainEligibleMock.mockReturnValue(false);
    buildLineageSQLMock.mockReturnValue("SELECT * FROM node_d1 LIMIT 10000");
    runReadOnlyQueryMock.mockResolvedValue([{ channel: "SMS" }]);
    runPythonDerivationMock.mockResolvedValue({
      ok: true,
      rows: [{ channel: "SMS" }],
      columns: [],
      rowCount: 1,
      truncated: false,
      stdout: "",
    });
    const goal = makeGoal({ engine: "python" });
    deriveDataMock.mockImplementation(async (_input, engines) => {
      await engines.runPython("result = df");
      return { goal, engine: "python", code: "result = df", attempts: 1, dialog: [] };
    });

    const out = await deriveNode(
      baseInput({ tables: [originalParent, sqlDerivedParent], parentId: "d1" }),
    );

    if ("failed" in out) throw new Error(`expected success, got: ${out.error}`);
    // A sql-lane (non-python) derived parent still routes through the SQL
    // lineage fetch, not the in-memory shortcut.
    expect(runReadOnlyQueryMock).toHaveBeenCalledWith("SELECT * FROM node_d1 LIMIT 10000");
  });

  it("surfaces the parent-not-found error from the injected runPython call", async () => {
    sqlChainEligibleMock.mockReturnValue(false);
    deriveDataMock.mockImplementation(async (_input, engines) => {
      await expect(engines.runPython("result = df")).rejects.toThrow(
        'Derive: unknown parent table "missing"',
      );
      return { failed: true, goal: null, error: "unknown parent" };
    });

    const out = await deriveNode(baseInput({ parentId: "missing" }));

    expect(out).toEqual({ failed: true, goal: null, error: "unknown parent" });
  });

  it("returns a contract-breach failure when deriveData reports python success but python never ran", async () => {
    sqlChainEligibleMock.mockReturnValue(false);
    const goal = makeGoal({ engine: "python" });
    deriveDataMock.mockResolvedValue({
      goal,
      engine: "python",
      code: "result = df",
      attempts: 1,
      dialog: [],
    });

    const out = await deriveNode(baseInput());

    expect(out).toEqual({
      failed: true,
      goal,
      error: "Python run missing",
      code: "result = df",
    });
    expect(runPythonDerivationMock).not.toHaveBeenCalled();
  });
});
