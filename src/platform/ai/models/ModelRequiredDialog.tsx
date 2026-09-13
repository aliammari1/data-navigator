"use client";

import { useEffect } from "react";
import { ModelDownloadPanel } from "@/components/shared/model-download-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModelRequiredDialogStore } from "./model-required-dialog-store";
import { useModelStatus } from "./use-model-status";

export function ModelRequiredDialog() {
  const open = useModelRequiredDialogStore((state) => state.open);
  const reason = useModelRequiredDialogStore((state) => state.reason);
  const hide = useModelRequiredDialogStore((state) => state.hide);
  const { ready } = useModelStatus();

  useEffect(() => {
    // If opened due to background preflight check without a custom reason, auto-close when ready
    if (open && ready && (!reason || reason.includes("needs a downloaded"))) {
      hide();
    }
  }, [open, ready, hide, reason]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      <DialogContent className="sm:max-w-3xl w-full max-h-[88vh] p-0 flex flex-col gap-0 overflow-hidden border-border/80 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 bg-muted/10 shrink-0">
          <DialogTitle className="text-base font-bold text-foreground">
            {ready ? "Modèles d'intelligence artificielle locale" : "Modèle local requis"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {reason ||
              (ready
                ? "Gérez et sélectionnez vos modèles locaux pour Moudir. Vos données restent 100% confidentielles sur votre poste."
                : "Téléchargez un modèle d'IA pour activer l'analyse et la discussion locale hors-ligne.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-h-0">
          <ModelDownloadPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
