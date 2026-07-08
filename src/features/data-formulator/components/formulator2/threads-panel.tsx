"use client";

/**
 * ThreadsPanel — DF2's data-threads iteration UI (formulator2).
 *
 * The thread IS the table lineage: no separate history object exists. Roots
 * are the original datasets; every Formulate/refine run appends a child
 * `TableNode`, so rendering the parent→children tree from `useFormTables()`
 * reproduces DF's threads panel exactly. Branch points (>1 child) get the
 * --ai left rail; clicking a card focuses that node so the next Formuler
 * chains from it (jump-back). Réinitialiser drops every derived node behind
 * an AlertDialog confirm.
 */

import { AnimatePresence, motion } from "motion/react";
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
import { cn } from "@/shared/utils";
import { childrenOf, type TableNode } from "../../core/formulator/model";
import {
  useFormFocusedTable,
  useFormTables,
  useFormulatorV2Store,
} from "../../store/formulator-store";
import { ThreadCard } from "./thread-card";

function byCreation(a: TableNode, b: TableNode): number {
  return a.createdAt - b.createdAt;
}

interface ThreadBranchProps {
  tables: TableNode[];
  node: TableNode;
  focusedId: string | undefined;
}

/** One node + its (recursively rendered) children, ordered by creation time. */
function ThreadBranch({ tables, node, focusedId }: ThreadBranchProps) {
  const children = [...childrenOf(tables, node.id)].sort(byCreation);
  const isBranchPoint = children.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <ThreadCard node={node} childCount={children.length} isFocused={node.id === focusedId} />
      {children.length > 0 && (
        <div
          className={cn(
            "ml-2.5 flex flex-col gap-2 pl-2.5",
            isBranchPoint ? "border-l-2 border-ai/30" : "border-l border-border/70",
          )}
        >
          <AnimatePresence initial={false}>
            {children.map((child) => (
              <motion.div
                key={child.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <ThreadBranch tables={tables} node={child} focusedId={focusedId} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export function ThreadsPanel() {
  const tables = useFormTables();
  const focused = useFormFocusedTable();
  const resetAll = useFormulatorV2Store((s) => s.resetAll);

  const roots = tables.filter((t) => t.parentId === null).sort(byCreation);
  const hasDerived = tables.some((t) => t.kind === "derived");

  return (
    <section aria-label="Fil de données" className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-border border-b px-3 py-2">
        <h3 className="font-medium text-sm">Fil de données</h3>
        <Badge variant="secondary">{tables.length}</Badge>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              disabled={!hasDerived}
              className="ml-auto text-muted-foreground"
            >
              Réinitialiser
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Réinitialiser le fil ?</AlertDialogTitle>
              <AlertDialogDescription>
                Toutes les tables dérivées seront supprimées. Les tables sources et vos données
                d'origine sont conservées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => resetAll()}>
                Réinitialiser
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {roots.length === 0 ? (
          <p className="p-2 text-muted-foreground text-xs">
            Chargez un jeu de données pour démarrer le fil d'exploration.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {roots.map((root) => (
              <ThreadBranch key={root.id} tables={tables} node={root} focusedId={focused?.id} />
            ))}
            {!hasDerived && (
              <p className="rounded-lg border border-border border-dashed bg-muted/40 p-3 text-muted-foreground text-xs leading-relaxed">
                Chaque Formuler crée une nouvelle table dérivée ici — l'historique est votre fil
                d'exploration.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
