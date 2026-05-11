"use client";

import { CAPABILITY_EXECUTORS } from "./capabilities";
import { createEmptyBlackboard, mergeBlackboard } from "./blackboard";
import { createInvestigationPlan, expandPlanDynamically } from "./planner";
import type {
  AgentMeshInput,
  BlackboardState,
  CapabilityResult,
  InvestigationPlan,
  InvestigationTask,
} from "./types";

export interface RunnerEvent {
  type:
    | "plan-created"
    | "task-started"
    | "task-completed"
    | "task-failed"
    | "plan-expanded"
    | "state-updated"
    | "run-completed";
  state: BlackboardState;
  task?: InvestigationTask;
  plan?: InvestigationPlan;
  message?: string;
}

export interface RunOptions {
  signal?: AbortSignal;
  onEvent?: (event: RunnerEvent) => void;
  maxParallelTasks?: number;
}

function taskReady(
  task: InvestigationTask,
  completedTaskIds: Set<string>,
): boolean {
  return task.dependsOn.every((id) => completedTaskIds.has(id));
}

function withTaskStatus(
  plan: InvestigationPlan,
  taskId: string,
  patch: Partial<InvestigationTask>,
): InvestigationPlan {
  return {
    ...plan,
    tasks: plan.tasks.map((task) =>
      task.id === taskId ? { ...task, ...patch } : task,
    ),
  };
}

function applyCapabilityResult(
  state: BlackboardState,
  result: CapabilityResult,
): BlackboardState {
  let next = result.patch ? mergeBlackboard(state, result.patch) : state;

  if (result.evidence?.length) {
    next = mergeBlackboard(next, {
      evidence: {
        ...next.evidence,
        items: result.evidence,
      },
    });
  }

  if (result.decisionPatch) {
    next = mergeBlackboard(next, {
      decisions: {
        ...next.decisions,
        ...result.decisionPatch,
      },
    });
  }

  return next;
}

function emit(
  options: RunOptions | undefined,
  event: Omit<RunnerEvent, "state"> & { state: BlackboardState },
): void {
  options?.onEvent?.(event);
}

type TaskRunOutcome =
  | {
      status: "done";
      task: InvestigationTask;
      result: CapabilityResult;
    }
  | {
      status: "error";
      task: InvestigationTask;
      message: string;
    };

