"use client";

/**
 * ConceptsPanel — DF's concept shelf, left pane of the shelf workspace.
 *
 * Lists every ConceptItem as a draggable pill, grouped by provenance:
 * « Champs » (original columns), « Dérivés » (AI-derived, --ai tinted) and
 * « À dériver » (custom names typed by the user, dashed --ai border).
 *
 * Bottom: DF's type-a-field-that-doesn't-exist flow — a cmdk combobox where
 * typing a name that matches nothing offers « Créer "<name>" », which calls
 * `addCustomConcept`.
 *
 * Drag wiring: each pill is a dnd-kit `useDraggable` whose id is the CONCEPT
 * NAME (drops bind by name). Concepts are de-duplicated by name here because
 * the store keeps one entry per (table, column) and draggable ids must be
 * unique.
 */

import { useDraggable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { quoteIdent } from "@/platform/duckdb/duckdb";
import { cn } from "@/shared/utils";
import { buildLineageSQL, sqlChainEligible } from "../../core/formulator/lineage";
import type { ConceptItem } from "../../core/formulator/model";
import type { ColType } from "../../core/types";
import {
  useFormConcepts,
  useFormFocusedTable,
  useFormTables,
  useFormulatorV2Store,
} from "../../store/formulator-store";
import { ColumnStatsPopover } from "./column-stats-popover";
import { FieldPill } from "./field-pill";

const GROUPS: ReadonlyArray<{ source: ConceptItem["source"]; title: string }> = [
  { source: "original", title: "Champs" },
  { source: "derived", title: "Dérivés" },
  { source: "custom", title: "À dériver" },
];

/** First occurrence wins — mirrors the store's `concepts.find(byName)` lookups. */
function uniqueByName(concepts: ConceptItem[]): ConceptItem[] {
  const seen = new Set<string>();
  const out: ConceptItem[] = [];
  for (const concept of concepts) {
    if (!seen.has(concept.name)) {
      seen.add(concept.name);
      out.push(concept);
    }
  }
  return out;
}

export function ConceptsPanel({ className }: Readonly<{ className?: string }>) {
  const concepts = useFormConcepts();
  const tables = useFormTables();
  const focused = useFormFocusedTable();
  const unique = useMemo(() => uniqueByName(concepts), [concepts]);

  // Base SELECT that yields the FOCUSED table's rows — computed once per focus so
  // every column-stats scan wraps the same relation. Null for python-lane
  // derived tables (their data lives in JS memory, not DuckDB) → no stats.
  const baseSql = useMemo<string | null>(() => {
    if (!focused) return null;
    try {
      if (focused.kind === "original" && focused.duckdbView) {
        return `SELECT * FROM ${quoteIdent(focused.duckdbView)}`;
      }
      if (sqlChainEligible(tables, focused.id)) {
        return buildLineageSQL(tables, focused.id);
      }
    } catch {
      return null;
    }
    return null;
  }, [tables, focused]);

  // Column → dtype for the focused table only: stats are shown solely for
  // concepts that are real columns of the relation `baseSql` queries.
  const focusedColTypes = useMemo(
    () => new Map((focused?.columns ?? []).map((c) => [c.name, c.type] as const)),
    [focused],
  );

  return (
    <section
      aria-label="Concepts"
      className={cn("flex flex-col gap-4 rounded-lg border border-border bg-card p-4", className)}
    >
      <h3 className="text-sm font-semibold text-foreground">Concepts</h3>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {GROUPS.map((group) => {
          const items = unique.filter((c) => c.source === group.source);
          if (items.length === 0 && group.source !== "original") return null;
          return (
            <div key={group.source}>
              <p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((concept) => (
                  <DraggableConcept
                    key={concept.id}
                    concept={concept}
                    baseSql={baseSql}
                    statsType={focusedColTypes.get(concept.name)}
                  />
                ))}
                {items.length === 0 && (
                  <p className="text-muted-foreground/70 text-xs">Aucun champ</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConceptCreator concepts={unique} />
    </section>
  );
}

/**
 * A concept pill wired as a dnd-kit draggable (id = concept name), with an
 * unobtrusive hover-reveal column-stats trigger for concepts that are real
 * columns of the focused table (an `i`-style profile button — Rill/MotherDuck
 * feel). The trigger sits OUTSIDE the draggable button so a click never starts
 * a drag.
 */
function DraggableConcept({
  concept,
  baseSql,
  statsType,
}: Readonly<{ concept: ConceptItem; baseSql: string | null; statsType?: ColType }>) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: concept.name,
    data: { concept },
  });

  const showStats = baseSql != null && statsType !== undefined;

  return (
    <div className="group inline-flex items-center gap-0.5">
      <button
        ref={setNodeRef}
        type="button"
        className={cn(
          "cursor-grab touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
          isDragging && "opacity-40",
        )}
        {...listeners}
        {...attributes}
      >
        <FieldPill name={concept.name} dtype={concept.dtype} source={concept.source} />
      </button>
      {showStats && baseSql ? (
        <ColumnStatsPopover
          concept={{ name: concept.name, type: statsType }}
          baseSql={baseSql}
          className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        />
      ) : null}
    </div>
  );
}

/**
 * Combobox-with-create: typing a name that matches no existing concept shows
 * « Créer "<name>" » — DF's way of asking for a field that doesn't exist yet.
 */
function ConceptCreator({ concepts }: Readonly<{ concepts: ConceptItem[] }>) {
  const addCustomConcept = useFormulatorV2Store((s) => s.addCustomConcept);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmed = search.trim();
  const exists = concepts.some((c) => c.name === trimmed);

  const create = () => {
    if (!trimmed || exists) return;
    addCustomConcept(trimmed);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start gap-2 text-muted-foreground">
          <Plus className="size-3.5" aria-hidden="true" />
          Nouveau champ…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Nom du champ…" />
          <CommandList>
            <CommandEmpty>Tapez un nom pour créer un champ.</CommandEmpty>
            <CommandGroup heading="Champs existants">
              {concepts.map((concept) => (
                <CommandItem key={concept.id} value={concept.name} onSelect={() => setOpen(false)}>
                  {concept.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {trimmed && !exists && (
              <CommandGroup>
                <CommandItem value={trimmed} onSelect={create} className="gap-2 text-ai">
                  <Plus className="size-3.5" aria-hidden="true" />
                  Créer «&nbsp;{trimmed}&nbsp;»
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
