"use client";

/**
 * SqlIdePanel — the previously-empty SQL IDE panel, now wired to the existing
 * `sqlTabs` / `sqlHistory` / `activeSqlTab` store state.
 *
 * - Monaco SQL editor (offline-bundled, already used by WidgetCard/Narrative).
 * - Read-only execution through the DuckDB worker (`runReadOnlyQuery`).
 * - Results rendered with the row+column virtualized `VirtualDataTable`.
 * - Per-tab state + a bounded query history, all from the durable store.
 */

import dynamic from "next/dynamic";
import { useCallback, useMemo } from "react";
import { Play, Plus, X } from "lucide-react";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import {
  defaultSQLForTable,
  type SQLTab,
  useAgentStore,
} from "@/features/agent-canvas/core/agent-store";
import { cn } from "@/shared/utils";
import { VirtualDataTable } from "./VirtualDataTable";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

function toGrid(rows: Record<string, unknown>[]): {
  headers: string[];
  cells: string[][];
} {
  if (rows.length === 0) return { headers: [], cells: [] };
  const headers = Object.keys(rows[0]);
  const cells = rows.map((r) =>
    headers.map((h) => {
      const v = r[h];
      return v === null || v === undefined ? "" : String(v);
    }),
  );
  return { headers, cells };
}

export function SqlIdePanel() {
  // Narrow selectors — keeps the panel off the per-thought re-render path.
  const sqlTabs = useAgentStore((s) => s.sqlTabs);
  const activeSqlTab = useAgentStore((s) => s.activeSqlTab);
  const sqlHistory = useAgentStore((s) => s.sqlHistory);
  const tableName = useAgentStore((s) => s.tableName);
  const addSQLTab = useAgentStore((s) => s.addSQLTab);
  const updateSQLTab = useAgentStore((s) => s.updateSQLTab);
  const setActiveSQLTab = useAgentStore((s) => s.setActiveSQLTab);
  const pushSQLHistory = useAgentStore((s) => s.pushSQLHistory);

  const active = useMemo(
    () => sqlTabs.find((t) => t.id === activeSqlTab) ?? sqlTabs[0],
    [sqlTabs, activeSqlTab],
  );

  const runActive = useCallback(async () => {
    if (!active) return;
    const sql = active.sql.trim().replace(/;\s*$/, "");
    if (!sql) return;
    updateSQLTab(active.id, { running: true, error: undefined });
    const started = performance.now();
    try {
      const results = await runReadOnlyQuery(sql);
      const duration = Math.round(performance.now() - started);
      updateSQLTab(active.id, { running: false, results, error: undefined });
      pushSQLHistory({
        id: `h-${Date.now()}`,
        sql,
        timestamp: Date.now(),
        rowCount: results.length,
        duration,
      });
    } catch (err) {
      updateSQLTab(active.id, {
        running: false,
        results: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [active, updateSQLTab, pushSQLHistory]);

  const addTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    const tab: SQLTab = {
      id,
      label: `Query ${sqlTabs.length + 1}`,
      sql: defaultSQLForTable(tableName),
      results: [],
      running: false,
    };
    addSQLTab(tab);
    setActiveSQLTab(id);
  }, [sqlTabs.length, tableName, addSQLTab, setActiveSQLTab]);

  const grid = useMemo(() => toGrid(active?.results ?? []), [active?.results]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600">
        No SQL tab
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-800 px-2 py-1 overflow-x-auto">
        {sqlTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveSQLTab(t.id)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] whitespace-nowrap",
              t.id === active.id
                ? "bg-slate-800 text-white"
                : "text-slate-500 hover:text-slate-300",
            )}
          >
            {t.running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />}
            {t.label}
            {sqlTabs.length > 1 && t.id === active.id && <X className="h-2.5 w-2.5 opacity-50" />}
          </button>
        ))}
        <button
          type="button"
          onClick={addTab}
          className="rounded-md p-0.5 text-slate-500 hover:text-violet-300"
          title="New query tab"
        >
          <Plus className="h-3 w-3" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={runActive}
          disabled={active.running}
          className="flex items-center gap-1 rounded-md bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          <Play className="h-2.5 w-2.5" />
          Run
        </button>
      </div>

      {/* Editor */}
      <div className="h-2/5 min-h-32 shrink-0 border-b border-slate-800">
        <MonacoEditor
          height="100%"
          language="sql"
          theme="vs-dark"
          value={active.sql}
          onChange={(v) => updateSQLTab(active.id, { sql: v ?? "" })}
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            padding: { top: 6 },
          }}
        />
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 p-1.5">
        {active.error ? (
          <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-[11px] text-red-300 whitespace-pre-wrap">
            {active.error}
          </div>
        ) : grid.headers.length > 0 ? (
          <VirtualDataTable headers={grid.headers} rows={grid.cells} />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-600">
            {active.running ? "Running…" : "Run a query to see results"}
          </div>
        )}
      </div>

      {/* History footer */}
      {sqlHistory.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 px-2 py-1">
          <p className="mb-0.5 text-[9px] uppercase tracking-wide text-slate-600">History</p>
          <div className="flex flex-col gap-0.5 max-h-16 overflow-y-auto">
            {sqlHistory.slice(0, 8).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => updateSQLTab(active.id, { sql: h.sql })}
                className="truncate text-left font-mono text-[10px] text-slate-500 hover:text-cyan-300"
                title={h.sql}
              >
                {h.rowCount} rows · {h.duration}ms · {h.sql}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
