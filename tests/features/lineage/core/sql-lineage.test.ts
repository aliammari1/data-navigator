import { Parser } from "node-sql-parser/build/postgresql";
import { describe, expect, it, vi } from "vitest";
import { parseProjectionLineage } from "@/features/lineage/core/sql-lineage";

describe("parseProjectionLineage", () => {
  it("returns null for empty or whitespace SQL", () => {
    expect(parseProjectionLineage("")).toBeNull();
    expect(parseProjectionLineage("   ")).toBeNull();
  });

  it("returns null for unparseable / non-SELECT statements", () => {
    expect(parseProjectionLineage("not sql at all ;;;")).toBeNull();
    expect(parseProjectionLineage("INSERT INTO t VALUES (1)")).toBeNull();
  });

  it("maps a bare column projection to a passthrough with no transform", () => {
    const result = parseProjectionLineage("SELECT amount FROM sales");
    expect(result).toEqual([{ targetCol: "amount", sourceCols: ["amount"], transform: undefined }]);
  });

  it("follows an alias to the output column name", () => {
    const result = parseProjectionLineage("SELECT amount AS rev FROM sales");
    expect(result).toEqual([{ targetCol: "rev", sourceCols: ["amount"], transform: undefined }]);
  });

  it("captures the source column and transform for an aggregate expression", () => {
    const result = parseProjectionLineage("SELECT SUM(amount) AS total FROM sales");
    expect(result).toHaveLength(1);
    const proj = result?.[0];
    expect(proj?.targetCol).toBe("total");
    expect(proj?.sourceCols).toEqual(["amount"]);
    expect(proj?.transform).toBeTruthy();
    expect(proj?.transform?.toUpperCase()).toContain("SUM");
  });

  it("collects multiple distinct source columns from a binary expression", () => {
    const result = parseProjectionLineage("SELECT price * qty AS revenue FROM line_items");
    expect(result?.[0].targetCol).toBe("revenue");
    expect(result?.[0].sourceCols).toEqual(["price", "qty"]);
    expect(result?.[0].transform).toBeTruthy();
  });

  it("does not duplicate a source column referenced twice in one expression", () => {
    const result = parseProjectionLineage("SELECT amount + amount AS doubled FROM sales");
    expect(result?.[0].sourceCols).toEqual(["amount"]);
  });

  it("parses several projections in declaration order", () => {
    const result = parseProjectionLineage("SELECT channel, SUM(amount) AS total FROM sales");
    expect(result).toHaveLength(2);
    expect(result?.[0].targetCol).toBe("channel");
    expect(result?.[1].targetCol).toBe("total");
  });

  it("returns null for a SELECT * projection (no per-column attribution)", () => {
    expect(parseProjectionLineage("SELECT * FROM sales")).toBeNull();
  });

  it("returns null when the statement uses a CTE", () => {
    const sql = "WITH t AS (SELECT 1 AS x) SELECT x FROM t";
    expect(parseProjectionLineage(sql)).toBeNull();
  });

  it("returns null for set operations (UNION)", () => {
    const sql = "SELECT a FROM t1 UNION SELECT a FROM t2";
    expect(parseProjectionLineage(sql)).toBeNull();
  });

  it("skips an unaliased non-column expression (no stable output name)", () => {
    // SUM(amount) has no alias and is not a bare column → no stable target name.
    // channel still yields one projection.
    const result = parseProjectionLineage("SELECT channel, SUM(amount) FROM sales");
    expect(result).toEqual([
      { targetCol: "channel", sourceCols: ["channel"], transform: undefined },
    ]);
  });

  it("returns null when no projection yields a stable output column", () => {
    expect(parseProjectionLineage("SELECT SUM(amount) FROM sales")).toBeNull();
  });

  it("returns null for DuckDB-specific syntax the postgres dialect rejects", () => {
    // QUALIFY is DuckDB/Snowflake syntax not understood by the postgres dialect.
    const sql = "SELECT channel, amount FROM sales QUALIFY ROW_NUMBER() OVER () = 1";
    expect(parseProjectionLineage(sql)).toBeNull();
  });

  it("collects source columns from a CASE expression (exercises array branch in AST walker)", () => {
    // CASE args is an array in node-sql-parser's AST, exercising the array branch
    // of collectSourceCols (line 94).
    const result = parseProjectionLineage(
      "SELECT CASE WHEN score > 90 THEN grade ELSE fallback END AS level FROM students",
    );
    expect(result).toHaveLength(1);
    const proj = result?.[0];
    expect(proj?.targetCol).toBe("level");
    // score, grade, and fallback are all referenced inside the CASE branches.
    expect(proj?.sourceCols).toContain("grade");
    expect(proj?.sourceCols).toContain("fallback");
    expect(proj?.transform).toBeTruthy();
    expect(proj?.transform?.toUpperCase()).toContain("CASE");
  });

  it("collects source columns from a multi-argument function (COALESCE)", () => {
    // COALESCE produces a function node whose name.name and args.value are arrays,
    // exercising the array branch of collectSourceCols (line 94).
    const result = parseProjectionLineage("SELECT COALESCE(primary_col, fallback_col) AS val FROM t");
    expect(result).toHaveLength(1);
    const proj = result?.[0];
    expect(proj?.targetCol).toBe("val");
    expect(proj?.sourceCols).toContain("primary_col");
    expect(proj?.sourceCols).toContain("fallback_col");
    expect(proj?.transform).toBeTruthy();
  });

  it("returns null for a table-qualified wildcard (SELECT t.*)", () => {
    // t.* produces a column_ref whose column field is the string '*',
    // triggering the wildcard guard at line 159.
    expect(parseProjectionLineage("SELECT t.* FROM t")).toBeNull();
  });

  it("handles a qualified column reference (table.column) correctly", () => {
    // table1.column1 produces column: { expr: { type: 'default', value: 'column1' } }
    // exercising the nested-object branch of columnName (line 68).
    const result = parseProjectionLineage("SELECT table1.column1 AS x FROM t");
    expect(result).toHaveLength(1);
    expect(result?.[0].targetCol).toBe("x");
    expect(result?.[0].sourceCols).toContain("column1");
  });

  it("collects a source column through a CAST-to-array-type expression", () => {
    // node-sql-parser nests `array: { dimension: 1, length: [null] }` under the
    // cast target for an array-typed cast — the literal `null` inside that
    // array exercises collectSourceCols' non-object short-circuit (a primitive
    // array item), and the cast itself is a non-bare-column expression whose
    // transform label comes from a successful exprToSQL round-trip.
    const result = parseProjectionLineage("SELECT x::INTEGER[] AS y FROM t");
    expect(result).toHaveLength(1);
    expect(result?.[0].targetCol).toBe("y");
    expect(result?.[0].sourceCols).toEqual(["x"]);
    expect(result?.[0].transform).toBe("x::INTEGER[]");
  });
});

