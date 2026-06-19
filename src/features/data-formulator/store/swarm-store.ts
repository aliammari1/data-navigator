"use client";

/**
 * Moudir AI — Swarm run store.
 *
 * Holds the cinematic state machine for a single in-flight (or last-completed)
 * swarm run: the planner's plan, every agent lane's live status + streaming
 * buffer, the artifacts produced, and the synthesized result. The orchestrator
 * writes here; the screen renders from here. This is UI state only — durable
 * artifacts live on the workbench store once a run completes.
 */

import { create } from "zustand";
import type {
  AgentRunState,
  AgentStatus,
  AgentTask,
  Artifact,
  CriticVerdict,
  SwarmPhase,
  SwarmPlan,
  SwarmResult,
} from "../core/swarm/types";

interface SwarmState {
  /** The prompt that kicked off the current run. */
  prompt: string;
  phase: SwarmPhase;
  goal: string;
  plan: SwarmPlan | null;
  /** Per-task live state, keyed by task id. */
  runs: Record<string, AgentRunState>;
  /** Stable render order of task ids (plan order). */
  order: string[];
  /** Flattened accepted artifacts across all tasks. */
  artifacts: Artifact[];
  result: SwarmResult | null;
  /**
   * Live buffer of the final answer prose as it streams from `runAnswer`, so the
   * console can render the answer incrementally instead of waiting for the full
   * structured result. Cleared on a new run; the finished `result` supersedes it.
   */
  answerStream: string;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Non-null while the offline model is being warmed up before planning. */
  warming: { message: string; progress: number } | null;
  /** Set by the navigator when the planner resolves a navigation command; the
   * screen consumes it (router.push) then clears it. */
  navigation: { path: string; label: string } | null;

  // ── actions ──────────────────────────────────────────────────────────────
  begin: (prompt: string, startedAt: number) => void;
  setWarming: (warming: { message: string; progress: number } | null) => void;
  setNavigation: (navigation: { path: string; label: string } | null) => void;
  reset: () => void;
  setPhase: (phase: SwarmPhase) => void;
  setPlan: (plan: SwarmPlan) => void;
  initRuns: (tasks: AgentTask[]) => void;
  setStatus: (taskId: string, status: AgentStatus) => void;
  appendToken: (taskId: string, token: string) => void;
  patchRun: (taskId: string, patch: Partial<AgentRunState>) => void;
  addArtifact: (artifact: Artifact) => void;
  appendAnswerToken: (token: string) => void;
  setVerdict: (taskId: string, verdict: CriticVerdict) => void;
  failTask: (taskId: string, error: string) => void;
  complete: (result: SwarmResult, finishedAt: number) => void;
  fail: (error: string, finishedAt: number) => void;
}

const EMPTY: Pick<
  SwarmState,
  | "prompt"
  | "phase"
  | "goal"
  | "plan"
  | "runs"
  | "order"
  | "artifacts"
  | "result"
  | "answerStream"
  | "error"
  | "startedAt"
  | "finishedAt"
  | "warming"
  | "navigation"
> = {
  prompt: "",
  phase: "idle",
  goal: "",
  plan: null,
  runs: {},
  order: [],
  artifacts: [],
  result: null,
  answerStream: "",
  error: null,
  startedAt: null,
  finishedAt: null,
  warming: null,
  navigation: null,
};

export const useSwarmStore = create<SwarmState>((set) => ({
  ...EMPTY,

  begin: (prompt, startedAt) => set({ ...EMPTY, prompt, phase: "planning", startedAt }),

  reset: () => set({ ...EMPTY }),

  setPhase: (phase) => set({ phase }),

  setWarming: (warming) => set({ warming }),

  setNavigation: (navigation) => set({ navigation }),

  setPlan: (plan) => set({ plan, goal: plan.goal }),

  initRuns: (tasks) =>
    set(() => {
      const runs: Record<string, AgentRunState> = {};
      for (const task of tasks) {
        runs[task.id] = {
          task,
          status: "queued",
          partial: "",
          artifacts: [],
        };
      }
      return { runs, order: tasks.map((t) => t.id) };
    }),

  setStatus: (taskId, status) =>
    set((state) => {
      const run = state.runs[taskId];
      if (!run) return state;
      const now = Date.now();
      const startedAt =
        run.startedAt ?? (status === "thinking" || status === "running" ? now : undefined);
      const finishedAt =
        status === "done" || status === "failed" || status === "skipped" ? now : run.finishedAt;
      return {
        runs: { ...state.runs, [taskId]: { ...run, status, startedAt, finishedAt } },
      };
    }),

  appendToken: (taskId, token) =>
    set((state) => {
      const run = state.runs[taskId];
      if (!run) return state;
      return {
        runs: {
          ...state.runs,
          [taskId]: {
            ...run,
            status: run.status === "thinking" ? "streaming" : run.status,
            partial: run.partial + token,
          },
        },
      };
    }),

  patchRun: (taskId, patch) =>
    set((state) => {
      const run = state.runs[taskId];
      if (!run) return state;
      return { runs: { ...state.runs, [taskId]: { ...run, ...patch } } };
    }),

  addArtifact: (artifact) =>
    set((state) => {
      const run = state.runs[artifact.taskId];
      const runs = run
        ? {
            ...state.runs,
            [artifact.taskId]: {
              ...run,
              artifacts: [...run.artifacts, artifact],
            },
          }
        : state.runs;
      return { runs, artifacts: [...state.artifacts, artifact] };
    }),

  appendAnswerToken: (token) => set((state) => ({ answerStream: state.answerStream + token })),

  setVerdict: (taskId, verdict) =>
    set((state) => {
      const run = state.runs[taskId];
      if (!run) return state;
      return { runs: { ...state.runs, [taskId]: { ...run, verdict } } };
    }),

  failTask: (taskId, error) =>
    set((state) => {
      const run = state.runs[taskId];
      if (!run) return state;
      return {
        runs: {
          ...state.runs,
          [taskId]: { ...run, status: "failed", error, finishedAt: Date.now() },
        },
      };
    }),

  complete: (result, finishedAt) =>
    set({
      phase: "done",
      result,
      artifacts: result.artifacts,
      // The structured result now carries the prose; drop the live buffer.
      answerStream: "",
      finishedAt,
    }),

  fail: (error, finishedAt) => set({ phase: "failed", error, finishedAt }),
}));
