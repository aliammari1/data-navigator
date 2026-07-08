import { bench, describe } from "vitest";
import {
  buildRawStatusFilter,
  buildRawStatusFilterForColumn,
  sqlStatusInList,
} from "@/features/telecom/lib/status-definitions";

/**
 * Performance benchmarks for the telecom status-mapping SQL builders
 * (run with `pnpm run bench`).
 *
 * Hot path: every KPI / channel / hourly / status query in the report engine is
 * assembled by interpolating a status-code IN-list into the SQL. The list is
 * escaped and joined per build (`sqlStatusInList`), then wrapped in the
 * normalised filter expression (`buildRawStatusFilter` /
 * ...ForColumn`). With user-defined status mappings the code set can grow large,
 * and these builders run on every query assembly, so a throughput regression
 * slows the whole query-construction pipeline.
 *
 * Synthetic code lists are built ONCE at module scope with a deterministic,
 * counter-based generator (NO Math.random / Date.now). Some codes embed a single
 * quote so the escape branch of `sqlStatusInList` is exercised. Each bench
 * callback only exercises the function under test, never data generation.
 */

// ─── Deterministic generators (counter-based, index-varied) ─────────────────

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Deterministic short status-like code derived from a counter (no randomness). */
function syntheticCode(i: number): string {
  const a = ALPHABET[(i * 7) % ALPHABET.length];
  const b = ALPHABET[(i * 13 + 5) % ALPHABET.length];
  const c = ALPHABET[(i * 17 + 11) % ALPHABET.length];
  // Every 23rd code embeds a single quote to exercise the SQL-escape branch.
  const quote = i % 23 === 0 ? "'" : "";
  return `${a}${b}${c}${quote}${i % 100}`;
}

function buildCodes(n: number): string[] {
  const out: string[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = syntheticCode(i);
  return out;
}

// Realistic spec status sets are a few dozen codes; user-defined mappings and
// large enumerations push the list far higher — bench small, mid, and large.
const CODES_50 = buildCodes(50);
const CODES_1K = buildCodes(1_000);
const CODES_10K = buildCodes(10_000);

const COLUMN_EXPR = "UPPER(TRIM(CAST(mapped_status_column AS VARCHAR)))";

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("sqlStatusInList (escape + join — per-query hot path)", () => {
  bench("sqlStatusInList over 50 codes (realistic spec set)", () => {
    sqlStatusInList(CODES_50);
  });
  bench("sqlStatusInList over 1k codes", () => {
    sqlStatusInList(CODES_1K);
  });
  bench("sqlStatusInList over 10k codes", () => {
    sqlStatusInList(CODES_10K);
  });
});

describe("buildRawStatusFilter (normalised IN-clause builder)", () => {
  bench("buildRawStatusFilter over 50 codes", () => {
    buildRawStatusFilter(CODES_50);
  });
  bench("buildRawStatusFilter over 1k codes", () => {
    buildRawStatusFilter(CODES_1K);
  });
  bench("buildRawStatusFilter over 10k codes", () => {
    buildRawStatusFilter(CODES_10K);
  });
});

describe("buildRawStatusFilterForColumn (mapped-column IN-clause builder)", () => {
  bench("buildRawStatusFilterForColumn over 1k codes", () => {
    buildRawStatusFilterForColumn(COLUMN_EXPR, CODES_1K);
  });
  bench("buildRawStatusFilterForColumn over 10k codes", () => {
    buildRawStatusFilterForColumn(COLUMN_EXPR, CODES_10K);
  });
});
