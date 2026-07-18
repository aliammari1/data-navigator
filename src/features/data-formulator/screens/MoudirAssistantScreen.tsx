// FACTS (GateGuard): importers — src/app/dashboard/moudir/page.tsx (dashboard
//   <main> child); the desktop app-registry gains an assistant entry (owned by
//   another agent). API/data — reads useSwarmStore (phase/result/navigation/reset),
//   useDataStore (datasets/activeDatasetId), useFormulatorStore (selectedModel);
//   runs the swarm via runSwarm/cancelActiveSwarm and resolves the active dataset's
//   view via runReadOnlyQuery for the SwarmContext. Reads/writes NO data files.
//   Layout — the standalone conversational Moudir assistant, extracted from
//   MoudirSwarmScreen: header (Moudir identity · model chip · "Nouveau" reset);
//   CENTER a scrollable <SwarmConsole/> (idle intro, live agent lanes, streamed
//   answer, hero result card + artifacts); RIGHT rail = run-history threads
//   (screen-local, re-ask on select) above the live <KpiPanel/>; <MoudirComposer/>
//   spans the bottom — the composer is the ONLY input (no fields/encoding shelf).
//   Command bus: useAppCommands("moudir-chat", {reset,cancel,ask}); window event
//   "moudir:ask" is owned here. Design: shadcn tokens only in THIS file (the two
//   inherited violations — hardcoded #17a2c9 controlButton, MOUDIR.gold dataError —
//   are fixed with border/ring/destructive tokens). "use client". French-first.
//   Offline at runtime.
"use client";

/**
 * Moudir — the standalone assistant.
 *
 * A conversation with a sharp, offline analyst. You ask; an orchestrator-worker
 * swarm plans, queries, charts, verifies, and Moudir answers with substance.
 * AI-only: the planner LLM decides the work — no rule-based routing, no loading
 * theater. The formulator workspace (fields / encoding shelf / chart canvas)
 * lives in FormulatorScreen; here the composer is the only way in.
 */

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { isTelecomDataset } from "@/features/telecom/lib/dataset-detection";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as TelecomTypes from "@/features/telecom/types";
import { DEFAULT_GGUF_MODEL } from "@/platform/ai/models/model-manifest";
import {
  listRegisteredDatasets,
  type RegisteredDataset,
  runReadOnlyQuery,
} from "@/platform/duckdb/duckdb";
import { cn } from "@/shared/utils";
import { KpiPanel } from "../components/moudir/canvas/kpi-panel";
import { MoudirComposer } from "../components/moudir/moudir-composer";
import { Kicker, MoudirBackdrop, MoudirMark, Pill } from "../components/moudir/moudir-kit";
import { SwarmConsole } from "../components/moudir/swarm/swarm-console";
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

const DATASET_SAMPLE_LIMIT = 2000;
const ROW_SAMPLE_SIZE = 8;

// Stable empty reference — see the canalRule comment where `telecom` is built.
const EMPTY_TELECOM_CANAL_MAPPING: TelecomTypes.CanalRule[] = [];

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

// ─── Run history (screen-local threads) ──────────────────────────────────────

