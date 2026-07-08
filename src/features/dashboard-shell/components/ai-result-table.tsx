"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Hash, Rows3 } from "lucide-react";
import { useRef } from "react";
import { usePerformanceSettings } from "@/core/stores/settings-store";
import type { AiQueryResult } from "@/features/dashboard-shell/components/ai-panel-chart";

const ROW_HEIGHT = 30;
const PREVIEW_CAP = 50;

/**
 * AI-panel result table.
 *
 * Past `performance.virtualizeThreshold` (default 500, the real settings knob)
 * the body is virtualized with `@tanstack/react-virtual` so large result sets
 * stay at 60fps; below it, a capped preview renders. Row keys are stable
 * `row-${index}` for the immutable result set — the previous
 * `JSON.stringify(row).slice(0,64)` keying serialized every row on every render.
 */
export function AiResultTable({ result }: { result: AiQueryResult }) {
  const { virtualizeThreshold } = usePerformanceSettings();

  if (result.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-5 text-center">
        <Rows3 className="mx-auto h-5 w-5 text-muted-foreground/70" />
        <p className="mt-2 text-xs text-muted-foreground">Query returned 0 rows.</p>
      </div>
    );
  }

  // Single scalar result → big-number card.
  if (result.columns.length === 1 && result.rows.length === 1) {
    const value = result.rows[0][result.columns[0]];
    return (
      <div className="rounded-2xl border border-border bg-background p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <Hash className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {typeof value === "number" ? value.toLocaleString() : String(value ?? "")}
            </div>
            <div className="truncate text-xs text-muted-foreground">{result.columns[0]}</div>
          </div>
        </div>
      </div>
    );
  }

  const shouldVirtualize = result.rows.length > virtualizeThreshold;

  return shouldVirtualize ? (
    <VirtualResultTable result={result} />
  ) : (
    <PreviewResultTable result={result} />
  );
}

function PreviewResultTable({ result }: { result: AiQueryResult }) {
  const visibleRows = result.rows.slice(0, PREVIEW_CAP);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/80">
              {result.columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr
                key={`row-${index}`}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
              >
                {result.columns.map((column) => (
                  <td
                    key={column}
                    className="max-w-40 truncate px-3 py-2 font-mono text-[11px] text-foreground"
                    title={String(row[column] ?? "")}
                  >
                    {String(row[column] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.rows.length > PREVIEW_CAP && (
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          Showing {PREVIEW_CAP} of {result.rows.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

function VirtualResultTable({ result }: { result: AiQueryResult }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: result.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const cols = result.columns;
  const gridTemplate = `repeat(${cols.length}, minmax(96px, 1fr))`;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div
        className="grid border-b border-border bg-muted/80"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {cols.map((column) => (
          <div
            key={column}
            className="truncate px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            {column}
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="max-h-72 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = result.rows[virtualRow.index];
            return (
              <div
                key={`row-${virtualRow.index}`}
                className="grid border-b border-border/60 hover:bg-muted/50"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: gridTemplate,
                }}
              >
                {cols.map((column) => (
                  <div
                    key={column}
                    className="truncate px-3 py-1.5 font-mono text-[11px] text-foreground"
                    title={String(row[column] ?? "")}
                  >
                    {String(row[column] ?? "")}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        {result.rows.length.toLocaleString()} rows · virtualized
      </div>
    </div>
  );
}
