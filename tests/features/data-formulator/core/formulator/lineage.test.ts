import { beforeEach, describe, expect, it, vi } from "vitest";

// lineage.ts touches DuckDB only through runReadOnlyQuery. Mock that single
// boundary; the quoting helpers are pure, so the real implementations are
// pulled from pushdown.ts (no shared-duckdb / IPC side effects).
const runReadOnlyQueryMock = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();
vi.mock("@/platform/duckdb/duckdb", async () => {
  const pushdown = await import("@/platform/duckdb/pushdown");
  return {
    quoteIdent: pushdown.quoteIdent,
    quoteLiteral: pushdown.quoteLiteral,
    runReadOnlyQuery: (sql: string) => runReadOnlyQueryMock(sql),
  };
});

import {
  buildLineageSQL,
  countDerivedRows,
  fetchDerivedPreview,
  introspectDerived,
  LEAF_PLACEHOLDER,
  sqlChainEligible,
  validateDerivedSQL,
} from "@/features/data-formulator/core/formulator/lineage";
import { PREVIEW_ROWS, type TableNode } from "@/features/data-formulator/core/formulator/model";

// ─── Node builders ─────────────────────────────────────────────────────────

function original(id: string, duckdbView: string): TableNode {
  return {
    id,
    name: id,
    kind: "original",
    parentId: null,
    duckdbView,
    columns: [],
    rowCount: 0,
    createdAt: 0,
  };
}

function sqlNode(id: string, parentId: string, code?: string): TableNode {
  return {
    id,
    name: id,
    kind: "derived",
    parentId,
    engine: "sql",
    code,
    columns: [],
    rowCount: 0,
    createdAt: 0,
  };
}

function pyNode(id: string, parentId: string): TableNode {
  return {
    id,
    name: id,
    kind: "derived",
    parentId,
    engine: "python",
    code: "result = df",
    columns: [],
    rowCount: 0,
    rows: [],
    createdAt: 0,
  };
}

// original → sql → sql, with dashes in every id and in the view name.
const chain: TableNode[] = [
  original("root-1", "ds_ventes-2026"),
  sqlNode("a-1", "root-1", "SELECT canal, COUNT(*) AS n FROM src GROUP BY canal"),
  sqlNode("b-2", "a-1", "SELECT * FROM src WHERE n > 10"),
];

beforeEach(() => {
  runReadOnlyQueryMock.mockReset();
});

// ─── sqlChainEligible ──────────────────────────────────────────────────────

describe("sqlChainEligible", () => {
  it("accepts an original→sql→sql chain", () => {
    expect(sqlChainEligible(chain, "b-2")).toBe(true);
  });

  it("accepts the original itself", () => {
    expect(sqlChainEligible(chain, "root-1")).toBe(true);
  });

  it("rejects a chain with a python node mid-chain", () => {
    const nodes = [
      original("root-1", "ds_ventes-2026"),
      pyNode("py-1", "root-1"),
      sqlNode("c-3", "py-1", "SELECT * FROM src"),
    ];
    expect(sqlChainEligible(nodes, "c-3")).toBe(false);
  });

  it("rejects a derived node with no engine", () => {
    const nodes = [
      original("root-1", "v"),
      { ...sqlNode("x-1", "root-1", "SELECT 1"), engine: undefined },
    ];
    expect(sqlChainEligible(nodes, "x-1")).toBe(false);
  });

  it("rejects an unknown leaf", () => {
    expect(sqlChainEligible(chain, "nope")).toBe(false);
  });
});

// ─── buildLineageSQL ───────────────────────────────────────────────────────

