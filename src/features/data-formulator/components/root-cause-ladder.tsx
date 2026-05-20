"use client";

import { BarChart3, ChevronDown, ChevronRight, FileText, Info } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/utils";

export interface InvestigationStep {
  dimension: string;
  reason: string;
  sql: string;
  result?: { segment: string; value: number; percent: number }[];
}

export interface RootCauseLadderProps {
  targetMetric: string;
  hypothesis: string;
  steps: InvestigationStep[];
  confidence: "high" | "medium" | "low";
}

export function RootCauseLadder({ targetMetric, hypothesis, steps, confidence }: RootCauseLadderProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(0);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10">
          <BarChart3 className="h-4 w-4 text-cyan-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Investigation</h2>
          <p className="text-xs text-muted-foreground">{targetMetric}</p>
        </div>
      </div>

      <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 p-3">
        <div className="flex items-center gap-2 text-[11px] font-medium text-cyan-300">
          <Info className="h-3.5 w-3.5" />
          Hypothesis
        </div>
        <p className="mt-1 text-xs text-foreground/80">{hypothesis}</p>
        <div className="mt-2">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase",
              confidence === "high"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : confidence === "medium"
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                  : "border-white/10 bg-white/5 text-muted-foreground",
            )}
          >
            {confidence} confidence
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <div
            key={i}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
          >
            <button
              onClick={() => setExpandedStep(expandedStep === i ? null : i)}
              className="flex w-full items-center gap-2 text-left"
            >
              {expandedStep === i ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-medium text-foreground">{step.dimension}</span>
            </button>
            {expandedStep === i && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-muted-foreground">{step.reason}</p>
                {step.result && step.result.length > 0 && (
                  <div className="space-y-1">
                    {step.result.slice(0, 5).map((r, j) => (
                      <div key={j} className="flex items-center justify-between text-[11px]">
                        <span className="text-foreground">{r.segment}</span>
                        <span className="text-muted-foreground">
                          {r.value.toLocaleString()} ({r.percent}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                  <code className="block text-[10px] text-muted-foreground">{step.sql}</code>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