async function executeTask(
  input: AgentMeshInput,
  state: BlackboardState,
  task: InvestigationTask,
  options?: RunOptions,
): Promise<TaskRunOutcome> {
  const executor = CAPABILITY_EXECUTORS[task.capabilityId];

  if (!executor) {
    return {
      status: "error",
      task,
      message: `No executor registered for ${task.capabilityId}`,
    };
  }

  try {
    const result = await executor(
      { input, state, signal: options?.signal },
      task,
    );
    return { status: "done", task, result };
  } catch (error) {
    return {
      status: "error",
      task,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runAgentMesh(
  input: AgentMeshInput,
  options?: RunOptions,
): Promise<BlackboardState> {
  let state = createEmptyBlackboard();
  const plan = createInvestigationPlan(input);

  state = mergeBlackboard(state, {
    telecom: {
      ...state.telecom,
      mapping: input.mapping,
      statusMapping: input.statusMapping,
    },
    plan: {
      ...state.plan,
      activePlan: plan,
      running: true,
      startedAt: Date.now(),
      finishedAt: undefined,
      maxParallelTasks: Math.max(1, options?.maxParallelTasks ?? 3),
    },
  });

  emit(options, {
    type: "plan-created",
    state,
    plan,
    message: "Telecom investigation plan created.",
  });

  let activePlan = plan;
  const completed = new Set<string>();
  const failed = new Set<string>();
  const triggerExpanded = new Set<string>();
  const maxParallelTasks = Math.max(1, options?.maxParallelTasks ?? 3);

  while (completed.size + failed.size < activePlan.tasks.length) {
    if (options?.signal?.aborted) {
      state = mergeBlackboard(state, {
        plan: {
          ...state.plan,
          running: false,
          finishedAt: Date.now(),
        },
      });
      return state;
    }

    const ready = activePlan.tasks
      .filter(
        (task) =>
          !completed.has(task.id) &&
          !failed.has(task.id) &&
          task.status !== "running" &&
          taskReady(task, completed),
      )
      .sort((a, b) => a.priority - b.priority);

    if (!ready.length) {
      const blocked = activePlan.tasks
        .filter((task) => !completed.has(task.id) && !failed.has(task.id))
        .map((task) => task.id);
      state = mergeBlackboard(state, {
        plan: {
          ...state.plan,
          running: false,
          finishedAt: Date.now(),
          blockedTaskIds: blocked,
        },
      });
      return state;
    }

    const batch = ready.slice(0, maxParallelTasks);
    const batchStartedAt = Date.now();
    for (const task of batch) {
      activePlan = withTaskStatus(activePlan, task.id, {
        status: "running",
        startedAt: batchStartedAt,
      });
    }
    state = mergeBlackboard(state, {
      plan: {
        ...state.plan,
        activePlan,
        activeTaskId: batch[0]?.id,
      },
    });

    for (const task of batch) {
      emit(options, {
        type: "task-started",
        state,
        task: activePlan.tasks.find((item) => item.id === task.id),
        message: task.title,
      });
    }

    const batchState = state;
    const outcomes = await Promise.all(
      batch.map((task) => executeTask(input, batchState, task, options)),
    );

    for (const outcome of outcomes) {
      const finishedAt = Date.now();
      if (outcome.status === "done") {
        state = applyCapabilityResult(state, outcome.result);
        completed.add(outcome.task.id);

        activePlan = withTaskStatus(activePlan, outcome.task.id, {
          status: "done",
          finishedAt,
        });
        state = mergeBlackboard(state, {
          plan: {
            ...state.plan,
            activePlan,
            completedTaskIds: [...completed],
          },
        });
        emit(options, {
          type: "task-completed",
          state,
          task: activePlan.tasks.find((item) => item.id === outcome.task.id),
          message: `${outcome.task.title} complete.`,
        });

        // ── Dynamic plan expansion ──────────────────────────────────────────
        const EXPANSION_TRIGGERS = ["overview-kpis", "anomaly-radar"];
        if (
          EXPANSION_TRIGGERS.includes(outcome.task.id) &&
          !triggerExpanded.has(outcome.task.id)
        ) {
          triggerExpanded.add(outcome.task.id);
          const { tasks: newTasks, reasons } = expandPlanDynamically(
            state,
            new Set(activePlan.tasks.map((t) => t.id)),
            outcome.task.id,
          );
          if (newTasks.length > 0) {
            const accept = activePlan.tasks.find(
              (t) => t.id === "accept-evidence",
            );
            const updatedDeps = accept
              ? [
                  ...new Set([
                    ...accept.dependsOn,
                    ...newTasks.map((t) => t.id),
                  ]),
                ]
              : null;
            activePlan = {
              ...activePlan,
              tasks: [
                ...activePlan.tasks.filter((t) => t.id !== "accept-evidence"),
                ...newTasks,
                ...(accept && updatedDeps
                  ? [{ ...accept, dependsOn: updatedDeps }]
                  : []),
              ],
            };
            const expansion = {
              at: Date.now(),
              reason: reasons.join("; "),
              addedTaskIds: newTasks.map((t) => t.id),
            };
            state = mergeBlackboard(state, {
              plan: {
                ...state.plan,
                activePlan,
                expansions: [...state.plan.expansions, expansion],
              },
            });
            emit(options, {
              type: "plan-expanded",
              state,
              plan: activePlan,
              message: reasons.join("; "),
            });
          }
        }
      } else {
        failed.add(outcome.task.id);
        activePlan = withTaskStatus(activePlan, outcome.task.id, {
          status: "error",
          error: outcome.message,
          finishedAt,
        });
        state = mergeBlackboard(state, {
          plan: {
            ...state.plan,
            activePlan,
            errors: [
              ...state.plan.errors,
              { taskId: outcome.task.id, message: outcome.message },
            ],
          },
        });
        emit(options, {
          type: "task-failed",
          state,
          task: activePlan.tasks.find((item) => item.id === outcome.task.id),
          message: outcome.message,
        });
      }
    }

    state = mergeBlackboard(state, {
      plan: {
        ...state.plan,
        activeTaskId: undefined,
      },
    });

    emit(options, {
      type: "state-updated",
      state,
    });
  }

  state = mergeBlackboard(state, {
    plan: {
      ...state.plan,
      running: false,
      activePlan,
      finishedAt: Date.now(),
      completedTaskIds: [...completed],
    },
  });

  emit(options, {
    type: "run-completed",
    state,
    plan: activePlan,
    message: "Telecom agent mesh run complete.",
  });

  return state;
}
