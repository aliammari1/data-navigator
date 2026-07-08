"use client";

import { Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown when there is no active dataset (or it could not be read). The feature
 * briefs on real data only — there is no fake fallback — so this guides the user
 * to load a dataset rather than presenting fabricated numbers.
 */
export function EmptyDatasetState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40">
          <Database className="size-6 text-muted-foreground" />
        </div>
        {loading ? (
          <>
            <p className="text-sm font-medium">Reading your dataset…</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Aggregating column statistics in DuckDB.
            </p>
          </>
        ) : error ? (
          <>
            <p className="text-sm font-medium text-red-300">Could not read the dataset</p>
            <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">No dataset loaded</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Briefings are generated from your real data. Load a dataset to generate a voice
              briefing, anomaly report, action plan, and data story.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
