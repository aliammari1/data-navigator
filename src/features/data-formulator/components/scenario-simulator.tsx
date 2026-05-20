"use client";

/**
 * Scenario Simulator Panel
 * Displays what-if scenario results with base case comparison.
 */

import { Activity, BarChart3, ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils";

interface ScenarioAssumption {
  variable: string;
  change: string;
  value: number;
}

interface ScenarioImpact {
  metric: string;
  baseValue: number;
  scenarioValue: number;
  delta: number;
  deltaPercent: number;
}

interface ScenarioSimulatorProps {
  name?: string;
  assumptions?: ScenarioAssumption[];
  impact?: ScenarioImpact;
  confidence?: "high" | "medium" | "low";
  caveats?: string[];
}

export function ScenarioSimulator({
  name,
  assumptions = [],
  impact,
  confidence = "medium",
  caveats = [],
}: ScenarioSimulatorProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
          <Activity className="h-4 w-4 text-violet-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Scenario Simulator</h2>
          <p className="text-xs text-muted-foreground">What-if analysis</p>
        </div>
      </div>

      {!name || !impact ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-xs text-muted-foreground">
            No scenario yet. Ask "What if success rate improves by 2%?" to start.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="text-xs font-semibold text-foreground">{name}</div>
            <div className="mt-2 inline-flex rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
              Confidence: {confidence}
            </div>
          </div>

          {assumptions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Assumptions
              </div>
              {assumptions.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2"
                >
                  <ChevronRight className="h-3 w-3 text-violet-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-foreground">{a.variable}</div>
                    <div className="text-[10px] text-muted-foreground">{a.change}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Impact
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-[10px] text-muted-foreground">Base</div>
                <div className="text-sm font-bold text-foreground">{impact.baseValue.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Scenario</div>
                <div className="text-sm font-bold text-violet-300">{impact.scenarioValue.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-2 text-center">
              <div
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                  impact.delta >= 0
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-rose-500/10 text-rose-300"
                )}
              >
                {impact.delta >= 0 ? "+" : ""}
                {impact.deltaPercent.toFixed(1)}% ({impact.delta >= 0 ? "+" : ""}
                {impact.delta.toLocaleString()})
              </div>
            </div>
          </div>

          {caveats.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Caveats
              </div>
              {caveats.map((c, i) => (
                <div key={i} className="text-[11px] text-muted-foreground">
                  · {c}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
