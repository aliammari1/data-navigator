"use client";

/**
 * "Use Previous Report" — load a persisted reconciliation run.
 *
 * The legacy stub's button had no backing store. This reads runs from the
 * platform report store (`listReconRuns`) and lets the user resume one, rehydrating
 * its `DiffConfig` + annotations. Signed-off runs show a tamper-evidence badge
 * (`verifyRunIntegrity` compares the stored content hash to a recomputed one).
 */

import { History, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  deleteReconRun,
  listReconRuns,
  type ReconRunRecord,
  verifyRunIntegrity,
} from "../lib/recon-persistence";

interface PreviousRunsProps {
  onResume: (run: ReconRunRecord) => void;
  /** Bump to force a reload (e.g. after a sign-off). */
  refreshKey?: number;
}

export function PreviousRuns({ onResume, refreshKey = 0 }: PreviousRunsProps) {
  const [runs, setRuns] = useState<ReconRunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional refresh nonce that re-runs the reload; it is not read in the body.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listReconRuns()
      .then((r) => {
        if (!cancelled) setRuns(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const remove = async (id: string) => {
    await deleteReconRun(id);
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  if (loading) {
    return (
      <p className="px-1 py-2 text-xs text-slate-500">Loading previous runs…</p>
    );
  }
  if (runs.length === 0) {
    return (
      <p className="px-1 py-2 text-xs text-slate-500">
        No previous reconciliation runs yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <History className="size-3.5" /> Previous runs
      </div>
      {runs.map((run) => {
        const intact = verifyRunIntegrity(run);
        return (
          <div
            key={run.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-slate-200">
                  {run.name}
                </span>
                {run.signedOff &&
                  (intact ? (
                    <ShieldCheck className="size-3.5 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="size-3.5 text-red-400" />
                  ))}
              </div>
              <span className="text-[11px] text-slate-500">
                {new Date(run.createdAt).toLocaleString()} ·{" "}
                {run.summary.rowsChanged + run.summary.rowsAdded + run.summary.rowsRemoved}{" "}
                differences
                {run.signedOff && !intact ? " · integrity check FAILED" : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => onResume(run)}>
                Resume
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(run.id)}
                aria-label="Delete run"
              >
                <Trash2 className="size-3.5 text-slate-500" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
