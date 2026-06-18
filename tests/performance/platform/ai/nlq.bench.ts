import { bench, describe, vi } from "vitest";
import type { ColMeta } from "@/core/stores/data-store";

/**
 * Performance benchmarks for the deterministic NL->SQL translator
 * (run with `pnpm run bench`).
 *
 * `translateNLQ` is the synchronous, on-device fast path: it tries a raw-SQL
 * guard, then walks a registry of ~16 regex patterns, and for several patterns
 * resolves columns via exact -> substring -> fuse.js fuzzy matching. The Data
 * Formulator screen calls this per question (and across batches of suggested
 * questions), so its per-call cost gates UI responsiveness — and the fuse.js
 * fallback is the expensive branch.
 *
 * `nlq.ts` statically imports `@/platform/ai/llm-engine` (a boundary that pulls
 * in node-llama-cpp). We mock that module so importing `nlq.ts` stays pure and
 * the bench only measures the synchronous translator. `translateNLQ` itself
 * never calls the LLM.
 */

vi.mock("@/platform/ai/llm-engine", () => ({
  isLLMReady: () => false,
  generateText: async () => "",
}));

// Imported AFTER the mock is registered so the boundary is stubbed.
const { translateNLQ } = await import("@/platform/ai/nlq");

/** Build a deterministic wide schema of `n` columns (varied names + types). */
function makeColumns(n: number): ColMeta[] {
  const types: ColMeta["type"][] = ["number", "string", "date"];
  const stems = [
    "revenue",
    "sales",
    "amount",
    "region",
    "category",
    "product",
    "country",
    "created",
    "updated",
    "status",
    "segment",
    "qty",
    "profit",
    "channel",
    "agency",
    "period",
  ];
  const cols: ColMeta[] = [];
  for (let i = 0; i < n; i += 1) {
    const stem = stems[i % stems.length];
    // Bias types so substring/priority helpers and the fuzzy path all get hit.
    const type =
      stem === "created" || stem === "updated" || stem === "period"
        ? "date"
        : i % 2 === 0
          ? "number"
          : "string";
    cols.push({
      name: `${stem}_${i}`,
      type,
      nullCount: i % 7,
      distinctCount: 100 + i,
      sample: [],
    });
  }
  return cols;
}

/**
 * A representative spread of questions: each row deliberately targets a
 * different pattern in the registry (count, top-N, average, sum-by, breakdown,
 * trend, correlation, nulls, outliers, duplicates, filter, min/max, raw SQL)
 * plus an unparseable one that hits the low-confidence fallback.
 */
const QUESTION_TEMPLATES = [
  "how many rows are in this dataset",
  "top 5 region by revenue",
  "average revenue",
  "sum of revenue by region",
  "distribution of category",
  "breakdown of status where amount > 100",
  "trend of revenue over time",
  "correlation between revenue and profit",
  "show missing values per column",
  "find outliers and anomalies",
  "find duplicate rows",
  "show all rows where status = active",
  "filter where region = north",
  "max of revenue",
  "min of profit",
  "describe statistics for all columns",
  "SELECT region, SUM(revenue) FROM t GROUP BY region",
  "what is the meaning of life and everything else entirely",
];

/** Build a deterministic batch of `n` questions, varied by index. */
function makeQuestions(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const base = QUESTION_TEMPLATES[i % QUESTION_TEMPLATES.length];
    // Append a deterministic varying suffix so no two are byte-identical
    // (defeats any accidental memoization and varies the fuzzy hint).
    out.push(`${base} #${(i * 17) % 999}`);
  }
  return out;
}

const CTX_NARROW = {
  tableName: "transactions",
  columns: makeColumns(8),
};
const CTX_WIDE = {
  tableName: "transactions",
  columns: makeColumns(60), // wide schema => more fuzzy candidates per call
};

const BATCH_1K = makeQuestions(1_000);
const BATCH_10K = makeQuestions(10_000);

describe("nlq translateNLQ (deterministic NL->SQL hot path)", () => {
  bench("translateNLQ x1k questions, narrow schema (8 cols)", () => {
    for (const q of BATCH_1K) translateNLQ(q, CTX_NARROW);
  });

  bench("translateNLQ x1k questions, wide schema (60 cols)", () => {
    for (const q of BATCH_1K) translateNLQ(q, CTX_WIDE);
  });

  bench("translateNLQ x10k questions, narrow schema (8 cols)", () => {
    for (const q of BATCH_10K) translateNLQ(q, CTX_NARROW);
  });

  bench("translateNLQ x10k questions, wide schema (60 cols)", () => {
    for (const q of BATCH_10K) translateNLQ(q, CTX_WIDE);
  });
});
