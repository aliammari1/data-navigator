"use client";

/**
 * Virtualized reconciliation diff grid.
 *
 * Replaces the legacy raw `<table>` that mounted one `<tr>` per diff row (a
 * renderer freeze at 100k+ rows). Rows are virtualized with
 * `@tanstack/react-virtual` over a `@tanstack/react-table` core model, so only
 * the visible window (~constant ~25 rows) is ever in the DOM. Cells are colored
 * by `diff_status` and the sign of each measure's variance.
 */

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useMemo, useRef } from "react";
import { cn } from "@/shared/utils";
import type { MaterialityModel } from "../lib/materiality";
import { isMaterialRow } from "../lib/materiality";
import type { DiffRow } from "../lib/use-reconciliation";

const ROW_HEIGHT = 36;

function fmtNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
}

function fmtSigned(n: number): string {
  const s = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

const STATUS_STYLES: Record<DiffRow["status"], string> = {
  ADDED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  REMOVED: "bg-red-500/10 text-red-300 border-red-500/30",
  CHANGED: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  UNCHANGED: "bg-slate-700/40 text-slate-400 border-slate-600/40",
};

function varianceClass(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-red-400";
  return "text-slate-400";
}

interface DiffGridProps {
  rows: DiffRow[];
  measureLabels: string[];
  materiality: MaterialityModel;
  /** Total matched rows in the diff (for the footer count). */
  totalRows?: number;
  loading?: boolean;
}

export function ReconciliationDiffGrid({
  rows,
  measureLabels,
  materiality,
  totalRows,
  loading,
}: DiffGridProps) {
  const columns = useMemo<ColumnDef<DiffRow>[]>(() => {
    const base: ColumnDef<DiffRow>[] = [
      {
        id: "key",
        header: "Key",
        cell: ({ row }) => {
          const d = row.original;
          const material = isMaterialRow(d.status, d.primaryVariancePct, materiality);
          return (
            <div className="flex items-center gap-2 min-w-0">
              {material && <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />}
              <span className="truncate font-medium text-slate-200" title={d.key}>
                {d.key}
              </span>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                STATUS_STYLES[s],
              )}
            >
              {s}
            </span>
          );
        },
      },
    ];

    const measureCols: ColumnDef<DiffRow>[] = measureLabels.flatMap(
      (label, measureIdx): ColumnDef<DiffRow>[] => [
        {
          id: `exp_${label}`,
          header: `Exp · ${label}`,
          cell: ({ row }) => (
            <span className="block text-right font-mono text-slate-400">
              {fmtNum(row.original.measures[measureIdx]?.expected ?? null)}
            </span>
          ),
        },
        {
          id: `act_${label}`,
          header: `Act · ${label}`,
          cell: ({ row }) => (
            <span className="block text-right font-mono text-slate-300">
              {fmtNum(row.original.measures[measureIdx]?.actual ?? null)}
            </span>
          ),
        },
        {
          id: `var_${label}`,
          header: `Δ · ${label}`,
          cell: ({ row }) => {
            const cell = row.original.measures[measureIdx];
            const v = cell?.variance ?? 0;
            const Icon = v > 0 ? ArrowUpRight : v < 0 ? ArrowDownRight : Minus;
            return (
              <span
                className={cn(
                  "flex items-center justify-end gap-1 font-mono font-medium",
                  varianceClass(v),
                )}
              >
                <Icon className="size-3" />
                {fmtSigned(v)}
              </span>
            );
          },
        },
        {
          id: `varpct_${label}`,
          header: "%",
          cell: ({ row }) => {
            const cell = row.original.measures[measureIdx];
            return (
              <span
                className={cn(
                  "block text-right font-mono font-medium",
                  varianceClass(cell?.variance ?? 0),
                )}
              >
                {fmtPct(cell?.variancePct ?? null)}
              </span>
            );
          },
        },
      ],
    );

    return [...base, ...measureCols];
  }, [measureLabels, materiality]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const model = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: model.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const headerGroups = table.getHeaderGroups();
  const colCount = columns.length;
  const gridTemplate = `minmax(160px, 2fr) 96px ${"minmax(90px, 1fr) ".repeat(
    colCount - 2,
  )}`.trim();

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40">
      {/* Sticky header */}
      <div
        className="grid border-b border-slate-700 bg-slate-800/60 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {headerGroups[0]?.headers.map((header, i) => (
          <div
            key={header.id}
            className={cn("px-2 py-2 truncate", i >= 2 ? "text-right" : "text-left")}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        ))}
      </div>

      {/* Virtualized body */}
      <div ref={parentRef} className="relative h-[440px] overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Running diff in DuckDB…
          </div>
        ) : model.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No differences in this page.
          </div>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const row = model[vi.index];
              return (
                <div
                  key={row.id}
                  className="absolute left-0 grid w-full border-b border-slate-800/70 text-xs hover:bg-slate-800/30"
                  style={{
                    top: vi.start,
                    height: vi.size,
                    gridTemplateColumns: gridTemplate,
                  }}
                >
                  {row.getVisibleCells().map((cell, ci) => (
                    <div
                      key={cell.id}
                      className={cn(
                        "flex items-center px-2",
                        ci >= 2 ? "justify-end" : "justify-start",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">
        Showing {fmtNum(model.length)}
        {typeof totalRows === "number" && totalRows > model.length
          ? ` of ${fmtNum(totalRows)} matched rows`
          : " rows"}
        {" · material threshold "}
        {materiality.threshold.toFixed(1)}% (
        {materiality.scale > 0 ? "MAD-adaptive" : "flat tolerance"})
      </div>
    </div>
  );
}
