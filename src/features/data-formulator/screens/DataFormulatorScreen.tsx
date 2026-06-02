"use client";

/**
 * Data Workbench — Main Screen
 *
 * Fixed for the new Electron + DuckDB dataset catalog model:
 * - No legacy TELECOM_TABLE_BASE default.
 * - No listTables(), getTableInfo(), or unrestricted runQuery().
 * - Resolves the active dataset from app_datasets through listRegisteredDatasets().
 * - Uses dataset.viewName as the DuckDB SQL target.
 * - Uses only runReadOnlyQuery() from the renderer.
 * - Synchronizes catalog datasets back into Zustand.
 */

import {
  Activity,
  BarChart3,
  Database,
  FileText,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  Radar,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { AgentStatusPill } from "@/features/data-formulator/components/agent-status-pill";
import { AttachWidgetDialog } from "@/features/data-formulator/components/attach-widget-dialog";
import { Canvas } from "@/features/data-formulator/components/canvas";
import { CommandBar } from "@/features/data-formulator/components/command-bar";
import { ExecutiveBriefPanel } from "@/features/data-formulator/components/executive-brief-panel";
import { InspectorPanel } from "@/features/data-formulator/components/inspector-panel";
import { IntentRail } from "@/features/data-formulator/components/intent-rail";
import { KpiFoundryPanel } from "@/features/data-formulator/components/kpi-foundry-panel";
import { LanguageModeSelector } from "@/features/data-formulator/components/language-mode-selector";
import { ManagerAnswerPanel } from "@/features/data-formulator/components/manager-answer-panel";
import { McpConnectionModal } from "@/features/data-formulator/components/mcp-connection-modal";
import { ModelReadinessCenter } from "@/features/data-formulator/components/model-readiness-center";
import { ModelSelector } from "@/features/data-formulator/components/model-selector";
import { RootCauseLadder } from "@/features/data-formulator/components/root-cause-ladder";
import { ScenarioSimulator } from "@/features/data-formulator/components/scenario-simulator";
import { SignalRadar } from "@/features/data-formulator/components/signal-radar";
import {
  type AiGateResult,
  checkAiGate,
  isAiReady,
} from "@/features/data-formulator/core/ai-gate";
import {
  type DashboardSpec,
  generateDashboard,
} from "@/features/data-formulator/core/auto-dashboard";
import {
  type BriefingResult,
  runBriefingAgent,
} from "@/features/data-formulator/core/briefing-agent";
import { inferType } from "@/features/data-formulator/core/helpers";
import {
  type InvestigationResult,
  runInvestigation,
} from "@/features/data-formulator/core/investigation-agent";
import { sanitizeJsonValue } from "@/features/data-formulator/core/json";
import { useKpiCatalogStore } from "@/features/data-formulator/core/kpi/kpi-catalog-store";
import {
  classifyManagerIntent,
  type ManagerIntent,
  normalizeTunisianPrompt,
} from "@/features/data-formulator/core/language/intent";
import { generateManagerAnswer } from "@/features/data-formulator/core/manager-ai";
import {
  aiGateAnswer,
  createManagerAnswer,
  smallTalkAnswer,
} from "@/features/data-formulator/core/manager-answer";
import {
  runScenarioAgent,
  type ScenarioResult,
} from "@/features/data-formulator/core/scenario-agent";
import {
  runSignalRadar,
  type SignalRadarResult,
} from "@/features/data-formulator/core/signal-radar-agent";
import type { ColumnInfo } from "@/features/data-formulator/core/types";
import { useVectorSearch } from "@/features/data-formulator/core/vector-search";
import { useFormulatorStore } from "@/features/data-formulator/store";
import { useWorkbenchStore } from "@/features/data-formulator/store/workbench-store";
import {
  listRegisteredDatasets,
  type RegisteredDataset,
  runReadOnlyQuery,
} from "@/platform/duckdb/duckdb";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function isSmallTalk(prompt: string): boolean {
  const text = prompt.trim().toLowerCase();

  return /^(hi|hello|hey|yo|salam|bonjour|bonsoir|thanks|thank you)[!. ]*$/.test(
    text,
  );
}

function datasetColumnsToColumnInfo(dataset: RegisteredDataset): ColumnInfo[] {
  return dataset.columns.map((column) => ({
    name: column.name,
    type: inferType(column.type),
    dbType: column.type,
  }));
}

function schemaFromColumns(columns: ColumnInfo[]): string {
  return columns.map((column) => `${column.name} ${column.dbType}`).join(", ");
}

function resolveActiveDataset(
  catalog: RegisteredDataset[],
  activeDatasetId: string | null,
  activeStoreViewName: string | null,
): RegisteredDataset | null {
  if (activeDatasetId) {
    const byId = catalog.find((dataset) => dataset.id === activeDatasetId);
    if (byId) return byId;
  }

  if (activeStoreViewName) {
    const byView = catalog.find(
      (dataset) =>
        dataset.viewName === activeStoreViewName ||
        dataset.displayName === activeStoreViewName,
    );
    if (byView) return byView;
  }

  return catalog[0] ?? null;
}

function StarterPanel({
  disabled,
  onRun,
  onAutoDashboard,
}: {
  disabled: boolean;
  onRun: (query: string, mode: "agent" | "semantic") => void;
  onAutoDashboard: () => void;
}) {
  const actions = [
    {
      title: "Generate dashboard",
      description: "Create KPI, chart, and insight cards from this dataset.",
      icon: Wand2,
      accent: "text-amber-300 bg-amber-500/10 border-amber-500/20",
      onClick: onAutoDashboard,
    },
    {
      title: "Find anomalies",
      description: "Scan for outliers, failed values, and unusual segments.",
      icon: Activity,
      accent: "text-rose-300 bg-rose-500/10 border-rose-500/20",
      onClick: () =>
        onRun(
          "Find anomalies, outliers, missing values, and unusual patterns",
          "agent",
        ),
    },
    {
      title: "Create trend chart",
      description: "Build the best time-series or comparison visual available.",
      icon: BarChart3,
      accent: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
      onClick: () =>
        onRun(
          "Create the most useful trend chart and explain what it shows",
          "agent",
        ),
    },
    {
      title: "Semantic row search",
      description: "Find rows by meaning instead of exact text matching.",
      icon: Search,
      accent: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
      onClick: () =>
        onRun(
          "high value or suspicious transactions worth investigating",
          "semantic",
        ),
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6 pb-28 pt-20">
      <div className="pointer-events-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-background/80 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
          <Sparkles className="h-5 w-5 text-emerald-300" />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">
            Start shaping this dataset
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Ask for charts, dashboards, anomalies, transformations, or row
            search. Results become movable cards on this canvas.
          </p>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {actions.map((action) => (
            <button
              key={action.title}
              type="button"
              disabled={disabled}
              onClick={action.onClick}
              className="group rounded-2xl border border-white/10 bg-white/3 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/6 disabled:pointer-events-none disabled:opacity-50"
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-xl border p-2 ${action.accent}`}>
                  <action.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {action.title}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {action.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorkbenchScreen() {
  // ── Global dataset state ───────────────────────────────────────────────────
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const storeDatasets = useDataStore((state) => state.datasets);
  const setActiveDataset = useDataStore((state) => state.setActiveDataset);
  const replaceDatasetsFromCatalog = useDataStore(
    (state) => state.replaceDatasetsFromCatalog,
  );

  const activeStoreDataset =
    storeDatasets.find((dataset) => dataset.id === activeDatasetId) ?? null;

  // ── Data ───────────────────────────────────────────────────────────────────
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [tableName, setTableName] = useState("");
  const [datasetRowCount, setDatasetRowCount] = useState(0);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [schema, setSchema] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [attachCardId, setAttachCardId] = useState<string | null>(null);
  const [manualIntent, setManualIntent] = useState<ManagerIntent | null>(null);

  // ── Workbench Store ────────────────────────────────────────────────────────
  const addCard = useWorkbenchStore((state) => state.addCard);
  const clearCanvas = useWorkbenchStore((state) => state.clearCanvas);
  const setAgentRunning = useWorkbenchStore((state) => state.setAgentRunning);
  const setAgentTrace = useWorkbenchStore((state) => state.setAgentTrace);
  const setAgentStatusText = useWorkbenchStore(
    (state) => state.setAgentStatusText,
  );
  const managerAnswer = useWorkbenchStore((state) => state.managerAnswer);
  const setManagerAnswer = useWorkbenchStore((state) => state.setManagerAnswer);
  const activeIntent = useWorkbenchStore((state) => state.activeIntent);
  const setActiveIntent = useWorkbenchStore((state) => state.setActiveIntent);
  const addHistoryNode = useWorkbenchStore((state) => state.addHistoryNode);
  const attachCard = useWorkbenchStore((state) =>
    state.cards.find((card) => card.id === attachCardId),
  );
  const cardCount = useWorkbenchStore((state) => state.cards.length);

  const selectedModel = useFormulatorStore((state) => state.selectedModel);
  const approvedKpis = useKpiCatalogStore((state) =>
    state.kpis.filter((kpi) => kpi.reviewStatus === "approved"),
  );

  const [aiGate, setAiGate] = useState<AiGateResult | null>(null);
  const [aiChecking, setAiChecking] = useState(false);

  // ── Agent Result State ─────────────────────────────────────────────────────
  const [signalResult, setSignalResult] = useState<SignalRadarResult | null>(
    null,
  );
  const [investigationResult, setInvestigationResult] =
    useState<InvestigationResult | null>(null);
  const [briefResult, setBriefResult] = useState<BriefingResult | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(
    null,
  );

  // ── Vector Search ──────────────────────────────────────────────────────────
  const {
    index: vectorIndex,
    buildIndex,
    search: vectorSearch,
  } = useVectorSearch();

  useEffect(() => {
    let cancelled = false;

    async function refreshAiGate() {
      setAiChecking(true);

      const gate = await checkAiGate({
        selectedModel,
      });

      if (!cancelled) {
        setAiGate(gate);
        setAiChecking(false);
      }
    }

    refreshAiGate();

    return () => {
      cancelled = true;
    };
  }, [selectedModel]);

  // ── Reconcile stale (0,0,0,0) cards persisted before the fix ───────────────
  const updateCardRef = useWorkbenchStore((state) => state.updateCard);

  useEffect(() => {
    const cards = useWorkbenchStore.getState().cards;
    const needsFix = cards.filter((card) => card.w === 0 || card.h === 0);

    if (needsFix.length === 0) return;

    const defaults: Record<string, { w: number; h: number }> = {
      chart: { w: 380, h: 280 },
      insight: { w: 320, h: 160 },
      table: { w: 400, h: 240 },
      reasoning: { w: 360, h: 200 },
      kpi: { w: 200, h: 140 },
      toolResult: { w: 340, h: 180 },
      operation: { w: 420, h: 260 },
    };

    let cursorX = 40;
    let cursorY = 40;
    let nextRowMaxY = 40;
    const screenW = 1200;
    const margin = 24;

    for (const card of cards) {
      if (card.w > 0 && card.h > 0) {
        cursorX = Math.max(cursorX, card.x + card.w + margin);
        nextRowMaxY = Math.max(nextRowMaxY, card.y + card.h + margin);

        if (cursorX > screenW) {
          cursorX = 40;
          cursorY = nextRowMaxY;
        }
      }
    }

    const updateStale = (index: number, list: typeof cards) => {
      if (index >= list.length) return;

      const card = list[index];

      if (card.w > 0 && card.h > 0) {
        updateStale(index + 1, list);
        return;
      }

      const size = defaults[card.type] ?? { w: 340, h: 180 };

      updateCardRef(card.id, {
        x: cursorX,
        y: cursorY,
        w: size.w,
        h: size.h,
      });

      cursorX += size.w + margin;

      if (cursorX > screenW) {
        cursorX = 40;
        cursorY += size.h + margin;
      }

      requestAnimationFrame(() => updateStale(index + 1, list));
    };

    requestAnimationFrame(() => updateStale(0, cards));
  }, [updateCardRef]);

  // ── Load active dataset from DuckDB catalog ────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setDataLoading(true);
      setDataError(null);

      try {
        const catalog = await listRegisteredDatasets();

        if (cancelled) return;

        replaceDatasetsFromCatalog(catalog);

        const selectedDataset = resolveActiveDataset(
          catalog,
          activeDatasetId,
          activeStoreDataset?.viewName ?? activeStoreDataset?.tableName ?? null,
        );

        if (!selectedDataset) {
          setDatasetId(null);
          setDatasetName("");
          setTableName("");
          setDatasetRowCount(0);
          setColumns([]);
          setRows([]);
          setSchema("");
          setDataError(
            "No DuckDB dataset is loaded yet. Import a CSV, TSV, TXT, Parquet file, or telecom report, then return to the workbench.",
          );
          return;
        }

        if (selectedDataset.id !== activeDatasetId) {
          setActiveDataset(selectedDataset.id);
        }

        const viewName = selectedDataset.viewName;
        const normalizedColumns = datasetColumnsToColumnInfo(selectedDataset);
        const schemaText = schemaFromColumns(normalizedColumns);

        const result = await runReadOnlyQuery(
          `SELECT * FROM ${quoteIdentifier(viewName)} LIMIT 2000`,
        );

        if (cancelled) return;

        setDatasetId(selectedDataset.id);
        setDatasetName(selectedDataset.displayName);
        setTableName(viewName);
        setDatasetRowCount(selectedDataset.rowCount);
        setColumns(normalizedColumns);
        setSchema(schemaText);
        setRows(sanitizeJsonValue(result) as Record<string, unknown>[]);
      } catch (error) {
        if (cancelled) return;

        setDatasetId(null);
        setDatasetName("");
        setTableName("");
        setDatasetRowCount(0);
        setColumns([]);
        setRows([]);
        setSchema("");
        setDataError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setDataLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    activeDatasetId,
    activeStoreDataset?.tableName,
    activeStoreDataset?.viewName,
    replaceDatasetsFromCatalog,
    setActiveDataset,
  ]);

  const ensureAiReady = useCallback(async () => {
    const gate = await checkAiGate({
      selectedModel,
    });

    setAiGate(gate);

    if (!isAiReady(gate)) {
      setActiveIntent("setup");
      setManagerAnswer(aiGateAnswer(gate));
      setAgentStatusText("");
      return null;
    }

    return gate;
  }, [selectedModel, setActiveIntent, setAgentStatusText, setManagerAnswer]);

  const addDashboardWidgets = useCallback(
    (spec: DashboardSpec, sourceQuery: string) => {
      let added = 0;

      for (const widget of spec.widgets.slice(0, 6)) {
        if (widget.type === "chart" && widget.chartSpec) {
          addCard({
            type: "chart",
            title: widget.title,
            chartSpec: widget.chartSpec,
            queryResult: widget.queryResult,
            sourceQuery,
            agentRole: "Moudir AI Dashboard",
            x: 0,
            y: 0,
            w: 0,
            h: 0,
          });
          added += 1;
        } else if (widget.type === "kpi" && widget.kpiValue) {
          addCard({
            type: "kpi",
            title: widget.title,
            kpiValue: widget.kpiValue.value,
            kpiLabel: widget.kpiValue.label,
            kpiDelta: widget.kpiValue.delta,
            sourceQuery,
            agentRole: "Moudir AI Dashboard",
            x: 0,
            y: 0,
            w: 0,
            h: 0,
          });
          added += 1;
        } else if (widget.type === "text" && widget.textContent) {
          addCard({
            type: "insight",
            title: widget.title,
            insightText: widget.textContent,
            insightSeverity: "low",
            sourceQuery,
            agentRole: "Moudir AI Dashboard",
            x: 0,
            y: 0,
            w: 0,
            h: 0,
          });
          added += 1;
        }
      }

      return added;
    },
    [addCard],
  );

  const handleIntentChange = useCallback(
    (intent: ManagerIntent) => {
      setManualIntent(intent);
      setActiveIntent(intent);
    },
    [setActiveIntent],
  );

  const generateDashboardFromPrompt = useCallback(
    async (prompt: string, model: string, host: string) => {
      const spec = await generateDashboard(
        {
          prompt,
          tableName,
          columns,
          schema,
          rowSample: rows.slice(0, 12),
          model,
          host,
          threadId: `dash_${Date.now()}`,
        },
        (trace) => setAgentTrace({ ...trace }),
      );

      const added = addDashboardWidgets(spec, prompt);
      return { spec, added };
    },
    [addDashboardWidgets, columns, rows, schema, setAgentTrace, tableName],
  );

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (query: string, mode: "agent" | "semantic") => {
      const normalizedQuery = normalizeTunisianPrompt(query);
      const detectedIntent = classifyManagerIntent(normalizedQuery || query);
      const intent = manualIntent ?? detectedIntent;

      setActiveIntent(intent);
      setManualIntent(null);

      if (!columns.length || !tableName || !datasetId) {
        setManagerAnswer(
          createManagerAnswer({
            intent: "setup",
            title: "Import data first",
            summary:
              "No active dataset is loaded. Import a CSV, Parquet file, or telecom report, then ask for a KPI, dashboard, investigation, signal scan, scenario, or brief.",
            assumptions: ["Moudir AI needs a loaded dataset before analysis."],
            evidence: [],
            followUps: ["Import a dataset", "Open a telecom report"],
            confidence: "high",
            status: "needs-input",
            language: "auto",
          }),
        );
        return;
      }

      if (isSmallTalk(query)) {
        setActiveIntent("ask");
        setManagerAnswer(smallTalkAnswer());
        return;
      }

      addHistoryNode(query);

      if (mode === "semantic") {
        setAgentRunning(true);
        setAgentStatusText("Building semantic index...");
        setManagerAnswer(
          createManagerAnswer({
            intent: "ask",
            title: "Semantic search",
            summary:
              "Searching rows by meaning and returning one focused result card.",
            assumptions: ["Semantic search uses the local indexed dataset."],
            evidence: [`Dataset: ${datasetName}`, `View: ${tableName}`],
            followUps: ["Open the result table", "Refine the search wording"],
            confidence: "medium",
            status: "running",
            language: "auto",
          }),
        );

        try {
          let idx = vectorIndex;

          if (!idx) {
            idx = await buildIndex(tableName, rows);
          }

          if (idx) {
            setAgentStatusText("Searching semantically...");
            const results = await vectorSearch(query, 10);

            if (results.length > 0) {
              addCard({
                type: "table",
                title: `Semantic: "${query.slice(0, 40)}"`,
                tableData: results.map((result) => result.row),
                sourceQuery: query,
                agentRole: "Semantic Search",
                x: 0,
                y: 0,
                w: 0,
                h: 0,
              });

              setManagerAnswer(
                createManagerAnswer({
                  intent: "ask",
                  title: "Semantic matches found",
                  summary: `I found ${results.length} matching row${
                    results.length === 1 ? "" : "s"
                  } and added one table card to the canvas.`,
                  assumptions: ["The result is based on local row embeddings."],
                  evidence: [
                    `Top match score: ${results[0]?.score.toFixed(2)}`,
                    `Dataset: ${datasetName}`,
                  ],
                  followUps: [
                    "Search a narrower segment",
                    "Ask Moudir AI to explain these rows",
                  ],
                  confidence: "medium",
                  status: "ready",
                  language: "auto",
                }),
              );
            } else {
              setManagerAnswer(
                createManagerAnswer({
                  intent: "ask",
                  title: "No semantic matches",
                  summary: `No rows matched "${query}". Try using business wording, a customer type, a product, or a risk pattern.`,
                  assumptions: ["The semantic index did not find close rows."],
                  evidence: [`Dataset: ${datasetName}`, `View: ${tableName}`],
                  followUps: ["Try fewer words", "Use a known column value"],
                  confidence: "medium",
                  status: "needs-input",
                  language: "auto",
                }),
              );
            }
          }
        } catch (error) {
          setManagerAnswer(
            createManagerAnswer({
              intent: "ask",
              title: "Semantic search failed",
              summary: error instanceof Error ? error.message : String(error),
              assumptions: ["The local search index could not complete."],
              evidence: [`Dataset: ${datasetName}`],
              followUps: ["Try normal AI chat", "Reload the dataset"],
              confidence: "high",
              status: "error",
              language: "auto",
            }),
          );
        } finally {
          setAgentRunning(false);
          setAgentStatusText("");
        }

        return;
      }

      const gate = await ensureAiReady();
      if (!gate) return;

      setAgentRunning(true);
      setAgentStatusText(
        intent === "dashboard"
          ? "Generating AI dashboard..."
          : "Running edge AI...",
      );

      setManagerAnswer(
        createManagerAnswer({
          intent,
          title:
            intent === "dashboard"
              ? "Generating AI dashboard"
              : "Moudir AI is thinking",
          summary:
            intent === "dashboard"
              ? "Edge AI is planning the dashboard layout, KPIs, charts, and narrative."
              : "Edge AI is reading your intent and preparing a manager-friendly answer.",
          assumptions: [`Model: ${gate.selectedModel}`],
          evidence: [
            `Dataset: ${datasetName}`,
            `View: ${tableName}`,
            `${columns.length} columns loaded`,
          ],
          followUps: [],
          confidence: "medium",
          status: "running",
          language: "auto",
        }),
      );

      try {
        if (intent === "dashboard") {
          const { spec, added } = await generateDashboardFromPrompt(
            normalizedQuery || query,
            gate.selectedModel,
            gate.host,
          );

          setManagerAnswer(
            createManagerAnswer({
              intent: "dashboard",
              title: spec.title,
              summary: `I created ${added} AI-designed dashboard card${
                added === 1 ? "" : "s"
              } on the canvas.`,
              assumptions: [`Model: ${spec.modelUsed}`],
              evidence: [
                `${spec.widgets.length} dashboard widgets returned`,
                `Trace: ${spec.traceId ?? "not available"}`,
              ],
              followUps: [
                "Ask why a metric moved",
                "Request a narrower executive dashboard",
                "Ask for KPI definitions",
              ],
              confidence: "medium",
              status: "ready",
              language: "auto",
            }),
          );
        } else if (intent === "signal") {
          const result = await runSignalRadar({
            tableName,
            columns,
            rowSample: rows.slice(0, 12),
            approvedKpis,
            model: gate.selectedModel,
            host: gate.host,
          });

          setSignalResult(result);

          setManagerAnswer(
            createManagerAnswer({
              intent: "signal",
              title: `Signal Radar: ${result.signals.length} signals detected`,
              summary:
                result.signals.length > 0
                  ? `Found ${result.signals.length} signal${
                      result.signals.length === 1 ? "" : "s"
                    } with overall confidence ${result.overallConfidence}.`
                  : "No significant signals detected in the current data.",
              assumptions: [`Model: ${gate.selectedModel}`],
              evidence: result.signals.map(
                (signal) =>
                  `${signal.severity}: ${signal.metric} — ${signal.whatChanged}`,
              ),
              followUps: [
                "Investigate the highest severity signal",
                "Run a deeper analysis",
                "Export findings",
              ],
              confidence: result.overallConfidence,
              status: result.error ? "error" : "ready",
              language: "auto",
            }),
          );
        } else if (intent === "investigate") {
          const result = await runInvestigation({
            prompt: query,
            normalizedPrompt: normalizedQuery,
            tableName,
            columns,
            rowSample: rows.slice(0, 12),
            model: gate.selectedModel,
            host: gate.host,
          });

          setInvestigationResult(result);

          setManagerAnswer(
            createManagerAnswer({
              intent: "investigate",
              title: `Investigation: ${result.targetMetric}`,
              summary: result.hypothesis || "Investigation complete.",
              assumptions: [`Model: ${gate.selectedModel}`],
              evidence: result.steps.map(
                (step) => `${step.dimension}: ${step.reason}`,
              ),
              followUps: [
                "Drill down into a specific dimension",
                "Compare with another period",
                "Create a KPI from this metric",
              ],
              confidence: result.confidence,
              status: result.error ? "error" : "ready",
              language: "auto",
            }),
          );
        } else if (intent === "brief") {
          const result = await runBriefingAgent({
            prompt: query,
            context: {
              tableName,
              columns,
              rowSample: rows.slice(0, 12),
              recentAnswer: managerAnswer?.summary,
              recentEvidence: managerAnswer?.evidence,
            },
            model: gate.selectedModel,
            host: gate.host,
          });

          setBriefResult(result);

          setManagerAnswer(
            createManagerAnswer({
              intent: "brief",
              title: result.title || "Executive Brief",
              summary: `Briefing for ${result.audience}. ${result.keyPoints.length} key points, ${result.recommendations.length} recommendations.`,
              assumptions: [
                `Model: ${gate.selectedModel}`,
                `Tone: ${result.tone}`,
              ],
              evidence: result.keyPoints,
              followUps: [
                "Export as Markdown",
                "Adjust tone",
                "Add more context",
              ],
              confidence: "high",
              status: result.error ? "error" : "ready",
              language: "auto",
            }),
          );
        } else if (intent === "scenario") {
          const result = await runScenarioAgent({
            prompt: query,
            tableName,
            columns,
            rowSample: rows.slice(0, 12),
            model: gate.selectedModel,
            host: gate.host,
          });

          setScenarioResult(result);

          setManagerAnswer(
            createManagerAnswer({
              intent: "scenario",
              title: `Scenario: ${result.name}`,
              summary: `Estimated impact on ${result.estimatedImpact.metric}: ${
                result.estimatedImpact.deltaPercent > 0 ? "+" : ""
              }${result.estimatedImpact.deltaPercent.toFixed(1)}%`,
              assumptions: result.assumptions.map(
                (assumption) => `${assumption.variable}: ${assumption.change}`,
              ),
              evidence: result.caveats,
              followUps: [
                "Run another scenario",
                "Save as decision note",
                "Investigate the base case",
              ],
              confidence: result.confidence,
              status: result.error ? "error" : "ready",
              language: "auto",
            }),
          );
        } else {
          const answer = await generateManagerAnswer({
            prompt: query,
            normalizedPrompt: normalizedQuery,
            intent,
            tableName,
            columns,
            rowSample: rows.slice(0, 12),
            model: gate.selectedModel,
            host: gate.host,
          });

          setManagerAnswer(answer);
        }

        setAgentStatusText("AI response complete");
      } catch (error) {
        setAgentStatusText("AI failed");

        setManagerAnswer(
          createManagerAnswer({
            intent,
            title: "AI request failed",
            summary: error instanceof Error ? error.message : String(error),
            assumptions: [`Model: ${gate.selectedModel}`],
            evidence: [`Host: ${gate.host}`],
            followUps: [
              "Check edge AI model readiness",
              "Try a smaller local model",
              "Make the request more specific",
            ],
            confidence: "high",
            status: "error",
            language: "auto",
          }),
        );
      } finally {
        setAgentRunning(false);
      }
    },
    [
      addCard,
      addHistoryNode,
      approvedKpis,
      buildIndex,
      columns,
      datasetId,
      datasetName,
      ensureAiReady,
      generateDashboardFromPrompt,
      managerAnswer,
      manualIntent,
      rows,
      setActiveIntent,
      setAgentRunning,
      setAgentStatusText,
      setBriefResult,
      setInvestigationResult,
      setManagerAnswer,
      setScenarioResult,
      setSignalResult,
      tableName,
      vectorIndex,
      vectorSearch,
    ],
  );

  // ── Auto Dashboard ─────────────────────────────────────────────────────────
  const handleAutoDashboard = useCallback(async () => {
    setActiveIntent("dashboard");
    setManualIntent(null);

    if (!columns.length || !tableName || !datasetId) {
      setManagerAnswer(
        createManagerAnswer({
          intent: "setup",
          title: "Import data first",
          summary: "AI Dashboard needs an active dataset before it can run.",
          assumptions: ["No columns are available in the workbench."],
          evidence: [],
          followUps: ["Import a dataset", "Open a telecom report"],
          confidence: "high",
          status: "needs-input",
          language: "auto",
        }),
      );
      return;
    }

    const gate = await ensureAiReady();
    if (!gate) return;

    setAgentRunning(true);
    setAgentStatusText("Generating AI dashboard...");

    setManagerAnswer(
      createManagerAnswer({
        intent: "dashboard",
        title: "Generating AI dashboard",
        summary:
          "Edge AI is planning a dashboard with the most useful KPI, chart, and narrative widgets.",
        assumptions: [`Model: ${gate.selectedModel}`],
        evidence: [
          `Dataset: ${datasetName}`,
          `View: ${tableName}`,
          `${columns.length} columns loaded`,
        ],
        followUps: [],
        confidence: "medium",
        status: "running",
        language: "auto",
      }),
    );

    try {
      const { spec, added } = await generateDashboardFromPrompt(
        `Create a comprehensive dashboard for ${datasetName || tableName}`,
        gate.selectedModel,
        gate.host,
      );

      setManagerAnswer(
        createManagerAnswer({
          intent: "dashboard",
          title: spec.title,
          summary: `I created ${added} AI-designed dashboard card${
            added === 1 ? "" : "s"
          } on the canvas.`,
          assumptions: [`Model: ${spec.modelUsed}`],
          evidence: [
            `${spec.widgets.length} dashboard widgets returned`,
            `Trace: ${spec.traceId ?? "not available"}`,
          ],
          followUps: [
            "Ask why a metric moved",
            "Request a narrower executive dashboard",
            "Ask for KPI definitions",
          ],
          confidence: "medium",
          status: "ready",
          language: "auto",
        }),
      );

      setAgentStatusText("Dashboard generated");
    } catch (error) {
      setAgentStatusText("Dashboard failed");

      setManagerAnswer(
        createManagerAnswer({
          intent: "dashboard",
          title: "AI dashboard failed",
          summary: error instanceof Error ? error.message : String(error),
          assumptions: [`Model: ${gate.selectedModel}`],
          evidence: [`Host: ${gate.host}`],
          followUps: [
            "Check edge AI model readiness",
            "Try a smaller local model",
            "Ask for a narrower dashboard",
          ],
          confidence: "high",
          status: "error",
          language: "auto",
        }),
      );
    } finally {
      setAgentRunning(false);
    }
  }, [
    columns,
    datasetId,
    datasetName,
    ensureAiReady,
    generateDashboardFromPrompt,
    tableName,
    setActiveIntent,
    setAgentRunning,
    setAgentStatusText,
    setManagerAnswer,
  ]);

  const aiReady = isAiReady(aiGate);
  const aiStatusLabel = aiChecking
    ? "Checking AI"
    : aiReady
      ? `AI ready: ${aiGate.selectedModel}`
      : (aiGate?.message ?? "AI setup required");

  // ── Side panel state ───────────────────────────────────────────────────────
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<
    | "inspector"
    | "kpi"
    | "radar"
    | "investigate"
    | "brief"
    | "scenario"
    | "model"
    | "language"
  >("inspector");

  const showTrace = useWorkbenchStore((state) => state.showTrace);
  const setShowTrace = useWorkbenchStore((state) => state.setShowTrace);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dn-page relative h-full min-h-full overflow-hidden">
      {/* Header */}
      <div className="dn-sticky-header absolute left-0 right-0 top-0 z-40 flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold text-foreground">
              Moudir AI
            </span>
          </div>

          <div className="hidden min-w-0 items-center gap-1.5 rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground sm:flex">
            <Database className="h-3 w-3" />

            <span
              className="max-w-40 truncate"
              title={datasetName || tableName || "No dataset"}
            >
              {datasetName || tableName || "No dataset"}
            </span>

            <span className="text-white/20">|</span>

            {dataLoading
              ? "Loading..."
              : `${datasetRowCount.toLocaleString()} rows`}

            {!dataLoading && (
              <>
                <span className="text-white/20">|</span>
                {columns.length.toLocaleString()} columns
                <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                  {dataError ? "Needs data" : "Ready"}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`hidden max-w-64 items-center gap-1.5 truncate rounded-lg border px-2.5 py-1.5 text-[11px] md:flex ${
              aiReady
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/20 bg-amber-500/10 text-amber-300"
            }`}
            title={aiStatusLabel}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                aiReady ? "bg-emerald-300" : "bg-amber-300"
              }`}
            />
            <span className="truncate">{aiStatusLabel}</span>
          </div>

          <ModelSelector />

          <button
            type="button"
            onClick={clearCanvas}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-all hover:bg-white/10"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="absolute inset-0 pt-11">
        <Canvas />
      </div>

      <div className="pointer-events-none absolute left-3 right-3 top-16 z-30 flex gap-3 md:left-4 md:right-80">
        <div className="pointer-events-auto hidden shrink-0 md:block">
          <IntentRail
            activeIntent={activeIntent}
            onIntentChange={handleIntentChange}
          />
        </div>

        <div className="pointer-events-auto min-w-0 flex-1 md:max-w-2xl">
          <div className="mb-3 md:hidden">
            <IntentRail
              activeIntent={activeIntent}
              onIntentChange={handleIntentChange}
            />
          </div>

          <ManagerAnswerPanel
            answer={managerAnswer}
            className="max-h-[38vh] overflow-auto"
            onFollowUp={(text) => handleSubmit(text, "agent")}
            onShowTrace={() => setShowTrace(!showTrace)}
            showTrace={showTrace}
          />
        </div>
      </div>

      {dataError && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6">
          <div className="max-w-lg rounded-2xl border border-amber-500/20 bg-background/90 p-5 text-center shadow-2xl backdrop-blur-xl">
            <div className="text-sm font-semibold text-amber-300">
              No active workbench dataset
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {dataError}
            </p>
          </div>
        </div>
      )}

      {!dataError && !dataLoading && cardCount === 0 && (
        <StarterPanel
          disabled={dataLoading || !!dataError}
          onRun={handleSubmit}
          onAutoDashboard={handleAutoDashboard}
        />
      )}

      {/* Command Bar */}
      <CommandBar
        onSubmit={handleSubmit}
        onAutoDashboard={handleAutoDashboard}
        disabled={dataLoading || !!dataError}
      />

      {/* Agent Status Pill */}
      <AgentStatusPill />

      {/* Right side panel with tabs */}
      <div className="fixed right-4 top-16 bottom-24 z-40 flex gap-2">
        {/* Tab rail */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => {
              setRightPanelTab("inspector");
              setRightPanelOpen(true);
            }}
            className={`rounded-lg p-2 transition-colors ${
              rightPanelTab === "inspector" && rightPanelOpen
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Inspector"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setRightPanelTab("kpi");
              setRightPanelOpen(true);
            }}
            className={`rounded-lg p-2 transition-colors ${
              rightPanelTab === "kpi" && rightPanelOpen
                ? "bg-amber-500/10 text-amber-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="KPI Foundry"
          >
            <BarChart3 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setRightPanelTab("radar");
              setRightPanelOpen(true);
            }}
            className={`rounded-lg p-2 transition-colors ${
              rightPanelTab === "radar" && rightPanelOpen
                ? "bg-rose-500/10 text-rose-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Signal Radar"
          >
            <Radar className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setRightPanelTab("investigate");
              setRightPanelOpen(true);
            }}
            className={`rounded-lg p-2 transition-colors ${
              rightPanelTab === "investigate" && rightPanelOpen
                ? "bg-orange-500/10 text-orange-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Investigations"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setRightPanelTab("scenario");
              setRightPanelOpen(true);
            }}
            className={`rounded-lg p-2 transition-colors ${
              rightPanelTab === "scenario" && rightPanelOpen
                ? "bg-emerald-500/10 text-emerald-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Scenarios"
          >
            <Activity className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setRightPanelTab("model");
              setRightPanelOpen(true);
            }}
            className={`rounded-lg p-2 transition-colors ${
              rightPanelTab === "model" && rightPanelOpen
                ? "bg-cyan-500/10 text-cyan-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Model Readiness"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setRightPanelTab("language");
              setRightPanelOpen(true);
            }}
            className={`rounded-lg p-2 transition-colors ${
              rightPanelTab === "language" && rightPanelOpen
                ? "bg-violet-500/10 text-violet-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Language"
          >
            <Globe className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setRightPanelTab("brief");
              setRightPanelOpen(true);
            }}
            className={`rounded-lg p-2 transition-colors ${
              rightPanelTab === "brief" && rightPanelOpen
                ? "bg-indigo-500/10 text-indigo-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Briefings"
          >
            <FileText className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="mt-auto rounded-lg p-2 text-muted-foreground hover:text-foreground"
            title={rightPanelOpen ? "Close panel" : "Open panel"}
          >
            {rightPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Panel content */}
        {rightPanelOpen && (
          <div className="w-80 overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f12]/95 shadow-2xl backdrop-blur-xl">
            {rightPanelTab === "inspector" && (
              <InspectorPanel onAttachChart={setAttachCardId} />
            )}

            {rightPanelTab === "kpi" && (
              <KpiFoundryPanel
                tableName={tableName}
                columns={columns}
                aiGate={aiGate}
              />
            )}

            {rightPanelTab === "radar" && (
              <SignalRadar
                signals={signalResult?.signals}
                onInvestigate={(signal) =>
                  handleSubmit(
                    `Investigate ${signal.metric}: ${signal.whatChanged}`,
                    "agent",
                  )
                }
              />
            )}

            {rightPanelTab === "investigate" &&
              (investigationResult ? (
                <RootCauseLadder
                  targetMetric={investigationResult.targetMetric}
                  steps={investigationResult.steps.map((step) => ({
                    dimension: step.dimension,
                    reason: step.reason,
                    sql: step.sql,
                    result: step.result?.map((row) => ({
                      segment: String(row[step.dimension] ?? ""),
                      value: Number(
                        row.value ?? row.current_value ?? row.delta ?? 0,
                      ),
                      percent: Number(row.percent ?? 0),
                    })),
                  }))}
                  hypothesis={investigationResult.hypothesis}
                  confidence={investigationResult.confidence}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    No investigation yet. Ask “Why did revenue drop?”
                  </p>
                </div>
              ))}

            {rightPanelTab === "brief" && (
              <ExecutiveBriefPanel
                brief={
                  briefResult
                    ? {
                        title: briefResult.title,
                        audience: briefResult.audience,
                        durationSeconds: briefResult.durationSeconds,
                        keyPoints: briefResult.keyPoints,
                        recommendations: briefResult.recommendations,
                        risks: briefResult.risks,
                        nextSteps: briefResult.nextSteps,
                        tone: briefResult.tone,
                      }
                    : undefined
                }
              />
            )}

            {rightPanelTab === "scenario" &&
              (scenarioResult ? (
                <ScenarioSimulator
                  name={scenarioResult.name}
                  assumptions={scenarioResult.assumptions}
                  impact={scenarioResult.estimatedImpact}
                  confidence={scenarioResult.confidence}
                  caveats={scenarioResult.caveats}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <Activity className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    No scenario yet. Ask “What if success rate improves by 2%?”
                  </p>
                </div>
              ))}

            {rightPanelTab === "model" && (
              <ModelReadinessCenter aiGate={aiGate} checking={aiChecking} />
            )}

            {rightPanelTab === "language" && <LanguageModeSelector />}
          </div>
        )}
      </div>

      {attachCard?.chartSpec && (
        <AttachWidgetDialog
          chartSpec={attachCard.chartSpec}
          result={attachCard.queryResult ?? null}
          tableName={tableName}
          open={attachCardId !== null}
          onClose={() => setAttachCardId(null)}
        />
      )}

      <McpConnectionModal />
    </div>
  );
}
