"use client";

import { useQuery } from "@tanstack/react-query";
import type { Dataset } from "@/core/stores/data-store";
import {
  buildGenericOverview,
  type GenericOverview,
} from "@/features/dashboard-home/lib/generic-overview";

/**
 * useGenericOverview
 *
 * Drives the dataset-agnostic landing overview for non-telecom datasets.
 * Backed by a single SUMMARIZE round-trip (+ two small chart aggregates) and
 * cached by TanStack Query keyed on the dataset identity, so navigating back
 * to the home screen repaints instantly without re-querying DuckDB.
 *
 * The query key is intentionally derived only from stable dataset fields
 * (id, viewName, rowCount, updatedAt) so it does not churn on every render.
 */
export function useGenericOverview(dataset: Dataset | null) {
  const viewName = dataset?.viewName || dataset?.tableName || "";

  return useQuery<GenericOverview>({
    queryKey: [
      "dashboard-home",
      "generic-overview",
      dataset?.id ?? "",
      viewName,
      dataset?.rowCount ?? 0,
      dataset?.updatedAt ?? "",
    ] as const,
    enabled: Boolean(dataset?.id && viewName),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
    queryFn: () =>
      buildGenericOverview(
        // dataset is guaranteed non-null by `enabled`.
        (dataset as Dataset).id,
        viewName,
        dataset?.rowCount ?? 0,
      ),
  });
}
