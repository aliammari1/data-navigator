"use client";

import { AlertCircle, CheckCircle2, History, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { fmtCompact, fmtDuration } from "@/features/telecom/lib/format";

/**
 * Activité récente — a subtle timeline backed by the REAL query history store
 * (`useDataStore().queryHistory`), which records every NL/SQL run with its
 * timestamp, row count, duration and error. No fabricated events: when the
 * history is empty we render a quiet empty state instead.
 */
export function ActivityCard() {
  const queryHistory = useDataStore((s) => s.queryHistory);

  const items = useMemo(() => queryHistory.slice(0, 6), [queryHistory]);

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl border border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-300">
          <History className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Activité récente</h2>
          <p className="text-xs text-muted-foreground">Vos dernières requêtes</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-8 text-center">
          <Sparkles className="size-5 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">Aucune activité pour l'instant.</p>
          <p className="text-xs text-muted-foreground/70">
            Lancez une analyse ou une requête pour la voir apparaître ici.
          </p>
        </div>
      ) : (
        <ol className="relative flex flex-col gap-3 pl-4">
          <span aria-hidden="true" className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
          {items.map((item) => (
            <li key={item.id} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-4 top-1.5 size-2.5 rounded-full border-2 border-card ${
                  item.error ? "bg-negative" : "bg-positive"
                }`}
              />
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {item.naturalLanguage?.trim() || item.sql.trim() || "Requête"}
                </p>
                <span className="flex-none text-xs text-muted-foreground/70">
                  {relativeTime(item.ranAt)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                {item.error ? (
                  <span className="flex items-center gap-1 text-negative">
                    <AlertCircle className="size-3" /> Échec
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-positive">
                    <CheckCircle2 className="size-3" />
                    {fmtCompact(item.rowsReturned)} lignes
                  </span>
                )}
                <span>·</span>
                <span className="tabular-nums">{fmtDuration(item.durationMs)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Compact French relative time. */
function relativeTime(input: string | number | Date | undefined): string {
  if (!input) return "";
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "";
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const day = Math.round(h / 24);
  return `${day} j`;
}
