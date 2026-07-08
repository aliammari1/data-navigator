import { memo } from "react";

import { cn } from "@/shared/utils";

import { clockTime, formatAgo } from "../model/format";
import { sourceStyle } from "../model/source-style";
import type { IndexedHistoryRow } from "../model/types";

interface HistoryRowViewProps {
  row: IndexedHistoryRow;
  /** Reference "now" so every row in a render computes ago against one clock. */
  now: number;
}

function HistoryRowViewInner({ row, now }: HistoryRowViewProps) {
  const style = sourceStyle(row.source);
  const Icon = style.icon;
  return (
    <article className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-1 inline-flex h-2.5 w-2.5 rounded-full", style.dot)}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                style.badge,
              )}
            >
              <Icon className="h-3 w-3" />
              {row.source}
            </span>
            <span className="text-[11px] text-muted-foreground">{row.type}</span>
            <span className="ml-auto text-[11px] text-muted-foreground" title={clockTime(row._ts)}>
              {formatAgo(row._ts, now)}
            </span>
          </div>
          <p className="mt-1.5 break-words text-sm text-foreground">{row.message}</p>
          {(row.table || row.dataset) && (
            <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {row.table && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono">{row.table}</span>
              )}
              {row.dataset && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono">{row.dataset}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export const HistoryRowView = memo(HistoryRowViewInner);
