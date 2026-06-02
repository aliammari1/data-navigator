"use client";

import { useMemo, useState, type ComponentType } from "react";
import { motion } from "motion/react";
import {
  Activity,
  CalendarDays,
  Database,
  History,
  Search,
  Table2,
  Upload,
  WandSparkles,
  Zap,
} from "lucide-react";
import { useActivityStore } from "@/core/stores/activity-store";
import { useDataStore } from "@/core/stores/data-store";
import { cn } from "@/shared/utils";

type HistoryRow = {
  id: string;
  when: string;
  type: string;
  message: string;
  dataset?: string;
  table?: string;
  source: "activity" | "dataset" | "transform" | "query";
};

function formatAgo(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "unknown";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function dayBucket(value: string): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "Unknown";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function sourceStyle(source: HistoryRow["source"]) {
  switch (source) {
    case "dataset":
      return {
        icon: Upload,
        dot: "bg-emerald-500",
        badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "transform":
      return {
        icon: WandSparkles,
        dot: "bg-indigo-500",
        badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
      };
    case "query":
      return {
        icon: Table2,
        dot: "bg-cyan-500",
        badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
      };
    default:
      return {
        icon: Activity,
        dot: "bg-amber-500",
        badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
  }
}

export default function HistoryScreen() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | HistoryRow["source"]>("all");

  const datasets = useDataStore((s) => s.datasets);
  const transforms = useDataStore((s) => s.transforms);
  const queryHistory = useDataStore((s) => s.queryHistory);
  const events = useActivityStore((s) => s.events);

  const rows = useMemo<HistoryRow[]>(() => {
    const dsRows: HistoryRow[] = datasets.map((d) => ({
      id: `ds_${d.id}`,
      when: d.updatedAt,
      type: "dataset_updated",
      message: `Dataset ${d.name} (${d.rowCount.toLocaleString()} rows)`,
      dataset: d.id,
      table: d.tableName,
      source: "dataset",
    }));

    const tfRows: HistoryRow[] = transforms.map((t) => ({
      id: `tf_${t.id}`,
      when: t.appliedAt,
      type: t.type,
      message: t.description || `Transform ${t.type}`,
      dataset: t.outputDatasetId,
      source: "transform",
    }));

    const qRows: HistoryRow[] = queryHistory.map((entry) => ({
      id: `q_${entry.id}`,
      when: entry.ranAt,
      type: entry.error ? "query_error" : "query_run",
      message: entry.error ? `Query failed: ${entry.error}` : entry.sql,
      dataset: entry.datasetId,
      source: "query",
    }));

    const aRows: HistoryRow[] = events.map((e) => ({
      id: e.id,
      when: e.createdAt,
      type: e.type,
      message: e.message,
      dataset: e.datasetId,
      table: e.tableName,
      source: "activity",
    }));

    return [...aRows, ...dsRows, ...tfRows, ...qRows].sort(
      (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime(),
    );
  }, [datasets, events, queryHistory, transforms]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const sourceMatch = kind === "all" || r.source === kind;
      const query = q.trim().toLowerCase();
      const textMatch =
        query.length === 0 ||
        r.message.toLowerCase().includes(query) ||
        r.type.toLowerCase().includes(query) ||
        (r.table ?? "").toLowerCase().includes(query) ||
        (r.dataset ?? "").toLowerCase().includes(query);
      return sourceMatch && textMatch;
    });
  }, [kind, q, rows]);

  const grouped = useMemo(() => {
    const map = new Map<string, HistoryRow[]>();
    for (const row of filtered) {
      const key = dayBucket(row.when);
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="dn-page">
      <div className="dn-page-shell max-w-6xl space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Workspace History</h1>
                <p className="text-xs text-muted-foreground">
                  Live timeline from real datasets, transforms, queries and telecom actions
                </p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {filtered.length} event{filtered.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="relative grow basis-80">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by message, type, table..."
                className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="all">All sources</option>
              <option value="activity">Activity</option>
              <option value="dataset">Datasets</option>
              <option value="transform">Transforms</option>
              <option value="query">Queries</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard label="Datasets" value={datasets.length} icon={Database} />
          <SummaryCard label="Transforms" value={transforms.length} icon={Zap} />
          <SummaryCard label="Queries" value={queryHistory.length} icon={Table2} />
          <SummaryCard label="Activities" value={events.length} icon={Activity} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          {grouped.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No events match this filter.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([day, dayRows]) => (
                <section key={day} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {day}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                      {dayRows.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {dayRows.map((row, idx) => {
                      const style = sourceStyle(row.source);
                      const Icon = style.icon;
                      return (
                        <motion.article
                          key={row.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.015, 0.2) }}
                          className="rounded-xl border border-border bg-background px-3 py-2.5"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "mt-1 inline-flex h-2.5 w-2.5 rounded-full",
                                style.dot,
                              )}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", style.badge)}>
                                  <Icon className="h-3 w-3" />
                                  {row.source}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {row.type}
                                </span>
                                <span className="ml-auto text-[11px] text-muted-foreground">
                                  {formatAgo(row.when)}
                                </span>
                              </div>
                              <p className="mt-1.5 text-sm text-foreground">{row.message}</p>
                              {(row.table || row.dataset) && (
                                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                  {row.table && (
                                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono">
                                      {row.table}
                                    </span>
                                  )}
                                  {row.dataset && (
                                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono">
                                      {row.dataset}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.article>
                      );
                    })}
                  </div>
                </section>
              ))}
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
