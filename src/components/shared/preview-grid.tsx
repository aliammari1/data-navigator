"use client";

/**
 * Shared virtualized preview grid.
 *
 * One component for the two copy-pasted grids that previously lived in
 * `csv-parser/components/PreviewGrid.tsx` and
 * `data-transform/components/PreviewGrid.tsx`. Rows AND columns are virtualized
 * with `@tanstack/react-virtual`, so only the visible window mounts regardless of
 * preview size or column count.
 *
 * The two callers had genuinely different data models and styling, so this grid
 * is parametrized by a discriminated `variant` prop instead of forcing one shape:
 *
 *  - `variant: "typed"`  — the csv-parser shape: a columnar dataset addressed by
 *    `rowIndices` + an O(1) `getCell(rowIndex, sourceIndex)` accessor, with
 *    per-column type badges and type-coloured cells, on semantic theme tokens.
 *  - `variant: "records"` — the data-transform shape: a list of row records keyed
 *    by column name, with Date/object cell formatting and the zinc styling +
 *    row-hover the transform preview shipped.
 *
 * Both render paths are intentionally preserved verbatim so neither surface
 * loses a feature; only the duplicated virtualizer scaffolding is shared.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { cn } from "@/shared/utils";

/** Column type union shared by the csv-parser preview (see its `ColType`). */
export type PreviewColType = "string" | "number" | "date" | "boolean";

export interface PreviewColumn {
  header: string;
  type: PreviewColType;
  /** Index into the source columnar arrays (after include/order filtering). */
  sourceIndex: number;
}

interface TypedPreviewGridProps {
  variant: "typed";
  columns: PreviewColumn[];
  /** Visible row indices into the (filtered) dataset. */
  rowIndices: number[];
  /** O(1) cell accessor: (datasetRowIndex, columnSourceIndex) => value. */
  getCell: (rowIndex: number, sourceIndex: number) => unknown;
}

interface RecordsPreviewGridProps {
  variant: "records";
  columns: string[];
  rows: Record<string, unknown>[];
}

export type PreviewGridProps = TypedPreviewGridProps | RecordsPreviewGridProps;

// ─── "typed" variant (csv-parser) ─────────────────────────────────────────────

const TYPED_ROW_HEIGHT = 28;
const TYPED_COL_WIDTH = 160;
const TYPED_INDEX_WIDTH = 56;

function typeTextClass(type: PreviewColType, isNull: boolean): string {
  if (isNull) return "text-muted-foreground/40 italic";
  if (type === "number") return "text-right text-emerald-300";
  if (type === "date") return "text-purple-300";
  if (type === "boolean") return "text-amber-300";
  return "text-foreground";
}

