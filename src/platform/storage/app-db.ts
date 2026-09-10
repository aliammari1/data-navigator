/**
 * AppDatabase — Dexie-based IndexedDB storage
 *
 * Enterprise-grade local persistence using Dexie.js. This is the central,
 * versioned durable store for *many small structured records* — the replacement
 * for the `localStorage`-as-database anti-pattern the architecture calls out
 * (§2 storage split, §4 state & persistence). Big blobs (Parquet cache, model
 * weights, PMTiles) live in OPFS via `opfs-handles.ts`, NOT here.
 *
 * Architecture mapping (architecture.md §2/§4) → table:
 *   analyticsSnapshots — LEGACY, read/clear-only [v1]. The telecom "Persister"
 *     button + Analytics History list moved to the durable SQLite
 *     `analytics_snapshot_history` table (electron/settings-storage.ts) — see
 *     src/features/telecom/lib/analytics-sqlite-snapshot.ts. This table stays
 *     declared, with no write helpers, only so
 *     analytics-snapshot-legacy-migration.ts can lift any pre-existing rows
 *     out of it on first boot after the upgrade, then clear it.
 *   tableParquet       — DuckDB table exported as Parquet bytes          [v1]
 *   sessionState       — lightweight session metadata                    [v1]
 *   columnProfiles     — per-column profile keyed by datasetId+updatedAt [v2]
 *   transformRecipes   — saved transform/recipe definitions              [v2]
 *   importHistory      — dataset import log                              [v2]
 *   activityHistory    — query / activity event log                      [v2]
 *   savedQueries       — saved filters / queries                         [v2]
 *   achievements       — achievement / unlock state + event stream       [v2]
 *   reportDefinitions  — report definitions (branding-agnostic)          [v2]
 *   settingsDrift      — detected settings-vs-applied drift records       [v2]
 *   collabAnnotations  — local cache of collab annotations (Yjs mirror)  [v2]
 *   perfMetrics        — offline Web-Vitals RUM samples (CLS/LCP/INP/…)  [v3]
 *
 * NOTE: feature-local Dexie DBs (`help/lib/onboarding-db`,
 * `report-studio/data/db`) intentionally stay separate. This DB is the shared
 * platform store; feature agents adopt the accessors here rather than reaching
 * into another feature's DB.
 *
 * Pitfall guard: IndexedDB cannot clone live React elements / functions / class
 * instances — every write path here funnels through `toCloneSafeValue`.
 */

import Dexie, { type Table } from "dexie";

// ─── Schema types ────────────────────────────────────────────────────────────

interface AnalyticsSnapshot {
  key: string;
  savedAt: number;
  label: string;
  fileName: string;
  tableName: string;
  kpi: unknown;
  canals: unknown[];
  hourly: unknown[];
  statusData: unknown[];
  operators: unknown[];
  regions: unknown[];
  rawStatuses: unknown[];
  totalTransactions: number;
  successRate: number;
}

interface TableParquet {
  key: string; // tableName
  savedAt: number;
  tableName: string;
  bytes: ArrayBuffer; // raw Parquet bytes
  rowCount: number;
  fileSizeBytes: number;
}

interface SessionState {
  key: string; // singleton "current"
  updatedAt: number;
  activeTableName: string;
  fileName: string;
  reportDate: string;
  fileKey: string;
}

// ─── v2 small-record stores (architecture §2/§4) ─────────────────────────────

/**
 * Per-column profile (cardinality, null %, min/max, histogram, sample, etc.).
 * Keyed by a stable `id = "<datasetId>:<column>"` and indexed by
 * `[datasetId+updatedAt]` so a dataset's freshest profile set is one range read.
 */
interface ColumnProfile {
  id: string; // `${datasetId}:${column}`
  datasetId: string;
  column: string;
  updatedAt: number;
  /** Clone-safe profile payload (stats/histogram/topK). Shape owned by features. */
  profile: unknown;
}

/** Saved transform / recipe definition (data-transform feature). */
interface TransformRecipe {
  id: string;
  name: string;
  datasetId?: string;
  updatedAt: number;
  /** Ordered, clone-safe list of transform steps. */
  steps: unknown[];
}

