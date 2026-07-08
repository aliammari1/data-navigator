/**
 * Formulator SQL lineage engine.
 *
 * The renderer's DuckDB is strictly read-only (electron/duckdb-service.ts
 * allowlists SELECT/WITH/DESCRIBE/EXPLAIN/SUMMARIZE), so derived tables never
 * materialize. A derived table's data IS the inline WITH chain compiled here:
 * each sql-lane node wraps its LLM-generated code as
 *
 *   "node_<id>" AS (WITH src AS (SELECT * FROM <parentRef>) <code>)
 *
 * DuckDB accepts a nested WITH inside a CTE body, which keeps the LLM contract
 * trivial — generated code always reads from `src` (SRC_ALIAS) and is never
 * rewritten. Validation (EXPLAIN), schema (DESCRIBE), previews and counts all
 * run through `runReadOnlyQuery` over the compiled chain.
 */

import { quoteIdent, runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import type { ColType, ColumnInfo } from "../types";
import { lineagePath, PREVIEW_ROWS, type Row, SRC_ALIAS, type TableNode } from "./model";

/** Placeholder in a `select` template that resolves to the leaf's CTE/view ref. */
export const LEAF_PLACEHOLDER = "<leaf>";

const PROBE_NODE_ID = "__sql_probe__";

export type SqlValidationResult = { ok: true } | { ok: false; error: string };

// ─── Chain eligibility ────────────────────────────────────────────────────────

/**
 * True only when EVERY node on the leaf's lineage path is an original or a
 * sql-engine derivation. A python-lane ancestor's data lives only in JS
 * memory, so SQL derivation from it is impossible — the derive router uses
 * this to force the python engine instead.
 */
export function sqlChainEligible(nodes: TableNode[], leafId: string): boolean {
  const path = lineagePath(nodes, leafId);
  if (path.length === 0) return false;
  return path.every((node) => node.kind === "original" || node.engine === "sql");
}

// ─── WITH-chain compilation ───────────────────────────────────────────────────

function cteNameFor(nodeId: string): string {
  // Quoting (not sanitizing) keeps dashed ids collision-free.
  return quoteIdent(`node_${nodeId}`);
}

/**
 * Compile the leaf's full lineage into a single read-only statement. The
 * `select` template runs against the leaf: every `<leaf>` occurrence is
 * replaced by the leaf's CTE name (or the quoted DuckDB view when the leaf is
 * the original itself).
 */
export function buildLineageSQL(
  nodes: TableNode[],
  leafId: string,
  select: string = `SELECT * FROM ${LEAF_PLACEHOLDER}`,
): string {
  const path = lineagePath(nodes, leafId);
  if (path.length === 0) {
    throw new Error(`Lineage: unknown table node "${leafId}"`);
  }
  if (!sqlChainEligible(nodes, leafId)) {
    throw new Error(
      `Lineage: chain for "${leafId}" has a python-lane ancestor — its data lives in JS memory, not DuckDB; derive with the python engine instead`,
    );
  }
  const root = path[0];
  if (root.kind !== "original" || !root.duckdbView) {
    throw new Error(
      `Lineage: chain for "${leafId}" does not reach an original table with a duckdbView (corrupt parentId?)`,
    );
  }

  let parentRef = quoteIdent(root.duckdbView);
  const ctes: string[] = [];
  for (const node of path.slice(1)) {
    // Trailing semicolons would close the CTE body early; stripping them is
    // whitespace-level normalization, never identifier rewriting.
    const code = node.code?.trim().replace(/;+\s*$/, "");
    if (!code) {
      throw new Error(`Lineage: node "${node.id}" has no SQL code`);
    }
    const cteName = cteNameFor(node.id);
    ctes.push(`${cteName} AS (WITH ${SRC_ALIAS} AS (SELECT * FROM ${parentRef}) ${code})`);
    parentRef = cteName;
  }

  // Replace the QUOTED form first: templates produced by buildSQL (core/sql.ts)
  // interpolate the table as `FROM "<leaf>"`, and parentRef is already a quoted
  // identifier — naive bare replacement would yield `""node_x""`.
  const finalSelect = select
    .replaceAll(`"${LEAF_PLACEHOLDER}"`, parentRef)
    .replaceAll(LEAF_PLACEHOLDER, parentRef);
  return ctes.length === 0 ? finalSelect : `WITH ${ctes.join(", ")} ${finalSelect}`;
}

// ─── Validation (EXPLAIN probe) ───────────────────────────────────────────────

/**
 * Probe candidate LLM code by compiling a one-node chain over `parentId` and
 * running EXPLAIN. The returned DuckDB error message is what the repair loop
 * feeds back to the model.
 */
export async function validateDerivedSQL(
  nodes: TableNode[],
  parentId: string,
  code: string,
): Promise<SqlValidationResult> {
  try {
    const probe: TableNode = {
      id: PROBE_NODE_ID,
      name: "probe",
      kind: "derived",
      parentId,
      engine: "sql",
      code,
      columns: [],
      rowCount: 0,
      createdAt: 0,
    };
    const sql = buildLineageSQL([...nodes, probe], PROBE_NODE_ID);
    await runReadOnlyQuery(`EXPLAIN ${sql}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── Schema introspection (DESCRIBE) ──────────────────────────────────────────

function colTypeFromDb(dbType: string): ColType {
  const t = dbType.toUpperCase();
  if (t.startsWith("BOOL")) return "boolean";
  if (t.startsWith("DATE") || t.startsWith("TIME")) return "date";
  if (t.startsWith("INTERVAL")) return "string";
  if (/^(U?(TINY|SMALL|BIG|HUGE)?INT|INTEGER|DOUBLE|FLOAT|REAL|DECIMAL)/.test(t)) return "number";
  return "string";
}

/** DESCRIBE the compiled chain and map DuckDB column types to ColumnInfo. */
export async function introspectDerived(nodes: TableNode[], leafId: string): Promise<ColumnInfo[]> {
  const sql = buildLineageSQL(nodes, leafId);
  const rows = await runReadOnlyQuery(`DESCRIBE (${sql})`);
  return rows.map((row) => {
    const dbType = String(row.column_type ?? "");
    return { name: String(row.column_name ?? ""), type: colTypeFromDb(dbType), dbType };
  });
}

// ─── Preview & count ──────────────────────────────────────────────────────────

/** First `limit` rows of the derived leaf (table-view preview). */
export async function fetchDerivedPreview(
  nodes: TableNode[],
  leafId: string,
  limit: number = PREVIEW_ROWS,
): Promise<Row[]> {
  const rowLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : PREVIEW_ROWS;
  const sql = buildLineageSQL(nodes, leafId, `SELECT * FROM ${LEAF_PLACEHOLDER} LIMIT ${rowLimit}`);
  return runReadOnlyQuery(sql);
}

/** Exact row count of the derived leaf. */
export async function countDerivedRows(nodes: TableNode[], leafId: string): Promise<number> {
  const sql = buildLineageSQL(nodes, leafId, `SELECT COUNT(*) AS n FROM ${LEAF_PLACEHOLDER}`);
  const rows = await runReadOnlyQuery(sql);
  return Number(rows[0]?.n ?? 0);
}
