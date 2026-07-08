"use client";

import { Layers, Plus, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useDesktopActions, useWorkspaces } from "@/features/desktop/store/desktop-store";

/**
 * Glass dropdown for the macOS menu bar that manages saved desktop *Sessions*.
 *
 * - "Enregistrer la session…" prompts for a name and calls `saveWorkspace(name)`,
 *   snapshotting the open windows + wallpaper + glass palette.
 * - Each saved workspace lists with a restore action (`restoreWorkspace(id)`) and
 *   a delete action (`deleteWorkspace(id)`).
 *
 * Visuals follow the existing menu-bar dropdown language (`--glass-*` tokens,
 * `motion/react` enter/exit, right-aligned panel) used by the palette switcher.
 */
export function WorkspacesMenu() {
  const workspaces = useWorkspaces();
  const { saveWorkspace, restoreWorkspace, deleteWorkspace } = useDesktopActions();
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    const raw =
      typeof window !== "undefined"
        ? window.prompt("Nom de la session", "Revue quotidienne")
        : null;
    const name = raw?.trim();
    if (!name) return;
    saveWorkspace(name);
  };

  const handleRestore = (id: string) => {
    restoreWorkspace(id);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-black/5"
        title="Sessions"
        aria-label="Sessions enregistrées"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ color: "var(--glass-text)" }}
      >
        <Layers className="size-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            role="menu"
            aria-label="Sessions"
            className="absolute right-0 top-8 z-[var(--z-modal)] w-64 overflow-hidden rounded-xl border p-1.5"
            style={{
              background: "var(--glass-bg-strong)",
              borderColor: "var(--glass-border)",
              boxShadow: "var(--glass-shadow)",
              backdropFilter: "blur(20px) saturate(1.4)",
              WebkitBackdropFilter: "blur(20px) saturate(1.4)",
              color: "var(--glass-text)",
            }}
          >
            <div
              className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--glass-text-dim)" }}
            >
              Sessions
            </div>

            <button
              type="button"
              role="menuitem"
              // onMouseDown (not onClick) so the action fires before the button's
              // blur handler closes the panel.
              onMouseDown={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-black/5"
              style={{ color: "var(--glass-text)" }}
            >
              <Plus className="size-3.5 shrink-0 opacity-70" />
              <span>Enregistrer la session…</span>
            </button>

            <div className="my-1 h-px" style={{ background: "var(--glass-hairline)" }} />

            {workspaces.length === 0 ? (
              <div
                className="px-2 py-2 text-center text-[12px]"
                style={{ color: "var(--glass-text-dim)" }}
              >
                Aucune session enregistrée
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {workspaces.map((ws) => (
                  <div
                    key={ws.id}
                    className="group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-black/5"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleRestore(ws.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]"
                      title={`Restaurer « ${ws.name} »`}
                      style={{ color: "var(--glass-text)" }}
                    >
                      <RotateCcw className="size-3.5 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                      <span
                        className="shrink-0 tabular-nums text-[11px]"
                        style={{ color: "var(--glass-text-dim)" }}
                      >
                        {ws.windows.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        deleteWorkspace(ws.id);
                      }}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-[#d13438] opacity-0 transition hover:bg-[#d13438]/10 focus:opacity-100 group-hover:opacity-100"
                      title={`Supprimer « ${ws.name} »`}
                      aria-label={`Supprimer la session ${ws.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