/** One import-history record (data-import). */
interface ImportHistoryRecord {
  id: string;
  ts: number;
  day: string; // "YYYY-MM-DD" — group/range index
  fileName: string;
  datasetId?: string;
  tableName?: string;
  rowCount?: number;
  byteSize?: number;
  status: "success" | "partial" | "error";
  /** Optional clone-safe extra detail (rejected-row summary, encoding, etc.). */
  detail?: unknown;
}

/** One query / activity event (replaces capped-localStorage activity logs). */
interface ActivityRecord {
  id: string;
  ts: number;
  day: string; // "YYYY-MM-DD"
  source: "activity" | "dataset" | "transform" | "query" | "ai" | "export";
  type: string;
  message: string;
  datasetId?: string;
  tableName?: string;
  /** Optional clone-safe payload (sql text, duration, error). */
  detail?: unknown;
}

/** A saved filter or query (saved-queries / saved-filters surfaces). */
interface SavedQuery {
  id: string;
  name: string;
  kind: "filter" | "query";
  datasetId?: string;
  updatedAt: number;
  /** Clone-safe filter spec or SQL/query definition. */
  definition: unknown;
}

/**
 * Achievement state: a per-achievement unlock row PLUS the capped event stream
 * used to drive progress (replaces the synchronous parse-per-call localStorage
 * blob in achievements).
 */
interface AchievementRecord {
  id: string; // achievement id, or `evt:<uuid>` for stream rows
  kind: "unlock" | "event";
  ts: number;
  /** For "unlock": the unlocked achievement id; for "event": the trigger type. */
  ref: string;
  /** Clone-safe progress/event payload. */
  data?: unknown;
}

/** A report definition (report layout; branding stays in report-studio DB). */
interface ReportDefinitionRecord {
  id: string;
  name: string;
  format: string;
  updatedAt: number;
  /** Clone-safe report config (sections, selected channels, paper size, …). */
  config: unknown;
}

/**
 * A detected settings-drift record: a setting whose persisted value disagrees
 * with what was actually applied (theme single-source drift, perf knobs not
 * wired, etc.). Surfaced in Settings for self-healing.
 */
interface SettingsDriftRecord {
  id: string; // setting key
  ts: number;
  setting: string;
  expected: unknown;
  actual: unknown;
  resolved: boolean;
}

/** Local cache of a collab annotation (a flat mirror of the Yjs CRDT entry). */
interface CollabAnnotationRecord {
  id: string;
  roomId: string;
  updatedAt: number;
  author?: string;
  /** Clone-safe annotation body. */
  body: unknown;
}

/**
 * One offline Web-Vitals RUM sample (CLS/LCP/INP/FCP/TTFB). Captured by
 * `@/platform/perf/web-vitals` and stored ENTIRELY locally — there is no network
 * RUM endpoint (architecture.md §13: "web-vitals (offline RUM → IndexedDB)").
 * The append log is capped like the other unbounded logs via `pruneByTimestamp`.
 */
export interface PerfMetricRecord {
  id: string;
  ts: number;
  day: string; // "YYYY-MM-DD"
  /** Core Web Vital / metric name: "CLS" | "LCP" | "INP" | "FCP" | "TTFB". */
  metric: string;
  /** Numeric value (ms for timings, unitless for CLS). */
  value: number;
  /** web-vitals rating bucket. */
  rating: "good" | "needs-improvement" | "poor";
  /** Route/pathname the sample was taken on (groups budgets by route). */
  route: string;
  /** web-vitals delta since the last report for the same metric id. */
  delta?: number;
  /** Stable per-metric navigation id from web-vitals (dedupe/correlation). */
  navigationId?: string;
  /** Optional clone-safe extra detail (entries summary, nav type). */
  detail?: unknown;
}

// ─── Database class ──────────────────────────────────────────────────────────

