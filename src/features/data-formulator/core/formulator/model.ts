/**
 * Formulator core model — the Data-Formulator-style table-lineage contract.
 *
 * Clones the interaction model of Microsoft Data Formulator (arXiv:2309.10094,
 * arXiv:2408.16119) on this app's offline stack:
 *
 *   - A `TableNode` is DF's `DictTable`: the ORIGINAL dataset plus every
 *     AI-derived table. Originals are never mutated; each derivation creates a
 *     new node pointing at its parent. The data-threads UI is nothing more
 *     than this lineage rendered as cards — there is no separate graph object.
 *   - Two derivation engines, like DF2:
 *       "sql"    — code is a DuckDB SELECT over the parent; data never leaves
 *                  the database (renderer is read-only → lineage compiles to an
 *                  inline WITH chain, see lineage.ts; NO materialized views).
 *       "python" — code is a pandas script run in the self-hosted Pyodide
 *                  sandbox (src/platform/python-sandbox); the result frame is
 *                  materialized back as `rows` (≤ MAX_DERIVED_ROWS).
 *   - The AI derives DATA only. Chart specs stay deterministic: shelf state
 *     compiles to the existing `ChartSpec` (core/types.ts) → `buildSQL`
 *     (core/sql.ts) → `chart-options.ts` → ECharts. This mirrors DF's design
 *     ("chart spec is never AI-generated") and keeps the 1.5–4B local models
 *     inside grammar-constrained JSON + a single fenced code block.
 *
 * This file is the contract shared by lineage.ts / python-engine.ts /
 * derive-agent.ts and the UI. Keep it dependency-light: types, zod schemas,
 * constants, pure helpers only.
 */

import { z } from "zod";
import type { ChartType, ColumnInfo } from "../types";

// ─── Rows & tables ────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;

export type DeriveEngine = "sql" | "python";

export interface DeriveMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * One node in the table lineage (DF's DictTable).
 *
 * `kind: "original"` — a registered DuckDB dataset; `duckdbView` is its stable
 * view name and `rows` stays undefined (data lives in DuckDB).
 *
 * `kind: "derived"` — produced by an AI derivation from `parentId`:
 *   - engine "sql": `code` is a complete SELECT that reads the parent AS `src`
 *     (the lineage compiler wraps it — see SRC_ALIAS). `rows` holds only a
 *     preview (first PREVIEW_ROWS); charts query DuckDB through the CTE chain.
 *   - engine "python": `code` is a pandas script that reads `df` and assigns
 *     `result`; `rows` holds the full materialized output (≤ MAX_DERIVED_ROWS)
 *     and charts aggregate in-memory from it.
 */
export interface TableNode {
  id: string;
  /** Display name, e.g. "ventes_par_mois" (LLM-suggested, sanitized). */
  name: string;
  kind: "original" | "derived";
  /** Lineage edge; null for originals. */
  parentId: string | null;
  /** Original lane only: the registered DuckDB view to read from. */
  duckdbView?: string;
  engine?: DeriveEngine;
  code?: string;
  /** The NL instruction that produced this node (display + refine seed). */
  instruction?: string;
  /** Conversation history for follow-up refinement (DF's derive.dialog). */
  dialog?: DeriveMessage[];
  columns: ColumnInfo[];
  rowCount: number;
  /** See kind docs above. */
  rows?: Row[];
  createdAt: number;
}

/** The alias LLM-generated SQL must read from; lineage.ts binds it to the parent. */
export const SRC_ALIAS = "src";

/** Python-lane variable contract: input frame + required output variable. */
export const PY_INPUT_VAR = "df";
export const PY_OUTPUT_VAR = "result";

// ─── Concepts (shelf field items) ────────────────────────────────────────────

/**
 * A shelf concept (DF's FieldItem). `custom` concepts are names the user typed
 * that don't exist yet — they render as "à dériver" pills until a Formulate
 * run derives them into a table, at which point they become `derived`.
 */
export interface ConceptItem {
  id: string;
  name: string;
  source: "original" | "derived" | "custom";
  /** Table the concept currently resolves against (unset for custom). */
  tableId?: string;
  dtype?: ColumnInfo["type"];
}

// ─── AI schemas (grammar-constrained via generateStructured) ─────────────────

/** Chart keys the goal-refiner may suggest; mirrors core/constants CHART_TYPES. */
export const CHART_TYPE_KEYS = [
  "bar",
  "horizontal-bar",
  "stacked-bar",
  "line",
  "area",
  "multi-line",
  "pie",
  "donut",
  "scatter",
  "heatmap",
  "treemap",
  "radar",
  "funnel",
] as const satisfies readonly ChartType[];

/**
 * Step 1 of a derivation (DF2's "refined goal"): a small, fully-enumerated
 * JSON object the grammar can constrain hard. Code is NOT part of this schema
 * — small local models write far better code in a plain fenced block (step 2)
 * than escaped inside JSON strings.
 */
export const RefinedGoalSchema = z.object({
  engine: z.enum(["sql", "python"]),
  /** Precise restatement of the transformation the code must implement. */
  detailed_instruction: z.string(),
  /** Short display label for the thread card, e.g. "Taux d'échec par canal". */
  display_label: z.string(),
  output_fields: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["number", "string", "date", "boolean"]),
      }),
    )
    .min(1),
  /** Suggested chart for the derived table ("auto" lets the reco pick). */
  chart_type: z.enum([...CHART_TYPE_KEYS, "auto"]),
  reason: z.string(),
});

