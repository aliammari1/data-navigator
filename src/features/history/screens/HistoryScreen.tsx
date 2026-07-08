"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Activity, Database, Table2, Zap } from "lucide-react";
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppCommands } from "@/features/desktop/core/menu/app-commands";

import { DayHeader } from "../components/DayHeader";
import { HistoryRowView } from "../components/HistoryRow";
import { HistoryToolbar } from "../components/HistoryToolbar";
import { exportFullHistory } from "../data/export-history";
import { startHistoryMirror } from "../data/history-mirror";
import { type SourceFilter, useHistory } from "../data/use-history";
import type { FlatHistoryItem, HistoryExportFormat } from "../model/types";

const HEADER_SIZE = 36;
const ROW_SIZE = 84;

export default function HistoryScreen() {
  const { qRaw, setQRaw, source, setSource, counts, rows, groups } = useHistory();
  const [exporting, setExporting] = useState<HistoryExportFormat | null>(null);

  // Durable write-through mirror: keep a real, queryable, exportable audit log
  // in IndexedDB. Started once on mount; the module guards re-entry.
  useEffect(() => {
    const stop = startHistoryMirror();
    return stop;
  }, []);

  // Single "now" reference per render so every relative time is computed against
  // one clock instead of calling Date.now() per row.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rows is an intentional trigger to re-snapshot the clock when the log set changes; it is not read inside.
  const now = useMemo(() => Date.now(), [rows]);

  // Flatten day groups into one windowable list: a header item per day followed
  // by its row items. Virtualization then renders only the viewport (~20-30
  // nodes) regardless of total log size.
  const flat = useMemo<FlatHistoryItem[]>(() => {
    const out: FlatHistoryItem[] = [];
    for (const group of groups) {
      out.push({
        kind: "header",
        key: group.key,
        label: group.label,
        count: group.rows.length,
      });
      for (const row of group.rows) out.push({ kind: "row", row });
    }
    return out;
  }, [groups]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (flat[i].kind === "header" ? HEADER_SIZE : ROW_SIZE),
    overscan: 12,
  });

  const onExport = useCallback(
    (format: HistoryExportFormat) => {
      setExporting(format);
      // Export reads the full durable log (not just the on-screen window) and
      // streams the heavy XLSX build via exceljs lazily — both off the hot path.
      exportFullHistory(rows, format).finally(() => setExporting(null));
    },
    [rows],
  );

  // Bridge the global app menu (Journal d'activité) to the screen's real handlers.
  useAppCommands("history", {
    export: (payload) => onExport((payload as { format: HistoryExportFormat }).format),
    filter: (payload) => setSource((payload as { source: SourceFilter }).source),
    search: (payload) => setQRaw((payload as { query: string }).query),
  });

  return (
    <div className="">
      <div className=" max-w-6xl space-y-4">
        <HistoryToolbar
          qRaw={qRaw}
          onQueryChange={setQRaw}
          source={source}
          onSourceChange={setSource}
          resultCount={rows.length}
          exporting={exporting}
          onExport={onExport}
        />

        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard label="Datasets" value={counts.datasets} icon={Database} />
          <SummaryCard label="Transforms" value={counts.transforms} icon={Zap} />
          <SummaryCard label="Queries" value={counts.queries} icon={Table2} />
          <SummaryCard label="Activities" value={counts.activities} icon={Activity} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          {flat.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No events match this filter.
            </div>
          ) : (
            <div
              ref={parentRef}
              className="max-h-[70vh] overflow-auto"
              role="feed"
              aria-label="Workspace history timeline"
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  position: "relative",
                  width: "100%",
                }}
              >
                {virtualizer.getVirtualItems().map((vi) => {
                  const item = flat[vi.index];
                  const itemKey = item.kind === "header" ? `h_${item.key}` : item.row.id;
                  return (
                    <div
                      key={itemKey}
                      data-index={vi.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vi.start}px)`,
                        paddingBottom: 8,
                      }}
                    >
                      {item.kind === "header" ? (
                        <DayHeader label={item.label} count={item.count} />
                      ) : (
                        <HistoryRowView row={item.row} now={now} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}
