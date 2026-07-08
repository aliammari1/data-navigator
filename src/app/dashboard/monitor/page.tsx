import { Suspense } from "react";
import { ChannelMonitorScreen } from "@/features/channel-monitor/screens/ChannelMonitorScreen";

export const metadata = {
  title: "Channel Operations Monitor | Data Navigator",
  description:
    "Real-time channel health status, alert rules engine, alert timeline, SLA compliance, and sound notification configuration for telecom analytics.",
};

function MonitorSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 animate-pulse">
      <div className="border-b border-slate-800/60 bg-slate-900/40 px-6 py-5">
        <div className="h-7 w-72 rounded-lg bg-slate-800" />
        <div className="mt-1.5 h-4 w-96 rounded-md bg-slate-800/60" />
      </div>
      <div className="px-6 py-6 space-y-5">
        {/* Tab bar skeleton */}
        <div className="flex gap-1 h-9 w-full max-w-2xl">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-md bg-slate-800/60" />
          ))}
        </div>
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-900/60 border border-slate-800" />
          ))}
        </div>
        {/* Channel grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-slate-900/60 border border-slate-800" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MonitorPage() {
  return (
    <Suspense fallback={<MonitorSkeleton />}>
      <ChannelMonitorScreen />
    </Suspense>
  );
}
