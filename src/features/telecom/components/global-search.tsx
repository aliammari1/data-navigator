"use client";

import { useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";

type SearchHit = {
  label: string;
  sub: string;
  tab: Types.MainTab;
  type: "canal" | "operator" | "error";
};

export function GlobalSearch({
  canals,
  operators,
  errors,
  onNavigate,
}: {
  canals: Types.CanalSummary[];
  operators: Types.OperatorRow[];
  errors: Types.ErrorRow[];
  onNavigate: (tab: Types.MainTab) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<SearchHit[]>(
    () => [
      ...canals.map((c) => ({
        type: "canal" as const,
        label: c.label,
        sub: `${fmtPct(c.successRate)} réussite · ${fmtN(c.total)} tx`,
        tab: "canals" as Types.MainTab,
      })),
      ...operators.slice(0, 30).map((o) => ({
        type: "operator" as const,
        label: o.operator,
        sub: `${fmtN(o.total)} tx`,
        tab: "analysis" as Types.MainTab,
      })),
      ...errors.slice(0, 30).map((e) => ({
        type: "error" as const,
        label: e.error_code,
        sub: e.error_message,
        tab: "analysis" as Types.MainTab,
      })),
    ],
    [canals, operators, errors],
  );

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: ["label", "sub"],
        threshold: 0.4,
        includeScore: true,
      }),
    [items],
  );

  const results = useMemo(
    () => (query.length > 1 ? fuse.search(query).slice(0, 7) : []),
    [fuse, query],
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted border border-border rounded-lg text-xs text-muted-foreground">
        <Search className="w-3 h-3 flex-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          placeholder="Rechercher…"
          className="w-28 bg-transparent outline-none placeholder:text-muted-foreground/60"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 right-0 z-40 w-72 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
          {results.map(({ item }) => (
            <button
              key={`${item.type}-${item.label}`}
              type="button"
              onMouseDown={() => {
                onNavigate(item.tab);
                setQuery("");
                setOpen(false);
              }}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
            >
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex-none",
                  item.type === "canal"
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : item.type === "error"
                      ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                )}
              >
                {item.type === "canal"
                  ? "Canal"
                  : item.type === "error"
                    ? "Err"
                    : "Opér"}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                  {item.label}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {item.sub}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