describe("buildLineageSQL", () => {
  it("compiles original→sql→sql into one WITH chain, in lineage order, with src wrapping and quoted dashed names", () => {
    expect(buildLineageSQL(chain, "b-2")).toBe(
      'WITH "node_a-1" AS (WITH src AS (SELECT * FROM "ds_ventes-2026") SELECT canal, COUNT(*) AS n FROM src GROUP BY canal), ' +
        '"node_b-2" AS (WITH src AS (SELECT * FROM "node_a-1") SELECT * FROM src WHERE n > 10) ' +
        'SELECT * FROM "node_b-2"',
    );
  });

  it("resolves an original leaf straight to its quoted duckdbView (no WITH)", () => {
    expect(buildLineageSQL(chain, "root-1")).toBe('SELECT * FROM "ds_ventes-2026"');
  });

  it("substitutes every LEAF_PLACEHOLDER in a custom select", () => {
    const sql = buildLineageSQL(
      chain,
      "b-2",
      `SELECT COUNT(*) FROM ${LEAF_PLACEHOLDER} JOIN ${LEAF_PLACEHOLDER} USING (canal)`,
    );
    expect(sql.endsWith('SELECT COUNT(*) FROM "node_b-2" JOIN "node_b-2" USING (canal)')).toBe(
      true,
    );
  });

  it("does not double-quote an already-quoted placeholder (buildSQL templates)", () => {
    // core/sql.ts buildSQL interpolates the table as `FROM "<table>"`, so the
    // template arrives with the placeholder already inside quotes.
    const sql = buildLineageSQL(chain, "b-2", `SELECT canal FROM "${LEAF_PLACEHOLDER}" LIMIT 5`);
    expect(sql.endsWith('SELECT canal FROM "node_b-2" LIMIT 5')).toBe(true);
    expect(sql).not.toContain('""');
  });

  it("strips trailing semicolons from node code so the CTE body stays valid", () => {
    const nodes = [original("r", "v"), sqlNode("s", "r", "SELECT * FROM src;\n")];
    expect(buildLineageSQL(nodes, "s")).toBe(
      'WITH "node_s" AS (WITH src AS (SELECT * FROM "v") SELECT * FROM src) SELECT * FROM "node_s"',
    );
  });

  it("throws on a python ancestor", () => {
    const nodes = [
      original("root-1", "v"),
      pyNode("py-1", "root-1"),
      sqlNode("c-3", "py-1", "SELECT * FROM src"),
    ];
    expect(() => buildLineageSQL(nodes, "c-3")).toThrow(/python/i);
  });

  it("throws on an unknown leaf", () => {
    expect(() => buildLineageSQL(chain, "nope")).toThrow(/unknown/i);
  });

  it("throws when a sql node has no code", () => {
    const nodes = [original("r", "v"), sqlNode("s", "r", undefined)];
    expect(() => buildLineageSQL(nodes, "s")).toThrow(/no SQL code/i);
  });

  it("throws when the root original has no duckdbView", () => {
    const nodes = [
      { ...original("r", "v"), duckdbView: undefined },
      sqlNode("s", "r", "SELECT * FROM src"),
    ];
    expect(() => buildLineageSQL(nodes, "s")).toThrow(/duckdbView/);
  });

  it("terminates and throws on a corrupt parentId cycle instead of hanging", () => {
    const nodes = [sqlNode("a", "b", "SELECT * FROM src"), sqlNode("b", "a", "SELECT * FROM src")];
    expect(() => buildLineageSQL(nodes, "a")).toThrow(/original/i);
  });
});

// ─── validateDerivedSQL ────────────────────────────────────────────────────

describe("validateDerivedSQL", () => {
  it("EXPLAINs a one-node probe chain over the parent and returns ok", async () => {
    runReadOnlyQueryMock.mockResolvedValueOnce([]);
    const result = await validateDerivedSQL(chain, "a-1", "SELECT canal FROM src");
    expect(result).toEqual({ ok: true });
    expect(runReadOnlyQueryMock).toHaveBeenCalledTimes(1);
    const sql = runReadOnlyQueryMock.mock.calls[0][0];
    expect(sql.startsWith("EXPLAIN WITH ")).toBe(true);
    // Probe reads the parent's CTE, which itself chains back to the original.
    expect(sql).toContain('"node_a-1" AS (WITH src AS (SELECT * FROM "ds_ventes-2026")');
    expect(sql).toContain('(WITH src AS (SELECT * FROM "node_a-1") SELECT canal FROM src)');
  });

  it("returns the DuckDB error message for the repair loop", async () => {
    runReadOnlyQueryMock.mockRejectedValueOnce(
      new Error('Binder Error: Referenced column "canall" not found'),
    );
    const result = await validateDerivedSQL(chain, "a-1", "SELECT canall FROM src");
    expect(result).toEqual({
      ok: false,
      error: 'Binder Error: Referenced column "canall" not found',
    });
  });

  it("returns ok:false without querying when the parent chain is python-lane", async () => {
    const nodes = [original("root-1", "v"), pyNode("py-1", "root-1")];
    const result = await validateDerivedSQL(nodes, "py-1", "SELECT * FROM src");
    expect(result.ok).toBe(false);
    expect(runReadOnlyQueryMock).not.toHaveBeenCalled();
  });
});

