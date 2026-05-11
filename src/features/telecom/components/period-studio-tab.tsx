"use client";

import {
  Activity,
  Brain,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Layers,
  RefreshCw,
  Send,
  Tag,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fmtAmount,
  fmtCompact,
  fmtN,
  fmtPct,
} from "@/features/telecom/lib/format";
import {
  type BrandRow,
  fetchAvailableDays,
  fetchBrandBreakdown,
  fetchPeriodKPI,
  type PeriodKPI,
} from "@/features/telecom/lib/period-queries";
import type { ColumnMapping } from "@/features/telecom/types";
import { AiAgentPanel } from "./ai-agent-panel";
import { AnomalyDetectorPanel } from "./anomaly-detector-panel";
import { PeriodComparePanel } from "./period-compare-panel";
import {
  defaultPeriod,
  PeriodFilterBar,
  type PeriodValue,
} from "./period-filter-bar";
import { SubStatusPanel } from "./sub-status-panel";
import { TopAccountsLeaderboard } from "./top-accounts-leaderboard";

function KCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase font-semibold tracking-wide opacity-70">
          {label}
        </span>
      </div>
      <div className="text-2xl font-black tabular-nums leading-none">
        {value}
      </div>
      {sub && (
        <div className="text-[10px] mt-1 opacity-70 tabular-nums">{sub}</div>
      )}
    </div>
  );
}

