"use client";

/**
 * Per-column profile panel.
 *
 * Surfaces the REAL full-column statistics computed in the worker (null %,
 * approximate distinct, min/max/mean/median/stdev, and a numeric histogram
 * sparkline) — closing the legacy "preview-only" profiling gap. No DuckDB
 * round-trip needed for the in-browser paste path.
 */

import { cn } from "@/shared/utils";
import type { ColProfile } from "../lib/types";

interface ProfilePanelProps {
  profiles: ColProfile[];
  rowCount: number;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function Histogram({ profile }: { profile: ColProfile }) {
  const hist = profile.hist;
  if (!hist || hist.length === 0) return null;
  const peak = Math.max(...hist.map((bucket) => bucket.n), 1);

  return (
    <div className="flex h-8 items-end gap-px" aria-hidden>
      {hist.map((bucket) => (
        <div
          key={`${bucket.x0}:${bucket.x1}`}
          className="flex-1 rounded-sm bg-emerald-500/50"
          style={{ height: `${Math.max(2, (bucket.n / peak) * 100)}%` }}
          title={`${formatNumber(bucket.x0)} – ${formatNumber(bucket.x1)}: ${bucket.n}`}
        />
      ))}
    </div>
  );
}

export function ProfilePanel({ profiles, rowCount }: ProfilePanelProps) {
  if (profiles.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 p-3">
      {profiles.map((profile) => {
        const nullPct = rowCount > 0 ? (profile.nullCount / rowCount) * 100 : 0;
        return (
          <div
            key={profile.name}
            className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-medium text-foreground">
                {profile.name}
              </span>
              <span
                className={cn(
                  "flex-none rounded px-1 py-0.5 font-mono text-[9px]",
                  profile.type === "number" && "bg-emerald-500/15 text-emerald-400",
                  profile.type === "string" && "bg-blue-500/15 text-blue-400",
                  profile.type === "date" && "bg-purple-500/15 text-purple-400",
                  profile.type === "boolean" && "bg-amber-500/15 text-amber-400",
                )}
              >
                {profile.type}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              <span>Distinct</span>
              <span className="text-right font-mono text-foreground">
                {formatNumber(profile.distinctApprox)}
              </span>
              <span>Null</span>
              <span className="text-right font-mono text-foreground">
                {profile.nullCount.toLocaleString()} ({nullPct.toFixed(1)}%)
              </span>
              {profile.numericCount > 0 && (
                <>
                  <span>Min</span>
                  <span className="text-right font-mono text-foreground">
                    {formatNumber(profile.min)}
                  </span>
                  <span>Max</span>
                  <span className="text-right font-mono text-foreground">
                    {formatNumber(profile.max)}
                  </span>
                  <span>Mean</span>
                  <span className="text-right font-mono text-foreground">
                    {formatNumber(profile.mean)}
                  </span>
                  <span>Median</span>
                  <span className="text-right font-mono text-foreground">
                    {formatNumber(profile.median)}
                  </span>
                  <span>Std dev</span>
                  <span className="text-right font-mono text-foreground">
                    {formatNumber(profile.stdev)}
                  </span>
                </>
              )}
            </div>

            {profile.numericCount > 0 && <Histogram profile={profile} />}
          </div>
        );
      })}
    </div>
  );
}
