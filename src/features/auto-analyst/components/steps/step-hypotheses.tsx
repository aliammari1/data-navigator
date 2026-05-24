"use client";

import { ArrowRight } from "lucide-react";
import { AtlasChip } from "@/design/primitives/chip";
import type { Hypothesis } from "@/features/auto-analyst/core/types";

export function StepHypotheses({
  hypotheses,
  onAsk,
}: {
  hypotheses: Hypothesis[];
  onAsk?: (h: Hypothesis) => void;
}) {
  return (
    <div className="space-y-2">
      {hypotheses.map((h) => (
        <div
          key={h.id}
          className="flex items-start gap-3 rounded-(--atlas-radius-3) border border-(--atlas-border) bg-(--atlas-surface) px-3.5 py-3 hover:border-(--atlas-accent-border) transition-colors"
        >
          <AtlasChip
            severity={
              h.priority === "high"
                ? "danger"
                : h.priority === "medium"
                  ? "warning"
                  : "neutral"
            }
            size="sm"
          >
            {h.priority}
          </AtlasChip>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-(--atlas-text) font-medium">
              {h.question}
            </div>
            <div className="text-[11px] text-(--atlas-text-subtle) mt-0.5 leading-snug">
              {h.rationale}
            </div>
            {h.parents.length > 0 && (
              <div className="mt-1 flex gap-1.5 flex-wrap">
                {h.parents.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] font-mono text-(--atlas-accent-fg) bg-(--atlas-accent-soft) px-1.5 py-0.5 rounded"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
          {onAsk && (
            <button
              type="button"
              onClick={() => onAsk(h)}
              className="atlas-focus-ring text-(--atlas-accent-fg) text-xs font-medium hover:underline inline-flex items-center gap-1"
            >
              Investigate <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
