"use client";

/**
 * Step 1 — choose the two real datasets to reconcile and map join keys +
 * measures between them.
 *
 * The legacy stub hardcoded `EXPECTED_DEFAULT`/`ACTUAL_DEFAULT` (5 fabricated
 * rows). This step reads the real catalog via `useDatasets()` and resolves each
 * dataset's DuckDB `viewName` + columns. Column names rarely match across two
 * sources ("MSISDN" vs "Phone"), so we offer an offline fuzzy auto-mapping
 * (`suggestColumnMapping`, fuse.js, off the hot path) that the user confirms or
 * overrides. The output is a `DiffConfig` consumed by the DuckDB FULL OUTER JOIN.
 */

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
// (UI primitives + auto-map helpers + diff-config types imported below.)
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useDatasets } from "@/core/queries/datasets";
import {
  type ColumnInfo,
  isNumericType,
  pickDefaultKey,
  pickDefaultMeasures,
  suggestColumnMapping,
} from "../lib/auto-map";
import {
  type DiffConfig,
  type KeyMapping,
  type MeasureMapping,
  slugifyMeasure,
} from "../lib/recon-sql";

interface DatasetLite {
  id: string;
  name: string;
  viewName: string;
  columns: ColumnInfo[];
}

function toLite(d: {
  id: string;
  name: string;
  viewName: string;
  columns: { name: string; type: string }[];
}): DatasetLite {
  return {
    id: d.id,
    name: d.name,
    viewName: d.viewName,
    columns: d.columns.map((c) => ({ name: c.name, type: c.type })),
  };
}

type MeasureDraft = MeasureMapping;

export interface SelectSourcesStepProps {
  onReady: (
    cfg: DiffConfig,
    meta: {
      expectedLabel: string;
      actualLabel: string;
      tolerancePct: number;
    },
  ) => void;
}

export function SelectSourcesStep({ onReady }: SelectSourcesStepProps) {
  const { data: datasets = [] } = useDatasets();
  const lite = useMemo<DatasetLite[]>(
    () =>
      datasets
        .filter((d) => d.viewName)
        .map((d) =>
          toLite({
            id: d.id,
            name: d.name,
            viewName: d.viewName,
            columns: (d.columns ?? []).map((c) => ({
              name: c.name,
              type: String(c.type ?? ""),
            })),
          }),
        ),
    [datasets],
  );

  const [expectedId, setExpectedId] = useState<string>("");
  const [actualId, setActualId] = useState<string>("");
  const [keyCols, setKeyCols] = useState<KeyMapping[]>([]);
  const [measures, setMeasures] = useState<MeasureDraft[]>([]);
  const [tolerancePct, setTolerancePct] = useState(5);

  const expected = lite.find((d) => d.id === expectedId) ?? null;
  const actual = lite.find((d) => d.id === actualId) ?? null;

  const autoMap = useCallback(() => {
    if (!expected || !actual) return;
    const expCols: ColumnInfo[] = expected.columns;
    const actCols: ColumnInfo[] = actual.columns;
    const suggestions = suggestColumnMapping(expCols, actCols);

    const keySuggestion = pickDefaultKey(suggestions, expCols);
    const nextKeys: KeyMapping[] =
      keySuggestion && keySuggestion.actual
        ? [{ expected: keySuggestion.expected, actual: keySuggestion.actual }]
        : [];

    const excluded = new Set(nextKeys.map((k) => k.expected));
    const measureSuggestions = pickDefaultMeasures(suggestions, expCols, excluded, 3);
    const usedLabels = new Set<string>();
    const nextMeasures: MeasureDraft[] = measureSuggestions
      .filter((s) => s.actual)
      .map((s) => {
        let label = slugifyMeasure(s.expected);
        while (usedLabels.has(label)) label = `${label}_x`;
        usedLabels.add(label);
        return { label, expected: s.expected, actual: s.actual as string };
      });

    setKeyCols(nextKeys);
    setMeasures(nextMeasures);
  }, [expected, actual]);

  const numericActualCols = useMemo(
    () => (actual ? actual.columns.filter((c) => isNumericType(c.type)) : []),
    [actual],
  );
  const numericExpectedCols = useMemo(
    () => (expected ? expected.columns.filter((c) => isNumericType(c.type)) : []),
    [expected],
  );

  const addKey = () => {
    if (!expected || !actual) return;
    setKeyCols((k) => [
      ...k,
      { expected: expected.columns[0]?.name ?? "", actual: actual.columns[0]?.name ?? "" },
    ]);
  };
  const addMeasure = () => {
    if (numericExpectedCols.length === 0 || numericActualCols.length === 0) return;
    const e = numericExpectedCols[0].name;
    const a = numericActualCols[0].name;
    setMeasures((m) => [
      ...m,
      { label: slugifyMeasure(e) || `m${m.length + 1}`, expected: e, actual: a },
    ]);
  };

  const ready =
    !!expected &&
    !!actual &&
    expected.id !== actual.id &&
    keyCols.length > 0 &&
    keyCols.every((k) => k.expected && k.actual) &&
    measures.length > 0 &&
    measures.every((m) => m.expected && m.actual && m.label);

  const submit = () => {
    if (!expected || !actual || !ready) return;
    const cfg: DiffConfig = {
      expectedView: expected.viewName,
      actualView: actual.viewName,
      keyCols,
      measures,
    };
    onReady(cfg, {
      expectedLabel: expected.name,
      actualLabel: actual.name,
      tolerancePct,
    });
  };

  if (lite.length < 2) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
        Reconciliation needs at least two registered datasets. Import an "expected" and an "actual"
        dataset, then return here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <DatasetPicker
          label="Expected dataset"
          value={expectedId}
          options={lite}
          exclude={actualId}
          onChange={setExpectedId}
        />
        <DatasetPicker
          label="Actual dataset"
          value={actualId}
          options={lite}
          exclude={expectedId}
          onChange={setActualId}
        />
      </div>

      {expected && actual && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Key & measure mapping</h3>
            <Button variant="outline" size="sm" onClick={autoMap}>
              <Sparkles className="mr-1 size-3.5" /> Auto-map columns
            </Button>
          </div>

          {/* Join keys */}
          <MappingTable
            title="Join keys"
            rows={keyCols}
            expectedCols={expected.columns}
            actualCols={actual.columns}
            onChange={(i, side, v) =>
              setKeyCols((prev) => prev.map((r, idx) => (idx === i ? { ...r, [side]: v } : r)))
            }
            onRemove={(i) => setKeyCols((prev) => prev.filter((_, idx) => idx !== i))}
            onAdd={addKey}
          />

          {/* Measures */}
          <MappingTable
            title="Measures (numeric)"
            rows={measures}
            expectedCols={numericExpectedCols}
            actualCols={numericActualCols}
            showLabel
            onLabelChange={(i, v) =>
              setMeasures((prev) =>
                prev.map((r, idx) =>
                  idx === i ? { ...r, label: slugifyMeasure(v) || r.label } : r,
                ),
              )
            }
            onChange={(i, side, v) =>
              setMeasures((prev) => prev.map((r, idx) => (idx === i ? { ...r, [side]: v } : r)))
            }
            onRemove={(i) => setMeasures((prev) => prev.filter((_, idx) => idx !== i))}
            onAdd={addMeasure}
          />

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-400" htmlFor="tol">
              Material tolerance %
            </label>
            <input
              id="tol"
              type="number"
              min={0}
              step={0.5}
              value={tolerancePct}
              onChange={(e) => setTolerancePct(Number(e.target.value) || 0)}
              className="h-8 w-24 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
            />
            <span className="text-xs text-slate-500">
              flat floor — MAD-adaptive materiality layered on top
            </span>
          </div>

          <Button disabled={!ready} onClick={submit}>
            Run reconciliation diff
          </Button>
        </>
      )}
    </div>
  );
}

