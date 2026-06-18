export const meta = {
  name: 'research-duckdb-competitors',
  description: 'Vet embedded analytical-engine competitors to DuckDB for a Node/Windows benchmark',
  phases: [
    { title: 'Research', detail: 'one agent per engine family: web search for current Node bindings + Windows support + workload API' },
  ],
}

const RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    family: { type: 'string' },
    engines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          npmPackage: { type: 'string', description: 'exact install name + latest version' },
          kind: { type: 'string', description: 'columnar native / row-store SQL / pure-JS SQL / JS dataframe / WASM' },
          windowsSupport: { type: 'string', description: 'does it have prebuilt binaries / work on Windows x64 + Node 24? be specific' },
          maturity: { type: 'string' },
          includeInBench: { type: 'string', enum: ['yes', 'optional', 'no'] },
          workloadSketch: { type: 'string', description: 'concrete API sketch to: load ~1M rows, run a GROUP BY aggregation (success/total by channel) and a filtered count. real method names.' },
          notes: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['name', 'npmPackage', 'kind', 'windowsSupport', 'includeInBench', 'workloadSketch', 'source'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['family', 'engines', 'summary'],
}

const FAMILIES = [
  { key: 'polars', title: 'Polars for Node (the primary DuckDB rival)', detail: 'nodejs-polars (the official Polars Node binding). Find current package name + version, whether it ships prebuilt native binaries for Windows x64 / Node 24 (or needs a Rust toolchain), and the real API to: build a DataFrame from in-memory rows or read a CSV, then do a group_by aggregation and a filtered count. Note lazy vs eager. This is the most important competitor to benchmark against DuckDB.' },
  { key: 'embedded-sql', title: 'Embedded SQL engines usable from Node', detail: 'Compare: node:sqlite (the Node 24 BUILT-IN SQLite, no dep), better-sqlite3 (already a dependency), sql.js (SQLite compiled to WASM), alasql (pure-JS SQL engine), chdb / chdb-node (ClickHouse embedded), and any Apache DataFusion Node binding. For EACH: current package+version, WINDOWS x64 + Node 24 support (chdb especially — does it have Windows prebuilts or is it Linux/Mac only?), maturity, and a sketch to run a GROUP BY aggregation + filtered count over ~1M rows. Mark includeInBench=yes only if it actually runs on Windows without exotic setup.' },
  { key: 'js-dataframe', title: 'In-memory JS dataframe / columnar libraries', detail: 'arquero (already a dependency), Apache Arrow JS (apache-arrow, already a dep), danfo.js, and any tinybench-adjacent columnar agg lib. For each: how to do a group-by aggregation + filter over ~1M in-memory rows, perf expectations vs native engines, Windows/Node-24 fit. These are the pure-JS baselines.' },
  { key: 'duckdb-normal', title: 'DuckDB best practice: typed/normal usage vs VARCHAR + per-row TRY_CAST', detail: 'Research the RECOMMENDED way to run analytical aggregations in DuckDB for this kind of CSV-ingested data: (a) letting DuckDB natively infer column types on CSV read (read_csv_auto typed columns) and storing a typed table, vs (b) keeping every column VARCHAR and running TRY_CAST / TRY_STRPTIME inside each analytical query on every row (the approach this app currently uses because its renderer DuckDB is read-only and cannot CREATE typed tables). Confirm with DuckDB docs/blog the expected speedup of typed columnar scans vs repeated per-row string parsing, and the materialized-view / CTAS pattern. This validates the "DuckDB normal way" arm of the benchmark.' },
]

const prompt = (f) => `Research this engine family for a Node 24 / Windows x64 benchmark that compares embedded analytical engines against DuckDB on a telecom GROUP BY workload. Use the web (load WebSearch + WebFetch via ToolSearch first).

FAMILY: ${f.title}
WHAT I NEED: ${f.detail}

CONTEXT: the benchmark runs on WINDOWS x64, Node 24, pnpm. It loads ~1,000,000 synthetic telecom transaction rows and runs (1) a GROUP BY channel aggregation computing total + success counts + sum(amount), and (2) a filtered count. The app already depends on @duckdb/node-api, arquero, apache-arrow, better-sqlite3, hyparquet. New deps are OK if they install cleanly on Windows with prebuilt binaries (NO source compilation / no Rust/CMake toolchain requirement).

For each candidate engine return: npmPackage (+ latest version), kind, windowsSupport (be SPECIFIC about prebuilt-binary availability on Windows x64 Node 24 — this decides includeInBench), maturity, includeInBench (yes/optional/no), a concrete workloadSketch with REAL method names for load + group-by + filtered-count, notes, and source URLs. Then a short family summary. Verify current versions and Windows support via npm/GitHub/docs — do not guess.`

phase('Research')
const results = await parallel(
  FAMILIES.map((f) => () =>
    agent(prompt(f), { label: `cmp:${f.key}`, phase: 'Research', schema: RESULT })
      .then((r) => (r ? r : { family: f.key, died: true, engines: [], summary: 'agent died' })),
  ),
)
const include = results.flatMap((r) => (r.engines || []).filter((e) => e.includeInBench === 'yes').map((e) => `${e.name} (${e.npmPackage})`))
log(`Competitor research done; ${include.length} engines marked include=yes`)
return { results, include }