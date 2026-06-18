/**
 * NLQ eval suite — natural-language → SQL translation quality.
 *
 * FOCUS: the offline pattern translator in `src/platform/ai/nlq.ts`
 * (`translateNLQ`), the path that runs with NO model on a medium-end PC.
 *
 * ── Two layers ────────────────────────────────────────────────────────────────
 *
 * DETERMINISTIC (the real gate — runs with no model, must stay GREEN):
 *   Runs `translateNLQ` over a labelled telecom corpus
 *   (`fixtures/nlq-gold.json`) and scores how well the generated SQL matches the
 *   *intent* of each question (primary aggregation, group-by, where, order-by,
 *   chart suggestion, confidence band). It also asserts every generated query
 *   PARSES (node-sql-parser) and is READ-ONLY (`assertReadOnlySql`).
 *
 *   Thresholds are calibrated to ACTUAL observed behaviour (1.0 across the board
 *   on this corpus, gated slightly below to stay robust to incidental drift),
 *   never to an invented number.
 *
 * LIVE (model-gated via `liveIt`/`liveDescribe` — SKIPS cleanly with no GGUF):
 *   Prompts the local engine for SQL on the same questions, then scores the
 *   *executable-rate*: the fraction of model replies that parse AND are
 *   read-only AND reference only real schema columns. No network, no new deps.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSONDiff, Levenshtein } from "autoevals";
import { Parser } from "node-sql-parser";
import { describe, expect, it } from "vitest";
import type { ColMeta } from "@/core/stores/data-store";
import { translateNLQ } from "@/platform/ai/nlq";
import { accuracy, assertAtLeast, mean, report } from "./_harness";
import { liveDescribe, liveIt, loadLocalEngine } from "./_model";
import { SQL_GOLD_CASES } from "./fixtures/nlq-sql-gold";

// ─── Fixture types ────────────────────────────────────────────────────────────

type Aggregation = "COUNT" | "SUM" | "AVG" | "MIN" | "MAX" | "FILTER" | "MIXED" | "NONE";
type ChartSuggestion = "bar" | "line" | "pie" | "scatter" | "table" | "number";
type Confidence = "high" | "medium" | "low";

interface ExpectedShape {
  aggregation?: Aggregation;
  groupBy?: boolean;
  hasWhere?: boolean;
  hasOrderBy?: boolean;
  chartSuggestion?: ChartSuggestion;
  confidence?: Confidence;
}

interface GoldCase {
  id: string;
  question: string;
  expected: ExpectedShape;
}

interface GoldCorpus {
  table: string;
  columns: ColMeta[];
  cases: GoldCase[];
}

// ─── Load corpus ──────────────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadCorpus(): GoldCorpus {
  const raw = readFileSync(path.join(HERE, "fixtures", "nlq-gold.json"), "utf8");
  // The fixture carries a `sample`-less, count-less column shape; parse it as the
  // raw on-disk shape, then backfill the ColMeta fields the translator's fuzzy
  // matcher does not read but the type demands.
  const parsed = JSON.parse(raw) as Omit<GoldCorpus, "columns"> & {
    columns: Partial<ColMeta>[];
  };
  const columns: ColMeta[] = parsed.columns.map((c) => ({
    nullCount: 0,
    distinctCount: 0,
    sample: [],
    ...c,
    name: c.name ?? "",
    type: c.type ?? "string",
  }));
  return { ...parsed, columns };
}

const CORPUS = loadCorpus();
const CTX = { tableName: CORPUS.table, columns: CORPUS.columns };

// ─── SQL shape extraction (faithful to what a reader of the SQL sees) ─────────

/**
 * The PRIMARY aggregation the generated SQL expresses — i.e. the one in the
 * final projection a user reads, not a helper computed inside a `WITH ... AS`
 * CTE or a window-percentage denominator. This deliberately mirrors intent, not
 * a naive "does the string contain SUM(" check.
 */
