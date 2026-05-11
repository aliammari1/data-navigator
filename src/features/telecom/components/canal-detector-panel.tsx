"use client";
import { AlertCircle, ListFilter, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/utils";
import { fmtCompact, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { CANAL_CONFIG } from "@/features/telecom/lib/canal-config";
import type * as Types from "@/features/telecom/types";
import { Section } from "./section";
import { ProgressBar } from "./progress-bar";

export function CanalDetectorPanel({
  m,
  fetchServiceCodeRows,
}: {
  m: Types.ColumnMapping;
  fetchServiceCodeRows: (
    m: Types.ColumnMapping,
  ) => Promise<Types.ServiceCodeRow[]>;
}) {
  const [rows, setRows] = useState<Types.ServiceCodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rk, setRk] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rk triggers manual refresh
  useEffect(() => {
    setLoading(true);
    fetchServiceCodeRows(m)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [m, rk]);

  const grouped = useMemo(() => {
    const map: Record<string, Types.ServiceCodeRow[]> = {};
    for (const r of rows) {
      const k = r.matchedCanal;
      if (!map[k]) map[k] = [];
      map[k].push(r);
    }
    return map;
  }, [rows]);

  const totalTx = rows.reduce((s, r) => s + r.count, 0);
  const otherRows = grouped.Other ?? [];
  const otherTotal = otherRows.reduce((s, r) => s + r.count, 0);
  const matchedPct = totalTx > 0 ? ((totalTx - otherTotal) / totalTx) * 100 : 0;
  const canalOrder = Object.keys(grouped).filter((k) => k !== "Other");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
          <div className="text-2xl font-bold text-foreground tabular-nums">
            {rows.length}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Motifs distincts
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {fmtPct(matchedPct)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Classifié
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
          <div
            className={cn(
              "text-2xl font-bold tabular-nums",
              otherTotal > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {fmtN(otherTotal)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Tx non classées
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Classification SERVICE_CLASS_NAME + BRAND_CATEGORY_NAME
        </span>
        <button
          type="button"
          onClick={() => setRk((k) => k + 1)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />{" "}
          Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 animate-spin" /> Analyse des codes de
          service…
        </div>
      ) : (
        <div className="space-y-3">
          {canalOrder.map((canal) => {
            const items = grouped[canal] ?? [];
            const subtotal = items.reduce((s, r) => s + r.count, 0);
            const cfg = Object.values(CANAL_CONFIG).find(
              (c) => c.label === canal || c.label.includes(canal.split(" ")[0]),
            );
            return (
              <Section
                key={canal}
                title={canal}
                collapsible
                defaultOpen={false}
                badge={`${items.length} motifs · ${fmtN(subtotal)} tx`}
                icon={<ListFilter className="w-4 h-4" />}
              >
                <div className="space-y-1.5">
                  {items.map((r) => (
                    <div
                      key={`${r.serviceCode}-${r.category}`}
                      className="flex items-center gap-3 text-xs"
                    >
                      <code
                        className={cn(
                          "text-[10px] font-mono flex-none w-48 truncate",
                          cfg ? cfg.color : "text-muted-foreground",
                        )}
                      >
                        {r.serviceCode}
                      </code>
                      <span className="text-muted-foreground text-[10px] flex-none">
                        /
                      </span>
                      <span className="text-[10px] text-muted-foreground flex-none w-32 truncate">
                        {r.category || "—"}
                      </span>
                      <div className="flex-1">
                        <ProgressBar
                          value={r.count}
                          max={items[0]?.count ?? 1}
                          showLabel={false}
                          height="h-1"
                          color={
                            cfg ? cfg.bg.replace("/10", "/60") : "bg-muted"
                          }
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono w-12 text-right flex-none">
                        {fmtCompact(r.count)}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            );
          })}

          {otherRows.length > 0 && (
            <Section
              title="Non classé / Autre"
              collapsible
              defaultOpen={true}
              badge={`${otherRows.length} motifs · ${fmtN(otherTotal)} tx`}
              icon={
                <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              }
            >
              <div className="text-xs text-amber-600/80 dark:text-amber-400/80 mb-3 leading-relaxed">
                Ces valeurs SERVICE_CLASS_NAME ne correspondent à aucune règle
                de canal. Étendez la logique de classification des canaux ou
                vérifiez le mappage des colonnes si ces résultats sont
                inattendus.
              </div>
              <div className="space-y-1.5">
                {otherRows.slice(0, 20).map((r) => (
                  <div
                    key={`${r.serviceCode}-${r.category}`}
                    className="flex items-center gap-3 text-xs"
                  >
                    <code className="text-[10px] font-mono text-amber-600/70 dark:text-amber-400/70 flex-none w-48 truncate">
                      {r.serviceCode}
                    </code>
                    <span className="text-muted-foreground text-[10px] flex-none">
                      /
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-none w-32 truncate">
                      {r.category || "—"}
                    </span>
                    <div className="flex-1">
                      <ProgressBar
                        value={r.count}
                        max={otherRows[0]?.count ?? 1}
                        showLabel={false}
                        height="h-1"
                        color="bg-amber-500"
                      />
                    </div>
                    <span className="text-[11px] text-amber-600/70 dark:text-amber-400/70 font-mono w-12 text-right flex-none">
                      {fmtCompact(r.count)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {rows.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Aucune donnée de code de service disponible. Chargez d&apos;abord
              un fichier.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
