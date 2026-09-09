"use client";
import { Filter, Search, X } from "lucide-react";
import type * as Types from "@/features/telecom/types";

export function FilterBar({
  filters,
  onChange,
  operators,
  regions,
}: {
  filters: Types.FilterState;
  onChange: (f: Types.FilterState) => void;
  operators: string[];
  regions: string[];
}) {
  const set = (k: keyof Types.FilterState, v: string) => onChange({ ...filters, [k]: v });
  const hasAny = Object.values(filters).some((v) => v !== "");
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 border border-border rounded-xl">
      <Filter className="w-3.5 h-3.5 text-muted-foreground flex-none" />
      <div className="flex items-center gap-1.5 bg-muted border border-border rounded-lg px-2 py-1.5 flex-1 min-w-36">
        <Search className="w-3 h-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="Rechercher MSISDN…"
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          className="bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none flex-1"
        />
        {filters.search && (
          <button type="button" onClick={() => set("search", "")}>
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>
      {[
        {
          key: "status" as const,
          label: "Tous les Statuts",
          opts: ["SUCCESS", "DECLINED", "INSTANCE", "REFUND", "SUBMITTED", "OTHER"],
        },
      ].map(({ key, label, opts }) => (
        <select
          key={key}
          value={filters[key]}
          onChange={(e) => set(key, e.target.value)}
          className="bg-card border border-border text-xs text-muted-foreground rounded-lg px-2 py-1.5 outline-none"
        >
          <option value="">{label}</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}
      <select
        value={filters.operator}
        onChange={(e) => set("operator", e.target.value)}
        className="bg-card border border-border text-xs text-muted-foreground rounded-lg px-2 py-1.5 outline-none"
      >
        <option value="">Tous les Opérateurs</option>
        {operators.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      <select
        value={filters.region}
        onChange={(e) => set("region", e.target.value)}
        className="bg-card border border-border text-xs text-muted-foreground rounded-lg px-2 py-1.5 outline-none"
      >
        <option value="">Toutes les Régions</option>
        {regions.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input
        type="number"
        placeholder="Min TND"
        value={filters.minAmount}
        onChange={(e) => set("minAmount", e.target.value)}
        className="bg-card border border-border text-xs text-muted-foreground rounded-lg px-2 py-1.5 outline-none w-20"
      />
      <input
        type="number"
        placeholder="Max TND"
        value={filters.maxAmount}
        onChange={(e) => set("maxAmount", e.target.value)}
        className="bg-card border border-border text-xs text-muted-foreground rounded-lg px-2 py-1.5 outline-none w-20"
      />
      {hasAny && (
        <button
          type="button"
          onClick={() =>
            onChange({
              status: "",
              canal: "",
              region: "",
              operator: "",
              search: "",
              minAmount: "",
              maxAmount: "",
              hourFrom: "",
              hourTo: "",
            })
          }
          className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <X className="w-3 h-3" /> Effacer
        </button>
      )}
    </div>
  );
}
