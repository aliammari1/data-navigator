"use client";

import { useEffect, useMemo, useState } from "react";
import { CANAL_CONFIG } from "@/features/telecom/lib/canal-config";
import { readLANSettings } from "@/features/telecom/lib/lan-collab";
import type * as Types from "@/features/telecom/types";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";

export interface SharedOverviewSnapshot {
  version: 1;
  presenterId: string;
  presenterName: string;
  updatedAt: number;
  fileName: string;
  reportDate: string;
  kpi: Types.KPISummary;
  canals: Array<Omit<Types.CanalSummary, "icon">>;
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  forecast: ForecastPoint[];
}

function rehydrateCanals(canals: Array<Omit<Types.CanalSummary, "icon">>): Types.CanalSummary[] {
  return canals.map((canal) => ({
    ...canal,
    icon: CANAL_CONFIG[canal.key]?.icon ?? CANAL_CONFIG.bill_payment.icon,
  }));
}

function parseSnapshot(raw: string | undefined): SharedOverviewSnapshot | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SharedOverviewSnapshot;
    if (parsed.version !== 1 || !parsed.kpi) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useSharedOverview({
  enabled,
  fileName,
  reportDate,
  kpi,
  canals,
  hourly,
  statusData,
  forecast,
}: {
  enabled: boolean;
  fileName: string;
  reportDate: string;
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  forecast: ForecastPoint[];
}) {
  const [remote, setRemote] = useState<SharedOverviewSnapshot | null>(null);
  const presenter = useMemo(() => readLANSettings().peer, []);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    import("@/platform/collab/collab")
      .then(({ sharedOverview, startCollabSync, ydoc }) => {
        cleanups.push(startCollabSync());

        const observe = () => {
          const snapshot = parseSnapshot(sharedOverview.get("snapshot"));
          if (!snapshot || snapshot.presenterId === presenter.id) return;
          setRemote(snapshot);
        };

        sharedOverview.observe(observe);
        cleanups.push(() => sharedOverview.unobserve(observe));
        observe();

        if (!enabled || !kpi) return;

        const snapshot: SharedOverviewSnapshot = {
          version: 1,
          presenterId: presenter.id,
          presenterName: presenter.name,
          updatedAt: Date.now(),
          fileName,
          reportDate,
          kpi,
          canals: canals.map(({ icon: _icon, ...canal }) => canal),
          hourly,
          statusData,
          forecast,
        };

        ydoc.transact(() => {
          sharedOverview.set("snapshot", JSON.stringify(snapshot));
        });
      })
      .catch(() => {
        // Import failed — cleanups array stays empty, nothing to do
      });

    return () => {
      cleanups.forEach((fn) => {
        fn();
      });
    };
  }, [
    enabled,
    fileName,
    forecast,
    hourly,
    kpi,
    canals,
    presenter.id,
    presenter.name,
    reportDate,
    statusData,
  ]);

  return {
    remoteOverview: remote
      ? {
          ...remote,
          canals: rehydrateCanals(remote.canals),
        }
      : null,
  };
}
