// FACTS (GateGuard): importers — this IS the screen (dashboard <main> child),
//   imported by the data-formulator feature registry. API/data — reads useSwarmStore
//   (phase/result/navigation/reset), useDataStore (datasets/activeDatasetId),
//   useFormulatorStore (selectedModel), runs the swarm via runSwarm/cancelActiveSwarm,
//   and resolves the active dataset's view via runReadOnlyQuery for the SwarmContext.
//   Reads/writes NO data files. Layout — rewritten into a Microsoft Data Formulator
//   workspace: a contained flex column inside the dashboard <main> (never absolute
//   inset-0). Header (Moudir identity · model chip · "Nouveau" reset); a three-zone
//   body — LEFT <FieldsPanel/> rail (draggable dataset concept chips), CENTER stack
//   of <EncodingShelf/> (drag-to-channels, onFormulate → submit) over <ChartCanvas/>
//   (renders the done-run chart), RIGHT rail of <DataThreads/> (run history, re-ask
//   on select) above the live <KpiPanel/> (real telecom KPIs); <MoudirComposer/>
//   spans the bottom. NEW imports: FieldsPanel, EncodingShelf (+ Encoding type),
//   ChartCanvas, DataThreads (+ DataThread type) from ../components/moudir/formulator/*.
//   PRESERVED: dataset-load effect, useTelecomAnalytics wiring, useMoudirVoice,
//   runSwarm/cancelActiveSwarm, navigation effect, "moudir:ask" listener, model
//   resolution, dataError handling. "use client". French-first. Offline at runtime.
//   QUALITY PASS: SUGGESTIONS array now natural French (was English); dataError
//   messages French; dead vertical space killed (composer wrapper pb-6/pt-8 +
//   max-w-3xl -> compact pt-3/pb-3 + max-w-5xl with a top hairline); rails tightened
//   to p-2.5/gap-2.5 (narrower lg widths); KPI surface de-doubled — this file's KPI
//   wrapper no longer paints its own glass (the panel owns the surface), and the
//   right rail uses overflow-hidden + min-h-0 so <KpiPanel/> owns its own scroll and
//   rises to fill while <DataThreads/> stays slim; dataError color via MOUDIR.gold.
//   user-instruction: "still ... a lot of issues stiillll ... code a lot and token
//   max yourself in making things better"
"use client";

/**
 * Moudir — the agentic data workspace, in a Microsoft Data Formulator shape.
 *
 * A conversation with a sharp, offline analyst. You ask (or drag dataset concepts
 * onto the encoding shelf and "Formuler"); an orchestrator-worker swarm plans,
 * queries, charts, verifies, and Moudir answers with substance. AI-only: the
 * planner LLM decides the work — no rule-based routing.
 *
 * Layout (Data Formulator): a contained flex column inside the dashboard <main>
 * (below the global topbar — never `absolute inset-0`). Header on top
 * (Moudir identity · model · "Nouveau"); a three-zone workspace beneath it —
 * a LEFT <FieldsPanel/> rail (the dataset's columns as draggable concept chips),
 * a CENTER column with the <EncodingShelf/> pinned on top of a <ChartCanvas/>
 * stage (the formulated/answered chart), and a RIGHT rail with the run-history
 * <DataThreads/> above the always-on live <KpiPanel/>. The <MoudirComposer/>
 * spans the bottom as the natural-language "formuler" box. Warm glass over
 * <MoudirBackdrop/>.
 */

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { isTelecomDataset } from "@/features/telecom/lib/dataset-detection";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as TelecomTypes from "@/features/telecom/types";
import {
  listRegisteredDatasets,
  type RegisteredDataset,
  runReadOnlyQuery,
} from "@/platform/duckdb/duckdb";
import { cn } from "@/shared/utils";
import { KpiPanel } from "../components/moudir/canvas/kpi-panel";
import { ChartCanvas } from "../components/moudir/formulator/chart-canvas";
import { type DataThread, DataThreads } from "../components/moudir/formulator/data-threads";
import { type Encoding, EncodingShelf } from "../components/moudir/formulator/encoding-shelf";
import { FieldsPanel } from "../components/moudir/formulator/fields-panel";
import { MoudirComposer } from "../components/moudir/moudir-composer";
import { Kicker, MOUDIR, MoudirBackdrop, MoudirMark } from "../components/moudir/moudir-kit";
import { useMoudirVoice } from "../components/moudir/use-moudir-voice";
import { inferType } from "../core/helpers";
import { sanitizeJsonValue } from "../core/json";
import { cancelActiveSwarm, runSwarm } from "../core/swarm/orchestrator";
import type { SwarmContext } from "../core/swarm/types";
import type { ColumnInfo } from "../core/types";
import { useFormulatorStore } from "../store";
import { useSwarmStore } from "../store/swarm-store";

