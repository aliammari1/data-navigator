"use client";

/**
 * DeriveVerification — the honest DF1 sample-pair verification card.
 *
 * When a derivation just produced a DERIVED node (the focused table is
 * `kind: "derived"`), this card sits ABOVE the chart and lets the user
 * sanity-check the AI's work before trusting it — the #1 trust driver in the
 * Data Formulator papers. It shows:
 *
 *   1. A one-line explanation: the node's NL instruction as the intent, plus an
 *      engine badge (SQL/Python, `--ai` tint — this is an AI-derived surface).
 *   2. Sample input → output pairs: the PARENT table's first rows next to the
 *      derived table's first rows, side by side. Columns that exist in the
 *      derived table but not the parent (the NEW/derived columns) get an `--ai`
 *      tinted header so the eye lands on what the transformation added.
 *   3. The generated code in a collapsible mono block (same disclosure pattern
 *      as the chart's SQL affordance).
 *   4. « Valider » (accept + dismiss — recorded per node id in a module-level
 *      Set so the card never reappears for that node) and « Affiner » (focus the
 *      instruction input via the `onRefine` prop, or a window event fallback).
 *
 * Data is queried read-only: originals through their DuckDB view, sql-lane
 * derivations through the inline WITH chain (`buildLineageSQL`), and python-lane
 * nodes from their in-memory `rows`. Loading uses a pulse skeleton — no spinner.
 */

