# data-navigator — Per-Feature Improvement Plans

## agent-canvas — Visual canvas for orchestrating AI agents / node graph  
_Maturity: **functional**_

**Current state:** A 4-panel "A2UI IDE" screen (src/features/agent-canvas/screens/AgentCanvasScreen.tsx) that runs a fully in-browser agentic dashboard-generation pipeline over an uploaded dataset in DuckDB-wasm. The pipeline (core/pipeline.ts) is a real @langchain/langgraph StateGraph with nodes schema_analysis -> react_sql_loop -> planner -> human_interrupt (LangGraph interrupt() HITL) -> critique -> revise (loop, max 3) -> sql_fan_out (concurrency 3) -> narrator, checkpointed by MemorySaver, emitting AG-UI events through a custom append-only event bus (core/event-bus.ts) with trace-tree + run-stats projections. State lives in a zustand+immer store (core/agent-store.ts). The LLM runs locally via @huggingface/transformers (transformers.js) with WebGPU/WASM device detection, streaming, JSON/zod extraction, and heavy debug logging (core/llm.ts); default model SmolLM2-360M-Instruct. Planner (core/planner.ts) uses the LLM with a deterministic heuristic fallback. The visual graph (components/AgentFlowGraph.tsx) is @xyflow/react with custom nodes, MiniMap, Controls, animated edges, a vaul drawer log, and a live stats strip. The widget canvas (components/Canvas.tsx) uses react-grid-layout with drag/resize. Charts via echarts; Monaco is used in WidgetCard (SQL inspector) and NarrativePanel. Yjs is imported for layout. Every component has Storybook stories.

**Gaps:**
- The 'agent graph' is display-only, not a canvas: AgentFlowGraph renders a HARDCODED LangGraph topology (DEFAULT_FLOW_NODES + GRAPH_EDGES + computeLayout with per-id x/y positions). Despite the feature name 'orchestrating AI agents / node graph,' users cannot add, remove, rewire, or configure nodes; the graph cannot drive the pipeline.
- Live node status is broken: agent-store defines updateFlowNode but the pipeline NEVER calls it. Nodes are only seeded once via setFlowNodes in AgentCanvasScreen at startup; emitStepStart/emitStepEnd publish AG-UI events but nothing maps STEP_STARTED/STEP_FINISHED back to flowNodes, so the graph stays mostly 'idle/running' and doesn't animate per step. AgentFlowGraph's initialNodes/initialEdges also use empty deps with eslint-disable, so they desync.
- The SQL IDE panel (Panel B) is an EMPTY placeholder div in AgentCanvasScreen.tsx (~line 424) even though the header comment promises 'Monaco + DuckDB + PrimeReact table'. agent-store has full SQLTab/SQLHistory state and defaultSQLForTable() but no component consumes them — dead state.
- Yjs persistence is non-functional: Canvas.tsx writes layouts into a Y.Map on change but layouts are always rebuilt from specs and never read back from Yjs; there is no y-indexeddb/y-webrtc provider (only 'yjs' is installed), so nothing persists across reloads and there is no real collaboration.
- No graph auto-layout: positions are a hardcoded id->coordinate map, so any user-editable or dynamically-sized graph would overlap/break. No dagre/elkjs/d3-hierarchy.
- Critique node is naive rule-based string checks (widget count, has-kpi, has-trend); revise is hardcoded KPI+bar injection. No LLM-driven critique/reflection, so the 'critique loop' adds little signal.
- No streaming consumption of LangGraph: runPipeline uses graph.invoke (fire-and-forget .catch(console.error)) instead of graph.stream/streamEvents, so token/step deltas, interrupt detection, and resume are wired manually and fragilely rather than via the v3 streaming API.
- Text-to-SQL has no self-correction: generateSQL output is executed once; on DuckDB error the widget just fails (status:'error') with no retry/repair loop feeding the error back to the model.
- No whole-session persistence (generated dashboard, plan, narrative) — refresh loses everything; DuckDB table and store are in-memory only.
- Token/cost stats are placeholder zeros (RUN_FINISHED totalTokens:0; tokenCount never incremented), so the stats strip understates usage.

**Improvements:**

- **Wire live per-node status into the agent graph by projecting AG-UI STEP/TOOL events onto flowNodes** _(effort S, impact high)_  
  The store already has updateFlowNode and emits STEP_STARTED/STEP_FINISHED/INTERRUPT events; subscribe in event-bus or the screen and map nodeName->FlowNode.status (idle/running/done/interrupt/error). This is the smallest change that makes the existing graph actually 'live' and matches LangGraph's documented stream_mode='updates' pattern of reflecting per-super-step state. Also fixes AgentFlowGraph's empty-dependency useMemo so initialNodes/edges track store changes.
  
  Sources: <https://docs.langchain.com/oss/javascript/langgraph/interrupts> · <https://reactflow.dev/learn/layouting/layouting>
- **Switch runPipeline from graph.invoke to graph.stream/streamEvents (v3) for robust progress + interrupt/resume** _(effort M, impact high)_  
  LangChain's current guidance is to drive the run via streamed typed projections: observe per-step state (values/updates), detect interrupts via stream.interrupted, and resume with Command(resume=...). This replaces the fragile fire-and-forget invoke + manual onInterrupt plumbing, gives real token-by-token narration, and makes HITL resume deterministic.
  
  Sources: <https://docs.langchain.com/oss/javascript/langgraph/interrupts> · <https://aipractitioner.substack.com/p/human-in-the-loop-agents-steering>
- **Make the node graph an actual editable canvas with elkjs/dagre auto-layout** _(effort L, impact high)_  
  The feature is named 'orchestrating AI agents / node graph' but the graph is static with hardcoded coordinates. xyflow's 2025 Workflow Editor template uses ELKjs auto-layout + drag-and-drop sidebar; adopting elkjs (or dagre) removes the hardcoded position map, supports dynamically sized/added nodes (add with opacity 0, layout, then reveal), and is the prerequisite for letting users compose/configure agent pipelines that the StateGraph executes.
  
  Sources: <https://reactflow.dev/ui/templates/workflow-editor> · <https://reactflow.dev/examples/layout/auto-layout> · <https://medium.com/pinpoint-engineering/part-2-building-a-workflow-editor-with-react-flow-a-guide-to-auto-layout-and-complex-node-1aadae67a3a5>
- **Implement the SQL IDE panel (Monaco + DuckDB) backed by the existing SQLTab store state** _(effort M, impact medium)_  
  Panel B is an empty div while agent-store already models sqlTabs/sqlHistory/activeSqlTab and defaultSQLForTable(); @monaco-editor/react is already a dependency and used elsewhere. Wiring a Monaco editor + runReadOnlyQuery + results grid into the dead state turns a promised-but-missing pane into a working interactive query surface with near-zero new dependencies.
  
  Sources: <https://pockit.tools/blog/run-llms-browser-webgpu-transformers-js-chrome-built-in-ai-guide/>
- **Add a text-to-SQL self-correction loop in buildWidgetNode** _(effort M, impact high)_  
  Research on Text-to-SQL (MAC-SQL/self-correction guidelines) shows feeding execution errors back to the model materially raises valid-query rates. Today a DuckDB error immediately marks the widget failed. A bounded retry (e.g. 2 attempts) that passes the DuckDB error message + schema back to generateSQL would convert many hard failures into successful widgets, which is the main quality lever for a local-model pipeline.
  
  Sources: <https://arxiv.org/pdf/2406.12692>
- **Persist layout + session with y-indexeddb (and optionally y-webrtc) instead of the inert Y.Doc** _(effort M, impact medium)_  
  Canvas writes to a Y.Map but never reads it back and no persistence provider is installed, so nothing survives reload. Yjs docs recommend IndexeddbPersistence to load documents from the local browser DB on next visit, combinable with y-webrtc for backend-free P2P collaboration. This fixes the broken read-back path and delivers real local-first persistence of the generated dashboard.
  
  Sources: <https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb> · <https://docs.yjs.dev/getting-started/allowing-offline-editing>
- **Replace rule-based critique with an LLM reflection step and real token accounting** _(effort M, impact medium)_  
  Self-consistency / chain-of-thought reflection is the established way to raise plan quality; the current critique only counts widgets and checks for a KPI/trend. Having the local model critique the plan (and incrementing tokenCount/incTokens so the stats strip and RUN_FINISHED.totalTokens stop reading 0) makes the critique->revise loop meaningful and the cost telemetry honest.
  
  Sources: <https://arxiv.org/pdf/2406.12692> · <https://docs.langchain.com/oss/javascript/langgraph/interrupts>

