"use client";

import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Eye,
  Play,
} from "lucide-react";
import { useState } from "react";
import { AtlasButton } from "@/design/primitives/button";
import { AtlasChip } from "@/design/primitives/chip";
import type { Recommendation } from "@/features/auto-analyst/core/types";

type ActionState = "proposed" | "queued" | "simulated" | "accepted";

const nextState: Record<ActionState, ActionState> = {
  proposed: "queued",
  queued: "simulated",
  simulated: "accepted",
  accepted: "proposed",
};

function impactFor(r: Recommendation): number {
  const base =
    r.severity === "danger" ? 86 : r.severity === "warning" ? 68 : 48;
  return Math.min(95, base + Math.min(9, r.why.length % 13));
}

function effortFor(r: Recommendation): "low" | "medium" | "high" {
  if (/dedupe|standardise|impute|drop/i.test(`${r.action} ${r.why}`)) {
    return "medium";
  }
  if (/alert|communicate|plan/i.test(r.action)) return "low";
  return r.severity === "danger" ? "high" : "medium";
}

export function StepRecommendations({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  const [states, setStates] = useState<Record<string, ActionState>>({});
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  if (!recommendations.length) {
    return (
      <p className="text-sm text-[var(--atlas-text-subtle)]">
        No actionable recommendations from this analysis.
      </p>
    );
  }

  const advance = (id: string) =>
    setStates((draft) => {
      const current = draft[id] ?? "proposed";
      return { ...draft, [id]: nextState[current] };
    });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["proposed", "queued", "simulated", "accepted"] as ActionState[]).map(
          (s) => (
            <div
              key={s}
              className="rounded-[var(--atlas-radius-2)] border border-[var(--atlas-border)] bg-[var(--atlas-surface)] px-3 py-2"
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--atlas-text-subtle)]">
                {s}
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-[var(--atlas-text)]">
                {
                  recommendations.filter(
                    (r) => (states[r.id] ?? "proposed") === s,
                  ).length
                }
              </div>
            </div>
          ),
        )}
      </div>

      {recommendations.map((r) => {
        const actionState = states[r.id] ?? "proposed";
        const impact = impactFor(r);
        const effort = effortFor(r);
        const showEvidence = openEvidence === r.id;

        return (
          <div
            key={r.id}
            className="rounded-[var(--atlas-radius-3)] border border-[var(--atlas-border)] bg-[var(--atlas-surface)] p-3 transition-colors hover:border-[var(--atlas-accent-border)]"
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-[var(--atlas-radius-2)] border ${
                  actionState === "accepted"
                    ? "border-[var(--atlas-success-border)] bg-[var(--atlas-success-soft)] text-[var(--atlas-success-fg)]"
                    : "border-[var(--atlas-accent-border)] bg-[var(--atlas-accent-soft)] text-[var(--atlas-accent-fg)]"
                }`}
              >
                {actionState === "accepted" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <ClipboardList className="h-4 w-4" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <AtlasChip
                    severity={
                      r.severity === "danger"
                        ? "danger"
                        : r.severity === "warning"
                          ? "warning"
                          : "info"
                    }
                    size="sm"
                  >
                    {r.severity}
                  </AtlasChip>
                  <AtlasChip
                    severity={actionState === "accepted" ? "success" : "accent"}
                    size="sm"
                  >
                    {actionState}
                  </AtlasChip>
                  <span className="text-sm font-semibold text-[var(--atlas-text)]">
                    {r.action}
                  </span>
                </div>

                <div className="mt-1 text-[11px] leading-snug text-[var(--atlas-text-subtle)]">
                  {r.why}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border border-[var(--atlas-border)] bg-[var(--atlas-bg-subtle)] px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--atlas-text-subtle)]">
                      impact
                    </div>
                    <div className="text-sm font-bold tabular-nums text-[var(--atlas-text)]">
                      {impact}/100
                    </div>
                  </div>
                  <div className="rounded-md border border-[var(--atlas-border)] bg-[var(--atlas-bg-subtle)] px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--atlas-text-subtle)]">
                      effort
                    </div>
                    <div className="text-sm font-bold text-[var(--atlas-text)]">
                      {effort}
                    </div>
                  </div>
                  <div className="rounded-md border border-[var(--atlas-border)] bg-[var(--atlas-bg-subtle)] px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--atlas-text-subtle)]">
                      owner
                    </div>
                    <div className="truncate text-sm font-bold text-[var(--atlas-text)]">
                      {r.severity === "danger" ? "Ops lead" : "Analyst"}
                    </div>
                  </div>
                </div>

                {showEvidence && (
                  <div className="mt-3 rounded-[var(--atlas-radius-2)] border border-[var(--atlas-accent-border)] bg-[var(--atlas-accent-soft)]/40 p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--atlas-accent-fg)]">
                      <BarChart3 className="h-3 w-3" />
                      Evidence packet
                    </div>
                    <div className="text-[11px] leading-snug text-[var(--atlas-text)]">
                      {r.evidence ||
                        "Evidence is derived from the completed analysis steps."}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <AtlasButton
                variant="outline"
                size="sm"
                onClick={() => setOpenEvidence(showEvidence ? null : r.id)}
              >
                <Eye className="h-3.5 w-3.5" />
                Evidence
              </AtlasButton>
              <AtlasButton
                variant="soft"
                size="sm"
                onClick={() => advance(r.id)}
              >
                <Play className="h-3.5 w-3.5" />
                {actionState === "accepted" ? "Reset" : "Advance"}
              </AtlasButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
