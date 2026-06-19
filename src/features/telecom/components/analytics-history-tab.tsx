"use client";

import { Database, FolderClock } from "lucide-react";
import { memo } from "react";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type { AnalyticsSnapshotMeta } from "@/platform/storage/app-db";

export const AnalyticsHistoryTab = memo(function AnalyticsHistoryTab({
  entries,
  onRefresh,
  onLoad,
  onExportDatabase,
}: {
  entries: AnalyticsSnapshotMeta[];
  onRefresh: () => void;
  onLoad: (key: string) => void;
  onExportDatabase: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-muted/30 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FolderClock className="h-4 w-4 text-cyan-500" />
              <h2 className="text-sm font-bold text-foreground">Analytics sauvegardées</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Recharge une journée déjà analysée sans relire le fichier CSV.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onExportDatabase}
              className="flex items-center gap-1.5 rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300"
            >
              <Database className="h-3.5 w-3.5" />
              Export DB
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-8 text-sm text-muted-foreground">
          Aucun historique analytics trouvé pour l&apos;instant.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.key}
              onClick={() => onLoad(entry.key)}
              className="rounded-3xl border border-border bg-card p-4 text-left transition hover:border-cyan-500/40 hover:bg-cyan-500/5"
            >
              <div className="truncate text-sm font-bold text-foreground">{entry.fileName}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {new Date(entry.savedAt).toLocaleString("fr-TN")}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-muted p-3">
                  <div className="text-muted-foreground">Transactions</div>
                  <div className="mt-1 font-bold text-foreground">
                    {fmtN(entry.totalTransactions)}
                  </div>
                </div>
                <div className="rounded-2xl bg-muted p-3">
                  <div className="text-muted-foreground">Réussite</div>
                  <div className="mt-1 font-bold text-foreground">{fmtPct(entry.successRate)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
