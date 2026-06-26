/**
 * Global zustand + immer store — single source of truth for the v3 agent canvas.
 * Bidirectional sync: pipeline writes → UI reads; user edits → pipeline sees.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AGUIEvent } from "@/features/agent-canvas/core/ag-ui-types";
import type { TraceNode } from "@/features/agent-canvas/core/event-bus";
import type {
  AgentPhase,
  AgentThought,
  DashboardPlan,
  WidgetState,
} from "@/features/agent-canvas/core/types";

// ─── SQL IDE state ────────────────────────────────────────────────────────────

export interface SQLTab {
  id: string;
  label: string;
  sql: string;
  results: Record<string, unknown>[];
  error?: string;
  running: boolean;
}

export interface SQLHistoryEntry {
  id: string;
  sql: string;
  timestamp: number;
  rowCount: number;
  duration: number;
}

// ─── Interrupt state ──────────────────────────────────────────────────────────

export interface HumanInterrupt {
  active: boolean;
  reason: string;
  payload: unknown;
  resolve?: (decision: "approve" | "revise", edits?: Partial<DashboardPlan>) => void;
}

// ─── Agent flow node ─────────────────────────────────────────────────────────

export interface FlowNode {
  id: string;
  label: string;
  status: "idle" | "running" | "done" | "error" | "interrupt";
  type: "schema" | "react" | "plan" | "critique" | "sql" | "chart" | "narrate" | "gate";
}

// ─── Root store ──────────────────────────────────────────────────────────────

export interface AgentStoreState {
  // Pipeline
  phase: AgentPhase;
  tableName?: string;
  fileName?: string;
  model: string;
  threadId?: string;
  thoughts: AgentThought[];
  plan?: DashboardPlan;
  widgets: WidgetState[];
  narrative?: string;
  error?: string;
  running: boolean;

  // UI flow
  step: "setup" | "build" | "done";
  panelConfig: { showSql: boolean; showGraph: boolean; showNarrative: boolean };

  // SQL IDE
  sqlTabs: SQLTab[];
  sqlHistory: SQLHistoryEntry[];
  activeSqlTab: string;

  // Agent graph
  flowNodes: FlowNode[];

  // HITL
  interrupt: HumanInterrupt;

  // LangSmith trace
  traceRoots: TraceNode[];

  // AG-UI event log (last 200)
  eventTicker: AGUIEvent[];

  // Stats
  startTime?: number;
  tokenCount: number;
  toolCallCnt: number;

  // Actions
  setPhase: (phase: AgentPhase) => void;
  setStep: (step: "setup" | "build" | "done") => void;
  setModel: (model: string) => void;
  setTableName: (table: string, file: string) => void;
  setThreadId: (id: string) => void;
  setPlan: (plan: DashboardPlan) => void;
  upsertWidget: (w: WidgetState) => void;
  addThought: (t: AgentThought) => void;
  setNarrative: (n: string) => void;
  setError: (e: string) => void;
  setRunning: (r: boolean) => void;
  reset: () => void;

  setFlowNodes: (nodes: FlowNode[]) => void;
  updateFlowNode: (id: string, patch: Partial<FlowNode>) => void;

  setInterrupt: (i: HumanInterrupt) => void;
  clearInterrupt: () => void;

  addSQLTab: (tab: SQLTab) => void;
  updateSQLTab: (id: string, patch: Partial<SQLTab>) => void;
  setActiveSQLTab: (id: string) => void;
  pushSQLHistory: (e: SQLHistoryEntry) => void;

  setTraceRoots: (roots: TraceNode[]) => void;
  pushEvent: (ev: AGUIEvent) => void;
  incTokens: (n: number) => void;
  incTools: () => void;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function defaultSQLForTable(tableName?: string): string {
  if (!tableName) return "SHOW TABLES;";
  return `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 100;`;
}

const DEFAULT_SQL_TAB: SQLTab = {
  id: "tab-1",
  label: "Query 1",
  sql: defaultSQLForTable(),
  results: [],
  running: false,
};

const INITIAL: Omit<
  AgentStoreState,
  | "setPhase"
  | "setStep"
  | "setModel"
  | "setTableName"
  | "setThreadId"
  | "setPlan"
  | "upsertWidget"
  | "addThought"
  | "setNarrative"
  | "setError"
  | "setRunning"
  | "reset"
  | "setFlowNodes"
  | "updateFlowNode"
  | "setInterrupt"
  | "clearInterrupt"
  | "addSQLTab"
  | "updateSQLTab"
  | "setActiveSQLTab"
  | "pushSQLHistory"
  | "setTraceRoots"
  | "pushEvent"
  | "incTokens"
  | "incTools"
> = {
  phase: "idle",
  model: "HuggingFaceTB/SmolLM2-360M-Instruct",
  thoughts: [],
  widgets: [],
  running: false,
  step: "setup",
  panelConfig: { showSql: true, showGraph: true, showNarrative: true },
  sqlTabs: [DEFAULT_SQL_TAB],
  sqlHistory: [],
  activeSqlTab: "tab-1",
  flowNodes: [],
  interrupt: { active: false, reason: "", payload: null },
  traceRoots: [],
  eventTicker: [],
  tokenCount: 0,
  toolCallCnt: 0,
};

export const useAgentStore = create<AgentStoreState>()(
  immer((set) => ({
    ...INITIAL,

    setPhase: (phase) =>
      set((s) => {
        s.phase = phase;
      }),
    setStep: (step) =>
      set((s) => {
        s.step = step;
      }),
    setModel: (model) =>
      set((s) => {
        s.model = model;
      }),
    setTableName: (table, file) =>
      set((s) => {
        s.tableName = table;
        s.fileName = file;
        if (s.sqlTabs.length === 1 && s.sqlTabs[0]?.sql === DEFAULT_SQL_TAB.sql) {
          s.sqlTabs[0].sql = defaultSQLForTable(table);
        }
      }),
    setThreadId: (id) =>
      set((s) => {
        s.threadId = id;
      }),
    setPlan: (plan) =>
      set((s) => {
        s.plan = plan;
      }),
    setNarrative: (n) =>
      set((s) => {
        s.narrative = n;
      }),
    setError: (e) => {
      console.error("Error:", e);
      return set((s) => {
        s.error = e;
      });
    },
    setRunning: (r) =>
      set((s) => {
        s.running = r;
        if (r && !s.startTime) s.startTime = Date.now();
      }),

    upsertWidget: (w) =>
      set((s) => {
        const idx = s.widgets.findIndex((x) => x.spec.id === w.spec.id);
        if (idx >= 0) s.widgets[idx] = w;
        else s.widgets.push(w);
      }),

    addThought: (t) =>
      set((s) => {
        s.thoughts.push(t);
        if (s.thoughts.length > 200) s.thoughts.shift();
      }),

    reset: () =>
      set((s) => {
        Object.assign(s, INITIAL);
        s.sqlTabs = [DEFAULT_SQL_TAB];
        s.sqlHistory = [];
      }),

    setFlowNodes: (nodes) =>
      set((s) => {
        s.flowNodes = nodes;
      }),
    updateFlowNode: (id, patch) =>
      set((s) => {
        const n = s.flowNodes.find((x) => x.id === id);
        if (n) Object.assign(n, patch);
      }),

    setInterrupt: (i) =>
      set((s) => {
        s.interrupt = i;
      }),
    clearInterrupt: () =>
      set((s) => {
        s.interrupt = { active: false, reason: "", payload: null };
      }),

    addSQLTab: (tab) =>
      set((s) => {
        s.sqlTabs.push(tab);
      }),
    updateSQLTab: (id, patch) =>
      set((s) => {
        const t = s.sqlTabs.find((x) => x.id === id);
        if (t) Object.assign(t, patch);
      }),
    setActiveSQLTab: (id) =>
      set((s) => {
        s.activeSqlTab = id;
      }),
    pushSQLHistory: (e) =>
      set((s) => {
        s.sqlHistory.unshift(e);
        if (s.sqlHistory.length > 20) s.sqlHistory.pop();
      }),

    setTraceRoots: (roots) =>
      set((s) => {
        s.traceRoots = roots;
      }),

    pushEvent: (ev) =>
      set((s) => {
        s.eventTicker.push(ev);
        if (s.eventTicker.length > 200) s.eventTicker.shift();
      }),

    incTokens: (n) =>
      set((s) => {
        s.tokenCount += n;
      }),
    incTools: () =>
      set((s) => {
        s.toolCallCnt++;
      }),
  })),
);
