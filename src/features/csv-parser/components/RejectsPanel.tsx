"use client";

/**
 * Data-quality / rejected-rows panel.
 *
 * The legacy screen showed only `result.errors.slice(0, 3)` and silently
 * dropped everything else. This panel surfaces the full reject feed captured by
 * the parser (browser path: uDSV/Papa error rows) and by native DuckDB
 * (`store_rejects=true` → `reject_errors`) for the Electron path, virtualized so
 * a large reject list never blows up the DOM.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { ShieldAlert } from "lucide-react";
import { useRef } from "react";

export interface RejectRowView {
  /** Source line / row number (1-based when known). */
  row: number | null;
  column?: string | null;
  type?: string | null;
  message: string;
}

interface RejectsPanelProps {
  rejects: RejectRowView[];
  /** Total rejected rows, which may exceed the sampled `rejects.length`. */
  totalRejected?: number;
}

const ROW_HEIGHT = 30;

export function RejectsPanel({ rejects, totalRejected }: RejectsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rejects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (rejects.length === 0) return null;

  const total = totalRejected ?? rejects.length;

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-3.5 w-3.5 flex-none text-rose-400" />
        <span className="text-[11px] font-semibold text-rose-300">
          Data quality — {total.toLocaleString()} rejected row
          {total === 1 ? "" : "s"}
        </span>
        {total > rejects.length && (
          <span className="text-[10px] text-muted-foreground">
            (showing first {rejects.length.toLocaleString()})
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-rose-500/20 bg-rose-500/5">
        <div className="flex border-b border-rose-500/20 bg-rose-500/10 text-[10px] font-medium text-rose-200/80">
          <div className="w-16 flex-none px-3 py-1.5">Row</div>
          <div className="w-28 flex-none px-3 py-1.5">Column</div>
          <div className="w-24 flex-none px-3 py-1.5">Type</div>
          <div className="flex-1 px-3 py-1.5">Message</div>
        </div>

        <div ref={scrollRef} className="max-h-48 overflow-auto">
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const reject = rejects[item.index];
              return (
                <div
                  key={item.key}
                  className="absolute left-0 top-0 flex w-full items-center border-b border-rose-500/10 text-[10px] text-muted-foreground"
                  style={{
                    transform: `translateY(${item.start}px)`,
                    height: item.size,
                  }}
                >
                  <div className="w-16 flex-none px-3 font-mono text-rose-300/80">
                    {reject.row ?? "—"}
                  </div>
                  <div className="w-28 flex-none truncate px-3 font-mono">
                    {reject.column ?? "—"}
                  </div>
                  <div className="w-24 flex-none truncate px-3">{reject.type ?? "error"}</div>
                  <div className="flex-1 truncate px-3" title={reject.message}>
                    {reject.message}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
