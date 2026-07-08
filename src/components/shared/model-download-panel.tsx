"use client";

/**
 * ModelDownloadPanel — "Download AI models (while online)" Setup affordance.
 *
 * Surfaces the offline-model preflight (src/platform/ai/models): for each
 * required model (both the instruct GGUF and the embedding GGUF ride the same
 * Electron node-llama-cpp lane) it shows present/size and a Download button
 * wired through `window.electronModels.*` (IPC → electron/model-download-service.ts)
 * with live progress.
 */

import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  Cpu,
  Download,
  Loader2,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useModelStatus } from "@/platform/ai/models";
import { isElectron } from "@/platform/electron/electron-fs";
import { cn } from "@/shared/utils";

function humanBytes(n: number): string {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function ModelDownloadPanel() {
  const { records, loading, downloads, download, cancel, ready } = useModelStatus();
  const electron = isElectron();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CloudDownload className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Download AI models (while online)</h3>
        {!loading &&
          (ready ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Ready offline
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" /> Models missing
            </span>
          ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Fetch model weights once while you have a connection — afterwards everything runs fully
        offline. Weights are stored locally in your app data folder; nothing leaves your machine at
        inference time.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking installed models…
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => {
            const dl = downloads[record.key];
            const present = record.state === "present";
            const inProgress = dl?.active ?? false;
            const pct = dl ? dl.percent : 0;

            return (
              <div
                key={record.key}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  present ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs font-semibold text-foreground">
                        {record.label}
                      </span>
                      <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                        {record.sizeLabel}
                      </span>
                      {record.optional && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
                          optional
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {present ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Installed{record.sizeBytes ? ` · ${humanBytes(record.sizeBytes)}` : ""}
                        </span>
                      ) : (
                        <span>~{record.downloadMb} MB download</span>
                      )}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {present ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : record.downloadable ? (
                      inProgress ? (
                        <button
                          type="button"
                          onClick={() => cancel(record.key)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          <XCircle className="h-3 w-3" /> Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => download(record.key)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          <Download className="h-3 w-3" /> Download
                        </button>
                      )
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {electron ? "auto" : "browser"}
                      </span>
                    )}
                  </div>
                </div>

                {inProgress && (
                  <div className="mt-2">
                    <div className="mb-1 flex justify-between text-[9px] text-muted-foreground">
                      <span>Downloading…</span>
                      <span>{pct >= 0 ? `${pct}%` : humanBytes(dl?.receivedBytes ?? 0)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        animate={{ width: pct >= 0 ? `${pct}%` : "100%" }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  </div>
                )}

                {dl?.error && (
                  <p className="mt-2 flex items-start gap-1 text-[10px] text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" />
                    {dl.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!electron && !loading && (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[10px] text-primary">
          Offline AI (generation and embeddings) requires the desktop app — the web build cannot
          download or run these models.
        </p>
      )}
    </div>
  );
}
