"use client";

/**
 * Step 3 — investigate material discrepancies.
 *
 * Replaces the legacy "AI investigation" that was a `setTimeout(1400)` lookup
 * into a static dictionary and a non-virtualized `<table>` whose every-keystroke
 * `updateDiscrepancy` cloned the full array (re-rendering every row).
 *
 * Here the material rows come from DuckDB (`fetchMaterialRows` → top-N by
 * absolute variance), the list is virtualized with `@tanstack/react-virtual`,
 * and per-row reason/notes/escalation live in a *keyed* zustand store so editing
 * one row only re-renders that row (`useRowAnnotation`). AI hypotheses are real,
 * structured, offline (`useHypotheses` → provider registry `generateStructured`).
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Flag, Sparkles } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/shared/utils";
import { type DiffConfig } from "../lib/recon-sql";
import { REASON_CODES, useHypotheses } from "../lib/use-hypotheses";
import { fetchMaterialRows, type DiffRow } from "../lib/use-reconciliation";
import {
  EMPTY_ANNOTATION,
  useAnnotationsStore,
  useRowAnnotation,
} from "../stores/annotations-store";

const CARD_HEIGHT = 168;

function fmtSigned(n: number): string {
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.abs(n),
  );
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
}

interface InvestigationPanelProps {
  cfg: DiffConfig;
  /** Max material rows to surface / investigate. */
  maxRows?: number;
}

export function InvestigationPanel({ cfg, maxRows = 50 }: InvestigationPanelProps) {
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { run, progress, availability } = useHypotheses(cfg);

  // Load the top-N most material rows once per config.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMaterialRows(cfg, maxRows)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load material rows.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg, maxRows]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT,
    overscan: 6,
  });

  const aiReady = useMemo(
    () => availability.some((a) => a.available),
    [availability],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            Material discrepancies
          </h3>
          <p className="text-xs text-slate-500">
            Top {rows.length} by absolute variance — assign a reason or run the
            on-device model.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {progress.running && (
            <span className="text-xs text-slate-400">
              Investigating {progress.done}/{progress.total}…
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!aiReady || progress.running || rows.length === 0}
            onClick={() => void run(Math.min(rows.length, 12))}
            title={
              aiReady
                ? "Generate structured hypotheses with the on-device model"
                : "No offline AI runtime detected"
            }
          >
            <Sparkles className="mr-1 size-3.5" />
            {progress.running ? "Investigating…" : "AI investigate top 12"}
          </Button>
        </div>
      </div>

      {progress.error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {progress.error}
        </div>
      )}

      <div
        ref={parentRef}
        className="h-[520px] overflow-auto rounded-lg border border-slate-800 bg-slate-950/40"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Loading material rows from DuckDB…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-400">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-emerald-400">
            No material discrepancies — datasets reconcile within tolerance.
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              return (
                <div
                  key={row.key}
                  className="absolute left-0 w-full px-2"
                  style={{ top: vi.start, height: vi.size }}
                >
                  <DiscrepancyCard row={row} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One material-row card. Subscribes only to its own annotation slice via
 * `useRowAnnotation`, so editing another row never re-renders this one.
 */
const DiscrepancyCard = memo(function DiscrepancyCard({ row }: { row: DiffRow }) {
  const annotation = useRowAnnotation(row.key);
  const setAnnotation = useAnnotationsStore((s) => s.setAnnotation);

  return (
    <div className="my-1.5 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />
            <span className="truncate font-medium text-slate-200" title={row.key}>
              {row.key}
            </span>
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
              {row.status}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
            {row.measures.map((m) => (
              <span key={m.label}>
                {m.label}:{" "}
                <span
                  className={cn(
                    "font-mono",
                    m.variance > 0
                      ? "text-emerald-400"
                      : m.variance < 0
                        ? "text-red-400"
                        : "text-slate-300",
                  )}
                >
                  {fmtSigned(m.variance)} ({fmtPct(m.variancePct)})
                </span>
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            setAnnotation(row.key, { escalated: !annotation.escalated })
          }
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            annotation.escalated
              ? "border-red-500/40 bg-red-500/15 text-red-300"
              : "border-slate-700 text-slate-400 hover:text-slate-200",
          )}
        >
          <Flag className="size-3" />
          {annotation.escalated ? "Escalated" : "Escalate"}
        </button>
      </div>

      {annotation.hypothesis && (
        <div className="mt-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-2 text-xs text-slate-300">
          <span className="font-semibold text-blue-300">AI hypothesis</span>
          {annotation.confidence !== null && (
            <span className="ml-1 text-slate-500">
              ({Math.round(annotation.confidence * 100)}% conf)
            </span>
          )}
          <p className="mt-0.5 leading-snug text-slate-400">
            {annotation.hypothesis}
          </p>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <NativeSelect
          size="sm"
          className="w-44"
          value={annotation.reasonCode || EMPTY_ANNOTATION.reasonCode}
          onChange={(e) => setAnnotation(row.key, { reasonCode: e.target.value })}
        >
          {REASON_CODES.map((rc) => (
            <NativeSelectOption key={rc} value={rc}>
              {rc}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <input
          value={annotation.notes}
          onChange={(e) => setAnnotation(row.key, { notes: e.target.value })}
          placeholder="Investigator notes…"
          className="h-8 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 placeholder:text-slate-600"
        />
      </div>
    </div>
  );
});
