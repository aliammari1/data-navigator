/**
 * F11 — IntersectionObserver Lazy Analytics
 * Fires expensive DuckDB queries only when the section enters the viewport.
 * Reduces initial runAnalytics() from 8 queries → 4 essential queries.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseLazyQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  ref: React.RefObject<HTMLDivElement | null>;
  /** Manually trigger the query without waiting for intersection. */
  trigger: () => void;
}

/**
 * Runs `query` once when the returned `ref` element becomes visible.
 * Re-runs when `deps` change (if already visible) or on next intersection.
 */
export function useLazyQuery<T>(
  query: () => Promise<T>,
  deps: unknown[] = [],
): UseLazyQueryResult<T> {
  const ref = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);
  const visible = useRef(false);

  const loadingRef = useRef(false);
  const run = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await query();
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [query]);

  // Reset on dep change — will re-run on next intersection
  useEffect(() => {
    ran.current = false;
    if (visible.current) {
      ran.current = true;
      run();
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps is a pass-through array — intentional
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      // Fallback: run immediately (old browsers)
      if (!ran.current) {
        ran.current = true;
        run();
      }
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          visible.current = true;
          if (!ran.current) {
            ran.current = true;
            run();
          }
        }
      },
      { threshold: 0.05, rootMargin: "100px" },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [run]);

  return { data, loading, error, ref, trigger: run };
}
