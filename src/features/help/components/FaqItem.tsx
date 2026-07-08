"use client";

import { ChevronDown } from "lucide-react";
import { memo, useId, useState } from "react";
import { cn } from "@/shared/utils";

/**
 * Collapsible FAQ accordion item.
 *
 * Uses the CSS `grid-template-rows` accordion trick (no measured height
 * animation) and is memoized so list-level re-renders do not re-render every
 * item.
 */
function FaqItemImpl({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
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
          <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export const FaqItem = memo(FaqItemImpl);
