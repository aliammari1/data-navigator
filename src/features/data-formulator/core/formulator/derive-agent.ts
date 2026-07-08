"use client";

/**
 * Formulator derive agent — DF2's two-step derivation on the offline provider.
 *
 * Step 1 (`refineGoal`): one grammar-constrained `generateStructured` call
 * turns the NL instruction + data summary into a `RefinedGoal` (engine choice,
 * precise restated instruction, output fields). Enum-heavy JSON keeps 1.5–4B
 * local models honest.
 *
 * Step 2 (`generateCode`): plain-text generation of ONE fenced code block —
 * small models write far better code outside JSON strings. SQL reads the
 * parent AS `src` (DuckDB dialect); python is a pandas `df -> result` script.
 *
 * `deriveData` orchestrates refine → codegen → execute with up to
 * MAX_REPAIR_ATTEMPTS error-feedback repair round-trips, DF-style. Execution
 * is dependency-injected (`DeriveEngines`) so this module never imports
 * lineage.ts / python-engine.ts — the screen wires the three lanes together.
 */

import type { AIProvider } from "@/platform/ai/provider";
import { detectAvailability, getProvider, useAIRuntimeStore } from "@/platform/ai/provider";
import { bigIntJsonReplacer, safeJsonStringify } from "../json";
import {
  type DeriveEngine,
  type DeriveMessage,
  MAX_REPAIR_ATTEMPTS,
  PROMPT_EXAMPLE_VALUES,
  PROMPT_SAMPLE_ROWS,
  PY_INPUT_VAR,
  PY_OUTPUT_VAR,
  type RefinedGoal,
  RefinedGoalSchema,
  type Row,
  SRC_ALIAS,
  type TableNode,
} from "./model";

// ─── Provider resolution (the swarm's readiness gate, hook-free) ─────────────

export async function resolveRuntime(): Promise<{ provider: AIProvider; model: string }> {
  const availability = await detectAvailability();
  const ready = availability.find((a) => a.available);
  if (!ready) {
    throw new Error("No offline AI model is ready — download a GGUF model first.");
  }
  const provider = getProvider(ready.id);
  const model = useAIRuntimeStore.getState().model ?? (await provider.listModels())[0]?.id;
  if (!model) {
    throw new Error(`No model available for provider "${provider.id}".`);
  }
  return { provider, model };
}

// ─── Step 0: deterministic data summary (DF's generate_data_summary) ─────────

/** Keeps a single example value from blowing up the prompt budget. */
const MAX_EXAMPLE_CHARS = 60;

function formatExample(value: unknown): string {
  const formatted = (() => {
    if (value == null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "bigint") return String(bigIntJsonReplacer("", value));
    if (value instanceof Date) return value.toISOString();
    return safeJsonStringify(value);
  })();
  return formatted.length > MAX_EXAMPLE_CHARS
    ? `${formatted.slice(0, MAX_EXAMPLE_CHARS)}…`
    : formatted;
}

function distinctExamples(rows: Row[], column: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(formatExample(row[column]));
    if (seen.size >= PROMPT_EXAMPLE_VALUES) break;
  }
  return [...seen];
}

function tableSummary(node: TableNode): string {
  const rows = node.rows ?? [];
  const lines = [`table: ${node.name} (${node.rowCount} rows)`, "fields:"];
  for (const col of node.columns) {
    const examples = distinctExamples(rows, col.name);
    lines.push(
      examples.length
        ? `- ${col.name} (${col.type}): ${examples.join(", ")}`
        : `- ${col.name} (${col.type})`,
    );
  }
  const sample = rows.slice(0, PROMPT_SAMPLE_ROWS);
  if (sample.length) {
    lines.push("sample rows:");
    for (const row of sample) {
      lines.push(safeJsonStringify(row));
    }
  }
  return lines.join("\n");
}

/**
 * DF's `generate_data_summary` format, deterministically, with no LLM: per
 * focused table its name, one `- column (type): examples…` line each (up to
 * PROMPT_EXAMPLE_VALUES distinct values from the rows/preview), then up to
 * PROMPT_SAMPLE_ROWS sample rows as compact JSON lines.
 */
export function buildDataSummary(tables: TableNode[], focusIds: string[]): string {
  const byId = new Map(tables.map((t) => [t.id, t]));
  return focusIds
    .map((id) => byId.get(id))
    .filter((node): node is TableNode => node !== undefined)
    .map(tableSummary)
    .join("\n\n");
}

// ─── Step 1: refined goal (grammar-constrained) ──────────────────────────────

export interface RefineGoalInput {
  summary: string;
  instruction: string;
  shelfFields: string[];
  unknownFields: string[];
  chartType: string;
  sqlEligible: boolean;
  signal?: AbortSignal;
}