/** One completed run the user can revisit (re-ask on select). */
interface AssistantThread {
  id: string;
  prompt: string;
  headline?: string;
  confidence?: "high" | "medium" | "low";
  createdAt: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const CONFIDENCE_LABEL: Record<NonNullable<AssistantThread["confidence"]>, string> = {
  high: "Confiance élevée",
  medium: "Confiance moyenne",
  low: "Confiance faible",
};
const CONFIDENCE_TONE: Record<
  NonNullable<AssistantThread["confidence"]>,
  "green" | "gold" | "rose"
> = {
  high: "green",
  medium: "gold",
  low: "rose",
};

/** French relative time: "à l'instant" / "il y a Xm" / "il y a Xh". */
function relativeTime(createdAt: number, now: number): string {
  const elapsed = Math.max(0, now - createdAt);
  if (elapsed < MINUTE_MS) return "à l'instant";
  if (elapsed < HOUR_MS) return `il y a ${Math.floor(elapsed / MINUTE_MS)}m`;
  return `il y a ${Math.floor(elapsed / HOUR_MS)}h`;
}

/**
 * The run-history rail. Compact, most-recent-first, shadcn tokens only —
 * selecting a thread re-asks Moudir with its prompt.
 */
function ThreadRail({
  threads,
  activeId,
  onSelect,
  className,
}: {
  threads: AssistantThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const now = Date.now();
  const ordered = [...threads].sort((a, b) => b.createdAt - a.createdAt);

  if (ordered.length === 0) {
    return (
      <section className={cn("flex items-center gap-2.5", className)}>
        <Kicker className="shrink-0">Conversations</Kicker>
        <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-ai/50" />
        <p className="truncate text-[11px] leading-none text-muted-foreground">
          Vos questions apparaîtront ici.
        </p>
      </section>
    );
  }

  return (
    <section className={cn("flex min-h-0 flex-col gap-2.5", className)}>
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <Kicker>Conversations</Kicker>
        <span className="text-[11px] tabular-nums text-muted-foreground">{ordered.length}</span>
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {ordered.map((thread) => {
          const active = thread.id === activeId;
          const tone = thread.confidence ? CONFIDENCE_TONE[thread.confidence] : null;
          const label = thread.confidence ? CONFIDENCE_LABEL[thread.confidence] : null;
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelect(thread.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "block w-full shrink-0 rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.985]",
                active
                  ? "border-ai/45 bg-ai/10"
                  : "border-border bg-card/60 hover:border-ai/30 hover:bg-card",
              )}
            >
              <p
                className={cn(
                  "line-clamp-2 text-[13px] leading-snug text-foreground",
                  active ? "font-semibold" : "font-medium",
                )}
              >
                {thread.prompt}
              </p>
              {thread.headline ? (
                <p className="mt-1 truncate text-[11px] leading-relaxed text-muted-foreground">
                  {thread.headline}
                </p>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-2">
                {tone && label ? (
                  <Pill tone={tone} className="px-2 py-0.5 text-[10px]">
                    {label}
                  </Pill>
                ) : (
                  <span aria-hidden className="text-[10px] text-muted-foreground/60">
                    —
                  </span>
                )}
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {relativeTime(thread.createdAt, now)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MoudirAssistantScreen() {
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const storeDatasets = useDataStore((state) => state.datasets);
  const setActiveDataset = useDataStore((state) => state.setActiveDataset);
  const replaceDatasetsFromCatalog = useDataStore((state) => state.replaceDatasetsFromCatalog);
  const activeStoreDataset =
    storeDatasets.find((dataset) => dataset.id === activeDatasetId) ?? null;

  const selectedModel = useFormulatorStore((state) => state.selectedModel);
  // The swarm runs on the offline llamacpp lane (GGUF). Use a GGUF id; if the
  // formulator's selected model isn't one, default to the canonical model.
  const model = selectedModel.endsWith(".gguf") ? selectedModel : DEFAULT_GGUF_MODEL;

  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [tableName, setTableName] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // ── Live telecom KPIs for the right <KpiPanel/> ──
  // The panel is a pure view; it never queries DuckDB. We self-wire
  // useTelecomAnalytics here: feed it the resolved view name + DEFAULT_MAPPING
  // and surface the read-only result. Gated on the active dataset actually being
  // a telecom report — otherwise the panel degrades gracefully (cards show "—")
  // and we never run telecom SQL on arbitrary datasets.
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
    // This panel is a read-only KPI view, not the full report page — no
    // blocking-dialog UI here to resolve unclassified canal combos, so leave
    // canalRule empty and no-op the callback. Those combos still count
    // toward the panel's total KPI; they're excluded from its canal
    // breakdown until resolved on the full report page.
    canalRule: EMPTY_TELECOM_CANAL_MAPPING,
    loaded: isTelecom && Boolean(tableName),
    firstLoad: telecomFirstLoad,
    fileNameRef: telecomFileNameRef,
    onStatusMappingAdditions: onTelecomStatusAdditions,
    onUnclassifiedCanalCombos: () => {},
  });

  const [value, setValue] = useState("");
  const phase = useSwarmStore((state) => state.phase);
  const swarmResult = useSwarmStore((state) => state.result);
  const resetSwarm = useSwarmStore((state) => state.reset);
  const navigation = useSwarmStore((state) => state.navigation);
  const setNavigation = useSwarmStore((state) => state.setNavigation);
  const router = useRouter();
  const running = phase !== "idle" && phase !== "done" && phase !== "failed";

  // Run history: each completed swarm run becomes a thread the user can revisit.
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  // The prompt currently being run — used both to label the resulting thread and
  // to guard against appending the same run twice as the store settles.
  const runningPromptRef = useRef<string>("");
  const lastRecordedPromptRef = useRef<string>("");

  // Agentic-OS: when the planner resolves a navigation command, Moudir drives
  // the app there. Consume the navigation channel and route.
  useEffect(() => {
    if (!navigation) return;
    const { path } = navigation;
    setNavigation(null);
    router.push(path);
  }, [navigation, router, setNavigation]);

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
          `SELECT * FROM ${quoteIdentifier(viewName)} LIMIT ${DATASET_SAMPLE_LIMIT}`,
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
        rowSample: rows.slice(0, ROW_SAMPLE_SIZE),
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
    const thread: AssistantThread = {
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

  // Agentic handoff: the desktop dispatches `moudir:ask` to delegate a data
  // question to the assistant. We listen here so opening Moudir + asking is one step.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      const prompt = detail?.prompt?.trim();
      if (prompt) onAsk(prompt);
    };
    window.addEventListener("moudir:ask", handler as EventListener);
    return () => window.removeEventListener("moudir:ask", handler as EventListener);
  }, [onAsk]);

  // A full reset clears the swarm AND the local conversation history.
  const onReset = useCallback(() => {
    resetSwarm();
    setThreads([]);
    setActiveThreadId(null);
    runningPromptRef.current = "";
    lastRecordedPromptRef.current = "";
  }, [resetSwarm]);

  // Menu bar bridge: the desktop's assistant menu drives the screen's existing
  // handlers over the app-command bus (handlers are read live, no memo needed).
  const menuWindowId = useWindowId();
  useAppCommands(
    "moudir-chat",
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
  // the quantization tail so "gemma-4-e4b-it-q4_k_m.gguf" reads as a name.
  const modelLabel = model
    .replace(/\.gguf$/i, "")
    .replace(/-q\d.*$/i, "")
    .replace(/[-_]/g, " ")
    .trim();

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background text-foreground">
      <MoudirBackdrop lit={running} />

      {/* Header — Moudir identity + active model + "Nouveau" reset. */}
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
          {/* New conversation — also clears the thread history. */}
          {(phase !== "idle" || threads.length > 0) && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-[11px] text-muted-foreground backdrop-blur transition-colors hover:border-ring/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]"
            >
              <RotateCcw className="h-3 w-3" />
              Nouveau
            </button>
          )}
        </div>
      </header>

      {/* The conversation — CENTER: the scrollable swarm console (idle intro,
          live agent lanes, streamed answer, hero result card + artifacts).
          RIGHT: the run-history threads above the always-on live <KpiPanel/>.
          Both flow vertically below lg. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <SwarmConsole onFollowUp={onAsk} suggestions={SUGGESTIONS} />
        </div>

        {/* Right rail — conversations above the live KPI panel. */}
        <aside className="flex max-h-[44%] min-h-0 w-full shrink-0 flex-col gap-2.5 overflow-hidden border-t border-border/60 p-2.5 lg:max-h-none lg:w-[368px] lg:border-l lg:border-t-0 xl:w-[408px]">
          <ThreadRail
            threads={threads}
            activeId={activeThreadId}
            onSelect={onSelectThread}
            className="max-h-[42%] shrink-0"
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <KpiPanel
              kpi={telecom.kpi}
              hourly={telecom.hourly}
              canals={telecom.canals}
              statusData={telecom.statusData}
              result={phase === "done" ? swarmResult : null}
              onFollowUp={onAsk}
            />
          </div>
        </aside>
      </div>

      {/* Composer — the only way to talk to Moudir. */}
      <div className="relative z-10 shrink-0 border-t border-border/60 bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-3 pt-3 md:px-4">
        <div className="mx-auto max-w-3xl">
          {dataError && (
            <p className="mb-2 text-center text-[12px] text-destructive">{dataError}</p>
          )}
          <MoudirComposer
            disabled={dataLoading || !!dataError}
            running={running}
            value={value}
            onChange={setValue}
            onSubmit={() => submit(value)}
            onPick={onAsk}
            onCancel={cancelActiveSwarm}
          />
        </div>
      </div>
    </div>
  );
}
