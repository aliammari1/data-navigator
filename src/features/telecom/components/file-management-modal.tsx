"use client";

import {
  Check,
  Database,
  FilePlus2,
  FolderClock,
  GitBranch,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type { AnalyticsSnapshotMeta } from "@/platform/storage/app-db";
import type { LoadedFile, TelecomIngestionMode } from "../types";

export function FileManagementModal({
  open,
  analyticsHistory,
  loadedFiles,
  activeFileIdx,
  onClose,
  onUpload,
  onLoadAnalytics,
  onExportDatabase,
  onSelectFile,
  onRenameFile,
  canMutate = true,
  canExport = true,
}: Readonly<{
  open: boolean;
  analyticsHistory: AnalyticsSnapshotMeta[];
  loadedFiles: LoadedFile[];
  activeFileIdx: number;
  onClose: () => void;
  onUpload: (mode: TelecomIngestionMode) => void;
  onLoadAnalytics: (key: string) => void;
  onExportDatabase: () => void;
  onSelectFile: (id: number) => void;
  onRenameFile: (id: number, name: string) => void;
  canMutate?: boolean;
  canExport?: boolean;
}>) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">
              Gestion des fichiers et analytics
            </h2>
            <p className="text-xs text-muted-foreground">
              Ajouter, remplacer, restaurer une journée ou exporter la base
              locale.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-cyan-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Versions chargées dans la période
              </span>
            </div>
            <Link
              href="/dashboard/lineage"
              onClick={onClose}
              className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Voir la lignée globale
            </Link>
          </div>

          {loadedFiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">
              Aucun fichier actif. Chargez un rapport pour créer une lignée.
            </div>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {loadedFiles.map((file) => {
                const editing = editingId === file.id;
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-muted/25 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectFile(file.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      {editing ? (
                        <input
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs font-semibold text-foreground"
                        />
                      ) : (
                        <>
                          <div className="truncate text-xs font-semibold text-foreground">
                            {file.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {file.date} · {(file.size / 1024 / 1024).toFixed(2)}{" "}
                            MB · {file.sourceKeys.length} source(s)
                          </div>
                        </>
                      )}
                    </button>
                    {activeFileIdx === file.id && (
                      <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:text-cyan-300">
                        actif
                      </span>
                    )}
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => {
                          onRenameFile(file.id, draftName);
                          setEditingId(null);
                        }}
                        disabled={!canMutate}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/25 text-emerald-600 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(file.id);
                          setDraftName(file.name);
                        }}
                        disabled={!canMutate}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        title="Renommer cette version"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-3">
          <button
            type="button"
            onClick={() => onUpload("append")}
            disabled={!canMutate}
            className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-left transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FilePlus2 className="mb-3 h-5 w-5 text-primary" />
            <div className="text-sm font-semibold text-foreground">
              Ajouter des fichiers
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Append dans la période courante sans supprimer les données
              chargées.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onUpload("replace")}
            disabled={!canMutate}
            className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-left transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="mb-3 h-5 w-5 text-amber-500" />
            <div className="text-sm font-semibold text-foreground">
              Remplacer la période
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Crée une nouvelle table et remplace la sélection active.
            </div>
          </button>

          <button
            type="button"
            onClick={onExportDatabase}
            disabled={!canExport}
            className="rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-left transition hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Database className="mb-3 h-5 w-5 text-blue-500" />
            <div className="text-sm font-semibold text-foreground">
              Exporter la base
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Télécharge un snapshot Parquet de la table DuckDB active.
            </div>
          </button>
        </div>

        <div className="border-t border-border p-5">
          <div className="mb-3 flex items-center gap-2">
            <FolderClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Analytics sauvegardées par journée
            </span>
          </div>

          {analyticsHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              Aucun cache analytics trouvé. Après une analyse complète, cette
              liste permettra de rouvrir une journée sans recharger le CSV.
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {analyticsHistory.map((entry) => (
                <button
                  type="button"
                  key={entry.key}
                  onClick={() => onLoadAnalytics(entry.key)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-left transition hover:bg-muted"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {entry.fileName}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(entry.savedAt).toLocaleString("fr-TN")}
                    </div>
                  </div>
                  <div className="flex-none text-right text-xs text-muted-foreground">
                    <div>{fmtN(entry.totalTransactions)} tx</div>
                    <div>{fmtPct(entry.successRate)} réussite</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
