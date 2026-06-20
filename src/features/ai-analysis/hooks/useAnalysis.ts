"use client";

// ─── useAnalysis ──────────────────────────────────────────────────────────────
//
// Owns the analysis lifecycle so the screen stays thin: table resolution, the
// off-main-thread worker run (SQL pushed down to DuckDB), deterministic
// rule-based insights rendered immediately, and OPTIONAL LLM narration applied
// asynchronously via the existing offline provider runtime.
//
// The hook never blocks the UI on the model: rule insights appear the instant
// the pipeline finishes; LLM-narrated insights replace them only if a provider
// is available and returns schema-valid JSON. Every failure degrades silently.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAI } from "@/platform/ai/provider";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { getColumnProfile, putColumnProfile } from "@/platform/storage";
import { LlmInsightResponseSchema } from "../model/insight-schema";
import { type AnalysisFacts, buildRuleInsights, narrateInsights } from "../model/narrate";
import { quoteIdent } from "../model/sql";
import type {
  AnalysisState,
  Anomaly,
  ClusterGroup,
  ColStat,
  Correlation,
  ForecastMeta,
  ForecastPoint,
  Insight,
} from "../model/types";
import { runAnalysis as runAnalysisWorker } from "../worker/client";
import { createAnalysisKernels } from "../worker/kernels";

// ─── Durable cache (Dexie columnProfiles) ─────────────────────────────────────
//
// Analyses are cached per dataset under a sentinel column key so re-opening the
// page is instant and works offline. The cache is invalidated when the row count
// changes (a proxy for "the table was reloaded / mutated").

const CACHE_COLUMN = "__ai_analysis__";

interface CachedAnalysis {
  version: 2;
  rowCount: number;
  colStats: ColStat[];
  anomalies: Anomaly[];
  correlations: Correlation[];
  forecasts: ForecastPoint[];
  clusters: ClusterGroup[];
  forecastMeta: ForecastMeta;
  insights: Insight[];
}

function cacheKey(tableName: string): string {
  // The dataset/table name is the stable identity for the column-profile row.
  return tableName;
}

function tableNameFromShowTables(row: Record<string, unknown>): string {
  return String(row.name ?? row.table_name ?? Object.values(row)[0] ?? "");
}

export interface UseAnalysisArgs {
  preferredTableName: string;
  numericCols: string[];
  catCols: string[];
  dateCols: string[];
  hasDataset: boolean;
}

export interface UseAnalysisResult {
  state: AnalysisState;
  tableLoaded: boolean;
  resolvedTableName: string;
  rowCount: number;
  colStats: ColStat[];
  anomalies: Anomaly[];
  correlations: Correlation[];
  forecasts: ForecastPoint[];
  clusters: ClusterGroup[];
  forecastMeta: ForecastMeta;
  insights: Insight[];
  /** Whether LLM narration is currently in flight (rule insights already shown). */
  narrating: boolean;
  /** True once an LLM successfully augmented the rule-based set. */
  narrated: boolean;
  /** Can the resolved provider generate text right now? (Drives the UI badge.) */
  aiAvailable: boolean;
  runAnalysis: () => Promise<void>;
  acknowledgeInsight: (id: string) => void;
}

const EMPTY_META: ForecastMeta = { metricCol: null, dateCol: null, method: "none" };

