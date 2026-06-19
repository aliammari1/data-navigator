"use client";

import { Brain, Database, HardDrive, Keyboard, Radio, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useActivityStore } from "@/core/stores/activity-store";
import { useDataStore } from "@/core/stores/data-store";
import { PageHeader } from "@/features/dashboard-shell/components/page-header";
import { useEngineInfo } from "@/features/dashboard-shell/shell/use-engine-info";
import { useLanStatus } from "@/features/dashboard-shell/shell/use-lan-status";
import { useModelStatus } from "@/features/dashboard-shell/shell/use-model-status";
import { useShellStore } from "@/features/dashboard-shell/shell/shell-store";
import { getStorageInfo, type StorageInfo } from "@/platform/storage";
import { cn } from "@/shared/utils";

/**
 * Shell overview / diagnostics.
 *
 * Surfaces the live shell runtime — the resolved DuckDB engine, the local AI
 * model status, the LAN resting state, durable storage quota, and the persisted
 * layout state — all from real sources (no fabricated numbers). Useful as a
 * self-test surface for the offline-first wire-in this feature owns.
 */
export function ShellOverviewScreen() {
  const engine = useEngineInfo();
  const model = useModelStatus();
  const lan = useLanStatus();
  const datasetCount = useDataStore((s) => s.datasets.length);
  const activityCount = useActivityStore((s) => s.events.length);
  const sidebarCollapsed = useShellStore((s) => s.sidebarCollapsed);
  const aiPanelOpen = useShellStore((s) => s.aiPanelOpen);
  const aiPanelTab = useShellStore((s) => s.aiPanelTab);

  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStorageInfo()
      .then((info) => {
        if (!cancelled) setStorage(info);
      })
      .catch(() => {
        /* ignore — surface defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    {
      icon: Database,
      label: "DuckDB engine",
      value: engine.label,
      hint: engine.engine === "native" ? "Main-process native engine" : "In-browser WASM engine",
      tone: "text-teal-400",
    },
    {
      icon: model.kind === "ready" ? Sparkles : Brain,
      label: "Local AI model",
      value: model.label,
      hint:
        model.kind === "ready"
          ? `${model.providerId ?? "provider"} · ${model.model ?? "model"}`
          : "Rule-based NL→SQL until a model is downloaded",
      tone: model.kind === "ready" ? "text-emerald-400" : "text-blue-400",
    },
    {
      icon: Radio,
      label: "LAN collaboration",
      value: lan.state,
      hint: lan.state === "connected" ? `${lan.peerCount} peer(s)` : "No active hub session",
      tone: lan.state === "connected" ? "text-emerald-400" : "text-muted-foreground",
    },
    {
      icon: HardDrive,
      label: "Durable storage",
      value: storage ? `${storage.usedMB} / ${storage.quotaMB || "?"} MB` : "Estimating…",
      hint: storage?.isPersistent ? "Pinned (persist granted)" : "Not pinned",
      tone: "text-amber-400",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Shell overview"
        description="Live offline-first runtime status for the dashboard shell."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Shell overview" }]}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent">
                  <Icon className={cn("h-5 w-5", card.tone)} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </div>
                  <div className="mt-0.5 truncate text-lg font-semibold capitalize text-foreground">
                    {card.value}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{card.hint}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Datasets" value={datasetCount} />
        <Stat label="Activity events" value={activityCount} />
        <Stat
          label="Persisted layout"
          value={`${sidebarCollapsed ? "collapsed" : "expanded"} · ${
            aiPanelOpen ? "AI open" : "AI closed"
          } · ${aiPanelTab}`}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Keyboard className="h-4 w-4 text-muted-foreground" />
          Keyboard shortcuts
        </div>
        <dl className="grid gap-2 sm:grid-cols-3">
          {[
            ["Command palette", "Ctrl / Cmd + K"],
            ["Toggle AI copilot", "Ctrl / Cmd + \\"],
            ["Toggle sidebar", "Ctrl / Cmd + B"],
          ].map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-2 text-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="rounded-md border border-border bg-accent px-2 py-0.5 font-mono text-[11px] text-foreground">
                {keys}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}
