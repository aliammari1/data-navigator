"use client";

/**
 * ChartTypeGallery — DF's chart-type picker: a Popover grid (2 columns) of
 * « Auto » + the 13 CHART_TYPES from core/constants. Every entry pairs a small
 * inline SVG glyph (currentColor strokes, 20×20) with its label; the selected
 * entry carries a `ring-primary` state. Picking calls `setChartType` on the
 * formulator store — chart specs stay deterministic, the AI never writes them.
 */

import { ChevronDown } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChartType } from "@/features/agent-canvas/core/types";
import { cn } from "@/shared/utils";
import { CHART_TYPES } from "../../core/constants";
import { useFormulatorV2Store } from "../../store/formulator-store";

type GalleryKey = ChartType | "auto";

const ITEMS: ReadonlyArray<{ type: GalleryKey; label: string }> = [
  { type: "auto", label: "Auto" },
  ...CHART_TYPES,
];

function Glyph({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const GLYPHS: Partial<Record<GalleryKey, ReactElement>> = {
  auto: (
    <Glyph>
      <path d="M10 3l1.7 4.6L16.5 9.3l-4.8 1.7L10 15.6l-1.7-4.6L3.5 9.3l4.8-1.7z" />
      <path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor" />
    </Glyph>
  ),
  bar: (
    <Glyph>
      <path d="M4 16V9" strokeWidth="2.5" />
      <path d="M10 16V4" strokeWidth="2.5" />
      <path d="M16 16v-5" strokeWidth="2.5" />
    </Glyph>
  ),
  "horizontal-bar": (
    <Glyph>
      <path d="M4 5h9" strokeWidth="2.5" />
      <path d="M4 10h12" strokeWidth="2.5" />
      <path d="M4 15h7" strokeWidth="2.5" />
    </Glyph>
  ),
  "stacked-bar": (
    <Glyph>
      <g fill="currentColor" stroke="none">
        <rect x="4" y="9" width="4" height="7" rx="0.5" opacity="0.45" />
        <rect x="4" y="4" width="4" height="4" rx="0.5" />
        <rect x="12" y="11" width="4" height="5" rx="0.5" opacity="0.45" />
        <rect x="12" y="7" width="4" height="3" rx="0.5" />
      </g>
    </Glyph>
  ),
  line: (
    <Glyph>
      <path d="M3 14l4-5 4 3 6-8" strokeWidth="1.8" />
    </Glyph>
  ),
  area: (
    <Glyph>
      <path d="M3 16v-3l4-5 4 3 6-7v12z" fill="currentColor" stroke="none" opacity="0.35" />
      <path d="M3 13l4-5 4 3 6-7" strokeWidth="1.8" />
    </Glyph>
  ),
  "multi-line": (
    <Glyph>
      <path d="M3 12l4-4 4 2 6-6" strokeWidth="1.8" />
      <path d="M3 17l4-3 4 1 6-4" strokeWidth="1.8" opacity="0.5" />
    </Glyph>
  ),
  pie: (
    <Glyph>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 10V3.5M10 10l5.6 3.3" />
    </Glyph>
  ),
  donut: (
    <Glyph>
      <circle cx="10" cy="10" r="6.4" strokeWidth="3" opacity="0.4" />
      <path d="M10 3.6a6.4 6.4 0 0 1 6.4 6.4" strokeWidth="3" />
    </Glyph>
  ),
  scatter: (
    <Glyph>
      <g fill="currentColor" stroke="none">
        <circle cx="5" cy="14" r="1.6" />
        <circle cx="9" cy="9" r="1.6" />
        <circle cx="13" cy="12" r="1.6" />
        <circle cx="15" cy="5" r="1.6" />
        <circle cx="7" cy="5" r="1.6" />
      </g>
    </Glyph>
  ),
  heatmap: (
    <Glyph>
      <g fill="currentColor" stroke="none">
        <rect x="3" y="3" width="4" height="4" rx="1" opacity="0.9" />
        <rect x="8" y="3" width="4" height="4" rx="1" opacity="0.35" />
        <rect x="13" y="3" width="4" height="4" rx="1" opacity="0.6" />
        <rect x="3" y="8" width="4" height="4" rx="1" opacity="0.3" />
        <rect x="8" y="8" width="4" height="4" rx="1" opacity="0.85" />
        <rect x="13" y="8" width="4" height="4" rx="1" opacity="0.5" />
        <rect x="3" y="13" width="4" height="4" rx="1" opacity="0.7" />
        <rect x="8" y="13" width="4" height="4" rx="1" opacity="0.4" />
        <rect x="13" y="13" width="4" height="4" rx="1" opacity="0.95" />
      </g>
    </Glyph>
  ),
  treemap: (
    <Glyph>
      <g fill="currentColor" stroke="none">
        <rect x="3" y="3" width="8" height="14" rx="1" opacity="0.85" />
        <rect x="12" y="3" width="5" height="8" rx="1" opacity="0.5" />
        <rect x="12" y="12" width="5" height="5" rx="1" opacity="0.3" />
      </g>
    </Glyph>
  ),
  radar: (
    <Glyph>
      <path d="M10 3l6.7 4.9-2.6 7.8H5.9L3.3 7.9z" />
      <path
        d="M10 6.5l3.3 2.4-1.2 3.9H7.9L6.7 8.9z"
        fill="currentColor"
        stroke="none"
        opacity="0.35"
      />
    </Glyph>
  ),
  funnel: (
    <Glyph>
      <g fill="currentColor" stroke="none">
        <path d="M3 4h14l-2 4H5z" opacity="0.85" />
        <path d="M6 10h8l-1.5 3h-5z" opacity="0.55" />
        <path d="M8.5 15h3l-.8 2.5h-1.4z" opacity="0.35" />
      </g>
    </Glyph>
  ),
};

const FALLBACK_GLYPH = (
  <Glyph>
    <rect x="4" y="4" width="12" height="12" rx="2" />
  </Glyph>
);

export function ChartTypeGallery({ className }: Readonly<{ className?: string }>) {
  const chartType = useFormulatorV2Store((s) => s.shelf.chartType);
  const setChartType = useFormulatorV2Store((s) => s.setChartType);
  const [open, setOpen] = useState(false);

  const current = ITEMS.find((item) => item.type === chartType) ?? ITEMS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2", className)}>
          <span className="text-muted-foreground">{GLYPHS[current.type] ?? FALLBACK_GLYPH}</span>
          {current.label}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="grid grid-cols-2 gap-1">
          {ITEMS.map((item) => {
            const selected = item.type === chartType;
            return (
              <button
                key={item.type}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setChartType(item.type);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "bg-muted ring-1 ring-primary",
                )}
              >
                <span className="text-muted-foreground">{GLYPHS[item.type] ?? FALLBACK_GLYPH}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