**Recommended deps:** `elkjs` (Automatic graph layout for the @xyflow/react agent canvas, replacing the hardcoded id->coordinate map and enabling editable/dynamically-sized node graphs (used by xyflow's official Workflow Editor template).), `y-indexeddb` (Local-first persistence provider for the existing Yjs doc so canvas layout and generated dashboard survive reloads (currently only 'yjs' is installed and nothing persists).), `@dagrejs/dagre` (Lightweight alternative/companion layered-graph layout engine for the node graph if a simpler top-down DAG layout is preferred over elkjs.), `y-webrtc` (Optional backend-free P2P real-time collaboration on the canvas, pairing with y-indexeddb for offline-first multi-user editing.)

**Top pick:** Wire live per-node status into the agent graph (project AG-UI STEP/TOOL/INTERRUPT events onto flowNodes via the already-defined updateFlowNode, and fix AgentFlowGraph's empty-dependency memos). It is a small change that makes the centerpiece graph actually reflect the running pipeline — the single biggest gap between what the feature claims and what it currently shows — and is the foundation for the larger streaming and editable-canvas work.

---

## ai-analysis — AI-driven dataset analysis / insights  
_Maturity: **functional**_

**Current state:** A single large client component (src/features/ai-analysis/screens/AiAnalysisScreen.tsx, ~2225 lines) renders six tabs (insights, anomalies, correlations, forecast, patterns, explain). On dataset load it auto-runs a 6-stage pipeline against DuckDB-wasm via runReadOnlyQuery (src/platform/duckdb): per-column SQL aggregates (COUNT/MIN/MAX/AVG/STDDEV_SAMP/MEDIAN), then JS-side stats from simple-statistics (^7.9.0) in src/features/ai-analysis/model/stats.ts (histogram, skewness, kurtosis, Z-score + IQR outliers, Pearson correlation, OLS linear regression). Charts are ECharts (echarts ^6.1.0 via echarts-for-react, dynamically imported): correlation heatmap, forecast line with confidence band, cluster scatter, severity pie, histogram. Insights/anomalies/correlations/forecasts are typed in model/types.ts and presented via InsightCard/StatCard/SeverityBadge in components/analysis-cards.tsx (motion/react animations, acknowledge/search/severity+category filters). Export is a client-side JSON blob download. Notably: despite the app shipping a full local-LLM/provider stack (src/platform/ai/provider/ with webllm/ollama/openai/transformers adapters, structured.ts, and src/platform/ai/insights.ts whose generateInsights/recommendCharts already call generateText with a rule-based fallback), this screen uses NONE of it — all 'insights' are hardcoded string templates with fabricated confidence values (0.87, 0.93, 0.78) and the 'explain' tab is fully static formula cards. Forecasting is OLS-only (no seasonality) with a flat ±1.96σ band. Correlation is Pearson-only. 'Clusters' are just GROUP BY category averages, not real clustering, even though kMeans exists in platform/ai/insights.ts and ml-matrix (^6.12.2) is already installed.

**Gaps:**
- The local LLM/provider infrastructure that already exists (platform/ai/provider + insights.ts generateInsights) is never imported or used here; all insights are static string templates with hardcoded fake confidence scores (0.87/0.93/0.78) and no natural-language narrative or grounding
- Stats, anomalies and correlations are computed in JS over a 2000-3000 row LIMIT sample even though DuckDB-wasm can compute exact STDDEV/CORR/QUANTILE/SKEWNESS/KURTOSIS/REGR_* over the full dataset in milliseconds — results are inaccurate and silently truncated
- Forecasting is plain OLS with no seasonality/trend decomposition (no STL/Holt-Winters) and the 'confidence band' is a constant ±1.96*stddev rather than a real prediction interval that widens with horizon
- Correlation is Pearson-only (linear, numeric-only) — no Spearman/rank correlation for monotonic relationships, no categorical association (Cramer's V / mutual information), and full O(n^2) recompute per pair
- The 'patterns' tab labels GROUP BY category averages as 'clusters' — no actual clustering (kMeans in platform/ai/insights.ts and ml-matrix are unused), and the scatter only plots one centroid per category
- The 'explain' tab is entirely static formula cards; it does not explain THIS dataset's actual findings, so the feature cannot answer follow-up questions
- No conversational / ask-a-question interface over the dataset despite NLQ infra (platform/ai/nlq.ts) existing elsewhere in the app
- The whole pipeline runs sequentially on the main thread (no Web Worker), blocking the UI on large datasets, with progress driven by hardcoded percentages
- Export is JSON-only; no PDF/markdown narrative report and the export ignores forecasts/clusters
- The 2225-line monolithic component mixes data fetching, stat computation, chart configs, and all six tab UIs — hard to test and maintain; no unit tests on the statistical core

**Improvements:**

- **Wire the existing LLM provider stack into the screen to produce grounded natural-language insights and a narrative summary** _(effort M, impact high)_  
  The app already has insights.ts generateInsights() and a full provider abstraction (webllm/ollama/openai) with a rule-based fallback, but this screen reimplements insights as static templates with fabricated confidence numbers. Feeding the already-computed DuckDB column stats + correlations + anomalies into the LLM to generate a ranked, prose narrative (and replacing fake confidence with model/heuristic-derived scores) is the single biggest credibility upgrade. 2025 best practice is moving from static dashboards to LLM-generated actionable, narrative insights grounded in pre-computed statistics to avoid hallucination.
  
  Sources: <https://aclanthology.org/2025.naacl-long.24/> · <https://arxiv.org/html/2505.23695v1> · <https://mantelgroup.com.au/dashboards-natual-language-insights> · <https://towardsdatascience.com/natural-language-visualization-and-the-future-of-data-analysis-and-presentation/>
- **Push statistics, correlations and anomaly detection down into DuckDB SQL over the full dataset instead of JS sampling** _(effort M, impact high)_  
  The pipeline currently LIMITs to 2000-3000 rows and computes stats in JS, producing approximate and silently truncated results. DuckDB-wasm runs exact STDDEV_SAMP, CORR, QUANTILE_CONT, SKEWNESS, KURTOSIS, REGR_SLOPE/REGR_R2 and SUMMARIZE over millions of rows in well under ~2s, eliminating sampling error and most of the per-column round-trips. This both fixes correctness and speeds up analysis.
  
  Sources: <https://motherduck.com/blog/duckdb-wasm-in-browser/> · <https://duckdb.org/2021/10/29/duckdb-wasm> · <https://medium.com/@davidrp1996/lightning-fast-analytics-duckdb-wasm-for-large-datasets-in-the-browser-43cb43cee164>
- **Replace OLS-only forecasting with seasonal decomposition + proper horizon-widening prediction intervals** _(effort L, impact medium)_  
  A straight line plus a flat ±1.96σ band is misleading for any data with seasonality or trend, and constant-width intervals understate uncertainty. STL/MSTL decomposition or Holt-Winters exponential smoothing captures trend+seasonality, and prediction intervals should widen with the forecast horizon. Forecast-based anomaly detection (flag points outside the interval) also gives far better outlier detection than global Z-score for time series.
  
  Sources: <https://robjhyndman.com/hyndsight/tsoutliers/> · <https://nixtlaverse.nixtla.io/statsforecast/docs/tutorials/anomalydetection.html> · <https://s-ai-f.github.io/Time-Series/outlier-detection-in-time-series.html>
- **Broaden relationship analysis beyond Pearson: add Spearman rank correlation and categorical association (Cramer's V / mutual information)** _(effort M, impact medium)_  
  Pearson only captures linear relationships between numeric columns, missing monotonic non-linear relationships and any signal involving categorical columns (which most real datasets are dominated by). Adding Spearman (computable directly via DuckDB CORR over RANK()) and a categorical-association measure makes the correlations tab actually useful across the whole schema rather than numeric-only.
  
  Sources: <https://www.geeksforgeeks.org/data-analysis/unlocking-insights-with-exploratory-data-analysis-eda-the-role-of-ydata-profiling/> · <https://github.com/ydataai/ydata-profiling>
- **Make the 'patterns' tab real clustering with a 2D projection, and move the pipeline off the main thread into a Web Worker** _(effort L, impact medium)_  
  Current 'clusters' are GROUP BY averages mislabeled as clusters; the kMeans implementation in platform/ai/insights.ts and ml-matrix (already installed) can do real k-means with a PCA-based 2D projection so the scatter shows actual point separation. Running the multi-stage pipeline in a Web Worker (the app already uses workers for VAD) keeps the UI responsive and lets progress reflect real stage completion instead of hardcoded percentages.
  
  Sources: <https://github.com/ydataai/ydata-profiling> · <https://medium.com/@ryanaidilp/building-a-high-performance-statistical-dashboard-with-duckdb-wasm-and-apache-arrow-d6178aeaae6d>
- **Add a grounded 'ask the data' conversational box and a narrative PDF/markdown export** _(effort L, impact medium)_  
  2025 EDA UX is shifting from static drill-down dashboards to conversational, context-aware Q&A over the computed profile, and from raw JSON dumps to leadership-ready narrative reports. A chat box that answers using the already-computed stats/insights (reusing platform/ai/nlq.ts and the provider stack) plus a markdown/PDF export of the narrative makes the feature shareable and far more 'AI'.
  
  Sources: <https://mantelgroup.com.au/dashboards-natual-language-insights> · <https://arxiv.org/pdf/2501.16661> · <https://docs.sisense.com/main/SisenseLinux/sisense-narratives.htm>

**Recommended deps:** `stlite` (Lightweight JS STL (Seasonal-Trend decomposition using Loess) for seasonal forecasting in the browser; alternatively use a Holt-Winters implementation. Confirm on npm before adopting — otherwise hand-roll Holt-Winters with the existing simple-statistics primitives.), `regression` (Well-maintained JS regression library (linear/polynomial/exponential) to offer non-linear trend fits beyond the current hand-rolled OLS, giving better forecasts and R2 comparison across model types.)

**Top pick:** Wire the already-present LLM provider stack (platform/ai/insights.ts generateInsights + provider adapters) into AiAnalysisScreen so insights become grounded natural-language narratives with real (not hardcoded 0.87/0.93) confidence — the screen currently ignores the entire local-AI infrastructure the app ships, making an 'AI Analysis' feature that contains no AI. This is the highest-leverage, on-brand fix and unblocks the conversational/export improvements.

---

## ai-briefing — Auto-generated narrative briefings from data  
_Maturity: **functional**_

**Current state:** A single large client component (src/features/ai-briefing/screens/AIBriefingScreen.tsx, ~1337 lines) renders a 4-tab "AI Intelligence Suite": Daily Briefing + Executive Summary, Anomaly Report, Action Plan, and Data Story (3-act narrative with hero/villain channel framing). It drives on-device generation through generateText/initLLMEngine/subscribeLLMEngine from src/platform/ai/llm-engine.ts, which wraps @mlc-ai/web-llm (default model Qwen2-0.5B-Instruct-q4f16_1-MLC). Persistence is a small Zustand+persist store (src/features/ai-briefing/store/briefing-store.ts) tracking lastBriefing, up to 5 history entries, and action-plan items. Anomaly detection is inline z-score math via simple-statistics (threshold |z|>2.5). UI uses shadcn/ui (Card/Tabs/Badge/Progress/Skeleton), motion/react animations, lucide icons. Read-aloud uses the browser Web Speech API (SpeechSynthesisUtterance) rather than the project's own sherpa-onnx TTS. Export is plain .txt blobs + clipboard. The single biggest issue: EVERYTHING runs off a hardcoded SAMPLE_DATA constant inside the component — the feature never reads the actual loaded dataset (no use of src/core/stores/data-store, DuckDB queries, or the richer src/platform/ai/insights.ts and src/platform/ai/report-ai.ts that already exist and provide rule-based fallbacks). Action-plan JSON is parsed by regex match(/\[[\s\S]*\]/)+JSON.parse, even though src/platform/ai/provider/structured.ts already implements robust extractJsonBlock + Zod parseStructured. generateText hardcodes stream:false and exposes no response_format, so no token streaming and no constrained JSON despite web-llm supporting both.

**Gaps:**
- Operates entirely on hardcoded SAMPLE_DATA — never reads the real loaded dataset (data-store / DuckDB), so every briefing, anomaly, action plan and story is fictional regardless of what the user loaded
- No grounding / citation linkage: generated narratives can hallucinate numbers with no claim-to-evidence mapping back to actual rows or aggregates
- No token streaming — generateText forces stream:false, so users stare at skeletons for the full generation instead of seeing text appear progressively
- Action-plan and any structured output rely on fragile regex+JSON.parse instead of the repo's own extractJsonBlock/parseStructured (structured.ts) or web-llm response_format/json_schema constrained decoding
- Read-aloud uses browser SpeechSynthesis, ignoring the project's bundled sherpa-onnx TTS (Kokoro/Piper voices) used elsewhere — inconsistent, lower-quality, online-dependent voice
- Duplicate/parallel logic: inline anomaly z-score and prompt-building reimplement what insights.ts and report-ai.ts already do (including rule-based fallbacks), so there is no graceful degradation when the LLM is unavailable
- No regeneration controls or quality guardrails (length/temperature presets, tone, audience) and no schema validation of LLM output before display
- No export beyond .txt/clipboard (no Markdown/PDF), and no way to pin/compare briefings over time despite a history store existing
- Monolithic 1300-line component with repeated tab boilerplate (LLM banners, blob-download, formatDateTime) and no tests around parsing/anomaly logic

**Improvements:**

- **Ground briefings in the real loaded dataset instead of SAMPLE_DATA** _(effort M, impact high)_  
  The feature's core value proposition (narratives from YOUR data) is currently fake — it narrates a hardcoded telecom constant. Wire the tabs to the existing data-store/DuckDB aggregates (reuse insights.ts detectAnomalies and report-ai.ts ReportSummary which already compute real stats with rule-based fallbacks) so prompts carry actual numbers. Grounded summarization is also the single biggest hallucination reducer: grounded summarization tasks measured 0.7–1.5% hallucination vs much higher ungrounded, per 2025 evaluations.
  
  Sources: <https://www.factored.ai/engineering-blog/llm-hallucination-evaluation> · <https://arxiv.org/abs/2408.05346>
- **Use web-llm response_format/json_schema constrained decoding for action plans and anomalies** _(effort M, impact high)_  
  web-llm natively supports response_format with a JSON schema implemented in WASM, guaranteeing schema-valid output and removing the regex match(/\[...\]/)+JSON.parse failure mode. Pair with the repo's own extractJsonBlock/parseStructured (Zod) as a fallback. Grammar/constrained decoding is the 2026 best practice for reliable structured LLM output and avoids silent 'parse failed' drops the current Action Plan tab swallows.
  
  Sources: <https://github.com/mlc-ai/web-llm/blob/main/examples/json-schema/src/json_schema.ts> · <https://dev.to/pockit_tools/llm-structured-output-in-2026-stop-parsing-json-with-regex-and-do-it-right-34pk> · <https://mbrenndoerfer.com/writing/constrained-decoding-structured-llm-output>
- **Add token streaming so narratives render progressively** _(effort M, impact high)_  
  generateText hardcodes stream:false; web-llm exposes chat.completions.create({stream:true}) as an AsyncGenerator yielding choices[0].delta.content. Streaming the briefing/story text into the existing card (replacing the full-length skeleton) dramatically improves perceived latency on a 0.5B in-browser model where generation is the slow path. Add a generateTextStream variant to llm-engine.ts.
  
  Sources: <https://github.com/mlc-ai/web-llm> · <https://medium.com/@prestonblckbrn/structured-output-streaming-for-llms-a836fc0d35a2>
- **Add evidence-linked claims with uncertainty/confidence cues** _(effort L, impact medium)_  
  Reporting pipelines remain vulnerable to hallucinated claims; 2025 guidance recommends explicit claim–evidence mapping plus calibrated uncertainty and human validation. Render each key metric in the narrative as a chip linking back to the source aggregate (and a 'investigate in SQL' affordance the Anomaly tab already hints at), and surface a low-confidence flag when stats are sparse (insights.ts already gates on sample size). This builds trust and lets users verify numbers.
  
  Sources: <https://arxiv.org/pdf/2510.04023> · <https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1622292/full>
- **Route read-aloud through the project's sherpa-onnx TTS instead of Web Speech API** _(effort M, impact medium)_  
  The app already bundles sherpa-onnx Kokoro/Piper ONNX voices (public/models/sherpa/tts). Using them gives a consistent, fully offline, higher-quality voice for the 'AI Voice Briefing' (the headline feature) instead of the OS SpeechSynthesis voice, aligning with the app's local-first/Electron posture.
  
  Sources: <https://www.yellowfinbi.com/blog/how-data-storytelling-and-augmented-analytics-are-re-defining-bi-together>
- **Add Markdown/PDF export and richer storytelling annotations** _(effort M, impact medium)_  
  Gartner projects automated, narrative data stories (not dashboards) as the dominant analytics consumption mode, with ~75% auto-generated; annotation tooling (Contextifier/Almanac-style) is a recognized pattern for contextualizing trends. Upgrade export beyond .txt to Markdown (via remark/unified, already common in this stack) and inline trend annotations, and let users pin/compare past briefings using the existing history store.
  
  Sources: <https://www.yellowfinbi.com/blog/how-data-storytelling-and-augmented-analytics-are-re-defining-bi-together> · <https://arxiv.org/pdf/2410.05579>
- **Decompose the 1300-line component and add tests for parsing/anomaly logic** _(effort M, impact medium)_  
  The screen repeats LLM-banner, blob-download, formatDateTime and tab scaffolding four times and has zero tests around the brittle JSON parsing and z-score anomaly logic. Extracting shared hooks/components and unit-testing the structured-parse + anomaly path locks behavior before the above refactors, matching the repo's stated regression-test-first working agreement.
  
  Sources: <https://letsdatascience.com/blog/structured-outputs-making-llms-return-reliable-json>

**Recommended deps:** `zod` (Validate LLM structured output (action items, anomaly explanations) against a schema; already used by the repo's provider/structured.ts parseStructured, so reuse it here instead of regex+JSON.parse), `remark` (Render and export narratives/briefings as Markdown (and feed a Markdown->PDF/print path) for higher-fidelity export than plain .txt blobs), `date-fns` (Replace the ad-hoc formatDateTime/toLocaleString helpers with consistent, tree-shakeable date formatting for briefing timestamps and history comparison)

**Top pick:** Ground the briefings in the real loaded dataset (reuse data-store/DuckDB aggregates + the existing insights.ts and report-ai.ts) instead of the hardcoded SAMPLE_DATA. Right now every narrative, anomaly, action plan and story is fictional no matter what the user loads, which undermines the feature's entire premise; grounding it also is the highest-leverage hallucination reduction and unlocks the value of all the other improvements.

---

## analytics-theater — Presentation / storytelling mode for analytics  
_Maturity: **partial**_

**Current state:** The feature is a single 1233-line client component, src/features/analytics-theater/screens/AnalyticsTheaterScreen.tsx, rendered by the thin route src/app/dashboard/analytics-theater/page.tsx. It presents a tabbed gallery ("Visual Analytics Theater") of six ECharts visualizations via `echarts-for-react` (ReactECharts) on top of shadcn-style Tabs/Card/Button primitives: (1) GitHub-style Calendar Heatmap with year toggles and KPI cards, (2) an animated Channel Racing Bar with Play/Pause/Reset + 0.5/1/2x speed and a setInterval frame loop, (3) a Sankey transaction-flow chart, (4) a custom-renderItem intraday Gantt colored by success rate, (5) a hand-rolled flexbox word cloud (font-size scaling + manual hover tooltip), and (6) a drill-down Revenue Sunburst with a breadcrumb. Despite the "theater"/storytelling framing, ALL data is synthetic: `generateCalendarData`, `generateRaceFrames`, `buildGanttData` use `Math.random()` and run at module load, and the Sankey/word-cloud/sunburst datasets are hardcoded telecom literals (IZIPAY, ORANGE MONEY, etc.). There is NO connection to the app's real data layer (no DuckDB-wasm, no TanStack Query, no Zustand store, no src/core/queries or datasets) and the only shared import is `fmtN`/`fmtCompact` from src/features/telecom/lib/format. There is no actual presentation/storytelling flow: no narrative steps, annotations, guided sequencing, scene navigation, fullscreen/present mode, export, or cross-chart linking — it is a static demo gallery. Formatting/labels are also hardcoded (text placeholders like "crown"/"chart" instead of icons).

**Gaps:**
- Not connected to real data: every chart uses Math.random() or hardcoded literals and ignores DuckDB-wasm, TanStack Query, and the dataset/file Zustand stores the rest of the app uses
- No actual storytelling/presentation capability despite the feature name — no narrative steps, scenes, guided sequencing, annotations, or fullscreen present mode
- No cross-chart linking or shared filter state; the six tabs are independent and none react to a selected channel/date/status
- Mock data is regenerated on every module load (generateCalendarData/generateRaceFrames at import time), so values change between renders/reloads and cannot be reproduced or shared
- Monolithic 1200+ line single-file component: six tab components, theme constants, and data generators are all inlined, hurting reuse, testability, and code-splitting
- The racing-bar animation uses a manual setInterval frame stepper instead of ECharts' built-in timeline/animation, and word cloud is hand-rolled flexbox with overlap/placement and no real layout algorithm
- No export/share (PNG/PDF/link), no presenter notes, and no annotation layer for calling out insights
- Accessibility/keyboard navigation, reduced-motion handling, and chart alt-text are absent; autoplay starts after 400ms with no prefers-reduced-motion guard
- ECharts is imported in full via echarts-for-react default build rather than tree-shaken modules, inflating the bundle for a 6-chart screen

**Improvements:**

- **Wire the charts to real DuckDB-wasm data via TanStack Query instead of Math.random() mocks** _(effort L, impact high)_  
  The screen is the app's flagship visual surface but shows fabricated data, so it cannot be used for actual analysis. The app already has a DuckDB query layer (src/core/queries) and uses echarts-for-react, whose dynamic-data diffing animates transitions automatically when the underlying dataset changes — a clean fit for query-driven charts. A useChartDataTransform-style hook with React Query is the documented best-practice pattern for feeding ECharts in React.
  
  Sources: <https://medium.com/@vaibhav11t/visualizing-data-in-react-with-apache-echarts-react-query-b13c836caafa> · <https://echarts.apache.org/en/feature.html>
- **Add a real storytelling / scrollytelling present mode with sequenced insight steps and highlighting** _(effort L, impact high)_  
  The feature is literally named a presentation/storytelling theater but has no narrative flow. 2025 best practice is one key insight per step, muting secondary elements and animating charts between states as the reader advances, using scroll position (or step navigation) as the driver. react-scrollama/scrollama (or an IntersectionObserver step controller) is the standard, minimal way to build this in React.
  
  Sources: <https://flourish.studio/blog/scrollytelling-examples/> · <https://www.kdnuggets.com/the-future-of-data-storytelling-formats-beyond-dashboards> · <https://metadrop.net/en/articles/scrollytelling-using-scrollamajs-css-and-best-practices>
- **Introduce shared filter/selection state so tabs cross-link (click a channel/date to drive every view)** _(effort M, impact high)_  
  Modern guided/interactive dashboards let users drill down and filter with clicks that propagate across linked visuals; ECharts charts encapsulated as React components can be synchronized so interaction in one updates others. A small Zustand store (consistent with the app's existing stores) holding selected channel/date/status would turn six isolated demos into one connected analysis surface.
  
  Sources: <https://developer.ibm.com/articles/awb-synchronizing-multiple-charts-react/> · <https://www.zoho.com/analytics/bi-dashboard.html>
- **Add annotations + presenter notes and PNG/PDF export for shareable insights** _(effort M, impact medium)_  
  Narrative-first BI tools (Toucan Toco, Power BI storytelling) emphasize annotated, presentation-ready, shareable outputs over raw exploration. Letting users annotate a callout on a chart, attach a note, and export the current scene to image/PDF makes the theater usable for real reporting; ECharts exposes getDataURL for native image export and html2canvas covers DOM-based panels like the word cloud.
  
  Sources: <https://www.holistics.io/blog/business-intelligence-bi-tools/> · <https://www.yellowfinbi.com/blog/business-intelligence-dashboard-what-is-it-how-to-use>
- **Replace the manual setInterval racer with ECharts' built-in timeline and add prefers-reduced-motion handling** _(effort M, impact medium)_  
  ECharts ships a timeline component for stepping data across a time dimension with built-in animation diffing, which is more robust than a hand-rolled frame interval (which leaks/competes with React state and ignores reduced-motion). Using the native timeline simplifies the code and improves accessibility for motion-sensitive users.
  
  Sources: <https://echarts.apache.org/en/feature.html> · <https://github.com/hustcc/echarts-for-react>
- **Split the 1200-line monolith into per-chart components/hooks and tree-shake ECharts imports** _(effort M, impact medium)_  
  The single file mixes six charts, theme constants, and data generators, blocking reuse, testing, and code-splitting. Extracting each tab into its own module with a shared theme/config and importing only the needed ECharts modules (core + chart/component) is the documented scalability pattern and reduces bundle size for this heavy screen.
  
  Sources: <https://www.taniarascia.com/apache-echarts-react/> · <https://github.com/hustcc/echarts-for-react>

**Recommended deps:** `react-scrollama` (React-friendly IntersectionObserver wrapper to build the scrollytelling/step-driven present mode (one insight per step, highlight-on-enter)), `scrollama` (Lower-level, minimal scroll/step engine if a non-React-binding controller is preferred for the present mode), `echarts-wordcloud` (Proper word-cloud layout algorithm to replace the hand-rolled flexbox cloud, integrating natively with the existing ECharts 6 instance), `html2canvas` (Export DOM-based panels (word cloud, KPI cards) to PNG for the share/export feature; ECharts charts use native getDataURL)

**Top pick:** Wire the charts to real DuckDB-wasm data through TanStack Query (replacing the Math.random()/hardcoded mocks). Everything else — storytelling steps, cross-chart filtering, annotations, export — only delivers value once the theater is showing the user's actual dataset rather than fabricated telecom numbers, and the app already has the DuckDB query layer and echarts-for-react in place to support it.

---

## channel-monitor — Real-time channel/stream monitoring  
_Maturity: **functional**_

**Current state:** A self-contained "Channel Operations Monitor" reached via /dashboard/monitor (src/app/dashboard/monitor/page.tsx wraps it in Suspense with a skeleton). The UI is one 1,652-line monolith, src/features/channel-monitor/screens/ChannelMonitorScreen.tsx, split into 5 tabs: Channel Health board, Alert Rules engine, Alert Timeline, SLA Compliance, and Sound & Notifications. State lives in src/features/channel-monitor/store/monitor-store.ts — a Zustand store with persist/createJSONStorage(localStorage) holding alertRules (3 seeded defaults), alertEvents (capped 500), channelStatuses, slaTargets, soundEnabled/soundVolume, and a 50-item notifications list. Charts use echarts-for-react; AI threshold suggestions call generateText/initLLMEngine from @/platform/ai/llm-engine (local web-llm); audible alerts are hand-rolled Web Audio AudioContext oscillators (createOscillatorAlert/playSoundAlert). CRITICAL GAP: all data is fabricated. generateChannelStatus/generateAlertEvents/generateDailyCompliance use a seededRand(Math.sin) PRNG over a hardcoded 10-channel catalog (CHANNELS) and a 30s setInterval tick — the feature never touches the real DuckDB datasets the app already exposes via src/core/queries/duckdb.ts or the src/features/telecom data. Alert evaluation in ChannelHealthTab re-derives statuses each tick and fires rules only when triggered && Math.random() < 0.05, with static absolute thresholds and no severity escalation, dedup, or grouping.

**Gaps:**
- Data is 100% simulated (seededRand PRNG); never queries the real DuckDB datasets or telecom tables the app already has, so the 'monitor' shows nothing real.
- Alert engine is a toy: static absolute thresholds, firing gated by Math.random() < 0.05, no anomaly/baseline detection, no per-channel adaptive thresholds.
- No alert deduplication, grouping, or correlation — a degraded channel can spam many near-identical events/notifications (classic alert fatigue).
- No real desktop delivery: alerts are in-app list + Web Audio beeps only; no Web Notifications API or Electron native Notification, so alerts are invisible when the window is unfocused.
- Polling-only via setInterval(30s); no streaming/event-driven updates, no incremental chart updates, no pause/backpressure when tab is hidden.
- Monolithic 1,652-line component mixing data simulation, audio, charting, and 5 tabs — hard to test, no separation of data layer from view.
- Persisted alertEvents (up to 500) in localStorage with no retention policy, ack-state cleanup, or export; timeline lacks acknowledge-with-note / assignment / escalation workflow.
- No SLA error-budget / burn-rate computation — SLA tab shows daily compliance bars but no burn-rate alerting which is the modern SRE standard.
- AI suggestions are a single generic prompt with no channel-specific historical context fed in; not grounded in the channel's own metrics.

**Improvements:**

- **Wire the monitor to real DuckDB data instead of seededRand simulation** _(effort L, impact high)_  
  The feature's core promise ('real-time channel monitoring') is undermined because generateChannelStatus fabricates every metric while the app already ships a DuckDB-wasm query layer (src/core/queries/duckdb.ts) and a telecom dataset. Replacing the PRNG with a polling/incremental SQL aggregation (success rate, volume, failures per channel over a rolling window) makes the dashboard truthful and reuses existing infrastructure rather than adding new layers.
  
  Sources: <https://www.zigpoll.com/content/how-can-i-optimize-the-responsiveness-and-performance-of-my-react-dashboard-when-rendering-large-datasets-with-dynamic-visualizations> · <https://www.nops.io/blog/visualizing-and-managing-large-datasets-with-apache-echarts-and-ag-grid-tables/>
- **Replace static thresholds + Math.random gating with EWMA/z-score adaptive anomaly detection** _(effort M, impact high)_  
  Current rules use fixed absolute thresholds and randomly suppress firings, producing both false alarms and missed events. 2025 streaming-anomaly research shows lightweight EWMA control charts with dynamic thresholds (mean + sensitivity*std over recent scores) achieve ~95% detection at ~4% false rate while being cheap enough to run in-browser per channel, adapting to each channel's normal baseline.
  
  Sources: <https://www.scitepress.org/Papers/2025/134378/134378.pdf> · <https://github.com/ExpediaGroup/adaptive-alerting/wiki/Anomaly-Detection> · <https://autognosi.medium.com/advanced-techniques-and-practical-aspects-in-anomaly-detection-for-time-series-f9b30e4e8760>
- **Add alert deduplication and grouping to kill alert fatigue** _(effort M, impact high)_  
  Industry guidance reports >90% noise reduction from grouping/dedup: when the same rule+channel re-triggers without a meaningful state change, update the existing event instead of appending a new one, and cluster related alerts (same channel or temporal window) into one incident. This directly fixes the unbounded near-duplicate events the current loop can emit.
  
  Sources: <https://incident.io/blog/2025-guide-to-preventing-alert-fatigue-for-modern-on-call-teams> · <https://www.netdata.cloud/academy/prometheus-alert-manager/> · <https://icinga.com/blog/alert-fatigue-monitoring/>
- **Deliver alerts via Web Notifications API and Electron native notifications** _(effort M, impact high)_  
  Alerts today are only an in-app list plus Web Audio beeps, so a critical channel failure is invisible when the operator is in another window. The app is a PWA + Electron, so it can use ServiceWorkerRegistration.showNotification() in the browser and Electron's main-process Notification (via IPC) for OS-level toasts that persist beyond the page — the standard way to surface critical, unfocused alerts.
  
  Sources: <https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API> · <https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification> · <https://www.electronjs.org/docs/latest/tutorial/notifications>
- **Add SLA error-budget burn-rate tracking and alerting** _(effort M, impact medium)_  
  The SLA tab currently shows only daily compliance bars. Modern SRE practice alerts on error-budget burn rate (how fast the budget is being consumed) rather than raw threshold crossings, giving earlier, severity-tiered warnings. This reuses the existing slaTargets store and turns SLA from a passive chart into an actionable signal.
  
  Sources: <https://oneuptime.com/blog/post/2026-02-20-monitoring-alerting-best-practices/view> · <https://incident.io/blog/2025-guide-to-preventing-alert-fatigue-for-modern-on-call-teams>
- **Split the 1,652-line monolith into a data layer + per-tab components and memoize ECharts options** _(effort L, impact medium)_  
  The single file mixes simulation, Web Audio, charting, and all 5 tabs, blocking testing and incremental rendering. Extracting a hook-based data layer (e.g. useChannelMetrics) and per-tab files, plus wrapping ECharts option objects in useMemo and using ECharts setOption(notMerge:false) incremental updates, is the documented React/ECharts pattern for smooth real-time dashboards.
  
  Sources: <https://blog.logrocket.com/best-react-chart-libraries-2026/> · <https://www.zigpoll.com/content/how-can-i-optimize-the-rendering-performance-of-large-datasets-in-a-react-dashboard-using-virtualization-techniques>
- **Add per-channel sparklines and an event-acknowledgement workflow** _(effort M, impact medium)_  
  Operators need at-a-glance trend (last N ticks) per channel and a real ack/assign/resolve flow on the timeline. Sparklines via a tiny canvas chart and an enriched AlertEvent (acknowledgedBy, note, resolvedAt) make alerts actionable — best-practice guidance says every alert should answer what/why/what-to-do, cutting MTTR 40-60%.
  
  Sources: <https://oneuptime.com/blog/post/2026-02-20-monitoring-alerting-best-practices/view> · <https://rootly.com/on-call-software/alert-fatigue>

**Recommended deps:** `@tanstack/react-virtual` (Virtualize the alert timeline and notification history lists (currently render all events) so the board stays smooth as persisted events grow toward the 500-item cap.), `simple-statistics` (Provide tested mean/standard-deviation/EWMA primitives for the per-channel adaptive (z-score/EWMA) anomaly thresholds, avoiding hand-rolled stats math.), `date-fns` (Robust, tree-shakeable timestamp formatting and rolling-window math for the timeline, SLA burn-rate windows, and 'Xh ago' incident labels (replacing ad-hoc Date arithmetic).)

**Top pick:** Wire the monitor to the app's real DuckDB datasets (src/core/queries/duckdb.ts) instead of the seededRand simulation. Everything else — adaptive thresholds, dedup, SLA burn-rate, native notifications — only delivers value once the metrics are real; today the feature is a convincing but entirely fabricated demo.

---

## collab-hub — Collaboration hub  
_Maturity: **functional**_

**Current state:** The feature is a self-contained, single-machine "collaboration simulation" under src/features/collab-hub/ rendered by a 5-line route page (src/app/dashboard/collab-hub/page.tsx -> CollabHubScreen.tsx). CollabHubScreen.tsx (508 lines) is a 4-tab shell (Presence & Status, Annotations, Approval Workflow, Audit Trail) using motion/react for transitions, lucide-react icons, and the app's shadcn-style UI primitives (Button, Badge, Avatar, Card). State lives in a Zustand store (store/collab-hub-store.ts) persisted to localStorage via zustand/middleware persist, tracking username, approvalState (DRAFT/REVIEW/APPROVED/REJECTED + history), auditEvents (capped at 500, double-written to a separate localStorage "audit:events" key), presenceUsers, sharedReports, and a cosmetic sessionCode (e.g. "RPT-4821"). Presence (components/PresenceBar.tsx, 420 lines) is the only "real-time" piece: it uses the BroadcastChannel API (channel "collab-hub-presence-v1") with join/leave/heartbeat messages, 10s heartbeats, idle/away thresholds, and stale-peer pruning — but BroadcastChannel is same-origin/same-browser only, so it only shows other tabs on the same machine, never real teammates on other devices. Annotations (hooks/useAnnotations.ts, components/StickyNoteAnnotation.tsx) are sticky notes with color, priority, resolve/unresolve, replies, stored directly in raw localStorage keyed by `annotations:${sectionId}` — bypassing both the Zustand store and the app's TanStack Query/DuckDB data layer; the screen even reads localStorage directly during render to decide empty-state. ApprovalWorkflow.tsx (502 lines) is a polished local state machine with hardcoded TEAM_MEMBERS and reviewer lists; "Share Report" just copies a `window.location.origin/...` URL to the clipboard. AuditTrail.tsx renders the local event log. There is no backend, no CRDT, no cross-device sync, no auth/identity, and no integration with the report sections it claims to annotate.

**Gaps:**
- No real cross-device collaboration: presence uses BroadcastChannel which is limited to tabs in the same browser on the same machine (PresenceBar.tsx line ~100); two real users on two laptops never see each other.
- Annotations, approvals, and audit events are local-only and never synchronized — each user has a totally separate dataset, so 'collaboration' is an illusion.
- Annotations bypass the app's data layer: stored in raw localStorage per section (useAnnotations.ts) instead of TanStack Query/DuckDB or even the Zustand store, and the screen reads localStorage directly during render (CollabHubScreen.tsx AnnotationsTab), which is non-reactive and SSR-fragile.
- No conflict resolution or offline-merge model — concurrent edits would silently overwrite (last-write-wins on a full array via persist()).
- Identity is a free-text 'username' with no auth, no stable user id, and no avatar/color stability across reload (session ids are random per mount).
- Approval reviewers and team members are hardcoded constants (TEAM_MEMBERS in ApprovalWorkflow.tsx); no real user directory.
- Annotations are not anchored to actual chart data points or coordinates — they attach only to a coarse section id, so they cannot point at a specific bar, time range, or value.
- 'Share Report' produces a localhost/origin URL with no actual shareable/exportable artifact and no permission model.
- Audit trail is duplicated across two storage locations (store auditEvents + 'audit:events' localStorage key), risking divergence, and has no immutability/tamper-evidence despite being labeled an audit log.
- No notifications, mentions (@user), or unread state to drive collaboration; the 'badge counts' are purely local.
- No tests visible for the state machine, presence pruning, or annotation persistence.

**Improvements:**

- **Replace BroadcastChannel/localStorage with a Yjs CRDT document for presence, annotations, approvals and audit** _(effort L, impact high)_  
  Yjs is the fastest, most memory-efficient web CRDT and its Awareness protocol is purpose-built for presence (cursors, names, status) — exactly what PresenceBar.tsx hand-rolls today. Moving presenceUsers, annotations, approvalState.history and auditEvents into a shared Y.Doc gives automatic conflict-free merging of concurrent edits instead of the current last-write-wins array overwrites, and Awareness replaces the bespoke heartbeat/idle/prune logic with a maintained standard.
  
  Sources: <https://github.com/yjs/yjs> · <https://docs.yjs.dev/getting-started/adding-awareness> · <https://docs.yjs.dev/api/about-awareness>
- **Add y-webrtc + y-indexeddb so collaboration works peer-to-peer across devices with no server and offline persistence** _(effort L, impact high)_  
  This is a local-first Electron/Next desktop app with no backend, so a serverless transport is the right fit. y-webrtc propagates the Y.Doc peer-to-peer (a signaling server is used only for discovery, not data) and maps naturally onto the existing sessionCode as a room name, finally making 'Share this code with teammates to join' real instead of cosmetic. y-indexeddb stores the doc locally so it loads instantly and survives reloads, replacing the fragile raw-localStorage reads in useAnnotations.ts and the in-render localStorage access in CollabHubScreen.tsx.
  
  Sources: <https://github.com/yjs/y-webrtc> · <https://docs.yjs.dev/ecosystem/connection-provider/y-webrtc> · <https://medium.com/collaborne-engineering/serverless-yjs-72d0a84326a2>
- **Anchor annotations to concrete chart data points / coordinates instead of a coarse section id** _(effort M, impact medium)_  
  Modern BI tools (Power BI/Zebra BI, Databricks AI/BI) let users click a category, data point, or temporal position and comment in-context, which is what makes annotations actionable rather than generic. Today an annotation only knows its sectionId; storing a target descriptor (e.g. series id + x value / time range, or pixel/datum ref) lets notes point at a specific bar, anomaly, or threshold and re-render on the actual chart, closing the gap with the report sections the hub claims to annotate.
  
  Sources: <https://help.zebrabi.com/kb/power-bi/annotation-layer-power-bi-charts/> · <https://docs.databricks.com/aws/en/ai-bi/release-notes/2025>
- **Introduce live multiplayer cursors/selection and stable identity via Yjs Awareness** _(effort M, impact medium)_  
  Awareness fields are free-form JSON, so cursor position, current tab, selected chart, and a stable color/user id can be broadcast to render live cursors and 'who is looking at what'. y-presence provides ready-made React hooks (useOthers-style) over the provider awareness, replacing the per-mount random session ids and unstable hashed colors in PresenceBar.tsx with consistent, reconnect-safe identities and enabling the 'X is viewing Channels' affordance teams expect.
  
  Sources: <https://github.com/nimeshnayaju/y-presence> · <https://liveblocks.io/docs/api-reference/liveblocks-yjs>
- **Make the audit trail a single immutable, append-only log derived from the CRDT** _(effort M, impact medium)_  
  An audit trail labeled 'complete log of all actions' should be tamper-evident and single-sourced. Today it is duplicated between the store's auditEvents array and a separate 'audit:events' localStorage key (collab-hub-store.ts), which can diverge and is fully editable. Backing it with a Y.Array (append-only usage) plus a monotonic clock/op id gives one ordered source of truth that merges across peers and cannot be silently rewritten by a re-render.
  
  Sources: <https://github.com/yjs/yjs> · <https://velt.dev/blog/best-crdt-libraries-real-time-data-sync>

**Recommended deps:** `yjs` (Core CRDT document to hold shared presence, annotations, approval history and audit events with automatic conflict-free merging, replacing the last-write-wins localStorage arrays.), `y-webrtc` (Serverless peer-to-peer transport that syncs the Y.Doc across devices using the existing session code as a room name, making real cross-machine collaboration work without a backend.), `y-indexeddb` (Local-first persistence of the Y.Doc in IndexedDB for instant load and offline durability, replacing fragile raw-localStorage reads in useAnnotations and CollabHubScreen.), `y-presence` (React hooks over Yjs Awareness for multiplayer presence/cursors with stable identity, replacing the hand-rolled BroadcastChannel heartbeat/idle/prune logic in PresenceBar.tsx.)

**Top pick:** Migrate the hub's shared state to a Yjs Y.Doc synced via y-webrtc with y-indexeddb persistence. This single change converts the feature from a same-browser simulation (BroadcastChannel + per-machine localStorage) into genuine cross-device collaboration with conflict-free merging and offline support — it directly fixes the biggest gap (presence/annotations/approvals never reaching real teammates) and is a natural fit for this backendless local-first Electron app, with the existing sessionCode becoming the real join room.

---

## collaboration — Realtime collaboration (yjs/y-websocket) layer  
_Maturity: **stub**_

**Current state:** The feature is a single-file client component at src/features/collaboration/screens/CollaborationScreen.tsx (~1380 lines) rendered verbatim by the route src/app/dashboard/collaborative/page.tsx. Despite yjs ^13.6.31 and y-websocket ^3.0.0 being present in package.json, NEITHER is imported anywhere in the feature — there is no Y.Doc, no WebsocketProvider, no awareness, no IndexedDB persistence. Everything is local React useState. COLLABORATORS is hardcoded to a single "me" user (lines 99-110); INITIAL_COMMENTS/INITIAL_CHANGES/INITIAL_NOTIFICATIONS/ANNOTATIONS are all empty arrays (lines 112-115). The four tabs (Overview, Comments, Changes, Live chat) are real, animated UI (motion/react, lucide-react icons, echarts-for-react charts) but operate purely on in-memory state that is lost on reload and never leaves the tab — comments (handleAddComment line 520), reactions (handleReact line 554), replies (handleReply line 597) and live chat (handleSendChat line 621) only mutate local arrays. The "Overview" charts are fabricated: activityChart (line 666) and contributionChart (line 715) use Math.random(). Real data integration is shallow but present: it reads useDataStore() for dataset/transform/chart counts (line 434), runs a DuckDB SHOW TABLES probe to show a "DuckDB live" dot (lines 465-492 via runReadOnlyQuery from @/platform/duckdb/duckdb), and polls telecom caches every 30s (lines 494-516). Role gating exists via useDashboardAccess() (access.permissions.canEditComments / canShareView), but with one local user it is cosmetic. The "Invite" button is a no-op. There is also a CollaborationScreen.stories.tsx.

**Gaps:**
- No actual realtime sync: yjs and y-websocket are installed but never imported. The entire feature is single-user local state — comments, chat, changes, and presence never propagate to anyone.
- No persistence whatsoever: comments/changes/chat are lost on reload because there is no y-indexeddb provider or any storage. Empty INITIAL_* arrays mean the feature looks broken/empty on first load.
- No presence/awareness: COLLABORATORS is a hardcoded single 'me' user; there are no live cursors, no selected-cell broadcasting, no real online/away status, and the cursor/currentCell fields on the Collaborator type are unused.
- No backend/signaling server: y-websocket requires a WebSocket server (y-websocket server or Hocuspocus); none is configured, and there is no room/document identity tied to the active dataset.
- Fabricated analytics: Overview activity and contribution charts use Math.random() instead of real edit/comment events, so the 'collaboration insights' are meaningless.
- Change Log is inert: the Change type and approval workflow UI exist but no edits to datasets/transforms/charts are ever recorded as Change entries — it is permanently empty.
- Role/permission model is decorative: access control only governs local UI; with no multi-user transport there is no enforcement, no real invite flow, and no per-room ACL.
- Comments are not anchored to real data coordinates: 'cell'/'column' is a free-text string with no link to an actual dataset, column, or row, so comments can't resolve against the DuckDB tables the app actually holds.
- Electron/offline reality ignored: this is a desktop (Electron) local-first app, yet there is no offline-first CRDT story or peer-to-peer option for users not on a shared server.

**Improvements:**

- **Wire a real Y.Doc + provider stack (the dependencies are already installed)** _(effort L, impact high)_  
  yjs and y-websocket are in package.json but unused — the feature is a mockup. Create one Y.Doc per collaboration room (keyed by active dataset/workspace id), back it with a WebsocketProvider (y-websocket) for live sync and y-indexeddb for offline persistence, then replace the local useState arrays for comments/changes/chat with Y.Array/Y.Map observers. Yjs is a conflict-free CRDT so concurrent edits merge automatically; the docs explicitly recommend pairing a network provider with y-indexeddb so the doc loads instantly from local storage and only deltas sync over the wire. This turns every existing handler (handleAddComment, handleReact, handleReply, handleSendChat) into a doc mutation that propagates to all peers with minimal UI rewrite.
  
  Sources: <https://github.com/yjs/yjs> · <https://docs.yjs.dev/getting-started/allowing-offline-editing> · <https://medium.com/@connect.hashblock/from-zero-to-real-time-building-a-live-collaboration-tool-with-yjs-and-next-js-e82eadccd828>
- **Implement presence + live cursors via the Yjs Awareness protocol** _(effort M, impact high)_  
  The Collaborator type already has color/status/cursor/currentCell fields that are never populated. Use provider.awareness.setLocalStateField('user', {name,color}) and broadcast the selected cell/column via a 'cursor' field, then render all peers from awareness.getStates() on the awareness 'change' event. Awareness is an ephemeral CRDT that is NOT persisted in the doc — exactly right for cursors and online/away status — and is the standard pattern for Figma/Google-Docs-style multiplayer presence. This replaces the hardcoded single-user COLLABORATORS array with real online users and color-coded live cursors over the data grid.
  
  Sources: <https://docs.yjs.dev/getting-started/adding-awareness> · <https://docs.yjs.dev/api/about-awareness> · <https://dev.to/superviz/how-to-use-presence-indicators-like-live-cursors-to-enhance-user-experience-38jn>
- **Anchor comments and a real change-log to dataset/column/row coordinates and live DuckDB events** _(effort M, impact medium)_  
  Comments currently take a free-text 'cell' with no link to data, and the Change Log is permanently empty because no edits are recorded. Bind comment anchors to the actual dataset id + column (and optional row key) from useDataStore/DuckDB, and emit a Change entry into a shared Y.Array whenever a transform/filter/chart edit happens, replacing the Math.random() Overview charts with counts derived from those real events. FlowFrame (Yjs-based) and MotherDuck's collaborative DuckDB UI show this is the emerging pattern for collaborative data analysis — comments and presence tied to real query/column context rather than generic chrome.
  
  Sources: <https://flowframe.io/> · <https://motherduck.com/blog/local-duckdb-ui-visual-data-analysis/> · <https://vis.csail.mit.edu/pubs/multi-user-cursors.pdf>
- **Evaluate a managed/edge transport (Liveblocks or Hocuspocus) instead of hand-rolling a y-websocket server** _(effort M, impact high)_  
  y-websocket needs a running WebSocket server that currently does not exist. Rather than operate raw y-websocket infra, Liveblocks acts as a managed Yjs backend providing presence, storage, comments, and notifications via prebuilt React hooks (covering ~90% of typical needs), while Hocuspocus is the reference self-hosted Yjs server for cost control at scale. For this Electron desktop/local-first app, also consider y-webrtc for peer-to-peer rooms (no central server) when users aren't on shared infrastructure. Pick transport deliberately — this is the blocker that decides whether realtime ships at all.
  
  Sources: <https://www.pkgpulse.com/guides/liveblocks-vs-partykit-vs-hocuspocus-realtime-2026> · <https://makerstack.co/reviews/liveblocks-review/> · <https://www.blocknotejs.org/docs/features/collaboration>
- **Decouple the 1380-line monolith and add an offline/connection-status indicator** _(effort M, impact medium)_  
  CollaborationScreen.tsx mixes types, mock data, sub-components, charts, and all logic in one file, which will not survive a real CRDT integration. Extract a useCollabDoc() hook (doc/provider/awareness lifecycle), a comments store, and presented components, and surface real WebsocketProvider connection state (connected/syncing/offline) in the header where the static 'DuckDB live' dot lives now. Yjs+IndexedDB makes a genuine offline-first indicator meaningful in Electron, where the app is frequently used disconnected.
  
  Sources: <https://docs.yjs.dev/getting-started/allowing-offline-editing> · <https://medium.com/dovetail-engineering/yjs-fundamentals-part-2-sync-awareness-73b8fabc2233>

**Recommended deps:** `y-indexeddb` (Offline-first persistence provider for the Y.Doc so comments/changes/chat survive reloads and load instantly from local storage before syncing deltas — the doc-recommended companion to y-websocket.), `y-protocols` (Provides the Awareness implementation (awareness.setLocalStateField/getStates/on('change')) used for presence, online status, and live cursors without persisting ephemeral state into the doc.), `@liveblocks/yjs` (Optional managed Yjs backend (with @liveblocks/client / @liveblocks/react) to get presence, storage, comments, and notifications without operating a WebSocket server — an alternative to self-hosting y-websocket.), `y-webrtc` (Optional peer-to-peer transport for serverless rooms, fitting the Electron local-first model when users are not on shared central infrastructure.), `@hocuspocus/server` (Reference self-hosted Yjs WebSocket server (with auth/persistence hooks) if the team keeps the open-source y-websocket path instead of a managed service.)

**Top pick:** Wire the already-installed yjs + y-websocket + y-indexeddb stack into a real Y.Doc keyed by the active dataset, and migrate the existing comments/changes/chat handlers from local useState to shared Y.Array/Y.Map observers. This is the foundational step that converts the current single-user mockup (empty seed arrays, no imports of the installed CRDT libs) into actual realtime collaboration; presence/cursors, the change-log, and transport hardening all build on top of it.

---

## csv-parser  
_Maturity: **functional**_

**Current state:** A single 1,405-line client component (src/features/csv-parser/screens/CsvParserScreen.tsx) wired to a trivial route (src/app/dashboard/csv-parser/page.tsx). It accepts pasted text or a dropped small file (react-dropzone), parses with papaparse (`Papa.parse(rawText, {...})`) entirely on the main thread (no `worker:true`, no `step`/streaming), then offers column rename/include toggles, per-column type override (string/number/date/boolean), a single-condition filter expression, CSV export, and registration as a DuckDB dataset. Type inference (`detectType`), casting (`castValue`), the filter evaluator (`applyFilter`), and CSV serialization (`rowsToCSV`) are all hand-rolled. Files >16MB (LARGE_FILE_EDITOR_BYTES) are rejected from the editor and pushed to the Electron native picker, which calls `loadUploadPathToDuckDB` (src/platform/duckdb/upload-to-duckdb.ts). The preview is a plain non-virtualized HTML <table> capped at 50/200/500 rows. Datasets flow into the Zustand data-store (src/core/stores/data-store.ts). Notably, arquero is installed (^8.0.3) but is NOT imported by this feature, and the in-browser DuckDB path round-trips through writing a CSV to disk then re-reading it (Electron-only via writeLocalFile + localDataPath).

**Gaps:**
- Parsing blocks the main thread: Papa.parse runs synchronously on rawText with no worker:true and no step/chunk streaming, so a multi-MB paste freezes the UI; papaparse docs explicitly recommend worker+step for large input
- Hard 16MB editor ceiling and the only large-file path is Electron-native, so browser/web users cannot work with large files at all even though DuckDB-wasm could read them in-memory
- Preview <table> is not virtualized; even the 500-row cap renders every cell as DOM nodes, and there is no way to scroll the full dataset
- Type detection is a naive regex/threshold heuristic (>0.85) with no locale awareness, no scientific notation, weak date handling (new Date() parsing), and no detection of nulls/dialect/quote/escape - far behind DuckDB's multi-hypothesis sniffer
- The filter is a single hand-written regex condition with no AND/OR/parentheses, no IN/BETWEEN, and silently returns true on parse failure - a real query engine (DuckDB SQL or arquero) is already available but unused
- DuckDB registration writes a CSV to disk and re-reads it (Electron-only); it should register the in-memory buffer / Arrow table directly so it works in the browser and avoids a full serialize/deserialize round-trip
- No data-quality surfacing: parse errors are truncated to 3 messages, there is no per-column null %, distinct count, min/max, or histogram in the UI despite ColMeta carrying those fields
- arquero is a declared dependency but never used, so the 'papaparse/arquero' intent is only half-implemented
- No encoding/BOM detection (FileReader hardcodes UTF-8), no delimiter auto-confidence feedback, and no handling of TSV/semicolon files dropped as .csv (delimiter is force-set to ',' on .csv)
- Monolithic component mixes parsing, type logic, filtering, export, and DuckDB orchestration with the view - hard to test; there are no unit tests for detectType/castValue/applyFilter

**Improvements:**

- **Move papaparse to a Web Worker with streaming (worker:true + step/chunk)** _(effort M, impact high)_  
  papaparse's own guidance is to combine worker:true with step/chunk so parsing happens off the main thread and rows are processed incrementally without loading the whole file into memory or freezing the page. This directly removes the UI-freeze on large pastes/files and lets you drop the 16MB ceiling while showing parse progress.
  
  Sources: <https://www.papaparse.com/> · <https://app.studyraid.com/en/read/11463/359350/understanding-streaming-in-papaparse>
- **Replace heuristic type/dialect detection with DuckDB-wasm sniff_csv / read_csv auto-detection** _(effort M, impact high)_  
  DuckDB's multi-hypothesis sniffer detects delimiter/quote/escape, headers, date/time formats, and column types (and flags dirty rows) far more robustly than the current >0.85 regex heuristic. Running sniff_csv on a sample gives a column struct you can surface as editable suggested types, and read_csv already powers your DuckDB path - reuse it instead of re-deriving types in JS.
  
  Sources: <https://duckdb.org/2023/10/27/csv-sniffer> · <https://duckdb.org/docs/current/data/csv/auto_detection>
- **Virtualize the preview grid with @tanstack/react-virtual (+ react-table)** _(effort M, impact high)_  
  The current plain <table> caps preview at 500 rows and still mounts every cell. TanStack Virtual renders only the ~20-40 visible rows and scales smoothly to 50k-100k+ rows, letting users scroll the entire parsed dataset (sortable/resizable) instead of an arbitrary slice, while keeping the DOM small.
  
  Sources: <https://tanstack.com/virtual/latest> · <https://medium.com/codex/building-a-performant-virtualized-table-with-tanstack-react-table-and-tanstack-react-virtual-f267d84fbca7>
- **Use the in-browser DuckDB-wasm path for filtering and registration instead of disk round-trips** _(effort L, impact high)_  
  DuckDB-wasm reads CSV/Arrow in-memory and excels at ad-hoc previews and dynamic filter pushdown; benchmarks show SQL-in-WASM beats hand-rolled JS for transforms and gives 'it's just SQL' filtering. Registering the parsed buffer/Arrow table directly (rather than writeLocalFile then re-read) makes the feature work in the browser, not only Electron, and replaces the brittle single-condition regex filter with real SQL WHERE clauses.
  
  Sources: <https://motherduck.com/blog/duckdb-wasm-in-browser/> · <https://www.timlrx.com/blog/the-best-in-browser-data-processing-framework-is-sql/>
- **Use the already-installed arquero for client-side transforms/quality stats when staying off SQL** _(effort M, impact medium)_  
  For small/medium pasted data where spinning up DuckDB is overkill, arquero (~105kB, already a dependency) provides fast columnar derive/filter/rollup to compute null %, distinct counts, and min/max for the column panel and to power export, fulfilling the intended papaparse+arquero design and removing hand-rolled rowsToCSV/applyFilter.
  
  Sources: <https://www.timlrx.com/blog/the-best-in-browser-data-processing-framework-is-sql/> · <https://github.com/timlrx/browser-data-processing-benchmarks>
- **Surface data-quality stats and fuller error reporting in the column panel** _(effort M, impact medium)_  
  ColMeta already carries nullCount/distinctCount/min/max/mean but the UI shows none of it and truncates parse errors to 3. DuckDB's sniffer also identifies dirty/skipped rows; exposing per-column null % bars, distinct counts, and a full error list turns this from a parser into a triage tool, which is the differentiating UX for a data-navigator.
  
  Sources: <https://duckdb.org/2023/10/27/csv-sniffer> · <https://motherduck.com/blog/taming-wild-csvs-with-duckdb-data-engineering/>
- **Split the 1,405-line component and add unit tests for detect/cast/filter** _(effort M, impact medium)_  
  Extracting parsing/type/filter/export logic into pure modules makes the heuristics testable and lets the worker/DuckDB swaps land safely; the current monolith has no tests guarding detectType/castValue/applyFilter behavior.
  
  Sources: <https://www.papaparse.com/> · <https://duckdb.org/docs/current/data/csv/auto_detection>

**Recommended deps:** `@tanstack/react-virtual` (Row virtualization for the preview grid so the full parsed dataset (tens of thousands of rows) scrolls smoothly instead of being capped at 500 non-virtualized rows), `@tanstack/react-table` (Headless table model (sorting, column sizing/pinning) to pair with react-virtual and replace the hand-built <table>; aligns with the app's existing TanStack stack)

**Top pick:** Move papaparse parsing into a Web Worker with streaming (worker:true + step/chunk). It is the highest-leverage fix: it eliminates the main-thread UI freeze that currently forces the 16MB editor ceiling, unlocks large-file handling in the browser (not just Electron), and is the prerequisite that makes virtualized previews and progress feedback actually usable.

---

## dashboard-home  
_Maturity: **partial**_

**Current state:** The feature is a single client component, src/features/dashboard-home/screens/DashboardHomeScreen.tsx (406 lines, plus a .stories.tsx), and it is effectively orphaned: the related route src/app/dashboard/page.tsx just calls redirect("/dashboard/telecom-report"), so nothing actually mounts DashboardHomeScreen today. The component is also tightly coupled to the telecom domain rather than being a generic "home/KPI overview": it pulls datasets from useDataStore (src/core/stores/data-store.ts), filters them with isTelecomDataset / getDatasetReportDate (@/features/telecom/lib/dataset-detection), and renders @/features/telecom/components/overview-tab (OverviewTab, 844 lines) driven by useTelecomAnalytics (src/features/telecom/hooks/use-telecom-analytics.ts). KPIs come from a fixed telecom KPISummary type (src/features/telecom/types.ts: totalTransactions, successRate, totalAmount, peakHour, topErrorCode, etc.) and KPI_FIELDS (src/features/telecom/constants.tsx). The header shows a couple of inline stats (tx count, success rate) with simple threshold coloring. It has a reasonable empty state (DashboardHomeEmptyState) and two spinner loading states (DashboardLoadingState), a dataset picker via a raw <select>, and Refresh/Import/Full-report buttons. Tech in play: Next.js 16 App Router + "use client", Zustand (data-store), lucide-react icons, Tailwind utility classes, and a design-system AtlasKPI card (src/design/blocks/kpi-card.tsx) that already supports delta + trend arrows but is NOT used here. UI strings are hardcoded French.

**Gaps:**
- The route is dead: src/app/dashboard/page.tsx redirects to /dashboard/telecom-report, so DashboardHomeScreen is never rendered — there is no real landing/home experience
- Not a generic dashboard home: hard-coded to telecom (isTelecomDataset filter, OverviewTab, telecom KPISummary). A non-telecom dataset shows only the empty state, so the 'home' has no value for general data-analysis users
- KPI cards lack deltas and trend context — no period-over-period change, no sparklines, no target/threshold indicators beyond a single inline success-rate color. The design system's AtlasKPI (which supports delta + arrows) is unused
- No accessibility affordances: loading spinners and refresh have no aria-live region, KPI values are not announced on update, the dataset <select> and icon-only states lack proper labels
- Zero customization: users cannot reorder, show/hide, or resize KPI widgets on the landing screen (selectedKpis state exists but is only wired into export sections, not the layout)
- No at-a-glance navigation/launchpad: a real home would surface recent datasets, recent queries (QueryHistoryItem exists in data-store), saved charts (SavedChart exists), and quick actions; instead it jumps straight into one telecom overview
- Loading uses a generic full-screen spinner rather than skeleton placeholders that preserve layout, causing layout shift and a slower perceived load
- UI is French-only with hardcoded strings — no i18n layer despite the app shipping a desktop Electron build for presumably broader users

**Improvements:**

- **Wire up a real dashboard home and make it dataset-agnostic** _(effort L, impact high)_  
  Today /dashboard/page.tsx redirects away and DashboardHomeScreen only works for telecom datasets, so most users never see a home screen. A modern dashboard landing should orient the user first: surface recent datasets, recent queries (data-store already has QueryHistoryItem), saved charts (SavedChart), and quick actions, then fall back to a domain overview when a telecom dataset is active. Effective dashboards lead with the most important glanceable info and a clear information hierarchy rather than dumping one fixed report.
  
  Sources: <https://www.datacamp.com/tutorial/dashboard-design-tutorial> · <https://www.uxpin.com/studio/blog/dashboard-design-principles/> · <https://www.resolution.de/post/dashboard-design-best-practices/>
- **Upgrade KPI cards with deltas, sparklines, and consistent trend semantics** _(effort M, impact high)_  
  The current header shows raw values with one ad-hoc success-rate color; the design system AtlasKPI already supports delta + directional arrows but is unused, and there are no sparklines. Best-practice KPI cards follow Label -> Value -> Delta -> Timeframe, include a word-sized sparkline for trend context, and use consistent green-up/red-down coloring (inverted for lower-is-better metrics like avgProcessingMs). Adopt AtlasKPI and add sparklines (data already available via fetchDailyTrend / hourly).
  
  Sources: <https://nastengraph.substack.com/p/kpi-card-anatomy> · <https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design> · <https://www.epcgroup.net/power-bi-kpi-visuals-dashboard-guide-2026>
- **Add accessibility: aria-live status, labeled controls, and skeleton loaders** _(effort M, impact medium)_  
  There is no live region announcing 'analyzing transactions' or KPI updates, the dataset <select> and icon-only badges lack labels, and full-screen spinners cause layout shift. Modern React dashboard a11y guidance recommends a visually-hidden aria-live=polite region for async status/KPI refreshes, semantic labels for all controls, and skeleton placeholders that preserve layout to improve perceived performance and meet WCAG. Pairs well with eslint-plugin-jsx-a11y in CI.
  
  Sources: <https://legacy.reactjs.org/docs/accessibility.html> · <https://react-spectrum.adobe.com/react-aria/accessibility.html> · <https://www.uxpin.com/studio/blog/react-components-screen-reader-accessibility/>
- **Make the KPI/widget layout user-customizable and persisted** _(effort L, impact medium)_  
  selectedKpis already models which KPIs matter but only drives export. A real home benefits from letting users reorder/show-hide/resize KPI and chart widgets, persisted to local storage / the Zustand store. react-grid-layout provides draggable+resizable responsive widgets with breakpoints and an onLayoutChange hook for persistence — a low-risk, well-documented fit for a local-first desktop app.
  
  Sources: <https://github.com/react-grid-layout/react-grid-layout> · <https://www.ilert.com/blog/building-interactive-dashboards-why-react-grid-layout-was-our-best-choice> · <https://www.antstack.com/blog/building-customizable-dashboard-widgets-using-react-grid-layout/>
- **Internationalize the hardcoded French UI strings** _(effort M, impact low)_  
  All labels ('Vue d'ensemble Télécom', 'Actualiser', 'Importer', loading text) are hardcoded French. For an Electron desktop app shipping broadly, extracting strings into an i18n layer (e.g. next-intl / i18next) removes a hard ceiling on the home screen's audience and makes the dataset-agnostic refactor cleaner.
  
  Sources: <https://www.datacamp.com/tutorial/dashboard-design-tutorial> · <https://www.uxpin.com/studio/blog/dashboard-design-principles/>

**Recommended deps:** `react-grid-layout` (Draggable/resizable, responsive KPI and chart widgets for a user-customizable home layout, with onLayoutChange persistence into the existing Zustand store / local storage), `react-sparklines` (Lightweight word-sized sparklines inside KPI cards to give trend context next to each headline value (alternatively reuse the existing recharts dependency with a minimal Sparkline wrapper)), `eslint-plugin-jsx-a11y` (Catch missing labels/aria attributes on the dataset select and KPI/status controls during CI, supporting the accessibility work)

**Top pick:** Wire up a real, dataset-agnostic dashboard home: change src/app/dashboard/page.tsx to actually render a home screen and refactor DashboardHomeScreen so it works for any dataset (recent datasets, recent queries, saved charts, quick actions) instead of redirecting away and only handling telecom. This unlocks every other improvement, because the screen is currently orphaned and effectively dead.

---

## dashboard-shell  
_Maturity: **functional**_

**Current state:** Almost entirely hand-rolled in one ~1567-line client component, src/features/dashboard-shell/components/sidebar-nav.tsx, exporting DashboardLayout plus internal AppSidebar, Topbar, CommandPalette, DatasetPicker, AccessControlPill, GlobalDataSearch. The server layout src/app/dashboard/layout.tsx resolves the better-auth session and renders DashboardClientShell at src/features/dashboard-shell/components/dashboard-client-shell.tsx, which wires the AI panel toggle, LanAccessGate, LanStatusDock and syncs active-dataset context into useAppContextStore. Navigation is a config array NAV_SECTIONS Core/Data/Intelligence plus separate TELECOM_NAV_ITEMS and FOOTER_ITEMS rendered with motion/react and lucide-react. settings-store Zustand persist holds sidebarPinned, showBreadcrumbs, pinnedItems; data-store holds datasets and activeDatasetId. cmdk 1.1.1 and react-resizable-panels 4.11.2 are installed but unused here: the palette, all dropdowns, and click-outside are reimplemented manually with useState and document mousedown listeners. The palette is navigation-only with substring filtering. PageHeader duplicates the breadcrumb logic already in Topbar.</currentState>
</invoke>


**Gaps:**
- Command palette is navigation-only and cannot run actions such as upload, switch active dataset, toggle theme, or open AI panel. It uses naive substring matching with no fuzzy ranking, no recent items, and no virtualization.
- cmdk 1.1.1 is already a dependency but the palette is hand-rolled, missing built-in ARIA roles, screen-reader announcements, roving focus, and focus return to the trigger on close.
- Sidebar collapse state lives in ephemeral useState and is not persisted across reloads, even though settings-store already persists sidebarPinned and pinnedItems.
- No mobile navigation: AppSidebar is hidden on small screens, so most routes are unreachable without a Sheet or drawer. The shell is effectively desktop-only.
- The Intelligence nav section is a flat list of about 16 items with no nesting, grouping, or collapsible subtrees.
- Notifications are a hardcoded mock array in the Topbar with a non-functional Mark all read button; there is no real notification source despite an activity-store existing.
- react-resizable-panels 4.11.2 is installed but the main content and AI panel split is a fixed overlay; users cannot resize or dock the AI panel.
- Breadcrumb logic is duplicated between Topbar (pathname-derived) and a separate PageHeader component.
- No skip-to-content link, and the large single client component ships nav, four popovers, and the palette into every dashboard route as one client island.

**Improvements:**

- **Replace the hand-rolled CommandPalette with the already-installed cmdk and make it action-oriented** _(effort M, impact high)_  
  cmdk 1.1.1 is already in package.json but unused. Adopting it gives built-in ARIA roles, roving focus, keyboard handling and result announcements for free, which the current custom palette lacks. Beyond navigation, register actions (upload, switch active dataset from data-store, toggle theme, open AI panel, go to telecom tabs) so Cmd+K becomes a real command surface rather than a route jumper.
  
  Sources: <https://github.com/dip/cmdk> · <https://uxpatterns.dev/patterns/advanced/command-palette> · <https://github.com/timc1/kbar>
- **Persist sidebar collapse state and add recent items plus fuzzy ranking to search** _(effort S, impact medium)_  
  Modern shadcn-style sidebars persist open and collapsed state so the layout survives reloads; here collapse is ephemeral useState while settings-store already persists sibling prefs, so wiring collapsed into the persisted store is low-effort. Promoting recent commands and datasets before long-tail matches and using fuzzy ranking improves repeat-use speed over the current substring filter.
  
  Sources: <https://ui.shadcn.com/docs/components/radix/sidebar> · <https://github.com/timc1/kbar>
- **Add a mobile drawer sidebar and a skip-to-content link** _(effort M, impact high)_  
  AppSidebar is hidden on small screens, leaving phones and tablets with no navigation. A Sheet or drawer-based off-canvas sidebar (the standard shadcn sidebar pattern, which renders a Sheet on mobile) restores navigation, and a skip-to-content link plus proper landmark roles are baseline accessibility for a shell that wraps every route.
  
  Sources: <https://ui.shadcn.com/blocks/sidebar> · <https://www.freecodecamp.org/news/build-an-admin-dashboard-sidebar-with-shadcn-ui-and-base-ui/>
- **Use react-resizable-panels to make the AI panel a dockable, resizable split** _(effort M, impact medium)_  
  react-resizable-panels 4.11.2 is already installed. The AI panel is currently a fixed overlay; converting the main area and AI panel into a PanelGroup lets analysts resize and dock the assistant alongside their data view and persist the split, leveraging an existing dependency instead of adding one.
  
  Sources: <https://github.com/shadcn-ui/ui/discussions/3167> · <https://ui.shadcn.com/blocks/sidebar>
- **Adopt nuqs for shareable URL state (active dataset, telecom tab, search scope)** _(effort M, impact medium)_  
  The shell drives navigation imperatively with router.push and keeps selection in Zustand only, so dataset and tab selections are not shareable or back-button friendly. nuqs gives type-safe, RSC-compatible URL query state with minimal boilerplate, ideal for data-exploration tools where active selections should live in the URL; this also lets server components read selection via searchParams.
  
  Sources: <https://medium.com/@ruverd/why-you-should-use-nuqs-smarter-url-state-management-for-react-next-js-26a8b51ca1ac> · <https://nextjs.org/docs/app/getting-started/layouts-and-pages>
- **Convert popovers to Radix Popover or DropdownMenu and split the monolith** _(effort L, impact medium)_  
  DatasetPicker, AccessControlPill, GlobalDataSearch and notifications all reimplement click-outside with document mousedown listeners and lack focus trapping and ARIA. The project already uses radix-ui and shadcn DropdownMenu; standardizing on Radix Popover gives accessible focus management and dismissal for free and removes hundreds of lines. Splitting the 1567-line client island into smaller components also trims the JS shipped to every route.
  
  Sources: <https://www.freecodecamp.org/news/build-an-admin-dashboard-sidebar-with-shadcn-ui-and-base-ui/> · <https://nextjs.org/docs/app/getting-started/layouts-and-pages>

**Recommended deps:** `cmdk` (Accessible command-menu primitives (already in package.json at 1.1.1) to replace the hand-rolled CommandPalette and power an action-oriented Cmd+K with proper ARIA and roving focus.), `nuqs` (Type-safe, RSC-compatible URL query state for active dataset, telecom tab and search scope so selections are shareable and back-button friendly.), `react-resizable-panels` (Resizable and dockable split between main content and the AI panel (already installed at 4.11.2, currently unused in the shell).)

**Top pick:** Replace the hand-rolled CommandPalette with the already-installed cmdk and extend it from navigation-only to action-oriented (upload, switch active dataset, toggle theme, open AI panel, jump to telecom tabs). It reuses a dependency the repo already ships, fixes the palette accessibility gaps for free, and turns Cmd+K into the central control surface of the shell.

---

## data-browser — Tabular data browser / virtualized grid (DuckDB-wasm)  
_Maturity: **functional**_

**Current state:** A feature-rich tabular browser over DuckDB-wasm. The Electron-aware route (src/app/dashboard/browser/page.tsx) currently wires the telecom RawDataTab, while the real grid lives in src/features/data-browser/screens/DataBrowserScreen.tsx (3129 lines, single "use client" component) with sub-widgets in components/table-widgets.tsx, SQL builders in model/helpers.ts, and types in model/types.ts. It loads datasets via listRegisteredDatasets()/runReadOnlyQuery() from src/platform/duckdb/duckdb.ts, supports native-file import (loadUploadPathToDuckDB), and offers 4 view modes (table/cards/analytics/sql). Tech in use: @tanstack/react-virtual (row windowing), fuse.js (fuzzy search), immer (produce), motion/react, lucide-react, @monaco-editor/react (lazy SQL editor), echarts-for-react (column histograms + analytics charts), exceljs (xlsx export). Features include multi-sort (shift-click), AND/OR filter rules, column pin/hide/resize, per-column stats (MIN/MAX/AVG/distinct/null + top-20 histogram via runReadOnlyQuery), cell heatmap, selection aggregates, CSV/JSON/XLSX export, and column-type inference (inferColType). Pagination is classic page-based LIMIT/OFFSET (PAGE_SIZES, page/pageSize state in DataBrowserScreen.tsx ~L258), with a COUNT(*) + data query per page in fetchRows (L486-525).

**Gaps:**
- SQL injection / correctness bug: model/helpers.ts quoteIdentifier and quoteLiteral use String.replace('"', ...) / replace("'", ...) with a string argument, which replaces only the FIRST occurrence — values like O'Bri'en or col"name break escaping. Worse, numeric operators (gt/gte/lt/lte/between/in) interpolate r.value with NO escaping at all (helpers.ts L46-71), so filter input flows raw into SQL.
- No parameterized queries: platform/duckdb/duckdb.ts runReadOnlyQuery only accepts a raw SQL string; there is no prepared-statement/bind path, so every filter and the column-stats queries are built by string concatenation.
- Virtualization is shallow: useVirtualizer windows only rows.length (DataBrowserScreen.tsx L661), i.e. the current page already in memory. There is no infinite/windowed scroll over the full dataset, so users page manually instead of scrolling millions of rows.
- Search, selection stats, and heatmap are page-local only: Fuse search (L1019) and selectionStats/columnRanges operate on the in-memory page, so 'Search rows' silently misses rows outside the current page and selection math is per-page.
- No column virtualization: all visible columns render (table-widgets ColumnHeader), so wide datasets (100s of columns) render every cell — only rows are virtualized.
- Filtering re-runs full COUNT(*) + data query on every keystroke/state change (fetchRows in useEffect L527) with no debounce, hammering DuckDB on each filter character.
- Column profiling is hand-rolled and partial: loadColumnStats runs 2 bespoke queries per column and the 'histogram' is really a top-20 GROUP BY (not numeric bins); DuckDB's single-pass SUMMARIZE / approx_count_distinct is unused.
- Monolithic 3129-line component holds ~40 useState hooks and all view modes, making it hard to test, lazy-load, or memoize; no use of @tanstack/react-table for column/row model, grouping, or pinning logic.
- Cell editing state (editedCells, editingCell) exists but there is no persistence path back to DuckDB and read-only runReadOnlyQuery cannot write — edits are display-only.
- Export serializes only in-memory rows (exportData/exportJSON/exportExcel use rows or selected rows), so 'export all' on a filtered 5M-row table exports just the current page, not the full result set.

**Improvements:**

- **Fix SQL escaping + add a parameterized query path in runReadOnlyQuery** _(effort M, impact high)_  
  helpers.ts quoteIdentifier/quoteLiteral use String.replace with a string (replaces only the first quote) and numeric operators interpolate raw user input — both a correctness and injection bug. Switch to replaceAll (page.tsx already uses replaceAll, so the codebase mixes both) and, better, extend runReadOnlyQuery to accept bind values so DuckDB-wasm prepared statements ('?'/$ placeholders) escape and type filter values. DuckDB docs confirm prepared statements 'avoid string concatenation/SQL injection attacks' and duckdb-wasm supports positional '?' binding.
  
  Sources: <https://duckdb.org/docs/current/clients/c/prepared> · <https://github.com/duckdb/duckdb-wasm/issues/117> · <https://motherduck.com/glossary/parameterized%20query/>
- **Replace page-based LIMIT/OFFSET with windowed infinite scroll over the full dataset** _(effort L, impact high)_  
  Today useVirtualizer only windows the current in-memory page (L661), so the virtualizer's value is wasted and users must click through pages. The canonical 2025 pattern is TanStack Virtual + an infinite query that calls fetchNextPage() as the user scrolls near the end, keeping only nearby pages in state ('windowing prevents unbounded memory growth'). Keyset/range-based fetches (WHERE keyset > last) avoid OFFSET cost on large tables.
  
  Sources: <https://tanstack.com/table/v8/docs/framework/react/examples/virtualized-infinite-scrolling> · <https://deepwiki.com/TanStack/virtual/4.3-infinite-scrolling> · <https://makersden.io/blog/infinite-scroll-streaming-data-tanstack-query-react19>
- **Adopt @tanstack/react-table for the column/row model and add column virtualization** _(effort L, impact high)_  
  The 3129-line component hand-rolls sorting, pinning, visibility, and resizing. TanStack Table is headless/MIT (~30KB), integrates directly with TanStack Virtual, and supports row AND column virtualization — needed because the grid currently renders every visible column. This shrinks the component, enables wide-dataset performance, and keeps full UI control (vs AG Grid's enterprise paywall).
  
  Sources: <https://tanstack.com/table/v8/docs/guide/virtualization> · <https://www.simple-table.com/blog/tanstack-table-vs-ag-grid-comparison> · <https://tanstack.com/table/v8/docs/enterprise/ag-grid>
- **Push search + stats server-side and debounce filter/search input** _(effort M, impact high)_  
  Fuse search and selection/heatmap math run on the current page only, giving wrong results on large tables; fetchRows also re-queries on every keystroke. Debounce input (modern grids 'wait milliseconds after a keystroke before filtering') and translate global search into a server-side WHERE (DuckDB ILIKE / contains across columns) so results are correct across the whole dataset.
  
  Sources: <https://www.syncfusion.com/blogs/post/top-react-data-grid-libraries> · <https://dev.to/ainayeem/building-an-efficient-virtualized-table-with-tanstack-virtual-and-react-query-with-shadcn-2hhl>
- **Replace bespoke per-column stats with DuckDB SUMMARIZE / approx_count_distinct** _(effort M, impact medium)_  
  loadColumnStats fires 2 custom queries per column and the 'histogram' is a top-20 GROUP BY, not real numeric bins. DuckDB SUMMARIZE computes min/max/approx_unique/avg/std/q25/q50/q75/count/null% for ALL columns in a single optimized pass, and approx_count_distinct (HyperLogLog) gives cheap distinct counts on huge tables — faster, more accurate profiling with far less code.
  
  Sources: <https://duckdb.org/docs/current/guides/meta/summarize> · <https://motherduck.com/glossary/SUMMARIZE/> · <https://duckdb.org/docs/current/sql/samples>
- **Use reservoir sampling for instant previews and type inference on large tables** _(effort S, impact medium)_  
  inferColType samples a single LIMIT 1 row and the cards/analytics views scan full tables. DuckDB's USING SAMPLE (reservoir/system) returns fast, statistically honest previews so type inference, heatmap ranges, and chart pre-views stay responsive on multi-GB datasets instead of full scans.
  
  Sources: <https://duckdb.org/docs/current/sql/samples> · <https://medium.com/@jickpatel611/7-duckdb-sampling-techniques-for-fast-honest-previews-b16c89b63fbf>
- **Stream full-result exports through DuckDB COPY instead of serializing in-memory rows** _(effort M, impact medium)_  
  exportData/exportJSON/exportExcel only serialize the current page's rows, so exporting a filtered large table silently truncates. Run the same WHERE/ORDER BY as a DuckDB COPY (TO CSV/PARQUET/JSON) or paginated stream to disk via the existing Electron FS path, so 'export all' actually exports the full filtered result set.
  
  Sources: <https://duckdb.org/docs/current/guides/meta/summarize> · <https://deepwiki.com/duckdb/duckdb-wasm/8.1-basic-usage-patterns>

**Recommended deps:** `@tanstack/react-table` (Headless column/row model (sorting, pinning, visibility, column virtualization) to replace hand-rolled logic and pair with the existing @tanstack/react-virtual.), `@tanstack/react-query` (useInfiniteQuery to drive windowed infinite scroll + caching of page/range fetches against DuckDB (the repo already uses TanStack Query via query-provider).), `use-debounce` (Debounce filter/search input so fetchRows/COUNT(*) does not re-run on every keystroke.)

**Top pick:** Fix the SQL escaping/injection bug in model/helpers.ts (replace-only-first-quote in quoteIdentifier/quoteLiteral and raw interpolation in numeric/between/in operators) and route filter values through a parameterized runReadOnlyQuery — it is a correctness AND security defect on the hottest path, and the bind path it forces is the foundation for the server-side search/infinite-scroll work.

---

## data-formulator — Interactive chart/data formulation (vega/vega-lite)  
_Maturity: **functional**_

**Current state:** A large, ambitious local-first "Moudir AI" workbench. The route (src/app/dashboard/data-formulator/page.tsx) renders src/features/data-formulator/screens/DataFormulatorScreen.tsx (~1,550 lines), a canvas-card workbench wired to a DuckDB-wasm dataset catalog (listRegisteredDatasets/runReadOnlyQuery from @/platform/duckdb/duckdb). It loads the active dataset as SELECT * ... LIMIT 2000 into React state and runs a rich set of edge-AI agents via @mlc-ai/web-llm + an Ollama provider: auto-dashboard (core/auto-dashboard.ts), signal-radar, investigation/root-cause, scenario, briefing, manager-answer, plus an AG-UI streaming agent loop (runtime/agent-runtime.ts, agui-stream.ts, agent-graph.ts), MCP client (core/mcp-client.ts), a local RAG/vector-search stack (core/vector-search.ts, rag/*), and Tunisian/Arabic intent normalization (core/language/intent). The chart pipeline is the Data Formulator pattern: a typed ChartSpec with encoding channels (x/y/color/size/facet, aggregate, timeUnit, bin) in core/types.ts is compiled to DuckDB SQL in core/sql.ts (aliasing outputs to fixed x_val/y_val/color_val/size_val), then rendered. Crucially, despite the "vega/vega-lite" label and vega/vega-lite/react-vega being installed in package.json, actual rendering is a hand-rolled imperative ECharts option builder (core/chart-options.ts -> echarts-for-react in components/bento-chart-grid.tsx); Vega-Lite is not used. The store (store.ts) already models exploration threads with parentId branching and forkStep(), but the main screen drives a flat linear flow via addHistoryNode(query). Agents receive only rows.slice(0,12) — a 12-row sample — as their data context.

**Gaps:**
- Installed Vega-Lite/react-vega are unused; charts go through a bespoke ECharts builder hardwired to x_val/y_val/color_val aliases, so chart variety, layering, faceting, and interaction are capped by handwritten branches in chart-options.ts rather than a grammar of graphics.
- LLM chart authoring does not emit a portable declarative spec. Microsoft's Data Formulator generates Vega-Lite directly (LLMs are strong at it); here the model maps to a constrained internal ChartSpec, losing expressiveness and making 'refine' brittle.
- No constrained/grammar-guided JSON decoding for the local model. Spec/answer generation relies on prompt-coaxed JSON (core/json.ts, ai-schemas.ts), which is fragile on small web-llm models versus schema-constrained decoding.
- Data threads / forking exist in the store (forkStep, parentId) but are not surfaced as a real non-linear authoring history in the screen — the headline Data Formulator UX (navigate back, fork a branch, incremental refine) is effectively missing from the main flow.
- Agents reason over only a 12-row sample (rows.slice(0,12)) while up to 2000 rows are loaded client-side; this undermines anomaly/signal/investigation quality and risks hallucinated aggregates instead of pushing computation into DuckDB.
- Canvas loads SELECT * LIMIT 2000 into JS/React state rather than leaning on DuckDB+Arrow for aggregation; large datasets will be truncated or memory-heavy, and per the DuckDB-wasm guidance JS-object processing is 10-100x slower than Arrow.
- No automatic chart-type recommendation from field types/cardinality (Vega-Lite/Compass-style); chart type is left to the LLM or hardcoded heuristics with no ranked suggestions surfaced to the user.
- Encoding shelf is conceptual only — there is no direct drag-field-to-channel UI; users must phrase everything in natural language, the opposite of Data Formulator's hybrid UI+NL model.

**Improvements:**

- **Render charts with Vega-Lite (already a dependency) and have the LLM emit Vega-Lite specs** _(effort L, impact high)_  
  vega, vega-lite and react-vega are already installed but unused; rendering is a bespoke ECharts builder limited to x_val/y_val/color_val. Microsoft Data Formulator's own architecture generates a Vega-Lite script and LLMs are documented to be strong at producing Vega-Lite. Switching the chart layer to Vega-Lite unlocks layering, faceting, multi-view, and portable specs without adding deps, and makes 'refine' a spec edit rather than re-deriving an internal ChartSpec.
  
  Sources: <https://www.microsoft.com/en-us/research/blog/data-formulator-exploring-how-ai-can-help-analysts-create-rich-data-visualizations/> · <https://vega.github.io/vega-lite/> · <https://arxiv.org/html/2601.15385v1>
- **Add grammar/schema-constrained JSON decoding for the local model** _(effort M, impact high)_  
  Spec and manager-answer generation depend on prompt-coaxed JSON parsing (core/json.ts, ai-schemas.ts), which is fragile on small local models. Constrained decoding (XGrammar/llguidance-style) guarantees schema-valid output, improving reliability of chart-spec and agent outputs and reducing parse-retry loops. web-llm exposes grammar/JSON-schema response formats that can back the existing zod-style ai-schemas.
  
  Sources: <https://mbrenndoerfer.com/writing/constrained-decoding-structured-llm-output> · <https://medium.com/@emrekaratas-ai/structured-output-generation-in-llms-json-schema-and-grammar-based-decoding-6a5c58b698a6>
- **Push aggregation into DuckDB and feed agents real aggregates, not a 12-row sample** _(effort M, impact high)_  
  Agents currently see rows.slice(0,12), and the canvas pulls SELECT * LIMIT 2000 into JS. DuckDB-wasm aggregates 10M rows in ~1.8s and Arrow processing is 10-100x faster than JS objects. Generating profiling/summary SQL (counts, distincts, min/max/quantiles, group-bys) and handing those results to signal/investigation/scenario agents will sharply improve correctness and scale, and reduce hallucinated numbers.
  
  Sources: <https://motherduck.com/blog/duckdb-wasm-in-browser/> · <https://travishorn.com/high-performance-data-visualization-in-the-browser-with-duckdb-and-parquet/>
- **Surface the existing data-thread/fork model as real non-linear authoring history** _(effort M, impact high)_  
  store.ts already implements exploration threads with parentId and forkStep(), but the screen uses a flat addHistoryNode flow. Data Formulator 2's signature UX is navigating to an earlier result, forking a branch, and asking AI for incremental updates rather than re-describing a chart. Wiring the existing thread store into a visible thread/branch panel delivers the headline feature with infrastructure that already exists.
  
  Sources: <https://arxiv.org/html/2408.16119v2> · <https://www.microsoft.com/en-us/research/publication/data-formulator-2-iteratively-creating-rich-visualizations-with-ai/>
- **Add a drag-field-to-channel encoding shelf plus ranked chart-type recommendations** _(effort L, impact medium)_  
  The feature is NL-only today; Data Formulator's core is a hybrid encoding shelf where users drop fields onto x/y/color/size channels and optionally name new (AI-derived) fields. Pairing this with automatic chart-type suggestions driven by field type/cardinality (grammar-of-graphics / Vega-Lite recommendation) gives direct manipulation alongside NL and reduces reliance on the model for trivial chart choices.
  
  Sources: <https://www.microsoft.com/en-us/research/blog/data-formulator-exploring-how-ai-can-help-analysts-create-rich-data-visualizations/> · <https://vega.github.io/vega-lite/docs/>

**Recommended deps:** `react-vega` (Already in package.json but unused — use it to render LLM-generated Vega-Lite specs in the canvas/bento cards, replacing or complementing the bespoke ECharts builder.), `vega-lite` (Already installed; make it the declarative chart grammar the local model targets, enabling layering/faceting/multi-view and portable specs.), `compassql` (Vega/UW grammar-of-graphics chart recommendation engine; rank chart designs from field types/cardinality to power encoding-shelf and 'best chart' suggestions instead of hardcoded heuristics.), `ajv` (Validate LLM-emitted Vega-Lite / ChartSpec JSON against a schema as a safety net alongside constrained decoding, with fast repair/retry on invalid specs.)

**Top pick:** Switch the chart layer to the already-installed Vega-Lite and have the local LLM emit Vega-Lite specs directly. It aligns the feature with the genuine Data Formulator architecture, removes the x_val/y_val/color_val straitjacket in chart-options.ts, makes refinement a spec edit, and uses dependencies that are already in the tree — turning the "vega/vega-lite" label into reality.

---

## data-import — File/data import pipeline (dropzone, exceljs, DuckDB)  
_Maturity: **functional**_

**Current state:** The feature is implemented almost entirely in one 1154-line client component, src/features/data-import/screens/DataImportScreen.tsx, mounted by the trivial route src/app/dashboard/upload/page.tsx. Supporting model files: types.ts (UploadStatus/ParsedFileInfo/ColumnInfo/ValidationIssue/UploadSettings), helpers.tsx (formatBytes, detectFileType, inferColumnType, computeColumnStats, computeQualityScores completeness/accuracy/consistency/uniqueness, columnInfoToColMeta, StatusStep UI), xlsx.ts (a parseXLSXRows ExcelJS helper), and upload-history.ts (a hardcoded mock history item). Actual loading goes through src/platform/duckdb/upload-to-duckdb.ts -> registerCSVPathDataset/registerParquetPathDataset, which converts CSV/TSV/TXT to managed Parquet and registers a DuckDB view, returning preview rows + preview-derived column stats. Libraries in use: react-dropzone, immer, motion/react, lucide-react, zustand stores (data-store, app-context-store, activity-store), Next router/searchParams, and Electron FS bridge (openFileDialog, listLocalFilesRecursive, isElectron). Import is Electron-path-only: onDrop deliberately rejects browser drag-and-drop with a notice ("Drag-and-drop File objects do not expose trusted filesystem paths to DuckDB") and the dropzone uses noClick/noKeyboard; if !isElectron the UI shows an amber "requires Electron" warning and no import is possible. The pipeline cards display 5 steps (reading/parsing/validating/loading_db/done) but progress is faked: a setTimeout(80ms) and fixed progress values (10/35/75/100), not real byte/row progress. UI text is mixed French/English. Telecom mode adds required-column validation via getTelecomDatasetProfile.

**Gaps:**
- Browser/web import is unsupported: drag-and-drop is intentionally disabled and the whole feature no-ops outside Electron, despite the app being a Next.js web+Electron product and DuckDB-wasm supporting registerFileBuffer/registerFileHandle ingestion in the browser.
- exceljs is a dependency and xlsx.ts exists, but parseXLSXRows is never imported or wired into the pipeline — XLSX/Excel files cannot actually be imported. FileType is literally only 'csv', and JSON is unsupported too.
- Progress/pipeline is simulated, not real: setTimeout(80) plus hardcoded progress values (10/35/75/100) and a single 'parseTime'. No streaming progress, no row counts during load, no cancellation for large files.
- No column mapping / schema mapping step. There is no way to rename columns, override inferred types, choose a header row, or map source headers onto an expected schema (the modern file -> map -> validate -> submit flow is absent except for telecom's fixed required-column check).
- Validation is shallow and preview-only: buildValidationIssues only flags empty files and >30% nulls in the 100-row preview; quality scores in helpers.tsx are computed from preview rows, not the full table (metadataSource is 'preview'). No type-mismatch, duplicate, encoding, or constraint validation.
- No encoding or delimiter detection/override. UploadSettings has encoding/skipEmptyLines/trimWhitespace/maxRows/hasHeader fields but they are frozen via useState with no UI to change them, and most are not passed to DuckDB.
- upload-history.ts is a hardcoded mock (Q4_Sales_Report.csv) and session imports live only in component useState — no persisted import history or re-import.
- All logic lives in one 1154-line component mixing UI, pipeline orchestration, DuckDB calls, telecom logic, and quality scoring — hard to test; there are stories but no unit tests for the pipeline.
- UI copy is inconsistently bilingual (French headers, English validation messages), and accessibility of the custom dropzone (noKeyboard) is limited.

**Improvements:**

- **Add real browser-side import via DuckDB-wasm registerFileBuffer/registerFileHandle (drag-and-drop that works on web)** _(effort L, impact high)_  
  The feature currently no-ops without Electron and explicitly rejects drag-and-drop. DuckDB-wasm officially supports ingesting File/Blob via registerFileHandle/registerFileBuffer and read_csv, so the same dropzone can load files directly in the browser without trusted FS paths. This unlocks the entire web build and makes the prominent dropzone functional instead of a dead UI.
  
  Sources: <https://duckdb.org/docs/stable/clients/wasm/data_ingestion> · <https://deepwiki.com/duckdb/duckdb-wasm/4.4-data-import-and-export>
- **Introduce a file -> map -> validate -> submit flow with a column-mapping step** _(effort L, impact high)_  
  Multiple import-UX guides converge on the file->map->validate->submit pattern as the single biggest reducer of failed imports. Today there is no mapping step at all (only telecom's fixed required-column check). Adding header-row selection, type override, and source->schema mapping with auto-matched columns the user can confirm would dramatically improve correctness for messy real-world files.
  
  Sources: <https://dromo.io/blog/ultimate-guide-to-csv-imports> · <https://blog.csvbox.io/column-mapping-saas/> · <https://www.importcsv.com/blog/data-import-ux>
- **Auto-suggest column mappings with fuzzy header matching** _(effort M, impact medium)_  
  Guides recommend fuzzy matching to auto-suggest mappings and remembering past mappings. With the telecom required-columns (and future schemas), Dice-coefficient or Damerau-Levenshtein scoring on normalized headers can pre-fill mappings the user just confirms, cutting friction. Lightweight, well-maintained npm options exist (fast-fuzzy, string-similarity, fastest-levenshtein).
  
  Sources: <https://dromo.io/blog/ultimate-guide-to-csv-imports> · <https://www.npmjs.com/package/fast-fuzzy> · <https://www.npmjs.com/package/string-similarity>
- **Replace simulated progress with real streaming/byte progress and cancellation** _(effort M, impact medium)_  
  The pipeline fakes progress (setTimeout + hardcoded 10/35/75/100). Best-practice large-file handling streams in chunks so memory stays flat and users see real-time progress and can cancel. Wiring DuckDB-wasm/Arrow batch streaming (or Electron file size + row counts) into the existing StatusStep UI makes the pipeline honest and usable for 100MB+ files.
  
  Sources: <https://blog.csvbox.io/large-csv-import/> · <https://duckdb.org/docs/stable/clients/wasm/data_ingestion>
- **Wire up XLSX and JSON import (use the already-present exceljs helper) or prefer DuckDB-native readers** _(effort M, impact medium)_  
  exceljs is already a dependency and xlsx.ts/parseXLSXRows exists but is never called, so Excel files silently cannot be imported even though users will drop them. Either connect parseXLSXRows (sheet picker -> rows -> DuckDB) or move to DuckDB's spatial/excel + read_json readers. Expanding beyond CSV/TSV/TXT/Parquet matches what users actually have.
  
  Sources: <https://duckdb.org/docs/stable/clients/wasm/data_ingestion> · <https://dromo.io/blog/ultimate-guide-to-csv-imports>
- **Add encoding + delimiter auto-detection with user override** _(effort M, impact medium)_  
  Files from older Windows apps arrive as Windows-1252/ISO-8859-1; assuming UTF-8 causes garbled text. The UploadSettings type already has encoding/delimiter intent but no detection or UI. Statistical delimiter inference plus charset detection (e.g. chardet/jschardet) transcoded to UTF-8 before DuckDB ingestion removes a whole class of corrupted-import bugs.
  
  Sources: <https://dromo.io/blog/ultimate-guide-to-csv-imports> · <https://www.npmjs.com/package/fast-fuzzy>
- **Compute validation/quality on the full table via DuckDB SUMMARIZE instead of the 100-row preview** _(effort M, impact medium)_  
  buildValidationIssues and computeQualityScores only see the 100-row preview (metadataSource:'preview'), so null/uniqueness/type stats and the displayed quality score can be misleading on large files. DuckDB's SUMMARIZE/aggregate queries give true full-table profiling cheaply since the data is already a view, surfacing accurate row-level and column-level issues.
  
  Sources: <https://duckdb.org/docs/stable/clients/wasm/data_ingestion> · <https://dromo.io/blog/ultimate-guide-to-csv-imports>
- **Extract the pipeline out of the 1154-line component into a tested hook/service and unify copy** _(effort M, impact low)_  
  DataImportScreen.tsx mixes UI, DuckDB orchestration, telecom logic, and quality scoring in one file with no unit tests for the pipeline, and copy is inconsistently French/English. Extracting an import-pipeline hook/service (and a persisted history store replacing the mock upload-history.ts) makes the flow testable and lets the new mapping/validation steps be added safely.
  
  Sources: <https://www.importcsv.com/blog/data-import-ux> · <https://www.oneschema.co/blog/building-a-csv-uploader>

**Recommended deps:** `fast-fuzzy` (Fast Damerau-Levenshtein-based scoring (0-1) to auto-suggest source-header -> schema-column mappings in a new column-mapping step.), `string-similarity` (Lightweight Dice-coefficient header similarity as an alternative/complement for ranking auto-match suggestions.), `jschardet` (Detect file character encoding (Windows-1252/ISO-8859-1 vs UTF-8) before ingestion so non-UTF-8 CSVs are transcoded instead of imported garbled.)

**Top pick:** Make the dropzone actually work in the browser via DuckDB-wasm registerFileHandle/registerFileBuffer ingestion. Right now the feature's most prominent UI (the drag-and-drop zone) is deliberately disabled and the whole import flow no-ops outside Electron, so web users cannot import anything; enabling real browser ingestion is the highest-leverage fix and is the foundation the mapping/validation/streaming improvements build on.

---

## data-transform — Data transformation / wrangling  
_Maturity: **functional**_

**Current state:** A single 1467-line client component at /mnt/d/data-navigator/src/features/data-transform/screens/DataTransformScreen.tsx (wrapped by /mnt/d/data-navigator/src/app/dashboard/transform/page.tsx) implements a linear "Transform Pipeline" builder. Users add ordered steps (filter, select, rename, derive, aggregate, sort, deduplicate, limit, plus declared-but-unimplemented join/pivot), toggle/reorder them with up/down chevrons, then "Run Pipeline". Execution lives in runPipeline(): for each enabled step it builds a SQL string via stepToSQL() and runs `CREATE OR REPLACE TABLE "step_<id>" AS (...)` through runReadOnlyQuery() from /mnt/d/data-navigator/src/platform/duckdb/duckdb.ts, chaining each step's output table into the next. It then SELECTs a 50-row preview, generates a readable SQL script (shown read-only in a Monaco editor / SQL tab), records an in-memory run history (last 10), and pushes an activity event + app-context via useActivityStore/useAppContextStore. The UI uses shadcn/ui primitives, motion/react animations, lucide icons, and an ECharts "row reduction funnel" in the Analytics tab. State is entirely React useState with immer (produce) for step edits; the source table is resolved from useDataStore (activeDataset.tableName / loadedTableNames / SHOW TABLES).

**Gaps:**
- SQL is assembled by naive string interpolation in stepToSQL() — user free-text (filter conditions, columns, aggregations, aliases) is injected raw into CREATE TABLE statements; identifier escaping uses `.replace('"','""')` which is NON-global (only escapes the first quote), so quotes in table names break/inject. There is no validation or DuckDB-side identifier quoting helper.
- Despite the name runReadOnlyQuery, the pipeline issues CREATE OR REPLACE TABLE (writes), and litters the DuckDB session with step_<id> tables that are never cleaned up, risking name collisions and memory growth across runs.
- join and pivot are advertised as StepType values with colors/icons but silently fall through to `SELECT *` in stepToSQL() — dead/misleading features.
- rename actually ADDS a column (`SELECT *, <expr> AS alias`) rather than renaming, so the step is mislabeled and cannot rename a column.
- No persistence: the entire pipeline lives in useState and is lost on reload/navigation; no save/load of named recipes, no undo/redo, no export of the pipeline definition (only generated SQL can be copied).
- Analytics is partly fake — the funnel hardcodes `{ label: 'Source', rows: 10000 }` and the Reduction stat divides by a literal 10000 instead of sourceRowCount, so percentages are wrong for any real dataset.
- Reordering is fake drag-and-drop: GripVertical is imported and @dnd-kit/sortable is already a dependency, but only up/down buttons exist.
- No data profiling / quality signals: users get no column types, null %, distinct counts, or distributions to guide which transforms to apply, and no detection of dirty data (whitespace, casing, duplicates) — the core value of OpenRefine/Trifacta-style tools.
- No column- or value-aware UX: every config field is a raw SQL text input (column names, WHERE clauses, agg expressions) — there are no column pickers, operator dropdowns, or autocomplete, so it requires SQL fluency.
- Re-runs the whole pipeline from the source every time with no caching/short-circuiting on unchanged upstream steps, and runs a separate COUNT(*) per step (extra full scans).
- No materialization/export of the result: the output table isn't persisted as a named dataset the rest of the app can reuse beyond the transient step_<id> table set in app-context.
- Heavy queries run via runReadOnlyQuery on what appears to be the main thread path with artificial setTimeout(60) pacing rather than a Web Worker, risking UI jank on large data.

**Improvements:**

- **Centralize safe SQL generation: quote identifiers correctly and validate/sanitize expressions** _(effort S, impact high)_  
  stepToSQL uses string concatenation with a non-global `.replace('"','""')`, so identifiers with quotes break and free-text fields are an injection surface. Add a quoteIdent() (global double-quote escaping) and quoteLit() helper, restrict structural fields (column/groupBy/sort) to validated identifiers chosen from the profiled schema, and keep raw SQL only for explicitly-advanced expression fields. DuckDB-wasm runs locally so the threat is corruption/crashes more than exfiltration, but correctness and predictable errors matter and the same generator should drive both execution and the displayed SQL.
  
  Sources: <https://github.com/duckdb/duckdb-wasm> · <https://motherduck.com/blog/duckdb-wasm-in-browser/>
- **Add a column profiling panel powered by DuckDB SUMMARIZE** _(effort M, impact high)_  
  Modern wrangling tools (Trifacta/Designer Cloud, OpenRefine) lead with data profiles — per-column type, null %, distinct count, min/max/quartiles, and distribution — to guide transforms. DuckDB's SUMMARIZE computes exactly this (count, approx_unique, avg, std, q25/q50/q75, min, max, null %) in a single optimized scan, and since 0.10 can be used as a SELECT source for further filtering. Render mini-histograms (you already use ECharts) per column so users see what to clean before writing SQL.
  
  Sources: <https://duckdb.org/docs/current/guides/meta/summarize> · <https://motherduck.com/glossary/SUMMARIZE/> · <https://hevodata.com/learn/data-wrangling-tools/>
- **Replace up/down reordering with real @dnd-kit/sortable drag-and-drop** _(effort S, impact medium)_  
  @dnd-kit/sortable + @dnd-kit/core are already dependencies and GripVertical is already imported, but reordering is limited to chevron buttons. Drag-and-drop step reordering is the baseline interaction users expect from visual pipeline builders and is low-risk to add since the data model (ordered steps array) already supports it.
  
  Sources: <https://hevodata.com/learn/data-wrangling-tools/> · <https://www.onepotenza.com/blog/data-analytics/top-7-data-wrangling-tools/>
- **Persist pipelines as named recipes with undo/redo and JSON export** _(effort M, impact high)_  
  All state is ephemeral useState, so a pipeline is lost on reload. OpenRefine's core model is a reusable operation history (recipe) that can be saved, replayed on new data, and shared. Persist steps to a Zustand store (the app already uses Zustand) + IndexedDB, add undo/redo over the immer step array, and allow exporting/importing the pipeline definition (not just the generated SQL).
  
  Sources: <https://openrefine.org/docs/manual/cellediting> · <https://snicsolutions.com/compare/trifacta-alternatives>
- **Fix analytics correctness and add real lineage metrics** _(effort S, impact medium)_  
  The funnel hardcodes a 10000-row source and the Reduction stat divides by literal 10000, producing wrong numbers on any real dataset. Use sourceRowCount as the baseline, show true per-step in/out deltas (already tracked) and rows-dropped, and surface this as honest lineage. Correctness here is cheap and currently actively misleading.
  
  Sources: <https://hevodata.com/learn/data-wrangling-tools/>
- **Replace raw-SQL inputs with column-aware controls (pickers, operators, autocomplete)** _(effort L, impact high)_  
  Every config field is a raw SQL text box, so the tool is unusable without SQL fluency — the opposite of Trifacta/Designer Cloud's point-and-click, ML-suggested transforms aimed at non-technical users. Drive column dropdowns and operator selectors from the profiled schema, add Monaco SQL autocomplete seeded with table columns for advanced expressions, and offer common ready-made transforms (trim, lowercase, cast, fill-null) so users pick instead of type.
  
  Sources: <https://hevodata.com/learn/data-wrangling-tools/> · <https://www.astera.com/type/blog/data-wrangling-tools> · <https://openrefine.org/docs/manual/grelfunctions>
- **Add text clustering / fuzzy-dedup step (fingerprint + n-gram)** _(effort L, impact medium)_  
  OpenRefine's signature feature is clustering near-duplicate values (fingerprint: trim/lowercase/strip-punct/sort-tokens; n-gram fingerprints catch typos like Krzysztof/Kryzysztof). Current deduplicate is only exact-match DISTINCT. Implement fingerprint keying via DuckDB string functions (lower/trim/regexp_replace/string_split+list_sort) to merge variant spellings — a high-value cleaning capability the feature completely lacks.
  
  Sources: <https://openrefine.org/docs/technical-reference/clustering-in-depth> · <https://guides.library.illinois.edu/openrefine/clustering>
- **Run transforms in a DuckDB Web Worker and add result caching/export-as-dataset** _(effort M, impact high)_  
  DuckDB-wasm's own guidance is to drive the DB from a Web Worker so analytical queries never block the UI thread; the current code paces steps with setTimeout(60) instead. Move execution off the main thread, cache step outputs and re-run only downstream of changed steps, drop/cleanup orphaned step_<id> tables, and let users materialize the final output as a named dataset the rest of the app (charts, browser) can consume.
  
  Sources: <https://motherduck.com/blog/duckdb-wasm-in-browser/> · <https://github.com/duckdb/duckdb-wasm> · <https://tobilg.com/posts/using-duckdb-wasm-for-in-browser-data-engineering/>
- **Use the local web-llm to suggest transforms from profiles (natural-language to step)** _(effort L, impact medium)_  
  Trifacta/Designer Cloud and 2025 AI cleaning tools differentiate on ML-suggested transformations driven by column profiles. The app already ships a local LLM (web-llm); feed it the SUMMARIZE profile to propose steps (e.g. 'column has 12% nulls and mixed casing -> add fill-null + lowercase') and let users translate a natural-language request into pipeline steps, all on-device to preserve the privacy-by-default model.
  
  Sources: <https://www.devopsschool.com/blog/top-10-ai-data-cleaning-tools-in-2025-features-pros-cons-comparison/> · <https://snicsolutions.com/compare/trifacta-alternatives>

**Recommended deps:** `@dnd-kit/sortable` (Already in package.json but unused here — wire it up for real drag-and-drop step reordering instead of up/down chevron buttons.), `arquero` (Already a dependency; useful as a lightweight in-memory fallback for small datasets and for client-side fingerprint/clustering logic, though DuckDB SUMMARIZE should remain the primary profiling engine for performance.), `sql-formatter` (Pretty-print the generated pipeline SQL shown in the Monaco SQL tab instead of hand-built string concatenation, giving consistent, copyable output.), `zustand` (Already used app-wide; back the pipeline state with a persisted store (+ IndexedDB) so recipes survive reload, enabling save/load and undo/redo.)

**Top pick:** Add a DuckDB SUMMARIZE-powered column profiling panel and drive the step config UI from it. Profiling (type, null %, distinct, quartiles, mini-histograms in one optimized scan) is the foundational capability every modern wrangling tool leads with, it directly unblocks column-aware pickers, honest analytics, and AI suggestions, and it converts the feature from a SQL-text editor into a guided data-cleaning experience.

---

## deep-analytics  
_Maturity: **partial**_

**Current state:** The feature renders a tabbed "Deep Analytics" screen (src/features/deep-analytics/screens/DeepAnalyticsScreen.tsx) with four tabs: Cohort Analysis (components/CohortAnalysis.tsx), Revenue Attribution (components/RevenueAttributionModel.tsx), Cluster Analysis (inline in DeepAnalyticsScreen.tsx), and Period Comparison (inline). The route src/app/dashboard/deep-analytics/page.tsx just mounts the screen. Visualizations use echarts-for-react (scatter, heatmap, line, waterfall, horizontal bar). A real browser-side ML engine exists at src/platform/ai/ml-engine.ts (pure-JS isolation forest, Holt-Winters, k-means++ exported as tensorKMeans, permutation importance, simple-statistics correlation helpers), and ml-matrix + simple-statistics + arquero are installed dependencies. CRITICAL GAP: almost nothing is connected to real data. ClusterAnalysis runs generateSampleTransactions(400) with Math.random() rows; MultiPeriodComparison uses hardcoded SAMPLE_PERIODS; CohortAnalysis builds rows via generateWeeklyRates() with Math.random() and COHORT_BASE constants; RevenueAttributionModel uses hardcoded ATTRIBUTION_FACTORS/CHANNEL_REVENUES/WATERFALL_DATA and runAnalysis is just a setTimeout. The "statistics" are largely fake: the tTest() in DeepAnalyticsScreen returns canned p-values (0.04/0.08/0.15) from an ad-hoc t-statistic with no real distribution; significanceLabel() in CohortAnalysis maps an absolute percentage-point gap to "p<0.01"/"p<0.05" with no actual test; the attribution percentages are static literals, not a regression/correlation. There is no connection to the app's DuckDB-wasm datasets, no column/dataset picker, no export. A ReconciliationWizard.tsx component exists in the folder but is not wired into the screen's tabs.

**Gaps:**
- Not connected to real data: every tab uses hardcoded constants or Math.random() sample generators instead of the app's DuckDB-wasm datasets. There is no dataset/column selector.
- Fake statistics: tTest() returns canned p-values and CohortAnalysis significanceLabel() infers 'p<0.01' from a raw percentage-point gap. No genuine hypothesis test, confidence interval, or effect size is computed.
- Revenue Attribution is entirely static literals plus a setTimeout; despite the 'correlation analysis' copy, no correlation or regression is actually run (ml-matrix is installed but unused here).
- Clustering hardcodes the feature space to [amount, hour] with no standardization/normalization of features, no way to choose k objectively (no elbow/silhouette), and no handling of noise/outliers.
- ReconciliationWizard.tsx is implemented but orphaned — not surfaced in the tab navigation.
- No results persistence or export (CSV/PNG/report), no shareable insight, and re-running clustering produces different results each time with no seed.
- Cohort analysis is success-rate-over-weeks only; it lacks true retention-cohort semantics (acquisition cohort x period-offset triangle) that DuckDB window functions are ideal for.
- Charts repeat large inline echarts option objects with duplicated dark-theme styling across files; no shared chart config, increasing maintenance cost.

**Improvements:**

- **Wire all four tabs to real DuckDB-wasm datasets with a dataset/column picker** _(effort L, impact high)_  
  The feature is a polished UI over fake/random data, so it cannot produce trustworthy insight. DuckDB-wasm (already core to the app) is explicitly recommended for product analytics, cohorts and aggregations, and window-function SQL keeps the cohort/period math both fast and 'actually trustworthy' rather than presentational. Pushing aggregation into SQL also avoids shipping raw rows into the React layer.
  
  Sources: <https://motherduck.com/learn/product-analytics-motherduck-duckdb/> · <https://medium.com/@duckweave/duckdb-retention-cohorts-with-window-functions-29faf9b4f525>
- **Replace fake p-values with a real statistics library (jStat) for Welch's t-test, CIs and effect size** _(effort M, impact high)_  
  tTest() and significanceLabel() fabricate significance, which is misleading in an analytics product. jStat is a maintained browser-ready statistical library with Z/T/F tests and distribution CDFs, so period and cohort comparisons can report genuine two-sample (Welch) t-test p-values, confidence intervals, and effect sizes instead of hardcoded thresholds.
  
  Sources: <https://github.com/jstat/jstat> · <https://jstat.github.io/test.html>
- **Make Revenue Attribution a real model: multiple linear regression (ml-matrix) with optional Shapley-style decomposition** _(effort L, impact high)_  
  The attribution tab claims correlation analysis but returns static literals. ml-matrix (already installed) can fit a regularized multiple regression to derive standardized coefficients; for fair credit across correlated drivers, a Shapley-value decomposition is the only attribution satisfying efficiency/symmetry/additivity. Use exact Shapley for the small fixed factor set and note that approximation is needed only at scale.
  
  Sources: <https://christophm.github.io/interpretable-ml-book/shapley.html> · <https://medium.com/biased-algorithms/shap-values-vs-feature-importance-ba6b91c16319>
- **Upgrade clustering: standardize features, add elbow + silhouette to pick k, and offer a density-based option** _(effort M, impact medium)_  
  Clustering currently mixes amount (~thousands) and hour (0-23) without scaling, biasing k-means toward amount, and k is a blind slider. Standardizing features and computing silhouette (more reliable than the elbow) across k lets users pick k objectively; offering DBSCAN/HDBSCAN handles noise and arbitrary-shaped transaction clusters that k-means cannot.
  
  Sources: <https://hex.tech/blog/comparing-density-based-methods/> · <https://johal.in/k-means-vs-dbscan-vs-hdbscan-clustering-algorithm-comparison/>
- **Reframe Cohort Analysis as a true retention triangle using DuckDB window functions** _(effort M, impact medium)_  
  The current heatmap is success-rate-by-week, not a cohort retention matrix. Anchoring cohorts with DATE_TRUNC and measuring period-offset behavior produces the standard acquisition-cohort x age triangle that stakeholders expect; DuckDB window functions make this clean and production-ready in the browser.
  
  Sources: <https://medium.com/@duckweave/duckdb-retention-cohorts-with-window-functions-29faf9b4f525> · <https://www.stratascratch.com/blog/retention-in-sql-how-to-calculate-user-and-cohort-retention>
- **Surface ReconciliationWizard and add result export (CSV/PNG/report)** _(effort S, impact medium)_  
  ReconciliationWizard.tsx is fully built but not navigable, so working code is wasted. Adding it as a fifth tab plus echarts PNG export and CSV export of cluster/cohort/attribution tables turns one-off exploratory views into shareable artifacts, which is table-stakes for an analytics surface.
  
  Sources: <https://motherduck.com/learn/product-analytics-motherduck-duckdb/>

**Recommended deps:** `jstat` (Browser-ready statistical tests (Welch's t-test, chi-square, F-test) and distribution CDFs to replace the fabricated p-values in tTest() and significanceLabel() with real significance, confidence intervals, and effect sizes.), `density-clustering` (Provides DBSCAN and OPTICS implementations in pure JS to offer a density-based clustering alternative to k-means for noisy, arbitrary-shaped transaction clusters.), `d3-scale` (Standardize/scale heterogeneous cluster features (amount vs hour) and drive consistent color/value scales, removing duplicated ad-hoc scaling and bias in k-means input.)

**Top pick:** Wire the four tabs to real DuckDB-wasm datasets with a dataset/column picker. Everything else (real significance tests, regression-based attribution, objective k selection) is meaningless while the views run on hardcoded constants and Math.random(); connecting real data is the unlock that makes the rest of the feature genuinely valuable.

---

## folders — Folder/dataset organization (Data Catalog)  
_Maturity: **functional**_

**Current state:** A single ~1400-line client component (src/features/folders/screens/FoldersScreen.tsx) rendered by a trivial route (src/app/dashboard/folders/page.tsx). State is persisted via a Zustand store (src/core/stores/folders-store.ts) backed by a Drizzle storage adapter, exposing CatalogFolder records, a datasetFolderMap (datasetId -> folderId), and starredDatasets. A full TanStack Query wrapper layer (src/core/queries/folders.ts) wraps the store with useFolders/useFolder/useDatasetFolderMap/useStarFolder/useMoveFolder/useAddFolder/useRenameFolder/etc., but the screen bypasses these hooks and reads/writes the Zustand store directly. The screen derives an FSNode[] tree by merging catalogFolders + datasets (from data-store) under a synthetic "root" node, then renders: a hand-rolled recursive TreeNode (left rail), a breadcrumb, a grid/list view, search box, type filter, name/size/updated/quality sort buttons, and tabs for Files/Starred/Recent/Stats. Drag-and-drop uses the raw HTML5 DnD API (draggable + onDragStart/onDragOver/onDrop) with a single-item DragState. Stats tab renders echarts pie (storage by folder) + bar (files by type) via dynamically imported echarts-for-react. Animations use motion/react; icons from lucide-react. Folder colors are read (emoji rendering) but there is no color picker; tags are read-only; quality/shared/locked are surfaced from dataset metadata. New-folder uses a custom modal.

**Gaps:**
- No virtualization: the recursive TreeNode and grid/list map over all nodes; with hundreds/thousands of datasets every node re-renders on any drag/select, since allNodes is passed to every TreeNode and children are recomputed with array.filter at each level (O(n^2)).
- No multi-select: only one item can be selected or dragged. Cannot batch-move, batch-delete, or batch-star. No Shift+click range or Ctrl/Cmd+click toggle.
- No keyboard navigation in the tree: TreeNode handles only Enter/Space to select; no Arrow Up/Down/Left/Right to traverse/expand/collapse, no Home/End, no type-ahead. Fails the WAI-ARIA tree pattern (no role=tree/treeitem, aria-expanded, aria-selected, aria-level).
- Inline rename is unreachable from the UI: the store and query layer expose renameFolder/useRenameFolder, but the screen has no rename affordance (no F2, no double-click-to-edit, no context menu).
- No right-click context menu for folder/dataset actions (rename, delete, new subfolder, set color, move to...).
- Drag-and-drop does not prevent dropping a folder into its own descendant — the comment acknowledges this but moveFolder performs no cycle check, allowing the tree to become detached/orphaned.
- Substring-only search (toLowerCase().includes) with no fuzzy matching, no ranking, and no recursive/global search — search only filters the currently selected folder's direct children.
- Tags are read-only and there is no tag editing, tag-based filtering, or tag facet; folder color picker is absent despite color being a stored field.
- The TanStack Query layer (queries/folders.ts) is effectively dead code for this screen, creating two divergent data-access paths and stale-cache risk.
- Deleting a folder hard-deletes all datasets inside it (handleDelete calls removeDataset) with no confirmation and no undo, which is destructive and surprising.

**Improvements:**

- **Replace the hand-rolled recursive tree with react-arborist** _(effort L, impact high)_  
  react-arborist (v3.10.1, actively maintained June 2026, 3.7k stars) is purpose-built for VSCode/Finder-style file explorers and delivers virtualization (10k+ nodes), HTML5 drag-and-drop via a single onMove({dragIds,parentId,index}) callback, full WAI-ARIA keyboard navigation, multi-node/contiguous selection, inline rename (NodeApi.edit/submit), and built-in search (searchTerm/searchMatch) out of the box. This single swap closes the virtualization, multi-select, keyboard-nav, and inline-rename gaps at once and removes a large chunk of bespoke TreeNode code. Map its onMove/onRename/onCreate/onDelete to the existing store actions (moveFolder, renameFolder, addFolder, removeFolder).
  
  Sources: <https://github.com/brimdata/react-arborist> · <https://reactscript.com/best-tree-view/> · <https://medium.com/@livintha/building-powerful-tree-views-with-react-arborist-44319dea804b>
- **Add multi-select with Shift-range / Ctrl-toggle and batch actions** _(effort M, impact high)_  
  Modern file-explorer UX expects Shift for range selection and Ctrl/Cmd for toggle, and dragging a multi-selection should move the whole batch. This unlocks batch move, batch star, and batch delete. react-arborist supports multi/contiguous selection natively (selectMulti/selectAll, onMove with multiple dragIds), so it pairs directly with improvement #1; the store actions already operate per-id and only need a thin batch wrapper.
  
  Sources: <https://uxpatterns.dev/patterns/forms/multi-select-input> · <https://www.uxpin.com/studio/blog/keyboard-navigation-patterns-complex-widgets/> · <https://github.com/kyantech/Palmr/issues/388>
- **Add a right-click context menu and inline rename (F2 / double-click)** _(effort M, impact high)_  
  renameFolder already exists in the store and useRenameFolder in the query layer but is unreachable from the UI. A context menu (rename, new subfolder, set color, move to…, delete with confirm) plus F2/double-click rename brings the feature to desktop-app parity. Use an accessible primitive like @radix-ui/react-context-menu (or the shadcn dropdown the app already uses) so keyboard and screen-reader users get the same actions.
  
  Sources: <https://keycombiner.com/collections/explorer/> · <https://www.uxpin.com/studio/blog/keyboard-navigation-patterns-complex-widgets/>
- **Make search global + fuzzy and add tag-faceted filtering** _(effort M, impact medium)_  
  Current search is substring-only and scoped to the selected folder's direct children. Data-catalog best practice is fast cross-hierarchy discovery with filters/facets and ranked results. Add a recursive/global mode and fuzzy ranking (Fuse.js or uFuzzy) over name + tags + description, plus clickable tag facets. This turns the catalog from a browse-only tree into a discovery surface.
  
  Sources: <https://dagster.io/guides/data-catalog-components-challenges-5-critical-best-practices> · <https://www.secoda.co/learn/best-practices-for-data-cataloging> · <https://www.actian.com/metadata-tagging-best-practices/>
- **Guard folder moves against cycles and make folder delete non-destructive** _(effort S, impact medium)_  
  moveFolder has no descendant check, so a folder can be dropped into its own subtree and detach part of the catalog; the existing code comment flags this but does nothing. Add a descendants() guard (the removeFolder logic already computes descendants and can be reused) in the move path. Separately, folder delete currently hard-deletes contained datasets with no confirm/undo — change the default to move children to root (or trash) and require explicit confirmation, matching standard file-explorer expectations.
  
  Sources: <https://github.com/kyantech/Palmr/issues/388> · <https://dagster.io/guides/data-catalog-components-challenges-5-critical-best-practices>
- **Collapse the dual data path: drive the screen through the TanStack Query hooks** _(effort S, impact low)_  
  queries/folders.ts wraps the store in useFolders/useMoveFolder/etc. but the screen reads the Zustand store directly, so the query layer is dead code and a divergent cache. Either route the screen through the hooks (consistent invalidation, future async/IPC migration to Electron) or delete the unused layer. Reducing the two paths to one removes stale-state risk and shrinks maintenance surface before layering on the bigger features above.
  
  Sources: <https://www.ovaledge.com/blog/metadata-management-best-practices> · <https://dagster.io/guides/data-catalog-components-challenges-5-critical-best-practices>

**Recommended deps:** `react-arborist` (Virtualized, accessible, drag-and-drop tree view with multi-select, keyboard nav, inline rename and search — replaces the hand-rolled recursive TreeNode and its O(n^2) re-rendering.), `@radix-ui/react-context-menu` (Accessible right-click context menu for folder/dataset actions (rename, new subfolder, set color, move, delete) with built-in keyboard and screen-reader support.), `fuse.js` (Lightweight fuzzy search/ranking over dataset and folder name + tags + description to enable global, typo-tolerant catalog discovery.)

**Top pick:** Replace the hand-rolled recursive tree with react-arborist. It is the single highest-leverage move because one well-maintained, file-explorer-purpose-built component simultaneously closes four of the biggest gaps (virtualization, multi-select, WAI-ARIA keyboard navigation, and reachable inline rename) while deleting a large chunk of bespoke TreeNode/DnD code, and its onMove/onRename/onCreate/onDelete callbacks map cleanly onto the store actions that already exist.

---

## forecast-intelligence — Time-series forecasting  
_Maturity: **partial**_

**Current state:** The feature has a genuinely strong, dependency-free forecasting core plus a much weaker UI shell that doesn't use it. The core engine (src/features/forecast-intelligence/core/forecast-engine.ts, 542 lines) is a clean, well-documented pure-TS implementation: additive seasonal decomposition (OLS-detrended phase indices) + Holt's linear (double-exponential) smoothing, with √h-widening Gaussian CI bands, an internal 20% holdout backtest reporting MAE/RMSE/MAPE, and robust MAD-based residual anomaly detection. It is deterministic and graceful on degenerate series. A Pyodide upgrade path (core/forecast-pyodide.ts) optionally runs statsmodels ExponentialSmoothing (Holt-Winters) in a Python sandbox, falling back to an sklearn linear/poly trend (linearTrendSklearn from @/platform/ai/pyodide-ml), returning null when unavailable so the TS engine stays authoritative. The polished consumer is components/forecast-panel.tsx (582 lines): ECharts line chart with history/forecast/CI band/anomaly markers, MAE/RMSE/MAPE strip, horizon toggle (7/14/30), and an AI "Explain" narrative via useAI().generateStructured with a zod schema. HOWEVER, the actual route screen (screens/ForecastScreen.tsx, 1994 lines, 6 tabs: Tomorrow's Forecast, Forecast Intelligence, Revenue Simulator, Pattern Detector, Risk Assessment, Scenarios) is almost entirely driven by generateHistoricalData() using Math.random() synthetic mock data — it is NOT wired to DuckDB, the data-store, or any uploaded dataset. Most tabs use the weak linearForecast() from @/platform/ai/insights (simple linear regression) and simple-statistics rather than the good forecast-engine; only the ForecastIntelligenceTab actually mounts ForecastPanel. Libraries in play: echarts/echarts-for-react, simple-statistics, ml-matrix, motion/react, @mlc-ai/web-llm via the AI provider, Pyodide sandbox.

**Gaps:**
- The route screen (ForecastScreen.tsx) runs entirely on Math.random() synthetic data and is not connected to DuckDB, the data-store, or any uploaded dataset — the forecasts shown to the user are fabricated, not derived from their data
- Most tabs use the weak linearForecast() (plain linear regression) instead of the well-built forecast-engine; only ForecastIntelligenceTab mounts the real ForecastPanel, so the strong core is largely unused
- No automatic model selection: alpha/beta/seasonLength are hardcoded constants (0.4/0.1/7); the engine never fits hyperparameters or auto-detects seasonality period, so accuracy on non-weekly data is poor
- Prediction intervals are naive Gaussian σ·√h bands assuming normal, homoscedastic, exchangeable residuals — 2025 best practice favors conformal/empirical intervals that are distribution-free and calibrated to actual backtest error
- Backtest uses a single fixed 20% holdout rather than rolling-origin / time-series cross-validation, so accuracy metrics are high-variance and can mislead
- No model comparison: the user cannot see Holt vs naive/seasonal-naive baselines or pick the best by backtest score — no notion of 'which model won'
- Pyodide statsmodels path frequently returns null (statsmodels is rarely a prebuilt wheel) so the 'stronger' upgrade silently never fires, leaving only the TS Holt engine; there is no in-browser ARIMA/AutoARIMA option
- Chart shows a single 95% band; no fan chart (nested 50/80/95% intervals) and no vertical 'forecast start' marker, which are standard uncertainty-communication patterns
- Forecast assumes equally-spaced points and silently drops gaps (no interpolation, no irregular-timestamp or missing-date handling); cadence is hardcoded to days (addDays), breaking weekly/monthly/hourly series
- No way to export the forecast (CSV/PNG) or persist scenarios beyond the in-memory SavedScenario list

**Improvements:**

- **Wire the screen to real data via DuckDB/data-store and route everything through forecast-engine** _(effort L, impact high)_  
  The biggest credibility gap: the feature presents Math.random() forecasts. Replacing generateHistoricalData() with a query over the loaded dataset (the app already has DuckDB-wasm and TanStack Query stores) and feeding {date,value}[] into forecastSeries()/ForecastPanel turns this from a demo into a real analytics tool. Annotations, real KPIs, and role-aligned visuals are explicitly called out as 2025 dashboard expectations.
  
  Sources: <https://medium.com/@allclonescript/20-best-dashboard-ui-ux-design-principles-you-need-in-2025-30b661f2f795> · <https://www.uxpin.com/studio/blog/dashboard-design-principles/>
- **Replace Gaussian σ·√h bands with conformal (empirical-residual) prediction intervals** _(effort M, impact high)_  
  The engine already computes a backtest and one-step residuals; reusing those residual quantiles to size intervals (split/adaptive conformal) gives distribution-free, calibrated coverage instead of assuming normal homoscedastic errors. This is the dominant 2025 recommendation for time-series uncertainty because exchangeability and normality are violated in practice. Low-code: compute empirical quantiles of rolling backtest errors per horizon step.
  
  Sources: <https://arxiv.org/html/2511.13608v1> · <https://nixtlaverse.nixtla.io/statsforecast/docs/tutorials/conformalprediction.html>
- **Add in-browser AutoARIMA/SARIMA via the WASM `arima` package as a third (always-available) engine tier** _(effort M, impact high)_  
  The Pyodide statsmodels path rarely loads (statsmodels has no reliable pyodide wheel), so the 'stronger' upgrade usually no-ops. zemlyansky/arima is an Emscripten/WASM port (arima/async) that runs fully in-browser, supports SARIMA and AutoARIMA, and predict() returns predictions + mean-square-errors for intervals — a perfect fit for the existing offline-first, null-fallback contract and far more reliable than the Python sandbox.
  
  Sources: <https://github.com/zemlyansky/arima> · <https://www.npmjs.com/package/arima>
- **Auto-select seasonality period and smoothing params (grid-search by backtest score) + add baseline model comparison** _(effort M, impact high)_  
  alpha/beta/seasonLength are hardcoded. AutoETS/AutoARIMA-style automation (Nixtla) removes manual tuning and adapts to non-weekly data. Running a small grid over (alpha,beta,m) and naive/seasonal-naive baselines, then picking the lowest rolling-CV error, both improves accuracy and lets the UI show 'best model' — model comparison is a recognized forecast-dashboard pattern.
  
  Sources: <https://www.nixtla.io/blog/eliminate-manual-arima-tuning-using-statsforecast-autoarima-automation> · <https://medium.com/artefact-engineering-and-data-science/the-path-to-developing-a-high-performance-demand-forecasting-model-part-3-fb1bd435c869>
- **Switch backtest to rolling-origin (time-series) cross-validation** _(effort M, impact medium)_  
  A single fixed 20% holdout yields high-variance, easily-misleading MAE/RMSE/MAPE. Rolling-origin evaluation (expanding/sliding window, multiple cutoffs) is the standard for reliable model evaluation and is what conformal intervals also need as their calibration set, so it doubles as the data source for improvement #2.
  
  Sources: <https://nixtlaverse.nixtla.io/statsforecast/docs/tutorials/conformalprediction.html> · <https://github.com/Nixtla/statsforecast>
- **Render a proper fan chart (nested 50/80/95% bands) with a forecast-start marker** _(effort S, impact medium)_  
  The chart currently shows one flat 95% band. Bank-of-England-style fan charts with nested, progressively-lighter intervals and a vertical dashed forecast-onset line are the established best practice for communicating forecast uncertainty and read far more honestly. Once conformal/empirical quantiles exist (#2), emitting multiple coverage levels is nearly free in the ECharts option builder.
  
  Sources: <https://en.wikipedia.org/wiki/Fan_chart_(time_series)> · <https://www.bis.org/ifc/events/ifc_8thconf/ifc_8thconf_62pap.pdf>
- **Handle irregular/non-daily cadence and missing dates** _(effort M, impact medium)_  
  addDays() hardcodes daily steps and normalizeSeries() drops gaps without interpolation, so weekly/monthly/hourly data and series with missing dates produce wrong future date labels and biased seasonality. Inferring the dominant interval from timestamps and optionally interpolating gaps makes the engine correct on real uploaded data, which is required for improvement #1 to be trustworthy.
  
  Sources: <https://github.com/Nixtla/statsforecast> · <https://nixtlaverse.nixtla.io/statsforecast/docs/tutorials/conformalprediction.html>

**Recommended deps:** `arima` (WASM (Emscripten) AutoARIMA/SARIMA/SARIMAX forecasting that runs fully in-browser via arima/async and returns predictions + MSE for intervals — a reliable third engine tier replacing the flaky Pyodide-statsmodels path while honoring the existing offline, null-fallback contract), `date-fns` (Robust date arithmetic and interval inference to replace the hand-rolled daily-only addDays() so the engine supports weekly/monthly/hourly cadence and missing-date handling)

**Top pick:** Wire ForecastScreen.tsx to real data (DuckDB/data-store) and route all tabs through the existing forecast-engine/ForecastPanel instead of Math.random() mock data and the weak linearForecast(). The strong core already exists and is unit-testable; the single highest-leverage move is making the user-facing screen actually forecast their data rather than fabricated noise — everything else (conformal intervals, fan charts, model comparison) only matters once the inputs are real.

---

## geo-analysis  
_Maturity: **partial**_

**Current state:** The feature is a single 990-line client component (src/features/geo-analysis/screens/GeoAnalysisScreen.tsx) rendered by a trivial route wrapper (src/app/dashboard/geo-analysis/page.tsx). It has three tabs: (1) "Tunisia Map" — a react-leaflet MapContainer with OpenStreetMap raster tiles and CircleMarkers per governorate, sized by sqrt(transactions) and colored by success rate, with a click-to-select detail panel; (2) "Transaction Network" — a react-force-graph-2d node-link graph with filter/size toggles and neighbor highlighting; (3) "Channel Distribution" — an ECharts heatmap (channel-by-region) plus a per-region donut. All three are driven entirely by HARDCODED constants: TUNISIA_REGIONS (24 governorates with literal lat/lon/transactions/revenue), and generateNetworkData()/generateChannelMatrix() which call Math.random() at module load — so the network graph and heatmap regenerate different numbers on every page load and are non-deterministic, non-reproducible mock data. Libraries used: leaflet 1.9.4 + react-leaflet 5, react-force-graph-2d 1.29, echarts 6 via echarts-for-react. Notably the app already ships DuckDB-wasm (src/core/queries/duckdb.ts exposes a useDuckDBQuery hook), TanStack Query, and Zustand stores (src/core/stores/), but this feature touches NONE of them — there is no query, no store, no real dataset binding. Leaflet CSS is imported imperatively in a useEffect with a leafletLoaded gate. The "map" is a bubble/proportional-symbol map only; there is no choropleth (no GeoJSON governorate polygons), no clustering, no spatial aggregation.

**Gaps:**
- Not connected to any real data — everything is hardcoded constants; the app's DuckDB-wasm engine and useDuckDBQuery hook (src/core/queries/duckdb.ts) are completely unused here, so the feature cannot analyze a user's uploaded dataset
- Network graph and channel heatmap call Math.random() at module load (lines 105-189), producing different fake numbers on every render/reload — non-deterministic, not reproducible, and misleading for an 'analysis' tool
- No real choropleth: governorate boundaries are not drawn (only CircleMarkers at centroids), so region-level intensity mapping, the canonical geo-analytics pattern, is missing
- Hardcoded to Tunisia's 24 governorates only — no support for arbitrary lat/lon columns, other countries, or user-chosen geographic granularity
- No point clustering or WebGL acceleration — CircleMarkers + Leaflet raster tiles will degrade badly beyond a few hundred/thousand points, and there is no marker clustering or hexbin aggregation
- No coordinate/column mapping UI — a user cannot pick which dataset columns are lat, lon, metric, or category
- No spatial aggregation primitives (hexbin/H3, spatial join to regions, point-in-polygon) despite DuckDB-wasm being available in-app
- Accessibility/UX gaps: emoji placeholders, fixed 64-/72-px side panels, no keyboard navigation of markers, no loading/empty/error states tied to real data, no export of map view
- Single 990-line file mixing three unrelated visualizations, color helpers, and mock-data generators — hard to test or reuse; no extraction into components/hooks/lib

**Improvements:**

- **Wire the map to real data via the existing DuckDB-wasm pipeline with a column-mapping UI** _(effort L, impact high)_  
  The app already runs a full DuckDB engine in-browser (src/core/queries/duckdb.ts useDuckDBQuery) and Zustand stores, but this feature ignores them and ships static Tunisia constants. Letting users select lat/lon/metric/category columns from their loaded dataset and aggregating with SQL turns a static demo into an actual analysis tool. DuckDB-wasm can do the heavy aggregation (GROUP BY region, AVG/SUM of metrics) so the React layer only renders results. This is the single highest-leverage change because every other map improvement depends on real, query-driven data.
  
  Sources: <https://duckdb.org/2025/08/08/spatial-joins> · <https://dev.to/camptocamp-geo/querying-overture-maps-geoparquet-directly-in-the-browser-with-duckdb-wasm-4jn4>
- **Replace Math.random() mock generators with deterministic, query-derived data (or a seeded fallback)** _(effort S, impact high)_  
  generateNetworkData() and generateChannelMatrix() run at module load, so the network graph and heatmap show different fabricated numbers on every reload — actively misleading in a tool labeled 'analysis'. Deriving these from DuckDB aggregates (or, until that lands, a seeded PRNG so values are stable) is a small, isolated fix that removes the most obvious correctness problem and makes the views reproducible and testable.
  
  Sources: <https://duckdb.org/2025/08/08/spatial-joins>
- **Add a true choropleth layer (GeoJSON governorate/region polygons) alongside the bubble layer** _(effort M, impact high)_  
  Region-level intensity mapping (choropleth) is the canonical geo-analytics pattern and is currently missing — only centroid CircleMarkers exist. Loading a GeoJSON/TopoJSON of administrative boundaries and shading polygons by a chosen metric gives far better spatial readability. The LogRocket and tmsvr guides cover react-leaflet choropleth patterns and the specific GeoJSON re-render performance pitfalls (hover re-rendering all features) to avoid.
  
  Sources: <https://blog.logrocket.com/react-map-library-comparison/> · <https://tmsvr.com/react-leaflet-map-performance-issues/>
- **Add H3/hexbin spatial aggregation using DuckDB's spatial + H3 community extensions** _(effort M, impact medium)_  
  For arbitrary point datasets, hex-binning is the shortest path from raw events to a map dashboard and scales far better than per-point markers. DuckDB-wasm can INSTALL/LOAD the spatial and h3 community extensions in-browser; v1.3.0 added a dedicated SPATIAL_JOIN operator reported ~5x faster than GeoPandas sjoin. This unlocks point-in-region joins and hex aggregation entirely client-side, fitting the app's local-first architecture with no backend.
  
  Sources: <https://duckdb.org/2025/08/08/spatial-joins> · <https://github.com/alperdincer/Awesome-DuckDB-Spatial/blob/main/README.md>
- **Migrate the map rendering to MapLibre GL (via react-map-gl) and overlay deck.gl for large point/hexbin layers** _(effort L, impact medium)_  
  Leaflet + raster tiles + CircleMarkers degrade above a few hundred features; the WebGL gap becomes significant past that scale. MapLibre GL JS (open-source, no token) with the react-map-gl wrapper gives hardware-accelerated vector rendering, and deck.gl composes as a synchronized overlay (ScatterplotLayer/HexagonLayer/GeoJsonLayer) for GPU rendering of large datasets — directly aligned with handling real user data at scale. This is the bigger structural bet; do it after data is wired so the payoff is real.
  
  Sources: <https://www.pkgpulse.com/guides/mapbox-vs-leaflet-vs-maplibre-interactive-maps-2026> · <https://deck.gl/docs> · <https://visgl.github.io/react-map-gl/docs/whats-new>
- **Add marker clustering as a cheap interim performance win if staying on Leaflet** _(effort S, impact medium)_  
  If the MapLibre/deck.gl migration is deferred, point clustering (leaflet.markercluster via react-leaflet-cluster) prevents the map from choking on thousands of CircleMarkers and improves readability at low zoom. Low effort, immediate UX/perf benefit, and reversible.
  
  Sources: <https://maplibre.org/maplibre-gl-js/docs/plugins/> · <https://blog.logrocket.com/react-map-library-comparison/>
- **Split the 990-line component into components/hooks/lib and add tests** _(effort M, impact low)_  
  The file mixes three visualizations, color utilities, and mock generators, which blocks reuse and testing. Extracting TunisiaMapTab/NetworkGraphTab/ChannelDistributionTab into separate files plus a useGeoData hook and a geo color/format lib makes the data-wiring and rendering changes above tractable and lets deterministic data and aggregation logic be unit-tested.
  
  Sources: <https://blog.logrocket.com/react-map-library-comparison/>

**Recommended deps:** `react-map-gl` (Mature React wrapper for MapLibre GL JS (and Mapbox) providing token-free, WebGL vector-tile maps that scale past Leaflet's few-hundred-feature limit), `maplibre-gl` (Open-source WebGL map renderer (no API token) to replace Leaflet raster tiles for hardware-accelerated, large-dataset map rendering), `deck.gl` (GPU-accelerated geospatial layers (ScatterplotLayer, HexagonLayer, GeoJsonLayer) that overlay on react-map-gl for rendering large point/choropleth/hexbin datasets), `react-leaflet-cluster` (Marker clustering for react-leaflet as a low-effort interim performance fix if staying on Leaflet before any MapLibre migration), `h3-js` (H3 hex-cell math in JS to complement DuckDB H3 aggregation for client-side hexbin geometry generation and rendering)

**Top pick:** Wire the map to real data through the app's existing DuckDB-wasm pipeline (useDuckDBQuery in src/core/queries/duckdb.ts) with a column-mapping UI, and simultaneously kill the Math.random() mock generators in GeoAnalysisScreen.tsx. Right now the entire feature is hardcoded Tunisia constants plus non-deterministic randomized graphs, so it analyzes nothing the user loaded — connecting it to real, query-driven aggregates is the prerequisite that makes every other map/choropleth/hexbin improvement worth building.

---

## help — Help / onboarding (react-joyride)  
_Maturity: **partial**_

**Current state:** The "help" feature is two disconnected pieces. (1) The actual Help page (src/features/help/screens/HelpScreen.tsx, rendered by src/app/dashboard/help/page.tsx) is a fully static, client-side documentation screen: a hardcoded SHORTCUTS array, an 11-item FEATURES array, and a 6-item FAQS array, rendered as motion/react-animated accordions with three tabs (features/faq/shortcuts) and a simple client-side substring search (toLowerCase().includes). It uses lucide-react icons and the project cn() util. There is no actual react-joyride tour wired into this page, no analytics, no real markdown/MDX, and the GitHub footer link incorrectly points to https://github.com/vercel/next.js/issues. (2) A separate, more interactive react-joyride tour lives in src/features/ux-innovations/components/OnboardingTour.tsx (8 TOUR_STEPS targeting sidebar hrefs, a CustomTooltip, a floating welcome card, localStorage "tour:completed" gate, compact trigger variant). Critically, grep shows OnboardingTour is imported nowhere — it is an orphaned component that never mounts, so users never actually get the guided tour. package.json pins react-joyride ^3.1.0.

**Gaps:**
- The react-joyride OnboardingTour component is never imported/mounted anywhere (confirmed by grep) — the guided tour is dead code and no user ever sees it.
- react-joyride ^3.1.0 is unmaintained (no release in ~9 months) and not React 19 compatible; this app is Next.js 16 / React 19, so it is on borrowed time and the v4 next branch is unstable.
- The Help page and the tour are completely decoupled — there is no 'Start guided tour' / 'Restart tour' button on the Help page, and no contextual deep-links from features to the live screens.
- Content is hardcoded in TSX arrays (FEATURES/FAQS/SHORTCUTS) rather than MDX/markdown, so docs can't be edited without a code change and have no rich formatting, code blocks, or images.
- Search is naive substring matching over title/summary only — no fuzzy matching, no ranking, no keyboard navigation, and FAQ search ignores typos and synonyms.
- No onboarding checklist / activation-milestone UI, no empty-state guidance on data pages, despite best-practice evidence that checklists and contextual empty states drive activation.
- Help is not reachable from a command palette (Ctrl+K exists per shortcuts list) and there is no in-context '?' help affordance tied to specific pages.
- The tour targets sidebar hrefs (e.g. /dashboard/forecast, /dashboard/geo-analysis) that may not match the features documented in HelpScreen — tour and docs describe different feature sets, indicating drift.
- Broken external link: the 'Open an issue on GitHub' footer points to vercel/next.js/issues instead of the project repo.
- No analytics/telemetry on tour completion, step drop-off, or which FAQs are searched — no way to improve onboarding empirically.

**Improvements:**

- **Mount and connect the guided tour, then add a 'Restart tour' button on the Help page** _(effort S, impact high)_  
  The OnboardingTour react-joyride component already exists and is fully built but is imported nowhere, so the headline 'onboarding' capability is invisible to users. Mounting it in the dashboard layout and exposing a restart trigger on HelpScreen is the cheapest path to shipping real value. Best-practice guidance is that tours must be skippable, short (3-5 steps / under 45-60s) and re-triggerable on demand — a Help-page restart button satisfies the on-demand requirement.
  
  Sources: <https://www.chameleon.io/blog/react-product-tour> · <https://userpilot.com/blog/onboarding-ux-examples/>
- **Migrate from react-joyride to a React 19 / Next 16 compatible tour library (driver.js or Shepherd.js)** _(effort M, impact high)_  
  react-joyride ^3.1.0 is unmaintained (~9 months no release) and explicitly reported as not React 19 compatible with an unstable next branch; this app runs Next.js 16 on React 19, so the dependency is a latent breakage. driver.js (~5kb, framework-agnostic, actively maintained, MIT) or Shepherd.js (production-grade, flexible) are the recommended replacements; driver.js is the lightest and works cleanly via a useEffect-driven controller, Shepherd if richer step UI is needed.
  
  Sources: <https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared> · <https://userorbit.com/blog/best-open-source-product-tour-libraries> · <https://www.chameleon.io/blog/react-product-tour>
- **Add an onboarding checklist tied to activation milestones with persisted progress** _(effort M, impact high)_  
  Research shows persistent 3-7 item checklists pre-completed ~20% leverage the Zeigarnik and goal-gradient effects and materially lift activation. For DataNavigator the milestones map naturally to existing pages (upload a file, run a SQL query in Browser, open Telecom Report, view AI Analysis). A small checklist component with localStorage/Zustand persistence and deep-links into those routes turns the static Help page into an action-driving surface.
  
  Sources: <https://productled.com/blog/5-best-practices-for-better-saas-user-onboarding> · <https://www.flowjam.com/blog/saas-onboarding-best-practices-2025-guide-checklist>
- **Improve Help search with fuzzy matching and keyboard navigation, and surface Help in the Ctrl+K command palette** _(effort S, impact medium)_  
  Current search is exact substring matching over title/summary only, so typos and synonym queries fail and FAQ bodies aren't fully searched well. A small fuzzy matcher (Fuse.js) over a flattened index of features + FAQ + shortcuts gives ranked, typo-tolerant results. Surfacing help entries inside the existing Ctrl+K command palette matches the modern pattern of help-on-demand from anywhere.
  
  Sources: <https://userpilot.com/blog/onboarding-ux-examples/> · <https://www.appcues.com/blog/saas-user-onboarding>
- **Move help/FAQ/feature content into MDX so docs are editable, richer, and reduce drift** _(effort M, impact medium)_  
  Content is hardcoded in TSX arrays and has already drifted from the tour (tour references forecast/geo-analysis pages that the docs don't list). Authoring features and FAQs as MDX (via next-mdx-remote or @next/mdx) lets non-code edits, code blocks, and images, and creates a single source of truth that both the Help page and any future contextual tooltips can read. Also fixes the wrong GitHub issues link as part of the content pass.
  
  Sources: <https://www.candu.ai/blog/best-saas-onboarding-examples-checklist-practices-for-2025> · <https://userpilot.com/blog/onboarding-ux-examples/>
- **Add contextual empty-state guidance and per-page '?' help affordances** _(effort M, impact medium)_  
  Best practice is that empty states should teach: offer a clear CTA or sample/dummy data rather than 'no data yet'. Wiring page-level help (a '?' that deep-links to the relevant HelpScreen feature card, plus empty-state CTAs that link to Upload or load sample data) delivers help at the moment of need instead of forcing users to a separate docs page.
  
  Sources: <https://userpilot.com/blog/onboarding-ux-examples/> · <https://www.candu.ai/blog/best-saas-onboarding-examples-checklist-practices-for-2025>

**Recommended deps:** `driver.js` (Lightweight (~5kb), actively maintained, MIT-licensed, framework-agnostic product-tour/element-highlight library to replace unmaintained react-joyride for the guided onboarding tour on React 19 / Next 16.), `shepherd.js` (Alternative production-grade tour library if richer multi-step tooltip UI and overlay control are needed beyond driver.js.), `fuse.js` (Tiny fuzzy-search library to give the Help page typo-tolerant, ranked search across features, FAQs, and shortcuts.), `next-mdx-remote` (Render help/FAQ/feature content authored as MDX so documentation is editable, rich, and a single source of truth instead of hardcoded TSX arrays.)

**Top pick:** Mount the already-built react-joyride OnboardingTour (it is currently imported nowhere and never renders) and add a 'Restart tour' button on the Help page — this ships the feature's core onboarding value in a single small change, after which migrating off the unmaintained react-joyride to driver.js/Shepherd.js is the natural follow-up.

---

## history — Activity / query history  
_Maturity: **partial**_

**Current state:** The route src/app/dashboard/history/page.tsx renders HistoryScreen (src/features/history/screens/HistoryScreen.tsx), a 308-line client component that is the only wired-up code. It aggregates four sources into one timeline: datasets + transforms + queryHistory from useDataStore (src/core/stores/data-store.ts; QueryHistoryItem has sql, naturalLanguage, datasetId, rowsReturned, durationMs, ranAt, error) and events from useActivityStore (src/core/stores/activity-store.ts; capped at 500, persisted via drizzle-storage). It maps each into a HistoryRow, sorts by timestamp desc, groups by day (dayBucket via toLocaleDateString), and renders motion/react animated cards. Search is a naive case-insensitive substring filter over message/type/table/dataset; source filtering is a plain <select>. Four SummaryCards show counts. The rest of the feature folder is orphaned/unwired: model/types.ts (VersionEntry/DiffLine/ColumnDiff), model/diff.ts (a full Myers diff implementation + applyContextWindow), model/format.ts (formatBytes/formatAge/typeColor/typeIcon), and components/history-widgets.tsx (VersionBadge, AuthorAvatar, DiffViewer) — a git-style dataset-versioning UI that HistoryScreen never imports. The app already depends on cmdk, fuse.js, @tanstack/react-virtual, date-fns, and recharts, none of which the screen uses (it has its own formatAgo helper duplicating format.ts's formatAge).

**Gaps:**
- No re-run / re-apply action: query rows show SQL but you cannot copy it, open it in the SQL editor, or re-execute it — the single highest-value action for a query-history feature is missing
- No favorites / pinning / save: cannot bookmark important queries or events; the activity store has no concept of pinned items and is hard-capped at 500 with no archival
- Naive substring search despite fuse.js already being installed — no fuzzy matching, no ranking, no multi-field weighting
- No virtualization despite @tanstack/react-virtual already installed; all rows render at once with per-item framer-motion animations, which will jank as activity approaches the 500-event cap (and 200 queries + transforms)
- No date-range / duration / status filtering — only a single source <select>; modern query-history tools (Databricks, Snowflake) filter by date, duration, status, statement type
- Large dead-code surface: model/diff.ts (Myers diff), model/format.ts, model/types.ts, and components/history-widgets.tsx are never imported by the live screen — confusing and unmaintained
- No detail/expand view: long SQL and error messages are shown inline with no expand, no syntax highlighting, no full metadata (durationMs and rowsReturned from QueryHistoryItem are not even surfaced)
- No export (CSV/JSON) or clear/manage controls in the UI even though clearEvents and clearQueryHistory exist in the stores
- No keyboard navigation / command-palette entry despite cmdk being installed
- Duplicated time-formatting logic (formatAgo in the screen vs formatAge in format.ts) and inconsistent relative-time handling

**Improvements:**

- **Add re-run + copy actions to query history rows** _(effort M, impact high)_  
  Re-running and copying a prior query is the defining capability of a query-history surface across every modern DB client (Databricks, Snowflake, dbForge). The data already exists (QueryHistoryItem.sql/naturalLanguage), so wire a 'Copy SQL' button and an 'Open in editor / Re-run' action that routes the SQL into the existing DuckDB query path. This turns a passive log into an actionable feature with minimal new state.
  
  Sources: <https://learn.microsoft.com/en-us/azure/databricks/sql/user/queries/query-history> · <https://seemoredata.io/blog/snowflake-query-history/> · <https://www.devart.com/dbforge/sql/sqlcomplete/sql-server-query-history.html>
- **Replace substring filter with fuse.js fuzzy search (already a dependency)** _(effort S, impact high)_  
  fuse.js is already in package.json (^7.4.2) but unused here. Build a Fuse instance in useMemo over the aggregated rows with weighted keys (message, sql/naturalLanguage, type, table, dataset) for typo-tolerant, ranked search instead of the current includes() check. Recommended pattern is exactly this: construct the index outside render in useMemo to avoid rebuilds.
  
  Sources: <https://www.fusejs.io/articles/using-fuse-with-react.html> · <https://www.daily.co/blog/implementing-client-side-search-in-a-react-app-with-fuse-js/>
- **Virtualize the timeline with @tanstack/react-virtual (already a dependency)** _(effort M, impact medium)_  
  @tanstack/react-virtual ^3.14.2 is already installed. The current screen renders every row (up to ~500 events + 200 queries + transforms + datasets) with per-item motion animations, which degrades as history grows. TanStack Virtual is purpose-built for feeds/logs/timelines and renders only visible items; its end-anchored mode also suits reverse-chronological feeds. Reserve the entrance animation for in-viewport items.
  
  Sources: <https://tanstack.com/virtual/latest/docs/introduction> · <https://blog.logrocket.com/speed-up-long-lists-tanstack-virtual/> · <https://tanstack.com/blog/tanstack-virtual-chat>
- **Add date-range, status, and duration filters** _(effort M, impact medium)_  
  Major query-history products filter by date range, query status, duration, and statement type rather than a single source dropdown. date-fns (^4.4.0) is already available for range bucketing. Surface QueryHistoryItem.durationMs and rowsReturned (currently dropped) and add a failed/succeeded toggle so users can quickly find slow or broken queries.
  
  Sources: <https://learn.microsoft.com/en-us/azure/databricks/sql/user/queries/query-history> · <https://docs.databricks.com/aws/en/sql/user/queries/query-history>
- **Add favorites/pinning and a row detail/expand view** _(effort M, impact medium)_  
  Bookmarking important queries and expanding a row to see full SQL, error text, duration, and rows-returned is standard in modern history UIs and avoids the 500-event eviction losing valued entries. Add a pinned set in a small persisted store and an expandable card; consider a cmdk (already installed) command-palette entry to jump to or re-run a favorite by name.
  
  Sources: <https://www.devart.com/dbforge/sql/sqlcomplete/sql-server-query-history.html> · <https://www.shadcn.io/ui/command>
- **Decide the fate of the orphaned version/diff module** _(effort L, impact low)_  
  model/diff.ts (Myers diff), model/types.ts (VersionEntry), model/format.ts, and components/history-widgets.tsx implement a git-style dataset-versioning + diff UI that the live HistoryScreen never imports. Either wire a real 'dataset version diff' view on top of transforms (the Myers diff and DiffViewer are already built and reusable for showing schema/row changes between transform outputs) or delete the dead code. Per the repo's anti-slop guidance, leaving unwired parallel implementations is a maintenance liability.
  
  Sources: <https://github.com/TanStack/virtual> · <https://www.fusejs.io/>

**Recommended deps:** `fuse.js` (Typo-tolerant, weighted, ranked fuzzy search over history rows — already in package.json but unused by HistoryScreen), `@tanstack/react-virtual` (Virtualize the (potentially 700+ row) timeline feed — already a dependency, not yet used here), `cmdk` (Keyboard-first command palette to search/jump-to/re-run history entries — already installed, unused in this feature), `date-fns` (Date-range filtering and consistent relative-time formatting to replace the bespoke formatAgo helper — already installed)

**Top pick:** Make query rows actionable: add Copy SQL and Re-run/Open-in-editor on query-history entries. The SQL is already stored in QueryHistoryItem, so this is the highest-leverage change — it converts a read-only log into the core workflow users expect from a query-history feature, and pairs naturally with the next step of fuse.js fuzzy search (also already a dependency).

---

## lineage — Data lineage graph  
_Maturity: **functional**_

**Current state:** The feature builds a real, local data-lineage graph entirely from in-app records and renders it with a hand-rolled SVG + absolutely-positioned divs — it does NOT use xyflow/dagre despite the feature name. The route `src/app/dashboard/lineage/page.tsx` is a thin wrapper around `src/features/lineage/screens/LineageScreen.tsx` (~1525 lines, a single client component). `src/features/lineage/core/build-lineage.ts` aggregates nodes/edges from Zustand `useDataStore` (datasets, transforms, savedCharts, loadedTableNames) plus telecom IndexedDB caches (getCachedTelecomSourceFiles, getCachedAnalyticsEntries, listDailyStats), producing LNode/LEdge/ColumnLineage typed in `core/types.ts`. Layout is a custom topological column-assignment (`computeLayout`, BFS by in-degree) with fixed node width/height. The screen has 4 tabs (graph, table, impact, columns); the graph tab implements its own pan (mousedown/move state), wheel-zoom, an SVG cubic-bezier edge renderer (EdgeLine), motion/react node cards (NodeCard), a detail side panel, recursive upstream/downstream highlight (walkUp/walkDown), and a recursive impact analysis (walkImpact, capped at depth 5). Column lineage is heuristic: it just maps each child dataset column back to a same-named parent column with no real SQL parsing. Libraries actually used: motion/react (animation), lucide-react (icons), Zustand stores, Tailwind. No React Flow, no dagre/elkjs, no graph virtualization, no SQL AST parsing.

**Gaps:**
- Does not use a real graph library (React Flow/dagre) despite the feature description — pan/zoom/layout/edge-routing are all custom and limited: edges are simple beziers with no obstacle avoidance, no minimap, no fit-to-view, no keyboard nav, no node dragging, and no accessibility on the canvas beyond a single aria-label.
- Performance is O(n²)/O(n³) in several hot paths: `nodes.find()` is called inside render loops (EdgeLine lookups, upstream/downstream/impact panels) and inside `computeLayout` (nodes.find in BFS), and recursive walkUp/walkDown/walkImpact have NO cycle guard and no visited-set dedupe across branches, so a cyclic or diamond-shaped graph re-walks exponentially and can hang.
- No graph virtualization — every node card (motion.div) and every SVG edge is rendered regardless of viewport; large workspaces (hundreds of datasets/charts) will render everything and stutter.
- Column-level lineage is fake/heuristic: it matches columns by identical name between parent and child and labels transforms 'SQL projection' without parsing `ds.transformSql`. Real derivations (renames, aggregations, joins, CASE expressions) are not traced, so the Columns tab and column detail are misleading.
- Layout recomputes from scratch on every node change with no memo stability of positions, no edge crossing minimization, and no handling of multi-parent (diamond) widths — columns can overlap vertically because y is just index*spacing per column with no global ordering.
- No persistence or export — the graph cannot be exported (PNG/SVG/JSON), bookmarked, or shared, and selection/pan/zoom state resets on refresh.
- Accessibility and interaction gaps: canvas is mouse-only (no touch pinch-zoom, no keyboard pan/zoom/focus), node cards rely on color for status, and the whole 1525-line screen is one component making it hard to test or memoize.

**Improvements:**

- **Migrate the graph canvas to React Flow (@xyflow/react) with a dagre/elkjs auto-layout pass** _(effort L, impact high)_  
  The feature is literally named for xyflow/dagre but reimplements pan, zoom, edge routing, and layout by hand. Adopting @xyflow/react gives battle-tested pan/zoom, a MiniMap, Controls, fit-view, node dragging, edge handles, and accessibility for free, and lets you drop the custom EdgeLine/NodeCard positioning math. Pair it with dagre (drop-in, fast, ideal for directed trees per React Flow's own layout guide) or elkjs for larger DAGs needing layered crossing-minimization. React Flow's performance guide explicitly recommends React.memo'd custom nodes and useMemo'd options, which maps cleanly onto the existing NodeCard.
  
  Sources: <https://reactflow.dev/> · <https://reactflow.dev/examples/layout/dagre> · <https://reactflow.dev/examples/layout/elkjs> · <https://reactflow.dev/learn/advanced-use/performance> · <https://reactflow.dev/learn/layouting/layouting>
- **Fix the graph traversal hot paths: index nodes by id and add visited-sets/cycle guards** _(effort S, impact high)_  
  walkUp/walkDown (highlight) and walkImpact have no visited set shared across branches and no cycle guard, and the screen calls nodes.find() inside render and inside computeLayout's BFS — all O(n) lookups in O(n) loops. Building a Map<id,LNode> once and passing a visited Set turns highlight/impact into linear-time and prevents infinite recursion / exponential re-walk on diamond or cyclic graphs. This is a small, high-leverage correctness+perf fix independent of the React Flow migration.
  
  Sources: <https://reactflow.dev/learn/advanced-use/performance> · <https://github.com/xyflow/xyflow/discussions/4975>
- **Compute real column-level lineage by parsing transformSql with node-sql-parser** _(effort M, impact high)_  
  Current column lineage matches columns by identical name and never reads ds.transformSql, so renames/aggregations/joins/CASE are invisible and the Columns tab is misleading. node-sql-parser runs in the browser (UMD/ESM), supports PostgreSQL-like dialects close to DuckDB, and exposes columnList/tableList plus a full AST you can walk to map output columns to their source expressions — the same AST-traversal approach DataHub/Recce use with SQLGlot (which is Python-only and not usable here). This turns the Columns tab from decorative into accurate.
  
  Sources: <https://www.npmjs.com/package/node-sql-parser> · <https://datahub.com/blog/extracting-column-level-lineage-from-sql/> · <https://blog.reccehq.com/column-level-lineage-internals> · <https://sqlglot.com/sqlglot/lineage.html>
- **Render only visible elements and memoize node/edge components for large workspaces** _(effort M, impact medium)_  
  Every node card (motion.div with shadows/gradients) and SVG edge renders regardless of viewport. React Flow exposes onlyRenderVisibleElements plus React.memo for custom nodes, and its perf guide specifically calls out reducing shadows/gradients/animations on nodes for large graphs. Combined with the migration, this keeps the canvas smooth at hundreds of nodes instead of mounting everything.
  
  Sources: <https://reactflow.dev/learn/advanced-use/performance> · <https://www.synergycodes.com/blog/guide-to-optimize-react-flow-project-performance> · <https://dev.to/usman_abdur_rehman/react-flowxyflow-optimization-45ik>
- **Add graph export (PNG/SVG/JSON) and persist view state** _(effort M, impact medium)_  
  There is no way to export or share the lineage graph and pan/zoom/selection reset every refresh. React Flow integrates with html-to-image for PNG/SVG download (a documented example) and you already have the node/edge JSON model to export directly. Persisting viewport + selected node to a Zustand store (consistent with the app's existing store pattern) makes the screen feel like a real lineage tool.
  
  Sources: <https://reactflow.dev/examples> · <https://reactflow.dev/learn/advanced-use/performance>
- **Decompose LineageScreen.tsx and add a stable global layout ordering** _(effort M, impact medium)_  
  The 1525-line single client component mixes layout math, traversal, four tab views, and the detail panel, making it untestable and forcing whole-screen re-renders. Splitting into GraphTab/TableTab/ImpactTab/ColumnsTab + a useLineageModel hook, and replacing the per-column index*spacing y-assignment with a layout engine that minimizes edge crossings (dagre/elk handle multi-parent diamonds), fixes vertical overlap and unlocks memoization recommended by React Flow.
  
  Sources: <https://reactflow.dev/learn/advanced-use/performance> · <https://reactflow.dev/learn/layouting/layouting> · <https://www.synergycodes.com/blog/react-flow-everything-you-need-to-know>

**Recommended deps:** `@xyflow/react` (Modern React Flow v12 graph canvas: pan/zoom, MiniMap, Controls, fit-view, memoizable custom nodes/edges, onlyRenderVisibleElements — replaces the hand-rolled SVG+div canvas the feature was named for.), `@dagrejs/dagre` (Fast drop-in directed-graph layout to auto-position React Flow nodes (layered DAG), replacing the custom computeLayout column assignment; ideal for the tree-shaped lineage per React Flow's own layout guide.), `elkjs` (Alternative/optional layered layout engine for larger DAGs needing edge-crossing minimization and nested/sub-flow support when dagre is too simple.), `node-sql-parser` (Browser-capable SQL-to-AST parser to extract real column-level lineage from each dataset's transformSql (column/table lists + AST walk), replacing the name-match heuristic.), `html-to-image` (Export the lineage graph to PNG/SVG for sharing/reporting (the standard React Flow download-image approach).)

**Top pick:** Fix the traversal hot paths first (index nodes in a Map, add shared visited-sets and a cycle guard to walkUp/walkDown/walkImpact, and stop calling nodes.find() inside loops). It is a small, isolated change that removes a real hang/exponential-blowup risk on diamond/cyclic graphs and is a prerequisite that makes the larger React Flow migration safe and measurable.

---

## parsed-data — Parsed dataset views (Data Profile screen)  
_Maturity: **functional**_

**Current state:** src/features/parsed-data/screens/ParsedDataScreen.tsx (~1977 lines) renders the Data Profile page; src/app/dashboard/parsed/page.tsx is a thin wrapper. It reads datasets from useDataStore and the DuckDB catalog via listRegisteredDatasets()/runReadOnlyQuery() in src/platform/duckdb/duckdb. computeProfiles() loops per-column issuing 2-4 separate queries each: COUNT/COUNT DISTINCT, top-10 GROUP BY, numeric MIN/MAX/AVG/STDDEV/MEDIAN/PERCENTILE_CONT plus a 20-bin FLOOR histogram, and string LENGTH stats. Types live in model/types.ts (ColProfile, QualityDimension), formatting in model/profile-format.ts, reusable UI (QualityRing, StatGrid, ColCard, MiniBar) in components/profile-cards.tsx. Charts use echarts via echarts-for-react (completeness/validity bar+line, type-mix donut, null-rate heatmap, histogram, top-values bar). UI has search/filter/sort, four detail tabs, CSV export, and motion animations. Quality scoring is heuristic: validity is a constant 0.95/0.5 by type, uniqueness uses distinctCount/(total*0.5), consistency = share of columns with under 1% nulls.

**Gaps:**
- Per-column loop does N x 2-4 full-table scans (COUNT DISTINCT, exact PERCENTILE_CONT/MEDIAN, separate histogram pass); DuckDB single-scan SUMMARIZE is unused here though already used in data-formulator/tool-registry.ts.
- Validity is a hardcoded 0.95/0.5 constant, not real value/pattern validation, so quality scores are untrustworthy.
- No semantic-type/pattern detection (email, URL, IP, phone, UUID) or PII flagging, unlike modern profilers (ydata-profiling, Alation, OvalEdge).
- No outlier/anomaly detection despite p25/p75 already being computed.
- No cross-column analysis: correlations, duplicate-row detection, or candidate keys; every column is profiled in isolation.
- Exact COUNT(DISTINCT) and percentiles are costly on large data; approx_count_distinct/approx_quantile/reservoir_quantile unused.
- ~2000-line monolith mixing SQL, scoring, chart config and JSX; profiling logic not in model/ and no unit tests.
- No caching: switching datasets re-runs the full profile; TanStack Query not used despite being in the stack.
- Fixed 20 equal-width FLOOR histogram bins collapse under skew/outliers and need a separate scan.
- Date columns get no temporal profiling (min/max date, span, granularity, gaps); they fall through to the generic branch.

**Improvements:**

- **Replace the per-column query loop with a single DuckDB SUMMARIZE pass plus approx aggregates** _(effort M, impact high)_  
  SUMMARIZE scans the table once and returns min/max/approx_unique/avg/std/q25-q75/count/null% for every column at once, replacing the 2-4 scans per column. Since DuckDB 0.10 it is selectable (SELECT ... FROM (SUMMARIZE ...)) so results reshape directly into ColProfile. Collapses dozens of round-trips into one and the pattern is already proven in data-formulator/tool-registry.ts.
  
  Sources: <https://duckdb.org/docs/current/guides/meta/summarize> · <https://motherduck.com/glossary/SUMMARIZE/> · <https://duckdb.org/2024/11/29/duckdb-tricks-part-3>
- **Use approximate aggregates for distinct counts and quantiles on large datasets** _(effort S, impact high)_  
  approx_count_distinct (HyperLogLog) and approx_quantile (T-Digest, a few KB regardless of size)/reservoir_quantile give near-instant results within a small error bound, ideal for interactive profiling. Gate by a row-count threshold so small datasets stay exact and large ones stay responsive.
  
  Sources: <https://database.guide/approx_quantile-examples-in-duckdb/> · <https://database.guide/reservoir_quantile-examples-in-duckdb/> · <https://duckdb.org/docs/current/sql/samples>
- **Add real validity via semantic-type/pattern detection and replace the constant validity score** _(effort M, impact high)_  
  Replace the hardcoded 0.95/0.5 with regex conformance for emails/URLs/IPs/phones/UUIDs, computing the actual share of conforming values as ydata-profiling/Alation/OvalEdge do; this makes validity meaningful and enables a low-cost PII flag.
  
  Sources: <https://docs.profiling.ydata.ai/latest/features/pii_identification_management/> · <https://www.alation.com/blog/data-profiling-tools/> · <https://sparvi.io/blog/data-profiling-guide>
- **Add IQR-based outlier detection for numeric columns** _(effort S, impact medium)_  
  p25/p75 already exist, so deriving Q1-1.5*IQR / Q3+1.5*IQR bounds and counting values outside them is nearly free and a baseline profiling deliverable; render as an echarts boxplot (series already available).
  
  Sources: <https://medium.com/tensor-labs/from-noise-to-knowledge-mastering-exploratory-data-analysis-and-outlier-detection-f07a8eb8cf42> · <https://www.pantomath.com/guide-data-observability/data-profiling-techniques>
- **Extract profiling/scoring into a testable model module and cache results with TanStack Query** _(effort M, impact medium)_  
  Move SQL generation and ColProfile mapping out of the 2000-line component into model/ for unit tests, and wrap the async profile in useQuery keyed by datasetId to cache results and stop re-profiling on dataset toggle.
  
  Sources: <https://tanstack.com/query/latest/docs/framework/react/guides/caching> · <https://sparvi.io/blog/data-profiling-guide>
- **Add cross-column insights: correlation matrix, duplicate rows, and candidate-key detection** _(effort L, impact medium)_  
  DuckDB CORR for a numeric correlation heatmap (reusing the existing heatmap pattern), an exact duplicate-row count, and candidate-key detection (approx_unique ~ row count) turn column stats into dataset understanding that informs joins and dedup.
  
  Sources: <https://github.com/ydataai/ydata-profiling/blob/develop/docs/getting-started/concepts.md> · <https://atlan.com/know/data-profiling-tools/>
- **Improve histogram binning (quantile/log) and add temporal profiling for date columns** _(effort M, impact medium)_  
  Equi-depth/log bins read better under skew than fixed 20 equal-width FLOOR bins; date columns should report min/max date, span and granularity via date_trunc, and DuckDB native histogram() removes the separate scan.
  
  Sources: <https://duckdb.org/docs/current/sql/functions/aggregates> · <https://medium.com/@josef.machytka/quick-and-easy-statistics-and-histograms-with-duckdb-853fbe7ed834>

**Recommended deps:** `@tanstack/react-query` (Already in the project stack; cache/invalidate profile results keyed by datasetId so dataset switches do not re-run the full profile, with clean loading/error states.)

**Top pick:** Replace the per-column query loop in computeProfiles() with a single DuckDB SUMMARIZE pass (augmented with approx_count_distinct/approx_quantile for large tables). Highest leverage: eliminates dozens of redundant full-table scans, makes the profiler responsive on wide/large datasets, reuses a DuckDB pattern already in the codebase (data-formulator/tool-registry.ts), and still maps cleanly onto the existing ColProfile type.

---

## reconciliation — Data reconciliation / diff  
_Maturity: **stub**_

**Current state:** The route at src/app/dashboard/reconciliation/page.tsx renders ReconciliationScreen (src/features/reconciliation/screens/ReconciliationScreen.tsx), which is just a header wrapper delegating to ReconciliationWizard living in another feature folder (src/features/deep-analytics/components/ReconciliationWizard.tsx). The wizard is a 565-line, fully self-contained demo: a 5-step flow (Expected Totals -> Actual Data -> Comparison -> Investigation -> Finalize) built only with local useState and shadcn Card/Button/Badge primitives plus lucide icons. Critically, every data path is hardcoded/mocked: EXPECTED_DEFAULT and ACTUAL_DEFAULT are literal arrays of 5 telecom channels; the diff is a naive expected.map + actual.find on exact channel-name equality (line 135) with materiality fixed at abs(variance%) > 5 (line 150); 'AI hypotheses' are a static HYPOTHESIS_MAP gated behind a fake 1400ms setTimeout spinner (lines 164-172); 'Paste CSV', 'Use Previous Report', and 'Download PDF Report' buttons have no onClick handlers; 'Mark as Reconciled' only flips local boolean state. Despite UI copy claiming 'Auto-populated from current DuckDB dataset' and 'AI-powered investigation', it touches none of the app's real infrastructure that already exists and is used elsewhere: DuckDB read-only query layer (src/core/queries/duckdb.ts useDuckDBQuery + runReadOnlyQuery), web-llm engine (@mlc-ai/web-llm 0.2.84 via src/platform/ai/llm-engine.ts, src/hooks/use-llm-inference.ts), and installed papaparse, exceljs, jspdf/jspdf-autotable. No Zustand store, no persistence, no audit trail, no tests, no real export.

**Gaps:**
- Entirely mock data: expected and actual totals are hardcoded constants; nothing reads the user's loaded DuckDB datasets despite the UI claiming it does
- Matching is exact-string join on channel name only — no fuzzy/normalized key matching, no multi-key matching, no handling of rows present in one side but not the other (added/removed/orphan rows)
- No real row-level diff: only aggregate per-channel variance is computed. Cannot reconcile transaction-level records, detect duplicates, or surface specific mismatched rows
- 'AI investigation' is a static lookup table behind a fake spinner — does not call the existing web-llm engine, so hypotheses are not grounded in the actual variance data
- CSV paste, 'Use Previous Report', and PDF export buttons are non-functional stubs even though papaparse, exceljs, and jspdf are already dependencies
- Materiality is a single hardcoded 5% blanket threshold — no configurable per-metric or per-channel tolerance, no absolute-amount floor
- No persistence or audit trail: reason codes, notes, escalations, and 'reconciled' status live in component state and vanish on navigation; no timestamp/user attribution
- No diff visualization beyond a flat table — no side-by-side view, no color-coded added/removed/changed rows, no virtualization for large result sets
- Reconciliation logic and mock data are buried in a deep-analytics component, not co-located in the reconciliation feature or backed by a typed core module/store
- No tests covering the diff/variance computation

**Improvements:**

- **Replace mock data with a real DuckDB-powered diff engine using FULL OUTER JOIN + variance SQL** _(effort L, impact high)_  
  The wizard fabricates both sides and joins by exact channel name in JS. The app already exposes runReadOnlyQuery/useDuckDBQuery (src/core/queries/duckdb.ts). A FULL OUTER JOIN on the reconciliation key with NULL filters is the canonical DuckDB pattern for surfacing added/removed/changed rows, and SHA256 row-hash comparison catches changed rows cheaply — pushing the diff into SQL also scales to millions of rows in-engine instead of mapping arrays in React. Build a typed core module (e.g. src/features/reconciliation/core/diff.ts) that emits matched/added/removed/changed buckets plus per-metric variance.
  
  Sources: <https://sekuel.com/learn-sql/duckdb-cookbook/compare-tables-in-duckdb/> · <https://motherduck.com/duckdb-book-summary-chapter3/> · <https://blog.dailydoseofds.com/p/semi-anti-and-natural-joins-in-duckdb>
- **Add fuzzy / multi-key matching with confidence tiers for the key column** _(effort M, impact high)_  
  Exact-string equality on channel name breaks on any spelling/formatting drift and is useless for transaction-level reconciliation. 2025 best practice is deterministic-first then probabilistic/fuzzy fallback, with tiered thresholds (auto-accept >90%, review 70-90%, reject <70%) and normalization/tokenization before scoring. Even a lightweight Jaro-Winkler/Levenshtein pass (DuckDB has jaro_winkler_similarity built in, or string-similarity/fastest-levenshtein in JS) turns the unmatched bucket into review-able suggested matches instead of silent drops.
  
  Sources: <https://dataladder.com/fuzzy-matching-101/> · <https://optimus.tech/blog/fuzzy-matching-algorithms-in-bank-reconciliation-when-exact-match-fails> · <https://www.numeric.io/blog/transaction-reconciliation-guide>
- **Wire 'AI hypotheses' to the real web-llm engine with variance data as grounded context** _(effort M, impact high)_  
  HYPOTHESIS_MAP is a static dictionary behind a fake 1400ms timeout, so it cannot react to the user's actual data and the 'AI-powered' claim is false. The app already runs @mlc-ai/web-llm locally (src/platform/ai/llm-engine.ts, src/hooks/use-llm-inference.ts) and uses it in agent-canvas/ai-briefing. Feed the computed discrepancy rows (channel, variance%, absolute delta, direction) into a structured prompt to generate per-exception hypotheses and suggested reason codes, keeping everything offline/local.
  
  Sources: <https://montecarlo.ai/blog-data-reconciliation/> · <https://www.numeric.io/blog/transaction-reconciliation-guide>
- **Make CSV import and report export real using already-installed papaparse / exceljs / jspdf** _(effort M, impact high)_  
  The 'Paste CSV', 'Use Previous Report', and 'Download PDF Report' buttons are no-op stubs, yet papaparse, exceljs, and jspdf/jspdf-autotable are all in package.json and used elsewhere. Wiring papaparse for paste/upload of the expected side and jspdf-autotable/exceljs for a reconciliation report (summary + exception register + audit metadata) delivers a complete loop with zero new dependencies. Audit-grade reports should embed source files, rules applied, decisions, and approvals.
  
  Sources: <https://www.numeric.io/blog/transaction-reconciliation-guide> · <https://insightsoftware.com/blog/what-is-account-reconciliation/>
- **Add a proper diff viewer UI with color-coded added/removed/changed rows and split view** _(effort M, impact medium)_  
  The current Step 3 is one flat table with no notion of rows that exist only on one side. Established UX (GitHub-style split/unified diff, red strikethrough for removed, green for added) makes exceptions scannable; react-diff-viewer-continued adds virtualization for large result sets, or the shadcn changelog-diff-viewer block matches the app's existing shadcn/Tailwind design system. Pair with a dedicated 'exception queue' for material items.
  
  Sources: <https://www.npmjs.com/package/react-diff-viewer-continued?activeTab=readme> · <https://www.shadcn.io/blocks/changelog-diff-viewer> · <https://github.com/otakustay/react-diff-view>
- **Configurable materiality thresholds plus a persisted Zustand store with audit trail** _(effort M, impact medium)_  
  Materiality is hardcoded at a single 5% blanket rule and all state (reason codes, notes, escalations, reconciled flag) is ephemeral component state. Best practice sets thresholds by metric/type (volume vs revenue, percentage vs absolute floor) to cut false positives, and requires a complete audit trail — every comment/approval logged with timestamp and user. The codebase already uses Zustand stores extensively (src/core/stores/*); a reconciliation store with persistence would make decisions durable and auditable.
  
  Sources: <https://www.numeric.io/blog/materiality-threshold> · <https://www.numeric.io/blog/transaction-reconciliation-guide> · <https://insightsoftware.com/blog/what-is-account-reconciliation/>

**Recommended deps:** `react-diff-viewer-continued` (Maintained split/unified diff viewer with virtualization and word-level highlighting for rendering added/removed/changed reconciliation rows; matches the GitHub-style diff UX users expect), `fastest-levenshtein` (Tiny, fast edit-distance lib for JS-side fuzzy key matching / suggested-match scoring when reconciling on non-exact keys (DuckDB's built-in jaro_winkler can cover the SQL path))

**Top pick:** Replace the hardcoded mock data with a real DuckDB-powered diff engine (FULL OUTER JOIN + row-hash + variance SQL via the existing useDuckDBQuery/runReadOnlyQuery layer). Everything else — fuzzy matching, grounded LLM hypotheses, real export, the diff viewer — is downstream of having actual reconciled data instead of two literal arrays, and this is the change that makes the feature do what its UI already claims it does.

---

## report-studio — Report builder / multi-format export (PPTX, DOCX, PDF)  
_Maturity: **functional**_

**Current state:** A single-screen "Executive Report Studio" (src/features/report-studio/screens/ReportStudioScreen.tsx, ~1340 lines) with a 6-tab UI (PowerPoint, Word, PDF, Templates, Presentation, Branding) wired to a Next.js route (src/app/dashboard/report-studio/page.tsx). Three lazy-loaded generators exist: pptx-generator.ts (pptxgenjs, 10 slides incl. native bar/pie/line charts via slide.addChart), docx-generator.ts (docx package, cover + tables + footer/header with page numbers), and pdf-report.ts (jsPDF + jspdf-autotable, hand-drawn cover, KPI cards, channel tables, and a manually-plotted hourly line chart). It is visually polished and the generators produce real downloadable files. CRITICAL grounding fact: the entire feature runs on a hardcoded SAMPLE_DATA constant (ReportStudioScreen.tsx:20-42, fixed Telecom/transaction mock data) — it is completely disconnected from the app's actual DuckDB-wasm datasets, TanStack Query (src/core/queries), and Zustand stores (src/core/stores). Branding is persisted to localStorage. The ReportData shape (pptx-generator.ts:1-12) is a fixed telecom schema (totalTransactions, successRate, topChannels, hourlyData), not generic to arbitrary user data.

**Gaps:**
- Exports are bound to hardcoded SAMPLE_DATA — the feature never reads the user's actual DuckDB datasets/query results, so every PowerPoint/Word/PDF contains the same fake Telecom numbers regardless of what data is loaded
- No Excel/.xlsx export at all, despite exceljs being an intended dependency — there is no exceljs import or .xlsx path anywhere in src/features/report-studio
- DOCX charts are plain text placeholders ('[Chart: Hourly Transaction Distribution] — refer to the PowerPoint', docx-generator.ts:320-365); the Word doc has no real visuals
- Templates tab is cosmetic only — 'Use Template' (ReportStudioScreen.tsx:1114) just calls setActiveTab and applies no section presets, data filters, or layout to the actual export
- Branding is only partially honored: logoUrl is never embedded in any generated file, and primaryColor is ignored by docx (hardcoded '003087') and pdf (hardcoded RGB tuple at pdf-report.ts:30) so the brand color never reaches exports
- No error surfacing — generation failures are swallowed with console.error (handleGeneratePPTX/DOCX/PDF) and the user sees the spinner stop with no message
- Generation runs on the main thread; large exports (many slides/rows or embedded images) will block/freeze the UI with no progress indication beyond a spinner
- ReportData is a fixed telecom schema, not a generic report model — it cannot represent arbitrary columns, chart types, or user-authored sections
- No way to embed the app's real echarts/recharts/vega charts into exports; PPTX redraws native charts and PDF hand-plots one chart, duplicating chart logic instead of reusing rendered visuals

**Improvements:**

- **Wire reports to real DuckDB query results instead of SAMPLE_DATA** _(effort L, impact high)_  
  The single highest-value gap: the feature is a polished shell over fake data. Connect getReportData() to the app's existing TanStack Query/DuckDB-wasm layer (src/core/queries/duckdb.ts, datasets.ts) so exports reflect the user's actual loaded tables. Define an adapter that maps a selected dataset + aggregations to the ReportData shape (or a generalized one). Without this, the entire export pipeline produces meaningless documents.
  
  Sources: <https://www.nutrient.io/blog/javascript-pdf-libraries/>
- **Embed real rendered charts (echarts getDataURL PNG) into PDF and PPTX** _(effort M, impact high)_  
  Instead of hand-plotting charts in jsPDF and re-declaring native pptxgenjs charts, reuse the charts the app already renders. ECharts exposes chart.getDataURL({type:'png', pixelRatio:2, backgroundColor:'#fff'}) to produce a high-resolution PNG that can be embedded via pptxgenjs slide.addImage and jsPDF doc.addImage. Use pixelRatio>=2 and canvas (not SVG) rendering for crisp output. This gives WYSIWYG fidelity and removes duplicate charting code.
  
  Sources: <https://github.com/apache/echarts/issues/16098> · <https://quickchart.io/documentation/chart-js/image-export/> · <https://gitbrent.github.io/PptxGenJS/docs/api-charts/>
- **Add a styled Excel (.xlsx) export with ExcelJS** _(effort M, impact high)_  
  exceljs is the intended-but-missing format. ExcelJS supports rich cell styling, fonts/fills/borders, conditional formatting, formulas, and frozen headers in the browser, and is the most widely adopted styled-Excel library (~12M weekly downloads). Add an exceljs generator mirroring the DOCX section model so users can export tabular report data analysts actually want to pivot on.
  
  Sources: <https://www.pkgpulse.com/blog/sheetjs-vs-exceljs-vs-node-xlsx-excel-files-node-2026> · <https://deepwiki.com/exceljs/exceljs/2.4-styles-and-formatting> · <https://github.com/exceljs/exceljs>
- **Make Templates functional: presets that drive sections, filters, and layout** _(effort M, impact medium)_  
  Today 'Use Template' only switches tabs. Convert TEMPLATES_DEF into real configuration objects (which sections to include, which channels/columns, default chart set, target format) and apply them to the generator options state. This turns the most prominent tab from decoration into the feature's main value: repeatable, named report definitions.
  
  Sources: <https://apryse.com/blog/pdf-template-generation-libraries>
- **Offload generation to a Web Worker with real progress + error toasts** _(effort M, impact medium)_  
  PPTX/DOCX/PDF/XLSX serialization is CPU-heavy and currently blocks the main thread; failures are silently console.error'd. Run generators in a worker (the app already ships workers, e.g. VAD) and surface a determinate progress bar and user-visible error toast. Keeps the UI responsive for large datasets and gives feedback instead of a spinner that just stops.
  
  Sources: <https://www.nutrient.io/blog/javascript-pdf-libraries/> · <https://dev.to/handdot/generate-a-pdf-in-js-summary-and-comparison-of-libraries-3k0p>
- **Fully honor branding (logo + primary color) across all formats** _(effort S, impact medium)_  
  logoUrl is collected but never embedded, and primaryColor is hardcoded in docx ('003087') and pdf (RGB tuple). Thread branding.primaryColor through the pptx TEMPLATES colors, jsPDF color tuples, and docx run colors, and embed logoUrl via slide.addImage / jsPDF addImage / docx ImageRun. Brand consistency is the explicit promise of the Branding tab.
  
  Sources: <https://gitbrent.github.io/PptxGenJS/docs/api-charts/>
- **Evaluate pdfmake for the PDF path to replace manual coordinate drawing** _(effort L, impact low)_  
  pdf-report.ts manually computes every x/y coordinate and hand-draws the chart, which is brittle and hard to extend for variable-length data. pdfmake's declarative JSON layout handles tables, headers/footers, and pagination automatically and is better suited to data-driven, variable-length reports. Worth a scoped spike before adding more PDF sections; keep jsPDF only if pixel-level control is truly required.
  
  Sources: <https://npm-compare.com/@react-pdf/renderer,jspdf,pdfmake,react-pdf> · <https://joyfill.io/blog/comparing-open-source-pdf-libraries-2025-edition>

**Recommended deps:** `exceljs` (Styled, browser-capable .xlsx export with fonts/fills/borders, conditional formatting, formulas and frozen headers — fills the missing Excel format the feature was meant to support), `pdfmake` (Declarative JSON-based PDF layout (tables, auto-pagination, headers/footers) as a more maintainable alternative to the hand-coordinated jsPDF drawing in pdf-report.ts), `file-saver` (Robust cross-browser/Electron blob download to replace the ad-hoc createElement('a') + revokeObjectURL pattern duplicated across generators)

**Top pick:** Wire the report generators to the user's real DuckDB query results instead of the hardcoded SAMPLE_DATA constant (ReportStudioScreen.tsx:20-42). Everything else in this feature is polished but produces fake Telecom data today; connecting it to the app's existing DuckDB/TanStack Query layer is the prerequisite that makes every export actually useful.

---

## settings — App settings (conf, better-auth)  
_Maturity: **partial**_

**Current state:** A single-screen tabbed settings UI (src/features/settings/screens/SettingsScreen.tsx, ~738 lines, rendered by src/app/dashboard/settings/page.tsx). Six tabs (Appearance, Data, Performance, Notifications, Shortcuts, About) built with hand-rolled Toggle/Select/SettingRow primitives, lucide-react icons, and motion/react tab transitions. State lives in a Zustand store (src/core/stores/settings-store.ts) persisted via createDrizzleStorage (src/platform/storage/drizzle-storage.ts), which write-throughs to a SQLite app_setting table through /api/settings with localStorage as a synchronous warm-cache copy — a genuinely solid persistence layer. better-auth is fully wired (src/platform/auth/auth.ts with drizzleAdapter + emailAndPassword, auth-client.ts, src/app/api/auth/[...all]/route.ts) but is NOT surfaced anywhere in the settings UI. Critical disconnect: most settings are write-only and never applied — grep shows no consumer reads accentColor or density to drive the DOM/theme; theme-provider.tsx maintains its own theme state separate from the store; performance settings (duckdbWorkers, maxMemoryMB, virtualizeThreshold, cacheQueries) and data settings have no observed consumers beyond the store. Only pinnedItems is consumed (sidebar-nav.tsx). The Save button is cosmetic (zustand persists on every change); Reset works. No validation, no versioning/migration on the persisted schema, no import/export, no settings search.

**Gaps:**
- Most settings are inert: accentColor and density never touch the DOM/CSS variables, and there is no consumer reading them (no grep hit in dashboard-shell/layout). Users change values that do nothing.
- Theme is duplicated: SettingsScreen writes store.theme while theme-provider.tsx keeps a separate theme state — the two are not synced, so the picker may not reflect or drive the actual theme.
- Fake Save button: zustand persists on every mutation, so 'Save' is theater and contradicts the auto-apply behavior of every toggle, creating a misleading mental model.
- better-auth is installed and configured but there is NO Account/Profile/Security section: no sign-in state, change password (changePassword exists in better-auth), update profile (updateUser), or active-session management (listSessions/revokeSession).
- No schema validation or versioned migration on the persisted store — a stale/corrupt localStorage or app_setting row can hydrate impossible state with no recovery (Zod + persist `version`/`migrate` not used).
- Performance settings (duckdbWorkers, maxMemoryMB, WASM streaming) have no observed wiring into DuckDB init, so they mislead users about tunability.
- No settings search/filter — six tabs of options with no way to jump to a setting, a known discoverability problem for settings pages.
- No import/export of settings despite the drizzle layer explicitly being designed as 'one durable, exportable row' per store.
- Shortcuts tab is a static hardcoded list (not derived from a real keybinding registry) and is non-editable; About tab hardcodes version strings (v2.0.0, DuckDB 1.33.1) that will drift from package.json.
- Accessibility/correctness: custom toggle uses role=switch but custom Select is a native <select> styled inconsistently; no keyboard nav between tabs, no aria-current on tab buttons, no focus management on tab switch.

**Improvements:**

- **Make appearance settings actually apply (accent + density + theme as CSS variables / data-attributes)** _(effort M, impact high)_  
  accentColor and density are written but never read, so the entire Appearance tab is non-functional. Wire a small effect in the dashboard layout that sets data-density and an --accent CSS var on <html> from the store, and unify store.theme with theme-provider so the picker drives the real theme. This converts a dead UI into a working one with minimal code and is the single highest-trust fix.
  
  Sources: <https://www.setproduct.com/blog/settings-ui-design> · <https://www.toptal.com/designers/ux/settings-ux>
- **Drop the fake Save button; commit to instant-apply for imperative controls, explicit-apply only where it belongs** _(effort S, impact medium)_  
  Nielsen/Toptal and Primer guidance: toggles, segmented controls and single-selects should apply instantly (which they already do via zustand), so the Save button is misleading. Remove it for those controls and keep an explicit Apply only for declarative text/number inputs (row limit, memory) or settings that require a reload, with a clear 'requires reload' affordance.
  
  Sources: <https://www.toptal.com/designers/ux/settings-ux> · <https://primer.style/product/ui-patterns/saving/> · <https://design.gitlab.com/patterns/saving-and-feedback/>
- **Add an Account & Security section backed by better-auth (session state, change password, update profile, manage sessions)** _(effort M, impact high)_  
  better-auth is already configured (auth.ts, auth-client.ts) but invisible in settings. Use authClient.useSession to show signed-in state, changePassword (with revokeOtherSessions), updateUser for name/image, and listSessions/revokeSession for active-device management. This closes the biggest stated-feature gap (the feature is literally 'conf, better-auth').
  
  Sources: <https://better-auth.com/docs/basic-usage> · <https://better-auth.com/docs/concepts/session-management> · <https://better-auth.com/docs/concepts/users-accounts>
- **Validate and version the persisted settings schema with Zod + persist migrate** _(effort M, impact high)_  
  The store hydrates from localStorage/SQLite with no validation, risking impossible-state bugs that are hard to reproduce. Add a Zod schema (Zod v4 is 14x faster, smaller core) to parse on hydration via persist's onRehydrateStorage/merge, and add `version` + `migrate` so future shape changes don't silently discard user state. Directly recommended for zustand persist.
  
  Sources: <https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data> · <https://github.com/pmndrs/zustand/discussions/1722> · <https://zod.dev/v4/versioning>
- **Add settings search/command-palette filter across all tabs** _(effort M, impact medium)_  
  Settings UI research repeatedly cites 'users can't find what they need' as the core failure of multi-tab settings. A search box that filters/jumps to a setting (and integrates with the existing Ctrl+K palette) dramatically improves discoverability across the six tabs.
  
  Sources: <https://www.setproduct.com/blog/settings-ui-design> · <https://www.netguru.com/blog/how-to-improve-app-settings-ux>
- **Add import/export (and a real reset-with-confirm) leveraging the exportable drizzle row** _(effort S, impact medium)_  
  The drizzle storage layer was explicitly designed so each store is 'one durable, exportable row.' Exposing JSON export/import lets users back up and move configs, and pairs naturally with a confirmation on destructive reset (currently reset fires instantly with no undo).
  
  Sources: <https://www.toptal.com/designers/ux/settings-ux> · <https://design.gitlab.com/patterns/saving-and-feedback/>
- **Derive About-tab versions and the Shortcuts list from real sources** _(effort S, impact low)_  
  Hardcoded version strings (v2.0.0, DuckDB 1.33.1) and a static shortcut list drift from reality. Pull versions from package.json at build time and render shortcuts from a single keybinding registry so the displayed help stays accurate and could later become user-editable.
  
  Sources: <https://www.netguru.com/blog/how-to-improve-app-settings-ux> · <https://www.eleken.co/blog-posts/toggle-ux>

**Recommended deps:** `zod` (Validate the persisted settings shape on hydration and define a typed schema source-of-truth for the store, preventing impossible-state bugs (Zod v4: faster, smaller).), `@hookform/resolvers` (Bridge Zod schemas to react-hook-form for the declarative inputs (account/profile/password forms, numeric data inputs) with field-level validation.), `react-hook-form` (Manage the explicit-save forms (change password, update profile, row-limit/memory inputs) with validation and dirty-state tracking instead of ad-hoc useState.), `sonner` (Lightweight toast feedback for save/apply/error states (e.g., password changed, settings imported), replacing the cosmetic inline Saved! flag with accessible non-blocking feedback.)

**Top pick:** Wire the appearance settings so they actually apply (accent color + density as CSS variables/data-attributes on <html>, and unify store.theme with the existing theme-provider). Right now the Appearance tab — the most prominent, first-shown tab — changes store state that nothing reads, so users toggle accent colors and density with zero visible effect. This is a small, high-confidence fix that turns a dead UI into a working one and is the prerequisite that makes every other Appearance improvement meaningful.

---

## telecom — Telecom report domain (overview, period, canals, grid, day)  
_Maturity: **polished**_

**Current state:** A large, mature in-browser telecom transaction analytics feature (~146 files, ~90 components + ~30 lib/hook modules under src/features/telecom). Pages live at src/app/dashboard/telecom-report/{overview,period,canals,grid,day,analysis,history,config}/page.tsx and are thin wrappers over a shared runtime (telecom-report-runtime). Analytics run entirely client-side on DuckDB-wasm: src/features/telecom/lib/queries.ts (1139 lines) builds an enriched view and KPI/hourly/status/canal/operator/region aggregates via SQL string templates (qc/sqlLiteral helpers in lib/sql.ts), with period-scoped variants in lib/period-queries.ts (543 lines). State: column mapping/status mapping/custom KPIs persist via a Zustand store (store.ts) backed by a Drizzle storage adapter; runtime analytics state lives in TanStack Query (hooks/use-telecom-analytics.ts) keyed by table+mapping hash with staleTime Infinity. Insights are a deterministic, no-LLM rules engine (lib/insights.ts, 342 lines) using simple-statistics for hourly z-score anomalies (computeCanalRiskScore, generateNarrative, computeAIInsights). Forecasting uses Holt-Winters double exponential smoothing with linear-regression fallback (src/platform/browser/forecast-onnx.ts). An optional WebGPU/WASM LLM agent (lib/ai-agent.ts, 392 lines) via @huggingface/transformers + @mlc-ai/web-llm (Qwen2.5-0.5B) answers questions and emits a fixed intent set (parseIntent), never raw SQL. Charts use echarts/recharts/vega. Cross-tab sync via BroadcastChannel (lib/channel.ts), CSV export, analytics caching (lib/analytics-cache.ts). Anomaly detection at canal×hour granularity (period-queries.ts fetchAnomalies) uses plain mean/sample-SD z-scores in JS. UI/labels are French.

**Gaps:**
- Anomaly detection (lib/insights.ts detectHourlyAnomalies and period-queries.ts fetchAnomalies) uses classic mean/standard-deviation z-scores, which are non-robust: a few extreme spikes inflate the SD and mask other anomalies (the masking problem). No MAD/IQR or generalized-ESD alternative.
- No seasonal decomposition. Hourly/daily telecom traffic is strongly seasonal (peak-hour patterns, day-of-week), yet z-scores are computed on raw totals, so normal peak hours can be flagged and off-peak anomalies missed. No STL/MSTL trend+seasonal+residual modeling.
- Anomaly z-scores are computed in JS after pulling canal×hour cells to the client (fetchAnomalies loops in JS), not pushed into DuckDB SQL window functions — leaving DuckDB's in-database aggregation/window performance underused for this path.
- Near-zero automated test coverage: only 1 file in src/features/telecom contains describe/test, despite pure, highly testable analytics (insights.ts, forecast, anomaly math, canal classification SQL).
- The LLM agent (lib/ai-agent.ts) maps questions to a small hard-coded intent enum via regex (parseIntent) and cannot answer ad-hoc analytical questions; it does not use WebLLM's JSON-mode / function-calling for structured, validated tool calls, and there is no safe NL→SQL path.
- Forecasting is fixed-horizon point estimates with no uncertainty/prediction intervals and no day-of-week seasonality (forecast-onnx.ts Holt-Winters has no seasonal component despite the name implying it).
- Heavy console.groupCollapsed/console.log instrumentation throughout ai-agent.ts ships to production with no log-level gating.
- SQL is assembled by string interpolation (queries.ts/period-queries.ts); qc/sqlLiteral exist but every new query depends on disciplined manual escaping rather than parameterized statements.

**Improvements:**

- **Replace plain z-score anomaly detection with robust MAD / Seasonal-Hybrid ESD** _(effort M, impact high)_  
  Both detectHourlyAnomalies (insights.ts) and fetchAnomalies (period-queries.ts) use mean/SD z-scores, which a few large telecom spikes inflate, masking real anomalies and over-flagging normal peak hours. Industry guidance (Twitter's SH-ESD, decompose into trend+seasonal+residual then flag residuals) is the more reliable production approach for seasonal metrics and handles strong seasonality far better than raw z-score. A robust MAD-based modified z-score is a near drop-in upgrade; SH-ESD/STL is the fuller fix. simple-statistics is already a dependency for MAD/median.
  
  Sources: <https://www.tigerdata.com/learn/time-series-anomaly-detection-methods-sql-real-time-implementation> · <https://arxiv.org/pdf/2008.09245> · <https://tech.clevertap.com/anomaly-detection-for-time-series-data-part-2/> · <https://www.greptime.com/blogs/2026-06-03-greptimedb-anomaly-detection-functions>
- **Push anomaly z-scores into DuckDB SQL window functions** _(effort M, impact medium)_  
  fetchAnomalies currently pulls canal×hour cells and computes mean/SD/z in a JS loop. DuckDB-wasm aggregation on Arrow is 10-100x faster than JS object processing, and DuckDB natively supports moving-average / windowed z-score via AVG/STDDEV OVER (PARTITION BY canal). Computing anomaly scores in-database (the GreptimeDB Z-Score/MAD/IQR pattern) keeps the heavy math off the main thread and scales to large files.
  
  Sources: <https://duckdb.org/2025/05/02/stream-windowing-functions> · <https://medium.com/@ryanaidilp/building-a-high-performance-statistical-dashboard-with-duckdb-wasm-and-apache-arrow-d6178aeaae6d> · <https://ai2sql.io/learn/window-in-duckdb-guide> · <https://www.greptime.com/blogs/2026-06-03-greptimedb-anomaly-detection-functions>
- **Add seasonal decomposition (STL/MSTL) for hourly + day-of-week patterns** _(effort L, impact high)_  
  Telecom transaction volume has strong hour-of-day and day-of-week seasonality. Flagging anomalies on residuals after STL/MSTL decomposition (rather than on raw totals) sharply reduces false positives at normal peak hours and surfaces genuine off-peak drops. This also improves forecast-onnx.ts, whose Holt-Winters currently carries no seasonal term despite the filename.
  
  Sources: <https://arxiv.org/pdf/2008.09245> · <https://tech.clevertap.com/anomaly-detection-for-time-series-data-part-2/> · <https://arxiv.org/html/2412.20512v1>
- **Upgrade the LLM agent to WebLLM JSON-mode / function-calling with a validated tool schema** _(effort M, impact medium)_  
  lib/ai-agent.ts parses a fixed intent enum from free text via regex, so it cannot answer ad-hoc questions or safely widen capabilities. WebLLM (@mlc-ai/web-llm, already a dependency) is OpenAI-API compatible with JSON-mode and function-calling, letting the model emit a validated, structured tool/intent payload instead of a fragile regex match — and enabling a safe, allow-listed NL→SQL path that maps to existing query builders rather than executing model SQL.
  
  Sources: <https://github.com/mlc-ai/web-llm> · <https://blog.rasc.ch/2024/10/transformers-js-1.html> · <https://wowdata.science/browser-native-agents-llms-in-browser-ai-guide-2026/>
- **Add prediction intervals to the hourly forecast** _(effort M, impact medium)_  
  forecast-onnx.ts returns point estimates only. Adding residual-based prediction intervals (and day-of-week seasonality) lets the overview chart show an uncertainty band, which is more honest for capacity planning and lets insights.ts distinguish a real anomaly from expected variance instead of a single threshold.
  
  Sources: <https://arxiv.org/pdf/2510.11141> · <https://www.tigerdata.com/learn/time-series-anomaly-detection-methods-sql-real-time-implementation>
- **Add unit tests for the pure analytics layer** _(effort M, impact medium)_  
  insights.ts, ai-agent.ts rule engine, forecast math, and anomaly detection are pure functions with only ~1 test file in the whole feature. They encode business-critical thresholds (success-rate bands, refund/instance shares, z-score cutoffs). Vitest tests with fixture KPI/canal/hourly data would lock behavior before the robust-stats refactor above and prevent silent regressions in shipped insight copy.
  
  Sources: <https://www.tigerdata.com/learn/time-series-anomaly-detection-methods-sql-real-time-implementation>

**Recommended deps:** `@stdlib/stats-anomaly-detection-shesd` (Seasonal-Hybrid ESD (Twitter SH-ESD) anomaly detection in pure JS for the hourly/period anomaly path, replacing non-robust mean/SD z-scores with a seasonality-aware test.), `stl-js` (STL (Seasonal-Trend decomposition using Loess) to separate trend/seasonal/residual on hourly and day-of-week telecom volume before anomaly flagging and forecasting.)

**Top pick:** Replace the plain mean/SD z-score anomaly detection in lib/insights.ts and lib/period-queries.ts with robust, seasonality-aware detection (MAD-based modified z-score as a quick drop-in, then Seasonal-Hybrid ESD / STL residuals) — it directly fixes the masking and peak-hour false-positive problems that undermine the feature's core analytical value, and pairs naturally with locking the math behind unit tests.

---

## ux-innovations — Experimental UX components / innovations  
_Maturity: **partial**_

**Current state:** The feature contains exactly three files: src/features/ux-innovations/components/AchievementSystem.tsx (2321 lines), src/features/ux-innovations/components/OnboardingTour.tsx (283 lines), and src/features/ux-innovations/store/achievements-store.ts (119 lines).

OnboardingTour.tsx is a guided product tour built on react-joyride v3 (^3.1.0). It defines 8 hardcoded TOUR_STEPS targeting sidebar nav links by href (e.g. [href="/dashboard/telecom-report"]), renders a CustomTooltip, shows a one-time floating welcome card, and persists completion in localStorage under "tour:completed". It supports a compact trigger variant. Note: it uses onEvent + EventData and STATUS from react-joyride, and the styles/options pass overlayColor — this looks adapted to the v3 API.

AchievementSystem.tsx is a large gamification dashboard: 30 hardcoded AchievementDef entries across 6 categories (DATA_EXPERT, ANALYST_PRO, EXPLORER, COLLABORATOR, PERFORMANCE, ELITE), a 5-tier XP level system (Bronze→Diamond via getLevelInfo), a Leaderboard tab, an Activity feed, a Stats tab with a contribution-style heatmap, an achievement detail modal, a toast, and react-confetti-boom (^2.0.1) for unlock celebrations. Crucially, almost all of its data is fake/deterministic: LEADERBOARD_DATA, ACTIVITY_EVENTS, PERSONAL_STATS, HEATMAP_DATA, UNLOCK_TIMELINE, WHO_HAS and most progress {current,max} values are hardcoded placeholders. There is a compatibility shim useAchievementsStore() wrapping the localStorage store.

achievements-store.ts is localStorage-backed (zustand ^5 is in the project but NOT used here — these are plain functions). It exposes checkAndUnlock, isUnlocked, getPoints, getAllWithStatus, getRecentAchievements, etc., over a SEPARATE 15-item ALL_ACHIEVEMENTS list whose ids (first-import, ai-pioneer, data-detective, streak-3...) do not match the 30 ids in AchievementSystem's ACHIEVEMENTS array. So the rendered grid and the persistence layer are effectively disconnected.

Wiring: grep shows neither AchievementSystem nor OnboardingTour is imported anywhere outside the feature folder — they are not mounted in any route, layout, or page. The feature is currently dead/unwired code. No real event instrumentation exists anywhere in the app to fire checkAndUnlock when a user imports a file, runs a forecast, exports a report, etc.

**Gaps:**
- Components are not wired into the app: neither OnboardingTour nor AchievementSystem is imported by any layout/page, so users never see them (confirmed by grep across src/app and src/features).
- Two divergent achievement models: the 30-item ACHIEVEMENTS array in AchievementSystem.tsx and the 15-item ALL_ACHIEVEMENTS in achievements-store.ts have non-matching ids, so unlock state, points, and the rendered grid don't correspond to each other.
- Gamification is almost entirely fake: leaderboard, activity feed, heatmap, streaks, who-also-has, and most progress bars are hardcoded constants rather than derived from real user actions or the store.
- No event instrumentation: there is no central tracker/emitter that fires checkAndUnlock from real domain events (CSV import, forecast run, report export, anomaly detection), so achievements can never organically unlock.
- Accessibility/UX risk in custom overlays: the achievement detail modal and toast are hand-rolled fixed-position divs with z-[9999]/[10001], no focus trap, no Escape handling, no aria-modal/role=dialog, and no prefers-reduced-motion guard on confetti/animations.
- Onboarding tour is brittle and not gamified: steps target hardcoded sidebar hrefs (breaks if nav changes), the tour is single-flow with no per-screen contextual tours, no progress persistence beyond a boolean, and no checklist/'getting started' surface.
- No analytics/telemetry on either onboarding completion or achievement engagement, so there is no way to measure whether these UX innovations actually help activation/retention.
- Streak logic, time-based achievements (Night Owl, Early Bird, Perfect Week) and progress counters have no backing computation — they would need a real session/streak tracker.
- Store uses raw localStorage helpers instead of the project's existing zustand (^5) + persist pattern used by other stores, creating an inconsistent state architecture and no reactivity (the shim re-reads on mount only).

**Improvements:**

- **Wire both components into the dashboard and unify the achievement model into a single zustand persisted store** _(effort M, impact high)_  
  The feature is currently dead code. Mount OnboardingTour in the dashboard layout and AchievementSystem behind a route/panel, then collapse the two conflicting id sets into one source of truth using the project's existing zustand v5 + persist pattern (already a dependency, used by other stores). A single store gives reactivity (the current shim only reads on mount) and makes the rendered grid, points, and persistence consistent. This is the prerequisite for everything else.
  
  Sources: <https://github.com/pmndrs/zustand> · <https://nextstepjs.com/docs/nextjs/tour-steps>
- **Build a central achievement event tracker and instrument real domain events** _(effort L, impact high)_  
  Replace hardcoded progress/leaderboard/heatmap data with values derived from actual user actions. Add a small emitter (e.g. trackEvent('csv.import'|'forecast.run'|'report.export'|'anomaly.found')) called from existing features, and an evaluator that maps event counts to checkAndUnlock + progress. Behavioral-science best practice (endowed progress effect, visualized 'leveling up' nearly doubling onboarding completion) only works when progress reflects real behavior, not placeholders.
  
  Sources: <https://dodonut.com/blog/the-power-of-gamification-in-ux-design/> · <https://www.strivecloud.io/blog/what-is-gamification>
- **Make custom modal/toast overlays accessible and respect prefers-reduced-motion** _(effort M, impact medium)_  
  The hand-rolled detail modal and toast lack role=dialog/aria-modal, focus trapping, Escape-to-close, and reduced-motion handling for the confetti. Wrapping them in Radix Dialog/Popover (or radix-ui primitives) gives WAI-ARIA-correct focus management for free, and gating react-confetti-boom behind a prefers-reduced-motion check avoids the dark-pattern/accessibility pitfalls flagged in current gamification guidance.
  
  Sources: <https://www.radix-ui.com/primitives/docs/components/dialog> · <https://medium.com/@jgruver/the-dark-side-of-gamification-ethical-challenges-in-ux-ui-design-576965010dba>
- **Add contextual, per-screen tours and a 'getting started' checklist instead of one global tour** _(effort M, impact high)_  
  A single 8-step href-targeted tour is brittle and easy to dismiss-and-forget. 2025 onboarding guidance favors contextual, just-in-time walkthroughs plus a persistent progress checklist (which itself doubles as soft gamification via the endowed-progress effect). Either keep react-joyride v3 (recently rewritten on Floating UI with built-in focus trap + ARIA, so no need to switch) or adopt nextstepjs, which is purpose-built for Next.js App Router multi-page tours with framer-motion animations.
  
  Sources: <https://react-joyride.com/docs/new-in-v3> · <https://nextstepjs.com/> · <https://userguiding.com/blog/react-onboarding-tour>
- **Rebalance mechanics toward intrinsic motivation and remove fake social pressure by default** _(effort M, impact medium)_  
  Current design leans hard on extrinsic points/badges and a fabricated leaderboard with named colleagues. Current best practice warns that over-relying on extrinsic rewards and competition buys short-term engagement but harms long-term retention, and that not all users like leaderboards (player-type archetypes: achievers/explorers/socializers/competitors). Make the leaderboard real-or-hidden, emphasize personal mastery/progress, and let users opt out of competitive/notification mechanics.
  
  Sources: <https://dev.to/deniss_semjonovs_43d2d2f3/gamification-strategies-that-actually-work-in-2025-7a5> · <https://www.gianty.com/gamification-boost-user-engagement-in-2025/>
- **Add lightweight telemetry for onboarding completion and achievement engagement** _(effort S, impact medium)_  
  Neither the tour nor the achievement system records whether it actually improves activation. react-joyride v3 and nextstepjs both expose step/completion callbacks; wiring those plus achievement-unlock counts into the app's existing settings/session store (or a local analytics buffer) lets the team measure and iterate, which the gamification guidance repeatedly stresses ('test and measure which mechanics actually improve UX').
  
  Sources: <https://www.designstudiouiux.com/blog/gamification-ux-design/> · <https://nextstepjs.com/docs/nextjs/tour-steps>

**Recommended deps:** `nextstepjs` (Optional modern replacement/augmentation for the onboarding tour: purpose-built for Next.js App Router with multi-page navigation adapters, framer-motion animations and Tailwind/shadcn-friendly custom cards — better fit than the href-targeted react-joyride setup if contextual per-route tours are wanted.), `motion` (Animation primitive (Framer Motion successor package) for accessible, prefers-reduced-motion-aware tour/achievement animations; also the required peer for nextstepjs.), `@radix-ui/react-dialog` (Replace the hand-rolled achievement detail modal with a WAI-ARIA-correct dialog providing focus trap, Escape handling, and aria-modal out of the box.)

**Top pick:** Wire the two components into the app AND unify the duplicated achievement model into one zustand-persisted store with a real event tracker. Right now nothing is mounted and the rendered 30-badge grid uses a different id set than the 15-item localStorage store, so the feature shows fabricated data and can never organically unlock anything — fixing the wiring + single source of truth + real event instrumentation is the highest-leverage step because every other improvement depends on it.

---