function DatasetPicker({
  label,
  value,
  options,
  exclude,
  onChange,
}: {
  label: string;
  value: string;
  options: DatasetLite[];
  exclude: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <NativeSelect className="w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <NativeSelectOption value="">Select a dataset…</NativeSelectOption>
        {options
          .filter((d) => d.id !== exclude)
          .map((d) => (
            <NativeSelectOption key={d.id} value={d.id}>
              {d.name} ({d.columns.length} cols)
            </NativeSelectOption>
          ))}
      </NativeSelect>
    </div>
  );
}

function MappingTable({
  title,
  rows,
  expectedCols,
  actualCols,
  showLabel,
  onLabelChange,
  onChange,
  onRemove,
  onAdd,
}: {
  title: string;
  rows: Array<{ expected: string; actual: string; label?: string }>;
  expectedCols: ColumnInfo[];
  actualCols: ColumnInfo[];
  showLabel?: boolean;
  onLabelChange?: (i: number, v: string) => void;
  onChange: (i: number, side: "expected" | "actual", v: string) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </span>
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="size-3.5" />
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-center text-xs text-slate-500">None — auto-map or add a row.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={`${title}-${i}`} className="flex items-center gap-2">
              {showLabel && (
                <input
                  value={row.label ?? ""}
                  onChange={(e) => onLabelChange?.(i, e.target.value)}
                  placeholder="label"
                  className="h-8 w-28 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
                />
              )}
              <ColSelect
                value={row.expected}
                cols={expectedCols}
                onChange={(v) => onChange(i, "expected", v)}
              />
              <span className="text-slate-500">↔</span>
              <ColSelect
                value={row.actual}
                cols={actualCols}
                onChange={(v) => onChange(i, "actual", v)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(i)}
                aria-label="Remove mapping"
              >
                <Trash2 className="size-3.5 text-slate-500" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ColSelect({
  value,
  cols,
  onChange,
}: {
  value: string;
  cols: ColumnInfo[];
  onChange: (v: string) => void;
}) {
  return (
    <NativeSelect
      size="sm"
      className="min-w-[8rem] flex-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <NativeSelectOption value="">—</NativeSelectOption>
      {cols.map((c) => (
        <NativeSelectOption key={c.name} value={c.name}>
          {c.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
