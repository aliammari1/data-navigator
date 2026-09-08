"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/shared/utils";
import { GroupSummaryChart, type ChannelGroup } from "./group-summary-chart";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";

type FetchSpecChannelStats = (
  channels: ChannelDef[],
  dateFrom: string,
  dateTo: string,
) => Promise<{
  rows: { canal: string; nombre: number; montant: number }[];
  total: { canal: string; nombre: number; montant: number };
}>;

/** Level-1 collapsible — main spec section with accent glow when open */
export function CL1({
  title,
  icon: Icon,
  accentBg,
  accentColor,
  accentGlow,
  summaryGroups,
  dateFrom,
  dateTo,
  fetchSpecChannelStats,
  children,
}: {
  title: string;
  icon: React.ElementType;
  accentBg: string;
  accentColor: string;
  accentGlow: string;
  summaryGroups?: ChannelGroup[];
  dateFrom?: string;
  dateTo?: string;
  fetchSpecChannelStats?: FetchSpecChannelStats;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden shadow-sm transition-all duration-300",
        open ? "border-border/80 bg-linear-to-b from-muted/30 to-card" : "border-border bg-card",
      )}
    >
      {open && <div className={cn("h-px w-full", accentGlow)} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center flex-none transition-transform duration-200",
              accentBg,
              open && "scale-110",
            )}
          >
            <Icon className={cn("w-4 h-4", accentColor)} />
          </div>
          <span className="text-sm font-bold text-foreground">{title}</span>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200 flex-none",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 py-4 space-y-3 border-t border-border/60">
              {summaryGroups && summaryGroups.length > 1 && fetchSpecChannelStats && (
                <GroupSummaryChart
                  groups={summaryGroups}
                  dateFrom={dateFrom ?? ""}
                  dateTo={dateTo ?? ""}
                  fetchSpecChannelStats={fetchSpecChannelStats}
                />
              )}
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
