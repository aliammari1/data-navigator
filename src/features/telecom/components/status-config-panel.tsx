"use client";
import { Brain, Tag, X } from "lucide-react";
import { useState } from "react";
import { clamp, fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  SEMANTIC_STATUS_OPTIONS,
  STATUS_AUTO_SEMANTIC_BY_CODE,
} from "@/features/telecom/lib/status-definitions";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

export function StatusConfigPanel({
  rawStatuses,
  mapping,
  onUpdateMapping,
  tableName,
}: {
  rawStatuses: Types.RawStatusRow[];
  mapping: Types.StatusMapping[];
  onUpdateMapping: (m: Types.StatusMapping[]) => void;
  tableName: string;
}) {
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSemantic, setEditSemantic] = useState<Types.StatusSemantic>("other");
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSemantic, setNewSemantic] = useState<Types.StatusSemantic>("other");

  const getMapping = (code: string) => mapping.find((m) => m.rawCode === code);
  const unmapped = rawStatuses.filter((r) => !getMapping(r.rawCode));

  const handleAutoMap = () => {
    const newMap = [...mapping];
    for (const rs of rawStatuses) {
      if (getMapping(rs.rawCode)) continue;
      const sem = STATUS_AUTO_SEMANTIC_BY_CODE[rs.rawCode] ?? "other";
      const opt =
        SEMANTIC_STATUS_OPTIONS.find((o) => o.value === sem) ??
        SEMANTIC_STATUS_OPTIONS[SEMANTIC_STATUS_OPTIONS.length - 1];
      newMap.push({
        rawCode: rs.rawCode,
        label: opt.label,
        semantic: sem,
        color: opt.color,
        badgeClass: opt.badgeClass,
      });
    }
    onUpdateMapping(newMap);
  };

  const startEdit = (code: string) => {
    const m = getMapping(code);
    setEditCode(code);
    setEditLabel(m?.label ?? code);
    setEditSemantic(m?.semantic ?? "other");
  };

  const saveEdit = () => {
    if (!editCode) return;
    const opt =
      SEMANTIC_STATUS_OPTIONS.find((o) => o.value === editSemantic) ??
      SEMANTIC_STATUS_OPTIONS[SEMANTIC_STATUS_OPTIONS.length - 1];
    const updated = mapping.filter((m) => m.rawCode !== editCode);
    updated.push({
      rawCode: editCode,
      label: editLabel || editCode,
      semantic: editSemantic,
      color: opt.color,
      badgeClass: opt.badgeClass,
    });
    onUpdateMapping(updated);
    setEditCode(null);
  };

  const addNew = () => {
    if (!newCode.trim()) return;
    const code = newCode.trim().toUpperCase();
    const opt =
      SEMANTIC_STATUS_OPTIONS.find((o) => o.value === newSemantic) ??
      SEMANTIC_STATUS_OPTIONS[SEMANTIC_STATUS_OPTIONS.length - 1];
    const updated = mapping.filter((m) => m.rawCode !== code);
    updated.push({
      rawCode: code,
      label: newLabel || code,
      semantic: newSemantic,
      color: opt.color,
      badgeClass: opt.badgeClass,
    });
    onUpdateMapping(updated);
    setNewCode("");
    setNewLabel("");
  };

  const removeMapping = (code: string) =>
    onUpdateMapping(mapping.filter((m) => m.rawCode !== code));

  const total = rawStatuses.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Codes Détectés",
            value: rawStatuses.length,
            color: "text-foreground",
          },
          {
            label: "Mapped",
            value: mapping.length,
            color: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "Unmapped",
            value: unmapped.length,
            color:
              unmapped.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-muted/40 p-3 text-center"
          >
            <div className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Raw status codes found in{" "}
          <span className="font-mono text-muted-foreground">{tableName}</span>
        </div>
        <button
          type="button"
          onClick={handleAutoMap}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/15 border border-primary/30 text-primary rounded-lg text-xs font-medium transition-colors"
        >
          <Brain className="w-3.5 h-3.5" /> Auto-Map All
        </button>
      </div>

      <div className="space-y-1.5">
        {rawStatuses.map((rs) => {
          const m = getMapping(rs.rawCode);
          const shareOfTotal = total > 0 ? (rs.count / total) * 100 : 0;
          return editCode === rs.rawCode ? (
            <div
              key={rs.rawCode}
              className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Editing: <code className="text-primary font-mono">{rs.rawCode}</code>
                  <span className="text-muted-foreground ml-2">
                    ({fmtN(rs.count)} transactions)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditCode(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-label"
                    className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1.5"
                  >
                    Display Label
                  </label>
                  <input
                    id="edit-label"
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full bg-muted border border-border text-xs text-foreground rounded-lg px-2.5 py-2 outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-semantic"
                    className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1.5"
                  >
                    Semantic Category
                  </label>
                  <select
                    id="edit-semantic"
                    value={editSemantic}
                    onChange={(e) => setEditSemantic(e.target.value as Types.StatusSemantic)}
                    className="w-full bg-muted border border-border text-xs text-muted-foreground rounded-lg px-2.5 py-2 outline-none"
                  >
                    {SEMANTIC_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>Aperçu :</span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full border text-[10px] font-semibold",
                      SEMANTIC_STATUS_OPTIONS.find((o) => o.value === editSemantic)?.badgeClass,
                    )}
                  >
                    {editLabel || rs.rawCode}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditCode(null)}
                    className="px-3 py-1.5 text-xs text-muted-foreground bg-muted rounded-lg hover:bg-accent transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={rs.rawCode}
              className={cn(
                "flex items-center gap-4 p-3 rounded-xl border transition-colors group",
                m
                  ? "border-border bg-muted/30 hover:bg-muted/50"
                  : "border-amber-500/20 bg-amber-500/5",
              )}
            >
              <code className="text-sm font-bold font-mono text-foreground w-12 flex-none">
                {rs.rawCode}
              </code>
              <div className="flex-1 min-w-0 space-y-1">
                {m ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full border font-semibold",
                        m.badgeClass,
                      )}
                    >
                      {m.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {m.semantic}
                    </span>
                  </div>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                    Non mappé — cliquez sur Éditer pour configurer
                  </span>
                )}
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      m ? "bg-indigo-500" : "bg-amber-500",
                    )}
                    style={{ width: `${clamp(shareOfTotal, 0, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 flex-none">
                <div className="text-right">
                  <div className="text-xs font-semibold text-foreground tabular-nums">
                    {fmtN(rs.count)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{fmtPct(shareOfTotal)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(rs.rawCode)}
                    className="px-2 py-1 bg-muted hover:bg-accent border border-border rounded-lg text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                  {m && (
                    <button
                      type="button"
                      onClick={() => removeMapping(rs.rawCode)}
                      className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {rawStatuses.length === 0 && (
          <div className="text-center py-10 text-xs text-muted-foreground">
            Load a file to detect status codes.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Tag className="w-3.5 h-3.5" /> Ajouter un Code de Statut
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Code brut ex. TMP"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            className="bg-muted border border-border text-xs text-foreground rounded-lg px-2.5 py-2 outline-none font-mono placeholder-muted-foreground"
          />
          <input
            type="text"
            placeholder="Libellé ex. Temporaire"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="bg-muted border border-border text-xs text-foreground rounded-lg px-2.5 py-2 outline-none placeholder-muted-foreground"
          />
          <select
            value={newSemantic}
            onChange={(e) => setNewSemantic(e.target.value as Types.StatusSemantic)}
            className="bg-muted border border-border text-xs text-muted-foreground rounded-lg px-2.5 py-2 outline-none"
          >
            {SEMANTIC_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={addNew}
          disabled={!newCode.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-lg text-xs font-semibold transition-colors"
        >
          Ajouter un Code Statut
        </button>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-3">
          Active Mapping Legend
        </div>
        <div className="flex flex-wrap gap-2">
          {mapping.map((m) => (
            <div key={m.rawCode} className="flex items-center gap-1.5">
              <code className="text-[10px] font-mono text-muted-foreground">{m.rawCode}</code>
              <span className="text-muted-foreground text-[10px]">→</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full border font-semibold",
                  m.badgeClass,
                )}
              >
                {m.label}
              </span>
            </div>
          ))}
          {mapping.length === 0 && (
            <span className="text-[11px] text-muted-foreground">No mappings configured yet.</span>
          )}
        </div>
      </div>
    </div>
  );
}
