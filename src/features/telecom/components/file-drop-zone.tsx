"use client";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import type { TelecomIngestionMode } from "../types";

export function FileDropZone({
  onLoad,
  defaultMode = "replace",
  canAppend = false,
}: {
  onLoad: (file: File, mode?: TelecomIngestionMode) => Promise<void>;
  defaultMode?: TelecomIngestionMode;
  canAppend?: boolean;
}) {
  const [pending, setPending] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<TelecomIngestionMode>(defaultMode);

  const handleRun = async () => {
    if (running || pending.length === 0) return;
    setRunning(true);
    for (const file of pending) {
      await onLoad(file, mode);
    }
    setPending([]);
    setRunning(false);
  };

  return (
    <div className="space-y-3">
      <FileUpload
        onChange={(files) =>
          setPending((prev) => {
            const existing = new Set(prev.map((f) => f.name + f.size));
            return [...prev, ...files.filter((f) => !existing.has(f.name + f.size))];
          })
        }
        onRemove={(file) =>
          setPending((prev) => prev.filter((f) => !(f.name === file.name && f.size === file.size)))
        }
      />
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-1">
            {(["replace", "append"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={value === "append" && !canAppend}
                onClick={() => setMode(value)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                }`}
              >
                {value === "replace" ? "Remplacer la période" : "Ajouter à la période"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors shadow-sm"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Traitement en cours…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {mode === "append" ? "Ajouter et recalculer" : "Charger et analyser"}
                {pending.length > 1 ? ` (${pending.length} fichiers)` : ""}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
