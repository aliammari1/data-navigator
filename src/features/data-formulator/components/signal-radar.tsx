"use client";

import { AlertTriangle, BarChart3, ChevronRight, Radar, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/shared/utils";

interface Signal {
  severity: "high" | "medium" | "low";
  metric: string;
  whatChanged: string;
  likelyReason: string;
  evidence: string;
  suggestedAction: string;
}

interface SignalRadarProps {
  signals?: Signal[];
  onInvestigate?: (signal: Signal) => void;
}

export function SignalRadar({ signals = [], onInvestigate }: SignalRadarProps) {
  const sorted = [...signals].sort((a, b) => {
    const s = { high: 3, medium: 2, low: 1 };
    return s[b.severity] - s[a.severity];
  });

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10">
          <Radar className="h-4 w-4 text-rose-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Signal Radar</h2>
          <p className="text-xs text-muted-foreground">AI-detected changes and risks</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-xs text-muted-foreground">
            No signals yet. Run a signal scan from the command bar or wait for AI analysis.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((signal, i) => (
            <SignalCard key={i} signal={signal} onInvestigate={() => onInvestigate?.(signal)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal, onInvestigate }: { signal: Signal; onInvestigate?: () => void }) {
  const cfg = {
    high: { icon: ShieldAlert, color: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/20" },
    medium: { icon: AlertTriangle, color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    low: { icon: TrendingUp, color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  }[signal.severity];

  const Icon = cfg.icon;

  return (
    <div className={cn("rounded-lg border p-3", cfg.border, cfg.bg)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cfg.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{signal.metric}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-medium uppercase",
                cfg.border,
                cfg.bg,
                cfg.color,
              )}
            >
              {signal.severity}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-foreground/80">{signal.whatChanged}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{signal.likelyReason}</p>
          {onInvestigate && (
            <button
              onClick={onInvestigate}
              className="mt-2 flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
            >
              Investigate <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
