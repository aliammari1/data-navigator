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
 *   analyticsSnapshots — manually pinned analytics (KPIs, canals, etc.)  [v1]
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

export interface AnalyticsSnapshot {
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

export type AnalyticsSnapshotMeta = Pick<
  AnalyticsSnapshot,
  "key" | "savedAt" | "fileName" | "totalTransactions" | "successRate"
>;

export interface TableParquet {
  key: string; // tableName
  savedAt: number;
  tableName: string;
  bytes: ArrayBuffer; // raw Parquet bytes
  rowCount: number;
  fileSizeBytes: number;
}

export interface SessionState {
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
export interface ColumnProfile {
  id: string; // `${datasetId}:${column}`
  datasetId: string;
  column: string;
  updatedAt: number;
  /** Clone-safe profile payload (stats/histogram/topK). Shape owned by features. */
  profile: unknown;
}

/** Saved transform / recipe definition (data-transform feature). */
export interface TransformRecipe {
  id: string;
  name: string;
  datasetId?: string;
  updatedAt: number;
  /** Ordered, clone-safe list of transform steps. */
  steps: unknown[];
}

/** One import-history record (data-import). */
export interface ImportHistoryRecord {
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
export interface ActivityRecord {
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
export interface SavedQuery {
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
 * blob in ux-innovations).
 */
export interface AchievementRecord {
  id: string; // achievement id, or `evt:<uuid>` for stream rows
  kind: "unlock" | "event";
  ts: number;
  /** For "unlock": the unlocked achievement id; for "event": the trigger type. */
  ref: string;
  /** Clone-safe progress/event payload. */
  data?: unknown;
}

/** A report definition (report layout; branding stays in report-studio DB). */
export interface ReportDefinitionRecord {
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
export interface SettingsDriftRecord {
  id: string; // setting key
  ts: number;
  setting: string;
  expected: unknown;
  actual: unknown;
  resolved: boolean;
}

/** Local cache of a collab annotation (a flat mirror of the Yjs CRDT entry). */
export interface CollabAnnotationRecord {
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
      importHistory:
        "id, ts, day, datasetId, status, [day+status], [datasetId+ts]",
      activityHistory:
        "id, ts, day, source, datasetId, [source+ts], [day+source]",
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
      importHistory:
        "id, ts, day, datasetId, status, [day+status], [datasetId+ts]",
      activityHistory:
        "id, ts, day, source, datasetId, [source+ts], [day+source]",
      savedQueries: "id, name, kind, datasetId, updatedAt, [kind+updatedAt]",
      achievements: "id, kind, ts, ref, [kind+ts]",
      reportDefinitions: "id, name, format, updatedAt",
      settingsDrift: "id, ts, setting",
      collabAnnotations: "id, roomId, updatedAt, author, [roomId+updatedAt]",
      // new v3 table — compound indexes so a metric's or a route's freshest
      // samples are one range read for the perf inspector.
      perfMetrics:
        "id, ts, day, metric, route, rating, [metric+ts], [route+ts], [day+metric]",
    });
  }
}

export const appDb = new AppDatabase();

// ─── Analytics snapshot helpers ───────────────────────────────────────────────

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Deep-clone a value into a structured-clone-safe form for IndexedDB:
 * strips functions/symbols/React elements, converts Date→ISO string and
 * bigint→string, preserves ArrayBuffer/typed-arrays, and breaks cycles.
 *
 * Exported so feature agents persisting their own records through the v2
 * accessors reuse the SAME sanitiser instead of re-implementing it (avoids the
 * `DataCloneError` class of bugs).
 */
export function toCloneSafeValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null) return null;