class AppDatabase extends Dexie {
  analyticsSnapshots!: Table<AnalyticsSnapshot, string>;
  tableParquet!: Table<TableParquet, string>;
  sessionState!: Table<SessionState, string>;
  // v2
  columnProfiles!: Table<ColumnProfile, string>;
  transformRecipes!: Table<TransformRecipe, string>;
  importHistory!: Table<ImportHistoryRecord, string>;
  activityHistory!: Table<ActivityRecord, string>;
  savedQueries!: Table<SavedQuery, string>;
  achievements!: Table<AchievementRecord, string>;
  reportDefinitions!: Table<ReportDefinitionRecord, string>;
  settingsDrift!: Table<SettingsDriftRecord, string>;
  collabAnnotations!: Table<CollabAnnotationRecord, string>;
  // v3
  perfMetrics!: Table<PerfMetricRecord, string>;

  constructor() {
    super("data-navigator-app-v1");

    this.version(1).stores({
      analyticsSnapshots: "key, savedAt, fileName, tableName",
      tableParquet: "key, savedAt, tableName",
      sessionState: "key, updatedAt",
    });

    // v2 — add the small-record stores the architecture lists. NEVER edit the
    // v1 block above: a new index shape always means a NEW `.version(n)` block.
    this.version(2).stores({
      // unchanged v1 tables are re-declared so they survive the upgrade
      analyticsSnapshots: "key, savedAt, fileName, tableName",
      tableParquet: "key, savedAt, tableName",
      sessionState: "key, updatedAt",
      // new v2 tables — compound indexes declared so they are queryable
      columnProfiles: "id, datasetId, column, updatedAt, [datasetId+updatedAt]",
      transformRecipes: "id, name, datasetId, updatedAt",
      importHistory: "id, ts, day, datasetId, status, [day+status], [datasetId+ts]",
      activityHistory: "id, ts, day, source, datasetId, [source+ts], [day+source]",
      savedQueries: "id, name, kind, datasetId, updatedAt, [kind+updatedAt]",
      achievements: "id, kind, ts, ref, [kind+ts]",
      reportDefinitions: "id, name, format, updatedAt",
      // `resolved` is a boolean — NOT indexable in IndexedDB — so it is a plain
      // (unindexed) field; filter it in memory in `listUnresolvedDrift`.
      settingsDrift: "id, ts, setting",
      collabAnnotations: "id, roomId, updatedAt, author, [roomId+updatedAt]",
    });

    // v3 — add the offline Web-Vitals RUM log (architecture.md §13). Re-declare
    // all prior tables unchanged so they survive the upgrade; only `perfMetrics`
    // is new. NEVER edit the v1/v2 blocks above — a new index shape always means
    // a NEW `.version(n)` block.
    this.version(3).stores({
      analyticsSnapshots: "key, savedAt, fileName, tableName",
      tableParquet: "key, savedAt, tableName",
      sessionState: "key, updatedAt",
      columnProfiles: "id, datasetId, column, updatedAt, [datasetId+updatedAt]",
      transformRecipes: "id, name, datasetId, updatedAt",
      importHistory: "id, ts, day, datasetId, status, [day+status], [datasetId+ts]",
      activityHistory: "id, ts, day, source, datasetId, [source+ts], [day+source]",
      savedQueries: "id, name, kind, datasetId, updatedAt, [kind+updatedAt]",
      achievements: "id, kind, ts, ref, [kind+ts]",
      reportDefinitions: "id, name, format, updatedAt",
      settingsDrift: "id, ts, setting",
      collabAnnotations: "id, roomId, updatedAt, author, [roomId+updatedAt]",
      // new v3 table — compound indexes so a metric's or a route's freshest
      // samples are one range read for the perf inspector.
      perfMetrics: "id, ts, day, metric, route, rating, [metric+ts], [route+ts], [day+metric]",
    });
  }
}

export const appDb = new AppDatabase();

/**
 * Deep-clone a value into a structured-clone-safe form for IndexedDB:
 * strips functions/symbols/React elements, converts Date→ISO string and
 * bigint→string, preserves ArrayBuffer/typed-arrays, and breaks cycles.
 *
 * Exported so feature agents persisting their own records through the v2
 * accessors reuse the SAME sanitiser instead of re-implementing it (avoids the
 * `DataCloneError` class of bugs).
 */
function toCloneSafeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null) return null;

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return value;
  }

  if (valueType === "bigint") return String(value);
  if (valueType === "undefined" || valueType === "function" || valueType === "symbol") {
    return undefined;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value;

  if (Array.isArray(value)) {
    return value.map((item) => toCloneSafeValue(item, seen) ?? null);
  }

  if (valueType !== "object") return undefined;

  const objectValue = value as Record<string, unknown>;
  if (seen.has(objectValue)) return undefined;
  seen.add(objectValue);

  if ("$$typeof" in objectValue) return undefined;

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([mapKey, mapValue]) => [
      toCloneSafeValue(mapKey, seen) ?? null,
      toCloneSafeValue(mapValue, seen) ?? null,
    ]);
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => toCloneSafeValue(item, seen) ?? null);
  }

  const cloneSafeObject: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(objectValue)) {
    const cloneSafeItem = toCloneSafeValue(item, seen);
    if (cloneSafeItem !== undefined) {
      cloneSafeObject[key] = cloneSafeItem;
    }
  }
  return cloneSafeObject;
}

// ─── Session state ────────────────────────────────────────────────────────────

const SESSION_KEY = "current";

// ─── Shared id / time helpers ─────────────────────────────────────────────────

/**
 * Stable unique id. `crypto.randomUUID()` requires a secure context (true in a
 * packaged Electron renderer); a non-secure dev origin can lack it, so fall back
 * to a monotonic ULID-ish id that is still sortable and collision-resistant.
 */
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const time = Date.now().toString(36).padStart(9, "0");
  let rand = "";
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint8Array(10);
    c.getRandomValues(buf);
    for (const b of buf) rand += (b % 36).toString(36);
  } else {
    for (let i = 0; i < 10; i++) rand += Math.floor(Math.random() * 36).toString(36);
  }
  return `${time}${rand}`;
}

/** Local calendar day string ("YYYY-MM-DD") for `day` range/group indexes. */
function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Import history (append + paged read + retention) ────────────────────────

/**
 * Cap a log table to `keep` newest rows (run on boot / idle). Generic over the
 * v2 append-only logs that carry a `ts` index. Returns rows deleted.
 */
async function pruneByTimestamp<T extends { ts: number }>(
  table: Table<T, string>,
  keep: number,
): Promise<number> {
  const total = await table.count();
  if (total <= keep) return 0;
  const excess = total - keep;
  const oldKeys = (await table.orderBy("ts").limit(excess).primaryKeys()) as string[];
  await table.bulkDelete(oldKeys);
  return oldKeys.length;
}

async function listUnresolvedDrift(): Promise<SettingsDriftRecord[]> {
  // `resolved` is a boolean (unindexed) — filter in memory; the drift table is
  // tiny (one row per setting key), so a full scan is fine.
  return appDb.settingsDrift.filter((r) => !r.resolved).toArray();
}

// ─── Web-Vitals offline RUM (architecture.md §13) ────────────────────────────

/**
 * Append one Web-Vitals sample to the local RUM log. Network-free by design:
 * there is no upload endpoint — the dashboard's perf inspector reads these back
 * from IndexedDB. Detail is funnelled through `toCloneSafeValue` like every
 * other write path (PerformanceEntry objects are not structured-cloneable).
 */
export async function addPerfMetric(
  rec: Omit<PerfMetricRecord, "id" | "ts" | "day"> & Partial<Pick<PerfMetricRecord, "id" | "ts">>,
): Promise<string> {
  const ts = rec.ts ?? Date.now();
  const id = rec.id ?? newId();
  await appDb.perfMetrics.put({
    ...rec,
    id,
    ts,
    day: dayKey(ts),
    detail: rec.detail === undefined ? undefined : toCloneSafeValue(rec.detail),
  });
  return id;
}

/** Trim the RUM log to its newest `keep` rows (run on idle/boot). */
export async function prunePerfMetrics(keep = 5000): Promise<number> {
  return pruneByTimestamp(appDb.perfMetrics, keep);
}
