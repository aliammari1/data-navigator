"use client";

import { useCallback, useState } from "react";
import { useEffect } from "react";
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
import { useDatasetRestore } from "@/platform/duckdb/use-dataset-restore";

export function DashboardClientShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: DashboardUser;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const toggle = useCallback(() => setAiOpen((v) => !v), []);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const datasets = useDataStore((s) => s.datasets);
  const setAppContext = useAppContextStore((s) => s.setContext);

  useDatasetRestore();

  useEffect(() => {
    const active = datasets.find((d) => d.id === activeDatasetId) ?? null;
    setAppContext({
      activeDatasetId,
      activeTableName: active?.tableName ?? null,
    });
  }, [activeDatasetId, datasets, setAppContext]);

  return (
    <DashboardLayout onAiToggle={toggle} user={user}>
      <LanAccessGate isAdmin={!!user}>
        {children}
      </LanAccessGate>
      <AIPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      <AIToggle onClick={toggle} active={aiOpen} />
      <LanStatusDock />
    </DashboardLayout>
  );
}
