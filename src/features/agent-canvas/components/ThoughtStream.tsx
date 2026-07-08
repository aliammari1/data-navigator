"use client";
import { useEffect, useRef } from "react";
import type { AgentThought, ThoughtKind } from "@/features/agent-canvas/core/types";
import { cn } from "@/shared/utils";

const KIND_STYLE: Record<ThoughtKind, string> = {
  think: "text-slate-300",
  plan: "text-violet-300",
  sql: "text-cyan-300 font-mono text-[11px]",
  exec: "text-emerald-300",
  chart: "text-blue-300",
  insight: "text-amber-300 italic",
  ok: "text-green-400 font-medium",
  warn: "text-yellow-400",
  err: "text-red-400",
};

const KIND_PREFIX: Record<ThoughtKind, string> = {
  think: "◦",
  plan: "→",
  sql: "⌥",
  exec: "▶",
  chart: "◈",
  insight: "✦",
  ok: "✓",
  warn: "⚠",
  err: "✗",
};

interface Props {
  thoughts: AgentThought[];
  className?: string;
}

export function ThoughtStream({ thoughts, className }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: thoughts.length is the intended trigger to auto-scroll when a new thought arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thoughts.length]);

  if (thoughts.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center h-24 text-slate-600 text-xs", className)}
      >
        Waiting for pipeline to start…
      </div>
    );
  }

  return (
    <div className={cn("overflow-y-auto space-y-0.5 pr-1", className)}>
      {thoughts.map((t) => (
        <div key={t.id} className="flex gap-2 group">
          <span className={cn("shrink-0 text-[10px] mt-[3px] select-none", KIND_STYLE[t.kind])}>
            {KIND_PREFIX[t.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] text-slate-600 mr-1.5 select-none">[{t.agent}]</span>
            <span
              className={cn(
                "text-xs leading-relaxed whitespace-pre-wrap wrap-break-word",
                KIND_STYLE[t.kind],
              )}
            >
              {t.text}
            </span>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
