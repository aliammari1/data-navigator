"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  BarChart2,
  FileText,
  Filter,
  Layers,
  Tag,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BILL_PAYMENT_CHANNELS,
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
  type ChannelDef,
} from "@/features/telecom/lib/report-engine";
import {
  fetchSpecChannelStats as _fetchSpecChannelStats,
  type SpecChRow,
} from "@/features/telecom/lib/queries";
import { CL1 } from "./cl1";
import { CL2 } from "./cl2";
import { CL3 } from "./cl3";
import { CanalComparePanel } from "./canal-compare-panel";
import { SpecChannelTable } from "./spec-channel-table";
import { VoiceLineSection } from "./voice-line-section";
import { type ChannelGroup } from "./group-summary-chart";

// ─── Module-level stable sub-arrays ───────────────────────────────────────────

const VOUCHER_FOR_PAYMENT_GENERATION = [VOUCHER_FOR_PAYMENT[0]];
const VOUCHER_FOR_PAYMENT_REDEMPTION = VOUCHER_FOR_PAYMENT.slice(1);

const ALL_VOICE_FIXED = [
  ...RECHARGE_VOICE_FIXED_TTCASH,
  ...RECHARGE_VOICE_FIXED_VOUCHER,
];
const ALL_VOICE_MOBILE = [
  ...RECHARGE_VOICE_MOBILE_TTCASH,
  ...RECHARGE_VOICE_MOBILE_VOUCHER,
];

// ─── Summary group arrays ──────────────────────────────────────────────────────

const RECHARGE_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Fixed Lines", channels: ALL_VOICE_FIXED, color: "#89b4fa" },
  { label: "Mobile Lines", channels: ALL_VOICE_MOBILE, color: "#cba6f7" },
  { label: "Internet Sabba", channels: RECHARGE_DATA_SABBA, color: "#a6e3a1" },
  { label: "Data by Voucher", channels: RECHARGE_DATA_EVOUCHER, color: "#f38ba8" },
];

const VOIX_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Fixed Lines", channels: ALL_VOICE_FIXED, color: "#89b4fa" },
  { label: "Mobile Lines", channels: ALL_VOICE_MOBILE, color: "#cba6f7" },
];

const DATA_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Internet Sabba", channels: RECHARGE_DATA_SABBA, color: "#a6e3a1" },
  { label: "Data by Voucher", channels: RECHARGE_DATA_EVOUCHER, color: "#f38ba8" },
];

const VOUCHER_PAYMENT_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Génération", channels: VOUCHER_FOR_PAYMENT_GENERATION, color: "#89dceb" },
  { label: "Rédemption & Remboursement", channels: VOUCHER_FOR_PAYMENT_REDEMPTION, color: "#fab387" },
];

const VOUCHER_CONVERGENT_SUMMARY_GROUPS: ChannelGroup[] = [
  { label: "Evoucher on Demand — Génération", channels: EVOUCHER_ON_DEMAND_GENERATION, color: "#a6e3a1" },
  { label: "Carte & Ticket — Génération", channels: VOUCHER_CONVERGENT_CARTE_GENERATION, color: "#89dceb" },
  { label: "Carte & Ticket — Activation", channels: VOUCHER_CONVERGENT_CARTE_ACTIVATION, color: "#f9e2af" },
];

// ─── CanalTab ─────────────────────────────────────────────────────────────────

export function CanalTab({ getTableName }: { getTableName: () => string }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);

  const fetchSpecChannelStats = (
    channels: ChannelDef[],
    df: string,
    dt: string,
  ): Promise<{ rows: SpecChRow[]; total: SpecChRow }> =>
    _fetchSpecChannelStats(getTableName(), channels, df, dt);

  return (
    <div className="space-y-3 pb-10">
      {/* ── Date range filter bar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl border border-border bg-card">
        <Filter className="w-4 h-4 text-muted-foreground flex-none" />
        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
          Filtrer par période :
        </span>
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
        </div>
        {(dateFrom || dateTo) && (
          <span className="ml-auto text-[10px] text-indigo-600 dark:text-indigo-400 font-medium tabular-nums">
            {dateFrom || "…"} → {dateTo || "…"}
          </span>
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
        accentGlow="bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0"
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
        accentGlow="bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0"
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
        accentGlow="bg-gradient-to-r from-cyan-500/0 via-cyan-500/50 to-cyan-500/0"
        summaryGroups={VOUCHER_PAYMENT_SUMMARY_GROUPS}
        dateFrom={dateFrom}
        dateTo={dateTo}
        fetchSpecChannelStats={fetchSpecChannelStats}
      >
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
        accentGlow="bg-gradient-to-r from-orange-500/0 via-orange-500/50 to-orange-500/0"
        dateFrom={dateFrom}
        dateTo={dateTo}
        fetchSpecChannelStats={fetchSpecChannelStats}
      >
        <SpecChannelTable
          channels={CREDIT_TRANSFER}
          dateFrom={dateFrom}
          dateTo={dateTo}
          fetchSpecChannelStats={fetchSpecChannelStats}
        />
      </CL1>

      {/* ── V. Voucher Convergent Management ─────────────────────────── */}
      <CL1
        title="V. Voucher For Recharge Management"
        icon={Layers}
        accentBg="bg-lime-500/15"
        accentColor="text-lime-600 dark:text-lime-400"
        accentGlow="bg-gradient-to-r from-lime-500/0 via-lime-500/50 to-lime-500/0"
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
          <CL3 title="2.a Génération (Brand_D = 166)">
            <SpecChannelTable
              channels={VOUCHER_CONVERGENT_CARTE_GENERATION}
              dateFrom={dateFrom}
              dateTo={dateTo}
              fetchSpecChannelStats={fetchSpecChannelStats}
            />
          </CL3>
          <CL3 title="2.b Activation (Brand_D = 163, 167)">
            <SpecChannelTable
              channels={VOUCHER_CONVERGENT_CARTE_ACTIVATION}
              dateFrom={dateFrom}
              dateTo={dateTo}
              fetchSpecChannelStats={fetchSpecChannelStats}
            />
          </CL3>
        </CL2>
      </CL1>
    </div>
  );
}
