"use client";

/**
 * Moudir — Swarm Plan Panel.
 *
 * This is where the swarm's PLANNING becomes visible. The Planner restated the
 * user's request as a single `goal`, then decomposed it into a DAG of worker
 * tasks (`plan.tasks`, wired by `dependsOn`). This panel renders that flight
 * plan: the goal up top as the editorial headline, then the tasks grouped by
 * role with their ROLE_META icon + warm accent, and each task's dependencies
 * drawn as quiet connector lines so the manager can read the shape of the work
 * before any agent runs.
 *
 * Theme-aware: sits on the app surface as a frosted warm-glass card and reads in
 * BOTH light and dark mode (design tokens + --glass-* tokens). Coral is kept as
 * Moudir's single brand signal; per-role accents are warm HSL hues from
 * ROLE_META. Reduced-motion aware via useMotionOn().
 */

import { Target } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/utils";
import type { AgentRole, AgentTask, SwarmPlan } from "../../../core/swarm/types";
import {
  Kicker,
  MoudirMark,
  Pill,
  ROLE_META,
  Rule,
  rise,
  stagger,
  useMotionOn,
} from "../moudir-kit";

/** Build a warm per-role accent from ROLE_META's HSL hue. */
function roleAccent(role: AgentRole, alpha = 1): string {
  const { hue } = ROLE_META[role];
  return `hsl(${hue} 78% 52% / ${alpha})`;
}

/** Order roles the way the swarm reads: plan → query → derive → verify → compose. */
const ROLE_ORDER: AgentRole[] = [
  "planner",
  "query",
  "chart",
  "anomaly",
  "narrative",
  "critic",
  "synthesizer",
];

/** Group the plan's tasks by role, preserving plan order within each group. */
function groupByRole(tasks: AgentTask[]): Array<{
  role: AgentRole;
  tasks: AgentTask[];
}> {
  const buckets = new Map<AgentRole, AgentTask[]>();
  for (const task of tasks) {
    const bucket = buckets.get(task.role);
    if (bucket) bucket.push(task);
    else buckets.set(task.role, [task]);
  }
  const ordered: Array<{ role: AgentRole; tasks: AgentTask[] }> = [];
  for (const role of ROLE_ORDER) {
    const group = buckets.get(role);
    if (group) {
      ordered.push({ role, tasks: group });
      buckets.delete(role);
    }
  }
  // Any roles not in ROLE_ORDER (future-proofing) keep insertion order.
  for (const [role, group] of buckets) ordered.push({ role, tasks: group });
  return ordered;
}

/** One task row — title, instruction, and its dependency connectors. */
function TaskRow({ task, titleById }: { task: AgentTask; titleById: Map<string, string> }) {
  const accent = roleAccent(task.role);
  const deps = task.dependsOn
    .map((id) => titleById.get(id))
    .filter((label): label is string => Boolean(label));

  return (
    <motion.li variants={rise} className="relative pl-5">
      {/* Connector node on the role rail. */}
      <span
        className="absolute left-0 top-[0.55rem] h-2 w-2 -translate-x-1/2 rounded-full"
        style={{ background: accent }}
      />
      <div
        className="rounded-xl border border-border/70 px-3.5 py-2.5"
        style={{ background: "var(--glass-bg)" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-foreground">{task.title}</span>
          {deps.length > 0 && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {deps.length === 1 ? "dépend de" : `${deps.length} dépendances`}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {task.instruction}
        </p>
        {deps.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {deps.map((label, i) => (
              <span
                key={`${task.id}-dep-${i}`}
                className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                <span aria-hidden className="text-[9px] leading-none">
                  ↳
                </span>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.li>
  );
}

/** A role group — the icon + label header on a tinted rail, then its tasks. */
function RoleGroup({
  role,
  tasks,
  titleById,
}: {
  role: AgentRole;
  tasks: AgentTask[];
  titleById: Map<string, string>;
}) {
  const { label, Icon } = ROLE_META[role];
  const accent = roleAccent(role);

  return (
    <motion.div variants={rise} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg"
          style={{
            color: accent,
            background: roleAccent(role, 0.12),
            boxShadow: `inset 0 0 0 1px ${roleAccent(role, 0.3)}`,
          }}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      {/* Tasks hang off a tinted role rail (the DAG spine for this role). */}
      <ul
        className="ml-3 flex flex-col gap-2 border-l pl-3"
        style={{ borderColor: roleAccent(role, 0.28) }}
      >
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} titleById={titleById} />
        ))}
      </ul>
    </motion.div>
  );
}

export interface SwarmPlanPanelProps {
  /** The user's request, restated by the planner (falls back to plan.goal). */
  goal: string;
  /** The planner's decomposed flight plan, or null while still planning. */
  plan: SwarmPlan | null;
  className?: string;
}

/**
 * Renders the planner's goal + decomposed task DAG as a warm glass card.
 * When `plan` is null (planner still working) it shows the goal alone so the
 * card never collapses to an empty frame.
 */
export function SwarmPlanPanel({ goal, plan, className }: SwarmPlanPanelProps) {
  const motionOn = useMotionOn();
  const headline = goal || plan?.goal || "";
  const tasks = plan?.tasks ?? [];
  const groups = groupByRole(tasks);
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));

  return (
    <motion.section
      variants={motionOn ? stagger : undefined}
      initial={motionOn ? "hidden" : false}
      animate="show"
      className={cn("relative flex flex-col gap-5 rounded-2xl border p-6", className)}
      style={{
        background: "var(--glass-bg-strong)",
        borderColor: "var(--glass-border)",
        boxShadow: "var(--glass-shadow)",
      }}
    >
      {/* Goal — the planner's restatement, the editorial headline. */}
      <motion.header variants={rise} className="flex items-start gap-3">
        <MoudirMark size={32} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-[#17a2c9]" aria-hidden />
            <Kicker tone="coral">Plan du directeur</Kicker>
          </div>
          <h2 className="text-balance text-lg font-semibold leading-snug text-foreground">
            {headline || "Décomposition en cours…"}
          </h2>
        </div>
      </motion.header>

      {plan && tasks.length > 0 && (
        <>
          <motion.div variants={rise} className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral">
              {tasks.length} {tasks.length === 1 ? "tâche" : "tâches"}
            </Pill>
            <Pill tone="neutral">
              {groups.length} {groups.length === 1 ? "rôle" : "rôles"}
            </Pill>
            {plan.modelUsed && (
              <span className="font-mono text-[11px] text-muted-foreground">{plan.modelUsed}</span>
            )}
          </motion.div>

          <Rule />

          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <RoleGroup
                key={group.role}
                role={group.role}
                tasks={group.tasks}
                titleById={titleById}
              />
            ))}
          </div>
        </>
      )}
    </motion.section>
  );
}
