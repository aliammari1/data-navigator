"use client";

import { memo, useState } from "react";
import { Download, History as HistoryIcon, Loader2, Search } from "lucide-react";

import { cn } from "@/shared/utils";

import type { HistoryExportFormat } from "../model/types";
import type { SourceFilter } from "../data/use-history";

interface HistoryToolbarProps {
  qRaw: string;
  onQueryChange: (value: string) => void;
  source: SourceFilter;
  onSourceChange: (value: SourceFilter) => void;
  resultCount: number;
  exporting: HistoryExportFormat | null;
  onExport: (format: HistoryExportFormat) => void;
}

const SOURCE_OPTIONS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "activity", label: "Activity" },
  { value: "dataset", label: "Datasets" },
  { value: "transform", label: "Transforms" },
  { value: "query", label: "Queries" },
];

const EXPORT_OPTIONS: Array<{ value: HistoryExportFormat; label: string }> = [
  { value: "csv", label: "Export CSV" },
  { value: "json", label: "Export JSON" },
  { value: "xlsx", label: "Export XLSX" },
];

function HistoryToolbarInner({
  qRaw,
  onQueryChange,
  source,
  onSourceChange,
  resultCount,
  exporting,
  onExport,
}: HistoryToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const busy = exporting !== null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <HistoryIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Workspace History</h1>
            <p className="text-xs text-muted-foreground">
              Durable timeline from real datasets, transforms, queries and workspace actions
            </p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {resultCount} event{resultCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative grow basis-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={qRaw}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by message, type, table..."
            aria-label="Search history"
            className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <select
          value={source}
          onChange={(e) => onSourceChange(e.target.value as SourceFilter)}
          aria-label="Filter by source"
          className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((o) => !o)}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium",
              "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {busy ? `Exporting ${exporting}…` : "Export"}
          </button>

          {exportOpen && !busy && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
            >
              {EXPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false);
                    onExport(opt.value);
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const HistoryToolbar = memo(HistoryToolbarInner);
