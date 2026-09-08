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

/** Level-2 collapsible — sub-group */
export function CL2({
  title,
  summaryGroups,
  dateFrom,
  dateTo,
  fetchSpecChannelStats,
  children,
}: {
  title: string;
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
        "rounded-xl border overflow-hidden transition-colors duration-200",
        open ? "border-primary/25 bg-primary/5" : "border-border/60 bg-muted/20",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-1.5 h-5 rounded-full transition-colors duration-200 flex-none",
              open ? "bg-primary" : "bg-primary/40",
            )}
          />
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 flex-none",
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
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-2.5 border-t border-primary/15">
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
