"use client";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmtN } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";
import { StatusBadge } from "./status-badge";

const PAGE_SIZE = 50;

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
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<Types.SortDir>("desc");

  // biome-ignore lint/correctness/useExhaustiveDependencies: page intentionally resets on filter change
  useEffect(() => {
    setPage(0);
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    fetchFiltered(m, filters, statusMapping, PAGE_SIZE, page * PAGE_SIZE, sortCol, sortDir)
      .then(({ rows: r, total: t }) => {
        setRows(r);
        setTotal(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [m, filters, page, sortCol, sortDir, statusMapping, fetchFiltered]);

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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">
          {fmtN(total)} lignes correspondant aux filtres
          {total > PAGE_SIZE &&
            ` · affichage ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Page {page + 1}/{pageCount}
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

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement des lignes…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {displayCols.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                    onClick={() => {
                      setSortDir(sortCol === c && sortDir === "desc" ? "asc" : "desc");
                      setSortCol(c);
                    }}
                  >
                    <span className="flex items-center gap-1">
                      {c}
                      {sortCol === c &&
                        (sortDir === "asc" ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={displayCols.map((c) => String(row[c] ?? "")).join("|") || `row-${page}-${rowIdx}`}
                  className="border-b border-border hover:bg-muted/40 transition-colors"
                >
                  {displayCols.map((c) => {
                    const v = String(row[c] ?? "");
                    const isMsisdn = c === m.msisdn && !!onMsisdnClick && v;
                    return (
                      <td key={c} className="px-3 py-1.5 whitespace-nowrap max-w-36 truncate">
                        {c === m.status ? (
                          <StatusBadge status={v} mapping={statusMapping} />
                        ) : isMsisdn ? (
                          <button
                            type="button"
                            onClick={() => onMsisdnClick(v)}
                            className="font-mono text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline cursor-pointer transition-colors"
                          >
                            {v}
                          </button>
                        ) : (
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {v}
                          </span>
                        )}
                      </td>
                    );
                  })}
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
