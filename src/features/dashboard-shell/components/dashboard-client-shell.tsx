"use client";

import { useEffect } from "react";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import { useSettingsStore } from "@/core/stores/settings-store";
import { JoinRequestDialog } from "@/features/collaboration/components/JoinRequestDialog";
import { LanAccessGate } from "@/features/dashboard-shell/components/lan-access-gate";
import { LanStatusDock } from "@/features/dashboard-shell/components/lan-status-dock";
import { LiveCursors } from "@/features/dashboard-shell/components/live-cursors";
import type { DashboardUser } from "@/features/dashboard-shell/nav/nav-config";
import { DashboardBoot } from "@/features/dashboard-shell/shell/dashboard-boot";
import { DashboardLayout } from "@/features/dashboard-shell/shell/dashboard-layout";
import { DashboardUserProvider } from "@/platform/auth/dashboard-access";
import { SettingsEffects } from "@/features/settings/components/settings-effects";

export function DashboardClientShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: DashboardUser;
}) {
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const datasets = useDataStore((state) => state.datasets);
  const setAppContext = useAppContextStore((state) => state.setContext);
  // Guest devices (Settings > Account > Role = Viewer) must join a LAN session
  // before the dashboard shows: they exist to view someone else's shared data.
  const deviceRole = useSettingsStore((s) => s.role);

  useEffect(() => {
    const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;
    setAppContext({
      activeDatasetId,
      activeTableName: activeDataset?.tableName ?? null,
    });
  }, [activeDatasetId, datasets, setAppContext]);

  return (
    <DashboardUserProvider isGuest={user?.isGuest === true} permissions={user?.permissions}>
      <DashboardLayout user={user}>
        {/* Global appearance/density/animations applier — mounted once so the
            accent picker and "Réduire les animations" work app-wide, not just on
            the Settings screen (blueprint §4). */}
        <SettingsEffects />
        <DashboardBoot />
        <LanAccessGate isAdmin={Boolean(user) && deviceRole !== "viewer"}>
          {children}
        </LanAccessGate>

        <LanStatusDock />
        {/* Multiplayer cursors + presence page sync (renders only while connected). */}
        <LiveCursors />
        {/* Show join-request approval dialog globally so the Admin sees it from
            any dashboard screen, not only from the Collaboration page. */}
        {!user?.isGuest && <JoinRequestDialog />}
      </DashboardLayout>
    </DashboardUserProvider>
  );
}
