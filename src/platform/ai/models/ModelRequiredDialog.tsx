"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModelDownloadPanel } from "@/components/shared/model-download-panel";
import { useModelRequiredDialogStore } from "./model-required-dialog-store";
import { useModelStatus } from "./use-model-status";

export function ModelRequiredDialog() {
  const open = useModelRequiredDialogStore((state) => state.open);
  const reason = useModelRequiredDialogStore((state) => state.reason);
  const hide = useModelRequiredDialogStore((state) => state.hide);
  const { ready } = useModelStatus();

  useEffect(() => {
    if (open && ready) hide();
  }, [open, ready, hide]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Model required</DialogTitle>
          <DialogDescription>{reason}</DialogDescription>
        </DialogHeader>
        <ModelDownloadPanel />
      </DialogContent>
    </Dialog>
  );
}
