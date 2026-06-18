"use client";

import {
  Activity,
  BarChart2,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Sparkles,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useMemo, useState } from "react";
import {
  CANAL_CONFIG,
  STATUS_COLORS,
} from "@/features/telecom/lib/canal-config";
import {
  fmtAmount,
  fmtDuration,
  fmtN,
  fmtPct,
} from "@/features/telecom/lib/format";
import { computeAIInsights } from "@/features/telecom/lib/insights";
import type * as Types from "@/features/telecom/types";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";
import { cn } from "@/shared/utils";
import { AlertBanner } from "./alert-banner";
import { AnimCounter } from "./anim-counter";
import {
  type DashboardCardItem,
  DraggableAutoGrid,
} from "./draggable-auto-grid";
import { KPICard } from "./kpi-card";
import { Section } from "./section";
import { REVENUE_GROUPS } from "@/features/telecom/lib/revenue-groups";
import { useWidgetRegistry } from "@/features/data-formulator/core/widget-registry";
import { buildOption } from "@/features/data-formulator/core/chart-options";

// Custom data-formulator widgets render through the shared telecom EChart
// surface (OffscreenCanvas worker + tree-shaken core, with an echarts-for-react
// fallback). Lazy-loaded so the chart code stays out of the initial route JS.
const ReactEChartsWidget = dynamic(
  () => import("./echart").then((m) => ({ default: m.EChart })),
  { ssr: false },
);

const ChartSkeleton = ({ h = "h-48" }: { h?: string }) => (
  <div className={`${h} rounded-xl bg-muted/40 animate-pulse`} />
);

