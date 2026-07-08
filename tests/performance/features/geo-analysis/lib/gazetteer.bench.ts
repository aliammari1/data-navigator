import { bench, describe } from "vitest";
import { geocodeRegion } from "@/features/geo-analysis/lib/gazetteer";

/**
 * Performance benchmarks for the offline fuse.js-backed gazetteer
 * (run with `pnpm run bench`).
 *
 * `geocodeRegion` runs once per distinct region label when DuckDB region
 * aggregates are projected onto the map. The module builds its Fuse index ONCE
 * at import, then each call tries: exact map lookup -> contained-token scan ->
 * fuse.js fuzzy search. We bench a deterministic batch of labels that exercises
 * all three branches (exact hits, accented/aliased variants, agency-name noise,
 * and unmatched labels that fall all the way through to the fuzzy miss).
 *
 * Pure: static reference data + fuse.js only — no IO, no DuckDB, no network.
 */

// Deterministic label corpus, mixing the branches geocodeRegion can take.
const BASE_LABELS = [
  "Tunis", // exact (canonical)
  "grand tunis", // exact (alias)
  "TUNIS", // exact after case-fold
  "Béja", // exact, accented
  "Beja", // accent-stripped alias
  "Agence Tunis Centre", // contained-token match
  "Sfax Nord", // contained-token match
  "tunis-ville", // alias with separator -> fuzzy
  "Kayrawan", // misspelling -> fuzzy
  "Susah", // alias -> fuzzy/exact
  "Medenin", // near-miss -> fuzzy
  "Zzzznowhere", // no match -> full fall-through
  "Qabis", // alias -> fuzzy
  "El Kef", // alias
  "Sidi-Bouzid", // alias with separator
  "Atlantis", // no match
];

/** Build a deterministic batch of `n` labels, varied by index. */
function makeLabels(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const base = BASE_LABELS[i % BASE_LABELS.length];
    // Deterministic varying suffix some of the time so the contained-token and
    // fuzzy branches see distinct inputs (defeats trivial caching).
    out.push(i % 3 === 0 ? `${base} ${(i * 13) % 97}` : base);
  }
  return out;
}

const LABELS_10K = makeLabels(10_000);
const LABELS_100K = makeLabels(100_000);

describe("gazetteer geocodeRegion (fuse.js map-enrichment hot path)", () => {
  bench("geocodeRegion over 10k mixed region labels", () => {
    for (const label of LABELS_10K) geocodeRegion(label);
  });

  bench("geocodeRegion over 100k mixed region labels", () => {
    for (const label of LABELS_100K) geocodeRegion(label);
  });
});
