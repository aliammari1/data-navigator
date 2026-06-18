/**
 * Fuzzy, typo-tolerant help search backed by fuse.js (already a dependency).
 *
 * Replaces the previous naive per-keystroke O(n) `String.includes` +
 * `.toLowerCase()` scan that ran inline in render. The fuse indices are built
 * exactly once at module load (cheap for ~17 records) and the query is run
 * through `useDeferredValue` + `useMemo` so typing stays responsive and the
 * filtered arrays are stable across unrelated re-renders.
 */

import Fuse from "fuse.js";
import { useDeferredValue, useMemo } from "react";
import { FAQS, FEATURES, type FaqDef, type FeatureDef } from "../data/help-content";

const featureFuse = new Fuse(FEATURES as readonly FeatureDef[], {
  keys: [
    { name: "title", weight: 3 },
    { name: "summary", weight: 1 },
    { name: "tips", weight: 0.5 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
});

const faqFuse = new Fuse(FAQS as readonly FaqDef[], {
  keys: [
    { name: "q", weight: 2 },
    { name: "a", weight: 1 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
});

export interface HelpSearchResult {
  features: readonly FeatureDef[];
  faqs: readonly FaqDef[];
  /** The query actually used for filtering (deferred + trimmed). */
  query: string;
}

export function useHelpSearch(rawQuery: string): HelpSearchResult {
  const deferred = useDeferredValue(rawQuery.trim());

  return useMemo<HelpSearchResult>(() => {
    if (!deferred) {
      return { features: FEATURES, faqs: FAQS, query: "" };
    }
    return {
      features: featureFuse.search(deferred).map((r) => r.item),
      faqs: faqFuse.search(deferred).map((r) => r.item),
      query: deferred,
    };
  }, [deferred]);
}