const AmountPieChart = dynamic(
  () =>
    import("./amount-pie-chart").then((m) => ({ default: m.AmountPieChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

const CanalShareChart = dynamic(
  () =>
    import("./canal-share-chart").then((m) => ({ default: m.CanalShareChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

const DailyTrendChart = dynamic(
  () =>
    import("./daily-trend-chart").then((m) => ({ default: m.DailyTrendChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

const HourlyChart = dynamic(
  () => import("./hourly-chart").then((m) => ({ default: m.HourlyChart })),
  { ssr: false, loading: () => <ChartSkeleton h="h-56" /> },
);

const StatusDonut = dynamic(
  () => import("./status-donut").then((m) => ({ default: m.StatusDonut })),
  { ssr: false, loading: () => <ChartSkeleton h="h-32" /> },
);

const SuccessRateTrendChart = dynamic(
  () =>
    import("./success-rate-trend-chart").then((m) => ({
      default: m.SuccessRateTrendChart,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

const OVERVIEW_CARD_ORDER_KEY = "telecom-overview-card-order-v1";

function sortCardsBySavedOrder(
  cards: DashboardCardItem[],
  savedOrder: string[],
): DashboardCardItem[] {
  const byId = new Map(cards.map((card) => [card.id, card]));

  const ordered = savedOrder
    .map((id) => byId.get(id))
    .filter(Boolean) as DashboardCardItem[];

  const missing = cards.filter((card) => !savedOrder.includes(card.id));

  return [...ordered, ...missing];
}

function readSavedCardOrder(): string[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const saved = localStorage.getItem(OVERVIEW_CARD_ORDER_KEY);
    return saved ? (JSON.parse(saved) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCardOrder(order: string[]) {
  try {
    localStorage.setItem(OVERVIEW_CARD_ORDER_KEY, JSON.stringify(order));
  } catch {}
}

function ExportToggle({
  checked,
  onToggle,
  label = "Exporter",
}: {
  checked: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors",
        checked
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 items-center justify-center rounded border",
          checked ? "border-primary bg-primary" : "border-border",
        )}
      >
        {checked && (
          <svg
            aria-hidden="true"
            viewBox="0 0 10 10"
            className="h-2.5 w-2.5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

export const OverviewTab = memo(function OverviewTab({
  kpi,
  canals,
  hourly,
  statusData,
  forecast = [],
  m,
  selectedKpis,
  toggleKpi,
  selectedOverviewSections,
  toggleOverviewSection,
  fetchDailyTrend,
}: {
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  forecast?: ForecastPoint[];
  m: Types.ColumnMapping;
  selectedKpis: Set<keyof Types.KPISummary>;
  toggleKpi: (key: keyof Types.KPISummary) => void;
  selectedOverviewSections: Set<Types.OverviewExportSectionKey>;
  toggleOverviewSection: (key: Types.OverviewExportSectionKey) => void;
  fetchDailyTrend: (m: Types.ColumnMapping) => Promise<Types.DailyTrendRow[]>;
}) {
  const [cardOrder, setCardOrder] = useState<string[]>(readSavedCardOrder);

  const insights = useMemo(
    () =>
      kpi ? computeAIInsights(kpi, canals, hourly, statusData).slice(0, 3) : [],
    [kpi, canals, hourly, statusData],
  );

  const revenueGroupData = useMemo(() => {
    return Object.entries(REVENUE_GROUPS).map(([name, { keys, color }]) => {
      const matching = canals.filter((c) => keys.includes(c.key));
      const total = matching.reduce((s, c) => s + c.total, 0);
      const success = matching.reduce((s, c) => s + c.success, 0);
      const amount = matching.reduce((s, c) => s + c.amount, 0);
      const rate = total > 0 ? (success / total) * 100 : 0;
      return { name, color, total, success, amount, rate };
    });
  }, [canals]);

  const defaultCards = useMemo<DashboardCardItem[]>(
    () => [
      {
        id: "status",
        size: "sm",
        node: (
          <Section
            title="Répartition des Statuts"
            icon={<Activity className="w-4 h-4" />}
            action={
              <ExportToggle
                checked={selectedOverviewSections.has("status")}
                onToggle={() => toggleOverviewSection("status")}
              />
            }
          >
            <StatusDonut
              data={statusData}
              total={kpi?.totalTransactions ?? 0}
            />

            <div className="mt-3 space-y-1.5">
              {statusData.map((s) => (
                <div
                  key={s.status}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-none"
                      style={{
                        background: STATUS_COLORS[s.status] ?? "#6b7280",
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {s.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {fmtN(s.count)}
                    </span>
                    <span className="text-muted-foreground tabular-nums w-12 text-right">
                      {fmtPct((s.count / (kpi?.totalTransactions || 1)) * 100)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ),
      },
      {
        id: "hourly",
        size: "lg",
        node: (
          <Section
            title="Distribution Horaire des Transactions"
            icon={<Clock className="w-4 h-4" />}
            badge={
              forecast.length > 0 ? (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30">
                  IA
                </span>
              ) : null
            }
            action={
              <ExportToggle
                checked={selectedOverviewSections.has("hourly")}
                onToggle={() => toggleOverviewSection("hourly")}
              />
            }
          >
            <HourlyChart data={hourly} forecast={forecast} />
          </Section>
        ),
      },
      {
        id: "canal-share",
        size: "md",
        node: (
          <Section
            title="Part des Transactions par Groupe"
            icon={<Layers className="w-4 h-4" />}
            action={
              <ExportToggle
                checked={selectedOverviewSections.has("canalShare")}
                onToggle={() => toggleOverviewSection("canalShare")}
              />
            }
          >
            <CanalShareChart canals={canals} />
          </Section>
        ),
      },
      {
        id: "canal-amount",
        size: "md",
        node: (
          <Section
            title="Revenue per Group"
            icon={<TrendingUp className="w-4 h-4" />}
            action={
              <ExportToggle
                checked={selectedOverviewSections.has("canalAmount")}
                onToggle={() => toggleOverviewSection("canalAmount")}
              />
            }
          >
            <AmountPieChart canals={canals} />
          </Section>
        ),
      },
      {
        id: "success-rate",
        size: "full",
        node: (
          <Section
            title="Taux de Réussite par Groupe"
            icon={<CheckCircle2 className="w-4 h-4" />}
            action={
              <ExportToggle
                checked={selectedOverviewSections.has("successRate")}
                onToggle={() => toggleOverviewSection("successRate")}
              />
            }
          >
            <SuccessRateTrendChart canals={canals} />
          </Section>
        ),
      },
      {
        id: "canal-table",
        size: "full",
        node: (
          <Section
            title="KPI Summary by Product"
            icon={<BarChart2 className="w-4 h-4" />}
            action={
              <ExportToggle
                checked={selectedOverviewSections.has("canalTable")}
                onToggle={() => toggleOverviewSection("canalTable")}
              />
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      "Product",
                      "Total",
                      "Réussie",
                      "Échec",
                      "Instance",
                      "Annulation",
                      "Confirmé",
                      "Taux",
                      "Montant (TND)",
                      "Moy (TND)",
                      "Part",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {canals.map((c) => {
                    const cfg = CANAL_CONFIG[c.key];
                    const Icon = cfg.icon;

                    return (
                      <tr
                        key={c.key}
                        className="border-b border-border hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Icon
                              className={cn("w-3.5 h-3.5 flex-none", cfg.color)}
                            />
                            <span className="text-foreground font-medium whitespace-nowrap">
                              {cfg.shortLabel}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-foreground font-semibold tabular-nums">
                          {fmtN(c.total)}
                        </td>

                        <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {fmtN(c.success)}
                        </td>

                        <td className="px-3 py-2.5 text-red-600 dark:text-red-400 tabular-nums">
                          {fmtN(c.declined)}
                        </td>

                        <td className="px-3 py-2.5 text-amber-600 dark:text-amber-400 tabular-nums">
                          {fmtN(c.instance)}
                        </td>

                        <td className="px-3 py-2.5 text-violet-600 dark:text-violet-400 tabular-nums">
                          {fmtN(c.refund)}
                        </td>

                        <td className="px-3 py-2.5 text-blue-600 dark:text-blue-400 tabular-nums">
                          {fmtN(c.submitted)}
                        </td>

                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "font-bold tabular-nums",
                              c.successRate >= 95
                                ? "text-emerald-600 dark:text-emerald-400"
                                : c.successRate >= 80
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400",
                            )}
                          >
                            {fmtPct(c.successRate)}
                          </span>
                        </td>

                        <td className="px-3 py-2.5 text-foreground tabular-nums">
                          {fmtAmount(c.amount)}
                        </td>

                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                          {fmtAmount(c.avgAmount)}
                        </td>

                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                          {fmtPct(c.share)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        ),
      },
      {
        id: "daily-trend",
        size: "full",
        node: (
          <Section
            title="Daily Trend"
            icon={<TrendingUp className="w-4 h-4" />}
            action={
              <ExportToggle
                checked={selectedOverviewSections.has("dailyTrend")}
                onToggle={() => toggleOverviewSection("dailyTrend")}
              />
            }
          >
            <DailyTrendChart fetchDailyTrend={fetchDailyTrend} m={m} />
          </Section>
        ),
      },
    ],
    [
      statusData,
      kpi,
      selectedOverviewSections,
      toggleOverviewSection,
      forecast,
      hourly,
      canals,
      fetchDailyTrend,
      m,
    ],
  );

  const { getWidgetsForPage } = useWidgetRegistry();
  const widgets = getWidgetsForPage("telecom-overview");

  const widgetCards: DashboardCardItem[] = useMemo(() => {
    return widgets.map((w) => ({
      id: w.id,
      size: w.size,
      node: (
        <Section title={w.title} icon={<BarChart2 className="w-4 h-4" />}>
          {w.result && w.result.data.length > 0 ? (
            <ReactEChartsWidget
              option={buildOption(w.chartSpec, w.result.data) ?? {}}
              height={240}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">
              No data available
            </div>
          )}
        </Section>
      ),
    }));
  }, [widgets]);

  const cards = useMemo(
    () => sortCardsBySavedOrder([...defaultCards, ...widgetCards], cardOrder),
    [defaultCards, widgetCards, cardOrder],
  );

  return (
    <div className="space-y-6">
      {kpi && <AlertBanner kpi={kpi} canals={canals} />}

      {insights.length > 0 && (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">
                Assistant métier
              </span>
              <span className="text-[10px] text-muted-foreground">
                · {insights.length} contrôles — voir l&apos;onglet Config &amp;
                IA pour l&apos;analyse complète
              </span>
            </div>
            <ExportToggle
              checked={selectedOverviewSections.has("assistant")}
              onToggle={() => toggleOverviewSection("assistant")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {insights.map((ins) => {
              const sevColor =
                ins.severity === "critical"
                  ? "text-red-700 border-red-200 bg-red-50 dark:text-red-300 dark:border-red-500/20 dark:bg-red-500/8"
                  : ins.severity === "warning"
                    ? "text-amber-700 border-amber-200 bg-amber-50 dark:text-amber-300 dark:border-amber-500/20 dark:bg-amber-500/8"
                    : ins.severity === "positive"
                      ? "text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-300 dark:border-emerald-500/20 dark:bg-emerald-500/8"
                      : "text-blue-700 border-blue-200 bg-blue-50 dark:text-blue-300 dark:border-blue-500/20 dark:bg-blue-500/8";

              return (
                <div
                  key={ins.id}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 space-y-0.5",
                    sevColor,
                  )}
                >
                  <div className="text-[11px] font-semibold leading-tight">
                    {ins.title}
                  </div>
                  <div className="text-[10px] opacity-70 leading-relaxed line-clamp-2">
                    {ins.body}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {kpi ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            label="Transactions Totales"
            delay={0}
            value={<AnimCounter value={kpi.totalTransactions} />}
            sub="volume total traité"
            icon={
              <Zap className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            }
            color="border-indigo-200 dark:border-indigo-500/30 bg-linear-to-br from-indigo-50 to-white dark:from-indigo-500/10 dark:to-transparent"
            size="lg"
            kpiKey="totalTransactions"
            selected={selectedKpis.has("totalTransactions")}
            onToggle={() => toggleKpi("totalTransactions")}
          />

          <KPICard
            label="Réussies"
            delay={0.06}
            value={<AnimCounter value={kpi.successCount} />}
            sub={`${fmtPct(kpi.successRate)} taux de réussite`}
            trendValue={fmtPct(kpi.successRate)}
            trend={kpi.successRate >= 90 ? "up" : "down"}
            icon={
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            }
            color="border-emerald-200 dark:border-emerald-500/30 bg-linear-to-br from-emerald-50 to-white dark:from-emerald-500/10 dark:to-transparent"
            size="lg"
            kpiKey="successCount"
            selected={selectedKpis.has("successCount")}
            onToggle={() => toggleKpi("successCount")}
          />

          <KPICard
            label="Échec (Refusé)"
            delay={0.12}
            value={<AnimCounter value={kpi.declinedCount} />}
            sub={`${fmtPct(
              (kpi.declinedCount / kpi.totalTransactions) * 100,
            )} du total`}
            trendValue={fmtPct(
              (kpi.declinedCount / kpi.totalTransactions) * 100,
            )}
            trend={kpi.declinedCount === 0 ? "up" : "down"}
            icon={
              <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
            }
            color="border-red-200 dark:border-red-500/30 bg-linear-to-br from-red-50 to-white dark:from-red-500/10 dark:to-transparent"
            size="lg"
            kpiKey="declinedCount"
            selected={selectedKpis.has("declinedCount")}
            onToggle={() => toggleKpi("declinedCount")}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={`overview-skeleton-${i}`}
              className="rounded-2xl border border-muted p-4 space-y-3 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="w-7 h-7 rounded-xl bg-muted" />
              </div>
              <div className="h-7 w-24 rounded bg-muted" />
              <div className="h-2.5 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {kpi ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard
            label="Instance"
            delay={0.22}
            value={<AnimCounter value={kpi.instanceCount} />}
            icon={
              <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            }
            color="border-amber-200/80 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5"
            size="sm"
            kpiKey="instanceCount"
            selected={selectedKpis.has("instanceCount")}
            onToggle={() => toggleKpi("instanceCount")}
          />

          <KPICard
            label="Annulation (Remboursement)"
            delay={0.26}
            value={<AnimCounter value={kpi.refundCount} />}
            icon={
              <RefreshCw className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
            }
            color="border-violet-200/80 dark:border-violet-500/20 bg-violet-50/60 dark:bg-violet-500/5"
            size="sm"
            kpiKey="refundCount"
            selected={selectedKpis.has("refundCount")}
            onToggle={() => toggleKpi("refundCount")}
          />

          <KPICard
            label="Confirmé"
            delay={0.3}
            value={<AnimCounter value={kpi.submittedCount} />}
            icon={
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            }
            color="border-blue-200/80 dark:border-blue-500/20 bg-blue-50/60 dark:bg-blue-500/5"
            size="sm"
            kpiKey="submittedCount"
            selected={selectedKpis.has("submittedCount")}
            onToggle={() => toggleKpi("submittedCount")}
          />

          <KPICard
            label="Abonnés uniques"
            delay={0.34}
            value={<AnimCounter value={kpi.uniqueCustomers} />}
            icon={
              <Activity className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
            }
            color="border-sky-200/80 dark:border-sky-500/20 bg-sky-50/60 dark:bg-sky-500/5"
            size="sm"
            kpiKey="uniqueCustomers"
            selected={selectedKpis.has("uniqueCustomers")}
            onToggle={() => toggleKpi("uniqueCustomers")}
          />

          <KPICard
            label="Traitement moy."
            delay={0.38}
            value={fmtDuration(kpi.avgProcessingMs)}
            sub={`Heure de pointe ${kpi.peakHour}:00`}
            icon={
              <Zap className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
            }
            color="border-cyan-200/80 dark:border-cyan-500/20 bg-cyan-50/60 dark:bg-cyan-500/5"
            size="sm"
            kpiKey="avgProcessingMs"
            selected={selectedKpis.has("avgProcessingMs")}
            onToggle={() => toggleKpi("avgProcessingMs")}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={`kpi-skeleton-${i}`}
              className="rounded-2xl border border-muted p-4 space-y-2 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-2.5 w-14 rounded bg-muted" />
                <div className="w-5 h-5 rounded-lg bg-muted" />
              </div>
              <div className="h-5 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {canals.length > 0 && (
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-5 gap-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.07, delayChildren: 0.05 },
            },
          }}
        >
          {revenueGroupData.map(({ name, color, total, amount, rate }) => (
            <motion.div
              key={name}
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { type: "spring", stiffness: 320, damping: 24 },
                },
              }}
              whileHover={{ y: -2, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground truncate leading-tight">
                  {name}
                </span>
                <div className="flex items-center gap-2">
                  <ExportToggle
                    checked={selectedOverviewSections.has("revenueGroups")}
                    onToggle={() => toggleOverviewSection("revenueGroups")}
                    label=""
                  />
                  <span
                    className="w-3 h-3 rounded-full flex-none shadow-sm ring-2 ring-border"
                    style={{ background: color }}
                  />
                </div>
              </div>

              <div className="text-2xl font-black text-foreground tabular-nums leading-none">
                {fmtN(total)}
              </div>

              <div className="space-y-1.5 mt-auto">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    {fmtAmount(amount)} TND
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      rate >= 90
                        ? "text-emerald-600 dark:text-emerald-400"
                        : rate >= 70
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {fmtPct(rate)}
                  </span>
                </div>

                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      rate >= 90
                        ? "bg-emerald-500"
                        : rate >= 70
                          ? "bg-amber-500"
                          : "bg-red-500",
                    )}
                    style={{ width: `${Math.min(rate, 100)}%` }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <DraggableAutoGrid
        items={cards}
        onChange={(nextCards) => {
          const nextOrder = nextCards.map((card) => card.id);
          setCardOrder(nextOrder);
          saveCardOrder(nextOrder);
        }}
      />
    </div>
  );
});