  const valueType = typeof value;
  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean"
  ) {
    return value;
  }

  if (valueType === "bigint") return String(value);
  if (
    valueType === "undefined" ||
    valueType === "function" ||
    valueType === "symbol"
  ) {
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
    return Array.from(value.values()).map(
      (item) => toCloneSafeValue(item, seen) ?? null,
    );
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

export function toCloneSafeArray(value: unknown): unknown[] {
  const cloneSafeValue = toCloneSafeValue(value);
  return Array.isArray(cloneSafeValue) ? cloneSafeValue : [];
}

export async function saveAnalyticsSnapshot(
  snapshot: Omit<AnalyticsSnapshot, "key" | "savedAt">,
): Promise<string> {
  const savedAt = Date.now();
  const key = `snapshot:${snapshot.tableName}:${savedAt}`;
  await appDb.analyticsSnapshots.put({
    key,
    savedAt,
    label: String(snapshot.label || snapshot.fileName || "Analytics"),
    fileName: String(snapshot.fileName || snapshot.label || "Analytics"),
    tableName: String(snapshot.tableName || ""),
    kpi: toCloneSafeValue(snapshot.kpi) ?? null,
    canals: toCloneSafeArray(snapshot.canals),
    hourly: toCloneSafeArray(snapshot.hourly),
    statusData: toCloneSafeArray(snapshot.statusData),
    operators: toCloneSafeArray(snapshot.operators),
    regions: toCloneSafeArray(snapshot.regions),
    rawStatuses: toCloneSafeArray(snapshot.rawStatuses),
    totalTransactions: toFiniteNumber(snapshot.totalTransactions),
    successRate: toFiniteNumber(snapshot.successRate),
  });
  return key;
}

export async function listAnalyticsSnapshots(): Promise<AnalyticsSnapshot[]> {
  return appDb.analyticsSnapshots.orderBy("savedAt").reverse().toArray();
}

export async function listAnalyticsSnapshotMeta(): Promise<
  AnalyticsSnapshotMeta[]
> {
  const snapshots = await appDb.analyticsSnapshots
    .orderBy("savedAt")
    .reverse()
    .toArray();

  return snapshots.map(
    ({ key, savedAt, fileName, totalTransactions, successRate }) => ({
      key,
      savedAt,
      fileName,
      totalTransactions,
      successRate,
    }),
  );
}

export async function getAnalyticsSnapshot(
  key: string,
): Promise<AnalyticsSnapshot | undefined> {
  return appDb.analyticsSnapshots.get(key);
}

export async function deleteAnalyticsSnapshot(key: string): Promise<void> {
  await appDb.analyticsSnapshots.delete(key);
}

export async function getLatestSnapshot(
  tableName: string,
): Promise<AnalyticsSnapshot | undefined> {
  return appDb.analyticsSnapshots
    .where("tableName")
    .equals(tableName)
    .reverse()
    .first();
}

// ─── Parquet persistence (replaces OPFS) ─────────────────────────────────────

export async function saveTableParquet(
  tableName: string,
  bytes: ArrayBuffer,
  rowCount = 0,
): Promise<void> {
  await appDb.tableParquet.put({
    key: tableName,
    savedAt: Date.now(),
    tableName,
    bytes,
    rowCount,
    fileSizeBytes: bytes.byteLength,
  });
}

export async function loadTableParquet(
  tableName: string,
): Promise<ArrayBuffer | null> {
  const entry = await appDb.tableParquet.get(tableName);
  return entry?.bytes ?? null;
}

export async function hasTableParquet(tableName: string): Promise<boolean> {
  const count = await appDb.tableParquet.where("key").equals(tableName).count();
  return count > 0;
}

export async function deleteTableParquet(tableName: string): Promise<void> {
  await appDb.tableParquet.delete(tableName);
}

// ─── Session state ────────────────────────────────────────────────────────────

const SESSION_KEY = "current";

export async function saveSessionState(
  state: Omit<SessionState, "key" | "updatedAt">,
): Promise<void> {
  await appDb.sessionState.put({
    ...state,
    key: SESSION_KEY,
    updatedAt: Date.now(),
  });
}

export async function loadSessionState(): Promise<SessionState | null> {
  return (await appDb.sessionState.get(SESSION_KEY)) ?? null;
}

// ─── Shared id / time helpers ─────────────────────────────────────────────────

/**
 * Stable unique id. `crypto.randomUUID()` requires a secure context (true in a
 * packaged Electron renderer); a non-secure dev origin can lack it, so fall back
 * to a monotonic ULID-ish id that is still sortable and collision-resistant.
 */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const time = Date.now().toString(36).padStart(9, "0");
  let rand = "";
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint8Array(10);
    c.getRandomValues(buf);
    for (const b of buf) rand += (b % 36).toString(36);
  } else {
    for (let i = 0; i < 10; i++)
      rand += Math.floor(Math.random() * 36).toString(36);
  }
  return `${time}${rand}`;
}