// ─── introspectDerived ─────────────────────────────────────────────────────

describe("introspectDerived", () => {
  it("DESCRIBEs the chain and maps DuckDB column types to ColType, keeping dbType raw", async () => {
    const cases: Array<[string, string]> = [
      ["TINYINT", "number"],
      ["SMALLINT", "number"],
      ["INTEGER", "number"],
      ["BIGINT", "number"],
      ["HUGEINT", "number"],
      ["UBIGINT", "number"],
      ["DOUBLE", "number"],
      ["FLOAT", "number"],
      ["DECIMAL(18,3)", "number"],
      ["DATE", "date"],
      ["TIME", "date"],
      ["TIMESTAMP", "date"],
      ["TIMESTAMP WITH TIME ZONE", "date"],
      ["BOOLEAN", "boolean"],
      ["VARCHAR", "string"],
      ["INTERVAL", "string"],
      ["BLOB", "string"],
    ];
    runReadOnlyQueryMock.mockResolvedValueOnce(
      cases.map(([dbType], i) => ({ column_name: `c${i}`, column_type: dbType })),
    );

    const columns = await introspectDerived(chain, "b-2");

    const sql = runReadOnlyQueryMock.mock.calls[0][0];
    expect(sql.startsWith("DESCRIBE (WITH ")).toBe(true);
    expect(sql.endsWith('SELECT * FROM "node_b-2")')).toBe(true);
    expect(columns).toEqual(cases.map(([dbType, type], i) => ({ name: `c${i}`, type, dbType })));
  });
});

// ─── fetchDerivedPreview / countDerivedRows ────────────────────────────────

describe("fetchDerivedPreview", () => {
  it("selects the leaf with the default PREVIEW_ROWS limit", async () => {
    const rows = [{ canal: "USSD", n: 12 }];
    runReadOnlyQueryMock.mockResolvedValueOnce(rows);
    await expect(fetchDerivedPreview(chain, "b-2")).resolves.toEqual(rows);
    expect(
      runReadOnlyQueryMock.mock.calls[0][0].endsWith(
        `SELECT * FROM "node_b-2" LIMIT ${PREVIEW_ROWS}`,
      ),
    ).toBe(true);
  });

  it("honors an explicit limit", async () => {
    runReadOnlyQueryMock.mockResolvedValueOnce([]);
    await fetchDerivedPreview(chain, "b-2", 5);
    expect(runReadOnlyQueryMock.mock.calls[0][0].endsWith("LIMIT 5")).toBe(true);
  });
});

describe("countDerivedRows", () => {
  it("runs SELECT COUNT(*) against the leaf and returns a plain number (BigInt-safe)", async () => {
    runReadOnlyQueryMock.mockResolvedValueOnce([{ n: 42n }]);
    await expect(countDerivedRows(chain, "b-2")).resolves.toBe(42);
    expect(
      runReadOnlyQueryMock.mock.calls[0][0].endsWith('SELECT COUNT(*) AS n FROM "node_b-2"'),
    ).toBe(true);
  });

  it("returns 0 when the result set is empty", async () => {
    runReadOnlyQueryMock.mockResolvedValueOnce([]);
    await expect(countDerivedRows(chain, "b-2")).resolves.toBe(0);
  });
});