const REFINE_SYSTEM = [
  "You are the goal refiner of an offline data-derivation agent (Data Formulator style).",
  "The user writes in English, French or Arabic; restate the exact transformation the",
  "code must implement in detailed_instruction, complete and self-contained.",
  'Engine rules: pick "sql" (one DuckDB SELECT over the parent table) unless the transform needs',
  "procedural or reshape logic SQL cannot express — regex extraction across rows, pivots with",
  'dynamic columns, or window-heavy logic you are not sure of — then pick "python" (pandas).',
  "output_fields lists EVERY column of the derived table and MUST cover every requested",
  "unknown field. Keep display_label short (it titles a thread card) and reason to one sentence.",
].join(" ");

const PYTHON_ONLY_RULE =
  "The SQL lane is unavailable for this table (its data was materialized by a python " +
  'derivation and lives outside DuckDB) — engine MUST be "python".';

/** DF2 step 1: refine the NL instruction into a structured, enum-heavy goal. */
export async function refineGoal(input: RefineGoalInput): Promise<RefinedGoal> {
  const system = input.sqlEligible ? REFINE_SYSTEM : `${REFINE_SYSTEM} ${PYTHON_ONLY_RULE}`;
  const prompt = [
    input.summary,
    `Instruction: ${input.instruction}`,
    input.shelfFields.length
      ? `Fields already on the chart shelves: ${input.shelfFields.join(", ")}`
      : "",
    input.unknownFields.length
      ? `Fields to derive (they do not exist yet — each MUST appear in output_fields): ${input.unknownFields.join(", ")}`
      : "",
    `Current chart type: ${input.chartType}`,
    "Return the refined goal.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { provider, model } = await resolveRuntime();
  const goal = await provider.generateStructured(
    {
      model,
      system,
      prompt,
      systemPrefix: input.summary || undefined,
      maxTokens: 768,
      temperature: 0,
      signal: input.signal,
    },
    RefinedGoalSchema,
  );

  // The grammar cannot express "engine must be python when sqlEligible is
  // false", so clamp deterministically — running SQL against a python-lane
  // parent has no engine to run on.
  if (!input.sqlEligible && goal.engine !== "python") {
    return { ...goal, engine: "python" };
  }
  return goal;
}

// ─── Step 2: code generation (plain text, ONE fenced block) ──────────────────

export interface GenerateCodeContext {
  summary: string;
  instruction: string;
  priorCode?: string;
  priorError?: string;
  dialog?: DeriveMessage[];
  signal?: AbortSignal;
}

const SQL_CODE_SYSTEM = [
  "You write DuckDB SQL for an offline data-derivation agent.",
  "Reply with EXACTLY ONE fenced ```sql block containing a single SELECT statement",
  "(a leading WITH is allowed) and nothing else.",
  `The parent table is exposed AS ${SRC_ALIAS} — always read FROM ${SRC_ALIAS}.`,
  "DuckDB dialect. No CREATE / INSERT / UPDATE / DELETE / DROP / PRAGMA / ATTACH / COPY,",
  "no semicolons, one statement only.",
].join(" ");

const PY_CODE_SYSTEM = [
  "You write pandas code for an offline data-derivation agent.",
  "Reply with EXACTLY ONE fenced ```python block and nothing else.",
  `The input DataFrame is \`${PY_INPUT_VAR}\`; assign the final DataFrame to \`${PY_OUTPUT_VAR}\`.`,
  "Use only pandas and numpy (import pandas as pd / import numpy as np);",
  "no other imports, no file or network access.",
].join(" ");

function fenceCode(engine: DeriveEngine, code: string): string {
  return `\`\`\`${engine}\n${code}\n\`\`\``;
}

function renderDialog(dialog: DeriveMessage[] | undefined): string {
  if (!dialog?.length) return "";
  return ["Previous exchange (continue from it, update the code rather than starting over):"]
    .concat(dialog.map((m) => `${m.role}: ${m.content}`))
    .join("\n");
}

/**
 * Tolerant fenced-block extraction: accepts a missing/unknown language tag,
 * takes the LAST closed block (models often echo the previous code first),
 * strips surrounding prose, and falls back to an unterminated trailing fence
 * or the whole reply when the model skipped fencing entirely.
 */
export function extractCodeBlock(text: string): string {
  const closed = [
    ...text.matchAll(/```(?:sql|python|py|duckdb|pandas)?[ \t]*\r?\n?([\s\S]*?)```/gi),
  ];
  const last = closed.at(-1)?.[1]?.trim();
  if (last) return last;
  const open = text
    .match(/```(?:sql|python|py|duckdb|pandas)?[ \t]*\r?\n?([\s\S]*)$/i)?.[1]
    ?.trim();
  if (open) return open;
  return text.trim();
}

/** DF2 step 2: generate (or repair) the code for a refined goal. */
export async function generateCode(goal: RefinedGoal, ctx: GenerateCodeContext): Promise<string> {
  const engine: DeriveEngine = goal.engine;
  const outputFields = goal.output_fields.map((f) => `${f.name} (${f.type})`).join(", ");
  const prompt = [
    ctx.summary,
    renderDialog(ctx.dialog),
    `Goal: ${goal.detailed_instruction}`,
    `Output fields: ${outputFields}`,
    `User instruction: ${ctx.instruction}`,
    ctx.priorError
      ? [
          "Your previous code failed to run.",
          "Previous code:",
          fenceCode(engine, ctx.priorCode ?? ""),
          `Error: ${ctx.priorError}`,
          "Return the corrected code only — one fenced block, nothing else.",
        ].join("\n")
      : "Return the code — one fenced block, nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { provider, model } = await resolveRuntime();
  const result = await provider.generate({
    model,
    system: engine === "sql" ? SQL_CODE_SYSTEM : PY_CODE_SYSTEM,
    prompt,
    systemPrefix: ctx.summary || undefined,
    maxTokens: 1024,
    temperature: 0,
    signal: ctx.signal,
  });
  return extractCodeBlock(result.text);
}

// ─── Orchestration: refine → codegen → execute → repair ─────────────────────

export interface DeriveDataInput {
  tables: TableNode[];
  parentId: string;
  instruction: string;
  shelfFields: string[];
  unknownFields: string[];
  chartType: string;
  dialog?: DeriveMessage[];
  /**
   * Cooperative cancel: checked between pipeline steps and forwarded to the
   * LLM calls. A running Pyodide exec cannot be preempted — cancellation
   * lands at the next step boundary.
   */
  signal?: AbortSignal;
}

/** Injected execution lanes — lineage.ts (sql) and python-engine.ts (python). */
export interface DeriveEngines {
  runSql: (code: string) => Promise<{ ok: boolean; error?: string }>;
  runPython: (code: string) => Promise<{ ok: boolean; error?: string }>;
  /** False when the parent's data lives outside DuckDB (python-lane parent). */
  sqlEligible: boolean;
}

export interface DeriveSuccess {
  goal: RefinedGoal;
  engine: DeriveEngine;
  code: string;
  /** Execution attempts consumed (1 = first try, 2 = repaired once, …). */
  attempts: number;
  /** Full conversation including this exchange — store on the new TableNode. */
  dialog: DeriveMessage[];
}

export interface DeriveFailure {
  failed: true;
  /** Null when the refine step itself failed. */
  goal: RefinedGoal | null;
  error: string;
  code?: string;
  /** True when the user aborted — the UI resets quietly instead of showing an error. */
  cancelled?: boolean;
}

export type DeriveOutcome = DeriveSuccess | DeriveFailure;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run one full derivation: refine the goal, generate the code, execute it on
 * the injected engine, and feed execution errors back for up to
 * MAX_REPAIR_ATTEMPTS repair round-trips. Never throws — failures come back
 * as `{ failed: true, … }` so the UI can surface code + error verbatim.
 */
export async function deriveData(
  input: DeriveDataInput,
  engines: DeriveEngines,
): Promise<DeriveOutcome> {
  const summary = buildDataSummary(input.tables, [input.parentId]);
  const cancelled = (goal: RefinedGoal | null, code?: string): DeriveFailure => ({
    failed: true,
    goal,
    error: "Dérivation annulée",
    code,
    cancelled: true,
  });
  let goal: RefinedGoal | null = null;
  try {
    if (input.signal?.aborted) return cancelled(null);
    const refined = await refineGoal({
      summary,
      instruction: input.instruction,
      shelfFields: input.shelfFields,
      unknownFields: input.unknownFields,
      chartType: input.chartType,
      sqlEligible: engines.sqlEligible,
      signal: input.signal,
    });
    goal = refined;

    const execute = (code: string) =>
      refined.engine === "sql" ? engines.runSql(code) : engines.runPython(code);
    const baseCtx = {
      summary,
      instruction: input.instruction,
      dialog: input.dialog,
      signal: input.signal,
    };

    if (input.signal?.aborted) return cancelled(refined);
    let code = await generateCode(refined, baseCtx);
    let lastError = "";
    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS + 1; attempt += 1) {
      if (input.signal?.aborted) return cancelled(refined, code);
      const run = await execute(code).catch((error: unknown) => ({
        ok: false as const,
        error: errorMessage(error),
      }));
      if (run.ok) {
        return {
          goal: refined,
          engine: refined.engine,
          code,
          attempts: attempt,
          dialog: [
            ...(input.dialog ?? []),
            { role: "user", content: input.instruction },
            { role: "assistant", content: fenceCode(refined.engine, code) },
          ],
        };
      }
      lastError = run.error ?? "unknown execution error";
      if (attempt <= MAX_REPAIR_ATTEMPTS) {
        if (input.signal?.aborted) return cancelled(refined, code);
        code = await generateCode(refined, {
          ...baseCtx,
          priorCode: code,
          priorError: lastError,
        });
      }
    }
    return { failed: true, goal: refined, error: lastError, code };
  } catch (error) {
    if (input.signal?.aborted) return cancelled(goal);
    return { failed: true, goal, error: errorMessage(error) };
  }
}