/** Local calendar day string ("YYYY-MM-DD") for `day` range/group indexes. */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Column profiles (keyed by datasetId+updatedAt) ──────────────────────────

export function columnProfileId(datasetId: string, column: string): string {
  return `${datasetId}:${column}`;
}

export async function putColumnProfile(
  datasetId: string,
  column: string,
  profile: unknown,
): Promise<string> {
  const id = columnProfileId(datasetId, column);
  await appDb.columnProfiles.put({
    id,
    datasetId,
    column,
    updatedAt: Date.now(),
    profile: toCloneSafeValue(profile) ?? null,
  });
  return id;
}

/** Newest profiles for a dataset (one compound-index range read). */
export async function listColumnProfiles(
  datasetId: string,
): Promise<ColumnProfile[]> {
  return appDb.columnProfiles
    .where("[datasetId+updatedAt]")
    .between([datasetId, Dexie.minKey], [datasetId, Dexie.maxKey])
    .reverse()
    .toArray();
}

export async function getColumnProfile(
  datasetId: string,
  column: string,
): Promise<ColumnProfile | undefined> {
  return appDb.columnProfiles.get(columnProfileId(datasetId, column));
}

export async function deleteColumnProfilesForDataset(
  datasetId: string,
): Promise<void> {
  await appDb.columnProfiles.where("datasetId").equals(datasetId).delete();
}

// ─── Transform recipes ───────────────────────────────────────────────────────

export async function putTransformRecipe(
  recipe: Omit<TransformRecipe, "updatedAt" | "steps"> & { steps: unknown[] },
): Promise<string> {
  await appDb.transformRecipes.put({
    ...recipe,
    steps: toCloneSafeArray(recipe.steps),
    updatedAt: Date.now(),
  });
  return recipe.id;
}

export async function listTransformRecipes(
  datasetId?: string,
): Promise<TransformRecipe[]> {
  if (datasetId) {
    return appDb.transformRecipes
      .where("datasetId")
      .equals(datasetId)
      .reverse()
      .sortBy("updatedAt");
  }
  return appDb.transformRecipes.orderBy("updatedAt").reverse().toArray();
}

export async function deleteTransformRecipe(id: string): Promise<void> {
  await appDb.transformRecipes.delete(id);
}

// ─── Import history (append + paged read + retention) ────────────────────────

export async function addImportRecord(
  rec: Omit<ImportHistoryRecord, "id" | "ts" | "day"> &
    Partial<Pick<ImportHistoryRecord, "id" | "ts">>,
): Promise<string> {
  const ts = rec.ts ?? Date.now();
  const id = rec.id ?? newId();
  await appDb.importHistory.put({
    ...rec,
    id,
    ts,
    day: dayKey(ts),
    detail: rec.detail === undefined ? undefined : toCloneSafeValue(rec.detail),
  });
  return id;
}

export async function listImportHistory(limit = 500): Promise<
  ImportHistoryRecord[]
> {
  return appDb.importHistory.orderBy("ts").reverse().limit(limit).toArray();
}

// ─── Activity history (the query/activity event log) ─────────────────────────

export async function addActivityRecord(
  rec: Omit<ActivityRecord, "id" | "ts" | "day"> &
    Partial<Pick<ActivityRecord, "id" | "ts">>,
): Promise<string> {
  const ts = rec.ts ?? Date.now();
  const id = rec.id ?? newId();
  await appDb.activityHistory.put({
    ...rec,
    id,
    ts,
    day: dayKey(ts),
    detail: rec.detail === undefined ? undefined : toCloneSafeValue(rec.detail),
  });
  return id;
}

