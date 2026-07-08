"use client";

import { Keyboard } from "lucide-react";
import { APP_SHORTCUTS, formatKey } from "@/features/dashboard-shell/shell/shortcuts";
import { Section } from "../controls";

/**
 * Renders the canonical shortcut list from the shared `APP_SHORTCUTS` source of
 * truth — the same list the floating ShortcutsButton shows — so the two never
 * drift (the previous hard-coded list advertised bindings that weren't wired).
 */
export function ShortcutsPanel() {
  return (
    <Section title="Keyboard Shortcuts" icon={Keyboard}>
      <div className="space-y-2">
        {APP_SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.id}
            className="flex items-center justify-between py-2 border-b border-border last:border-0"
          >
            <span className="text-sm text-foreground">{shortcut.label}</span>
            <div className="flex items-center gap-1">
              {shortcut.combo.map((token, i) => (
                <span key={token} className="flex items-center">
                  {i > 0 && <span className="text-muted-foreground mx-0.5">+</span>}
                  <kbd className="px-2 py-0.5 bg-muted border border-border rounded text-[11px] text-foreground font-mono">
                    {formatKey(token)}
                  </kbd>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
