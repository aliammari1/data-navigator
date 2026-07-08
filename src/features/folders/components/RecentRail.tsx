"use client";

import { Clock, ExternalLink } from "lucide-react";
import { fileTypeStyle } from "../lib/format";
import type { FSNode } from "../types";

/**
 * RecentRail — a compact list of the most recently added/updated datasets in
 * the right sidebar. A pure discovery aid: click a row to preview, or open it
 * straight in the Explorer.
 */

export interface RecentRailProps {
  nodes: FSNode[];
  onPreview: (node: FSNode) => void;
  onOpen: (node: FSNode) => void;
}

export function RecentRail({ nodes, onPreview, onOpen }: RecentRailProps) {
  if (nodes.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Récents
      </h3>
      <div className="space-y-1">
        {nodes.map((node) => {
          const style = fileTypeStyle(node.type);
          const Icon = style.icon;
          return (
            <div
              key={node.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <button
                type="button"
                onClick={() => onPreview(node)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Icon className={`h-4 w-4 shrink-0 ${style.color}`} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {node.name}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {(node.rowCount ?? 0).toLocaleString("fr-FR")} lignes
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onOpen(node)}
                aria-label={`Ouvrir ${node.name} dans l'Explorateur`}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
