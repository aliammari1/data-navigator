"use client";

import { SpecChannelTable } from "./spec-channel-table";
import { GroupSummaryChart, type ChannelGroup } from "./group-summary-chart";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import type { SpecChRow } from "@/features/telecom/lib/queries";

export function VoiceLineSection({
  ttcash,
  voucher,
  dateFrom,
  dateTo,
  fetchSpecChannelStats,
}: {
  ttcash: ChannelDef[];
  voucher: ChannelDef[];
  dateFrom: string;
  dateTo: string;
  fetchSpecChannelStats: (
    channels: ChannelDef[],
    dateFrom: string,
    dateTo: string,
  ) => Promise<{ rows: SpecChRow[]; total: SpecChRow }>;
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
      />
      <div className="border-t border-border/30" />
      <SpecChannelTable
        channels={voucher}
        dateFrom={dateFrom}
        dateTo={dateTo}
        title="Par Voucher"
        fetchSpecChannelStats={fetchSpecChannelStats}
      />
    </div>
  );
}
