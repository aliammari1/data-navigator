"use client";

import type { SpecChRow, SpecChStatusRow } from "@/features/telecom/lib/queries";
import { type ChannelGroup, GroupSummaryChart } from "./group-summary-chart";
import { SpecChannelTable } from "./spec-channel-table";
import { CanalRule } from "../types";

export function VoiceLineSection({
  ttcash,
  voucher,
  dateFrom,
  dateTo,
  fetchSpecChannelStats,
  fetchSpecCanalStatusMatrix,
}: {
  ttcash: CanalRule[];
  voucher: CanalRule[];
  dateFrom: string;
  dateTo: string;
  fetchSpecChannelStats: (
    channels: CanalRule[],
    dateFrom: string,
    dateTo: string,
  ) => Promise<{ rows: SpecChRow[]; total: SpecChRow }>;
  fetchSpecCanalStatusMatrix?: (
    channels: CanalRule[],
    dateFrom: string,
    dateTo: string,
  ) => Promise<SpecChStatusRow[]>;
}) {
  const summaryGroups: ChannelGroup[] = [
    { label: "TTCASH", channels: ttcash, color: "#89b4fa" },
    { label: "Voucher", channels: voucher, color: "#cba6f7" },
  ];
  return (
    <div className="space-y-6">
      <GroupSummaryChart
        groups={summaryGroups}
        dateFrom={dateFrom}
        dateTo={dateTo}
        fetchSpecChannelStats={fetchSpecChannelStats}
      />
      <SpecChannelTable
        channels={ttcash}
        dateFrom={dateFrom}
        dateTo={dateTo}
        title="Par TTCASH"
        fetchSpecChannelStats={fetchSpecChannelStats}
        fetchSpecCanalStatusMatrix={fetchSpecCanalStatusMatrix}
      />
      <div className="border-t border-border/30" />
      <SpecChannelTable
        channels={voucher}
        dateFrom={dateFrom}
        dateTo={dateTo}
        title="Par Voucher"
        fetchSpecChannelStats={fetchSpecChannelStats}
        fetchSpecCanalStatusMatrix={fetchSpecCanalStatusMatrix}
      />
    </div>
  );
}