/** Newest events first, optionally filtered by source via the compound index. */
export async function listActivity(
  opts: { source?: ActivityRecord["source"]; limit?: number } = {},
): Promise<ActivityRecord[]> {
  const limit = opts.limit ?? 2000;
  if (opts.source) {
    return appDb.activityHistory
      .where("[source+ts]")
      .between([opts.source, Dexie.minKey], [opts.source, Dexie.maxKey])
      .reverse()
      .limit(limit)
      .toArray();
  }
  return appDb.activityHistory.orderBy("ts").reverse().limit(limit).toArray();
}

export async function countActivity(
  source?: ActivityRecord["source"],
): Promise<number> {
  return source
    ? appDb.activityHistory.where("source").equals(source).count()
    : appDb.activityHistory.count();
}

/**
 * Cap a log table to `keep` newest rows (run on boot / idle). Generic over the
 * v2 append-only logs that carry a `ts` index. Returns rows deleted.
 */
export async function pruneByTimestamp<T extends { ts: number }>(
  table: Table<T, string>,
  keep: number,
): Promise<number> {
  const total = await table.count();
  if (total <= keep) return 0;
  const excess = total - keep;
  const oldKeys = (await table
    .orderBy("ts")
    .limit(excess)
    .primaryKeys()) as string[];
  await table.bulkDelete(oldKeys);
  return oldKeys.length;
}

/** Convenience: trim the two unbounded append logs to their default caps. */
export async function compactLogs(opts?: {
  activityKeep?: number;
  importKeep?: number;
}): Promise<{ activity: number; imports: number }> {
  const activity = await pruneByTimestamp(
    appDb.activityHistory,
    opts?.activityKeep ?? 5000,
  );
  const imports = await pruneByTimestamp(
    appDb.importHistory,
    opts?.importKeep ?? 1000,
  );
  return { activity, imports };
}

// ─── Saved queries / filters ─────────────────────────────────────────────────

export async function putSavedQuery(
  q: Omit<SavedQuery, "updatedAt">,
): Promise<string> {
  await appDb.savedQueries.put({
    ...q,
    definition: toCloneSafeValue(q.definition) ?? null,
    updatedAt: Date.now(),
  });
  return q.id;
}

export async function listSavedQueries(
  kind?: SavedQuery["kind"],
): Promise<SavedQuery[]> {
  if (kind) {
    return appDb.savedQueries
      .where("kind")
      .equals(kind)
      .reverse()
      .sortBy("updatedAt");
  }
  return appDb.savedQueries.orderBy("updatedAt").reverse().toArray();
}

export async function deleteSavedQuery(id: string): Promise<void> {
  await appDb.savedQueries.delete(id);
}

// ─── Achievements (unlock rows + capped event stream) ────────────────────────

export async function unlockAchievement(
  achievementId: string,
  data?: unknown,
): Promise<void> {
  await appDb.achievements.put({
    id: achievementId,
    kind: "unlock",
    ts: Date.now(),
    ref: achievementId,
    data: data === undefined ? undefined : toCloneSafeValue(data),
  });
}

export async function recordAchievementEvent(
  triggerType: string,
  data?: unknown,
): Promise<string> {
  const id = `evt:${newId()}`;
  await appDb.achievements.put({
    id,
    kind: "event",
    ts: Date.now(),
    ref: triggerType,
    data: data === undefined ? undefined : toCloneSafeValue(data),
  });
  return id;
}

export async function listUnlockedAchievements(): Promise<
  AchievementRecord[]
> {
  return appDb.achievements
    .where("[kind+ts]")
    .between(["unlock", Dexie.minKey], ["unlock", Dexie.maxKey])
    .reverse()
    .toArray();
}

export async function isAchievementUnlocked(id: string): Promise<boolean> {
  const row = await appDb.achievements.get(id);
  return row?.kind === "unlock";
}

// ─── Report definitions ──────────────────────────────────────────────────────

