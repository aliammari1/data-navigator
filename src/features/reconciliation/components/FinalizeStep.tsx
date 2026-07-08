"use client";

/**
 * Step 4 — finalize: export the report and sign the run off.
 *
 * The legacy stub's "Download PDF Report" was a dead no-op and "Mark as
 * Reconciled" only flipped local component state (lost on reload). Here export
 * runs off the main thread (`exportReconciliation` → export worker) and sign-off
 * persists an immutable, hashed snapshot via `saveReconRun` (platform Dexie
 * report store), which also backs "Use Previous Report".
 */

import { CheckCircle2, Download, FileSpreadsheet, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportReconciliation } from "../lib/recon-export";
import { hashRun, type ReconRunRecord, saveReconRun } from "../lib/recon-persistence";
import type { DiffConfig } from "../lib/recon-sql";
import type { DiffSummary } from "../lib/use-reconciliation";
import { useAnnotationsStore } from "../stores/annotations-store";

interface FinalizeStepProps {
  runId: string;
  cfg: DiffConfig;
  summary: DiffSummary;
  expectedLabel: string;
  actualLabel: string;
  tolerancePct: number;
  signedOff: boolean;
  onSignedOff: (record: ReconRunRecord) => void;
}

export function FinalizeStep({
  runId,
  cfg,
  summary,
  expectedLabel,
  actualLabel,
  tolerancePct,
  signedOff,
  onSignedOff,
}: FinalizeStepProps) {
  const annotations = useAnnotationsStore((s) => s.annotations);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [signing, setSigning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const doExport = async (kind: "xlsx" | "pdf") => {
    setExporting(kind);
    setMessage(null);
    try {
      const result = await exportReconciliation({
        cfg,
        summary,
        annotations,
        expectedLabel,
        actualLabel,
        kind,
      });
      if (!result) {
        setMessage("Export worker unavailable in this environment.");
      } else if (result.saved) {
        setMessage(`Saved ${result.path ?? `reconciliation.${kind}`}.`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  };

  const signOff = async () => {
    setSigning(true);
    setMessage(null);
    try {
      const now = Date.now();
      const base: Omit<ReconRunRecord, "contentHash"> = {
        id: runId,
        name: `${expectedLabel} ↔ ${actualLabel}`,
        createdAt: now,
        updatedAt: now,
        expectedView: cfg.expectedView,
        actualView: cfg.actualView,
        expectedLabel,
        actualLabel,
        tolerancePct,
        config: cfg,
        summary,
        annotations,
        signedOff: true,
        signedAt: now,
      };
      const record: ReconRunRecord = { ...base, contentHash: hashRun(base) };
      await saveReconRun(record);
      onSignedOff(record);
      setMessage("Reconciliation signed off and snapshot persisted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sign-off failed.");
    } finally {
      setSigning(false);
    }
  };

  const escalatedCount = Object.values(annotations).filter((a) => a.escalated).length;
  const annotatedCount = Object.values(annotations).filter(
    (a) => a.reasonCode && a.reasonCode !== "Unknown",
  ).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Material rows" value={summary.rowsMaterial} />
        <Stat label="Reason assigned" value={annotatedCount} />
        <Stat label="Escalated" value={escalatedCount} accent="text-red-300" />
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Export report</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={exporting !== null}
            onClick={() => void doExport("xlsx")}
          >
            {exporting === "xlsx" ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-1 size-4" />
            )}
            Export XLSX
          </Button>
          <Button
            variant="outline"
            disabled={exporting !== null}
            onClick={() => void doExport("pdf")}
          >
            {exporting === "pdf" ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Download className="mr-1 size-4" />
            )}
            Export PDF
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Generated off the main thread; rows streamed from DuckDB in pages.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Sign-off</h3>
        <p className="mb-3 text-xs text-slate-500">
          Persists an immutable, content-hashed snapshot (config + summary + annotations) to the
          local report store. Backs "Use Previous Report".
        </p>
        {signedOff ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            <CheckCircle2 className="size-4" />
            Reconciled — snapshot signed off.
          </div>
        ) : (
          <Button disabled={signing} onClick={() => void signOff()}>
            {signing ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1 size-4" />
            )}
            Mark as reconciled
          </Button>
        )}
      </div>

      {message && <p className="text-xs text-slate-400">{message}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "text-slate-100",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>
        {new Intl.NumberFormat("en-US").format(value)}
      </div>
    </div>
  );
}
