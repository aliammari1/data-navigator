"use client";

import { Database, Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { cn } from "@/shared/utils";
import { type ActiveFilter, useMoudirChatStore } from "../../store/moudir-chat-store";

interface ChatFilterBreadcrumbsProps {
  className?: string;
  showDataset?: boolean;
}

export function ChatFilterBreadcrumbs({
  className,
  showDataset = true,
}: ChatFilterBreadcrumbsProps) {
  const activeFilters = useMoudirChatStore((s) => s.activeFilters);
  const removeFilter = useMoudirChatStore((s) => s.removeFilter);
  const clearFilters = useMoudirChatStore((s) => s.clearFilters);

  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const datasets = useDataStore((s) => s.datasets);
  const activeDataset = datasets.find((d) => d.id === activeDatasetId);
  const datasetLabel = activeDataset?.name || activeDataset?.tableName || "Jeu de données";

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Filtres actifs appliqués aux données"
      className={cn(
        "flex flex-wrap items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/40 border-b border-border/60 transition-all",
        className,
      )}
    >
      <div className="flex items-center gap-1 text-muted-foreground font-medium mr-1 text-[11px]">
        <Filter className="size-3 text-primary" />
        <span>Filtres :</span>
      </div>

      {showDataset && (
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] font-mono gap-1 bg-background text-muted-foreground border-border/80"
          >
            <Database className="size-2.5 text-primary/70" />
            <span className="truncate max-w-[120px]">{datasetLabel}</span>
          </Badge>
          <span className="text-muted-foreground/60 text-[10px]">&gt;</span>
        </div>
      )}

      {activeFilters.map((f: ActiveFilter) => (
        <Badge
          key={f.field}
          variant="secondary"
          className="h-5 px-1.5 text-[11px] font-mono gap-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 transition-colors"
        >
          <span className="font-semibold text-[10px] text-foreground/80">{f.field}:</span>
          <span className="max-w-[140px] truncate">{String(f.value)}</span>
          <button
            type="button"
            onClick={() => removeFilter(f.field)}
            aria-label={`Supprimer le filtre ${f.field}`}
            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 text-primary hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}

      {activeFilters.length > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={clearFilters}
          className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-destructive transition-colors ml-auto"
        >
          Tout effacer
        </Button>
      )}
    </div>
  );
}
