"use client";

/**
 * Dataset-generic analytics — every number traces to a real DuckDB query or the
 * seeded analysis worker (NO Math.random, NO hardcoded telecom schema).
 *
 *  - Column profile: ONE `profileDataset` SUMMARIZE scan (min/max/avg/std/
 *    quantiles/approx-distinct/null%), not N per-column queries.
 *  - Group aggregate: a real DuckDB `GROUP BY` over a chosen categorical
 *    dimension and numeric metric (top-K groups).
 *  - Correlation matrix: real Pearson r from the analysis worker over a DuckDB
 *    reservoir sample of the numeric columns.
 *
 * Charts render off the main thread via `<OffscreenChart>` (chart.worker +
 * OffscreenCanvas) with an `echarts-for-react` fallback using the SAME
 * tree-shaken `echarts` core.
 */

import ReactEChartsCore from "echarts-for-react/lib/core";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnDef } from "@/features/data-browser/model/types";
import {
  buildReservoirSampleSQL,
  profileDataset,
  quoteIdent,
  runReadOnlyQuery,
  type SummarizeRow,
} from "@/platform/duckdb/duckdb";
import {
  buildBarOption,
  buildHeatmapOption,
  type EChartsOption,
  echarts,
  getAnalysisProxy,
  OffscreenChart,
} from "@/platform/viz";

interface GroupRow {
  label: string;
  metric: number;
  count: number;
}

interface CorrelationResult {
  columns: string[];
  cells: [number, number, number][];
}

const CORRELATION_SAMPLE_SIZE = 5000;

function OffscreenOrFallback({ option, height }: { option: EChartsOption; height: number }) {
  return (
    <OffscreenChart
      option={option}
      height={height}
      fallback={
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          style={{ height }}
          opts={{ renderer: "canvas" }}
          notMerge
        />
      }
    />
  );
}

