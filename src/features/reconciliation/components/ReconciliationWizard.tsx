"use client";

/**
 * Reconciliation wizard — the real, DuckDB-backed replacement for the legacy
 * deep-analytics stub.
 *
 * Flow:
 *   1. Select sources      — pick two datasets, auto-map keys/measures, tolerance.
 *   2. Diff & summary      — FULL OUTER JOIN diff in DuckDB; virtualized grid +
 *                            rollup cards; MAD-adaptive materiality from the
 *                            run's own variance distribution.
 *   3. Investigate         — top-N material rows, keyed annotations, real
 *                            on-device structured AI hypotheses.
 *   4. Finalize            — off-main-thread XLSX/PDF export + hashed sign-off
 *                            snapshot persisted to the local report store.
 *
 * Every number traces to a DuckDB query or a real provider call. No Math.random,
 * no setTimeout fake-AI, no hardcoded sample rows, no dead buttons.
 */

import { Check } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import { DiffSummaryCards } from "./DiffSummaryCards";
import { FinalizeStep } from "./FinalizeStep";
import { InvestigationPanel } from "./InvestigationPanel";
import { PreviousRuns } from "./PreviousRuns";
import { ReconciliationDiffGrid } from "./ReconciliationDiffGrid";
import { SelectSourcesStep } from "./SelectSourcesStep";
import { fitMateriality } from "../lib/materiality";
import { newRunId, type ReconRunRecord } from "../lib/recon-persistence";
import type { DiffConfig } from "../lib/recon-sql";
import { useDiffPage, useDiffSummary } from "../lib/use-reconciliation";
import { useAnnotationsStore } from "../stores/annotations-store";

const STEPS = [
  "Select sources",
  "Diff & summary",
  "Investigate",
  "Finalize",
] as const;

const PAGE_LIMIT = 500;

interface RunMeta {
  runId: string;
  expectedLabel: string;
  actualLabel: string;
  tolerancePct: number;
}

export function ReconciliationWizard() {
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<DiffConfig | null>(null);
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [signedOff, setSignedOff] = useState(false);
  const [runsRefresh, setRunsRefresh] = useState(0);

  const startRun = useAnnotationsStore((s) => s.startRun);
  const reset = useAnnotationsStore((s) => s.reset);

  const tolerancePct = meta?.tolerancePct ?? 5;

  const summaryQuery = useDiffSummary(cfg, tolerancePct, step >= 1);
  const pageQuery = useDiffPage(
    cfg,
    { limit: PAGE_LIMIT, offset: 0, onlyChanged: true },
    step >= 1,
  );

  const rows = pageQuery.data ?? [];
  const materiality = useMemo(
    () => fitMateriality(rows.map((r) => r.primaryVariancePct), tolerancePct),
    [rows, tolerancePct],
  );
  const measureLabels = useMemo(
    () => cfg?.measures.map((m) => m.label) ?? [],
    [cfg],
  );

  const handleSourcesReady = useCallback(
    (
      nextCfg: DiffConfig,
      sourceMeta: { expectedLabel: string; actualLabel: string; tolerancePct: number },
    ) => {
      const runId = newRunId();
      startRun(runId);
      setCfg(nextCfg);
      setMeta({ runId, ...sourceMeta });
      setSignedOff(false);
      setStep(1);
    },
    [startRun],
  );

  const resumeRun = useCallback(
    (run: ReconRunRecord) => {
      startRun(run.id);
      // Rehydrate annotations from the persisted snapshot.
      const setAnnotation = useAnnotationsStore.getState().setAnnotation;
      for (const [key, ann] of Object.entries(run.annotations)) {
        setAnnotation(key, ann);
      }
      setCfg(run.config);
      setMeta({
        runId: run.id,
        expectedLabel: run.expectedLabel,
        actualLabel: run.actualLabel,
        tolerancePct: run.tolerancePct,
      });
      setSignedOff(run.signedOff);
      setStep(1);
    },
    [startRun],
  );

  const startOver = useCallback(() => {
    reset();
    setCfg(null);
    setMeta(null);
    setSignedOff(false);
    setStep(0);
  }, [reset]);

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                disabled={i > step || (i >= 1 && !cfg)}
                onClick={() => i <= step && setStep(i)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-blue-500/20 text-blue-300"
                    : done
                      ? "text-emerald-400 hover:bg-slate-800"
                      : "text-slate-500",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[10px]",
                    active
                      ? "border-blue-400 bg-blue-500/30"
                      : done
                        ? "border-emerald-500 bg-emerald-500/20"
                        : "border-slate-700",
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && (
                <span className="h-px w-4 bg-slate-700" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* Step content */}
      {step === 0 && (
        <div className="space-y-6">
          <SelectSourcesStep onReady={handleSourcesReady} />
          <PreviousRuns onResume={resumeRun} refreshKey={runsRefresh} />
        </div>
      )}

      {step === 1 && cfg && (
        <div className="space-y-5">
          <DiffSummaryCards
            summary={summaryQuery.data ?? null}
            loading={summaryQuery.isLoading}
          />
          <ReconciliationDiffGrid
            rows={rows}
            measureLabels={measureLabels}
            materiality={materiality}
            totalRows={summaryQuery.data?.rowsChanged}
            loading={pageQuery.isLoading}
          />
          {pageQuery.isError && (
            <p className="text-xs text-red-400">
              {(pageQuery.error as Error)?.message ?? "Diff query failed."}
            </p>
          )}
          <NavRow onBack={startOver} backLabel="Start over" onNext={() => setStep(2)} />
        </div>
      )}

      {step === 2 && cfg && (
        <div className="space-y-5">
          <InvestigationPanel cfg={cfg} />
          <NavRow onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </div>
      )}

      {step === 3 && cfg && meta && summaryQuery.data && (
        <div className="space-y-5">
          <FinalizeStep
            runId={meta.runId}
            cfg={cfg}
            summary={summaryQuery.data}
            expectedLabel={meta.expectedLabel}
            actualLabel={meta.actualLabel}
            tolerancePct={meta.tolerancePct}
            signedOff={signedOff}
            onSignedOff={() => {
              setSignedOff(true);
              setRunsRefresh((n) => n + 1);
            }}
          />
          <NavRow
            onBack={() => setStep(2)}
            onNext={startOver}
            nextLabel="New reconciliation"
          />
        </div>
      )}

      {step === 3 && cfg && meta && !summaryQuery.data && (
        <p className="text-sm text-slate-500">Loading summary…</p>
      )}
    </div>
  );
}

function NavRow({
  onBack,
  onNext,
  backLabel = "Back",
  nextLabel = "Continue",
}: {
  onBack: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-800 pt-4">
      <Button variant="ghost" onClick={onBack}>
        {backLabel}
      </Button>
      <Button onClick={onNext}>{nextLabel}</Button>
    </div>
  );
}
