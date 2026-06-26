"use client";

import { Database, FolderClosed, RotateCcw, Trash2 } from "lucide-react";
import type { CatalogFolder } from "@/core/stores/folders-store";
import { useFoldersActions } from "@/core/stores/folders-store";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { useDesktopStore } from "@/features/desktop/store/desktop-store";

/**
 * The Recycle Bin window — lists soft-deleted folders/datasets with Restore and
 * Empty actions. Restoring a folder re-adds it to the catalog.
 */
export default function RecycleBinScreen() {
  const recycleBin = useDesktopStore((s) => s.recycleBin);
  const restoreFromBin = useDesktopStore((s) => s.restoreFromBin);
  const purgeFromBin = useDesktopStore((s) => s.purgeFromBin);
  const emptyBin = useDesktopStore((s) => s.emptyBin);
  const { addFolder } = useFoldersActions();

  const restore = (id: string) => {
    const item = restoreFromBin(id);
    if (!item) return;
    if (item.kind === "folder") {
      const f = item.payload.folder as CatalogFolder | undefined;
      if (f)
        addFolder({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          starred: f.starred,
          color: f.color,
        });
    }
  };

  useAppCommands("recycle-bin", {
    empty: () => emptyBin(),
    "restore-all": () => {
      for (const item of [...recycleBin]) restore(item.id);
    },
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="grid size-9 place-items-center rounded-xl bg-foreground/8 text-foreground/60">
          <Trash2 className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground/85">Corbeille</h2>
          <p className="text-[11px] text-muted-foreground">
            {recycleBin.length === 0
              ? "La corbeille est vide"
              : `${recycleBin.length} élément${recycleBin.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {recycleBin.length > 0 && (
          <button
            type="button"
            onClick={emptyBin}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-[#d13438] transition hover:bg-[#d13438]/10"
          >
            Vider la corbeille
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {recycleBin.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Trash2 className="size-12 opacity-30" />
            <p className="text-sm">Rien à restaurer pour le moment.</p>
            <p className="max-w-xs text-xs opacity-70">
              Les dossiers supprimés du bureau atterrissent ici — vous pouvez les restaurer ou les
              supprimer définitivement.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2">
            {recycleBin.map((item) => {
              const Icon = item.kind === "folder" ? FolderClosed : Database;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-foreground/6 text-foreground/55">
                    <Icon className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground/85">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.kind === "folder" ? "Dossier" : "Jeu de données"} · supprimé{" "}
                      {new Date(item.deletedAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => restore(item.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/75 transition hover:bg-foreground/5"
                  >
                    <RotateCcw className="size-3.5" /> Restaurer
                  </button>
                  <button
                    type="button"
                    onClick={() => purgeFromBin(item.id)}
                    aria-label="Supprimer définitivement"
                    className="grid size-8 place-items-center rounded-lg text-[#d13438] transition hover:bg-[#d13438]/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
