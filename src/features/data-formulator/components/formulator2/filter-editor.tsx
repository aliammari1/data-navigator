"use client";

/**
 * FilterEditor — the compact add/edit form for a single FilterDef, rendered
 * inside the FilterBar's popover. A field Select (focused-table columns), an op
 * Select (every FilterOp with a French label), and a value Input that hides for
 * the null operators and shows a comma-list hint for IN/BETWEEN.
 *
 * Presentational: it owns only the draft state and calls `onSubmit` with an
 * id-less FilterDef; the FilterBar decides addFilter vs updateFilter.
 */

import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterDef, FilterOp } from "../../core/types";
import { useFormFocusedTable } from "../../store/formulator-store";

/** French labels for every operator, shown in the op Select. */
const OP_LABELS: Record<FilterOp, string> = {
  "=": "égal à",
  "!=": "différent de",
  ">": "supérieur à",
  "<": "inférieur à",
  ">=": "supérieur ou égal à",
  "<=": "inférieur ou égal à",
  LIKE: "contient",
  IN: "dans",
  BETWEEN: "entre",
  "NOT NULL": "non nul",
  "IS NULL": "nul",
};

/** Display order for the op Select (comparisons first, then text/set, then null). */
const OP_ORDER: FilterOp[] = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "LIKE",
  "IN",
  "BETWEEN",
  "NOT NULL",
  "IS NULL",
];

/** Operators that carry no value — the value Input is hidden. */
function isValuelessOp(op: FilterOp): boolean {
  return op === "IS NULL" || op === "NOT NULL";
}

/** Operators that accept a comma-separated list — show the hint. */
function isListOp(op: FilterOp): boolean {
  return op === "IN" || op === "BETWEEN";
}

export interface FilterEditorProps {
  /** Existing filter when editing; omitted when adding a fresh one. */
  filter?: FilterDef;
  onSubmit: (draft: Omit<FilterDef, "id">) => void;
  onCancel: () => void;
}

export function FilterEditor({ filter, onSubmit, onCancel }: Readonly<FilterEditorProps>) {
  const focused = useFormFocusedTable();
  const columns = focused?.columns ?? [];

  const [field, setField] = useState(filter?.field ?? columns[0]?.name ?? "");
  const [op, setOp] = useState<FilterOp>(filter?.op ?? "=");
  const [value, setValue] = useState(filter?.value ?? "");

  const ids = useId();
  const valueless = isValuelessOp(op);
  const canSubmit = field.length > 0 && (valueless || value.trim().length > 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({ field, op, value: valueless ? "" : value.trim() });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-field`} className="font-medium text-muted-foreground text-xs">
          Champ
        </label>
        <Select value={field} onValueChange={setField}>
          <SelectTrigger id={`${ids}-field`} size="sm" className="w-full">
            <SelectValue placeholder="Choisir un champ" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.name} value={column.name} className="font-mono text-xs">
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-op`} className="font-medium text-muted-foreground text-xs">
          Opérateur
        </label>
        <Select value={op} onValueChange={(next) => setOp(next as FilterOp)}>
          <SelectTrigger id={`${ids}-op`} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OP_ORDER.map((option) => (
              <SelectItem key={option} value={option}>
                {OP_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!valueless && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-value`} className="font-medium text-muted-foreground text-xs">
            Valeur
          </label>
          <Input
            id={`${ids}-value`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={isListOp(op) ? "nord, sud, centre" : "valeur"}
            className="h-8 text-sm"
          />
          {isListOp(op) && (
            <p className="text-muted-foreground text-xs">valeurs séparées par des virgules</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {filter ? "Modifier" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}