// ─── Defensive branches for AST shapes the postgres dialect itself never
// produces from real SQL ─────────────────────────────────────────────────────
//
// node-sql-parser's AST is "loosely typed; we narrow only the fields we read"
// (module doc comment) — some guards exist for shapes only OTHER dialects (or
// parser versions) emit, e.g. a `star`-typed projection expr (this dialect
// represents `SELECT *` as a `column_ref` with `column: '*'` instead — see the
// "returns null for a SELECT * projection" test above). These tests reach
// those defensive branches by stubbing `Parser.prototype.astify` — the exact
// class `parseProjectionLineage` instantiates — with a fabricated AST, rather
// than by writing SQL text that could never legally produce those shapes.
describe("parseProjectionLineage — defensive branches for unexpected parser output", () => {
  it("returns null when the parsed statement has no columns field at all", () => {
    vi.spyOn(Parser.prototype, "astify").mockReturnValueOnce({ type: "select" } as never);
    expect(parseProjectionLineage("SELECT whatever")).toBeNull();
  });

  it("returns null for a 'star'-typed projection expr (a shape only other dialects emit)", () => {
    vi.spyOn(Parser.prototype, "astify").mockReturnValueOnce({
      type: "select",
      columns: [{ as: null, expr: { type: "star", value: "*" } }],
    } as never);
    expect(parseProjectionLineage("SELECT whatever")).toBeNull();
  });

  it("skips a non-object projection entry but still returns lineage for well-formed siblings", () => {
    vi.spyOn(Parser.prototype, "astify").mockReturnValueOnce({
      type: "select",
      columns: [
        null,
        {
          as: null,
          expr: { type: "column_ref", column: { expr: { type: "default", value: "amount" } } },
        },
      ],
    } as never);
    expect(parseProjectionLineage("SELECT whatever")).toEqual([
      { targetCol: "amount", sourceCols: ["amount"], transform: undefined },
    ]);
  });

  it("drops a column_ref whose column shape can't resolve to a name, without dropping its sibling", () => {
    vi.spyOn(Parser.prototype, "astify").mockReturnValueOnce({
      type: "select",
      columns: [
        // `column` is neither a string nor a { expr: { value } } / { value } shape,
        // so columnName() falls through to its `return null` branch. With no
        // alias, targetCol resolves to null too, so `if (!targetCol) continue`
        // drops the whole projection rather than emitting a nameless entry.
        { as: null, expr: { type: "column_ref", column: { unexpected: "shape" } } },
        {
          as: null,
          expr: { type: "column_ref", column: { expr: { type: "default", value: "amount" } } },
        },
      ],
    } as never);
    expect(parseProjectionLineage("SELECT whatever")).toEqual([
      { targetCol: "amount", sourceCols: ["amount"], transform: undefined },
    ]);
  });

  it("returns an undefined transform for a projection with no expr at all (alias only)", () => {
    vi.spyOn(Parser.prototype, "astify").mockReturnValueOnce({
      type: "select",
      columns: [{ as: "aliasOnly" }],
    } as never);
    expect(parseProjectionLineage("SELECT whatever")).toEqual([
      { targetCol: "aliasOnly", sourceCols: [], transform: undefined },
    ]);
  });

  it("falls back to the coarse node.type label when exprToSQL can't stringify an unrecognized expr shape", () => {
    vi.spyOn(Parser.prototype, "astify").mockReturnValueOnce({
      type: "select",
      columns: [{ as: "w", expr: { type: "weird_type", foo: "bar" } }],
    } as never);
    expect(parseProjectionLineage("SELECT whatever")).toEqual([
      { targetCol: "w", sourceCols: [], transform: "weird_type" },
    ]);
  });
});
