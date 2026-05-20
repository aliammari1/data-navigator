"use client";

/**
 * Workbench Store
 * Spatial canvas state: cards, positions, history, agent status.
 * No tabs. No sidebars. Everything is on the canvas.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AgentTrace } from "../core/agent-graph";
import { bigIntJsonReplacer, sanitizeJsonValue } from "../core/json";
import type { ManagerIntent } from "../core/language/intent";
import type { ManagerAnswer } from "../core/manager-answer";
import type { ChartSpec, QueryResult } from "../core/types";

// ─── BigInt-safe JSON replacer ──────────────────────────────────────────────────
//
// DuckDB Node API / WASM can return BigInt values (e.g. from BIGINT,
// HUGEINT, or COUNT(*) columns). JSON.stringify cannot serialise BigInt, so
// this replacer converts them to plain numbers (or strings for values larger
// than Number.MAX_SAFE_INTEGER) before the state slice is persisted.

// ─── Types ────────────────────────────────────────────────────────────────────

export type CanvasCardType =
  | "chart"
  | "insight"
  | "table"
  | "reasoning"
  | "kpi"
  | "toolResult"
  | "operation";

export interface CanvasCard {
  id: string;
  type: CanvasCardType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  // Card-specific data
  chartSpec?: ChartSpec;
  queryResult?: QueryResult;
  insightText?: string;
  insightSeverity?: "high" | "medium" | "low";
  tableData?: Record<string, unknown>[];
  reasoningText?: string;
  kpiValue?: number;
  kpiLabel?: string;
  kpiDelta?: number;
  toolResult?: unknown;
  operationPlan?: unknown;
  operationArtifact?: unknown;
  // Metadata
  createdAt: number;
  sourceQuery?: string;
  agentRole?: string;
  pinned?: boolean;
}

export interface ExplorationNode {
  id: string;
  query: string;
  timestamp: number;
  parentId?: string;
  cardIds: string[];
}

export interface WorkbenchState {
  // Canvas
  cards: CanvasCard[];
  selectedCardId: string | null;
  scale: number;
  offsetX: number;
  offsetY: number;

  // History
  history: ExplorationNode[];
  currentNodeId: string | null;

  // Agents
  agentRunning: boolean;
  agentTrace: AgentTrace | null;
  agentStatusText: string;
  managerAnswer: ManagerAnswer | null;
  activeIntent: ManagerIntent;
  languageMode: ManagerAnswer["language"];

  // Vector
  semanticMode: boolean;
  vectorIndexBuilt: boolean;

  // MCP
  showMcpModal: boolean;

  // UI
  showInspector: boolean;
  activePanel: "none" | "kpi-foundry" | "signal-radar" | "investigation" | "briefing" | "scenario" | "model-center" | "language";
  showTrace: boolean;
  cardCap: number;

  // Actions
  addCard: (card: Omit<CanvasCard, "id" | "createdAt">) => string;
  updateCard: (id: string, patch: Partial<CanvasCard>) => void;
  removeCard: (id: string) => void;
  selectCard: (id: string | null) => void;
  moveCard: (id: string, x: number, y: number) => void;
  resizeCard: (id: string, w: number, h: number) => void;
  clearCanvas: () => void;

  addHistoryNode: (query: string, parentId?: string) => string;
  setCurrentNode: (id: string) => void;

  setAgentRunning: (running: boolean) => void;
  setAgentTrace: (trace: AgentTrace | null) => void;
  setAgentStatusText: (text: string) => void;
  setManagerAnswer: (answer: ManagerAnswer | null) => void;
  setActiveIntent: (intent: ManagerIntent) => void;
  setLanguageMode: (mode: ManagerAnswer["language"]) => void;

  setSemanticMode: (mode: boolean) => void;
  setVectorIndexBuilt: (built: boolean) => void;

  setShowMcpModal: (show: boolean) => void;
  setShowInspector: (show: boolean) => void;
  setActivePanel: (panel: WorkbenchState["activePanel"]) => void;
  setShowTrace: (show: boolean) => void;
  setCardCap: (cap: number) => void;

  setCanvasTransform: (scale: number, offsetX: number, offsetY: number) => void;
}

// ─── Default sizes ────────────────────────────────────────────────────────────

const DEFAULT_SIZES: Record<CanvasCardType, { w: number; h: number }> = {
  chart: { w: 380, h: 280 },
  insight: { w: 320, h: 160 },
  table: { w: 400, h: 240 },
  reasoning: { w: 360, h: 200 },
  kpi: { w: 200, h: 140 },
  toolResult: { w: 340, h: 180 },
  operation: { w: 420, h: 260 },
};

function nextPosition(cards: CanvasCard[]): { x: number; y: number } {
  const visibleCards = cards.filter((card) => card.w > 0 && card.h > 0);
  if (visibleCards.length === 0) return { x: 40, y: 40 };

  // Keep new cards in a predictable two-column grid so generated dashboards do
  // not run outside the first viewport or hide behind the command bar.
  const margin = 24;
  const index = visibleCards.length;
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: 40 + column * (420 + margin),
    y: 40 + row * (300 + margin),
  };
}

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      cards: [],
      selectedCardId: null,
      scale: 1,
      offsetX: 0,
      offsetY: 0,

      history: [],
      currentNodeId: null,

      agentRunning: false,
      agentTrace: null,
      agentStatusText: "",
      managerAnswer: null,
      activeIntent: "ask",
      languageMode: "auto",

      semanticMode: false,
      vectorIndexBuilt: false,

      showMcpModal: false,
      showInspector: false,
      activePanel: "none",
      showTrace: false,
      cardCap: 6,

      addCard: (card) => {
        const current = get().cards;
        if (current.length >= get().cardCap) {
          // Evict oldest cards to stay within cap
          const trimmed = current.slice(current.length - get().cardCap + 1);
          set({ cards: trimmed });
        }
        const cleanCard = sanitizeJsonValue(card);
        const id = `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const pos = nextPosition(get().cards);
        const size = DEFAULT_SIZES[cleanCard.type];
        // Use || (not ??) so that explicit 0 / empty / "" values fall back
        // to the auto-computed defaults. A caller that passes w:0 or x:0
        // is signalling "I don't know the size/offset" rather than "place at
        // pixel zero".
        const newCard: CanvasCard = {
          ...cleanCard,
          id,
          x: cleanCard.x || pos.x,
          y: cleanCard.y || pos.y,
          w: cleanCard.w || size.w,
          h: cleanCard.h || size.h,
          createdAt: Date.now(),
        };
        set((s) => ({ cards: [...s.cards, newCard] }));
        return id;
      },

      updateCard: (id, patch) =>
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === id ? { ...c, ...sanitizeJsonValue(patch) } : c,
          ),
        })),

      removeCard: (id) =>
        set((s) => ({
          cards: s.cards.filter((c) => c.id !== id),
          selectedCardId: s.selectedCardId === id ? null : s.selectedCardId,
        })),

      selectCard: (id) => set({ selectedCardId: id, showInspector: id !== null }),

      moveCard: (id, x, y) =>
        set((s) => ({
          cards: s.cards.map((c) => (c.id === id ? { ...c, x, y } : c)),
        })),

      resizeCard: (id, w, h) =>
        set((s) => ({
          cards: s.cards.map((c) => (c.id === id ? { ...c, w, h } : c)),
        })),

      clearCanvas: () => set({ cards: [], selectedCardId: null, history: [], currentNodeId: null }),

      addHistoryNode: (query, parentId) => {
        const id = `node_${Date.now()}`;
        set((s) => ({
          history: [...s.history, { id, query, timestamp: Date.now(), parentId, cardIds: [] }],
          currentNodeId: id,
        }));
        return id;
      },

      setCurrentNode: (id) => set({ currentNodeId: id }),

      setAgentRunning: (running) => set({ agentRunning: running }),
      setAgentTrace: (trace) => set({ agentTrace: trace }),
      setAgentStatusText: (text) => set({ agentStatusText: text }),
      setManagerAnswer: (answer) => set({ managerAnswer: answer }),
      setActiveIntent: (intent) => set({ activeIntent: intent }),
      setLanguageMode: (mode) => set({ languageMode: mode }),

      setSemanticMode: (mode) => set({ semanticMode: mode }),
      setVectorIndexBuilt: (built) => set({ vectorIndexBuilt: built }),

      setShowMcpModal: (show) => set({ showMcpModal: show }),
      setShowInspector: (show) => set({ showInspector: show }),
      setActivePanel: (activePanel) => set({ activePanel }),
      setShowTrace: (showTrace) => set({ showTrace }),
      setCardCap: (cardCap) => set({ cardCap: Math.min(Math.max(cardCap, 1), 20) }),

      setCanvasTransform: (scale, offsetX, offsetY) => set({ scale, offsetX, offsetY }),
    }),
    {
      name: "workbench-store",
      storage: createJSONStorage(() => localStorage, { replacer: bigIntJsonReplacer }),
      partialize: (state) => ({
        cards: state.cards,
        history: state.history,
        semanticMode: state.semanticMode,
        activeIntent: state.activeIntent,
        languageMode: state.languageMode,
      }),
    },
  ),
);
