"use client";

/**
 * Virtualized column-explorer list.
 *
 * Replaces the old `AnimatePresence mode="popLayout"` map that mounted a
 * layout-animated `motion.div` for **every** matching column — which janked
 * badly on wide datasets (hundreds–thousands of columns). With
 * `@tanstack/react-virtual` only the visible cards mount, so the list stays at
 * 60fps regardless of column count.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { Grid3x3 } from "lucide-react";
import { useCallback, useRef } from "react";
import { qualityColor, typeColor, typeIcon } from "@/features/parsed-data/model/profile-format";
import { profileScore } from "@/features/parsed-data/model/summary-map";
import type { ColProfile } from "@/features/parsed-data/model/types";
import { cn } from "@/shared/utils";

const ROW_HEIGHT = 100;

function ColumnListCard({
  profile,
  selected,
  onClick,
}: {
  profile: ColProfile;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = typeIcon(profile.type);
  const score = profileScore(profile);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-2xl border p-3 text-left transition-colors",
        selected
          ? "border-violet-500/50 bg-violet-500/10 shadow-sm"
          : "border-border bg-card hover:border-violet-500/30 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("rounded-xl p-2", typeColor(profile.type))}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm font-semibold text-foreground">
            {profile.name}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {profile.sqlType}
            </span>

            {profile.nullRate > 0.05 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">
                {(profile.nullRate * 100).toFixed(1)}% null
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${score * 100}%`,
                  backgroundColor: qualityColor(score),
                }}
              />
            </div>
            <span className="text-[10px] font-bold" style={{ color: qualityColor(score) }}>
              {(score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function ColumnList({
  profiles,
  selected,
  onSelect,
  empty,
}: {
  profiles: ColProfile[];
  selected: string | null;
  onSelect: (name: string) => void;
  empty: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: profiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => ROW_HEIGHT, []),
    overscan: 8,
  });

  if (profiles.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
        <Grid3x3 className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm text-muted-foreground">
          {empty ? "No profiles available yet." : "No columns match your filters."}
        </p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="max-h-[calc(100vh-25rem)] overflow-y-auto pr-1">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const profile = profiles[virtualRow.index];
          return (
            <div
              key={profile.name}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: 8,
              }}
            >
              <ColumnListCard
                profile={profile}
                selected={selected === profile.name}
                onClick={() => onSelect(profile.name)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
