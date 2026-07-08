"use client";

/**
 * FormulatorToolbar — the slim workspace toolbar for the formulator header.
 *
 * Two responsibilities, both intentionally thin:
 *   1. Undo / redo — icon ghost buttons wired to the store's `formulatorHistory`
 *      (zundo temporal), enabled/disabled from `useFormulatorHistoryState()`.
 *      Keyboard: Ctrl/Cmd+Z → undo, Ctrl/Cmd+Shift+Z (and Ctrl+Y) → redo, bound
 *      to `window` while the toolbar is mounted and ignored while a text field
 *      has focus. Self-contained by default; pass `bindShortcuts={false}` if the
 *      screen mounts `useUndoRedoShortcuts()` itself.
 *   2. Export host — an « Exporter » DropdownMenu (PNG / Copier l'image / CSV).
 *      The toolbar owns neither the chart instance nor the resolved rows, so the
 *      three actions arrive as props from the assembly (which wires them to the
 *      chart canvas). The menu is disabled when `canExport` is false.
 *
 * The « resizable layout scaffold » stays out of the store: the toolbar exposes
 * a stable header strip; pane sizing is a layout concern for the screen.
 */

import { ClipboardCopy, Download, ImageDown, Redo2, Sheet, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/shared/utils";
import { formulatorHistory, useFormulatorHistoryState } from "../../store/formulator-store";

/** True when the event target is a text-entry surface we must not hijack. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Route a keydown to undo/redo, ignoring text-entry focus. */
function handleUndoRedoKeydown(event: KeyboardEvent): void {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod || event.altKey) return;
  if (isEditableTarget(event.target)) return;

  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    if (event.shiftKey) formulatorHistory.redo();
    else formulatorHistory.undo();
    return;
  }
  // Ctrl+Y (Windows-style redo) — deliberately not Cmd+Y (browser history).
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    formulatorHistory.redo();
  }
}

/**
 * Bind the formulator's global undo/redo shortcuts to `globalThis` for the lifetime
 * of the calling component. Exported so a screen can mount it independently
 * (e.g. when the toolbar is rendered elsewhere) — pass `bindShortcuts={false}`
 * to <FormulatorToolbar/> in that case to avoid double-binding. The optional
 * `enabled` flag lets the toolbar gate the listener while keeping the hook call
 * unconditional (rules of hooks).
 */
export function useUndoRedoShortcuts(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    globalThis.addEventListener("keydown", handleUndoRedoKeydown);
    return () => globalThis.removeEventListener("keydown", handleUndoRedoKeydown);
  }, [enabled]);
}

/** Mac uses ⌘; everything else shows a Ctrl+ prefix in the shortcut hints. */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iP(hone|od|ad)/.test(navigator.platform || navigator.userAgent);
}

interface ToolbarIconButtonProps {
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}

function ToolbarIconButton({
  label,
  shortcut,
  icon,
  disabled,
  onClick,
}: Readonly<ToolbarIconButtonProps>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export interface FormulatorToolbarProps {
  /** Render the chart to PNG (owned by the chart canvas). */
  onExportPng?: () => void;
  /** Copy the chart image to the clipboard (owned by the chart canvas). */
  onCopyPng?: () => void;
  /** Export the resolved rows as CSV (owned by the chart canvas). */
  onExportCsv?: () => void;
  /** Enables the « Exporter » menu — true only when a chart + rows exist. */
  canExport?: boolean;
  /**
   * Bind the global undo/redo keyboard shortcuts (default true → self-contained).
   * Set false when the screen mounts `useUndoRedoShortcuts()` itself.
   */
  bindShortcuts?: boolean;
  className?: string;
}

export function FormulatorToolbar({
  onExportPng,
  onCopyPng,
  onExportCsv,
  canExport = false,
  bindShortcuts = true,
  className,
}: Readonly<FormulatorToolbarProps>) {
  const { canUndo, canRedo } = useFormulatorHistoryState();

  // Rules of hooks: always call the hook; the flag decides whether it listens.
  useUndoRedoShortcuts(bindShortcuts);

  const mod = isMacPlatform() ? "⌘" : "Ctrl+";
  const shift = isMacPlatform() ? "⇧" : "Shift+";

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn("flex items-center gap-0.5", className)}
        role="toolbar"
        aria-label="Actions du formulateur"
      >
        <ToolbarIconButton
          label="Annuler"
          shortcut={`${mod}Z`}
          icon={<Undo2 />}
          disabled={!canUndo}
          onClick={() => formulatorHistory.undo()}
        />
        <ToolbarIconButton
          label="Rétablir"
          shortcut={`${mod}${shift}Z`}
          icon={<Redo2 />}
          disabled={!canRedo}
          onClick={() => formulatorHistory.redo()}
        />

        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={!canExport}
                >
                  <Download />
                  Exporter
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Exporter le graphique</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>Graphique</DropdownMenuLabel>
            <DropdownMenuItem disabled={!onExportPng} onSelect={() => onExportPng?.()}>
              <ImageDown />
              Image PNG
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!onCopyPng} onSelect={() => onCopyPng?.()}>
              <ClipboardCopy />
              Copier l'image
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Données</DropdownMenuLabel>
            <DropdownMenuItem disabled={!onExportCsv} onSelect={() => onExportCsv?.()}>
              <Sheet />
              Fichier CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}
