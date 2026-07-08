"use client";

import { ChevronDown, Clock, Loader2, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { buildCustomerHourlyOption } from "@/features/telecom/lib/chart-options";
import { fmtAmount, fmtN, fmtPct, safeNum } from "@/features/telecom/lib/format";
import { BUILTIN_STATUS_CODES } from "@/features/telecom/lib/status-definitions";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

export function CustomerProfilePanel({
  msisdn,
  m,
  onClose,
  fetchCustomerProfile,
}: {
  msisdn: string;
  m: Types.ColumnMapping;
  onClose: () => void;
  fetchCustomerProfile: (
    m: Types.ColumnMapping,
    msisdn: string,
  ) => Promise<Types.CustomerProfileData | null>;
}) {
  const [profile, setProfile] = useState<Types.CustomerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [txPage, setTxPage] = useState(0);
  const TX_PAGE = 10;

  // biome-ignore lint/correctness/useExhaustiveDependencies: msisdn + m are stable per open
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCustomerProfile(m, msisdn)
      .then((r) => {
        if (!cancelled) setProfile(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [msisdn]);

  const txRows = profile?.recentTx ?? [];
  const pageTx = txRows.slice(txPage * TX_PAGE, (txPage + 1) * TX_PAGE);
  const txTotal = txRows.length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-end"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-full max-w-xl h-full bg-card border-l border-border overflow-y-auto flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-none">
                <Users className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground font-mono">{msisdn}</div>
                <div className="text-[10px] text-muted-foreground">Profil client</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/60 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="flex-1 p-5 space-y-5">
            {loading && (
              <div className="flex items-center gap-2 py-10 justify-center text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement du profil…
              </div>
            )}

            {!loading && !profile && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Aucune donnée trouvée pour ce numéro.
              </div>
            )}

            {!loading && profile && (
              <>
                {/* KPI chips */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      label: "Transactions",
                      value: fmtN(profile.total),
                      color: "text-indigo-600 dark:text-indigo-400",
                      bg: "bg-indigo-500/10 border-indigo-500/20",
                    },
                    {
                      label: "Taux de succès",
                      value: fmtPct(
                        profile.total > 0 ? (profile.success / profile.total) * 100 : 0,
                      ),
                      color:
                        profile.success / profile.total >= 0.9
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400",
                      bg: "bg-emerald-500/10 border-emerald-500/20",
                    },
                    {
                      label: "Montant total",
                      value: `${fmtAmount(profile.totalAmount)} DT`,
                      color: "text-emerald-600 dark:text-emerald-400",
                      bg: "bg-emerald-500/10 border-emerald-500/20",
                    },
                    {
                      label: "Montant moyen",
                      value: `${fmtAmount(profile.avgAmount)} DT`,
                      color: "text-violet-600 dark:text-violet-400",
                      bg: "bg-violet-500/10 border-violet-500/20",
                    },
                  ].map((k) => (
                    <div key={k.label} className={cn("rounded-xl border p-3", k.bg)}>
                      <div className={cn("text-lg font-bold tabular-nums truncate", k.color)}>
                        {k.value}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Identity + canal info */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                      Canal favori
                    </div>
                    <div className="font-semibold text-foreground truncate">
                      {profile.favoriteCanal}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                      Heure de pointe
                    </div>
                    <div className="font-semibold text-foreground">
                      {profile.peakHour.toString().padStart(2, "0")}:00
                    </div>
                  </div>
                  {profile.topError && (
                    <div className="col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                        Code d&apos;erreur fréquent
                      </div>
                      <span className="font-mono text-amber-700 dark:text-amber-300 text-xs">
                        {profile.topError}
                      </span>
                    </div>
                  )}
                </div>

                {/* Status breakdown mini */}
                <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Répartition des statuts
                  </div>
                  {[
                    { label: "Succès", val: profile.success, color: "#a6e3a1" },
                    {
                      label: "Échecs",
                      val: profile.declined,
                      color: "#f38ba8",
                    },
                    {
                      label: "Autres",
                      val: profile.total - profile.success - profile.declined,
                      color: "#89dceb",
                    },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-muted-foreground">{s.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${profile.total > 0 ? (s.val / profile.total) * 100 : 0}%`,
                            backgroundColor: s.color,
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <span className="w-10 text-right tabular-nums text-foreground font-semibold">
                        {fmtN(s.val)}
                      </span>
                      <span className="w-10 text-right tabular-nums text-muted-foreground">
                        {profile.total > 0 ? fmtPct((s.val / profile.total) * 100) : "—"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Hourly activity */}
                {profile && (
                  <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
                    <div className="px-3 pt-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Activité horaire
                    </div>
                    <EChart
                      option={buildCustomerHourlyOption(profile.hourly, profile.peakHour)}
                      height={100}
                    />
                  </div>
                )}

                {/* Recent transactions */}
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                    <span>Transactions récentes ({txTotal})</span>
                    {txTotal > TX_PAGE && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={txPage === 0}
                          onClick={() => setTxPage((p) => p - 1)}
                          className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-30"
                        >
                          <ChevronDown className="w-3 h-3 rotate-90" />
                        </button>
                        <span className="text-[9px]">
                          {txPage + 1}/{Math.ceil(txTotal / TX_PAGE)}
                        </span>
                        <button
                          type="button"
                          disabled={(txPage + 1) * TX_PAGE >= txTotal}
                          onClick={() => setTxPage((p) => p + 1)}
                          className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-30"
                        >
                          <ChevronDown className="w-3 h-3 -rotate-90" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border/50">
                          {["Date", "Statut", "Montant", "Canal"].map((h) => (
                            <th
                              key={h}
                              className="px-2.5 py-2 text-left text-[9px] uppercase tracking-wide text-muted-foreground font-semibold"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageTx.map((row, rowIdx) => {
                          const st = String(row[m.status] ?? "");
                          const isSuccess = BUILTIN_STATUS_CODES.success.includes(
                            st.toUpperCase().trim(),
                          );
                          const isDeclined =
                            st.toUpperCase().startsWith("DC") || st.toUpperCase().startsWith("SDL");
                          // Stable, deterministic key (no Math.random): prefer a
                          // real id, else fall back to the row's page index.
                          const rowKey = String(
                            row[m.transactionId] ??
                              row[m.msisdn] ??
                              row[m.transactionDate] ??
                              `row-${rowIdx}`,
                          );
                          return (
                            <tr
                              key={rowKey}
                              className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                            >
                              <td className="px-2.5 py-1.5 text-muted-foreground font-mono text-[10px]">
                                {String(row[m.transactionDate] ?? "").slice(0, 16)}
                              </td>
                              <td className="px-2.5 py-1.5">
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-semibold",
                                    isSuccess
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                      : isDeclined
                                        ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                                        : "bg-muted/60 text-muted-foreground",
                                  )}
                                >
                                  {st}
                                </span>
                              </td>
                              <td className="px-2.5 py-1.5 tabular-nums text-right text-emerald-600 dark:text-emerald-400 font-medium">
                                {fmtAmount(safeNum(row[m.amount]))}
                              </td>
                              <td className="px-2.5 py-1.5 text-muted-foreground text-[10px] truncate max-w-28">
                                {String(row[m.canal] ?? row[m.serviceCode] ?? "—")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
