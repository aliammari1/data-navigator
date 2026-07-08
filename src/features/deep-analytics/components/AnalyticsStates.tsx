"use client";

import type { ReactNode } from "react";
import { Database, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Shown when no dataset is active — instead of fabricating numbers. */
export function NoDatasetState({
  message = "Load a dataset to run analytics against your own data.",
}: {
  message?: string;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-400">
          <Database className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">No active dataset</p>
          <p className="mt-1 max-w-sm text-xs text-slate-400">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Shown when the required columns for a tab cannot be resolved. */
export function MissingColumnsState({ detail }: { detail: ReactNode }) {
  return (
    <Card className="border-amber-800/40 bg-amber-950/20">
      <CardContent className="py-8 text-center">
        <p className="text-sm font-semibold text-amber-300">
          This view needs columns it could not find
        </p>
        <p className="mt-1 text-xs text-slate-400">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function AnalyticsLoading({ label = "Querying DuckDB…" }: { label?: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="flex items-center justify-center gap-2 py-12">
        <RefreshCw className="size-4 animate-spin text-slate-400" />
        <span className="text-xs text-slate-400">{label}</span>
      </CardContent>
    </Card>
  );
}

export function AnalyticsError({ message }: { message: string }) {
  return (
    <Card className="border-red-800/40 bg-red-950/20">
      <CardContent className="py-8 text-center">
        <p className="text-sm font-semibold text-red-300">Query failed</p>
        <p className="mt-1 text-xs text-slate-400">{message}</p>
      </CardContent>
    </Card>
  );
}
