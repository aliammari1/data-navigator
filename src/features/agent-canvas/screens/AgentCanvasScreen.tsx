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

import { Code2, FileText, GitBranch, LayoutDashboard } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ResizablePanel as Panel,
  ResizablePanelGroup as PanelGroup,
  ResizableHandle as PanelResizeHandle,
} from "@/components/ui/resizable";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import { resetAI } from "@/features/agent-canvas/core/ai-bridge";
import {
  buildTraceTree,
  clearEventLog,
  getEventLog,
  subscribeEvents,
} from "@/features/agent-canvas/core/event-bus";
import { runPipeline } from "@/features/agent-canvas/core/pipeline";
import type { AgentThought, DashboardPlan, WidgetState } from "@/features/agent-canvas/core/types";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";

// ─── Dynamic imports (client-only heavy) ────────────────────────────────────

const SetupScreen = dynamic(
  () =>
    import("@/features/agent-canvas/components/SetupScreen").then((m) => ({
      default: m.SetupScreen,
    })),
  { ssr: false },
);
const TopBar = dynamic(
  () =>
    import("@/features/agent-canvas/components/TopBar").then((m) => ({
      default: m.TopBar,
    })),
  { ssr: false },
);
const Canvas = dynamic(
  () =>
    import("@/features/agent-canvas/components/Canvas").then((m) => ({
      default: m.Canvas,
    })),
  { ssr: false },
);

