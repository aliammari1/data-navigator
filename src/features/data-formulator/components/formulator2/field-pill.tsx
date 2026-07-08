"use client";

/**
 * FieldPill — the shared concept-pill visual for the formulator2 shelf UI.
 *
 * One pill family across the concepts panel, the encoding shelf and the
 * DragOverlay clone, so a field looks identical wherever it appears (DF's
 * FieldItem). Source drives the surface:
 *   - "original" — neutral card pill (a real column of a source table).
 *   - "derived"  — `--ai` tinted (column produced by an AI derivation).
 *   - "custom"   — dashed `--ai` border (typed name that doesn't exist yet,
 *     DF's "à dériver" state).
 *
 * Presentational only: drag wiring (useDraggable) and shelf controls
 * (aggregate caret, remove) are composed around/inside it by callers.
 */

import { CalendarDays, CaseSensitive, CircleHelp, Hash, ToggleLeft } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/shared/utils";
import type { ConceptItem } from "../../core/formulator/model";
import type { ColType } from "../../core/types";

export type PillSource = ConceptItem["source"];

const DTYPE_ICONS: Record<ColType, typeof Hash> = {
  number: Hash,
  string: CaseSensitive,
  date: CalendarDays,
  boolean: ToggleLeft,
  unknown: CircleHelp,
};

/** Dtype glyph used on every pill (number/string/date/boolean/unknown). */
export function DtypeIcon({ dtype, className }: Readonly<{ dtype?: ColType; className?: string }>) {
  const Icon = DTYPE_ICONS[dtype ?? "unknown"];
  return <Icon aria-hidden="true" className={cn("size-3 shrink-0", className)} />;
}

const SOURCE_CLASSES: Record<PillSource, string> = {
  original: "border-border bg-card text-foreground",
  derived: "border-ai/30 bg-ai/10 text-ai",
  custom: "border-dashed border-ai/30 bg-ai/10 text-ai",
};

export interface FieldPillProps extends ComponentPropsWithoutRef<"span"> {
  name: string;
  dtype?: ColType;
  source?: PillSource;
}

/**
 * The pill surface. Extra controls (aggregate caret, badge, remove button)
 * render through `children`, after the name.
 */
export function FieldPill({
  name,
  dtype,
  source = "original",
  className,
  children,
  ...props
}: FieldPillProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        SOURCE_CLASSES[source],
        className,
      )}
      {...props}
    >
      <DtypeIcon dtype={dtype} className="opacity-70" />
      <span className="truncate">{name}</span>
      {children}
    </span>
  );
}
