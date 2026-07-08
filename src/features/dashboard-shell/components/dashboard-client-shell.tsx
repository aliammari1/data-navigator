"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import { useSettingsStore } from "@/core/stores/settings-store";
import { AIToggle } from "@/features/dashboard-shell/components/ai-panel";
import { LanAccessGate } from "@/features/dashboard-shell/components/lan-access-gate";
import { LanStatusDock } from "@/features/dashboard-shell/components/lan-status-dock";
import { LiveCursors } from "@/features/dashboard-shell/components/live-cursors";
import { SettingsEffects } from "@/features/settings/components/settings-effects";
import { DashboardBoot } from "@/features/dashboard-shell/shell/dashboard-boot";
import { DashboardLayout } from "@/features/dashboard-shell/shell/dashboard-layout";
import type { DashboardUser } from "@/features/dashboard-shell/nav/nav-config";
import { useShellActions, useShellStore } from "@/features/dashboard-shell/shell/shell-store";

/**
 * Lazy-loaded AI panel.
 *
 * The 1289-line panel (ECharts/OffscreenChart + NLQ + insights + DuckDB) is the
 * single biggest first-paint bundle cost for the dashboard route. It is split
 * out via `next/dynamic` and only mounted after the user opens it the first time
 * (`aiEverOpened`), so the shell chunk no longer eagerly pulls the panel's whole
 * module graph and effect wiring on first dashboard paint.
 */
const AIPanel = dynamic(
  () => import("@/features/dashboard-shell/components/ai-panel").then((m) => m.AIPanel),
  { ssr: false },
);

export function DashboardClientShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: DashboardUser;
}) {
  const aiOpen = useShellStore((s) => s.aiPanelOpen);
  const { setAiPanelOpen, toggleAiPanel } = useShellActions();
  const [aiEverOpened, setAiEverOpened] = useState(aiOpen);

  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const datasets = useDataStore((state) => state.datasets);
  const setAppContext = useAppContextStore((state) => state.setContext);
  // Guest devices (Settings > Account > Role = Viewer) must join a LAN session
  // before the dashboard shows: they exist to view someone else's shared data.
  const deviceRole = useSettingsStore((s) => s.role);

  // If the persisted layout restored with the panel open (or it is opened via a
  // keyboard shortcut / command palette without going through the toggle button),
  // ensure the lazy panel mounts.
  useEffect(() => {
    if (aiOpen) setAiEverOpened(true);
  }, [aiOpen]);

  const handleAiToggle = useCallback(() => {
    setAiEverOpened(true);
    toggleAiPanel();
  }, [toggleAiPanel]);

  const closeAiPanel = useCallback(() => {
    setAiPanelOpen(false);
  }, [setAiPanelOpen]);

  useEffect(() => {
    const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;
    setAppContext({
      activeDatasetId,
      activeTableName: activeDataset?.tableName ?? null,
    });
  }, [activeDatasetId, datasets, setAppContext]);

  return (
    <DashboardLayout onAiToggle={handleAiToggle} user={user}>
      {/* Global appearance/density/animations applier — mounted once so the
          accent picker and "Réduire les animations" work app-wide, not just on
          the Settings screen (blueprint §4). */}
      <SettingsEffects />
      <DashboardBoot />
      <LanAccessGate isAdmin={Boolean(user) && deviceRole !== "viewer"}>{children}</LanAccessGate>

      {aiEverOpened && <AIPanel open={aiOpen} onClose={closeAiPanel} />}
      <AIToggle onClick={handleAiToggle} active={aiOpen} />
      <LanStatusDock />
      {/* Multiplayer cursors + presence page sync (renders only while connected). */}
      <LiveCursors />
    </DashboardLayout>
  );
}
