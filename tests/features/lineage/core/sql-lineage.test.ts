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
    expect(result).toEqual([
      { targetCol: "amount", sourceCols: ["amount"], transform: undefined },
    ]);
  });

  it("follows an alias to the output column name", () => {
    const result = parseProjectionLineage("SELECT amount AS rev FROM sales");
    expect(result).toEqual([
      { targetCol: "rev", sourceCols: ["amount"], transform: undefined },
    ]);
  });

  it("captures the source column and transform for an aggregate expression", () => {
    const result = parseProjectionLineage(
      "SELECT SUM(amount) AS total FROM sales",
    );
    expect(result).toHaveLength(1);
    const proj = result?.[0];
    expect(proj?.targetCol).toBe("total");
    expect(proj?.sourceCols).toEqual(["amount"]);
    expect(proj?.transform).toBeTruthy();
    expect(proj?.transform?.toUpperCase()).toContain("SUM");
  });

  it("collects multiple distinct source columns from a binary expression", () => {
    const result = parseProjectionLineage(
      "SELECT price * qty AS revenue FROM line_items",
    );
    expect(result?.[0].targetCol).toBe("revenue");
    expect(result?.[0].sourceCols).toEqual(["price", "qty"]);
    expect(result?.[0].transform).toBeTruthy();
  });

  it("does not duplicate a source column referenced twice in one expression", () => {
    const result = parseProjectionLineage(
      "SELECT amount + amount AS doubled FROM sales",
    );
    expect(result?.[0].sourceCols).toEqual(["amount"]);
  });

  it("parses several projections in declaration order", () => {
    const result = parseProjectionLineage(
      "SELECT channel, SUM(amount) AS total FROM sales",
    );
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
    const sql =
      "SELECT channel, amount FROM sales QUALIFY ROW_NUMBER() OVER () = 1";
    expect(parseProjectionLineage(sql)).toBeNull();
  });
});
