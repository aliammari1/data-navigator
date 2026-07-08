"use client";

/**
 * Formulator store — the single state surface for the Data-Formulator-clone
 * screen. Owns the table lineage (TableNode[]), the concept shelf, the
 * encoding-shelf spec and the derive lifecycle. UI components bind here and
 * ONLY here; chart data resolution lives in a separate hook that reads this
 * state (keeps DuckDB/ECharts out of the store).
 *
 * DF semantics encoded in the actions:
 *   - formulate()   — derive from the FOCUSED table (chaining: formulating on
 *     a derived node reads that node's output).
 *   - refineNode()  — DF2 follow-up: sibling derivation from the SAME parent,
 *     continuing the node's stored dialog so the model updates its code.
 *   - Originals are never mutated; deletion removes a node + its descendants.
 *
 * Persistence: lineage metadata + code persist durably (drizzle storage, same
 * lane as the enterprise store); `rows` NEVER persist — sql nodes recompute
 * from DuckDB on demand and python nodes rehydrate row-less with
 * `needsRerun(node) === true` so the UI offers "Réexécuter".
 */

import { temporal } from "zundo";
import { create, useStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";
import { deriveNode } from "../core/formulator/derive-service";
import type { ConceptItem, DeriveMessage, TableNode } from "../core/formulator/model";
import { disposeDerivationSession } from "../core/formulator/python-engine";
import { bigIntJsonReplacer } from "../core/json";
import type {
  AggregateFn,
  ChartType,
  ColumnInfo,
  Encoding,
  FilterDef,
  FilterOp,
} from "../core/types";

export type ShelfChannel = Encoding["channel"];

export interface ShelfState {
  chartType: ChartType | "auto";
  encodings: Encoding[];
  /** Active filters — rendered as pills, compiled into the chart SQL/aggregation. */
  filters: FilterDef[];
  instruction: string;
}

export interface DeriveErrorState {
  message: string;
  /** Last generated code, shown verbatim for verification/debugging. */
  code?: string;
}

interface FormulatorV2State {
  tables: TableNode[];
  concepts: ConceptItem[];
  focusedTableId: string | null;
  shelf: ShelfState;
  status: "idle" | "deriving";
  statusText: string;
  lastError: DeriveErrorState | null;
  /** Nodes whose python result was clamped to MAX_DERIVED_ROWS. */
  truncatedNodeIds: string[];

  initFromDataset(input: {
    id: string;
    name: string;
    viewName: string;
    columns: ColumnInfo[];
    rowCount: number;
  }): void;
  setChartType(type: ShelfState["chartType"]): void;
  setInstruction(text: string): void;
  bindField(channel: ShelfChannel, field: string): void;
  updateEncoding(channel: ShelfChannel, patch: Partial<Omit<Encoding, "id" | "channel">>): void;
  unbindChannel(channel: ShelfChannel): void;
  addFilter(filter: Omit<FilterDef, "id">): void;
  updateFilter(id: string, patch: Partial<Omit<FilterDef, "id">>): void;
  removeFilter(id: string): void;
  clearFilters(): void;
  /** Cross-filter toggle: click a chart value → add/remove an `=` filter on it. */
  toggleValueFilter(field: string, value: string): void;
  addCustomConcept(name: string): void;
  focusTable(id: string): void;
  /** True when a formulate needs the AI (unknown fields or an instruction). */
  needsDerivation(): boolean;
  formulate(): Promise<void>;
  refineNode(nodeId: string, instruction: string): Promise<void>;
  /** Abort the in-flight derivation (cooperative — lands at the next step boundary). */
  cancelDerivation(): void;
  deleteNode(nodeId: string): void;
  clearError(): void;
  resetAll(): void;
}

const EMPTY_SHELF: ShelfState = { chartType: "auto", encodings: [], filters: [], instruction: "" };

let filterSeq = 0;
function newFilterId(): string {
  filterSeq += 1;
  return `flt-${filterSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Default aggregate: measures sum, dimensions none — matches DF's shelf feel. */
function defaultAggregate(
  dtype: ColumnInfo["type"] | undefined,
  channel: ShelfChannel,
): AggregateFn {
  if (channel !== "y") return "none";
  return dtype === "number" ? "sum" : "count";
}

function conceptsFromTables(tables: TableNode[], customs: ConceptItem[]): ConceptItem[] {
  const fromTables = tables.flatMap((t) =>
    t.columns.map(
      (c): ConceptItem => ({
        id: `${t.id}:${c.name}`,
        name: c.name,
        source: t.kind === "original" ? "original" : "derived",
        tableId: t.id,
        dtype: c.type,
      }),
    ),
  );
  const known = new Set(fromTables.map((c) => c.name));
  return [...fromTables, ...customs.filter((c) => !known.has(c.name))];
}

function descendantsOf(tables: TableNode[], rootId: string): Set<string> {
  const doomed = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tables) {
      if (t.parentId && doomed.has(t.parentId) && !doomed.has(t.id)) {
        doomed.add(t.id);
        grew = true;
      }
    }
  }
  return doomed;
}

/** Python node rehydrated without rows (rows never persist) → offer rerun. */
export function needsRerun(node: TableNode): boolean {
  return node.kind === "derived" && node.engine === "python" && !node.rows;
}

/**
 * Live AbortController for the in-flight derivation. Module scope, NOT store
 * state: controllers aren't serializable and must never hit the persist lane.
 */
let activeDeriveController: AbortController | null = null;

export const useFormulatorV2Store = create<FormulatorV2State>()(
  persist(
    temporal(
      (set, get) => {
        const customConcepts = () => get().concepts.filter((c) => c.source === "custom");

        async function runDerivation(input: {
          parentId: string;
          instruction: string;
          dialog?: DeriveMessage[];
        }): Promise<void> {
          const { tables, shelf } = get();
          const parent = tables.find((t) => t.id === input.parentId);
          if (!parent) return;

          const parentCols = new Set(parent.columns.map((c) => c.name));
          const shelfFields = shelf.encodings.map((e) => e.field).filter(Boolean);
          const unknownFields = shelfFields.filter((f) => !parentCols.has(f));

          activeDeriveController?.abort();
          const controller = new AbortController();
          activeDeriveController = controller;

          set({ status: "deriving", statusText: "Analyse de l'objectif…", lastError: null });
          const result = await deriveNode({
            tables,
            parentId: input.parentId,
            instruction: input.instruction,
            shelfFields,
            unknownFields,
            chartType: shelf.chartType,
            dialog: input.dialog,
            signal: controller.signal,
            onProgress: (statusText) => set({ statusText }),
          });
          if (activeDeriveController === controller) activeDeriveController = null;

          if ("failed" in result) {
            set({
              status: "idle",
              statusText: "",
              // A user cancel is not an error — reset quietly.
              lastError: result.cancelled ? null : { message: result.error, code: result.code },
            });
            return;
          }

          const goal = result.outcome.goal;
          set((state) => {
            const shelfNext = { ...state.shelf, instruction: "" };
            // DF behavior: adopt the goal's chart suggestion when the user left
            // the type on "auto" (no extra LLM call — it rode along in the goal).
            if (shelfNext.chartType === "auto" && goal.chart_type !== "auto") {
              shelfNext.chartType = goal.chart_type;
            }
            // Pure-NL flow (empty shelves): bind the derived table's first
            // dimension → x and first measure → y so the chart appears at once.
            // aggregate "none" on purpose — derived tables are already
            // aggregated by their code; double-aggregating charts lies.
            if (shelfNext.encodings.length === 0) {
              const cols = result.node.columns;
              const xCol = cols.find((c) => c.type !== "number") ?? cols[0];
              const yCol = cols.find((c) => c.type === "number" && c.name !== xCol?.name);
              const encodings: Encoding[] = [];
              if (xCol) {
                encodings.push({
                  id: `x-${xCol.name}`,
                  channel: "x",
                  field: xCol.name,
                  aggregate: "none",
                  sort: "none",
                });
              }
              if (yCol) {
                encodings.push({
                  id: `y-${yCol.name}`,
                  channel: "y",
                  field: yCol.name,
                  aggregate: "none",
                  sort: "none",
                });
              }
              shelfNext.encodings = encodings;
            }
            return {
              status: "idle" as const,
              statusText: "",
              tables: [...state.tables, result.node],
              focusedTableId: result.node.id,
              concepts: conceptsFromTables([...state.tables, result.node], customConcepts()),
              truncatedNodeIds: result.truncated
                ? [...state.truncatedNodeIds, result.node.id]
                : state.truncatedNodeIds,
              shelf: shelfNext,
            };
          });
        }

        return {
          tables: [],
          concepts: [],
          focusedTableId: null,
          shelf: EMPTY_SHELF,
          status: "idle",
          statusText: "",
          lastError: null,
          truncatedNodeIds: [],

          initFromDataset(input) {
            const existingRoot = get().tables.find(
              (t) => t.kind === "original" && t.duckdbView === input.viewName,
            );
            if (existingRoot) {
              // Same dataset — keep the lineage, just refresh root metadata.
              set((state) => ({
                tables: state.tables.map((t) =>
                  t.id === existingRoot.id
                    ? { ...t, columns: input.columns, rowCount: input.rowCount, name: input.name }
                    : t,
                ),
                concepts: conceptsFromTables(state.tables, customConcepts()),
                focusedTableId: state.focusedTableId ?? existingRoot.id,
              }));
              return;
            }
            const root: TableNode = {
              id: `t0-${input.id}`,
              name: input.name,
              kind: "original",
              parentId: null,
              duckdbView: input.viewName,
              columns: input.columns,
              rowCount: input.rowCount,
              createdAt: Date.now(),
            };
            set({
              tables: [root],
              concepts: conceptsFromTables([root], []),
              focusedTableId: root.id,
              shelf: EMPTY_SHELF,
              lastError: null,
              truncatedNodeIds: [],
            });
          },

          setChartType(chartType) {
            set((state) => ({ shelf: { ...state.shelf, chartType } }));
          },

          setInstruction(instruction) {
            set((state) => ({ shelf: { ...state.shelf, instruction } }));
          },

          bindField(channel, field) {
            const dtype = get().concepts.find((c) => c.name === field)?.dtype;
            set((state) => {
              const others = state.shelf.encodings.filter((e) => e.channel !== channel);
              const encoding: Encoding = {
                id: `${channel}-${field}`,
                channel,
                field,
                aggregate: defaultAggregate(dtype, channel),
                sort: "none",
              };
              return { shelf: { ...state.shelf, encodings: [...others, encoding] } };
            });
          },

          updateEncoding(channel, patch) {
            set((state) => ({
              shelf: {
                ...state.shelf,
                encodings: state.shelf.encodings.map((e) =>
                  e.channel === channel ? { ...e, ...patch } : e,
                ),
              },
            }));
          },

          unbindChannel(channel) {
            set((state) => ({
              shelf: {
                ...state.shelf,
                encodings: state.shelf.encodings.filter((e) => e.channel !== channel),
              },
            }));
          },

          addFilter(filter) {
            set((state) => ({
              shelf: {
                ...state.shelf,
                filters: [...state.shelf.filters, { ...filter, id: newFilterId() }],
              },
            }));
          },

          updateFilter(id, patch) {
            set((state) => ({
              shelf: {
                ...state.shelf,
                filters: state.shelf.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
              },
            }));
          },

          removeFilter(id) {
            set((state) => ({
              shelf: { ...state.shelf, filters: state.shelf.filters.filter((f) => f.id !== id) },
            }));
          },

          clearFilters() {
            set((state) => ({ shelf: { ...state.shelf, filters: [] } }));
          },

          toggleValueFilter(field, value) {
            set((state) => {
              const existing = state.shelf.filters.find(
                (f) => f.field === field && f.op === "=" && f.value === value,
              );
              const filters = existing
                ? state.shelf.filters.filter((f) => f.id !== existing.id)
                : [
                    ...state.shelf.filters,
                    { id: newFilterId(), field, op: "=" as FilterOp, value },
                  ];
              return { shelf: { ...state.shelf, filters } };
            });
          },

          addCustomConcept(name) {
            const trimmed = name.trim();
            if (!trimmed || get().concepts.some((c) => c.name === trimmed)) return;
            set((state) => ({
              concepts: [
                ...state.concepts,
                { id: `custom:${trimmed}`, name: trimmed, source: "custom" },
              ],
            }));
          },

          focusTable(id) {
            if (get().tables.some((t) => t.id === id)) set({ focusedTableId: id });
          },

          needsDerivation() {
            const { tables, focusedTableId, shelf } = get();
            const parent = tables.find((t) => t.id === focusedTableId) ?? tables[0];
            if (!parent) return false;
            if (shelf.instruction.trim()) return true;
            const cols = new Set(parent.columns.map((c) => c.name));
            return shelf.encodings.some((e) => e.field && !cols.has(e.field));
          },

          async formulate() {
            const { tables, focusedTableId, shelf, status } = get();
            if (status === "deriving") return;
            const parent = tables.find((t) => t.id === focusedTableId) ?? tables[0];
            if (!parent || !get().needsDerivation()) return;
            await runDerivation({ parentId: parent.id, instruction: shelf.instruction.trim() });
          },

          async refineNode(nodeId, instruction) {
            const { tables, status } = get();
            if (status === "deriving") return;
            const node = tables.find((t) => t.id === nodeId);
            if (!node || node.kind !== "derived" || !node.parentId || !instruction.trim()) return;
            await runDerivation({
              parentId: node.parentId,
              instruction: instruction.trim(),
              dialog: node.dialog,
            });
          },

          cancelDerivation() {
            activeDeriveController?.abort();
            activeDeriveController = null;
            set({ statusText: "Annulation…" });
          },

          deleteNode(nodeId) {
            const { tables } = get();
            const node = tables.find((t) => t.id === nodeId);
            if (!node || node.kind !== "derived") return;
            const doomed = descendantsOf(tables, nodeId);
            for (const t of tables) {
              if (doomed.has(t.id) && t.engine === "python") {
                void disposeDerivationSession(t.id).catch(() => {});
              }
            }
            set((state) => {
              const remaining = state.tables.filter((t) => !doomed.has(t.id));
              return {
                tables: remaining,
                concepts: conceptsFromTables(remaining, customConcepts()),
                focusedTableId: doomed.has(state.focusedTableId ?? "")
                  ? (node.parentId ?? remaining[0]?.id ?? null)
                  : state.focusedTableId,
                truncatedNodeIds: state.truncatedNodeIds.filter((id) => !doomed.has(id)),
              };
            });
          },

          clearError() {
            set({ lastError: null });
          },

          resetAll() {
            set({
              tables: get().tables.filter((t) => t.kind === "original"),
              concepts: conceptsFromTables(
                get().tables.filter((t) => t.kind === "original"),
                [],
              ),
              focusedTableId: get().tables.find((t) => t.kind === "original")?.id ?? null,
              shelf: EMPTY_SHELF,
              status: "idle",
              statusText: "",
              lastError: null,
              truncatedNodeIds: [],
            });
          },
        };
      },
      {
        // Undo/redo scope = the shelf + focused table only (encodings, filters,
        // chart type, focus): high-frequency, cheap, safe to restore. Lineage ops
        // (derive/delete) are intentionally OUT of scope — they have their own
        // affordances and tracking table rows in history would balloon memory.
        limit: 50,
        partialize: (state) => ({ shelf: state.shelf, focusedTableId: state.focusedTableId }),
        // Skip history for sets that didn't touch the tracked slice (e.g. the many
        // status-only sets during a derivation): O(1) ref check, since shelf/focus
        // actions always spread a fresh object.
        equality: (a, b) => a.shelf === b.shelf && a.focusedTableId === b.focusedTableId,
      },
    ),
    {
      name: "formulator-v2",
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" }), {
        replacer: bigIntJsonReplacer,
      }),
      partialize: (state) => ({
        // Lineage metadata + code persist; rows NEVER do (python nodes
        // rehydrate with needsRerun() true, sql nodes recompute from DuckDB).
        tables: state.tables.map(({ rows: _rows, ...t }) => t),
        concepts: state.concepts,
        focusedTableId: state.focusedTableId,
        shelf: state.shelf,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<FormulatorV2State>;
        return {
          ...currentState,
          ...persisted,
          // Deep-fill the shelf: a snapshot written before a ShelfState field
          // existed (e.g. `filters`) must default it, not rehydrate undefined.
          shelf: { ...EMPTY_SHELF, ...persisted.shelf },
        };
      },
    },
  ),
);

// ─── Undo/redo (zundo temporal) ──────────────────────────────────────────────

/** The temporal (undo/redo) vanilla store attached by zundo. */
const temporalStore = useFormulatorV2Store.temporal;

/** Imperative undo/redo/clear — safe to call from menu commands or shortcuts. */
export const formulatorHistory = {
  undo: () => temporalStore.getState().undo(),
  redo: () => temporalStore.getState().redo(),
  clear: () => temporalStore.getState().clear(),
};

/** Reactive `{ canUndo, canRedo }` for toolbar button enablement. */
export function useFormulatorHistoryState(): { canUndo: boolean; canRedo: boolean } {
  return useStore(
    temporalStore,
    useShallow((s) => ({
      canUndo: s.pastStates.length > 0,
      canRedo: s.futureStates.length > 0,
    })),
  );
}

// ─── Narrow selector hooks (UI convention) ───────────────────────────────────

export const useFormTables = () => useFormulatorV2Store((s) => s.tables);
export const useFormConcepts = () => useFormulatorV2Store((s) => s.concepts);
export const useFormShelf = () => useFormulatorV2Store((s) => s.shelf);
export const useFormFocusedTable = () =>
  useFormulatorV2Store((s) => s.tables.find((t) => t.id === s.focusedTableId) ?? s.tables[0]);
export const useFormStatus = () =>
  useFormulatorV2Store(
    useShallow((s) => ({
      status: s.status,
      statusText: s.statusText,
      lastError: s.lastError,
    })),
  );