const AgentFlowGraph = dynamic(
  () =>
    import("@/features/agent-canvas/components/AgentFlowGraph").then((m) => ({
      default: m.AgentFlowGraph,
    })),
  { ssr: false },
);
const NarrativePanel = dynamic(
  () =>
    import("@/features/agent-canvas/components/NarrativePanel").then((m) => ({
      default: m.NarrativePanel,
    })),
  { ssr: false },
);
const SqlIdePanel = dynamic(
  () =>
    import("@/features/agent-canvas/components/SqlIdePanel").then((m) => ({
      default: m.SqlIdePanel,
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
  // Narrow selectors: this status bar should not re-render the whole IDE tree.
  const phase = useAgentStore((s) => s.phase);
  const widgets = useAgentStore((s) => s.widgets);
  const running = useAgentStore((s) => s.running);
  const planTitle = useAgentStore((s) => s.plan?.title);
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
      <span className="text-slate-400">{planTitle ?? "Building…"}</span>
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

export default function AgentCanvasScreen() {
  // Render-time reads use narrow selectors; mutations use the stable action
  // refs via getState() so callbacks don't re-create on every store change
  // (the previous `const store = useAgentStore()` re-rendered the whole IDE
  // shell on every one of the hundreds of per-run events).
  const step = useAgentStore((s) => s.step);
  const model = useAgentStore((s) => s.model);
  const fileName = useAgentStore((s) => s.fileName);
  const widgetCount = useAgentStore((s) => s.widgets.length);
  const setModel = useAgentStore((s) => s.setModel);
  const pushEvent = useAgentStore((s) => s.pushEvent);
  const pipelineRef = useRef<{
    threadId: string;
    resume: (decision: "approve" | "revise", plan?: DashboardPlan) => Promise<void>;
    dispose: () => void;
  } | null>(null);

  const [showSql, setShowSql] = useState(true);
  const [showGraph, setShowGraph] = useState(true);
  const [showNarrative, setShowNarrative] = useState(true);

  // ── Pipeline callbacks ────────────────────────────────────────────────────

  const handleWidget = useCallback((w: WidgetState) => {
    const s = useAgentStore.getState();
    s.upsertWidget(w);
    if (w.status === "done" || w.status === "error") {
      s.setTraceRoots(buildTraceTree(getEventLog()));
    }
  }, []);

  const handleThought = useCallback((t: AgentThought) => {
    useAgentStore.getState().addThought(t);
  }, []);

  const handlePlan = useCallback((p: DashboardPlan) => {
    const s = useAgentStore.getState();
    s.setPlan(p);
    s.setPhase("build");
    // Seed widgets as pending
    for (const spec of p.widgets) {
      s.upsertWidget({ spec, status: "pending" });
    }
  }, []);

  const handleNarrative = useCallback((n: string) => {
    useAgentStore.getState().setNarrative(n);
  }, []);

  const handleInterrupt = useCallback((reason: string, payload: unknown) => {
    useAgentStore.getState().setInterrupt({
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
  }, []);

  const handleDone = useCallback(() => {
    const s = useAgentStore.getState();
    s.setPhase("done");
    s.setRunning(false);
    s.setStep("done");
    s.setTraceRoots(buildTraceTree(getEventLog()));
  }, []);

  // ── Start pipeline ────────────────────────────────────────────────────────

  const startPipeline = useCallback(
    async (tableName: string) => {
      const s = useAgentStore.getState();
      clearEventLog();
      s.setRunning(true);
      s.setPhase("schema");

     const threadId = crypto.randomUUID();
     s.setThreadId(threadId);

      // Set up flow nodes
      s.setFlowNodes([
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
        const handle = await runPipeline({
          tableName,
          model: s.model,
          threadId,
          onWidget: handleWidget,
          onThought: handleThought,
          onPlan: handlePlan,
          onNarrative: handleNarrative,
          onInterrupt: handleInterrupt,
          onDone: handleDone,
          onError: (message) => {
            const st = useAgentStore.getState();
            st.setError(message);
            st.setRunning(false);
            st.setPhase("error");
          },
        });
        pipelineRef.current = handle;
      } catch (err) {
        const st = useAgentStore.getState();
        st.setError(String(err));
        st.setRunning(false);
        st.setPhase("error");
      }
    },
    [handleWidget, handleThought, handlePlan, handleNarrative, handleInterrupt, handleDone],
  );

  // ── File loaded ───────────────────────────────────────────────────────────

  const handleReady = useCallback(
    (tableName: string, fileName: string) => {
      const s = useAgentStore.getState();
      s.setTableName(tableName, fileName);
      s.setStep("build");
      startPipeline(tableName);
    },
    [startPipeline],
  );

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    pipelineRef.current?.dispose();
    pipelineRef.current = null;
    resetAI();
    useAgentStore.getState().reset();
    clearEventLog();
  }, []);

  // Subscribe to AG-UI events → push to store ticker (stable action ref).
  useEffect(() => subscribeEvents(pushEvent), [pushEvent]);

  // ── Desktop menu commands ───────────────────────────────────────────────────
  useAppCommands("agent-canvas", {
    reset: () => handleReset(),
    togglePanel: (payload) => {
      const panel = (payload as { panel?: string } | undefined)?.panel;
      if (panel === "sql") setShowSql((v) => !v);
      else if (panel === "graph") setShowGraph((v) => !v);
      else if (panel === "narrative") setShowNarrative((v) => !v);
    },
  });

  const isSetup = step === "setup";

  return (
    <div className=" flex h-full min-h-full flex-col overflow-hidden text-foreground">
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
            <SetupScreen onReady={handleReady} model={model} onModelChange={setModel} />
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
            <div className=" flex shrink-0 items-center justify-between px-3 py-1">
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
                {fileName && <span>{fileName}</span>}
                {widgetCount > 0 && <span>{widgetCount} widgets</span>}
              </div>
            </div>

            <BuildStatus />

            {/* 4-panel IDE layout */}
            <div className="flex-1 min-h-0">
              <PanelGroup orientation="horizontal" className="h-full">
                {/* Panel A: Widget Canvas */}
                <Panel defaultSize={showSql || showGraph ? 45 : 100} minSize={20}>
                  <div className="h-full flex flex-col border-r border-slate-800">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 shrink-0">
                      <LayoutDashboard className="w-3 h-3 text-violet-400" />
                      <span className="text-[10px] font-semibold text-slate-400">Canvas</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <Canvas />
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
                          <span className="text-[10px] font-semibold text-slate-400">SQL IDE</span>
                        </div>
                        <div className="flex-1 min-h-0 overflow-hidden">
                          <SqlIdePanel />
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
