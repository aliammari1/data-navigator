"use client";
import { useCallback, useRef, useState } from "react";
import {
  loadDelimitedCSVFromFile,
  loadJSONFileToDuckDB,
} from "@/platform/duckdb/duckdb";
import { cn } from "@/shared/utils";

interface Props {
  onLoaded: (tableName: string, fileName: string) => void;
}

type UploadState = "idle" | "loading" | "done" | "error";

function sanitizeTableName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^_+/, "")
      .slice(0, 60) || "dataset"
  );
}

export function UploadZone({ onLoaded }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const process = useCallback(
    async (file: File) => {
      setState("loading");
      setError("");
      const base = file.name.replace(/\.[^.]+$/, "");
      const tableName = sanitizeTableName(base);

      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

        if (ext === "json" || ext === "ndjson" || ext === "jsonl") {
          setProgress("Loading JSON…");
          await loadJSONFileToDuckDB(tableName, file);
        } else {
          // CSV / TSV / TXT
          let delimiter = ",";
          if (ext === "tsv" || ext === "txt") {
            delimiter = "\t";
          } else {
            // Sniff delimiter from first line
            const firstLine = await file.slice(0, 500).text();
            const tabs = (firstLine.match(/\t/g) ?? []).length;
            const semis = (firstLine.match(/;/g) ?? []).length;
            const commas = (firstLine.match(/,/g) ?? []).length;
            if (tabs > commas && tabs > semis) delimiter = "\t";
            else if (semis > commas && semis > tabs) delimiter = ";";
          }

          setProgress(
            `Loading ${ext.toUpperCase()} (delimiter="${delimiter}")…`,
          );
          await loadDelimitedCSVFromFile(tableName, file, delimiter);
        }

        setProgress(`Loaded as table "${tableName}"`);
        setState("done");
        onLoaded(tableName, file.name);
      } catch (err) {
        setError(String(err));
        setState("error");
      }
    },
    [onLoaded],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) process(file);
    },
    [process],
  );

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) process(file);
    },
    [process],
  );

  const isDone = state === "done";
  const isLoading = state === "loading";

  return (
    <button
      type="button"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !isLoading && inputRef.current?.click()}
      className={cn(
        "w-full text-left relative group flex flex-col items-center justify-center gap-3",
        "rounded-2xl border-2 border-dashed cursor-pointer transition-all min-h-50 px-6 py-10",
        isDone
          ? "border-emerald-500 bg-emerald-500/5"
          : isLoading
            ? "border-violet-500 bg-violet-500/5 cursor-wait"
            : "border-slate-700 bg-slate-800/30 hover:border-violet-500 hover:bg-violet-500/5",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,.json,.ndjson,.jsonl"
        className="hidden"
        onChange={onFile}
      />

      {isLoading ? (
        <>
          <div className="w-10 h-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-sm text-violet-300">{progress}</p>
        </>
      ) : isDone ? (
        <>
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl">
            ✓
          </div>
          <p className="text-sm text-emerald-300">{progress}</p>
          <p className="text-xs text-slate-500">
            Click to load a different file
          </p>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-2xl bg-slate-700/50 flex items-center justify-center text-slate-400 text-2xl group-hover:text-violet-400 transition-colors">
            ↑
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-200">
              Drop your data file here
            </p>
            <p className="text-xs text-slate-500 mt-1">
              CSV, TSV, JSON, NDJSON, JSONL · up to 500 MB
            </p>
          </div>
          {state === "error" && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 mt-2">
              {error}
            </p>
          )}
        </>
      )}
    </button>
  );
}