export function PeriodStudioTab({
  table,
  mapping,
  initialPeriod,
}: {
  table: string;
  mapping: ColumnMapping;
  initialPeriod?: PeriodValue;
}) {
  const [period, setPeriod] = useState<PeriodValue>(
    initialPeriod ?? defaultPeriod(),
  );
  const [appliedPeriod, setAppliedPeriod] = useState<PeriodValue | null>(null);
  const [kpi, setKpi] = useState<PeriodKPI | null>(null);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<
    "overview" | "compare" | "leaderboard" | "anomaly" | "brands" | "ai"
  >("overview");

  useEffect(() => {
    if (!table || !mapping?.transactionDate) return;
    fetchAvailableDays(table, mapping).then((nextDays) => {
      setDays(nextDays);
      if (nextDays.length > 0 && !appliedPeriod) {
        const to = nextDays[0];
        const from = nextDays[Math.min(nextDays.length - 1, 6)];
        const nextPeriod = { from, to };
        setPeriod(nextPeriod);
        setAppliedPeriod(nextPeriod);
      }
    });
  }, [table, mapping, appliedPeriod]);

  useEffect(() => {
    if (!table || !appliedPeriod || !mapping?.transactionDate) return;

    let cancelled = false;

    setLoading(true);

    Promise.all([
      fetchPeriodKPI(table, mapping, appliedPeriod.from, appliedPeriod.to),
      fetchBrandBreakdown(
        table,
        mapping,
        appliedPeriod.from,
        appliedPeriod.to,
        20,
      ),
    ]).then(([k, b]) => {
      if (!cancelled) {
        setKpi(k);
        setBrands(b);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [table, mapping, appliedPeriod]);

  // Compare: B = previous period of identical length.
  const compareInitial = useMemo<{ a: PeriodValue; b: PeriodValue }>(() => {
    const a = appliedPeriod ?? period;
    const fromD = new Date(a.from);
    const toD = new Date(a.to);
    const days = Math.max(
      0,
      Math.round((toD.getTime() - fromD.getTime()) / 86400000),
    );
    const bTo = new Date(fromD);
    bTo.setDate(bTo.getDate() - 1);
    const bFrom = new Date(bTo);
    bFrom.setDate(bFrom.getDate() - days);
    return {
      a,
      b: {
        from: bFrom.toISOString().slice(0, 10),
        to: bTo.toISOString().slice(0, 10),
      },
    };
  }, [appliedPeriod, period]);

  const tabs: Array<{
    key: typeof tab;
    label: string;
    icon: React.ElementType;
  }> = [
    { key: "overview", label: "Vue période", icon: Layers },
    { key: "compare", label: "Comparaison", icon: TrendingUp },
    { key: "leaderboard", label: "Top abonnés", icon: Users },
    { key: "anomaly", label: "Anomalies", icon: Activity },
    { key: "brands", label: "Brands", icon: Tag },
    { key: "ai", label: "Agent IA", icon: Brain },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
        {[
          {
            label: "1. Choisir",
            detail:
              days.length > 0
                ? `${days.length} jour(s) détecté(s)`
                : "Chargement des dates",
            icon: CalendarDays,
            done: days.length > 0,
          },
          {
            label: "2. Appliquer",
            detail: appliedPeriod
              ? `${appliedPeriod.from} → ${appliedPeriod.to}`
              : "Sélectionnez une période",
            icon: ClipboardCheck,
            done: Boolean(appliedPeriod),
          },
          {
            label: "3. Diagnostiquer",
            detail: kpi ? `${fmtPct(kpi.successRate)} réussite` : "KPI période",
            icon: Activity,
            done: Boolean(kpi),
          },
          {
            label: "4. Agir",
            detail: "Comparer, anomalies, top comptes, brands",
            icon: Brain,
            done: Boolean(kpi),
          },
        ].map((step) => (
          <div
            key={step.label}
            className={`rounded-xl border p-3 ${
              step.done
                ? "border-indigo-500/25 bg-indigo-500/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <step.icon
                className={`w-3.5 h-3.5 ${
                  step.done
                    ? "text-indigo-600 dark:text-indigo-300"
                    : "text-muted-foreground"
                }`}
              />
              <span className="text-[10px] font-semibold text-muted-foreground">
                {step.label}
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground truncate">
              {step.detail}
            </div>
          </div>
        ))}
      </div>

      <PeriodFilterBar
        value={period}
        onChange={setPeriod}
        availableDays={days}
        busy={loading}
        onApply={() => setAppliedPeriod(period)}
      />

      {!appliedPeriod && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-xs text-muted-foreground">
          Sélectionnez une période et cliquez{" "}
          <strong className="text-foreground">Appliquer</strong>. Aucun calcul
          automatique — vous gardez le contrôle.
        </div>
      )}

      <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-xl p-1 overflow-x-auto">
        {tabs.map((t) => {
          const I = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 min-w-25 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-indigo-600 text-white shadow"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <I className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {appliedPeriod && tab === "overview" && (
        <div className="space-y-4">
          {kpi ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <KCard
                label="Total tx"
                value={fmtCompact(kpi.total)}
                sub={`${fmtN(kpi.total)}`}
                icon={Zap}
                tone="border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100"
              />
              <KCard
                label="Réussite"
                value={fmtPct(kpi.successRate)}
                sub={`${fmtCompact(kpi.success)} tx`}
                icon={CheckCircle2}
                tone="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
              />
              <KCard
                label="Échec"
                value={fmtCompact(kpi.declined)}
                sub={fmtPct((kpi.declined / Math.max(1, kpi.total)) * 100)}
                icon={XCircle}
                tone="border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
              />
              <KCard
                label="Annulation"
                value={fmtCompact(kpi.refund)}
                icon={RefreshCw}
                tone="border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100"
              />
              <KCard
                label="Confirmé"
                value={fmtCompact(kpi.submitted)}
                icon={Send}
                tone="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100"
              />
              <KCard
                label="Montant"
                value={fmtCompact(kpi.amount)}
                sub={`${fmtAmount(kpi.amount)} TND`}
                icon={TrendingUp}
                tone="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
              />
              <KCard
                label="Abonnés uniques"
                value={fmtN(kpi.uniqueCustomers)}
                icon={Users}
                tone="border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100"
              />
              <KCard
                label="Comptes uniques"
                value={fmtN(kpi.uniqueAccounts)}
                icon={Layers}
                tone="border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100"
              />
              <KCard
                label="Brands actifs"
                value={fmtN(kpi.uniqueBrands)}
                icon={Tag}
                tone="border-pink-200 bg-pink-50 text-pink-900 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-100"
              />
              <KCard
                label="Instance"
                value={fmtCompact(kpi.instance)}
                sub={fmtPct((kpi.instance / Math.max(1, kpi.total)) * 100)}
                icon={Activity}
                tone="border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-100"
              />
              <KCard
                label="Montant moyen"
                value={fmtAmount(kpi.avgAmount)}
                icon={TrendingUp}
                tone="border-lime-200 bg-lime-50 text-lime-900 dark:border-lime-500/30 dark:bg-lime-500/10 dark:text-lime-100"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 text-xs text-muted-foreground">
              Calcul…
            </div>
          )}
          <SubStatusPanel
            table={table}
            mapping={mapping}
            dateFrom={appliedPeriod.from}
            dateTo={appliedPeriod.to}
          />{" "}
        </div>
      )}

      {appliedPeriod && tab === "compare" && (
        <PeriodComparePanel
          table={table}
          mapping={mapping}
          initialA={compareInitial.a}
          initialB={compareInitial.b}
        />
      )}

      {appliedPeriod && tab === "leaderboard" && (
        <TopAccountsLeaderboard
          table={table}
          mapping={mapping}
          dateFrom={appliedPeriod.from}
          dateTo={appliedPeriod.to}
        />
      )}

      {appliedPeriod && tab === "anomaly" && (
        <AnomalyDetectorPanel
          table={table}
          mapping={mapping}
          dateFrom={appliedPeriod.from}
          dateTo={appliedPeriod.to}
        />
      )}

      {appliedPeriod && tab === "ai" && (
        <AiAgentPanel
          table={table}
          mapping={mapping}
          dateFrom={appliedPeriod.from}
          dateTo={appliedPeriod.to}
          onIntent={(intent) => {
            switch (intent.kind) {
              case "show_anomalies":
                setTab("anomaly");
                break;
              case "show_top_accounts":
                setTab("leaderboard");
                break;
              case "show_sub_status":
              case "explain_kpi":
                setTab("overview");
                break;
              case "compare_periods":
                setTab("compare");
                break;
              case "show_brands":
                setTab("brands");
                break;
            }
          }}
        />
      )}

      {appliedPeriod && tab === "brands" && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-pink-500" />
            <span className="text-xs font-semibold">
              Top BRAND_ID — drill par marque (top 20 volume)
            </span>
          </div>
          <div className="max-h-120 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border">
                  {[
                    "Brand ID",
                    "Nom",
                    "Total",
                    "Réussies",
                    "Taux",
                    "Montant",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {brands.map((b) => (
                  <tr
                    key={b.brandId}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2 font-mono text-foreground">
                      {b.brandId}
                    </td>
                    <td className="px-3 py-2 text-foreground truncate max-w-65">
                      {b.brandName}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-foreground">
                      {fmtN(b.total)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtN(b.success)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <span
                        className={
                          b.successRate >= 90
                            ? "text-emerald-600 dark:text-emerald-400"
                            : b.successRate >= 70
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400"
                        }
                      >
                        {fmtPct(b.successRate)}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-foreground">
                      {fmtAmount(b.amount)}
                    </td>
                  </tr>
                ))}
                {brands.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      Aucune marque pour la période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