export type RefinedGoal = z.infer<typeof RefinedGoalSchema>;

/** Auto-chart recommendation over an existing table (no derivation needed). */
export const ChartRecoSchema = z.object({
  chart_type: z.enum(CHART_TYPE_KEYS),
  encodings: z
    .array(
      z.object({
        channel: z.enum(["x", "y", "color", "size", "facet", "tooltip"]),
        field: z.string(),
        aggregate: z.enum(["none", "count", "sum", "avg", "min", "max", "median", "distinct"]),
      }),
    )
    .min(1),
  reason: z.string(),
});

export type ChartReco = z.infer<typeof ChartRecoSchema>;

// ─── Limits (DF-aligned) ─────────────────────────────────────────────────────

/** Max rows materialized back from a python derivation (DF caps at 10k). */
export const MAX_DERIVED_ROWS = 10_000;
/** Max rows fed INTO the sandbox from the parent table. */
export const MAX_PY_INPUT_ROWS = 10_000;
/** Preview rows stored on sql-lane nodes for the table view. */
export const PREVIEW_ROWS = 200;
/** Sample rows embedded in prompts (DF sends 5). */
export const PROMPT_SAMPLE_ROWS = 5;
/** Distinct example values per column in prompts (DF sends ~7). */
export const PROMPT_EXAMPLE_VALUES = 7;
/** One self-repair round-trip on execution error, like DF's default. */
export const MAX_REPAIR_ATTEMPTS = 1;

// ─── Pure lineage helpers ────────────────────────────────────────────────────

/** Walk parentIds from `leafId` up to (and including) its original root. */
export function lineagePath(nodes: TableNode[], leafId: string): TableNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: TableNode[] = [];
  let cur = byId.get(leafId);
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) break; // corrupt cycle — stop rather than hang
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** Direct children of a node — thread branching is simply >1 child. */
export function childrenOf(nodes: TableNode[], parentId: string): TableNode[] {
  return nodes.filter((n) => n.parentId === parentId);
}

/** Sanitize an LLM-suggested table/field label into a safe identifier. */
export function sanitizeName(raw: string, fallback: string): string {
  const cleaned = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return cleaned.length > 0 ? cleaned.slice(0, 64) : fallback;
}