export async function putReportDefinition(
  def: Omit<ReportDefinitionRecord, "updatedAt">,
): Promise<string> {
  await appDb.reportDefinitions.put({
    ...def,
    config: toCloneSafeValue(def.config) ?? null,
    updatedAt: Date.now(),
  });
  return def.id;
}

export async function listReportDefinitions(): Promise<
  ReportDefinitionRecord[]
> {
  return appDb.reportDefinitions.orderBy("updatedAt").reverse().toArray();
}

export async function deleteReportDefinition(id: string): Promise<void> {
  await appDb.reportDefinitions.delete(id);
}

// ─── Settings drift ──────────────────────────────────────────────────────────

export async function recordSettingsDrift(
  setting: string,
  expected: unknown,
  actual: unknown,
): Promise<void> {
  await appDb.settingsDrift.put({
    id: setting,
    ts: Date.now(),
    setting,
    expected: toCloneSafeValue(expected) ?? null,
    actual: toCloneSafeValue(actual) ?? null,
    resolved: false,
  });
}

export async function resolveSettingsDrift(setting: string): Promise<void> {
  await appDb.settingsDrift.update(setting, { resolved: true, ts: Date.now() });
}

export async function listUnresolvedDrift(): Promise<SettingsDriftRecord[]> {
  // `resolved` is a boolean (unindexed) — filter in memory; the drift table is
  // tiny (one row per setting key), so a full scan is fine.
  return appDb.settingsDrift.filter((r) => !r.resolved).toArray();
}

// ─── Collab annotation cache ─────────────────────────────────────────────────

export async function putCollabAnnotation(
  ann: Omit<CollabAnnotationRecord, "updatedAt"> & { updatedAt?: number },
): Promise<string> {
  await appDb.collabAnnotations.put({
    ...ann,
    body: toCloneSafeValue(ann.body) ?? null,
    updatedAt: ann.updatedAt ?? Date.now(),
  });
  return ann.id;
}

export async function listCollabAnnotations(
  roomId: string,
  limit = 1000,
): Promise<CollabAnnotationRecord[]> {
  return appDb.collabAnnotations
    .where("[roomId+updatedAt]")
    .between([roomId, Dexie.minKey], [roomId, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
}

export async function deleteCollabAnnotationsForRoom(
  roomId: string,
): Promise<void> {
  await appDb.collabAnnotations.where("roomId").equals(roomId).delete();
}

// ─── Web-Vitals offline RUM (architecture.md §13) ────────────────────────────

/**
 * Append one Web-Vitals sample to the local RUM log. Network-free by design:
 * there is no upload endpoint — the dashboard's perf inspector reads these back
 * from IndexedDB. Detail is funnelled through `toCloneSafeValue` like every
 * other write path (PerformanceEntry objects are not structured-cloneable).
 */
export async function addPerfMetric(
  rec: Omit<PerfMetricRecord, "id" | "ts" | "day"> &
    Partial<Pick<PerfMetricRecord, "id" | "ts">>,
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

/** Newest perf samples, optionally filtered by metric or route via index. */
export async function listPerfMetrics(
  opts: {
    metric?: string;
    route?: string;
    limit?: number;
  } = {},
): Promise<PerfMetricRecord[]> {
  const limit = opts.limit ?? 2000;
  if (opts.metric) {
    return appDb.perfMetrics
      .where("[metric+ts]")
      .between([opts.metric, Dexie.minKey], [opts.metric, Dexie.maxKey])
      .reverse()
      .limit(limit)
      .toArray();
  }
  if (opts.route) {
    return appDb.perfMetrics
      .where("[route+ts]")
      .between([opts.route, Dexie.minKey], [opts.route, Dexie.maxKey])
      .reverse()
      .limit(limit)
      .toArray();
  }
  return appDb.perfMetrics.orderBy("ts").reverse().limit(limit).toArray();
}

/** Trim the RUM log to its newest `keep` rows (run on idle/boot). */
export async function prunePerfMetrics(keep = 5000): Promise<number> {
  return pruneByTimestamp(appDb.perfMetrics, keep);
}
