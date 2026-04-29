"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Code2, RefreshCw, X, Zap } from "lucide-react";
import { runQuery } from "@/lib/duckdb";
import { fmtN } from "@/features/telecom/lib/format";
import { Section } from "./section";

export function CustomSQLEditor({ tableName }: { tableName: string }) {
  const defaultSql = useMemo(
    () => `SELECT * FROM "${tableName}" LIMIT 100`,
    [tableName],
  );
  const lastDefaultSqlRef = useRef(defaultSql);
  const [sql, setSql] = useState(defaultSql);
  const [results, setResults] = useState<Record<string, unknown>[] | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    import("@/lib/meta-db").QueryHistoryEntry[]
  >([]);
  const [bookmarks, setBookmarks] = useState<
    import("@/lib/meta-db").Bookmark[]
  >([]);
  const [showHistory, setShowHistory] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState("");

  useEffect(() => {
    setSql((prev) => (prev === lastDefaultSqlRef.current ? defaultSql : prev));
    lastDefaultSqlRef.current = defaultSql;
  }, [defaultSql]);

  useEffect(() => {
    import("@/lib/meta-db").then(({ getQueryHistory, getBookmarks }) => {
      getQueryHistory().then(setHistory);
      getBookmarks().then(setBookmarks);
    });
  }, []);

  async function runSQL() {
    if (!sql.trim()) return;
    setRunning(true);
    setError(null);
    const t0 = Date.now();
    try {
      const rows = await runQuery(sql.trim());
      setResults(rows);
      const dur = Date.now() - t0;
      const { addQueryHistory, getQueryHistory } =
        await import("@/lib/meta-db");
      await addQueryHistory(sql.trim(), dur, rows.length);
      setHistory(await getQueryHistory());
    } catch (e) {
      setError(String(e));
      setResults(null);
      const { addQueryHistory, getQueryHistory } =
        await import("@/lib/meta-db");
      await addQueryHistory(sql.trim(), Date.now() - t0, null);
      setHistory(await getQueryHistory());
    } finally {
      setRunning(false);
    }
  }

  async function saveBookmark() {
    if (!bookmarkLabel.trim() || !sql.trim()) return;
    const { addBookmark, getBookmarks } = await import("@/lib/meta-db");
    await addBookmark(bookmarkLabel.trim(), sql.trim());
    setBookmarks(await getBookmarks());
    setBookmarkLabel("");
  }

  async function deleteBookmark(id: number) {
    const { deleteBookmark: del, getBookmarks } = await import("@/lib/meta-db");
    await del(id);
    setBookmarks(await getBookmarks());
  }

  const cols = results && results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <Section
      title="Requête SQL Personnalisée"
      icon={<Code2 className="w-4 h-4" />}
      badge="F28"
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        {/* Bookmarks */}
        {bookmarks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bookmarks.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs"
              >
                <button
                  type="button"
                  className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-100 transition-colors"
                  onClick={() => setSql(b.sql)}
                >
                  {b.label}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  onClick={() => deleteBookmark(b.id)}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Editor */}
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={4}
          spellCheck={false}
          className="w-full font-mono text-xs bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-y"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              runSQL();
            }
          }}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runSQL}
            disabled={running}
            className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            {running ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Zap className="w-3 h-3" />
            )}
            {running ? "Exécution…" : "Exécuter ⌘↵"}
          </button>
          <input
            value={bookmarkLabel}
            onChange={(e) => setBookmarkLabel(e.target.value)}
            placeholder="Nom du signet…"
            className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-36"
          />
          <button
            type="button"
            onClick={saveBookmark}
            disabled={!bookmarkLabel.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            Sauvegarder
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="ml-auto px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <Clock className="w-3 h-3" />
            Historique ({history.length})
          </button>
        </div>

        {/* History popover */}
        {showHistory && history.length > 0 && (
          <div className="rounded-xl border border-border bg-background/95 shadow-xl p-2 space-y-0.5 max-h-52 overflow-y-auto">
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setSql(h.sql);
                  setShowHistory(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors group"
              >
                <div className="font-mono text-[10px] text-foreground line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                  {h.sql}
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  {new Date(h.ran_at).toLocaleTimeString()}
                  {h.duration_ms != null && ` · ${h.duration_ms}ms`}
                  {h.row_count != null && ` · ${fmtN(h.row_count)} lignes`}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300 font-mono">
            {error}
          </div>
        )}

        {/* Results */}
        {results && cols.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <div className="text-[10px] text-muted-foreground px-3 py-1.5 border-b border-border">
              {fmtN(results.length)} lignes
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {cols.map((c) => (
                    <th
                      key={c}
                      className="px-3 py-2 text-left text-[10px] text-muted-foreground font-semibold uppercase tracking-wide whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 200).map((row) => (
                  <tr
                    key={cols
                      .map((c) => String(row[c] ?? ""))
                      .join("|")
                      .slice(0, 64)}
                    className="border-b border-border hover:bg-muted/40 transition-colors"
                  >
                    {cols.map((c) => (
                      <td
                        key={c}
                        className="px-3 py-1.5 text-foreground font-mono whitespace-nowrap max-w-48 truncate"
                      >
                        {String(row[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}
