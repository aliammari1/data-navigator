import { bench, describe } from "vitest";
import { type ColumnInfo, suggestColumnMapping } from "@/features/reconciliation/lib/auto-map";

/**
 * Performance benchmarks for fuse.js-backed column auto-mapping
 * (run with `pnpm run bench`).
 *
 * When two datasets are reconciled, `suggestColumnMapping` fuzzy-matches every
 * expected column against the actual column set. It builds a fresh Fuse index
 * over the actual columns per call and then runs one exact lookup + one fuzzy
 * search per expected column, so cost scales with both schema widths. Wide
 * schemas (telco extracts routinely have 50-100+ columns) make this the
 * dominant cost of the mapping step.
 *
 * Pure: string distance over column-name metadata only — no row data, no IO.
 */

const STEMS = [
  "msisdn",
  "phone",
  "revenue",
  "rev",
  "amount",
  "amt",
  "region",
  "governorate",
  "agency",
  "channel",
  "product",
  "service",
  "status",
  "created_at",
  "updated_at",
  "txn_id",
  "transaction_id",
  "qty",
  "quantity",
  "profit",
];

/**
 * Build a deterministic schema of `n` columns. `salt` shifts the stem/index mix
 * so "expected" and "actual" sides differ (forcing fuzzy matches, not just
 * exact hits), while staying byte-stable across runs.
 */
function makeSchema(n: number, salt: number): ColumnInfo[] {
  const cols: ColumnInfo[] = [];
  for (let i = 0; i < n; i += 1) {
    const stem = STEMS[(i + salt) % STEMS.length];
    const type = i % 2 === 0 ? "BIGINT" : "VARCHAR";
    cols.push({ name: `${stem}_${(i * 7 + salt) % 100}`, type });
  }
  return cols;
}

const EXPECTED_20 = makeSchema(20, 0);
const ACTUAL_20 = makeSchema(20, 3);

const EXPECTED_60 = makeSchema(60, 0);
const ACTUAL_60 = makeSchema(60, 5);

const EXPECTED_100 = makeSchema(100, 0);
const ACTUAL_100 = makeSchema(100, 7);

describe("auto-map suggestColumnMapping (fuse.js schema-matching)", () => {
  bench("suggestColumnMapping 20x20 schema", () => {
    suggestColumnMapping(EXPECTED_20, ACTUAL_20);
  });

  bench("suggestColumnMapping 60x60 schema", () => {
    suggestColumnMapping(EXPECTED_60, ACTUAL_60);
  });

  bench("suggestColumnMapping 100x100 schema", () => {
    suggestColumnMapping(EXPECTED_100, ACTUAL_100);
  });
});
