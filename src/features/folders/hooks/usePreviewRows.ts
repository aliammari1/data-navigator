"use client";

import { useEffect, useRef, useState } from "react";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";

/** Quote a DuckDB identifier (double-quote, escaping embedded quotes). */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export interface PreviewState {
  rows: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
}

const EMPTY: PreviewState = { rows: [], loading: false, error: null };

/**
 * Fetch the first `limit` rows of a dataset view for a lightweight catalogue
 * preview — a quick peek, not the Explorer. Read-only single `SELECT … LIMIT`
 * through the same `runReadOnlyQuery` path the Explorer uses. Stale responses
 * (view changed mid-flight) are dropped via a request-id guard.
 */
export function usePreviewRows(viewName: string | null, limit = 20): PreviewState {
  const [state, setState] = useState<PreviewState>(EMPTY);
  const reqId = useRef(0);

  useEffect(() => {
    if (!viewName) {
      setState(EMPTY);
      return;
    }
    const id = ++reqId.current;
    setState({ rows: [], loading: true, error: null });

    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    runReadOnlyQuery(`SELECT * FROM ${quoteIdent(viewName)} LIMIT ${safeLimit}`)
      .then((rows) => {
        if (id !== reqId.current) return; // a newer request superseded this one
        setState({ rows: rows ?? [], loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (id !== reqId.current) return;
        setState({
          rows: [],
          loading: false,
          error: err instanceof Error ? err.message : "Échec du chargement de l'aperçu",
        });
      });
  }, [viewName, limit]);

  return state;
}
