"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, useId, useState } from "react";
import type { FeatureDef } from "../data/help-content";
import { cn } from "@/shared/utils";

/**
 * Collapsible feature card.
 *
 * Uses a CSS `grid-template-rows: 0fr → 1fr` accordion instead of a measured
 * Framer Motion `height: auto` animation, which removes the per-toggle layout
 * measure pass (cheaper on low-end CPUs / iGPUs). Memoized so re-renders of the
 * parent list (e.g. while typing in the search box) do not re-render every card.
 */
function FeatureCardImpl({ f }: { f: FeatureDef }) {
  const [open, setOpen] = useState(false);
  const Icon = f.icon;
  const panelId = useId();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div
          className={cn(
            "w-8 h-8 rounded-lg border flex items-center justify-center flex-none",
            f.color,
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">{f.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {f.summary.slice(0, 72)}…
          </div>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground flex-none transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">{f.summary}</p>
            {f.tips.length > 0 && (
              <ul className="space-y-1.5">
                {f.tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ChevronRight className="w-3 h-3 text-indigo-400 flex-none mt-0.5" />
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const FeatureCard = memo(FeatureCardImpl);
