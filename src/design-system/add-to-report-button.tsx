"use client";

import { Check, FilePlus2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type ReportDraftItem, useReportDraftActions } from "@/core/stores/report-draft-store";
import { cn } from "@/shared/utils";

/**
 * "Ajouter au rapport" — the shared analyse→rapporter action. Stages an item in
 * the report-draft store (Report Studio reads it). Briefly confirms, then resets.
 * Drop this on any insight/chart/KPI across the analysis surfaces.
 */
export function AddToReportButton({
  item,
  size = "sm",
  variant = "outline",
  label = "Ajouter au rapport",
  className,
}: {
  item: Omit<ReportDraftItem, "id" | "createdAt">;
  size?: "xs" | "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
  label?: string;
  className?: string;
}) {
  const { addItem } = useReportDraftActions();
  const [added, setAdded] = useState(false);

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn(added && "text-positive", className)}
      onClick={() => {
        addItem(item);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1600);
      }}
    >
      {added ? <Check className="size-3.5" /> : <FilePlus2 className="size-3.5" />}
      {added ? "Ajouté" : label}
    </Button>
  );
}
