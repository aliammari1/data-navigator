"use client";

import {
  ArrowUpRight,
  BarChart2,
  CalendarDays,
  Clock,
  FileText,
  Filter,
  Layers,
  Tag,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useState } from "react";
import {
  DATA_SUMMARY_GROUPS,
  RECHARGE_SUMMARY_GROUPS,
  VOIX_SUMMARY_GROUPS,
  VOUCHER_CONVERGENT_SUMMARY_GROUPS,
  VOUCHER_FOR_PAYMENT_GENERATION,
  VOUCHER_FOR_PAYMENT_REDEMPTION,
  VOUCHER_PAYMENT_SUMMARY_GROUPS,
} from "@/features/telecom/lib/canal-groups";
import {
  fetchSpecChannelStats as _fetchSpecChannelStats,
  fetchSpecStatusStats as _fetchSpecStatusStats,
  fetchSpecUnitAmountStats as _fetchSpecUnitAmountStats,
  type SpecChRow,
} from "@/features/telecom/lib/queries";
import {
  BILL_PAYMENT_CHANNELS,
  type ChannelDef,
  CREDIT_TRANSFER,
  EVOUCHER_ON_DEMAND_GENERATION,
  RECHARGE_DATA_EVOUCHER,
  RECHARGE_DATA_SABBA,
  RECHARGE_VOICE_FIXED_TTCASH,
  RECHARGE_VOICE_FIXED_VOUCHER,
  RECHARGE_VOICE_MOBILE_TTCASH,
  RECHARGE_VOICE_MOBILE_VOUCHER,
  VOUCHER_CONVERGENT_CARTE_ACTIVATION,
  VOUCHER_CONVERGENT_CARTE_GENERATION,
  VOUCHER_FOR_PAYMENT,
} from "@/features/telecom/lib/report-engine";
import type { ColumnMapping } from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { CanalComparePanel } from "./canal-compare-panel";
import { CL1 } from "./cl1";
import { CL2 } from "./cl2";
import { CL3 } from "./cl3";
import { SpecChannelTable } from "./spec-channel-table";
import { SpecStatusTable } from "./spec-status-table";
import { SpecUnitAmountTable } from "./spec-unit-amount-table";
import { VoiceLineSection } from "./voice-line-section";

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ─── CanalTab ─────────────────────────────────────────────────────────────────

