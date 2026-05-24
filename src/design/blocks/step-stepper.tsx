"use client";

import { Check, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

export type StepStatus = "idle" | "running" | "done" | "error";

export interface Step {
  id: string;
  label: string;
  hint?: string;
  status: StepStatus;
  icon?: ReactNode;
  durationMs?: number;
}

interface Props {
  steps: Step[];
  activeId?: string;
  onSelect: (id: string) => void;
}

const dotByStatus: Record<StepStatus, string> = {
  idle: "border-(--atlas-border) bg-(--atlas-surface) text-(--atlas-text-subtle)",
  running:
    "border-(--atlas-accent-border) bg-(--atlas-accent-soft) text-(--atlas-accent-fg)",
  done: "border-(--atlas-success-border) bg-(--atlas-success-soft) text-(--atlas-success-fg)",
  error:
    "border-(--atlas-danger-border) bg-(--atlas-danger-soft) text-(--atlas-danger-fg)",
};

function fmtDuration(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AtlasStepper({ steps, activeId, onSelect }: Props) {
  return (
    <ol className="space-y-0.5">
      {steps.map((s, i) => {
        const isActive = s.id === activeId;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={`atlas-focus-ring group w-full flex items-start gap-3 px-2.5 py-2 rounded-(--atlas-radius-2) text-left transition-colors ${
                isActive
                  ? "bg-(--atlas-surface-raised) border border-(--atlas-accent-border)"
                  : "border border-transparent hover:bg-(--atlas-surface)"
              }`}
            >
              <div
                className={`flex-none w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${dotByStatus[s.status]}`}
              >
                {s.status === "done" ? (
                  <Check className="w-3 h-3" />
                ) : s.status === "running" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : s.status === "error" ? (
                  <X className="w-3 h-3" />
                ) : (
                  i + 1
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {s.icon && (
                    <span className="text-(--atlas-text-subtle) [&>svg]:w-3 [&>svg]:h-3">
                      {s.icon}
                    </span>
                  )}
                  <span
                    className={`text-xs font-semibold truncate ${
                      isActive
                        ? "text-(--atlas-text)"
                        : "text-(--atlas-text-muted) group-hover:text-(--atlas-text)"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {s.hint && (
                  <div className="text-[10px] text-(--atlas-text-subtle) truncate">
                    {s.hint}
                  </div>
                )}
                {s.durationMs && s.status === "done" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] text-(--atlas-success-fg)"
                  >
                    {fmtDuration(s.durationMs)}
                  </motion.div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
