"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronsUpDown, ChevronUp, Columns3 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtN } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { StatusBadge } from "./status-badge";

// Server "window" size. We fetch large pages and window the DOM with
// @tanstack/react-virtual instead of rendering N*cols nodes synchronously.
const WINDOW_SIZE = 500;
// Estimated row height (px) for the virtualizer.
const ROW_HEIGHT = 34;
const SKELETON_KEYS = ["sk0", "sk1", "sk2", "sk3", "sk4", "sk5", "sk6", "sk7"];

export function DataGrid({
  m,
  filters,
  statusMapping,
  onMsisdnClick,
  fetchFiltered,
  fetchFilteredCount,
  fetchFilteredPage,
}: {
  m: Types.ColumnMapping;
  filters: Types.FilterState;
  statusMapping: Types.StatusMapping[];
  onMsisdnClick?: (msisdn: string) => void;
  fetchFiltered: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
    limit: number,
    offset: number,
    sortCol: string,
    sortDir: Types.SortDir,
  ) => Promise<{ rows: Types.RawRow[]; total: number }>;
  fetchFilteredCount?: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
  ) => Promise<number>;
  fetchFilteredPage?: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
    limit: number,
    offset: number,
    sortCol: string,
    sortDir: Types.SortDir,
  ) => Promise<Types.RawRow[]>;
}) {
  const [rows, setRows] = useState<Types.RawRow[]>([]);
  const [total, setTotal] = useState(0);
  // How many rows of the (filtered, sorted) result are loaded into `rows`.
  const [loadedCount, setLoadedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [visDropOpen, setVisDropOpen] = useState(false);
  const visDropRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const sortCol = sorting[0]?.id ?? "";
  const sortDir: Types.SortDir = sorting[0]?.desc ? "desc" : "asc";

  // Whether the split count/page fetchers are available (real runtime).
  const hasSplitFetchers = Boolean(fetchFilteredCount && fetchFilteredPage);

  // ── Count query: depends ONLY on the filter, not page/sort. ───────────────
  // Re-runs only when the filter changes — never on scroll or sort.
  useEffect(() => {
    if (!hasSplitFetchers || !fetchFilteredCount) return;
    let cancelled = false;
    fetchFilteredCount(m, filters, statusMapping)
      .then((t) => {
        if (!cancelled) setTotal(t);
      })
      .catch((err) => {
        console.error("[DataGrid] count failed:", err);
        if (!cancelled) setTotal(0);
      });
    return () => {
      cancelled = true;
    };
  }, [m, filters, statusMapping, hasSplitFetchers, fetchFilteredCount]);

  // ── First window: reload whenever filter/sort changes. ────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    parentRef.current?.scrollTo({ top: 0 });

    const load = async () => {
      if (hasSplitFetchers && fetchFilteredPage) {
        const r = await fetchFilteredPage(
          m,
          filters,
          statusMapping,
          WINDOW_SIZE,
          0,
          sortCol,
          sortDir,
        );
        if (cancelled) return;
        setRows(r);
        setLoadedCount(r.length);
      } else {
        const { rows: r, total: t } = await fetchFiltered(
          m,
          filters,
          statusMapping,
          WINDOW_SIZE,
          0,
          sortCol,
          sortDir,
        );
        if (cancelled) return;
        setRows(r);
        setTotal(t);
        setLoadedCount(r.length);
      }
    };

    load()
      .catch((err) => {
        console.error("[DataGrid] Failed to fetch data:", err);
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setLoadedCount(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    m,
    filters,
    statusMapping,
    sortCol,
    sortDir,
    hasSplitFetchers,
    fetchFiltered,
    fetchFilteredPage,
  ]);

  // ── Incrementally load the next window when scrolling near the bottom. ────
  const loadMore = useCallback(async () => {
    if (fetchingMore) return;
    if (rows.length >= total && total > 0) return;
    if (rows.length === 0) return;
    setFetchingMore(true);
    try {
      const offset = rows.length;
      let next: Types.RawRow[];
      if (hasSplitFetchers && fetchFilteredPage) {
        next = await fetchFilteredPage(
          m,
          filters,
          statusMapping,
          WINDOW_SIZE,
          offset,
          sortCol,
          sortDir,
        );
      } else {
        const res = await fetchFiltered(
          m,
          filters,
          statusMapping,
          WINDOW_SIZE,
          offset,
          sortCol,
          sortDir,
        );
        next = res.rows;
      }
      if (next.length > 0) {
        setRows((prev) => {
          const merged = [...prev, ...next];
          setLoadedCount(merged.length);
          return merged;
        });
      }
    } catch (err) {
      console.error("[DataGrid] loadMore failed:", err);
    } finally {
      setFetchingMore(false);
    }
  }, [
    fetchingMore,
    rows.length,
    total,
    hasSplitFetchers,
    fetchFilteredPage,
    fetchFiltered,
    m,
    filters,
    statusMapping,
    sortCol,
    sortDir,
  ]);

  // Close visibility dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (visDropRef.current && !visDropRef.current.contains(e.target as Node)) {
        setVisDropOpen(false);
      }
    }
    if (visDropOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visDropOpen]);

  const displayCols = useMemo(() => {
    if (rows.length === 0) return [];
    const all = Object.keys(rows[0]);
    const priority = [
      m.transactionDate,
      m.transactionTime,
      m.msisdn,
      m.canal,
      m.serviceName,
      m.transactionType,
      m.amount,
      m.status,
      m.errorCode,
      m.operator,
      m.region,
    ];
    return [
      ...priority.filter((c) => all.includes(c)),
      ...all.filter((c) => !priority.includes(c)),
    ].slice(0, 13);
  }, [rows, m]);

  const columns = useMemo<ColumnDef<Types.RawRow>[]>(
    () =>
      displayCols.map((c) => ({
        id: c,
        accessorKey: c,
        header: c,
        enableSorting: true,
        cell: ({ getValue }) => {
          const v = String(getValue() ?? "");
          if (c === m.status) return <StatusBadge status={v} mapping={statusMapping} />;
          if (c === m.msisdn && onMsisdnClick && v)
            return (
              <button
                type="button"
                onClick={() => onMsisdnClick(v)}
                className="font-mono text-[11px] text-primary hover:text-primary/80 hover:underline transition-colors"
              >
                {v}
              </button>
            );
          return <span className="text-muted-foreground font-mono text-[11px]">{v}</span>;
        },
      })),
    [displayCols, m, onMsisdnClick, statusMapping],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
  });

  const tableRows = table.getRowModel().rows;
  const allCols = table.getAllLeafColumns();

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Trigger an incremental load when the last virtual row approaches the
  // end of what's currently loaded.
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= loadedCount - 1 && loadedCount < total) {
      loadMore();
    }
  }, [virtualItems, loadedCount, total, loadMore]);

  const colCount = table.getVisibleLeafColumns().length || displayCols.length;

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">
          {fmtN(total)} lignes correspondant aux filtres
          {total > 0 && (
            <>
              {" · "}
              {fmtN(loadedCount)} chargées
            </>
          )}
        </span>

        <div className="flex items-center gap-2">
          {/* Column visibility toggle */}
          <div className="relative" ref={visDropRef}>
            <button
              type="button"
              onClick={() => setVisDropOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-lg transition-colors",
                visDropOpen
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-muted hover:bg-accent border-border text-muted-foreground",
              )}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Colonnes</span>
            </button>
            <AnimatePresence>
              {visDropOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 top-full mt-1.5 z-30 bg-background border border-border rounded-xl shadow-xl p-3 min-w-52"
                >
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                    Visibilité des colonnes
                  </div>
                  <div className="space-y-0.5 max-h-64 overflow-y-auto">
                    {allCols.map((col) => (
                      <label
                        key={col.id}
                        className="flex items-center gap-2.5 px-1 py-1 rounded-lg cursor-pointer hover:bg-muted/60 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={col.getIsVisible()}
                          onChange={col.getToggleVisibilityHandler()}
                          className="w-3.5 h-3.5 rounded accent-[var(--primary)]"
                        />
                        <span className="text-xs text-foreground font-mono truncate">{col.id}</span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {fetchingMore && (
            <span className="text-[10px] text-muted-foreground animate-pulse">Chargement…</span>
          )}
        </div>
      </div>

      {/* Skeleton loader */}
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-9 rounded-t-xl bg-muted/70 animate-pulse" />
          {SKELETON_KEYS.map((id, i) => (
            <div
              key={id}
              className="h-8 rounded bg-muted animate-pulse"
              style={{ opacity: 1 - i * 0.1 }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Sticky header */}
          <div className="overflow-x-auto">
            <div className="min-w-full">
              <table className="w-full text-xs table-fixed">
                <thead className="sticky top-0 z-10">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="bg-muted/80 backdrop-blur border-b border-border">
                      {hg.headers.map((header) => {
                        const sorted = header.column.getIsSorted();
                        return (
                          <th
                            key={header.id}
                            className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold whitespace-nowrap cursor-pointer hover:text-foreground select-none group"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <span className="flex items-center gap-1">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === "asc" ? (
                                <ChevronUp className="w-3 h-3 text-primary" />
                              ) : sorted === "desc" ? (
                                <ChevronDown className="w-3 h-3 text-primary" />
                              ) : (
                                <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                              )}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
              </table>
            </div>
          </div>

          {/* Virtualized body */}
          {rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              Aucun résultat correspondant aux filtres actuels.
            </div>
          ) : (
            <div ref={parentRef} className="overflow-auto h-[62vh]">
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                  width: "100%",
                }}
              >
                {virtualItems.map((vItem) => {
                  const row = tableRows[vItem.index];
                  if (!row) return null;
                  return (
                    <div
                      key={row.id}
                      data-index={vItem.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vItem.start}px)`,
                      }}
                      className="flex border-b border-border hover:bg-muted/40 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <div
                          key={cell.id}
                          className="px-3 py-1.5 whitespace-nowrap truncate"
                          style={{ width: `${100 / colCount}%` }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
