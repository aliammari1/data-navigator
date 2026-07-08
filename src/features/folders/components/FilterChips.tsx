"use client";

import type { CatalogFilter } from "../lib/catalog-filters";

/**
 * Smart triage chips for the catalogue. Selecting a chip (other than "Tous")
 * surfaces matching datasets across the whole catalogue — a fast discovery aid
 * that complements folders/search without duplicating the Explorer or Profil.
 */

const CHIPS: { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "csv", label: "CSV" },
  { id: "parquet", label: "Parquet" },
  { id: "unclassified", label: "Non classés" },
  { id: "low-quality", label: "Qualité faible" },
  { id: "recent", label: "Récents" },
];

export interface FilterChipsProps {
  active: CatalogFilter;
  counts: Partial<Record<CatalogFilter, number>>;
  onChange: (filter: CatalogFilter) => void;
}

export function FilterChips({ active, counts, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtres rapides">
      {CHIPS.map((chip) => {
        const isActive = active === chip.id;
        const count = chip.id === "all" ? undefined : counts[chip.id];
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(chip.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              isActive
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {chip.label}
            {count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