import { ArrowRight, Check, ChevronDown, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { quoteIdent, runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { cn } from "@/shared/utils";
import { buildLineageSQL, LEAF_PLACEHOLDER, sqlChainEligible } from "../../core/formulator/lineage";
import type { Row, TableNode } from "../../core/formulator/model";
import { useFormFocusedTable, useFormTables } from "../../store/formulator-store";

const SAMPLE_ROWS = 5;
const REFINE_FOCUS_EVENT = "formulator:refine-focus";

// ─── Per-node accept state (module-level, so the card never reappears) ─────────

/**
 * Ids of derived nodes the user has validated. Kept in module scope — NOT store
 * state — because it's ephemeral UI acknowledgement, not lineage data. Exported
 * so the assembly can render this card only for un-validated derived nodes.
 */
export const validatedNodeIds = new Set<string>();

export function isNodeValidated(id: string): boolean {
  return validatedNodeIds.has(id);
}

export function markNodeValidated(id: string): void {
  validatedNodeIds.add(id);
}

// ─── Cell formatting ──────────────────────────────────────────────────────────

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ─── Sample fetch (read-only, lane-aware) ─────────────────────────────────────

/**
 * First `limit` rows of a node: originals via their quoted view, sql-lane
 * derivations via the compiled WITH chain, python-lane nodes from in-memory
 * `rows`. Returns [] when a rehydrated python node has no rows to show.
 */
async function fetchNodeSample(
  tables: TableNode[],
  node: TableNode,
  limit: number,
): Promise<Row[]> {
  if (node.kind === "original" && node.duckdbView) {
    return runReadOnlyQuery(`SELECT * FROM ${quoteIdent(node.duckdbView)} LIMIT ${limit}`);
  }
  if (node.kind === "derived" && node.engine === "sql" && sqlChainEligible(tables, node.id)) {
    const sql = buildLineageSQL(
      tables,
      node.id,
      `SELECT * FROM ${LEAF_PLACEHOLDER} LIMIT ${limit}`,
    );
    return runReadOnlyQuery(sql);
  }
  // python-lane: data lives in JS memory (rows never persist → may be absent).
  return node.rows ? node.rows.slice(0, limit) : [];
}

// ─── Compact sample table ─────────────────────────────────────────────────────

function SampleTable({
  columns,
  rows,
  highlight,
}: {
  columns: string[];
  rows: Row[];
  highlight?: ReadonlySet<string>;
}) {
  if (columns.length === 0) {
    return (
      <div className="grid h-24 place-items-center rounded-lg border border-dashed border-border bg-card/50">
        <p className="text-xs text-muted-foreground">Aucune colonne</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-background">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border">
            {columns.map((name) => {
              const isNew = highlight?.has(name) ?? false;
              return (
                <th
                  key={name}
                  title={name}
                  className={cn(
                    "max-w-40 truncate px-2 py-1.5 text-left font-medium",
                    isNew ? "bg-ai/10 text-ai" : "text-muted-foreground",
                  )}
                >
                  {name}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-3 text-center text-muted-foreground">
                Aperçu indisponible
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className={cn("border-b border-border/50", rowIndex % 2 === 1 && "bg-muted/40")}
              >
                {columns.map((name) => {
                  const isNew = highlight?.has(name) ?? false;
                  const cell = formatCell(row[name]);
                  return (
                    <td
                      key={name}
                      title={cell}
                      className={cn(
                        "max-w-40 truncate px-2 py-1 font-mono tabular-nums",
                        isNew ? "text-ai" : "text-foreground/90",
                      )}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Loading skeleton (pulse, no spinner) ─────────────────────────────────────

function SamplesSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Chargement de l'échantillon"
      className="grid gap-3 md:grid-cols-2"
    >
      <div className="h-28 animate-pulse rounded-lg border border-border bg-muted" />
      <div className="h-28 animate-pulse rounded-lg border border-border bg-muted" />
    </div>
  );
}

// ─── Collapsible generated code ───────────────────────────────────────────────

function CodeDisclosure({ engine, code }: { engine: TableNode["engine"]; code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="gap-1 font-mono text-muted-foreground"
          aria-label={open ? "Masquer le code" : "Afficher le code"}
        >
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          {engine === "python" ? "Code Python" : "Code SQL"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs text-foreground">
          {code}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── State ────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "ready"; parentRows: Row[]; derivedRows: Row[]; error: string | null };

// ─── Card ─────────────────────────────────────────────────────────────────────

export function DeriveVerification({ onRefine }: { onRefine?: () => void }) {
  const focused = useFormFocusedTable();
  const tables = useFormTables();

  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const nodeId = focused?.id;
  const isDerived = focused?.kind === "derived";
  const parent = useMemo(
    () => (focused?.parentId ? tables.find((t) => t.id === focused.parentId) : undefined),
    [tables, focused?.parentId],
  );

  // Reset local dismissal when the focused node changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: nodeId is the intended reset trigger, not a value the effect body reads.
  useEffect(() => {
    setDismissed(false);
  }, [nodeId]);

  useEffect(() => {
    if (!isDerived || !focused || !parent) return;
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      const [parentRes, derivedRes] = await Promise.allSettled([
        fetchNodeSample(tables, parent, SAMPLE_ROWS),
        fetchNodeSample(tables, focused, SAMPLE_ROWS),
      ]);
      if (cancelled) return;
      const rejected = [parentRes, derivedRes].find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      setState({
        status: "ready",
        parentRows: parentRes.status === "fulfilled" ? parentRes.value : [],
        derivedRows: derivedRes.status === "fulfilled" ? derivedRes.value : [],
        error: rejected
          ? rejected.reason instanceof Error
            ? rejected.reason.message
            : String(rejected.reason)
          : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [focused, parent, tables, isDerived]);

  // New (derived) columns: present in the derived table, absent in the parent.
  const newColumns = useMemo(() => {
    if (!isDerived || !focused) return new Set<string>();
    const parentCols = new Set((parent?.columns ?? []).map((c) => c.name));
    return new Set(focused.columns.map((c) => c.name).filter((name) => !parentCols.has(name)));
  }, [focused, parent, isDerived]);

  if (!focused || !isDerived || !nodeId) return null;
  if (dismissed || isNodeValidated(nodeId)) return null;

  const parentColumns = (parent?.columns ?? []).map((c) => c.name);
  const derivedColumns = focused.columns.map((c) => c.name);

  const handleValidate = () => {
    markNodeValidated(nodeId);
    setDismissed(true);
  };

  const handleRefine = () => {
    if (onRefine) {
      onRefine();
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(REFINE_FOCUS_EVENT));
    }
  };

  return (
    <section
      aria-label="Vérification du résultat"
      className="flex w-full flex-col gap-3 rounded-xl border border-ai/30 bg-ai/5 p-3"
    >
      {/* Header + one-line explanation. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-ai" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">Vérifier le résultat</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-ai/30 bg-ai/10 text-ai">
            {focused.engine === "python" ? "Python" : "SQL"}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {focused.instruction ? (
              <span className="italic">« {focused.instruction} »</span>
            ) : (
              "Transformation dérivée — comparez un échantillon avant/après."
            )}
          </p>
        </div>
      </div>

      {/* Sample input → output pairs. */}
      {state.status === "loading" ? (
        <SamplesSkeleton />
      ) : (
        <>
          {state.error ? <p className="font-mono text-xs text-destructive">{state.error}</p> : null}
          <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">
                Entrée (échantillon parent)
              </p>
              <SampleTable columns={parentColumns} rows={state.parentRows} />
            </div>
            <ArrowRight
              className="mx-auto hidden size-4 shrink-0 text-muted-foreground md:block"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Résultat</p>
              <SampleTable
                columns={derivedColumns}
                rows={state.derivedRows}
                highlight={newColumns}
              />
            </div>
          </div>
        </>
      )}

      {/* Generated code (collapsible) + actions. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {focused.code ? <CodeDisclosure engine={focused.engine} code={focused.code} /> : <span />}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="xs" onClick={handleRefine}>
            <Wand2 />
            Affiner
          </Button>
          <Button
            type="button"
            size="xs"
            className="bg-ai text-ai-foreground hover:bg-ai/90"
            onClick={handleValidate}
          >
            <Check />
            Valider
          </Button>
        </div>
      </div>
    </section>
  );
}
