"use client";

import { useEffect } from "react";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import type { DashboardUser } from "@/features/dashboard-shell/nav/nav-config";
import { DashboardBoot } from "@/features/dashboard-shell/shell/dashboard-boot";
import { DashboardLayout } from "@/features/dashboard-shell/shell/dashboard-layout";
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

  useEffect(() => {
    const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;
    setAppContext({
      activeDatasetId,
      activeTableName: activeDataset?.tableName ?? null,
    });
  }, [activeDatasetId, datasets, setAppContext]);

  return (
    <DashboardLayout user={user}>
      {/* Global appearance/density/animations applier — mounted once so the
          accent picker and "Réduire les animations" work app-wide, not just on
          the Settings screen (blueprint §4). */}
      <SettingsEffects />
      <DashboardBoot />
      {children}
    </DashboardLayout>
  );
}
