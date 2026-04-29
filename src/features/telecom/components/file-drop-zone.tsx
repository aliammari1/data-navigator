"use client";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";

export function FileDropZone({
  onLoad,
}: {
  onLoad: (file: File) => Promise<void>;
}) {
  const [pending, setPending] = useState<File[]>([]);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (running || pending.length === 0) return;
    setRunning(true);
    for (const file of pending) {
      await onLoad(file);
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
            return [
              ...prev,
              ...files.filter((f) => !existing.has(f.name + f.size)),
            ];
          })
        }
        onRemove={(file) =>
          setPending((prev) =>
            prev.filter((f) => !(f.name === file.name && f.size === file.size)),
          )
        }
      />
      {pending.length > 0 && (
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white transition-colors shadow-sm"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Traitement en cours…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Lancer l&apos;analyse
              {pending.length > 1 ? ` (${pending.length} fichiers)` : ""}
            </>
          )}
        </button>
      )}
    </div>
  );
}
