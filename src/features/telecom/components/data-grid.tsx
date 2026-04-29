"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Columns3,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtN } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

const PAGE_SIZE = 50;
const SKELETON_KEYS = ["sk0", "sk1", "sk2", "sk3", "sk4", "sk5", "sk6", "sk7"];

export function DataGrid({
  m,
  filters,
  statusMapping,
  onMsisdnClick,
  fetchFiltered,
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
}) {
  const [rows, setRows] = useState<Types.RawRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [visDropOpen, setVisDropOpen] = useState(false);
  const visDropRef = useRef<HTMLDivElement>(null);

  const sortCol = sorting[0]?.id ?? "";
  const sortDir: Types.SortDir = sorting[0]?.desc ? "desc" : "asc";

  // Reset page on filter change
  // biome-ignore lint/correctness/useExhaustiveDependencies: page intentionally resets on filter change
  useEffect(() => {
    setPage(0);
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    fetchFiltered(
      m,
      filters,
      statusMapping,
      PAGE_SIZE,
      page * PAGE_SIZE,
      sortCol,
      sortDir,
    )
      .then(({ rows: r, total: t }) => {
        setRows(r);
        setTotal(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [m, filters, page, sortCol, sortDir, statusMapping, fetchFiltered]);

  // Close visibility dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        visDropRef.current &&
        !visDropRef.current.contains(e.target as Node)
      ) {
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
          if (c === m.status)
            return <StatusBadge status={v} mapping={statusMapping} />;
          if (c === m.msisdn && onMsisdnClick && v)
            return (
              <button
                type="button"
                onClick={() => onMsisdnClick(v)}
                className="font-mono text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline transition-colors"
              >
                {v}
              </button>
            );
          return (
            <span className="text-muted-foreground font-mono text-[11px]">
              {v}
            </span>
          );
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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allCols = table.getAllLeafColumns();

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">
          {fmtN(total)} lignes correspondant aux filtres
          {total > PAGE_SIZE &&
            ` · affichage ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`}
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
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/15 dark:border-indigo-500/30 dark:text-indigo-300"
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
                          className="w-3.5 h-3.5 rounded accent-indigo-500"
                        />
                        <span className="text-xs text-foreground font-mono truncate">
                          {col.id}
                        </span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Pagination */}
          <span className="text-xs text-muted-foreground tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-7 h-7 rounded-lg bg-muted disabled:opacity-30 flex items-center justify-center hover:bg-accent transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="w-7 h-7 rounded-lg bg-muted disabled:opacity-30 flex items-center justify-center hover:bg-accent transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
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
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-muted/50 border-b border-border">
                  {hg.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold whitespace-nowrap cursor-pointer hover:text-foreground select-none group"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === "asc" ? (
                            <ChevronUp className="w-3 h-3 text-indigo-500" />
                          ) : sorted === "desc" ? (
                            <ChevronDown className="w-3 h-3 text-indigo-500" />
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
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border hover:bg-muted/40 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-1.5 whitespace-nowrap max-w-36 truncate"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={displayCols.length || 1}
                    className="py-10 text-center text-muted-foreground text-sm"
                  >
                    Aucun résultat correspondant aux filtres actuels.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