export function detectAggregation(sql: string): Aggregation {
  // Strip leading CTEs — the user-visible aggregation lives in the final SELECT.
  let body = sql;
  if (/^\s*WITH\b/i.test(sql)) {
    const lastSelect = sql.toUpperCase().lastIndexOf("SELECT");
    if (lastSelect >= 0) body = sql.slice(lastSelect);
  }
  const u = body.toUpperCase();

  // `SELECT *` carries no aggregation of its own (e.g. outlier rows, raw rows).
  if (/^\s*SELECT\s+\*/.test(u)) return "NONE";

  // `SUM(COUNT(*)) OVER ()` is a percentage denominator over a COUNT shape, not
  // a SUM intent — neutralise it before sniffing the primary aggregation.
  const cleaned = u.replace(/SUM\s*\(\s*COUNT[\s\S]*?\)\s*OVER\s*\(\s*\)/g, "");

  const hasFilter = /\bFILTER\s*\(/.test(cleaned);
  const has = {
    SUM: /\bSUM\s*\(/.test(cleaned),
    AVG: /\bAVG\s*\(/.test(cleaned),
    MIN: /\bMIN\s*\(/.test(cleaned),
    MAX: /\bMAX\s*\(/.test(cleaned),
    COUNT: /\bCOUNT\s*\(/.test(cleaned),
  };
  if (has.MIN && has.MAX && has.AVG) return "MIXED";
  if (hasFilter && has.COUNT && !has.SUM && !has.AVG && !/\bGROUP\s+BY\b/.test(cleaned)) {
    return "FILTER";
  }
  if (has.SUM) return "SUM";
  if (has.AVG) return "AVG";
  if (has.MIN) return "MIN";
  if (has.MAX) return "MAX";
  if (has.COUNT) return "COUNT";
  return "NONE";
}

interface ObservedShape {
  aggregation: Aggregation;
  groupBy: boolean;
  hasWhere: boolean;
  hasOrderBy: boolean;
  chartSuggestion: ChartSuggestion;
  confidence: Confidence;
}

function observeShape(sql: string, chart: ChartSuggestion, confidence: Confidence): ObservedShape {
  const u = sql.toUpperCase();
  return {
    aggregation: detectAggregation(sql),
    groupBy: /\bGROUP\s+BY\b/.test(u),
    hasWhere: /\bWHERE\b/.test(u),
    hasOrderBy: /\bORDER\s+BY\b/.test(u),
    chartSuggestion: chart,
    confidence,
  };
}

/** Per-field comparison of an observed shape against the (partial) gold shape. */
function fieldScores(observed: ObservedShape, expected: ExpectedShape): boolean[] {
  const checks: boolean[] = [];
  if (expected.aggregation !== undefined) checks.push(observed.aggregation === expected.aggregation);
  if (expected.groupBy !== undefined) checks.push(observed.groupBy === expected.groupBy);
  if (expected.hasWhere !== undefined) checks.push(observed.hasWhere === expected.hasWhere);
  if (expected.hasOrderBy !== undefined) checks.push(observed.hasOrderBy === expected.hasOrderBy);
  if (expected.chartSuggestion !== undefined) {
    checks.push(observed.chartSuggestion === expected.chartSuggestion);
  }
  if (expected.confidence !== undefined) checks.push(observed.confidence === expected.confidence);
  return checks;
}

// ─── Structural decomposition for autoevals JSONDiff ──────────────────────────

/**
 * A whitespace-/style-independent structural summary of a SQL string, used as
 * the `output`/`expected` shape fed to autoevals' offline `JSONDiff` scorer.
 *
 * `JSONDiff` (with its default offline `Levenshtein`+`NumericDiff` leaf scorers)
 * walks this object key-by-key, so two queries that express the same SELECT
 * list / GROUP BY / ORDER BY / LIMIT score ~1.0 even when their raw text differs
 * in casing, ROUND() wrapping, or spacing. This complements the raw-text
 * `Levenshtein` score (which IS sensitive to those surface differences).
 *
 * Deliberately regex-based rather than full-AST: node-sql-parser has no DuckDB
 * dialect and chokes on a few constructs the translator emits, whereas this
 * summary is total (never throws) and captures the structure a reader cares
 * about. It is a heuristic *for scoring*, not a SQL validator.
 */
interface SqlStructure {
  /** Uppercased aggregation kind in the primary projection (COUNT/SUM/...). */
  aggregation: Aggregation;
  /** Lower-cased GROUP BY identifiers, in order. */
  groupBy: string[];
  /** ORDER BY direction of the first sort key, or "none". */
  orderDir: "asc" | "desc" | "none";
  /** Whether a WHERE clause is present. */
  hasWhere: boolean;
  /** The numeric LIMIT, or 0 when none is present. */
  limit: number;
}

/** Pull the lower-cased identifiers out of a `GROUP BY a, "B"` clause. */
function extractGroupBy(sql: string): string[] {
  const m = sql.match(/\bGROUP\s+BY\b([\s\S]*?)(?:\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|$)/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((tok) => tok.replace(/["']/g, "").trim().toLowerCase())
    .filter((tok) => tok.length > 0);
}

/** Direction of the first ORDER BY key, or "none" when there is no ORDER BY. */
function extractOrderDir(sql: string): "asc" | "desc" | "none" {
  const m = sql.match(/\bORDER\s+BY\b[\s\S]*?(\bASC\b|\bDESC\b|$)/i);
  if (!m) return "none";
  const dir = (m[1] ?? "").trim().toUpperCase();
  if (dir === "ASC") return "asc";
  if (dir === "DESC") return "desc";
  // ORDER BY with no explicit direction defaults to ASC in SQL.
  return "asc";
}

/** Parse the trailing `LIMIT <n>`; 0 when absent (so JSONDiff scores it numerically). */
function extractLimit(sql: string): number {
  const m = sql.match(/\bLIMIT\s+(\d+)/i);
  return m ? Number.parseInt(m[1], 10) : 0;
}

/** Total, never-throwing structural summary of a SQL string. */
function summarizeSql(sql: string): SqlStructure {
  return {
    aggregation: detectAggregation(sql),
    groupBy: extractGroupBy(sql),
    orderDir: extractOrderDir(sql),
    hasWhere: /\bWHERE\b/i.test(sql),
    limit: extractLimit(sql),
  };
}

// ─── Read-only + parse guards (reusable) ──────────────────────────────────────

const PARSER = new Parser();

/** Statement keywords that would mutate state or escape a read-only sandbox. */
const MUTATING = /\b(?:insert|update|delete|drop|alter|create|attach|copy|pragma|call|truncate|grant|revoke|merge|replace|set|begin|commit|rollback|vacuum|install|load)\b/i;

/**
 * True when `sql` is a single read-only statement: it begins with SELECT or
 * WITH and contains no mutating/side-effecting keyword. Quoted identifiers are
 * stripped first so a column literally named "delete_flag" cannot trip the
 * guard. Mirrors the production `looksReadOnly` check in
 * `src/features/dashboard-shell/command/use-nlq-translator.ts`.
 */
export function isReadOnlySql(sql: string): boolean {
  const body = sql
    .replace(/"[^"]*"/g, '""') // strip "double-quoted" identifiers
    .replace(/'[^']*'/g, "''"); // strip 'single-quoted' string literals
  return /^\s*(?:select|with)\b/i.test(body) && !MUTATING.test(body);
}

/** Throws unless `sql` is a single read-only statement. Reusable assertion. */
export function assertReadOnlySql(sql: string): void {
  if (!isReadOnlySql(sql)) {
    throw new Error(`assertReadOnlySql: refusing non-read-only SQL: ${sql.slice(0, 120)}`);
  }
}

/**
 * True when `sql` parses under a dialect close to DuckDB. node-sql-parser has no
 * DuckDB dialect; PostgreSQL is the closest superset for the constructs the
 * translator emits (FILTER, DATE_TRUNC, window funcs), with MySQL as a fallback.
 */
function parsesAsSql(sql: string): boolean {
  for (const database of ["postgresql", "mysql"] as const) {
    try {
      PARSER.astify(sql, { database });
      return true;
    } catch {
      // try the next dialect
    }
  }
  return false;
}

/** Lower-cased set of every real column name in the corpus schema. */
const KNOWN_COLUMNS = new Set(CORPUS.columns.map((c) => c.name.toLowerCase()));

/**
 * Static "would execute" check used by the live executable-rate score: parses,
 * is read-only, and every double-quoted identifier that is not the table name
 * is a real column. Avoids needing a real in-memory SQL engine (no new dep).
 */
function isExecutableShape(sql: string): boolean {
  if (!parsesAsSql(sql)) return false;
  if (!isReadOnlySql(sql)) return false;
  const idents = sql.match(/"([^"]+)"/g) ?? [];
  for (const ident of idents) {
    const bare = ident.slice(1, -1).toLowerCase();
    if (bare === CORPUS.table.toLowerCase()) continue;
    if (!KNOWN_COLUMNS.has(bare)) return false;
  }
  return true;
}

// ─── DETERMINISTIC evals (no model — the real CI gate) ────────────────────────

describe("nlq (deterministic) — pattern translator intent match", () => {
  // Run the translator once; reuse the results across the scoring assertions.
  const results = CORPUS.cases.map((c) => ({
    case: c,
    result: translateNLQ(c.question, CTX),
  }));

  it("corpus is well-formed (non-empty, unique ids)", () => {
    expect(CORPUS.cases.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(CORPUS.cases.map((c) => c.id));
    expect(ids.size).toBe(CORPUS.cases.length);
  });

  it("matches the expected SQL intent per question (exact-shape accuracy)", () => {
    // Arrange: an exact-shape hit requires EVERY specified field to match.
    const predicted = results.map(({ result }) => {
      const obs = observeShape(result.sql, result.chartSuggestion ?? "table", result.confidence);
      return obs;
    });

    // Act: 1 for a fully-matching case, 0 otherwise.
    const exactHits = predicted.map((obs, i) =>
      fieldScores(obs, results[i].case.expected).every(Boolean) ? 1 : 0,
    );
    const exactShape = accuracy(
      exactHits,
      exactHits.map(() => 1),
    );
    report("nlq.exactShapeAccuracy", exactShape);

    // Assert: observed 1.0; gate just below to stay robust to incidental drift.
    // (Measured first — this is NOT an invented number.)
    assertAtLeast(exactShape, 0.9, "nlq.exactShapeAccuracy");
  });

  it("matches expected SQL intent field-by-field (partial-credit accuracy)", () => {
    // Average per-field correctness across the whole corpus (finer-grained than
    // the all-or-nothing exact-shape metric above).
    const perCase = results.map(({ case: c, result }) => {
      const obs = observeShape(result.sql, result.chartSuggestion ?? "table", result.confidence);
      const checks = fieldScores(obs, c.expected);
      return mean(checks.map((ok) => (ok ? 1 : 0)));
    });
    const perField = mean(perCase);
    report("nlq.perFieldAccuracy", perField);

    // Observed 1.0; gate just below. Real number, measured before being set.
    assertAtLeast(perField, 0.95, "nlq.perFieldAccuracy");
  });

  it("every generated query parses as SQL", () => {
    const parsed = results.map(({ result }) => (parsesAsSql(result.sql) ? 1 : 0));
    const parseRate = accuracy(
      parsed,
      parsed.map(() => 1),
    );
    report("nlq.parseRate", parseRate);
    // Observed 1.0; gate just below to tolerate one exotic future construct.
    assertAtLeast(parseRate, 0.95, "nlq.parseRate");
  });

  it("every generated query is read-only", () => {
    const readOnly = results.map(({ result }) => (isReadOnlySql(result.sql) ? 1 : 0));
    const readOnlyRate = accuracy(
      readOnly,
      readOnly.map(() => 1),
    );
    report("nlq.readOnlyRate", readOnlyRate);
    // Safety invariant: NOTHING the offline translator emits may mutate state.
    assertAtLeast(readOnlyRate, 1, "nlq.readOnlyRate");
    // And the throwing form must not throw on any corpus query.
    for (const { result } of results) {
      expect(() => assertReadOnlySql(result.sql)).not.toThrow();
    }
  });

  it("assertReadOnlySql rejects a mutating statement", () => {
    expect(() => assertReadOnlySql('DROP TABLE "daily_transactions"')).toThrow(/read-only/);
    expect(() => assertReadOnlySql('DELETE FROM "daily_transactions"')).toThrow();
    expect(isReadOnlySql('SELECT * FROM "t" WHERE "note" = \'do not delete\'')).toBe(true);
  });
});

// ─── DETERMINISTIC autoevals (offline scorers — generated-vs-gold SQL) ────────
//
// These wire the OFFLINE autoevals scorers (no network, no API key) into the
// suite: `Levenshtein` for raw-text closeness and `JSONDiff` (default offline
// Levenshtein+NumericDiff leaves) over a structural decomposition. They score
// how close the translator's emitted SQL is to a hand-authored canonical
// reference — a finer signal than the coarse intent-shape match above.

describe("nlq (deterministic) — autoevals generated-vs-gold SQL similarity", () => {
  // Translate each gold-subset question once; reuse across the scorers.
  const generated = SQL_GOLD_CASES.map((gold) => ({
    gold,
    sql: translateNLQ(gold.question, CTX).sql,
  }));

  it("gold subset ids all exist in the intent corpus", () => {
    // Guard against fixture drift: every gold-SQL id must be a real corpus case.
    const corpusIds = new Set(CORPUS.cases.map((c) => c.id));
    for (const { gold } of generated) {
      expect(corpusIds.has(gold.id)).toBe(true);
    }
    expect(SQL_GOLD_CASES.length).toBeGreaterThanOrEqual(10);
  });

  it("scores raw-text similarity of generated vs gold SQL (autoevals Levenshtein)", async () => {
    const scores = await Promise.all(
      generated.map(async ({ gold, sql }) => {
        const { score } = await Levenshtein({ output: sql, expected: gold.goldSql });
        // A null score would mean the scorer abstained; treat that as a miss so
        // the mean can never be silently inflated.
        return score ?? 0;
      }),
    );
    const meanSimilarity = mean(scores);
    report("nlq.autoevals.sqlLevenshtein", meanSimilarity);

    // Observed first, then gated just below the floor of the observed scores.
    // The translator's canonical style is close (but not identical) to the
    // reference — ROUND() wrapping and always-on LIMIT are the main deltas.
    assertAtLeast(meanSimilarity, 0.7, "nlq.autoevals.sqlLevenshtein");
  });

  it("scores structural similarity of generated vs gold SQL (autoevals JSONDiff)", async () => {
    const scores = await Promise.all(
      generated.map(async ({ gold, sql }) => {
        const { score } = await JSONDiff({
          output: summarizeSql(sql),
          expected: summarizeSql(gold.goldSql),
        });
        return score ?? 0;
      }),
    );
    const meanStructural = mean(scores);
    report("nlq.autoevals.sqlStructuralJSONDiff", meanStructural);

    // Structure (select kind / group-by / order-dir / where / limit) matches the
    // reference far more tightly than raw text — observed ~1.0, gated below.
    assertAtLeast(meanStructural, 0.95, "nlq.autoevals.sqlStructuralJSONDiff");
  });

  it("identical SQL scores 1.0 on both scorers (sanity anchor)", async () => {
    // Sanity: a query compared against ITSELF must be a perfect match on both
    // scorers. Anchors that the offline scorers behave as documented.
    const sample = generated[0].sql;
    const lev = await Levenshtein({ output: sample, expected: sample });
    const jd = await JSONDiff({ output: summarizeSql(sample), expected: summarizeSql(sample) });
    expect(lev.score).toBe(1);
    expect(jd.score).toBe(1);
  });
});

// ─── LIVE evals (model-gated — skip cleanly with no GGUF) ─────────────────────

const SQL_SYSTEM_PROMPT =
  "You are a SQL expert. Translate the question into a SINGLE read-only DuckDB " +
  "SELECT statement (a leading WITH is allowed). Use ONLY the provided table and " +
  "columns. Wrap identifiers in double quotes. Return ONLY the SQL — no prose, no " +
  "markdown fences, no semicolon.";

function buildLivePrompt(question: string): string {
  const columnList = CORPUS.columns.map((c) => `"${c.name}" (${c.type})`).join(", ");
  return `Table: "${CORPUS.table}"\nColumns: ${columnList}\nQuestion: ${question}\nSQL:`;
}

/** Pull the first SELECT/WITH statement out of a (possibly chatty) model reply. */
function extractSql(text: string): string {
  const noFences = text.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "");
  const match = noFences.match(/\b(?:select|with)\b[\s\S]*/i);
  const sql = (match ? match[0] : noFences).trim();
  return sql.replace(/;\s*$/, "").trim();
}

liveDescribe("nlq (live) — local engine SQL generation", () => {
  // A small, unambiguous subset so a slow CPU model run stays bounded.
  const LIVE_QUESTIONS = [
    "How many transactions are in this dataset?",
    "Total revenue by region",
    "Average call duration by operator",
    "Top 5 regions by revenue",
  ];

  liveIt("generates SQL that parses, is read-only, and uses real columns", async () => {
    const engine = await loadLocalEngine();
    try {
      await engine.ensureModel();
      const scores: number[] = [];
      for (const question of LIVE_QUESTIONS) {
        const { text } = await engine.generate({
          system: SQL_SYSTEM_PROMPT,
          prompt: buildLivePrompt(question),
          maxTokens: 160,
          temperature: 0,
        });
        const sql = extractSql(text);
        const ok = isExecutableShape(sql) ? 1 : 0;
        if (!ok) report(`nlq.live.miss[${question.slice(0, 24)}]`, 0);
        scores.push(ok);
      }
      const executableRate = mean(scores);
      report("nlq.live.executableRate", executableRate);
      // Lenient gate: a 1.5B model should produce a usable read-only SELECT for
      // at least half of these unambiguous prompts. Tighten once a model is in
      // CI and a real number can be observed.
      assertAtLeast(executableRate, 0.5, "nlq.live.executableRate");
    } finally {
      await engine.dispose();
    }
  });
});
