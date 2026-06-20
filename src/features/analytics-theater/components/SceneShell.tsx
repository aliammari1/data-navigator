"use client";

import { BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { SceneEmptyState, SceneErrorState, SceneLoadingState } from "./scene-states";

interface SceneShellProps {
  isLoading: boolean;
  error?: unknown;
  /** True when the scene's required columns are missing from the dataset. */
  unsupported?: boolean;
  unsupportedHint?: string;
  /** True when the query ran but returned no rows. */
  isEmpty?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * Consistent state handling for every theater scene: loading / error /
 * unsupported-schema / empty, falling back to the rendered chart only when real
 * rows are available. No scene ever fabricates data to fill a gap.
 */
export function SceneShell({
  isLoading,
  error,
  unsupported,
  unsupportedHint,
  isEmpty,
  onRetry,
  children,
}: SceneShellProps) {
  if (unsupported) {
    return (
      <SceneEmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        title="This scene needs different columns"
        description={
          unsupportedHint ??
          "The active dataset does not have the columns this visualization requires."
        }
      />
    );
  }

  if (isLoading) {
    return <SceneLoadingState label="Aggregating in DuckDB…" />;
  }

  if (error) {
    return (
      <SceneErrorState
        title="Query failed"
        description={error instanceof Error ? error.message : String(error)}
        retry={onRetry}
      />
    );
  }

  if (isEmpty) {
    return (
      <SceneEmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        title="No data for this scene"
        description="The aggregation returned no rows for the active dataset."
      />
    );
  }

  return <>{children}</>;
}
