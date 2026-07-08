"use client";

import { Keyboard } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  APP_SHORTCUTS,
  formatKey,
  isMacPlatform,
} from "@/features/dashboard-shell/shell/shortcuts";

/**
 * ShortcutsButton — a floating action button (bottom-right) that reveals the
 * app's keyboard shortcuts on click, so features that are otherwise only
 * reachable by an unknown key combo become discoverable.
 *
 * - Opens on click OR the `?` key (the binding the Settings panel already
 *   advertised but never wired). `?` is ignored while typing in a field.
 * - Reads {@link APP_SHORTCUTS} (shared source of truth) so it never drifts
 *   from the Settings → Shortcuts panel.
 * - Escape / outside-click dismiss is handled by the Radix Popover.
 */

/** True when focus is in a field where `?` should type a literal character. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function ShortcutsButton() {
  const [open, setOpen] = useState(false);
  // Resolve the platform after mount to avoid SSR/client hydration mismatch.
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(isMacPlatform());
  }, []);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <div className="fixed bottom-5 right-5 z-[var(--z-dock)] print:hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Button
            type="button"
            size="icon-lg"
            variant="default"
            onClick={toggle}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Afficher les raccourcis clavier"
            title="Raccourcis clavier (?)"
            className="rounded-full shadow-[var(--shadow-2)]"
          >
            <Keyboard className="size-5" />
          </Button>
        </PopoverAnchor>

        <PopoverContent
          side="top"
          align="end"
          aria-label="Raccourcis clavier"
          className="w-72 gap-0"
        >
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Keyboard className="size-4 text-muted-foreground" />
            Raccourcis clavier
          </p>

          <div>
            {APP_SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.id}
                className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
              >
                <span className="text-sm text-foreground">{shortcut.label}</span>
                <span className="flex flex-none items-center gap-0.5">
                  {shortcut.combo.map((token, index) => (
                    <Fragment key={token}>
                      {index > 0 && <span className="mx-0.5 text-muted-foreground">+</span>}
                      <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                        {formatKey(token, mac)}
                      </kbd>
                    </Fragment>
                  ))}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Pour tout le reste, ouvrez la palette de commandes ({formatKey("mod", mac)} K).
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