export default function AnalyticsView({
  datasetId,
  columns,
  whereClause,
}: {
  /** The dataset view name (a valid `ds_…` datasetId). */
  datasetId: string;
  columns: ColumnDef[];
  /** Composed WHERE (filters + search) so analytics reflect the active view. */
  whereClause: string;
}) {
  const [profile, setProfile] = useState<SummarizeRow[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);

  const numericColumns = useMemo(() => columns.filter((c) => c.type === "number"), [columns]);
  const categoricalColumns = useMemo(
    () =>
      columns.filter(
        (c) => c.type === "string" || c.type === "email" || c.type === "url" || c.type === "date",
      ),
    [columns],
  );

  const [dimension, setDimension] = useState<string>("");
  const [metric, setMetric] = useState<string>("");

  // Default the dimension/metric pickers once columns arrive.
  useEffect(() => {
    setDimension((prev) => prev || categoricalColumns[0]?.name || columns[0]?.name || "");
    setMetric((prev) => prev || numericColumns[0]?.name || "");
  }, [categoricalColumns, numericColumns, columns]);

  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [correlation, setCorrelation] = useState<CorrelationResult | null>(null);
  const [correlationLoading, setCorrelationLoading] = useState(false);

  // ── Whole-dataset profile (single SUMMARIZE scan) ──
  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    profileDataset({ datasetId })
      .then((rows) => {
        if (!cancelled) setProfile(rows);
      })
      .catch(() => {
        if (!cancelled) setProfile([]);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  // ── Group aggregate (real DuckDB GROUP BY) ──
  useEffect(() => {
    if (!dimension || !metric) {
      setGroupRows([]);
      return;
    }
    let cancelled = false;
    setGroupLoading(true);
    const dim = quoteIdent(dimension);
    const met = quoteIdent(metric);
    const where = whereClause ? `WHERE ${whereClause}` : "";
    const sql = `
      SELECT CAST(${dim} AS VARCHAR) AS label,
             SUM(TRY_CAST(${met} AS DOUBLE)) AS metric,
             COUNT(*) AS cnt
      FROM ${quoteIdent(datasetId)}
      ${where}
      GROUP BY 1
      ORDER BY metric DESC NULLS LAST
      LIMIT 20
    `;
    runReadOnlyQuery(sql)
      .then((rows) => {
        if (cancelled) return;
        setGroupRows(
          rows.map((r) => ({
            label: String(r.label ?? "∅"),
            metric: Number(r.metric ?? 0),
            count: Number(r.cnt ?? 0),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setGroupRows([]);
      })
      .finally(() => {
        if (!cancelled) setGroupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, dimension, metric, whereClause]);

  // ── Correlation matrix (real Pearson r over a DuckDB reservoir sample) ──
  useEffect(() => {
    const corrCols = numericColumns.slice(0, 8);
    if (corrCols.length < 2) {
      setCorrelation(null);
      return;
    }
    let cancelled = false;
    setCorrelationLoading(true);

    async function run() {
      const names = corrCols.map((c) => c.name);
      const notNull = names.map((n) => `${quoteIdent(n)} IS NOT NULL`).join(" AND ");
      const where = [whereClause, notNull].filter(Boolean).join(" AND ");
      // Reservoir-sample the bare numeric columns (seeded → deterministic) so a
      // multi-million-row table still produces a bounded input for the worker.
      const sampleSql = buildReservoirSampleSQL(datasetId, CORRELATION_SAMPLE_SIZE, {
        columns: names,
        where: where || undefined,
        seed: 42,
      });
      const rows = await runReadOnlyQuery(sampleSql);
      if (cancelled) return;

      const data: number[][] = rows
        .map((r) => names.map((n) => Number(r[n])))
        .filter((row) => row.every((v) => Number.isFinite(v)));
      if (data.length < 2) {
        setCorrelation(null);
        return;
      }

      const proxy = getAnalysisProxy();
      const result = proxy
        ? await proxy.correlationMatrix(data, names)
        : // Inline fallback path is rare (no Worker); compute is identical in
          // the worker. Surface nothing rather than fabricate.
          { matrix: [] as number[][], columns: names };
      if (cancelled) return;

      const cells: [number, number, number][] = [];
      result.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
          cells.push([x, y, value]);
        });
      });
      setCorrelation({ columns: result.columns, cells });
    }

    run()
      .catch(() => {
        if (!cancelled) setCorrelation(null);
      })
      .finally(() => {
        if (!cancelled) setCorrelationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, numericColumns, whereClause]);

  const barOption = useMemo<EChartsOption>(
    () =>
      buildBarOption(
        groupRows.map((g) => g.label),
        [
          {
            name: metric || "metric",
            data: groupRows.map((g) => Math.round(g.metric * 100) / 100),
            color: "#10b981",
          },
        ],
        { title: dimension && metric ? `${metric} by ${dimension}` : undefined },
      ),
    [groupRows, dimension, metric],
  );

  const heatmapOption = useMemo<EChartsOption | null>(() => {
    if (!correlation) return null;
    return buildHeatmapOption(correlation.columns, correlation.columns, correlation.cells, {
      title: "Pearson correlation",
      min: -1,
      max: 1,
    });
  }, [correlation]);

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* ── KPI strip from the SUMMARIZE profile ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Columns", value: profile.length || columns.length },
          {
            label: "Rows (scanned)",
            value: (profile[0]?.count ?? 0).toLocaleString(),
          },
          { label: "Numeric cols", value: numericColumns.length },
          {
            label: "Avg null %",
            value: profile.length
              ? `${(
                  profile.reduce((a, r) => a + (r.null_percentage ?? 0), 0) / profile.length
                ).toFixed(1)}%`
              : "—",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-zinc-100">
              {profileLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
              ) : (
                kpi.value
              )}
            </p>
            <p className="text-xs text-zinc-500 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ── Group aggregate (real GROUP BY) ── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">Aggregate by dimension</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={dimension} onValueChange={(v) => v && setDimension(v)}>
              <SelectTrigger className="h-7 w-36 text-xs bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Dimension" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {(categoricalColumns.length ? categoricalColumns : columns).map((c) => (
                  <SelectItem key={c.id} value={c.name} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={metric} onValueChange={(v) => v && setMetric(v)}>
              <SelectTrigger className="h-7 w-36 text-xs bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Metric (SUM)" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {numericColumns.map((c) => (
                  <SelectItem key={c.id} value={c.name} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {groupLoading ? (
            <div className="h-[300px] flex items-center justify-center text-zinc-600 text-xs">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Aggregating…
            </div>
          ) : groupRows.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-zinc-600 text-xs">
              Pick a dimension and a numeric metric.
            </div>
          ) : (
            <OffscreenOrFallback option={barOption} height={320} />
          )}
        </CardContent>
      </Card>

      {/* ── Correlation matrix (real Pearson r from analysis worker) ── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Numeric correlation
            <span className="text-[10px] text-zinc-600 ml-2 font-normal">
              Pearson r · sampled ≤{CORRELATION_SAMPLE_SIZE.toLocaleString()} rows
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {correlationLoading ? (
            <div className="h-[320px] flex items-center justify-center text-zinc-600 text-xs">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Computing correlations…
            </div>
          ) : heatmapOption && correlation ? (
            <OffscreenOrFallback
              option={heatmapOption}
              height={Math.max(320, correlation.columns.length * 36 + 80)}
            />
          ) : (
            <div className="h-[320px] flex items-center justify-center text-zinc-600 text-xs">
              Needs at least two numeric columns with data.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Column profile table (single SUMMARIZE scan) ── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Column profile</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 text-left border-b border-zinc-800">
                {["Column", "Type", "Min", "Max", "Avg", "Distinct", "Null %"].map((h) => (
                  <th key={h} className="py-1.5 pr-4 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {profile.map((r) => (
                <tr key={r.column_name} className="border-b border-zinc-800/40">
                  <td className="py-1.5 pr-4 text-zinc-200 whitespace-nowrap">{r.column_name}</td>
                  <td className="py-1.5 pr-4 text-zinc-500 whitespace-nowrap">{r.column_type}</td>
                  <td className="py-1.5 pr-4 text-zinc-400">{fmt(r.min)}</td>
                  <td className="py-1.5 pr-4 text-zinc-400">{fmt(r.max)}</td>
                  <td className="py-1.5 pr-4 text-emerald-300">
                    {r.avg == null
                      ? "—"
                      : r.avg.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-1.5 pr-4 text-blue-300">
                    {r.approx_unique == null ? "—" : r.approx_unique.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-4 text-amber-300">
                    {r.null_percentage == null ? "—" : `${r.null_percentage.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const s = String(value);
  return s.length > 18 ? `${s.slice(0, 18)}…` : s;
}