function TypedPreviewGrid({
  columns,
  rowIndices,
  getCell,
}: Omit<TypedPreviewGridProps, "variant">) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rowIndices.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TYPED_ROW_HEIGHT,
    overscan: 12,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TYPED_COL_WIDTH,
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();
  const totalWidth = colVirtualizer.getTotalSize() + TYPED_INDEX_WIDTH;

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-auto">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 flex border-b border-border bg-muted/95 backdrop-blur"
        style={{ width: totalWidth }}
      >
        <div
          className="flex flex-none items-center border-r border-border px-3 text-[10px] font-medium text-muted-foreground"
          style={{ width: TYPED_INDEX_WIDTH, height: TYPED_ROW_HEIGHT }}
        >
          #
        </div>
        <div className="relative" style={{ width: colVirtualizer.getTotalSize() }}>
          {virtualCols.map((vc) => {
            const column = columns[vc.index];
            return (
              <div
                key={column.header}
                className="absolute top-0 flex items-center gap-1.5 overflow-hidden border-r border-border px-3"
                style={{
                  transform: `translateX(${vc.start}px)`,
                  width: vc.size,
                  height: TYPED_ROW_HEIGHT,
                }}
                title={column.header}
              >
                <span className="truncate text-[11px] font-medium text-foreground">
                  {column.header}
                </span>
                <span
                  className={cn(
                    "flex-none rounded px-1 py-0.5 font-mono text-[9px]",
                    column.type === "number" && "bg-emerald-500/15 text-emerald-400",
                    column.type === "string" && "bg-blue-500/15 text-blue-400",
                    column.type === "date" && "bg-purple-500/15 text-purple-400",
                    column.type === "boolean" && "bg-amber-500/15 text-amber-400",
                  )}
                >
                  {column.type}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: totalWidth,
          position: "relative",
        }}
      >
        {virtualRows.map((vr) => {
          const datasetRowIndex = rowIndices[vr.index];
          return (
            <div
              key={vr.key}
              className={cn(
                "absolute left-0 top-0 flex border-b border-border/30",
                vr.index % 2 === 1 && "bg-muted/10",
              )}
              style={{
                transform: `translateY(${vr.start}px)`,
                width: totalWidth,
                height: vr.size,
              }}
            >
              <div
                className="flex flex-none items-center justify-center border-r border-border/30 font-mono text-[10px] text-muted-foreground"
                style={{ width: TYPED_INDEX_WIDTH }}
              >
                {vr.index + 1}
              </div>
              <div className="relative" style={{ width: colVirtualizer.getTotalSize() }}>
                {virtualCols.map((vc) => {
                  const column = columns[vc.index];
                  const value = getCell(datasetRowIndex, column.sourceIndex);
                  const isNull = value === null || value === undefined;
                  return (
                    <div
                      key={column.header}
                      className={cn(
                        "absolute top-0 flex items-center overflow-hidden whitespace-nowrap border-r border-border/20 px-3 font-mono text-[11px]",
                        typeTextClass(column.type, isNull),
                      )}
                      style={{
                        transform: `translateX(${vc.start}px)`,
                        width: vc.size,
                        height: vr.size,
                      }}
                      title={isNull ? "NULL" : String(value)}
                    >
                      <span className="truncate">{isNull ? "NULL" : String(value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── "records" variant (data-transform) ───────────────────────────────────────

const RECORDS_ROW_HEIGHT = 30;
const RECORDS_COL_WIDTH = 168;
const RECORDS_INDEX_WIDTH = 48;

function formatCell(value: unknown): { text: string; isNull: boolean } {
  if (value === null || value === undefined) return { text: "NULL", isNull: true };
  if (value instanceof Date) return { text: value.toISOString(), isNull: false };
  if (typeof value === "object") return { text: JSON.stringify(value), isNull: false };
  return { text: String(value), isNull: false };
}

function RecordsPreviewGrid({ columns, rows }: Omit<RecordsPreviewGridProps, "variant">) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => RECORDS_ROW_HEIGHT,
    overscan: 12,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => RECORDS_COL_WIDTH,
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();
  const totalWidth = colVirtualizer.getTotalSize() + RECORDS_INDEX_WIDTH;

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-auto">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 flex border-b border-zinc-800 bg-zinc-900/95 backdrop-blur"
        style={{ width: totalWidth }}
      >
        <div
          className="flex flex-none items-center border-r border-zinc-800 px-3 text-[10px] font-medium text-zinc-500"
          style={{ width: RECORDS_INDEX_WIDTH, height: RECORDS_ROW_HEIGHT }}
        >
          #
        </div>
        <div className="relative" style={{ width: colVirtualizer.getTotalSize() }}>
          {virtualCols.map((vc) => {
            const column = columns[vc.index];
            return (
              <div
                key={column}
                className="absolute top-0 flex items-center overflow-hidden border-r border-zinc-800 px-3"
                style={{
                  transform: `translateX(${vc.start}px)`,
                  width: vc.size,
                  height: RECORDS_ROW_HEIGHT,
                }}
                title={column}
              >
                <span className="truncate text-[11px] font-medium text-zinc-300">{column}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: totalWidth,
          position: "relative",
        }}
      >
        {virtualRows.map((vr) => {
          const row = rows[vr.index];
          return (
            <div
              key={vr.key}
              className={cn(
                "absolute left-0 top-0 flex border-b border-zinc-800/30 hover:bg-zinc-900/60",
                vr.index % 2 === 1 && "bg-zinc-900/20",
              )}
              style={{
                transform: `translateY(${vr.start}px)`,
                width: totalWidth,
                height: vr.size,
              }}
            >
              <div
                className="flex flex-none items-center justify-center border-r border-zinc-800/30 font-mono text-[10px] text-zinc-600"
                style={{ width: RECORDS_INDEX_WIDTH }}
              >
                {vr.index + 1}
              </div>
              <div className="relative" style={{ width: colVirtualizer.getTotalSize() }}>
                {virtualCols.map((vc) => {
                  const { text, isNull } = formatCell(row[columns[vc.index]]);
                  return (
                    <div
                      key={columns[vc.index]}
                      className={cn(
                        "absolute top-0 flex items-center overflow-hidden whitespace-nowrap border-r border-zinc-800/20 px-3 font-mono text-[11px]",
                        isNull ? "text-zinc-700" : "text-zinc-300",
                      )}
                      style={{
                        transform: `translateX(${vc.start}px)`,
                        width: vc.size,
                        height: vr.size,
                      }}
                      title={text}
                    >
                      <span className="truncate">{text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PreviewGrid(props: PreviewGridProps) {
  if (props.variant === "records") {
    return <RecordsPreviewGrid columns={props.columns} rows={props.rows} />;
  }

  return (
    <TypedPreviewGrid
      columns={props.columns}
      rowIndices={props.rowIndices}
      getCell={props.getCell}
    />
  );
}
