"use client";

import { AlertCircle, CheckCircle2, Clock, Info, RefreshCw, XCircle } from "lucide-react";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { normalizeStatusCode } from "@/features/telecom/lib/sql";

export function StatusBadge({
  status,
  mapping,
}: {
  status: string;
  mapping?: Types.StatusMapping[];
}) {
  const raw = (status ?? "").toUpperCase();
  const s = mapping ? normalizeStatusCode(raw, mapping) : raw;
  const map: Record<string, string> = {
    SUCCESS:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    DECLINED:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
    INSTANCE:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    REFUND:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    SUBMITTED:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    OTHER: "bg-muted/30 text-muted-foreground border-border",
  };
  const icons: Record<string, React.ReactNode> = {
    SUCCESS: <CheckCircle2 className="w-3 h-3" />,
    DECLINED: <XCircle className="w-3 h-3" />,
    INSTANCE: <Clock className="w-3 h-3" />,
    REFUND: <RefreshCw className="w-3 h-3" />,
    SUBMITTED: <AlertCircle className="w-3 h-3" />,
    OTHER: <Info className="w-3 h-3" />,
  };
  return (
    <span
      title={raw && raw !== s ? `Code brut: ${raw}` : undefined}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold",
        map[s] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {icons[s]} {s || "—"}
    </span>
  );
}
