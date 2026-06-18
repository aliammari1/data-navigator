"use client";

import { GitMerge } from "lucide-react";
import { ReconciliationWizard } from "@/features/reconciliation/components/ReconciliationWizard";

export function ReconciliationScreen() {
  return (
    <div className="flex flex-col gap-6 p-6" data-tour="reconciliation">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <GitMerge className="size-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-slate-100">Reconciliation Wizard</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Diff two datasets in DuckDB (FULL OUTER JOIN), surface material
          variances, investigate with the on-device model, and sign off an
          immutable, exportable reconciliation record — fully offline.
        </p>
      </div>
      <ReconciliationWizard />
    </div>
  );
}
