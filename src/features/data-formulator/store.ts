"use client";

/**
 * Data Formulator Enterprise Store
 * Manages: AI providers/models, exploration threads, agent state, settings
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";
import { bigIntJsonReplacer, sanitizeJsonValue } from "./core/json";
import type { LLMProvider } from "./core/ollama-provider";
import type { ChartSpec, QueryResult } from "./core/types";

export interface ExplorationStep {
  id: string;
  type: "nlQuery" | "chartCreate" | "chartEdit" | "derive" | "filter" | "agentAction" | "insight";
  timestamp: number;
  prompt?: string;
  chartSpec?: ChartSpec;
  chartResult?: QueryResult;
  sql?: string;
  reasoning?: string;
  agentPlan?: string[];
  parentId?: string; // for branching
  childrenIds: string[];
}

export interface AgentState {
  isRunning: boolean;
  currentGoal?: string;
  currentPlan?: string[];
  planStep: number;
  logs: Array<{
    ts: number;
    message: string;
    type: "info" | "warn" | "error" | "success";
  }>;
}

export interface FormulatorSettings {
  defaultProvider: string;
  defaultModel: string;
  ollamaHost: string;
  temperature: number;
  maxTokens: number;
  showSQL: boolean;
  showReasoning: boolean;
  autoRunAgent: boolean;
  theme: "system" | "dark" | "light";
}

interface FormulatorStore {
  // Providers & Models
  providers: LLMProvider[];
  selectedProviderId: string;
  selectedModel: string;
  setProviders: (providers: LLMProvider[]) => void;
  selectProvider: (id: string) => void;
  selectModel: (model: string) => void;
  refreshModels: () => Promise<void>;

  // Exploration Threads
  activeThreadId: string | null;
  threads: Record<
    string,
    { id: string; name: string; steps: ExplorationStep[]; createdAt: number }
  >;
  addStep: (
    threadId: string,
    step: Omit<ExplorationStep, "id" | "timestamp" | "childrenIds">,
  ) => void;
  forkStep: (threadId: string, stepId: string) => string; // returns new step id
  createThread: (name?: string) => string;
  setActiveThread: (id: string | null) => void;
  renameThread: (id: string, name: string) => void;
  deleteThread: (id: string) => void;

  // Agent State
  agent: AgentState;
  setAgentRunning: (running: boolean) => void;
  setAgentGoal: (goal?: string) => void;
  setAgentPlan: (plan?: string[]) => void;
  setAgentPlanStep: (step: number) => void;
  addAgentLog: (message: string, type?: AgentState["logs"][0]["type"]) => void;
  clearAgentLogs: () => void;

  // Settings
  settings: FormulatorSettings;
  updateSettings: (patch: Partial<FormulatorSettings>) => void;

  // UI State
  sidebarOpen: boolean;
  threadPanelOpen: boolean;
  explainPanelOpen: boolean;
  agentPanelOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setThreadPanelOpen: (open: boolean) => void;
  setExplainPanelOpen: (open: boolean) => void;
  setAgentPanelOpen: (open: boolean) => void;

  // Chart pinning
  pinChart: (threadId: string, stepId: string) => void;
  unpinChart: (threadId: string, stepId: string) => void;
  getPinnedCharts: () => Array<{ threadId: string; step: ExplorationStep }>;
}

const DEFAULT_SETTINGS: FormulatorSettings = {
  defaultProvider: "edge",
  defaultModel: "HuggingFaceTB/SmolLM2-360M-Instruct",
  ollamaHost: "edge://transformers-worker",
  temperature: 0.7,
  maxTokens: 4096,
  showSQL: true,
  showReasoning: true,
  autoRunAgent: false,
  theme: "system",
};

export const useFormulatorStore = create<FormulatorStore>()(
  persist(
    (set, get) => ({
      // Providers
      providers: [],
      selectedProviderId: "edge",
      selectedModel: DEFAULT_SETTINGS.defaultModel,
      setProviders: (providers) => set({ providers }),
      selectProvider: (id) => set({ selectedProviderId: id }),
      selectModel: (model) => set({ selectedModel: model }),
      refreshModels: async () => {
        // This is populated by the edge model selector component.
      },

      // Threads
      activeThreadId: null,
      threads: {},
      addStep: (threadId, step) =>
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;

          const cleanStep = sanitizeJsonValue(step);
          const newStep: ExplorationStep = {
            ...cleanStep,
            id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            childrenIds: [],
          };

          // If parent specified, add to parent's children
          if (cleanStep.parentId) {
            const parent = thread.steps.find((s) => s.id === cleanStep.parentId);
            if (parent) {
              parent.childrenIds.push(newStep.id);
            }
          }

          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                steps: [...thread.steps, newStep],
              },
            },
          };
        }),
      forkStep: (threadId, stepId) => {
        const state = get();
        const thread = state.threads[threadId];
        if (!thread) return "";

        const originalStep = thread.steps.find((s) => s.id === stepId);
        if (!originalStep) return "";

        const newStepId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const forkedStep: ExplorationStep = {
          ...originalStep,
          id: newStepId,
          timestamp: Date.now(),
          childrenIds: [],
          parentId: stepId,
          prompt: `${originalStep.prompt} (fork)`,
        };

        set((s) => {
          const t = s.threads[threadId];
          const parent = t.steps.find((st) => st.id === stepId);
          if (parent) parent.childrenIds.push(newStepId);
          return {
            threads: {
              ...s.threads,
              [threadId]: {
                ...t,
                steps: [...t.steps, forkedStep],
              },
            },
          };
        });

        return newStepId;
      },
      createThread: (name) => {
        const id = `thread_${Date.now()}`;
        set((state) => ({
          threads: {
            ...state.threads,
            [id]: {
              id,
              name: name ?? `Exploration ${Object.keys(state.threads).length + 1}`,
              steps: [],
              createdAt: Date.now(),
            },
          },
          activeThreadId: id,
        }));
        return id;
      },
      setActiveThread: (id) => set({ activeThreadId: id }),
      renameThread: (id, name) =>
        set((state) => {
          const thread = state.threads[id];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [id]: { ...thread, name },
            },
          };
        }),
      deleteThread: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.threads;
          return {
            threads: rest,
            activeThreadId: state.activeThreadId === id ? null : state.activeThreadId,
          };
        }),

      // Agent
      agent: {
        isRunning: false,
        planStep: 0,
        logs: [],
      },
      setAgentRunning: (running) =>
        set((state) => ({ agent: { ...state.agent, isRunning: running } })),
      setAgentGoal: (goal) => set((state) => ({ agent: { ...state.agent, currentGoal: goal } })),
      setAgentPlan: (plan) =>
        set((state) => ({
          agent: { ...state.agent, currentPlan: plan, planStep: 0 },
        })),
      setAgentPlanStep: (step) => set((state) => ({ agent: { ...state.agent, planStep: step } })),
      addAgentLog: (message, type = "info") =>
        set((state) => ({
          agent: {
            ...state.agent,
            logs: [...state.agent.logs, { ts: Date.now(), message, type }],
          },
        })),
      clearAgentLogs: () => set((state) => ({ agent: { ...state.agent, logs: [] } })),

      // Settings
      settings: DEFAULT_SETTINGS,
      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

      // UI
      sidebarOpen: true,
      threadPanelOpen: false,
      explainPanelOpen: false,
      agentPanelOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setThreadPanelOpen: (open) => set({ threadPanelOpen: open }),
      setExplainPanelOpen: (open) => set({ explainPanelOpen: open }),
      setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),

      // Chart pinning
      pinChart: (threadId, stepId) =>
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                steps: thread.steps.map((s) =>
                  s.id === stepId && s.chartSpec
                    ? { ...s, chartSpec: { ...s.chartSpec, pinnedAt: Date.now() } }
                    : s,
                ),
              },
            },
          };
        }),

      unpinChart: (threadId, stepId) =>
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                steps: thread.steps.map((s) =>
                  s.id === stepId && s.chartSpec
                    ? { ...s, chartSpec: { ...s.chartSpec, pinnedAt: undefined } }
                    : s,
                ),
              },
            },
          };
        }),

      getPinnedCharts: () => {
        const state = get();
        const result: Array<{ threadId: string; step: ExplorationStep }> = [];
        for (const [threadId, thread] of Object.entries(state.threads)) {
          for (const step of thread.steps) {
            if (step.chartSpec?.pinnedAt) {
              result.push({ threadId, step });
            }
          }
        }
        return result.sort(
          (a, b) => (b.step.chartSpec?.pinnedAt ?? 0) - (a.step.chartSpec?.pinnedAt ?? 0),
        );
      },
    }),
    {
      name: "data-formulator-enterprise-v1",
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" }), {
        replacer: bigIntJsonReplacer,
      }),
      partialize: (state) => ({
        providers: state.providers,
        selectedProviderId: state.selectedProviderId,
        selectedModel: state.selectedModel,
        // Persist the exploration graph WITHOUT the heavy `chartResult` rows.
        // The result set is fully re-derivable from the stored `sql`, so dropping
        // it keeps the synchronous JSON serialization on every `addStep` small
        // (large histories previously serialized every row of every chart).
        threads: Object.fromEntries(
          Object.entries(state.threads).map(([id, thread]) => [
            id,
            {
              ...thread,
              steps: thread.steps.map(({ chartResult: _chartResult, ...step }) => step),
            },
          ]),
        ),
        activeThreadId: state.activeThreadId,
        settings: state.settings,
      }),
    },
  ),
);