export const CanalTab = memo(function CanalTab({
  getTableName,
  mapping,
}: {
  getTableName: () => string;
  mapping: ColumnMapping;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);

  const fetchSpecChannelStats = useCallback(
    (
      channels: ChannelDef[],
      df: string,
      dt: string,
    ): Promise<{ rows: SpecChRow[]; total: SpecChRow }> =>
      _fetchSpecChannelStats(getTableName(), channels, df, dt, mapping),
    [getTableName, mapping],
  );
  const fetchSpecStatusStats = useCallback(
    (channels: ChannelDef[], df: string, dt: string) =>
      _fetchSpecStatusStats(getTableName(), channels, df, dt, mapping),
    [getTableName, mapping],
  );
  const fetchSpecUnitAmountStats = useCallback(
    (channels: ChannelDef[], df: string, dt: string) =>
      _fetchSpecUnitAmountStats(getTableName(), channels, df, dt, mapping),
    [getTableName, mapping],
  );

  return (
    <div className="space-y-3 pb-10">
      {/* ── Date range filter bar ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground flex-none" />
            <div>
              <div className="text-xs font-semibold text-foreground">
                Analyse canal par période
              </div>
              <div className="text-[10px] text-muted-foreground">
                Le filtre s&apos;applique à tous les blocs Bill Payment,
                Recharge, Voucher et Credit Transfer.
              </div>
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium tabular-nums">
              {dateFrom || "..."} {"->"} {dateTo || "..."}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="canal-date-from"
          >
            Du
          </label>
          <input
            id="canal-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
          />
          <label
            className="text-xs text-muted-foreground"
            htmlFor="canal-date-to"
          >
            Au
          </label>
          <input
            id="canal-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
          />
          {[
            {
              label: "Aujourd'hui",
              icon: Clock,
              from: isoDaysAgo(0),
              to: isoDaysAgo(0),
            },
            {
              label: "J-1",
              icon: CalendarDays,
              from: isoDaysAgo(1),
              to: isoDaysAgo(1),
            },
            {
              label: "7 jours",
              icon: CalendarDays,
              from: isoDaysAgo(6),
              to: isoDaysAgo(0),
            },
            {
              label: "30 jours",
              icon: CalendarDays,
              from: isoDaysAgo(29),
              to: isoDaysAgo(0),
            },
          ].map((preset) => {
            const Icon = preset.icon;
            const active = dateFrom === preset.from && dateTo === preset.to;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setDateFrom(preset.from);
                  setDateTo(preset.to);
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors",
                  active
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-3 w-3" />
                {preset.label}
              </button>
            );
          })}
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" /> Réinitialiser
            </button>
          )}
          <button
            type="button"
            onClick={() => setCompareOpen((v) => !v)}
            className={cn(
              "ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              compareOpen
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-500/15 dark:text-indigo-300"
                : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <BarChart2 className="w-3 h-3" />
            Comparer les canaux
          </button>
        </div>
      </div>

      {/* ── Canal Comparison Panel ─────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {compareOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                <BarChart2 className="w-3.5 h-3.5" />
                Comparaison des canaux
                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                  — sélectionnez 2 à 4 groupes
                </span>
              </div>
              <CanalComparePanel
                dateFrom={dateFrom}
                dateTo={dateTo}
                fetchSpecChannelStats={fetchSpecChannelStats}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── I. Bill Payment ────────────────────────────────────── */}
      <CL1
        title="I. Bill Payment"
        icon={FileText}
        accentBg="bg-blue-500/15"
        accentColor="text-blue-600 dark:text-blue-400"
        accentGlow="bg-linear-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0"
        dateFrom={dateFrom}
        dateTo={dateTo}
        fetchSpecChannelStats={fetchSpecChannelStats}
      >
        <SpecChannelTable
          channels={BILL_PAYMENT_CHANNELS}
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        />
      </CL1>

      {/* ── II. Recharge ──────────────────────────────────────────────── */}
      <CL1
        title="II. Recharge"
        icon={Zap}
        accentBg="bg-emerald-500/15"
        accentColor="text-emerald-600 dark:text-emerald-400"
        accentGlow="bg-linear-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0"
        summaryGroups={RECHARGE_SUMMARY_GROUPS}
        dateFrom={dateFrom}
        dateTo={dateTo}
        fetchSpecChannelStats={fetchSpecChannelStats}
      >
        {/* 1. Recharge Voix */}
        <CL2
          title="1. Recharge Voix"
          summaryGroups={VOIX_SUMMARY_GROUPS}
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        >
          {/* 1.1 Lignes Fixes */}
          <CL3 title="1.1 Lignes Fixes">
            <VoiceLineSection
              ttcash={RECHARGE_VOICE_FIXED_TTCASH}
              voucher={RECHARGE_VOICE_FIXED_VOUCHER}
              dateFrom={dateFrom}
              dateTo={dateTo}
              fetchSpecChannelStats={fetchSpecChannelStats}
            />
          </CL3>
          {/* 1.2 Lignes Mobiles */}
          <CL3 title="1.2 Lignes Mobiles">
            <VoiceLineSection
              ttcash={RECHARGE_VOICE_MOBILE_TTCASH}
              voucher={RECHARGE_VOICE_MOBILE_VOUCHER}
              dateFrom={dateFrom}
              dateTo={dateTo}
              fetchSpecChannelStats={fetchSpecChannelStats}
            />
          </CL3>
        </CL2>

        {/* 2. Recharge DATA */}
        <CL2
          title="2. Recharge DATA — Lignes Mobiles uniquement"
          summaryGroups={DATA_SUMMARY_GROUPS}
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        >
          <CL3 title="2.1 Par Internet Sabba (électronique)">
            <SpecChannelTable
              channels={RECHARGE_DATA_SABBA}
              dateFrom={dateFrom}
              dateTo={dateTo}
              fetchSpecChannelStats={fetchSpecChannelStats}
            />
          </CL3>
          <CL3 title="2.2 Par Evoucher DATA">
            <SpecChannelTable
              channels={RECHARGE_DATA_EVOUCHER}
              dateFrom={dateFrom}
              dateTo={dateTo}
              fetchSpecChannelStats={fetchSpecChannelStats}
            />
          </CL3>
        </CL2>
      </CL1>

      {/* ── III. Voucher For Payment ─────────────────────────────────── */}
      <CL1
        title="III. Voucher For Payment"
        icon={Tag}
        accentBg="bg-cyan-500/15"
        accentColor="text-cyan-600 dark:text-cyan-400"
        accentGlow="bg-linear-to-r from-cyan-500/0 via-cyan-500/50 to-cyan-500/0"
        summaryGroups={VOUCHER_PAYMENT_SUMMARY_GROUPS}
        dateFrom={dateFrom}
        dateTo={dateTo}
        fetchSpecChannelStats={fetchSpecChannelStats}
      >
        <CL2 title="Statuts — tous types Voucher For Payment">
          <SpecStatusTable
            channels={VOUCHER_FOR_PAYMENT}
            dateFrom={dateFrom}
            dateTo={dateTo}
            fetchSpecStatusStats={fetchSpecStatusStats}
          />
        </CL2>
        <CL2
          title="1. Génération (Brand_D = 98)"
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        >
          <SpecChannelTable
            channels={VOUCHER_FOR_PAYMENT_GENERATION}
            dateFrom={dateFrom}
            dateTo={dateTo}
            fetchSpecChannelStats={fetchSpecChannelStats}
          />
        </CL2>
        <CL2
          title="2. Rédemption & Remboursement (Brand_D = 99, 100)"
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        >
          <SpecChannelTable
            channels={VOUCHER_FOR_PAYMENT_REDEMPTION}
            dateFrom={dateFrom}
            dateTo={dateTo}
            fetchSpecChannelStats={fetchSpecChannelStats}
          />
        </CL2>
      </CL1>

      {/* ── IV. Credit Transfer ──────────────────────────────────────── */}
      <CL1
        title="IV. Credit Transfer"
        icon={ArrowUpRight}
        accentBg="bg-orange-500/15"
        accentColor="text-orange-600 dark:text-orange-400"
        accentGlow="bg-linear-to-r from-orange-500/0 via-orange-500/50 to-orange-500/0"
        dateFrom={dateFrom}
        dateTo={dateTo}
        fetchSpecChannelStats={fetchSpecChannelStats}
      >
        <CL2 title="Statuts — tous services Credit Transfer">
          <SpecStatusTable
            channels={CREDIT_TRANSFER}
            dateFrom={dateFrom}
            dateTo={dateTo}
            fetchSpecStatusStats={fetchSpecStatusStats}
          />
        </CL2>
        <SpecChannelTable
          channels={CREDIT_TRANSFER}
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        />
      </CL1>

      {/* ── V. Voucher Convergent Management ─────────────────────────── */}
      <CL1
        title="V. Voucher Convergent Management"
        icon={Layers}
        accentBg="bg-lime-500/15"
        accentColor="text-lime-600 dark:text-lime-400"
        accentGlow="bg-linear-to-r from-lime-500/0 via-lime-500/50 to-lime-500/0"
        summaryGroups={VOUCHER_CONVERGENT_SUMMARY_GROUPS}
        dateFrom={dateFrom}
        dateTo={dateTo}
        fetchSpecChannelStats={fetchSpecChannelStats}
      >
        <CL2
          title="1. Evoucher on Demand — Génération"
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        >
          <SpecStatusTable
            channels={EVOUCHER_ON_DEMAND_GENERATION}
            dateFrom={dateFrom}
            dateTo={dateTo}
            fetchSpecStatusStats={fetchSpecStatusStats}
          />
          <SpecChannelTable
            channels={EVOUCHER_ON_DEMAND_GENERATION}
            dateFrom={dateFrom}
            dateTo={dateTo}
            fetchSpecChannelStats={fetchSpecChannelStats}
          />
        </CL2>
        <CL2
          title="2. Carte & Ticket de recharge"
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        >
          <CL3 title="2.1 Génération (Brand_D = 166)">
            <SpecUnitAmountTable
              channels={VOUCHER_CONVERGENT_CARTE_GENERATION}
              dateFrom={dateFrom}
              dateTo={dateTo}
              fetchSpecUnitAmountStats={fetchSpecUnitAmountStats}
            />
          </CL3>
          <CL3 title="2.2 Activation / Annulation (Brand_D = 163, 167)">
            <SpecUnitAmountTable
              channels={VOUCHER_CONVERGENT_CARTE_ACTIVATION}
              dateFrom={dateFrom}
              dateTo={dateTo}
              fetchSpecUnitAmountStats={fetchSpecUnitAmountStats}
            />
          </CL3>
        </CL2>
      </CL1>
    </div>
  );
});
