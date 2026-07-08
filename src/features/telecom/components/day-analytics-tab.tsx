"use client";

import {
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  RefreshCw,
  Save,
  Trash2,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getCachedTelecomSourceFiles } from "@/features/telecom/lib/analytics-cache";
import {
  type DailyLineageEntry,
  type DailyStat,
  getDailyStat,
  listDailyStats,
  removeDailyStat,
  upsertDailyStat,
} from "@/features/telecom/lib/daily-stats-cache";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  fetchAvailableDays,
  fetchPeriodKPI,
  fetchRowCountForDay,
} from "@/features/telecom/lib/period-queries";
import type { ColumnMapping, LoadedFile } from "@/features/telecom/types";
import { DataLineagePanel } from "./data-lineage-panel";
import { SubStatusPanel } from "./sub-status-panel";
import { TopAccountsLeaderboard } from "./top-accounts-leaderboard";

export function DayAnalyticsTab({
  table,
  mapping,
  fileName,
  loadedFiles,
}: {
  table: string;
  mapping: ColumnMapping;
  fileName: string;
  loadedFiles: LoadedFile[];
}) {
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [savedStats, setSavedStats] = useState<DailyStat[]>([]);
  const [day, setDay] = useState<string>("");
  const [appliedDay, setAppliedDay] = useState<string>("");
  const [stat, setStat] = useState<DailyStat | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!table || !mapping?.transactionDate) return;

    const [dy, ss] = await Promise.all([fetchAvailableDays(table, mapping), listDailyStats()]);

    setAvailableDays(dy);
    setSavedStats(ss);
    setDay((cur) => (cur ? cur : (dy[0] ?? "")));
  }, [table, mapping]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Manual analytics — only fires when appliedDay changes (Apply button).
  useEffect(() => {
    if (!table || !mapping?.transactionDate || !appliedDay) return;

    let cancelled = false;

    setLoading(true);

    (async () => {
      try {
        const cached = await getDailyStat(appliedDay);

        if (cached && !cancelled) {
          setStat(cached);
        }

        const kpi = await fetchPeriodKPI(table, mapping, appliedDay, appliedDay);

        if (!kpi || cancelled) return;

        const next: DailyStat = {
          day: appliedDay,
          total: kpi.total,
          success: kpi.success,
          declined: kpi.declined,
          refund: kpi.refund,
          instance: kpi.instance,
          submitted: kpi.submitted,
          amount: kpi.amount,
          successRate: kpi.successRate,
          uniqueCustomers: kpi.uniqueCustomers,
          computedAt: Date.now(),
          lineage: cached?.lineage ?? [],
        };

        if (!cancelled) {
          setStat(next);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appliedDay, table, mapping]);

  const saveSnapshot = async () => {
    if (!table || !mapping?.transactionDate || !day || !stat) return;

    setSaving(true);

    try {
      const rowsForDay = await fetchRowCountForDay(table, mapping, day);
      const sourceMetas = await getCachedTelecomSourceFiles();
      const metaByKey = new Map(sourceMetas.map((meta) => [meta.key, meta]));

      const lineage: DailyLineageEntry[] = loadedFiles.flatMap((f) => {
        const sourceKeys = f.sourceKeys.length > 0 ? f.sourceKeys : [f.cacheKey];
        const rowsPerSource = Math.max(0, Math.round(rowsForDay / sourceKeys.length));

        return sourceKeys.map((key) => {
          const meta = metaByKey.get(key);
          return {
            fileName: meta?.fileName ?? f.name,
            fileKey: key,
            size: meta?.size ?? f.size,
            rows: rowsPerSource,
            ingestedAt: meta?.savedAt ?? Date.now(),
            tableName: f.table,
          };
        });
      });

      if (lineage.length === 0 && fileName) {
        lineage.push({
          fileName,
          fileKey: fileName,
          size: 0,
          rows: rowsForDay,
          ingestedAt: Date.now(),
          tableName: table,
        });
      }

      await upsertDailyStat({ ...stat, lineage });
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const removeSnapshot = async (d: string) => {
    if (!confirm(`Supprimer le snapshot du ${d} ?`)) return;

    await removeDailyStat(d);
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-semibold">Analyse par jour</span>
        </div>

        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="h-8 px-2 rounded-md border border-border bg-background text-xs min-w-40"
        >
          <option value="">— Choisir un jour —</option>
          {availableDays.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setAppliedDay(day)}
          disabled={!day || loading || day === appliedDay}
          className="h-8 px-3 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
          title="Lancer l'analyse (pas de calcul automatique)"
        >
          <Zap className="w-3.5 h-3.5" /> Appliquer
        </button>

        <button
          type="button"
          onClick={() => reload()}
          className="h-8 w-8 rounded-md border border-border hover:bg-muted flex items-center justify-center"
          title="Rafraîchir la liste"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={saveSnapshot}
          disabled={!stat || saving}
          className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Sauvegarde…" : "Sauver le snapshot"}
        </button>

        <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
          <HardDrive className="w-3 h-3" /> {savedStats.length} snapshot(s) local(aux)
        </span>
      </div>

      {stat && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <DayCard
              label="Total tx"
              value={fmtN(stat.total)}
              icon={Database}
              tone="border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100"
            />

            <DayCard
              label="Réussite"
              value={fmtPct(stat.successRate)}
              sub={`${fmtN(stat.success)} tx`}
              icon={CheckCircle2}
              tone="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
            />

            <DayCard
              label="Échec"
              value={fmtN(stat.declined)}
              icon={XCircle}
              tone="border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
            />

            <DayCard
              label="Instance"
              value={fmtN(stat.instance)}
              icon={Clock}
              tone="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
            />

            <DayCard
              label="Montant"
              value={fmtAmount(stat.amount)}
              sub="TND"
              icon={TrendingUp}
              tone="border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <DataLineagePanel day={stat.day} lineage={stat.lineage} computedAt={stat.computedAt} />

            <SnapshotsPanel
              snapshots={savedStats}
              onRemove={removeSnapshot}
              onSelect={setDay}
              activeDay={day}
            />
          </div>

          <SubStatusPanel table={table} mapping={mapping} dateFrom={stat.day} dateTo={stat.day} />

          <TopAccountsLeaderboard
            table={table}
            mapping={mapping}
            dateFrom={stat.day}
            dateTo={stat.day}
          />
        </>
      )}

      {!appliedDay && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-xs text-muted-foreground">
          Sélectionnez un jour puis cliquez <strong className="text-foreground">Appliquer</strong>{" "}
          pour calculer les analytics. Aucun calcul automatique.
        </div>
      )}

      {loading && appliedDay && !stat && (
        <div className="rounded-2xl border border-border bg-card p-6 text-xs text-muted-foreground animate-pulse">
          Calcul des KPIs du jour…
        </div>
      )}
    </div>
  );
}

function DayCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
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

      <div className="text-2xl font-black tabular-nums leading-none">{value}</div>

      {sub && <div className="text-[10px] mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

function SnapshotsPanel({
  snapshots,
  onRemove,
  onSelect,
  activeDay,
}: {
  snapshots: DailyStat[];
  onRemove: (d: string) => void;
  onSelect: (d: string) => void;
  activeDay: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs font-semibold">Snapshots quotidiens (cache local)</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{snapshots.length}</span>
      </div>

      <div className="max-h-70 overflow-y-auto divide-y divide-border">
        {snapshots.length === 0 && (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">
            Aucun snapshot — sauvegardez un jour pour l&apos;accélérer plus tard.
          </div>
        )}

        {snapshots.map((s) => (
          <div
            key={s.day}
            className={`px-3 py-2 flex items-center gap-3 hover:bg-muted/40 ${
              activeDay === s.day ? "bg-primary/10" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(s.day)}
              className="text-xs font-semibold text-foreground hover:text-primary"
            >
              {s.day}
            </button>

            <div className="text-[10px] text-muted-foreground tabular-nums">
              {fmtN(s.total)} tx · {fmtPct(s.successRate)} · {s.lineage.length} fichier(s)
            </div>

            <button
              type="button"
              onClick={() => onRemove(s.day)}
              className="ml-auto h-6 w-6 rounded border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