const SUGGESTIONS = [
  "Pourquoi le taux de réussite a-t-il changé ?",
  "Quels sont les plus gros risques dans ces données ?",
  "Montre les transactions par canal au fil du temps",
  "Donne-moi une synthèse exécutive en un paragraphe",
];

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function datasetColumnsToColumnInfo(dataset: RegisteredDataset): ColumnInfo[] {
  return dataset.columns.map((column) => ({
    name: column.name,
    type: inferType(column.type),
    dbType: column.type,
  }));
}

function resolveActiveDataset(
  catalog: RegisteredDataset[],
  activeDatasetId: string | null,
  activeViewName: string | null,
): RegisteredDataset | null {
  if (activeDatasetId) {
    const byId = catalog.find((dataset) => dataset.id === activeDatasetId);
    if (byId) return byId;
  }
  if (activeViewName) {
    const byView = catalog.find(
      (dataset) => dataset.viewName === activeViewName || dataset.displayName === activeViewName,
    );
    if (byView) return byView;
  }
  return catalog[0] ?? null;
}

export default function MoudirSwarmScreen() {
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const storeDatasets = useDataStore((state) => state.datasets);
  const setActiveDataset = useDataStore((state) => state.setActiveDataset);
  const replaceDatasetsFromCatalog = useDataStore((state) => state.replaceDatasetsFromCatalog);
  const activeStoreDataset =
    storeDatasets.find((dataset) => dataset.id === activeDatasetId) ?? null;

  const selectedModel = useFormulatorStore((state) => state.selectedModel);
  // The swarm runs on the offline llamacpp lane (GGUF). Use a GGUF id; if the
  // formulator's selected model isn't one, default to the installed 1.5B.
  const model = selectedModel.endsWith(".gguf")
    ? selectedModel
    : "qwen2.5-1.5b-instruct-q4_k_m.gguf";

  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [tableName, setTableName] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // ── Live telecom KPIs for the right <KpiPanel/> (spec §3.1 integration seam) ──
  // The panel is a pure view; it never queries DuckDB. We self-wire
  // useTelecomAnalytics here exactly like useWidgetTelecomData: feed it the
  // resolved view name + DEFAULT_MAPPING and surface the read-only result. Gated
  // on the active dataset actually being a telecom report — otherwise the panel
  // degrades gracefully (cards show "—") and we never run telecom SQL on
  // arbitrary datasets.
  const isTelecom = activeStoreDataset ? isTelecomDataset(activeStoreDataset) : false;
  const telecomFirstLoad = useRef(true);
  const telecomFileNameRef = useRef("");
  const telecomTableRef = useRef("");
  const [telecomStatusMapping, setTelecomStatusMapping] = useState<TelecomTypes.StatusMapping[]>(
    [],
  );
  // Keep the refs in sync with the resolved dataset before the analytics hook reads them.
  telecomTableRef.current = isTelecom ? tableName : "";
  telecomFileNameRef.current = datasetName;
  const getTelecomTableName = useCallback(() => telecomTableRef.current, []);
  const onTelecomStatusAdditions = useCallback(
    (additions: TelecomTypes.StatusMapping[]) =>
      setTelecomStatusMapping((prev) => [...prev, ...additions]),
    [],
  );
  const telecom = useTelecomAnalytics({
    getTableName: getTelecomTableName,
    mapping: DEFAULT_MAPPING,
    statusMapping: telecomStatusMapping,
    loaded: isTelecom && Boolean(tableName),
    firstLoad: telecomFirstLoad,
    fileNameRef: telecomFileNameRef,
    onStatusMappingAdditions: onTelecomStatusAdditions,
  });

  const [value, setValue] = useState("");
  const phase = useSwarmStore((state) => state.phase);
  const swarmResult = useSwarmStore((state) => state.result);
  const resetSwarm = useSwarmStore((state) => state.reset);
  const navigation = useSwarmStore((state) => state.navigation);
  const setNavigation = useSwarmStore((state) => state.setNavigation);
  const router = useRouter();
  const running = phase !== "idle" && phase !== "done" && phase !== "failed";

  // ── Data Formulator workspace state ──
  // The encoding shelf is the visual builder (drag fields → x/y/color, pick a
  // mark); "Formuler" turns it into a French prompt and runs the swarm.
  const [encoding, setEncoding] = useState<Encoding>({ mark: "bar" });
  // Run history: each completed swarm run becomes a thread the user can revisit.
  const [threads, setThreads] = useState<DataThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  // The prompt currently being run — used both to label the resulting thread and
  // to guard against appending the same run twice as the store settles.
  const runningPromptRef = useRef<string>("");
  const lastRecordedPromptRef = useRef<string>("");

  const fieldNames = useMemo(() => columns.map((column) => column.name), [columns]);
  const hasEncoding = Boolean(encoding.x || encoding.y || encoding.color);

  // Agentic-OS: when the planner resolves a navigation command, Moudir drives
  // the app there. Consume the navigation channel and route.
  useEffect(() => {
    if (!navigation) return;
    const { path } = navigation;
    setNavigation(null);
    router.push(path);
  }, [navigation, router, setNavigation]);

  // Offline voice: capture → transcript fills the composer (no auto-submit);
  // and a speaker button on the answer reads it aloud. The screen owns the hook.
  const voice = useMoudirVoice();
  const {
    supported: voiceSupported,
    listening: voiceListening,
    error: voiceError,
    start: voiceStart,
    stop: voiceStop,
    retry: voiceRetry,
    onTranscript: voiceOnTranscript,
  } = voice;

  useEffect(() => {
    // A final transcript drops into the text box; the user decides when to send.
    voiceOnTranscript((text) => {
      setValue((prev) => {
        const trimmed = text.trim();
        if (!trimmed) return prev;
        return prev.trim() ? `${prev.trim()} ${trimmed}` : trimmed;
      });
    });
  }, [voiceOnTranscript]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDataLoading(true);
      setDataError(null);
      try {
        const catalog = await listRegisteredDatasets();
        if (cancelled) return;
        replaceDatasetsFromCatalog(catalog);
        const selected = resolveActiveDataset(
          catalog,
          activeDatasetId,
          activeStoreDataset?.viewName ?? activeStoreDataset?.tableName ?? null,
        );
        if (!selected) {
          setDatasetId(null);
          setColumns([]);
          setRows([]);
          setDataError(
            "Aucun jeu de données chargé. Importez un fichier CSV, Parquet ou un rapport télécom, puis revenez.",
          );
          return;
        }
        if (selected.id !== activeDatasetId) setActiveDataset(selected.id);
        const viewName = selected.viewName;
        const normalizedColumns = datasetColumnsToColumnInfo(selected);
        const result = await runReadOnlyQuery(
          `SELECT * FROM ${quoteIdentifier(viewName)} LIMIT 2000`,
        );
        if (cancelled) return;
        // A fresh dataset → let the analytics hook re-discover status codes.
        telecomFirstLoad.current = true;
        setDatasetId(selected.id);
        setDatasetName(selected.displayName);
        setTableName(viewName);
        setRowCount(selected.rowCount);
        setColumns(normalizedColumns);
        setRows(sanitizeJsonValue(result) as Record<string, unknown>[]);
      } catch (error) {
        if (cancelled) return;
        setDataError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setDataLoading(false);
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

  const submit = useCallback(
    async (raw: string) => {
      const prompt = raw.trim();
      if (!prompt || running) return;
      if (!columns.length || !tableName || !datasetId) {
        const store = useSwarmStore.getState();
        store.begin(prompt, Date.now());
        store.fail(
          "Aucun jeu de données chargé. Importez des données d'abord, puis redemandez-moi.",
          Date.now(),
        );
        return;
      }
      const ctx: SwarmContext = {
        datasetId,
        datasetName,
        tableName,
        columns,
        rowSample: rows.slice(0, 8),
        rowCount,
        model,
      };
      // Remember which prompt this run carries so we can label the resulting
      // thread once the swarm settles into "done".
      runningPromptRef.current = prompt;
      setValue("");
      try {
        await runSwarm(ctx, prompt);
      } catch {
        /* the store records the failure */
      }
    },
    [columns, datasetId, datasetName, model, rowCount, rows, running, tableName],
  );

  const onAsk = useCallback(
    (query: string) => {
      setValue(query);
      void submit(query);
    },
    [submit],
  );

  // When a run completes, fold it into the thread history exactly once (the
  // store may re-render several times while "done"). We key the guard on the
  // prompt+result identity so a genuinely new run still records.
  useEffect(() => {
    if (phase !== "done" || !swarmResult) return;
    const prompt = runningPromptRef.current.trim();
    if (!prompt) return;
    const signature = `${prompt}::${swarmResult.headline ?? ""}`;
    if (lastRecordedPromptRef.current === signature) return;
    lastRecordedPromptRef.current = signature;
    const thread: DataThread = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `thread-${Date.now()}`,
      prompt,
      headline: swarmResult.headline,
      confidence: swarmResult.confidence,
      createdAt: Date.now(),
    };
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
  }, [phase, swarmResult]);

  const onSelectThread = useCallback(
    (id: string) => {
      setActiveThreadId(id);
      const thread = threads.find((entry) => entry.id === id);
      if (thread) onAsk(thread.prompt);
    },
    [threads, onAsk],
  );

  // The encoding shelf hands back a finished French sentence; we mirror it into
  // the composer and run it through the existing submit() flow.
  const onFormulate = useCallback(
    (prompt: string) => {
      setValue(prompt);
      void submit(prompt);
    },
    [submit],
  );

  // Agentic handoff: the AI Commander dispatches `moudir:ask` to delegate a data
  // question to the swarm. We listen here so opening Moudir + asking is one step.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      const prompt = detail?.prompt?.trim();
      if (prompt) onAsk(prompt);
    };
    window.addEventListener("moudir:ask", handler as EventListener);
    return () => window.removeEventListener("moudir:ask", handler as EventListener);
  }, [onAsk]);

  // A full reset clears the swarm AND the local workspace (shelf + threads).
  const onReset = useCallback(() => {
    resetSwarm();
    setEncoding({ mark: "bar" });
    setThreads([]);
    setActiveThreadId(null);
    runningPromptRef.current = "";
    lastRecordedPromptRef.current = "";
  }, [resetSwarm]);

  // Menu bar bridge: the desktop's "Moudir" menu drives the screen's existing
  // handlers over the app-command bus (handlers are read live, no memo needed).
  const menuWindowId = useWindowId();
  useAppCommands(
    "moudir",
    {
      reset: () => onReset(),
      cancel: () => cancelActiveSwarm(),
      ask: (payload) => {
        const prompt = (payload as { prompt?: string } | undefined)?.prompt?.trim();
        if (prompt) onAsk(prompt);
      },
    },
    { windowId: menuWindowId },
  );

  // The active model, humanized for the header chip: strip the .gguf suffix and
  // the quantization tail so "qwen2.5-1.5b-instruct-q4_k_m.gguf" reads as a name.
  const modelLabel = model
    .replace(/\.gguf$/i, "")
    .replace(/-q\d.*$/i, "")
    .replace(/[-_]/g, " ")
    .trim();

  // The reset control button: warm glass, theme-aware, cyan on hover.
  const controlButton = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17a2c9]/50 active:scale-[0.98]",
      active
        ? "border-[#17a2c9]/45 bg-[#17a2c9]/10 text-[#17a2c9] hover:border-[#17a2c9]/65"
        : "border-border bg-[var(--glass-bg)] text-muted-foreground hover:border-[#17a2c9]/40 hover:text-foreground",
    );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background text-foreground">
      <MoudirBackdrop lit={running} />

      {/* Header — Moudir identity + active model + "Nouveau" reset.
          A quiet warm-glass bar that sits below the global topbar (inside <main>). */}
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 md:px-8">
        <div className="flex items-center gap-2.5">
          <MoudirMark size={30} thinking={running} />
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold tracking-tight text-foreground">Moudir</span>
            <Kicker tone="muted" className="text-[9px]">
              Analyste · {modelLabel}
            </Kicker>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* New conversation — also clears the shelf + thread history. */}
          {(phase !== "idle" || threads.length > 0 || hasEncoding) && (
            <button type="button" onClick={onReset} className={controlButton(false)}>
              <RotateCcw className="h-3 w-3" />
              Nouveau
            </button>
          )}
        </div>
      </header>

      {/* The workspace — a Microsoft Data Formulator three-zone body. LEFT: the
          <FieldsPanel/> rail (the dataset's columns as draggable concept chips).
          CENTER: the <EncodingShelf/> pinned on top of the <ChartCanvas/> stage —
          drag fields onto channels and "Formuler", or read the answered chart.
          RIGHT: the run-history <DataThreads/> above the always-on live
          <KpiPanel/> (real telecom KPIs). All three flow vertically below lg. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Fields rail — draggable dataset concepts. Self-contained glass card;
            we only control its width here. Scrolls internally. */}
        <aside className="flex max-h-[34%] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-border/60 p-2.5 lg:max-h-none lg:w-[288px] lg:border-b-0 lg:border-r xl:w-[312px]">
          <FieldsPanel
            columns={columns}
            datasetName={datasetName}
            rowCount={rowCount}
            activeFields={[encoding.x, encoding.y, encoding.color].filter(
              (field): field is string => Boolean(field),
            )}
            className="h-full"
          />
        </aside>

        {/* Center column — the encoding shelf pinned on top, the chart canvas
            filling the rest. min-h-0/min-w-0 so the canvas can shrink/scroll. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 p-2.5">
          <EncodingShelf
            encoding={encoding}
            onChange={setEncoding}
            onFormulate={onFormulate}
            running={running}
            fields={fieldNames}
          />
          <div className="min-h-0 flex-1">
            <ChartCanvas
              result={phase === "done" ? swarmResult : null}
              running={running}
              hasEncoding={hasEncoding}
              className="h-full"
            />
          </div>
        </div>

        {/* Right rail — run-history threads above the always-on live KPI panel.
            Warm glass, scrollable, fed REAL data from the self-wired analytics. */}
        <aside className="flex max-h-[44%] min-h-0 w-full shrink-0 flex-col gap-2.5 overflow-hidden border-t border-border/60 p-2.5 lg:max-h-none lg:w-[368px] lg:border-l lg:border-t-0 xl:w-[408px]">
          <DataThreads
            threads={threads}
            activeId={activeThreadId}
            onSelect={onSelectThread}
            className="shrink-0"
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <KpiPanel
              kpi={telecom.kpi}
              hourly={telecom.hourly}
              canals={telecom.canals}
              statusData={telecom.statusData}
              forecast={telecom.forecast}
              result={phase === "done" ? swarmResult : null}
              onFollowUp={onAsk}
            />
          </div>
        </aside>
      </div>

      {/* Composer — the natural-language "formuler" box. */}
      <div className="relative z-10 shrink-0 border-t border-border/60 bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-3 pt-3 md:px-4">
        <div className="mx-auto max-w-5xl">
          {dataError && (
            <p className="mb-2 text-center text-[12px]" style={{ color: MOUDIR.gold }}>
              {dataError}
            </p>
          )}
          <MoudirComposer
            disabled={dataLoading || !!dataError}
            running={running}
            value={value}
            onChange={setValue}
            onSubmit={() => submit(value)}
            onPick={onAsk}
            onCancel={cancelActiveSwarm}
            suggestions={SUGGESTIONS}
            voice={{
              supported: voiceSupported,
              listening: voiceListening,
              error: voiceError,
              onToggle: () => {
                if (voiceListening) {
                  void voiceStop();
                } else {
                  void voiceStart();
                }
              },
              onRetry: () => {
                void voiceRetry();
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
