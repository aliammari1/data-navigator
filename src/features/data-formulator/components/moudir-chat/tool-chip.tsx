"use client";

/**
 * MoudirToolChip — a single ToolPart rendered as a collapsed, expandable chip.
 *
 * Moudir's tool calls (run_sql / get_schema / profile_column …) are first-class
 * message pieces, not hidden machinery. Collapsed, a chip is one honest line:
 * an icon, a French label, a result preview, and how long it took. Expanded, it
 * shows the exact params (pretty JSON) and the full result summary — the
 * verification affordance, always one click away.
 *
 * Accent: the shared `--ai` token (tinted border/background) so tool work reads
 * as assistant surface, consistent with the rest of the app.
 */

import { BarChart3, ChevronDown, Database, type LucideIcon, Table, Wrench } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/shared/utils";
import type { ToolPart } from "../../store/moudir-chat-store";

interface ToolMeta {
  label: string;
  Icon: LucideIcon;
}

/** Known tools → French label + icon. Unknown names fall back to a wrench. */
const TOOL_META: Record<string, ToolMeta> = {
  run_sql: { label: "Requête SQL", Icon: Database },
  get_schema: { label: "Schéma", Icon: Table },
  profile_column: { label: "Profil colonne", Icon: BarChart3 },
};

/** Prettify an unknown tool name (snake_case → "Snake case") for the fallback. */
function prettifyName(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ").trim();
  if (!spaced) return "Outil";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Shared meta lookup so the reasoning status line can reuse the same labels. */
export function toolMeta(name: string): ToolMeta {
  return TOOL_META[name] ?? { label: prettifyName(name), Icon: Wrench };
}

/** French label for a tool name (reused by the reasoning status line). */
export function toolLabel(name: string): string {
  return toolMeta(name).label;
}

/** "340 ms" / "1.2 s" — empty when there's no meaningful duration. */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Safe pretty-print of tool params for the expanded view. */
function prettyJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

export function MoudirToolChip({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const { label, Icon } = toolMeta(part.name);
  const duration = formatDuration(part.durationMs);
  const hasSummary = part.resultSummary.trim().length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-ai/30 bg-ai/5 px-2.5 py-1.5",
            "text-left text-xs transition-colors hover:bg-ai/10",
            "focus-visible:border-ai/60 focus-visible:ring-2 focus-visible:ring-ai/30 focus-visible:outline-none",
          )}
        >
          <Icon className="size-3.5 shrink-0 text-ai" aria-hidden="true" />
          <span className="shrink-0 font-medium text-foreground">{label}</span>
          {hasSummary ? (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {part.resultSummary}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {duration ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              · {duration}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 space-y-2 rounded-lg border border-ai/20 bg-muted/40 p-2.5">
          <div>
            <p className="mb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Paramètres
            </p>
            <pre className="max-h-48 overflow-auto rounded-md bg-background/60 p-2 font-mono text-xs text-foreground">
              {prettyJson(part.params)}
            </pre>
          </div>
          {hasSummary ? (
            <div>
              <p className="mb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                Résultat
              </p>
              <p className="font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground">
                {part.resultSummary}
              </p>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
