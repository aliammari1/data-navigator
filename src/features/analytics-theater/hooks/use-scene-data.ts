"use client";

/**
 * Shared scene-data hook: resolves the active dataset, builds the scene's SQL via
 * the provided builder, runs it through the cached read-only DuckDB query path,
 * and returns rows + state flags every scene needs.
 *
 * Centralizing this keeps each scene focused on shaping rows into an ECharts
 * option, and guarantees a uniform "unsupported schema / loading / error / empty"
 * contract across the theater.
 */

import { useMemo } from "react";
import { useDuckDBQuery } from "@/core/queries/duckdb";
import type { ColumnRoles } from "../lib/columns";
import type { SceneSql } from "../lib/queries";
import { useActiveDataset } from "../lib/use-active-dataset";

export interface SceneData {
  rows: Record<string, unknown>[];
  /** SQL builder note (which columns drive the scene), for the caption. */
  note: string | null;
  isLoading: boolean;
  error: unknown;
  /** True when the dataset lacks the columns this scene needs. */
  unsupported: boolean;
  isEmpty: boolean;
  refetch: () => void;
  roles: ColumnRoles;
  view: string | null;
}

export function useSceneData(
  builder: (view: string, roles: ColumnRoles) => SceneSql | null,
): SceneData {
  const { view, roles, ready } = useActiveDataset();

  const built = useMemo(
    () => (ready && view ? builder(view, roles) : null),
    [ready, view, roles, builder],
  );

  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useDuckDBQuery(built?.sql ?? "", [view], { enabled: Boolean(built) });

  return {
    rows: data,
    note: built?.note ?? null,
    isLoading,
    error,
    unsupported: !built,
    isEmpty: Boolean(built) && !isLoading && !error && data.length === 0,
    refetch: () => void refetch(),
    roles,
    view,
  };
}
