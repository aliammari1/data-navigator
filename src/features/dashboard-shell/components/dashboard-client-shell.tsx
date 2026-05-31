"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import {
  AIPanel,
  AIToggle,
} from "@/features/dashboard-shell/components/ai-panel";
import { LanAccessGate } from "@/features/dashboard-shell/components/lan-access-gate";
import { LanStatusDock } from "@/features/dashboard-shell/components/lan-status-dock";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/features/dashboard-shell/components/sidebar-nav";

export function DashboardClientShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: DashboardUser;
}) {
  const [aiOpen, setAiOpen] = useState(false);

  const activeDatasetId = useDataStore((state) => state.activeDatasetId);
  const datasets = useDataStore((state) => state.datasets);
  const setAppContext = useAppContextStore((state) => state.setContext);

  const toggleAiPanel = useCallback(() => {
    setAiOpen((value) => !value);
  }, []);

  const closeAiPanel = useCallback(() => {
    setAiOpen(false);
  }, []);

  useEffect(() => {
    const activeDataset =
      datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;

    /**
     * New DuckDB model:
     * - dataset.id is the stable app/catalog id.
     * - dataset.tableName, if still present in Zustand, should represent the
     *   DuckDB view name.
     *
     * This keeps old AI/context consumers working while the rest of the app is
     * migrated from "table" language to "dataset/view" language.
     */
    setAppContext({
      activeDatasetId,
      activeTableName: activeDataset?.tableName ?? null,
    });
  }, [activeDatasetId, datasets, setAppContext]);

  return (
    <DashboardLayout onAiToggle={toggleAiPanel} user={user}>
      <LanAccessGate isAdmin={Boolean(user)}>{children}</LanAccessGate>

      <AIPanel open={aiOpen} onClose={closeAiPanel} />
      <AIToggle onClick={toggleAiPanel} active={aiOpen} />
      <LanStatusDock />
    </DashboardLayout>
  );
}
