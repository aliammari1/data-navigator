"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppCommands, useRegisterPages } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { useMonitorEngine } from "../hooks/useMonitorEngine";
import { monitorStoreApi, useMonitorStore } from "../store/monitor-store";

const MONITOR_PAGES = [
  { id: "health", label: "Santé des canaux" },
  { id: "rules", label: "Règles d'alerte" },
  { id: "timeline", label: "Chronologie des alertes" },
  { id: "sla", label: "Conformité SLA" },
  { id: "sound", label: "Son & notifications" },
];

import { AlertRulesTab } from "../tabs/AlertRulesTab";
import { ChannelHealthTab } from "../tabs/ChannelHealthTab";

// Lazy-load the chart-heavy tabs so ECharts/OffscreenChart only load when the
// timeline / SLA tab actually opens (smaller initial route chunk).
const TabFallback = () => (
  <div className="h-64 animate-pulse rounded-xl bg-slate-900/60 border border-slate-800" />
);

const AlertTimelineTab = dynamic(
  () => import("../tabs/AlertTimelineTab").then((m) => m.AlertTimelineTab),
  { ssr: false, loading: TabFallback },
);
const SlaComplianceTab = dynamic(
  () => import("../tabs/SlaComplianceTab").then((m) => m.SlaComplianceTab),
  { ssr: false, loading: TabFallback },
);
const SoundConfigTab = dynamic(
  () => import("../tabs/SoundConfigTab").then((m) => m.SoundConfigTab),
  { ssr: false, loading: TabFallback },
);

export function ChannelMonitorScreen() {
  // Single top-level engine: pulls real metrics, evaluates rules, fires alerts —
  // independent of which tab is mounted, Page-Visibility gated.
  const { source, lastRefresh } = useMonitorEngine();

  // Hydrate the high-volume history from IndexedDB once on mount (async, non-blocking).
  useEffect(() => {
    void monitorStoreApi.getState().hydrateFromDb();
  }, []);

  // Atomic selector — only re-renders the header badge on notification changes.
  const notifications = useMonitorStore.use.notifications();
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Controlled tabs so the desktop View menu can navigate + reflect the page.
  const [activeTab, setActiveTab] = useState<string>("health");

  // Surface the tabs as pages in the universal Affichage menu.
  useRegisterPages(useWindowId(), MONITOR_PAGES, activeTab);

  // Let the app menu drive real screen/store behaviour via the command bus.
  useAppCommands("monitor", {
    navigate: (payload) => setActiveTab((payload as { pageId: string }).pageId),
    "mark-read": () => monitorStoreApi.getState().markAllNotificationsRead(),
    "clear-notifications": () => monitorStoreApi.getState().clearNotifications(),
    "clear-events": () => monitorStoreApi.getState().clearEvents(),
    "toggle-sound": () => {
      const store = monitorStoreApi.getState();
      store.setSoundEnabled(!store.soundEnabled);
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Page header */}
      <div className="border-b border-slate-800/60 bg-slate-900/40 px-6 py-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Channel Operations Monitor
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Real-time channel health, alert management, and SLA compliance tracking
              <span
                className={`ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  source === "duckdb"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-slate-600/40 bg-slate-700/20 text-slate-400"
                }`}
              >
                {source === "duckdb" ? "Live DuckDB" : "Demo data"}
              </span>
            </p>
          </div>
          {unreadCount > 0 && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <span className="size-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-medium">
                {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 w-full sm:w-auto">
            <TabsTrigger value="health">Channel Health</TabsTrigger>
            <TabsTrigger value="rules">Alert Rules</TabsTrigger>
            <TabsTrigger value="timeline">Alert Timeline</TabsTrigger>
            <TabsTrigger value="sla">SLA Compliance</TabsTrigger>
            <TabsTrigger value="sound">
              Sound &amp; Notifications
              {unreadCount > 0 && (
                <span className="ml-1 bg-red-500/20 text-red-400 text-[10px] px-1 rounded-full">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="health">
            <ChannelHealthTab lastRefresh={lastRefresh} />
          </TabsContent>
          <TabsContent value="rules">
            <AlertRulesTab />
          </TabsContent>
          <TabsContent value="timeline">
            <AlertTimelineTab />
          </TabsContent>
          <TabsContent value="sla">
            <SlaComplianceTab />
          </TabsContent>
          <TabsContent value="sound">
            <SoundConfigTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
