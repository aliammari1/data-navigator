"use client";

import { FolderInput, Star, Trash2, X } from "lucide-react";

/**
 * Floating action bar shown when one or more datasets are multi-selected in the
 * catalogue. Bulk operations (move / star / remove) make organising a large
 * catalogue fast — the catalogue's core job.
 */

export interface BulkActionBarProps {
  count: number;
  folders: { id: string; name: string }[];
  onMove: (folderId: string | null) => void;
  onStar: () => void;
  onRemove: () => void;
  onClear: () => void;
}

const MOVE_PLACEHOLDER = "__placeholder__";
const MOVE_ROOT = "__root__";

export function BulkActionBar({
  count,
  folders,
  onMove,
  onStar,
  onRemove,
  onClear,
}: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="-translate-x-1/2 fixed bottom-5 left-1/2 z-[var(--z-modal)] flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-2xl">
      <span className="px-1 text-sm font-medium text-foreground">
        {count} sélectionné{count > 1 ? "s" : ""}
      </span>

      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <FolderInput className="h-4 w-4" />
        <select
          aria-label="Déplacer la sélection vers un dossier"
          value={MOVE_PLACEHOLDER}
          onChange={(e) => {
            const value = e.target.value;
            if (value === MOVE_PLACEHOLDER) return;
            onMove(value === MOVE_ROOT ? null : value);
          }}
          className="rounded-lg border border-border bg-muted px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value={MOVE_PLACEHOLDER}>Déplacer vers…</option>
          <option value={MOVE_ROOT}>Tous les fichiers (racine)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={onStar}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-sm transition-colors hover:bg-accent/80"
      >
        <Star className="h-4 w-4" /> Favori
      </button>

      <button
        type="button"
        onClick={onRemove}
        className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/20"
      >
        <Trash2 className="h-4 w-4" /> Retirer
      </button>

      <button
        type="button"
        onClick={onClear}
        aria-label="Effacer la sélection"
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
