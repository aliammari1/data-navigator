"use client";

/**
 * Per-column detail inspector (the four tabs: overview / distribution / quality
 * / samples), split out of the old 1977-line screen.
 *
 * Numeric stats (min/max/avg/std/quantiles, distinct, null) come from the
 * single whole-dataset SUMMARIZE scan already on the `ColProfile`. The heavier
 * per-column views — top-value frequencies, the histogram and string-length
 * stats — are fetched lazily for the *selected* column only (`useColumnDetail`)
 * and arrive via the `detail` prop. The Quality tab surfaces the real,
 * locally-computed validity signal (`validityDetail`): semantic type,
 * conformance rate and MAD-based outlier rate from a bounded reservoir sample.
 */

import {
  BarChart3,
  CheckCircle2,
  Copy,
  Eye,
  Fingerprint,
  Shield,
  Star,
  Table2,
  TrendingUp,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { histogramOption, topValuesOption } from "@/features/parsed-data/charts/options";
import { ProfileChart } from "@/features/parsed-data/charts/ProfileChart";
import { QualityRing, StatGrid } from "@/features/parsed-data/components/profile-cards";
import { formatNumber } from "@/features/parsed-data/model/format";
import {
  qualityColor,
  qualityLabel,
  typeColor,
  typeIcon,
} from "@/features/parsed-data/model/profile-format";
import { profileScore } from "@/features/parsed-data/model/summary-map";
import type { ColProfile, ColumnDetail } from "@/features/parsed-data/model/types";
import { cn } from "@/shared/utils";

export type DetailTab = "overview" | "distribution" | "quality" | "samples";

interface TopValue {
  value: string;
  count: number;
  pct: number;
}

const TABS: ReadonlyArray<[DetailTab, string, typeof Eye]> = [
  ["overview", "Overview", Eye],
  ["distribution", "Distribution", BarChart3],
  ["quality", "Quality", Shield],
  ["samples", "Samples", Table2],
];

function isNumeric(profile: ColProfile): boolean {
  return profile.type === "integer" || profile.type === "float";
}

export function ColumnDetailPanel({
  profile,
  detail,
  detailLoading,
  activeTab,
  onTabChange,
}: {
  profile: ColProfile;
  detail: ColumnDetail | null;
  detailLoading: boolean;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}) {
  const score = profileScore(profile);
  const Icon = typeIcon(profile.type);

  // Lazy detail (top-K / histogram / string lengths / validityDetail) overrides
  // the SUMMARIZE-derived placeholders once it arrives for this column.
  const topValues: TopValue[] = detail?.topValues ?? profile.topValues;
  const minLen = detail?.minLen ?? profile.minLen;
  const maxLen = detail?.maxLen ?? profile.maxLen;
  const avgLen = detail?.avgLen ?? profile.avgLen;
  const validityDetail = detail?.validityDetail ?? profile.validityDetail;
  const validityScore = validityDetail
    ? Math.min(1, Math.max(0, validityDetail.conformanceRate * (1 - validityDetail.outlierRate)))
    : profile.validity;

  const histChart = useMemo(() => histogramOption(detail), [detail]);
  const topChart = useMemo(() => topValuesOption(detail), [detail]);

  return (
    <div className="rounded-3xl border border-border bg-card">
      <div className="border-b border-border p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div
              className={cn(
                "flex h-12 w-12 flex-none items-center justify-center rounded-2xl",
                typeColor(profile.type),
              )}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <h2 className="truncate font-mono text-xl font-bold text-foreground">
                {profile.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs", typeColor(profile.type))}>
                  {profile.sqlType}
                </span>
                <span className="text-xs text-muted-foreground">column #{profile.index + 1}</span>
                <span className="text-xs text-muted-foreground">
                  {profile.distinctCount.toLocaleString()} distinct values
                </span>
                {validityDetail?.semanticType && (
                  <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-600 dark:text-violet-300">
                    {validityDetail.semanticType}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold" style={{ color: qualityColor(score) }}>
                {(score * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">{qualityLabel(score)}</div>
            </div>
            <QualityRing score={score} size={72} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1 md:grid-cols-4">
          {TABS.map(([tab, label, TabIcon]) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TabIcon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-5"
            >
              {isNumeric(profile) ? (
                <StatGrid
                  items={[
                    { label: "Min", value: formatNumber(profile.min) },
                    { label: "Max", value: formatNumber(profile.max) },
                    { label: "Mean", value: formatNumber(profile.avg) },
                    { label: "Median", value: formatNumber(profile.median) },
                    { label: "Std Dev", value: formatNumber(profile.stddev) },
                    { label: "Sum", value: formatNumber(profile.sum, 0) },
                    { label: "P25", value: formatNumber(profile.p25) },
                    { label: "P75", value: formatNumber(profile.p75) },
                    {
                      label: "IQR",
                      value:
                        profile.p25 !== undefined && profile.p75 !== undefined
                          ? formatNumber(profile.p75 - profile.p25)
                          : "—",
                    },
                    {
                      label: "Null Count",
                      value: profile.nullCount.toLocaleString(),
                      highlight: profile.nullCount > 0,
                    },
                    {
                      label: "Distinct",
                      value: profile.distinctCount.toLocaleString(),
                    },
                    {
                      label: "Row Count",
                      value: profile.rowCount.toLocaleString(),
                    },
                  ]}
                />
              ) : profile.type === "string" ? (
                <StatGrid
                  items={[
                    { label: "Min Length", value: String(minLen ?? "—") },
                    { label: "Max Length", value: String(maxLen ?? "—") },
                    { label: "Avg Length", value: formatNumber(avgLen, 1) },
                    {
                      label: "Distinct",
                      value: profile.distinctCount.toLocaleString(),
                    },
                    {
                      label: "Null Count",
                      value: profile.nullCount.toLocaleString(),
                      highlight: profile.nullCount > 0,
                    },
                    {
                      label: "Uniqueness",
                      value: `${(profile.uniquenessRate * 100).toFixed(1)}%`,
                    },
                  ]}
                />
              ) : (
                <StatGrid
                  items={[
                    {
                      label: "Distinct",
                      value: profile.distinctCount.toLocaleString(),
                    },
                    {
                      label: "Null Count",
                      value: profile.nullCount.toLocaleString(),
                      highlight: profile.nullCount > 0,
                    },
                    {
                      label: "Row Count",
                      value: profile.rowCount.toLocaleString(),
                    },
                    {
                      label: "Null Rate",
                      value: `${(profile.nullRate * 100).toFixed(2)}%`,
                      highlight: profile.nullRate > 0.05,
                    },
                    {
                      label: "Completeness",
                      value: `${(profile.completeness * 100).toFixed(1)}%`,
                    },
                    {
                      label: "Uniqueness",
                      value: `${(profile.uniquenessRate * 100).toFixed(1)}%`,
                    },
                  ]}
                />
              )}

              {topValues.length > 0 && (
                <div className="rounded-3xl border border-border bg-background p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                    <Star className="h-4 w-4 text-yellow-500" />
                    Top Values
                  </h3>

                  <div className="space-y-3">
                    {topValues.slice(0, 6).map((value) => (
                      <div key={value.value} className="flex items-center gap-3">
                        <span className="w-36 truncate font-mono text-xs text-foreground">
                          {value.value || (
                            <span className="italic text-muted-foreground">empty</span>
                          )}
                        </span>

                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full rounded-full bg-violet-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${value.pct * 100}%` }}
                            transition={{ duration: 0.6 }}
                          />
                        </div>

                        <span className="w-24 text-right text-xs text-muted-foreground">
                          {value.count.toLocaleString()} · {(value.pct * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "distribution" && (
            <motion.div
              key="distribution"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid gap-5 lg:grid-cols-2"
            >
              {detailLoading && !detail ? (
                <div className="rounded-3xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground lg:col-span-2">
                  Loading distribution…
                </div>
              ) : (
                <>
                  {histChart && (
                    <div className="rounded-3xl border border-border bg-background p-5 lg:col-span-2">
                      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                        <BarChart3 className="h-4 w-4 text-indigo-500" />
                        Frequency Distribution
                      </h3>
                      <ProfileChart option={histChart} style={{ height: 260 }} />
                    </div>
                  )}

                  {topChart && (
                    <div className="rounded-3xl border border-border bg-background p-5 lg:col-span-2">
                      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                        <TrendingUp className="h-4 w-4 text-purple-500" />
                        Top 10 Values
                      </h3>
                      <ProfileChart option={topChart} style={{ height: 300 }} />
                    </div>
                  )}

                  {!histChart && !topChart && (
                    <div className="rounded-3xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground lg:col-span-2">
                      No distribution chart is available for this column.
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {activeTab === "quality" && (
            <motion.div
              key="quality"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid gap-4 md:grid-cols-3"
            >
              {[
                {
                  name: "Completeness",
                  score: profile.completeness,
                  description: `${(profile.completeness * 100).toFixed(2)}% of values are non-null`,
                  icon: CheckCircle2,
                  detail: `${profile.nullCount.toLocaleString()} null values`,
                },
                {
                  name: "Uniqueness",
                  score: profile.uniqueness,
                  description: `${profile.distinctCount.toLocaleString()} distinct values`,
                  icon: Fingerprint,
                  detail: `${(profile.uniquenessRate * 100).toFixed(1)}% uniqueness rate`,
                },
                {
                  name: "Validity",
                  score: validityScore,
                  description: validityDetail
                    ? `${(validityDetail.conformanceRate * 100).toFixed(1)}% conform${
                        validityDetail.semanticType ? ` (${validityDetail.semanticType})` : ""
                      }`
                    : `Values conform to ${profile.sqlType}`,
                  icon: Shield,
                  detail: validityDetail
                    ? validityDetail.sampleSize > 0
                      ? `${(validityDetail.outlierRate * 100).toFixed(1)}% outliers · ${validityDetail.sampleSize.toLocaleString()} sampled`
                      : "Insufficient sample"
                    : "Select to measure validity",
                },
              ].map((dimension) => {
                const DimIcon = dimension.icon;

                return (
                  <div
                    key={dimension.name}
                    className="rounded-3xl border border-border bg-background p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <DimIcon
                          className="h-5 w-5"
                          style={{ color: qualityColor(dimension.score) }}
                        />
                        <span className="text-sm font-bold text-foreground">{dimension.name}</span>
                      </div>

                      <span
                        className="text-xl font-bold"
                        style={{ color: qualityColor(dimension.score) }}
                      >
                        {(dimension.score * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: qualityColor(dimension.score),
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${dimension.score * 100}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>

                    <p className="mt-4 text-sm text-foreground">{dimension.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{dimension.detail}</p>
                  </div>
                );
              })}
            </motion.div>
          )}

          {activeTab === "samples" && (
            <motion.div
              key="samples"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-3xl border border-border bg-background p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  Value Frequency Table
                </h3>

                <button
                  type="button"
                  onClick={() => {
                    const text = topValues
                      .map(
                        (value) =>
                          `${value.value}\t${value.count}\t${(value.pct * 100).toFixed(2)}%`,
                      )
                      .join("\n");
                    void navigator.clipboard.writeText(text);
                  }}
                  disabled={topValues.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>

              {topValues.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  {detailLoading ? "Loading sample values…" : "No values."}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                          Value
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                          Count
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                          %
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                          Distribution
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topValues.map((value, index) => (
                        <tr
                          key={`${value.value}-${index}`}
                          className={cn(
                            "border-b border-border last:border-0",
                            index % 2 === 1 && "bg-muted/40",
                          )}
                        >
                          <td className="max-w-72 truncate px-3 py-2 font-mono text-foreground">
                            {value.value || (
                              <span className="italic text-muted-foreground">empty</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-foreground">
                            {value.count.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {(value.pct * 100).toFixed(2)}%
                          </td>
                          <td className="w-40 px-3 py-2">
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-violet-500"
                                style={{ width: `${value.pct * 100}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
