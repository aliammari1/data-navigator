"use client";

import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParsedFileInfo } from "@/features/data-import/model/types";

/**
 * Shown right after an import completes when DuckDB's lenient CSV reader
 * (`store_rejects = true`) coerced or skipped rows — e.g. a ragged line, a
 * stray delimiter, an unparseable amount. Those rows never make it into the
 * dataset, so the total row count silently comes up short unless this is
 * surfaced before the screen navigates away.
 */
export function RejectRowsDialog({
  files,
  onContinue,
}: {
  files: ParsedFileInfo[];
  onContinue: () => void;
}) {
  const open = files.length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onContinue()}>
      <DialogContent className="max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-500">
            <ShieldAlert className="h-4 w-4" />
            Des lignes ont été ignorées à l'import
          </DialogTitle>
          <DialogDescription>
            DuckDB a rejeté ces lignes pendant la lecture (colonne manquante, valeur non
            convertible, délimiteur en trop…). Elles ne sont pas comptées dans le total du fichier.
            Corrigez-les dans le fichier source puis réimportez si elles doivent être incluses.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 space-y-4 overflow-y-auto">
          {files.map((file) => (
            <div key={file.id} className="space-y-2">
              <div className="text-xs font-semibold text-foreground">
                {file.name} — {file.rejectCount?.toLocaleString()} ligne
                {(file.rejectCount ?? 0) > 1 ? "s" : ""} ignorée
                {(file.rejectCount ?? 0) > 1 ? "s" : ""}
              </div>

              <div className="overflow-hidden rounded-xl border border-rose-500/20 bg-rose-500/5">
                <div className="flex border-b border-rose-500/20 bg-rose-500/10 text-[10px] font-medium text-rose-600 dark:text-rose-300">
                  <div className="w-16 flex-none px-3 py-1.5">Ligne</div>
                  <div className="w-32 flex-none px-3 py-1.5">Colonne</div>
                  <div className="flex-1 px-3 py-1.5">Erreur</div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {(file.rejectSample ?? []).map((reject, index) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: reject rows have no stable id
                      key={index}
                      className="flex border-b border-rose-500/10 text-[11px] text-muted-foreground last:border-b-0"
                    >
                      <div className="w-16 flex-none px-3 py-1.5 font-mono text-rose-500/80">
                        {reject.line ?? "—"}
                      </div>
                      <div className="w-32 flex-none truncate px-3 py-1.5 font-mono">
                        {reject.columnName ?? "—"}
                      </div>
                      <div
                        className="flex-1 truncate px-3 py-1.5"
                        title={reject.errorMessage ?? ""}
                      >
                        {reject.errorMessage ?? reject.errorType ?? "valeur invalide"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {(file.rejectCount ?? 0) > (file.rejectSample?.length ?? 0) && (
                <div className="text-[10px] text-muted-foreground">
                  Affichage des {file.rejectSample?.length ?? 0} premières lignes sur{" "}
                  {file.rejectCount?.toLocaleString()}.
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" onClick={onContinue} className="rounded-xl text-xs font-bold">
            Continuer quand même
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
