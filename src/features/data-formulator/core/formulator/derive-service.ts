/**
 * Derive service — binds the three Wave-1 modules into one call the store can
 * use: derive-agent (LLM goal + code), lineage (sql lane), python-engine
 * (pandas lane). Owns TableNode construction:
 *
 *   sql lane    — execution proof is an EXPLAIN probe (validateDerivedSQL);
 *                 the node's data stays in DuckDB, so after success we
 *                 introspect schema, count rows and fetch a preview through
 *                 the compiled WITH chain.
 *   python lane — execution IS materialization: the successful
 *                 runPythonDerivation result is captured in-closure so the
 *                 repair loop's final good run is reused as the node's data
 *                 (never re-executed).
 */

import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import {
  type DeriveDataInput,
  type DeriveFailure,
  type DeriveSuccess,
  deriveData,
} from "./derive-agent";
import {
  buildLineageSQL,
  countDerivedRows,
  fetchDerivedPreview,
  introspectDerived,
  LEAF_PLACEHOLDER,
  sqlChainEligible,
  validateDerivedSQL,
} from "./lineage";
import { MAX_PY_INPUT_ROWS, type Row, sanitizeName, type TableNode } from "./model";
import { type PythonDerivationSuccess, runPythonDerivation } from "./python-engine";

export interface DeriveNodeInput extends Omit<DeriveDataInput, "dialog"> {
  dialog?: DeriveDataInput["dialog"];
  onProgress?: (status: string) => void;
}

export type DeriveNodeOutcome =
  | { node: TableNode; outcome: DeriveSuccess; truncated: boolean }
  | DeriveFailure;

function newNodeId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parent rows for the sandbox: in-memory when python-lane, else via the chain. */
async function parentRowsFor(tables: TableNode[], parentId: string): Promise<Row[]> {
  const parent = tables.find((t) => t.id === parentId);
  if (!parent) throw new Error(`Derive: unknown parent table "${parentId}"`);
  if (parent.rows && (parent.kind === "derived" ? parent.engine === "python" : false)) {
    return parent.rows.slice(0, MAX_PY_INPUT_ROWS);
  }
  const sql = buildLineageSQL(
    tables,
    parentId,
    `SELECT * FROM ${LEAF_PLACEHOLDER} LIMIT ${MAX_PY_INPUT_ROWS}`,
  );
  return runReadOnlyQuery(sql);
}

/**
 * Run one full derivation and, on success, build the resulting TableNode.
 * Mirrors deriveData's no-throw contract: every failure comes back as
 * `{ failed: true, error, code? }` for the UI to render verbatim.
 */
export async function deriveNode(input: DeriveNodeInput): Promise<DeriveNodeOutcome> {
  const { tables, parentId, onProgress } = input;
  const nodeId = newNodeId();
  const sqlEligible = sqlChainEligible(tables, parentId);

  // Lazily fetched: only the python lane pays the row-transfer cost.
  let parentRowsPromise: Promise<Row[]> | null = null;
  let pyResult: PythonDerivationSuccess | null = null;

  let outcome: Awaited<ReturnType<typeof deriveData>>;
  try {
    outcome = await deriveData(
      {
        tables: input.tables,
        parentId: input.parentId,
        instruction: input.instruction,
        shelfFields: input.shelfFields,
        unknownFields: input.unknownFields,
        chartType: input.chartType,
        dialog: input.dialog,
        signal: input.signal,
      },
      {
        sqlEligible,
        runSql: async (code) => {
          onProgress?.("Validation du SQL généré…");
          return validateDerivedSQL(tables, parentId, code);
        },
        runPython: async (code) => {
          onProgress?.("Exécution pandas dans le bac à sable…");
          parentRowsPromise ??= parentRowsFor(tables, parentId);
          const parentRows = await parentRowsPromise;
          const result = await runPythonDerivation({ parentRows, code, nodeId, onProgress });
          if (result.ok) {
            pyResult = result;
            return { ok: true };
          }
          return { ok: false, error: result.error };
        },
      },
    );
  } catch (error) {
    return {
      failed: true,
      goal: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if ("failed" in outcome) return outcome;
  if (input.signal?.aborted) {
    return {
      failed: true,
      goal: outcome.goal,
      code: outcome.code,
      error: "Dérivation annulée",
      cancelled: true,
    };
  }

  const name = sanitizeName(outcome.goal.display_label, nodeId);
  const base: TableNode = {
    id: nodeId,
    name,
    kind: "derived",
    parentId,
    engine: outcome.engine,
    code: outcome.code,
    instruction: input.instruction,
    dialog: outcome.dialog,
    columns: [],
    rowCount: 0,
    createdAt: Date.now(),
  };

  try {
    if (outcome.engine === "python") {
      if (!pyResult) {
        // deriveData reported sql success but routed python — contract breach.
        return {
          failed: true,
          goal: outcome.goal,
          error: "Python run missing",
          code: outcome.code,
        };
      }
      const py: PythonDerivationSuccess = pyResult;
      return {
        node: { ...base, columns: py.columns, rowCount: py.rowCount, rows: py.rows },
        outcome,
        truncated: py.truncated,
      };
    }

    onProgress?.("Lecture du schéma dérivé…");
    const withNode = [...tables, base];
    const [columns, rowCount, rows] = await Promise.all([
      introspectDerived(withNode, nodeId),
      countDerivedRows(withNode, nodeId),
      fetchDerivedPreview(withNode, nodeId),
    ]);
    return { node: { ...base, columns, rowCount, rows }, outcome, truncated: false };
  } catch (error) {
    return {
      failed: true,
      goal: outcome.goal,
      code: outcome.code,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
