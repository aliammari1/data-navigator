"use client";

/**
 * TopBar — AG-UI event ticker, thread ID, phase badge, model name.
 * Shows a live scrolling ticker of the last AG-UI events.
 */

import { Activity, Brain, Cpu, Hash } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import type { AgentPhase } from "@/features/agent-canvas/core/types";
import { useShallowSelector } from "@/platform/storage";
import { cn } from "@/shared/utils";

const PHASE_COLOR: Record<AgentPhase, string> = {
  idle: "bg-slate-700 text-slate-400",
  "model-load": "bg-violet-900/60 text-violet-300 border-violet-700/50",
  schema: "bg-cyan-900/60  text-cyan-300  border-cyan-700/50",
  plan: "bg-amber-900/60 text-amber-300  border-amber-700/50",
  build: "bg-blue-900/60  text-blue-300   border-blue-700/50",
  done: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  error: "bg-red-900/60   text-red-300    border-red-700/50",
};

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "Idle",
  "model-load": "Model Load",
  schema: "Schema",
  plan: "Planning",
  build: "Building",
  done: "Done",
  error: "Error",
};

const EVENT_COLOR: Record<string, string> = {
  RUN_STARTED: "text-emerald-400",
  STEP_STARTED: "text-cyan-400",
  STEP_FINISHED: "text-blue-400",
  TOOL_CALL_START: "text-amber-400",
  TOOL_CALL_END: "text-amber-300",
  TEXT_MESSAGE_CONTENT: "text-slate-400",
  INTERRUPT: "text-rose-400",
  RUN_FINISHED: "text-emerald-300",
  RUN_ERROR: "text-red-400",
  STATE_SNAPSHOT: "text-violet-400",
};

interface Props {
  onReset?: () => void;
}

export function TopBar({ onReset }: Props) {
  // Shallow-scoped selector: the ticker must update on events, but unrelated
  // store churn (thoughts/widgets arrays) should not re-render the whole header.
  const { phase, model, threadId, eventTicker, tokenCount, toolCallCnt, startTime, running } =
    useAgentStore(
      useShallowSelector((s) => ({
        phase: s.phase,
        model: s.model,
        threadId: s.threadId,
        eventTicker: s.eventTicker,
        tokenCount: s.tokenCount,
        toolCallCnt: s.toolCallCnt,
        startTime: s.startTime,
        running: s.running,
      })),
    );
  const tickerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll ticker
  // biome-ignore lint/correctness/useExhaustiveDependencies: eventTicker.length is the intended trigger to re-scroll the ticker when a new event arrives
  useEffect(() => {
    if (tickerRef.current) {
      tickerRef.current.scrollLeft = tickerRef.current.scrollWidth;
    }
  }, [eventTicker.length]);

  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const latestEvents = eventTicker.slice(-12);
  const modelShort = model.split("/").pop() ?? model;

  return (
    <header className="h-10 shrink-0 bg-slate-950 border-b border-slate-800 flex items-center gap-3 px-4 overflow-hidden z-40">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Brain className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <span className="text-xs font-bold text-white hidden sm:block">Agent Canvas</span>
      </div>

      {/* Thread ID */}
      {threadId && (
        <div className="flex items-center gap-1 text-[10px] text-slate-600 shrink-0">
          <Hash className="w-2.5 h-2.5" />
          <span className="font-mono">{threadId.slice(-8)}</span>
        </div>
      )}

      {/* Phase badge */}
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0",
          PHASE_COLOR[phase],
        )}
      >
        {running && (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
          </span>
        )}
        {PHASE_LABEL[phase]}
      </div>

      {/* Model */}
      <div className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
        <Cpu className="w-2.5 h-2.5" />
        <span>{modelShort}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-slate-800 shrink-0" />

      {/* AG-UI Event Ticker */}
      <div
        ref={tickerRef}
        className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-none min-w-0"
        style={{ scrollbarWidth: "none" }}
      >
        <AnimatePresence initial={false}>
          {latestEvents.map((ev, i) => (
            <motion.div
              key={`${ev.messageId}-${i}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{
                opacity: i === latestEvents.length - 1 ? 1 : 0.4,
                x: 0,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "shrink-0 text-[10px] font-mono whitespace-nowrap",
                EVENT_COLOR[ev.type] ?? "text-slate-600",
              )}
            >
              {ev.type === "TEXT_MESSAGE_CONTENT"
                ? `▸ ${(ev as { delta: string }).delta?.slice(0, 40) ?? ""}`
                : ev.type === "STEP_STARTED"
                  ? `⬡ ${(ev as { nodeName: string }).nodeName}`
                  : ev.type === "TOOL_CALL_START"
                    ? `⚙ ${(ev as { toolName: string }).toolName}`
                    : ev.type === "INTERRUPT"
                      ? `⏸ ${(ev as { reason: string }).reason}`
                      : ev.type}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Right stats */}
      <div className="flex items-center gap-3 shrink-0 text-[10px] text-slate-500">
        <Activity className="w-2.5 h-2.5" />
        {startTime && <span className="tabular-nums">⏱ {elapsed}s</span>}
        {tokenCount > 0 && <span>✦ {tokenCount.toLocaleString()} tok</span>}
        {toolCallCnt > 0 && <span>⚙ {toolCallCnt}</span>}
      </div>

      {/* Reset */}
      {onReset && (
        <button
          onClick={onReset}
          type="button"
          className="shrink-0 text-[10px] text-slate-600 hover:text-slate-300 transition-colors px-2 py-1 rounded border border-transparent hover:border-slate-700"
        >
          ↺ reset
        </button>
      )}
    </header>
  );
}
