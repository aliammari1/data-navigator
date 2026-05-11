"use client";

import { Download } from "lucide-react";
import { AtlasButton } from "@/design/primitives/button";
import { AtlasChip } from "@/design/primitives/chip";
import type { LineageEntry } from "@/features/auto-analyst/core/types";

export function StepLineage({
  entries,
  table,
}: {
  entries: LineageEntry[];
  table: string;
}) {
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ table, entries }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analyst-lineage-${table}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--atlas-text-subtle)]">
          {entries.length} events
        </span>
        <AtlasButton variant="outline" size="sm" onClick={exportJSON}>
          <Download className="w-3 h-3" /> Export JSON
        </AtlasButton>
      </div>
      <div className="space-y-1.5">
        {entries.length === 0 && (
          <p className="text-sm text-[var(--atlas-text-subtle)]">
            Nothing logged yet.
          </p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="rounded-[var(--atlas-radius-2)] border border-[var(--atlas-border)] bg-[var(--atlas-surface)] px-3 py-2"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <AtlasChip severity="accent" size="sm">
                {e.step}
              </AtlasChip>
              <span className="text-[10px] text-[var(--atlas-text-subtle)] tabular-nums">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
              {e.durationMs && (
                <span className="ml-auto text-[10px] text-[var(--atlas-success-fg)] tabular-nums">
                  {e.durationMs}ms
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--atlas-text)]">{e.message}</div>
            {e.detail && (
              <div className="text-[10px] text-[var(--atlas-text-subtle)] font-mono mt-0.5 truncate">
                {e.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
