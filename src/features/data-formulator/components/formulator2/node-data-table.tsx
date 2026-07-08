"use client";

/**
 * NodeDataTable — DF's per-node sample-output table for the formulator2 screen.
 *
 * Tabs span the FOCUSED table's lineage path (root original → focused leaf):
 * the original gets a Database glyph, derived nodes an engine badge tinted with
 * the `--ai` token. The active tab shows a row+column-virtualized grid
 * (@tanstack/react-virtual, sticky header) over the node's rows:
 *
 *   - originals   — first PREVIEW_ROWS fetched lazily from DuckDB over the
 *     quoted `duckdbView`, cached per node id for the session.
 *   - sql nodes   — the stored preview; rehydrated row-less nodes recompute
 *     through the read-only WITH chain (`fetchDerivedPreview`).
 *   - python nodes — materialized rows; rehydrated row-less nodes surface the
 *     « Réexécuter » banner (rows never persist — see formulator-store).
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Database, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { quoteIdent, runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { cn } from "@/shared/utils";
import { fetchDerivedPreview, sqlChainEligible } from "../../core/formulator/lineage";
import {
  lineagePath,
  MAX_DERIVED_ROWS,
  PREVIEW_ROWS,
  type Row,
  type TableNode,
} from "../../core/formulator/model";
import {
  needsRerun,
  useFormFocusedTable,
  useFormTables,
  useFormulatorV2Store,
} from "../../store/formulator-store";

const ROW_HEIGHT = 28;
const COL_WIDTH = 160;
const GRID_HEIGHT = 280;

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

// ─── Engine badge (AI-derived surface → --ai tint) ────────────────────────────

function EngineBadge({ engine }: { engine: TableNode["engine"] }) {
  return (
    <Badge variant="outline" className="border-ai/30 bg-ai/10 text-ai">
      {engine === "python" ? "Python" : "SQL"}
    </Badge>
  );
}

// ─── Virtualized grid ─────────────────────────────────────────────────────────

function VirtualGrid({ columns, rows }: { columns: string[]; rows: Row[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COL_WIDTH,
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = columnVirtualizer.getVirtualItems();
  const totalWidth = columnVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div
      ref={scrollRef}
      className="overflow-auto rounded-lg border border-border bg-background text-xs"
      style={{ height: GRID_HEIGHT }}
    >
      {/* Sticky header — only visible columns rendered. */}
      <div
        className="sticky top-0 z-10 border-b border-border bg-card"
        style={{ width: totalWidth, height: ROW_HEIGHT }}
      >
        {virtualCols.map((vc) => (
          <div
            key={vc.key}
            className="absolute top-0 truncate px-3 py-1.5 font-medium text-muted-foreground"
            style={{ left: vc.start, width: vc.size, height: ROW_HEIGHT }}
            title={columns[vc.index]}
          >
            {columns[vc.index]}
          </div>
        ))}
      </div>

      {/* Virtualized body. */}
      <div style={{ width: totalWidth, height: totalHeight, position: "relative" }}>
        {virtualRows.map((vr) => {
          const row = rows[vr.index];
          return (
            <div
              key={vr.key}
              className={cn("absolute left-0", vr.index % 2 === 1 && "bg-muted/40")}
              style={{ top: vr.start, width: totalWidth, height: vr.size }}
            >
              {virtualCols.map((vc) => {
                const name = columns[vc.index];
                const cell = name !== undefined ? formatCell(row?.[name]) : "";
                return (
                  <div
                    key={vc.key}
                    className="absolute truncate px-3 py-1 font-mono text-foreground/90 tabular-nums"
                    style={{ left: vc.start, width: vc.size, height: vr.size }}
                    title={cell}
                  >
                    {cell}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Per-node tab body ────────────────────────────────────────────────────────

function NodeBody({
  node,
  allTables,
  cache,
}: {
  node: TableNode;
  allTables: TableNode[];
  cache: Map<string, Row[]>;
}) {
  const refineNode = useFormulatorV2Store((s) => s.refineNode);
  const isDeriving = useFormulatorV2Store((s) => s.status === "deriving");
  const isTruncated = useFormulatorV2Store((s) => s.truncatedNodeIds.includes(node.id));

  const [fetched, setFetched] = useState<Row[] | null>(cache.get(node.id) ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Row-less nodes we can (re)read from DuckDB: originals via their view,
  // sql-lane nodes via the inline WITH chain when every ancestor is sql.
  const canFetch =
    !node.rows &&
    ((node.kind === "original" && !!node.duckdbView) ||
      (node.kind === "derived" && node.engine === "sql" && sqlChainEligible(allTables, node.id)));

  useEffect(() => {
    if (!canFetch || fetched) return;
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);
    const load =
      node.kind === "original" && node.duckdbView
        ? runReadOnlyQuery(`SELECT * FROM ${quoteIdent(node.duckdbView)} LIMIT ${PREVIEW_ROWS}`)
        : fetchDerivedPreview(allTables, node.id);
    load
      .then((rows) => {
        if (cancelled) return;
        cache.set(node.id, rows);
        setFetched(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFetch, fetched, node, allTables, cache]);

  const rows = node.rows ?? fetched ?? [];
  const columns = node.columns.map((c) => c.name);
  const rerunNeeded = needsRerun(node);

  return (
    <div className="flex flex-col gap-2">
      {rerunNeeded ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-ai/30 bg-ai/10 px-3 py-2">
          <p className="text-xs text-foreground">Résultat Python non persisté</p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={isDeriving}
            onClick={() => void refineNode(node.id, node.instruction ?? "")}
          >
            <RefreshCw />
            Réexécuter
          </Button>
        </div>
      ) : null}

      {fetchError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <p className="font-mono text-xs text-destructive">{fetchError}</p>
        </div>
      ) : null}

      {isLoading ? (
        <div
          aria-busy="true"
          className="animate-pulse rounded-lg border border-border bg-muted"
          style={{ height: GRID_HEIGHT }}
        />
      ) : rows.length > 0 ? (
        <VirtualGrid columns={columns} rows={rows} />
      ) : !rerunNeeded && !fetchError ? (
        <div
          className="grid place-items-center rounded-lg border border-dashed border-border bg-card/50"
          style={{ height: GRID_HEIGHT }}
        >
          <p className="text-xs text-muted-foreground">Aperçu indisponible</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <span>
          {node.rowCount.toLocaleString("fr-FR")} lignes
          {rows.length > 0 && rows.length < node.rowCount
            ? ` · aperçu : ${rows.length.toLocaleString("fr-FR")} premières`
            : ""}
        </span>
        {isTruncated ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="size-3" />
            Résultat tronqué à {MAX_DERIVED_ROWS.toLocaleString("fr-FR")} lignes
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Lineage tabs ─────────────────────────────────────────────────────────────

export function NodeDataTable() {
  const tables = useFormTables();
  const focused = useFormFocusedTable();

  const path = useMemo(() => (focused ? lineagePath(tables, focused.id) : []), [tables, focused]);

  const [activeId, setActiveId] = useState<string>(focused?.id ?? "");
  const focusedId = focused?.id;
  useEffect(() => {
    if (focusedId) setActiveId(focusedId);
  }, [focusedId]);

  // Preview cache survives tab switches; DuckDB is only hit once per node.
  const cacheRef = useRef<Map<string, Row[]>>(new Map());

  if (!focused || path.length === 0) return null;

  const value = path.some((n) => n.id === activeId) ? activeId : focused.id;

  return (
    <Tabs value={value} onValueChange={setActiveId} className="w-full">
      <TabsList variant="line" className="max-w-full overflow-x-auto">
        {path.map((node) => (
          <TabsTrigger key={node.id} value={node.id} className="gap-1.5">
            {node.kind === "original" ? <Database className="size-3.5" /> : null}
            <span className="max-w-40 truncate">{node.name}</span>
            {node.kind === "derived" ? <EngineBadge engine={node.engine} /> : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {path.map((node) => (
        <TabsContent key={node.id} value={node.id}>
          <NodeBody node={node} allTables={tables} cache={cacheRef.current} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
