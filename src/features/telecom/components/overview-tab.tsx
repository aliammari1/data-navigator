"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart2,
  CheckCircle2,
  Clock,
  GripVertical,
  Layers,
  RefreshCw,
  Sparkles,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import GridLayout, { type Layout, type LayoutItem, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { cn } from "@/lib/utils";
import { type ForecastPoint } from "@/lib/forecast-onnx";
import { computeAIInsights } from "@/features/telecom/lib/insights";
import { fmtAmount, fmtDuration, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { CANAL_CONFIG, STATUS_COLORS } from "@/features/telecom/lib/canal-config";
import type * as Types from "@/features/telecom/types";
import { AlertBanner } from "./alert-banner";
import { AnimCounter } from "./anim-counter";
import { CanalShareChart } from "./canal-share-chart";
import { DailyTrendChart } from "./daily-trend-chart";
import { HourlyChart } from "./hourly-chart";
import { KPICard } from "./kpi-card";
import { Section } from "./section";
import { StatusDonut } from "./status-donut";
import { SuccessRateTrendChart } from "./success-rate-trend-chart";
import { AmountPieChart } from "./amount-pie-chart";

const OVERVIEW_LAYOUT_STORAGE_KEY = "telecom-overview-layout-v2";

const REVENUE_GROUPS: Record<string, { keys: Types.CanalKey[]; color: string }> = {
  "Bill Payment": { keys: ["bill_payment"], color: "#89b4fa" },
  Recharge: {
    keys: [
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
    ],
    color: "#a6e3a1",
  },
  "Voucher For Payment": { keys: ["voucher_for_payment"], color: "#94e2d5" },
  "Credit Transfer": { keys: ["credit_transfer"], color: "#fab387" },
  "Voucher For Recharge": { keys: ["voucher_convergent"], color: "#cba6f7" },
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const OVERVIEW_DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "status", x: 0, y: 0, w: 4, h: 10 },
  { i: "hourly", x: 4, y: 0, w: 8, h: 10 },
  { i: "canal-share", x: 0, y: 10, w: 6, h: 9 },
  { i: "canal-amount", x: 6, y: 10, w: 6, h: 9 },
  { i: "success-rate", x: 0, y: 19, w: 12, h: 9 },
  { i: "canal-table", x: 0, y: 28, w: 12, h: 11 },
  { i: "daily-trend", x: 0, y: 39, w: 12, h: 9 },
];

const defaultIds = new Set(OVERVIEW_DEFAULT_LAYOUT.map((item) => item.i));

function normalizeLayout(layout: LayoutItem[]): LayoutItem[] {
  const byId = new Map(layout.map((item) => [item.i, item]));
  return OVERVIEW_DEFAULT_LAYOUT.map((fallback) => {
    const saved = byId.get(fallback.i);
    if (!saved) return fallback;
    const x = clamp(safeNum(saved.x), 0, 11);
    return {
      ...fallback,
      ...saved,
      x,
      y: Math.max(0, safeNum(saved.y)),
      w: clamp(safeNum(saved.w), 1, 12 - x),
      h: Math.max(4, safeNum(saved.h)),
    };
  }).filter((item) => defaultIds.has(item.i));
}

export function OverviewTab({
  kpi,
  canals,
  hourly,
  statusData,
  forecast = [],
  m,
  selectedKpis,
  toggleKpi,
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
  fetchDailyTrend: (m: Types.ColumnMapping) => Promise<Types.DailyTrendRow[]>;
}) {
  const insights = useMemo(
    () =>
      kpi ? computeAIInsights(kpi, canals, hourly, [], statusData).slice(0, 3) : [],
    [kpi, canals, hourly, statusData],
  );

  const {
    width: gridWidth,
    mounted: gridMeasured,
    containerRef: gridContainerRef,
  } = useContainerWidth({ measureBeforeMount: true, initialWidth: 1200 });

  const [gridLayout, setGridLayout] = useState<LayoutItem[]>(() => {
    if (typeof localStorage === "undefined") return OVERVIEW_DEFAULT_LAYOUT;
    try {
      const saved = localStorage.getItem(OVERVIEW_LAYOUT_STORAGE_KEY);
      return saved ? normalizeLayout(JSON.parse(saved) as LayoutItem[]) : OVERVIEW_DEFAULT_LAYOUT;
    } catch {
      return OVERVIEW_DEFAULT_LAYOUT;
    }
  });

  const [layoutLocked, setLayoutLocked] = useState(false);
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactGrid = gridMeasured && gridWidth < 900;

  let compactY = 0;
  const renderedLayout = compactGrid
    ? OVERVIEW_DEFAULT_LAYOUT.map((item) => {
        const next = { ...item, x: 0, y: compactY, w: 1 };
        compactY += item.h;
        return next;
      })
    : gridLayout;

  useEffect(() => {
    return () => {
      if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
    };
  }, []);

  function handleLayoutChange(newLayout: Layout) {
    if (compactGrid) return;
    const next = normalizeLayout([...newLayout]);
    setGridLayout(next);
    if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
    layoutSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(OVERVIEW_LAYOUT_STORAGE_KEY, JSON.stringify(next));
      } catch {}
    }, 250);
  }

  function resetOverviewLayout() {
    setGridLayout(OVERVIEW_DEFAULT_LAYOUT);
    try {
      localStorage.removeItem(OVERVIEW_LAYOUT_STORAGE_KEY);
    } catch {}
  }

  return (
    <div className="space-y-6">
      {kpi && <AlertBanner kpi={kpi} canals={canals} />}

      {/* AI insight strip */}
      {insights.length > 0 && (
        <div className="rounded-2xl border border-indigo-500/15 bg-indigo-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              Analyses IA
            </span>
            <span className="text-[10px] text-muted-foreground">
              · {insights.length} résultats — voir l&apos;onglet Config &amp; IA pour l&apos;analyse
              complète
            </span>
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
                  className={cn("rounded-xl border px-3 py-2.5 space-y-0.5", sevColor)}
                >
                  <div className="text-[11px] font-semibold leading-tight">{ins.title}</div>
                  <div className="text-[10px] opacity-70 leading-relaxed line-clamp-2">
                    {ins.body}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Primary KPIs */}
      {kpi ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            label="Transactions Totales"
            delay={0}
            value={<AnimCounter value={kpi.totalTransactions} />}
            sub="volume total traité"
            icon={<Zap className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />}
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
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />}
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
            sub={fmtPct((kpi.declinedCount / kpi.totalTransactions) * 100) + " du total"}
            trendValue={fmtPct((kpi.declinedCount / kpi.totalTransactions) * 100)}
            trend={kpi.declinedCount === 0 ? "up" : "down"}
            icon={<XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />}
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
            <div key={i} className="rounded-2xl border border-muted p-4 space-y-3 animate-pulse">
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

      {/* Secondary KPIs */}
      {kpi ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard
            label="Instance"
            delay={0.22}
            value={<AnimCounter value={kpi.instanceCount} />}
            icon={<Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />}
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
            icon={<RefreshCw className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />}
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
            icon={<CheckCircle2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />}
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
            icon={<Activity className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />}
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
            icon={<Zap className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />}
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
            <div key={i} className="rounded-2xl border border-muted p-4 space-y-2 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-2.5 w-14 rounded bg-muted" />
                <div className="w-5 h-5 rounded-lg bg-muted" />
              </div>
              <div className="h-5 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* 5-Category Overview */}
      {canals.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.entries(REVENUE_GROUPS).map(([name, { keys, color }]) => {
            const matching = canals.filter((c) => keys.includes(c.key));
            const total = matching.reduce((s, c) => s + c.total, 0);
            const success = matching.reduce((s, c) => s + c.success, 0);
            const amount = matching.reduce((s, c) => s + c.amount, 0);
            const rate = total > 0 ? (success / total) * 100 : 0;
            return (
              <div
                key={name}
                className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground truncate leading-tight">
                    {name}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full flex-none shadow-sm ring-2 ring-border"
                    style={{ background: color }}
                  />
                </div>
                <div className="text-2xl font-black text-foreground tabular-nums leading-none">
                  {fmtN(total)}
                </div>
                <div className="space-y-1.5 mt-auto">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">{fmtAmount(amount)} TND</span>
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
              </div>
            );
          })}
        </div>
      )}

      {/* Grid layout controls */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className={cn(
            "text-[10px] px-2.5 py-1 rounded-lg border transition-colors",
            layoutLocked
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setLayoutLocked((v) => !v)}
        >
          {layoutLocked ? "Mise en page verrouillée" : "Verrouiller mise en page"}
        </button>
        <button
          type="button"
          className="text-[10px] px-2.5 py-1 rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
          onClick={resetOverviewLayout}
        >
          Réinitialiser
        </button>
      </div>

      {/* Draggable chart grid */}
      <div ref={gridContainerRef} className="min-w-0">
        {gridMeasured && gridWidth > 0 && (
          <GridLayout
            layout={renderedLayout}
            gridConfig={{
              cols: compactGrid ? 1 : 12,
              rowHeight: 44,
              margin: compactGrid ? ([0, 16] as const) : ([16, 16] as const),
              containerPadding: [0, 0] as const,
            }}
            dragConfig={{
              bounded: true,
              cancel: "button,a,input,textarea,select,[data-no-drag]",
              enabled: !layoutLocked && !compactGrid,
              handle: ".drag-handle",
              threshold: 8,
            }}
            resizeConfig={{
              enabled: !layoutLocked && !compactGrid,
              handles: ["se"],
            }}
            width={Math.max(320, Math.floor(gridWidth))}
            onLayoutChange={handleLayoutChange}
            className="relative"
          >
            <div key="status" className="overflow-hidden">
              <Section
                title="Répartition des Statuts"
                icon={<Activity className="w-4 h-4" />}
                badge={
                  <span className="drag-handle cursor-grab touch-none active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-1">
                    <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                }
              >
                <StatusDonut data={statusData} total={kpi?.totalTransactions ?? 0} />
                <div className="mt-3 space-y-1.5">
                  {statusData.map((s) => (
                    <div key={s.status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-none"
                          style={{ background: STATUS_COLORS[s.status] ?? "#6b7280" }}
                        />
                        <span className="text-xs text-muted-foreground">{s.status}</span>
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
            </div>

            <div key="hourly" className="overflow-hidden">
              <Section
                title="Distribution Horaire des Transactions"
                icon={<Clock className="w-4 h-4" />}
                badge={
                  <span className="flex items-center gap-1.5">
                    {forecast.length > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30">
                        IA
                      </span>
                    )}
                    <span className="drag-handle cursor-grab touch-none active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-1">
                      <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </span>
                }
              >
                <HourlyChart data={hourly} forecast={forecast} />
              </Section>
            </div>

            <div key="canal-share" className="overflow-hidden">
              <Section
                title="Part des Transactions par Groupe"
                icon={<Layers className="w-4 h-4" />}
                badge={
                  <span className="drag-handle cursor-grab touch-none active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-1">
                    <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                }
              >
                <CanalShareChart canals={canals} />
              </Section>
            </div>

            <div key="success-rate" className="overflow-hidden">
              <Section
                title="Taux de Réussite par Groupe"
                icon={<CheckCircle2 className="w-4 h-4" />}
                badge={
                  <span className="drag-handle cursor-grab touch-none active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-1">
                    <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                }
              >
                <SuccessRateTrendChart canals={canals} />
              </Section>
            </div>

            <div key="canal-amount" className="overflow-hidden">
              <Section
                title="Revenue per Group"
                icon={<TrendingUp className="w-4 h-4" />}
                badge={
                  <span className="drag-handle cursor-grab touch-none active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-1">
                    <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                }
              >
                <AmountPieChart canals={canals} />
              </Section>
            </div>

            <div key="canal-table" className="overflow-hidden">
              <Section
                title="KPI Summary by Product"
                icon={<BarChart2 className="w-4 h-4" />}
                badge={
                  <span className="drag-handle cursor-grab touch-none active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-1">
                    <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
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
                                <Icon className={cn("w-3.5 h-3.5 flex-none", cfg.color)} />
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
                            <td className="px-3 py-2.5 text-muted-foreground tabular-nums font-mono">
                              {fmtAmount(c.amount)}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground tabular-nums font-mono">
                              {fmtAmount(c.avgAmount)}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full", cfg.bg.replace("/10", "/60"))}
                                    style={{
                                      width: `${clamp(c.share, 0, 100)}%`,
                                      transition: "width 0.7s",
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {fmtPct(c.share)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-bold">
                        <td className="px-3 py-3 text-xs text-foreground">TOTAL</td>
                        <td className="px-3 py-3 text-foreground tabular-nums">
                          {fmtN(canals.reduce((a, c) => a + c.total, 0))}
                        </td>
                        <td className="px-3 py-3 text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {fmtN(canals.reduce((a, c) => a + c.success, 0))}
                        </td>
                        <td className="px-3 py-3 text-red-600 dark:text-red-400 tabular-nums">
                          {fmtN(canals.reduce((a, c) => a + c.declined, 0))}
                        </td>
                        <td className="px-3 py-3 text-amber-600 dark:text-amber-400 tabular-nums">
                          {fmtN(canals.reduce((a, c) => a + c.instance, 0))}
                        </td>
                        <td className="px-3 py-3 text-violet-600 dark:text-violet-400 tabular-nums">
                          {fmtN(canals.reduce((a, c) => a + c.refund, 0))}
                        </td>
                        <td className="px-3 py-3 text-blue-600 dark:text-blue-400 tabular-nums">
                          {fmtN(canals.reduce((a, c) => a + c.submitted, 0))}
                        </td>
                        <td className="px-3 py-3 text-foreground tabular-nums">
                          {fmtPct(
                            (canals.reduce((a, c) => a + c.success, 0) /
                              Math.max(1, canals.reduce((a, c) => a + c.total, 0))) *
                              100,
                          )}
                        </td>
                        <td className="px-3 py-3 text-foreground font-mono tabular-nums">
                          {fmtAmount(canals.reduce((a, c) => a + c.amount, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Section>
            </div>

            <div key="daily-trend" className="overflow-hidden">
              <Section
                title="Tendance Multi-Jours"
                icon={<TrendingUp className="w-4 h-4" />}
                badge={
                  <span className="drag-handle cursor-grab touch-none active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-1">
                    <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                }
                collapsible
              >
                <DailyTrendChart m={m} fetchDailyTrend={fetchDailyTrend} />
              </Section>
            </div>
          </GridLayout>
        )}
      </div>
    </div>
  );
}
