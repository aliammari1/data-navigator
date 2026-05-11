"use client";

import { Database, FileText, GitBranch, Layers } from "lucide-react";
import { fmtN } from "@/features/telecom/lib/format";
import type { DailyLineageEntry } from "@/features/telecom/lib/daily-stats-cache";

export function DataLineagePanel({
  day,
  lineage,
  computedAt,
}: {
  day: string;
  lineage: DailyLineageEntry[];
  computedAt: number;
}) {
  const totalRows = lineage.reduce((a, e) => a + e.rows, 0);
  const totalSize = lineage.reduce((a, e) => a + e.size, 0);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <GitBranch className="w-3.5 h-3.5 text-cyan-500" />
        <span className="text-xs font-semibold">
          Lignée des données — {day}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {lineage.length} fichier(s) · {fmtN(totalRows)} lignes ·{" "}
          {(totalSize / 1024 / 1024).toFixed(2)} MB
        </span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-border p-3 bg-muted/30">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="w-3 h-3 text-cyan-500" />
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Fichiers contributeurs
              </span>
            </div>
            <div className="text-2xl font-black tabular-nums">
              {lineage.length}
            </div>
          </div>
          <div className="rounded-xl border border-border p-3 bg-muted/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Layers className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Lignes ingérées
              </span>
            </div>
            <div className="text-2xl font-black tabular-nums">
              {fmtN(totalRows)}
            </div>
          </div>
          <div className="rounded-xl border border-border p-3 bg-muted/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Database className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Calcul cache
              </span>
            </div>
            <div className="text-xs text-foreground">
              {new Date(computedAt).toLocaleString("fr-FR")}
            </div>
          </div>
        </div>

        <div className="relative pl-5">
          <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />
          {lineage.map((e) => (
            <div key={e.fileKey} className="relative pb-3 last:pb-0">
              <span className="absolute -left-3.5 top-1 w-3 h-3 rounded-full border-2 border-cyan-500 bg-background" />
              <div className="text-xs font-semibold text-foreground truncate">
                {e.fileName}
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                <span>{new Date(e.ingestedAt).toLocaleString("fr-FR")}</span>
                <span>·</span>
                <span className="tabular-nums">{fmtN(e.rows)} lignes</span>
                <span>·</span>
                <span>{(e.size / 1024).toFixed(1)} KB</span>
                <span>·</span>
                <span className="font-mono opacity-70">{e.tableName}</span>
              </div>
            </div>
          ))}
          {lineage.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">
              Pas de lignée enregistrée pour ce jour.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
