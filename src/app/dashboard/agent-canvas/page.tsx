"use client";
/**
 * Agent Canvas v3 — A2UI Ultra IDE-class 4-panel layout.
 *
 * Layout:
 * ┌─ TOPBAR ───────────────────────────────────────────────────────┐
 * ├─ Panel A: CANVAS ──┬─ Panel B: SQL IDE ──┬─ Panel C: AGENT+NARR┤
 * │  react-grid-layout  │  Monaco + DuckDB    │  @xyflow DAG +     │
 * │  CopilotKit target  │  PrimeReact table   │  narrative + trace  │
 * └─────────────────────┴─────────────────────┴────────────────────┘
 *
 * Stack: LangGraph StateGraph · AG-UI events · Zustand+Immer ·
 *        Yjs CRDT · TF.js ML worker · all nivo/echarts/visx charts
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ResizablePanelGroup as PanelGroup,
  ResizablePanel as Panel,
  ResizableHandle as PanelResizeHandle,
} from "@/components/ui/resizable";
import { motion, AnimatePresence } from "motion/react";
import { LayoutDashboard, Code2, GitBranch, FileText } from "lucide-react";

import { useAgentStore } from "@/lib/stores/agent-store";
import {
  publishEvent,
  buildTraceTree,
  getEventLog,
  clearEventLog,
} from "@/lib/agent-canvas/event-bus";
import { makeCtx, makeEvent } from "@/lib/agent-canvas/ag-ui-types";
import { runPipelineV3 } from "@/lib/agent-canvas/langgraph-pipeline-v3";
import type {
  WidgetState,
  AgentThought,
  DashboardPlan,
} from "@/lib/agent-canvas/types";

// ─── Dynamic imports (client-only heavy) ────────────────────────────────────

const SetupScreen = dynamic(
  () =>
    import("@/components/agent-canvas/v3/SetupScreen").then((m) => ({
      default: m.SetupScreen,
    })),
  { ssr: false },
);
const TopBar = dynamic(
  () =>
    import("@/components/agent-canvas/v3/TopBar").then((m) => ({
      default: m.TopBar,
    })),
  { ssr: false },
);
const CanvasV3 = dynamic(
  () =>
    import("@/components/agent-canvas/v3/CanvasV3").then((m) => ({
      default: m.CanvasV3,
    })),
  { ssr: false },
);
const SqlIde = dynamic(
  () =>
    import("@/components/agent-canvas/v3/SqlIde").then((m) => ({
      default: m.SqlIde,
    })),
  { ssr: false },
);
const AgentFlowGraph = dynamic(
  () =>
    import("@/components/agent-canvas/v3/AgentFlowGraph").then((m) => ({
      default: m.AgentFlowGraph,
    })),
  { ssr: false },
);
const NarrativePanel = dynamic(
  () =>
    import("@/components/agent-canvas/v3/NarrativePanel").then((m) => ({
      default: m.NarrativePanel,
    })),
  { ssr: false },
);

// ─── Panel toggle button ─────────────────────────────────────────────────────

function PanelToggle({
  label,
  icon,
  visible,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border transition-colors ${
        visible
          ? "border-slate-600 bg-slate-800 text-white"
          : "border-transparent text-slate-600 hover:text-slate-400"
      }`}
      title={`${visible ? "Hide" : "Show"} ${label}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── Build status bar ────────────────────────────────────────────────────────

function BuildStatus() {
  const { phase, widgets, running, plan } = useAgentStore();
  const done = widgets.filter((w) => w.status === "done").length;
  const total = widgets.length;

  if (phase === "idle" || phase === "error") return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900/90 border-b border-slate-800 text-[10px] shrink-0">
      {running && (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      )}
      <span className="text-slate-400">{plan?.title ?? "Building…"}</span>
      {total > 0 && (
        <>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">
            {done}/{total} widgets
          </span>
          <div className="flex-1 max-w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgentCanvasPage() {
  const store = useAgentStore();
  const pipelineRef = useRef<{
    threadId: string;
    resume: (
      decision: "approve" | "revise",
      plan?: DashboardPlan,
    ) => Promise<void>;
  } | null>(null);

  const [showSql, setShowSql] = useState(true);
  const [showGraph, setShowGraph] = useState(true);
  const [showNarrative, setShowNarrative] = useState(true);

  // ── Pipeline callbacks ────────────────────────────────────────────────────

  const handleWidget = useCallback(
    (w: WidgetState) => {
      store.upsertWidget(w);
      if (w.status === "done" || w.status === "error") {
        const log = getEventLog();
        store.setTraceRoots(buildTraceTree(log));
      }
    },
    [store],
  );

  const handleThought = useCallback(
    (t: AgentThought) => {
      store.addThought(t);
    },
    [store],
  );

  const handlePlan = useCallback(
    (p: DashboardPlan) => {
      store.setPlan(p);
      store.setPhase("build");
      // Seed widgets as pending
      for (const spec of p.widgets) {
        store.upsertWidget({ spec, status: "pending" });
      }
    },
    [store],
  );

  const handleNarrative = useCallback(
    (n: string) => {
      store.setNarrative(n);
    },
    [store],
  );

  const handleInterrupt = useCallback(
    (reason: string, payload: unknown) => {
      store.setInterrupt({
        active: true,
        reason,
        payload,
        resolve: (decision, edits) => {
          if (pipelineRef.current) {
            pipelineRef.current.resume(
              decision,
              decision === "revise" ? (edits as DashboardPlan) : undefined,
            );
          }
        },
      });
    },
    [store],
  );

  const handleDone = useCallback(() => {
    store.setPhase("done");
    store.setRunning(false);
    store.setStep("done");
    const log = getEventLog();
    store.setTraceRoots(buildTraceTree(log));
  }, [store]);

  // ── Start pipeline ────────────────────────────────────────────────────────

  const startPipeline = useCallback(
    async (tableName: string) => {
      clearEventLog();
      store.setRunning(true);
      store.setPhase("schema");

      const ctx = makeCtx(store.model);
      store.setThreadId(ctx.threadId);
      publishEvent(
        makeEvent(ctx, {
          type: "RUN_STARTED",
          model: store.model,
          input: { tableName },
        }),
      );

      // Set up flow nodes
      store.setFlowNodes([
        { id: "schema", label: "Schema", status: "running", type: "schema" },
        {
          id: "react_sql_loop",
          label: "ReAct SQL",
          status: "idle",
          type: "react",
        },
        { id: "planner", label: "Planner", status: "idle", type: "plan" },
        {
          id: "human_interrupt",
          label: "Review",
          status: "idle",
          type: "gate",
        },
        { id: "critique", label: "Critique", status: "idle", type: "critique" },
        { id: "revise", label: "Revise", status: "idle", type: "plan" },
        { id: "sql_fan_out", label: "SQL Fan", status: "idle", type: "sql" },
        { id: "narrator", label: "Narrator", status: "idle", type: "narrate" },
      ]);

      try {
        const handle = await runPipelineV3({
          tableName,
          model: store.model,
          onWidget: handleWidget,
          onThought: handleThought,
          onPlan: handlePlan,
          onNarrative: handleNarrative,
          onInterrupt: handleInterrupt,
          onDone: handleDone,
        });
        pipelineRef.current = handle;
      } catch (err) {
        store.setError(String(err));
        store.setRunning(false);
        store.setPhase("error");
      }
    },
    [
      store,
      handleWidget,
      handleThought,
      handlePlan,
      handleNarrative,
      handleInterrupt,
      handleDone,
    ],
  );

  // ── File / demo loaded ────────────────────────────────────────────────────

  const handleReady = useCallback(
    (tableName: string, fileName: string) => {
      store.setTableName(tableName, fileName);
      store.setStep("build");
      startPipeline(tableName);
    },
    [store, startPipeline],
  );

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    pipelineRef.current = null;
    store.reset();
    clearEventLog();
  }, [store]);

  // Subscribe to AG-UI events → push to store ticker
  useEffect(() => {
    const { subscribeEvents } = require("@/lib/agent-canvas/event-bus");
    return subscribeEvents(store.pushEvent);
  }, [store]);

  const isSetup = store.step === "setup";

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
      <AnimatePresence mode="wait">
        {isSetup ? (
          <motion.div
            key="setup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3 }}
            className="flex-1 min-h-0 overflow-auto"
          >
            <SetupScreen
              onReady={handleReady}
              model={store.model}
              onModelChange={store.setModel}
            />
          </motion.div>
        ) : (
          <motion.div
            key="ide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            {/* Top bar */}
            <TopBar onReset={handleReset} />

            {/* Panel visibility toggles + build status */}
            <div className="flex items-center justify-between px-3 py-1 bg-slate-950 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-1">
                <PanelToggle
                  label="SQL IDE"
                  icon={<Code2 className="w-3 h-3" />}
                  visible={showSql}
                  onToggle={() => setShowSql((v) => !v)}
                />
                <PanelToggle
                  label="Graph"
                  icon={<GitBranch className="w-3 h-3" />}
                  visible={showGraph}
                  onToggle={() => setShowGraph((v) => !v)}
                />
                <PanelToggle
                  label="Narrative"
                  icon={<FileText className="w-3 h-3" />}
                  visible={showNarrative}
                  onToggle={() => setShowNarrative((v) => !v)}
                />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-600">
                {store.fileName && <span>{store.fileName}</span>}
                {store.widgets.length > 0 && (
                  <span>{store.widgets.length} widgets</span>
                )}
              </div>
            </div>

            <BuildStatus />

            {/* 4-panel IDE layout */}
            <div className="flex-1 min-h-0">
              <PanelGroup orientation="horizontal" className="h-full">
                {/* Panel A: Widget Canvas */}
                <Panel
                  defaultSize={showSql || showGraph ? 45 : 100}
                  minSize={20}
                >
                  <div className="h-full flex flex-col border-r border-slate-800">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 shrink-0">
                      <LayoutDashboard className="w-3 h-3 text-violet-400" />
                      <span className="text-[10px] font-semibold text-slate-400">
                        Canvas
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <CanvasV3 />
                    </div>
                  </div>
                </Panel>

                {/* Panel B: SQL IDE */}
                {showSql && (
                  <>
                    <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-violet-700/60 transition-colors cursor-col-resize" />
                    <Panel defaultSize={30} minSize={15}>
                      <div className="h-full flex flex-col border-r border-slate-800">
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 shrink-0">
                          <Code2 className="w-3 h-3 text-cyan-400" />
                          <span className="text-[10px] font-semibold text-slate-400">
                            SQL IDE
                          </span>
                        </div>
                        <div className="flex-1 min-h-0 overflow-hidden">
                          <SqlIde />
                        </div>
                      </div>
                    </Panel>
                  </>
                )}

                {/* Panel C+D: Agent Graph + Narrative */}
                {(showGraph || showNarrative) && (
                  <>
                    <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-violet-700/60 transition-colors cursor-col-resize" />
                    <Panel defaultSize={25} minSize={15}>
                      <div className="h-full">
                        {showGraph && showNarrative ? (
                          <PanelGroup orientation="vertical">
                            <Panel defaultSize={55} minSize={20}>
                              <div className="h-full flex flex-col border-b border-slate-800">
                                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 shrink-0">
                                  <GitBranch className="w-3 h-3 text-amber-400" />
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    Agent Graph
                                  </span>
                                </div>
                                <div className="flex-1 min-h-0 overflow-hidden">
                                  <AgentFlowGraph />
                                </div>
                              </div>
                            </Panel>
                            <PanelResizeHandle className="h-1 bg-slate-800 hover:bg-violet-700/60 transition-colors cursor-row-resize" />
                            <Panel defaultSize={45} minSize={20}>
                              <div className="h-full flex flex-col">
                                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 shrink-0">
                                  <FileText className="w-3 h-3 text-emerald-400" />
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    Narrative
                                  </span>
                                </div>
                                <div className="flex-1 min-h-0 overflow-hidden">
                                  <NarrativePanel />
                                </div>
                              </div>
                            </Panel>
                          </PanelGroup>
                        ) : showGraph ? (
                          <div className="h-full flex flex-col">
                            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 shrink-0">
                              <GitBranch className="w-3 h-3 text-amber-400" />
                              <span className="text-[10px] font-semibold text-slate-400">
                                Agent Graph
                              </span>
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden">
                              <AgentFlowGraph />
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col">
                            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 shrink-0">
                              <FileText className="w-3 h-3 text-emerald-400" />
                              <span className="text-[10px] font-semibold text-slate-400">
                                Narrative
                              </span>
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden">
                              <NarrativePanel />
                            </div>
                          </div>
                        )}
                      </div>
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
