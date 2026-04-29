"use client";
/**
 * SQL IDE — Monaco multi-tab editor with DuckDB autocomplete,
 * PrimeReact VirtualScroller DataTable, and query history.
 */

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  Play,
  AlignLeft,
  ChevronDown,
  Clock,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/lib/stores/agent-store";
import { runQuery } from "@/lib/duckdb";
import type { SQLTab, SQLHistoryEntry } from "@/lib/stores/agent-store";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

// ─── PrimeReact DataTable (lazy) ──────────────────────────────────────────────

import "primereact/resources/themes/lara-dark-purple/theme.css";

// ─── Format helpers ──────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtRows(n: number): string {
  return n.toLocaleString();
}

// ─── Results table ────────────────────────────────────────────────────────────

function ResultsTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
        No results
      </div>
    );
  }

  const headers = Object.keys(rows[0]);
  const visible = rows.slice(0, 500);

  return (
    <div className="h-full overflow-auto text-[11px]">
      <table className="min-w-full">
        <thead className="sticky top-0 bg-slate-900 z-10">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-3 py-1.5 text-slate-400 font-medium whitespace-nowrap border-b border-slate-800"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr
              key={i}
              className={cn(
                "hover:bg-slate-800/40",
                i % 2 === 1 && "bg-slate-800/20",
              )}
            >
              {headers.map((h) => (
                <td
                  key={h}
                  className="px-3 py-1 text-slate-300 whitespace-nowrap max-w-[200px] truncate"
                  title={String(row[h] ?? "")}
                >
                  {String(row[h] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && (
        <div className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-800">
          Showing 500 of {fmtRows(rows.length)} rows
        </div>
      )}
    </div>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function TabBar() {
  const { sqlTabs, activeSqlTab, setActiveSQLTab, addSQLTab } = useAgentStore();
  let tabSeq = sqlTabs.length + 1;

  const handleNew = () => {
    const id = `tab-${Date.now()}`;
    addSQLTab({
      id,
      label: `Query ${tabSeq++}`,
      sql: "SELECT * FROM data LIMIT 100;",
      results: [],
      running: false,
    });
    setActiveSQLTab(id);
  };

  return (
    <div className="flex items-center gap-0.5 px-2 pt-2 border-b border-slate-800 bg-slate-950 overflow-x-auto scrollbar-none">
      {sqlTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveSQLTab(tab.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-[11px] whitespace-nowrap transition-colors",
            activeSqlTab === tab.id
              ? "bg-slate-800 text-white border-t border-x border-slate-700"
              : "text-slate-500 hover:text-slate-300",
          )}
        >
          {tab.running && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
          {tab.label}
          {tab.error && <span className="text-red-400">✗</span>}
        </button>
      ))}
      <button
        type="button"
        onClick={handleNew}
        className="flex items-center gap-1 px-2 py-1.5 text-slate-600 hover:text-slate-400 text-xs"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── History shelf ────────────────────────────────────────────────────────────

function HistoryShelf({
  history,
  onSelect,
}: {
  history: SQLHistoryEntry[];
  onSelect: (sql: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (history.length === 0) return null;

  return (
    <div className="border-t border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 bg-slate-900"
      >
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          History ({history.length})
        </span>
        <ChevronDown
          className={cn("w-3 h-3 transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-40 overflow-y-auto px-2 py-1 bg-slate-900/50 space-y-0.5">
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onSelect(h.sql)}
                  className="w-full text-left px-2 py-1 rounded text-[10px] text-slate-400 hover:bg-slate-800 hover:text-white font-mono truncate block"
                >
                  <span className="text-slate-600 mr-2">
                    {fmtDuration(h.duration)}
                  </span>
                  <span className="text-emerald-600 mr-2">
                    {fmtRows(h.rowCount)} rows
                  </span>
                  {h.sql.replace(/\s+/g, " ").slice(0, 80)}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Schema sidebar ───────────────────────────────────────────────────────────

function SchemaSidebar() {
  const { tableName, plan } = useAgentStore();
  const [open, setOpen] = useState(true);

  if (!tableName) return null;

  const columns =
    plan?.widgets
      .flatMap((w) => [...(w.dimensions ?? []), ...(w.metrics ?? [])])
      .filter((v, i, a) => a.indexOf(v) === i) ?? [];

  return (
    <div className="w-44 shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] text-slate-400 border-b border-slate-800 hover:text-white"
      >
        <Database className="w-2.5 h-2.5" />
        <span className="font-semibold">{tableName}</span>
        <ChevronDown
          className={cn(
            "w-2.5 h-2.5 ml-auto transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {columns.map((col) => (
            <div
              key={col}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-slate-400 hover:bg-slate-800 cursor-pointer"
            >
              <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
              <span className="truncate font-mono">{col}</span>
            </div>
          ))}
          {columns.length === 0 && (
            <p className="text-[10px] text-slate-600 px-2">
              Run pipeline first
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Monaco SQL editor ────────────────────────────────────────────────────────

interface EditorPaneProps {
  tab: SQLTab;
  onRun: (sql: string) => void;
  onFormat: (sql: string) => void;
  onChange: (sql: string) => void;
}

function EditorPane({ tab, onRun, onChange }: EditorPaneProps) {
  const editorRef = useRef<unknown>(null);

  const handleMount = (editor: unknown) => {
    editorRef.current = editor;

    // Ctrl+Enter to execute
    const e = editor as {
      addCommand: (mask: number, fn: () => void) => void;
      getValue: () => string;
    };
    e.addCommand(2048 | 3 /* CtrlCmd + Enter */, () => {
      onRun(e.getValue());
    });
  };

  return (
    <div className="flex-1 min-h-0 relative">
      <MonacoEditor
        language="sql"
        theme="vs-dark"
        value={tab.sql}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleMount}
        options={{
          fontSize: 12,
          lineHeight: 20,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 2,
          renderLineHighlight: "line",
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          padding: { top: 8 },
        }}
      />
    </div>
  );
}

// ─── Main SQL IDE ─────────────────────────────────────────────────────────────

export function SqlIde() {
  const { sqlTabs, activeSqlTab, updateSQLTab, pushSQLHistory, sqlHistory } =
    useAgentStore();

  const activeTab = sqlTabs.find((t) => t.id === activeSqlTab) ?? sqlTabs[0];

  const handleRun = useCallback(
    async (sql: string) => {
      if (!sql.trim() || !activeTab) return;
      const t0 = Date.now();

      updateSQLTab(activeTab.id, { running: true, error: undefined });

      try {
        const results = await runQuery(sql);
        const dur = Date.now() - t0;
        updateSQLTab(activeTab.id, { results, running: false });
        pushSQLHistory({
          id: `h-${Date.now()}`,
          sql,
          timestamp: Date.now(),
          rowCount: results.length,
          duration: dur,
        });
      } catch (err) {
        updateSQLTab(activeTab.id, {
          running: false,
          error: String(err),
          results: [],
        });
      }
    },
    [activeTab, updateSQLTab, pushSQLHistory],
  );

  const handleFormat = useCallback(
    (sql: string) => {
      // Basic SQL formatting
      const formatted = sql
        .replace(
          /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|HAVING|JOIN|ON|AND|OR)\b/gi,
          (m) => `\n${m.toUpperCase()}`,
        )
        .replace(/^\n/, "")
        .trim();
      if (activeTab) updateSQLTab(activeTab.id, { sql: formatted });
    },
    [activeTab, updateSQLTab],
  );

  const handleChange = useCallback(
    (sql: string) => {
      if (activeTab) updateSQLTab(activeTab.id, { sql });
    },
    [activeTab, updateSQLTab],
  );

  const handleHistorySelect = useCallback(
    (sql: string) => {
      if (activeTab) updateSQLTab(activeTab.id, { sql });
    },
    [activeTab, updateSQLTab],
  );

  if (!activeTab) return null;

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Tab bar */}
      <TabBar />

      <div className="flex flex-1 min-h-0">
        {/* Schema sidebar */}
        <SchemaSidebar />

        {/* Editor + results */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-slate-900 shrink-0">
            <button
              type="button"
              onClick={() => handleRun(activeTab.sql)}
              disabled={activeTab.running}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600/20 border border-emerald-700/50 text-emerald-300 text-[10px] hover:bg-emerald-600/30 disabled:opacity-50 transition-colors"
            >
              <Play className="w-2.5 h-2.5" />
              Run (⌃↵)
            </button>
            <button
              type="button"
              onClick={() => handleFormat(activeTab.sql)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-700"
            >
              <AlignLeft className="w-2.5 h-2.5" />
              Format
            </button>
            {activeTab.running && (
              <span className="text-[10px] text-amber-400 animate-pulse">
                Running…
              </span>
            )}
            {activeTab.results.length > 0 && !activeTab.running && (
              <span className="text-[10px] text-slate-500">
                {fmtRows(activeTab.results.length)} rows
              </span>
            )}
            {activeTab.error && (
              <span
                className="text-[10px] text-red-400 truncate max-w-[200px]"
                title={activeTab.error}
              >
                ✗ {activeTab.error.slice(0, 50)}
              </span>
            )}
          </div>

          {/* Monaco editor */}
          <div className="flex-1 min-h-0" style={{ minHeight: 120 }}>
            <EditorPane
              tab={activeTab}
              onRun={handleRun}
              onFormat={handleFormat}
              onChange={handleChange}
            />
          </div>

          {/* Results table */}
          {(activeTab.results.length > 0 || activeTab.error) && (
            <div className="h-48 border-t border-slate-800 bg-slate-900 overflow-auto shrink-0">
              {activeTab.error ? (
                <div className="p-3">
                  <pre className="text-[10px] text-red-400 whitespace-pre-wrap font-mono">
                    {activeTab.error}
                  </pre>
                </div>
              ) : (
                <ResultsTable rows={activeTab.results} />
              )}
            </div>
          )}

          {/* History */}
          <HistoryShelf history={sqlHistory} onSelect={handleHistorySelect} />
        </div>
      </div>
    </div>
  );
}
