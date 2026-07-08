"use client";

import { Calendar, Clock, Database, RefreshCw, Zap } from "lucide-react";

export interface PeriodValue {
  from: string; // YYYY-MM-DD
  to: string;
}

const PRESETS: Array<{ key: string; label: string; days: number }> = [
  { key: "today", label: "Aujourd'hui", days: 0 },
  { key: "1d", label: "J-1", days: 1 },
  { key: "7d", label: "7 jours", days: 7 },
  { key: "30d", label: "30 jours", days: 30 },
  { key: "90d", label: "90 jours", days: 90 },
];

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function clampToAvailable(from: string, to: string, minD: string, maxD: string): PeriodValue {
  return {
    from: minD && from < minD ? minD : from,
    to: maxD && to > maxD ? maxD : to,
  };
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function PeriodFilterBar({
  value,
  onChange,
  onApply,
  busy,
  availableDays,
}: {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
  onApply?: () => void;
  busy?: boolean;
  availableDays?: string[];
}) {
  const minD = availableDays?.[availableDays.length - 1] ?? "";
  const maxD = availableDays?.[0] ?? "";
  const hasAvailableDays = Boolean(availableDays?.length);
  const invalidRange = Boolean(value.from && value.to && value.from > value.to);
  const dataPresetButtons = hasAvailableDays
    ? [
        {
          key: "latest",
          label: "Dernier jour chargé",
          icon: Clock,
          value: { from: maxD, to: maxD },
        },
        {
          key: "latest7",
          label: "7 derniers chargés",
          icon: Calendar,
          value: clampToAvailable(shiftDate(maxD, -6), maxD, minD, maxD),
        },
        {
          key: "all",
          label: "Toute la donnée",
          icon: Database,
          value: { from: minD, to: maxD },
        },
      ]
    : [];

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          Période
        </div>

        {hasAvailableDays && (
          <div className="text-[10px] text-muted-foreground tabular-nums">
            Données disponibles: {minD} → {maxD}
          </div>
        )}

        {invalidRange && (
          <div className="text-[10px] font-semibold text-red-600 dark:text-red-400">
            La date de début doit précéder la date de fin.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.from}
            min={minD || undefined}
            max={value.to || maxD || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-8 px-2 rounded-md border border-border bg-background text-xs"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={value.to}
            min={value.from || minD || undefined}
            max={maxD || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-8 px-2 rounded-md border border-border bg-background text-xs"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {dataPresetButtons.map((p) => {
            const Icon = p.icon;
            const active = value.from === p.value.from && value.to === p.value.to;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onChange(p.value)}
                className={`h-8 px-2 rounded-md text-[11px] font-medium border transition-colors inline-flex items-center gap-1 ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-3 h-3" />
                {p.label}
              </button>
            );
          })}
          {!hasAvailableDays &&
            PRESETS.map((p) => {
              const from = dateNDaysAgo(p.days);
              const to = dateNDaysAgo(0);
              const active = value.from === from && value.to === to;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChange({ from, to })}
                  className={`h-8 px-2 rounded-md text-[11px] font-medium border transition-colors ${
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
        </div>

        {onApply && (
          <button
            type="button"
            onClick={onApply}
            disabled={busy || invalidRange}
            className="ml-auto h-8 px-3 rounded-md text-[11px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1 disabled:opacity-50"
          >
            {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Appliquer
          </button>
        )}
      </div>
    </div>
  );
}

export function defaultPeriod(): PeriodValue {
  return { from: dateNDaysAgo(7), to: dateNDaysAgo(0) };
}
