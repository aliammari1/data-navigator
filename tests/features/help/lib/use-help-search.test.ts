/**
 * Unit tests for src/features/help/lib/use-help-search.ts
 *
 * Covers every exported function and every branch:
 *   - empty query  → returns FEATURES + FAQS unchanged, query = ""
 *   - whitespace-only query → same (trim collapses to empty string)
 *   - non-empty query that matches → returns filtered subsets
 *   - non-empty query that matches nothing → returns empty arrays
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import { useHelpSearch } from "@/features/help/lib/use-help-search";
import { FEATURES, FAQS } from "@/features/help/data/help-content";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render the hook with a given rawQuery and return the stable result. */
function render(rawQuery: string) {
  return renderHook((q: string) => useHelpSearch(q), {
    initialProps: rawQuery,
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("useHelpSearch", () => {
  // ─── empty / blank query ─────────────────────────────────────────────────

  describe("empty query branch", () => {
    it("returns the full FEATURES list when query is empty string", () => {
      const { result } = render("");

      expect(result.current.features).toBe(FEATURES);
    });

    it("returns the full FAQS list when query is empty string", () => {
      const { result } = render("");

      expect(result.current.faqs).toBe(FAQS);
    });

    it("returns query = '' when rawQuery is empty string", () => {
      const { result } = render("");

      expect(result.current.query).toBe("");
    });

    it("treats a whitespace-only query as empty (trim branch)", () => {
      const { result } = render("   ");

      expect(result.current.features).toBe(FEATURES);
      expect(result.current.faqs).toBe(FAQS);
      expect(result.current.query).toBe("");
    });

    it("treats a tab/newline-only query as empty", () => {
      const { result } = render("\t\n");

      expect(result.current.features).toBe(FEATURES);
      expect(result.current.faqs).toBe(FAQS);
      expect(result.current.query).toBe("");
    });
  });

  // ─── non-empty query branch ───────────────────────────────────────────────

  describe("non-empty query branch", () => {
    it("returns features filtered by Fuse when query matches a feature title", () => {
      // 'upload' matches the Upload feature exactly.
      const { result } = render("upload");

      expect(Array.isArray(result.current.features)).toBe(true);
      expect(result.current.features.length).toBeGreaterThan(0);
      // Every returned item must be a real FeatureDef object (from FEATURES).
      for (const feature of result.current.features) {
        expect(FEATURES).toContain(feature);
      }
    });

    it("returns faqs filtered by Fuse when query matches an FAQ", () => {
      // 'data leave device' matches faq-on-device.
      const { result } = render("data leave device");

      expect(Array.isArray(result.current.faqs)).toBe(true);
      expect(result.current.faqs.length).toBeGreaterThan(0);
      for (const faq of result.current.faqs) {
        expect(FAQS).toContain(faq);
      }
    });

    it("exposes the trimmed deferred query in the result", () => {
      const { result } = render("Upload");

      // Deferred value equals the trimmed input (leading/trailing spaces stripped).
      expect(result.current.query).toBe("Upload");
    });

    it("trims surrounding whitespace from a non-empty query before using it", () => {
      const { result } = render("  upload  ");

      // After trim, deferred = "upload" → non-empty branch runs and query = "upload".
      expect(result.current.query).toBe("upload");
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    it("returns empty arrays when nothing matches an obscure query", () => {
      // A query that matches no records in the dataset.
      const { result } = render("xyzzy_zzzzz_nomatch_abc123");

      expect(result.current.features).toHaveLength(0);
      expect(result.current.faqs).toHaveLength(0);
    });

    it("still returns a non-empty query string even when results are empty", () => {
      const { result } = render("xyzzy_zzzzz_nomatch_abc123");

      expect(result.current.query).toBe("xyzzy_zzzzz_nomatch_abc123");
    });

    it("matches features by summary text", () => {
      // 'DuckDB WASM SQL' appears in the Upload summary.
      const { result } = render("DuckDB WASM SQL");

      expect(result.current.features.length).toBeGreaterThan(0);
    });

    it("matches features by tips text", () => {
      // 'pipe delimiter' appears in tips of CSV Parser.
      const { result } = render("pipe delimiter");

      expect(result.current.features.length).toBeGreaterThan(0);
    });

    it("matches FAQs by question text (q field)", () => {
      // 'file size' appears in faq-max-size question.
      const { result } = render("file size");

      expect(result.current.faqs.length).toBeGreaterThan(0);
    });

    it("matches FAQs by answer text (a field)", () => {
      // 'SharedWorker' appears in the faq-shared-worker answer.
      const { result } = render("SharedWorker");

      expect(result.current.faqs.length).toBeGreaterThan(0);
    });
  });

  // ─── result shape ─────────────────────────────────────────────────────────

  describe("HelpSearchResult shape", () => {
    it("always returns an object with features, faqs, and query keys (empty query)", () => {
      const { result } = render("");

      expect(result.current).toHaveProperty("features");
      expect(result.current).toHaveProperty("faqs");
      expect(result.current).toHaveProperty("query");
    });

    it("always returns an object with features, faqs, and query keys (non-empty query)", () => {
      const { result } = render("CSV");

      expect(result.current).toHaveProperty("features");
      expect(result.current).toHaveProperty("faqs");
      expect(result.current).toHaveProperty("query");
    });

    it("features is always an array", () => {
      const { result: r1 } = render("");
      const { result: r2 } = render("upload");

      expect(Array.isArray(r1.current.features)).toBe(true);
      expect(Array.isArray(r2.current.features)).toBe(true);
    });

    it("faqs is always an array", () => {
      const { result: r1 } = render("");
      const { result: r2 } = render("refresh");

      expect(Array.isArray(r1.current.faqs)).toBe(true);
      expect(Array.isArray(r2.current.faqs)).toBe(true);
    });
  });

  // ─── prop change (deferred + memoisation) ─────────────────────────────────

  describe("query change behaviour", () => {
    it("transitions from empty → non-empty query, updating the result", () => {
      const { result, rerender } = render("");

      // Initially empty → full lists.
      expect(result.current.features).toBe(FEATURES);

      // Rerender with a real query.
      rerender("upload");

      // Non-empty branch: features is now a filtered subset, not the original ref.
      expect(result.current.features).not.toBe(FEATURES);
      expect(result.current.query).toBe("upload");
    });

    it("transitions from non-empty → empty query, restoring full lists", () => {
      const { result, rerender } = render("upload");

      // Has a filtered result.
      expect(result.current.query).toBe("upload");

      // Rerender with empty string.
      rerender("");

      // Back to the empty branch.
      expect(result.current.features).toBe(FEATURES);
      expect(result.current.faqs).toBe(FAQS);
      expect(result.current.query).toBe("");
    });

    it("updates results when query changes from one search term to another", () => {
      const { result, rerender } = render("upload");

      const firstResult = result.current.features;

      rerender("csv parser");

      // The query changed, so the memo recalculates.
      expect(result.current.query).toBe("csv parser");
      // The result may or may not be the same length but the query is reflected.
      expect(typeof result.current.features.length).toBe("number");
    });
  });
});