export function useAnalysis(args: UseAnalysisArgs): UseAnalysisResult {
  const { preferredTableName, numericCols, catCols, dateCols, hasDataset } = args;

  const [state, setState] = useState<AnalysisState>({
    status: "idle",
    progress: 0,
    stage: "",
  });
  const [resolvedTableName, setResolvedTableName] = useState("");
  const [tableLoaded, setTableLoaded] = useState(false);
  const [rowCount, setRowCount] = useState(0);

  const [colStats, setColStats] = useState<ColStat[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [forecasts, setForecasts] = useState<ForecastPoint[]>([]);
  const [clusters, setClusters] = useState<ClusterGroup[]>([]);
  const [forecastMeta, setForecastMeta] = useState<ForecastMeta>(EMPTY_META);
  const [insights, setInsights] = useState<Insight[]>([]);

  const [narrating, setNarrating] = useState(false);
  const [narrated, setNarrated] = useState(false);

  const ai = useAI();
  // `generateStructured` identity changes per render; we read the latest provider
  // via a ref so `runAnalysis` doesn't need `ai` in its dependency list (which
  // would otherwise re-create the callback and re-run the analysis on every render).
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const narrationAbort = useRef<AbortController | null>(null);
  const runToken = useRef(0);
  // Set true once we have populated results from cache for the current table, so
  // the auto-run effect does not recompute over a fresh cache hit.
  const hydratedFor = useRef<string>("");

  const tableName = resolvedTableName || preferredTableName;

  const aiAvailable = useMemo(() => ai.availability.some((a) => a.available), [ai.availability]);

  // ── Table resolution ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        let next = preferredTableName;
        const tables = await runReadOnlyQuery("SHOW TABLES").catch(() => []);
        const names = tables.map(tableNameFromShowTables).filter(Boolean);
        if (names.length > 0 && (!next || !names.includes(next))) {
          next = names[0] ?? "";
        }
        if (!next) {
          if (!cancelled) {
            setResolvedTableName("");
            setTableLoaded(false);
            setRowCount(0);
          }
          return;
        }
        const countRes = await runReadOnlyQuery(`SELECT COUNT(*) AS cnt FROM ${quoteIdent(next)}`);
        if (!cancelled) {
          setResolvedTableName(next);
          setTableLoaded(true);
          setRowCount(Number(countRes[0]?.cnt ?? 0));
        }
      } catch (e) {
        console.error("[ai-analysis] DuckDB init error:", e);
        if (!cancelled) setTableLoaded(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [preferredTableName]);

  const runAnalysis = useCallback(async () => {
    if (!tableLoaded || !tableName || numericCols.length === 0) return;

    narrationAbort.current?.abort();
    const token = ++runToken.current;

    setNarrated(false);
    setNarrating(false);
    setState({ status: "running", progress: 4, stage: "Resolving dataset..." });

    try {
      const result = await runAnalysisWorker(
        {
          tableName,
          numericCols,
          catCols,
          dateCols,
          rowCount,
          sampleSize: 4000,
          histogramBins: 20,
        },
        (sql) => runReadOnlyQuery(sql),
        // Seeded platform analysis kernels (k-means / GESD / Holt-Winters).
        createAnalysisKernels(),
        (stage) => {
          if (token === runToken.current) {
            setState({ status: "running", progress: stage.progress, stage: stage.stage });
          }
        },
      );

      if (token !== runToken.current) return; // superseded by a newer run

      setColStats(result.colStats);
      setAnomalies(result.anomalies);
      setCorrelations(result.correlations);
      setForecasts(result.forecasts);
      setClusters(result.clusters);
      setForecastMeta(result.forecastMeta);

      const facts: AnalysisFacts = {
        rowCount,
        numericColumns: numericCols.length,
        categoricalColumns: catCols.length,
        colStats: result.colStats,
        anomalies: result.anomalies,
        correlations: result.correlations,
        forecasts: result.forecasts,
        clusters: result.clusters,
        forecastMeta: result.forecastMeta,
      };

      // Deterministic, offline insights — rendered immediately.
      const ruleInsights = buildRuleInsights(facts);
      setInsights(ruleInsights);
      setState({ status: "done", progress: 100, stage: "Analysis complete" });

      // Persist the run so reopening the page is instant and offline. We store the
      // rule-based insight set; LLM narration (below) re-runs cheaply on demand.
      const payload: CachedAnalysis = {
        version: 2,
        rowCount,
        colStats: result.colStats,
        anomalies: result.anomalies,
        correlations: result.correlations,
        forecasts: result.forecasts,
        clusters: result.clusters,
        forecastMeta: result.forecastMeta,
        insights: ruleInsights,
      };
      void putColumnProfile(cacheKey(tableName), CACHE_COLUMN, payload).catch(() => {});
      hydratedFor.current = tableName;

      // Optional LLM narration — non-blocking, replaces on success only.
      if (aiAvailable) {
        const controller = new AbortController();
        narrationAbort.current = controller;
        setNarrating(true);
        try {
          const narrated = await narrateInsights(facts, {
            generateStructured: (req, schema) =>
              aiRef.current.generateStructured({ ...req, signal: controller.signal }, schema),
            schema: LlmInsightResponseSchema,
            signal: controller.signal,
          });
          if (token === runToken.current && narrated.length > 0) {
            setInsights(narrated);
            setNarrated(true);
          }
        } catch (err) {
          // No model / parse failure / abort → keep rule-based insights.
          if (!controller.signal.aborted) {
            console.warn("[ai-analysis] LLM narration unavailable, using rule-based:", err);
          }
        } finally {
          if (token === runToken.current) setNarrating(false);
        }
      }
    } catch (err) {
      if (token !== runToken.current) return;
      console.error("[ai-analysis] analysis error:", err);
      setState({ status: "error", progress: 0, stage: String(err) });
    }
  }, [tableLoaded, tableName, numericCols, catCols, dateCols, rowCount, aiAvailable]);

  // Hydrate from the durable cache when the table is ready; only fall through to
  // a fresh compute when there is no fresh cached run for this dataset+rowCount.
  useEffect(() => {
    if (!tableLoaded || !tableName) return;
    let cancelled = false;

    async function hydrateOrRun() {
      if (hydratedFor.current === tableName) return;
      try {
        const row = await getColumnProfile(cacheKey(tableName), CACHE_COLUMN);
        const cached = row?.profile as CachedAnalysis | undefined;
        if (
          !cancelled &&
          cached &&
          cached.version === 2 &&
          cached.rowCount === rowCount &&
          cached.colStats.length > 0
        ) {
          // Fresh cache hit — populate instantly, no recompute.
          setColStats(cached.colStats);
          setAnomalies(cached.anomalies);
          setCorrelations(cached.correlations);
          setForecasts(cached.forecasts);
          setClusters(cached.clusters);
          setForecastMeta(cached.forecastMeta);
          setInsights(cached.insights);
          setState({ status: "done", progress: 100, stage: "Loaded from cache" });
          hydratedFor.current = tableName;
          return;
        }
      } catch {
        // Cache miss/unavailable → compute fresh.
      }
      if (!cancelled && hydratedFor.current !== tableName) void runAnalysis();
    }

    void hydrateOrRun();
    return () => {
      cancelled = true;
    };
  }, [tableLoaded, tableName, rowCount, runAnalysis]);

  // Abort any in-flight narration on unmount.
  useEffect(() => () => narrationAbort.current?.abort(), []);

  const acknowledgeInsight = useCallback((id: string) => {
    setInsights((prev) =>
      prev.map((ins) => (ins.id === id ? { ...ins, acknowledged: true } : ins)),
    );
  }, []);

  return {
    state,
    tableLoaded: tableLoaded && hasDataset,
    resolvedTableName,
    rowCount,
    colStats,
    anomalies,
    correlations,
    forecasts,
    clusters,
    forecastMeta,
    insights,
    narrating,
    narrated,
    aiAvailable,
    runAnalysis,
    acknowledgeInsight,
  };
}
