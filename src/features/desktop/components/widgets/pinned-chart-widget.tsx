"use client";

import { BarChart2 } from "lucide-react";
import { useDesktopActions } from "@/features/desktop/store/desktop-store";

interface PinnedChartWidgetProps {
  config: Record<string, unknown>;
}

export function PinnedChartWidget({ config }: PinnedChartWidgetProps) {
  const { openApp } = useDesktopActions();
  const title = String(config.title || "Graphique épinglé");

  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className="flex items-center gap-1.5">
        <BarChart2 className="size-3.5 shrink-0" style={{ color: "hsl(var(--glass-accent))" }} />
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--glass-text-dim)" }}
        >
          Graphique
        </span>
      </div>
      <p
        className="line-clamp-2 text-xs font-medium leading-snug"
        style={{ color: "var(--glass-text)" }}
        title={title}
      >
        {title}
      </p>
      <button
        type="button"
        onClick={() => {
          // Pass the formulatorWidgetId as a prop so the formulator screen can
          // scroll to / highlight the matching widget if it handles openWidgetId.
          openApp("data-formulator", {
            props: config.formulatorWidgetId
              ? { openWidgetId: String(config.formulatorWidgetId) }
              : undefined,
          });
        }}
        className="text-left text-[10px] underline-offset-2 hover:underline"
        style={{ color: "hsl(var(--glass-accent))" }}
      >
        Ouvrir →
      </button>
    </div>
  );
}
