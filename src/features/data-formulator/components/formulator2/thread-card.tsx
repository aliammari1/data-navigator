"use client";

/**
 * ThreadCard — one node of the data-thread lineage (formulator2).
 *
 * Renders a single `TableNode` as a card: name, the NL instruction that
 * produced it, engine badge (SQL/Python on the --ai tint; originals get a
 * neutral « Source » badge), row count + relative age. Derived cards with
 * rows also show a tiny right-aligned sparkline glimpse of the first numeric
 * column (thread-glimpse.ts) — nothing renders when rows are absent, so
 * cards without data keep their exact layout. Clicking focuses the node;
 * derived cards expose hover actions — Réexécuter, an inline refine input
 * (DF2's follow-up-from-a-node) and Supprimer with a descendants warning
 * when the node has children.
 */

import { Database, MessageSquarePlus, RotateCw, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/utils";
import type { TableNode } from "../../core/formulator/model";
import { needsRerun, useFormulatorV2Store } from "../../store/formulator-store";
import { Sparkline } from "../moudir/canvas/sparkline";
import { threadGlimpse } from "./thread-glimpse";

/** Compact French relative age ("à l'instant", "il y a 5 min", "il y a 2 h", "il y a 3 j"). */
function relativeAge(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export interface ThreadCardProps {
  node: TableNode;
  /** Direct-children count — >0 switches Supprimer to a descendants warning. */
  childCount: number;
  isFocused: boolean;
}

export function ThreadCard({ node, childCount, isFocused }: ThreadCardProps) {
  const focusTable = useFormulatorV2Store((s) => s.focusTable);
  const refineNode = useFormulatorV2Store((s) => s.refineNode);
  const deleteNode = useFormulatorV2Store((s) => s.deleteNode);
  const isDeriving = useFormulatorV2Store((s) => s.status === "deriving");

  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState("");

  const isDerived = node.kind === "derived";
  const isStale = needsRerun(node);
  // Null when the node has no rows (sql preview absent / python needsRerun) —
  // the card then renders no glimpse at all, keeping its layout unchanged.
  const glimpse = threadGlimpse(node);

  function submitRefine() {
    const text = refineText.trim();
    if (!text || isDeriving) return;
    void refineNode(node.id, text);
    setRefineText("");
    setIsRefineOpen(false);
  }

  const deleteButton = (onClick?: (e: React.MouseEvent) => void) => (
    <Button
      variant="ghost"
      size="icon-xs"
      title="Supprimer"
      aria-label={`Supprimer ${node.name}`}
      className="text-muted-foreground hover:text-destructive"
      onClick={onClick}
    >
      <Trash2 />
    </Button>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => focusTable(node.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focusTable(node.id);
        }
      }}
      className={cn(
        "group/thread-card w-full cursor-pointer rounded-lg border border-border bg-card p-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
        isFocused && "bg-primary/5 ring-1 ring-primary hover:bg-primary/5",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium">{node.name}</span>
        {isStale && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-warning"
            title="Résultat non recalculé après rechargement — utilisez Réexécuter"
          />
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {glimpse && (
            <span
              className={cn(
                "flex items-center",
                node.engine === "python" ? "text-ai" : "text-muted-foreground",
              )}
              title={`Aperçu : ${glimpse.column}`}
            >
              <Sparkline
                values={glimpse.values}
                color="currentColor"
                width={64}
                height={20}
                strokeWidth={1.25}
              />
            </span>
          )}
          {isDerived ? (
            <Badge variant="outline" className="border-ai/30 bg-ai/10 font-mono text-ai">
              {node.engine === "python" ? "Python" : "SQL"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <Database />
              Source
            </Badge>
          )}
        </span>
      </div>

      {isDerived && node.instruction ? (
        <p className="mt-1 truncate text-xs text-muted-foreground italic" title={node.instruction}>
          « {node.instruction} »
        </p>
      ) : null}

      <div className="mt-1 flex h-6 items-center gap-1 text-[11px] text-muted-foreground">
        <span>
          {node.rowCount.toLocaleString("fr-FR")} {node.rowCount === 1 ? "ligne" : "lignes"}
        </span>
        <span aria-hidden>·</span>
        <span>{relativeAge(node.createdAt)}</span>

        {isDerived && (
          <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/thread-card:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Réexécuter"
              aria-label={`Réexécuter ${node.name}`}
              disabled={isDeriving || !node.instruction?.trim()}
              onClick={(e) => {
                e.stopPropagation();
                void refineNode(node.id, node.instruction ?? "");
              }}
            >
              <RotateCw />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Affiner avec une nouvelle consigne"
              aria-label={`Affiner ${node.name}`}
              aria-expanded={isRefineOpen}
              onClick={(e) => {
                e.stopPropagation();
                setIsRefineOpen((open) => !open);
              }}
            >
              <MessageSquarePlus />
            </Button>
            {childCount > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  {deleteButton((e) => e.stopPropagation())}
                </AlertDialogTrigger>
                <AlertDialogContent size="sm" onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer « {node.name} » ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette table a {childCount}{" "}
                      {childCount === 1 ? "table dérivée" : "tables dérivées"} : toutes ses
                      descendantes seront supprimées avec elle.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => deleteNode(node.id)}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              deleteButton((e) => {
                e.stopPropagation();
                deleteNode(node.id);
              })
            )}
          </span>
        )}
      </div>

      {isDerived && isRefineOpen ? (
        <Input
          autoFocus
          value={refineText}
          disabled={isDeriving}
          placeholder="Affiner : nouvelle consigne…"
          aria-label={`Nouvelle consigne pour ${node.name}`}
          className="mt-1.5 h-7 text-xs"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setRefineText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") submitRefine();
            if (e.key === "Escape") setIsRefineOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
