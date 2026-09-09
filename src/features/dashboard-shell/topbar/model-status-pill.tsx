"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cpu,
  Download,
  Loader2,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useClickOutside } from "@/features/dashboard-shell/shell/use-click-outside";
import { useModelStatus } from "@/features/dashboard-shell/shell/use-model-status";
import { cn } from "@/shared/utils";

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} Go`;
  return `${Math.round(mb)} Mo`;
}

/**
 * Interactive local-model status pill & switcher.
 *
 * Surfaces whether offline AI models are downloaded and ready on disk.
 * When clicked, opens a popover showing:
 *   - Current active model and live air-gap status
 *   - Quick switcher between all downloaded GGUF models on disk
 *   - In-app download buttons with live progress for missing models
 *   - Fallback explanation when running in deterministic rule-based mode
 */
export function ModelStatusPill() {
  const status = useModelStatus();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const config = {
    ready: {
      Icon: Sparkles,
      tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/15",
      title: "Modèle local prêt — Cliquez pour changer de modèle ou gérer les téléchargements",
    },
    downloading: {
      Icon: Loader2,
      tone: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300 hover:bg-blue-500/15",
      title: "Modèle IA en cours de téléchargement — Cliquez pour voir la progression",
    },
    error: {
      Icon: TriangleAlert,
      tone: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/15",
      title: "Erreur modèle IA — repli en mode règles déterministes",
    },
    "not-ready": {
      Icon: Cpu,
      tone: "border-border bg-accent text-muted-foreground hover:bg-accent/80 hover:text-foreground",
      title: "Aucun modèle local détecté (Mode règles) — Cliquez pour installer un modèle IA",
    },
  }[status.kind];

  const { Icon } = config;

  const downloadableRecords = status.records.filter(
    (r) => r.lane === "llm" && r.state !== "present",
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="État du modèle IA et sélecteur"
        aria-expanded={open}
        title={config.title}
        className={cn(
          "hidden lg:inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-all shadow-xs cursor-pointer select-none",
          config.tone,
          open && "ring-2 ring-primary/40 border-primary/40",
        )}
      >
        {status.kind === "ready" && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
        <Icon
          className={cn("h-3.5 w-3.5 flex-none", status.kind === "downloading" && "animate-spin")}
        />
        <span className="font-medium tracking-tight truncate max-w-[130px]">{status.label}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 opacity-60 transition-transform duration-200 flex-none",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-96 max-w-[95vw] rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl z-50 overflow-hidden text-left"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Moteur IA Hors-Ligne
                    <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-2.5 w-2.5" /> Air-gapped
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    node-llama-cpp · 100% local sur votre machine
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Fermer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-3 space-y-3">
              {/* Section 1: Installed Chat Models (Active Switcher) */}
              <div>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Modèle Actif
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {status.chatModels.length} installé(s)
                  </span>
                </div>

                {status.chatModels.length > 0 ? (
                  <div className="space-y-1.5">
                    {status.chatModels.map((record) => {
                      const ggufFile = `${record.key}.gguf`;
                      const isActive =
                        status.activeRecord?.key === record.key ||
                        status.model === ggufFile ||
                        status.model === record.key;

                      return (
                        <button
                          key={record.key}
                          type="button"
                          onClick={() => {
                            status.selectModel(record.key);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer",
                            isActive
                              ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                              : "border-border/70 bg-card hover:bg-accent/60 hover:border-border",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground truncate">
                                {record.family}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                                {record.sizeLabel}
                              </span>
                              {record.sizeBytes && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {formatBytes(record.sizeBytes)}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              {record.capabilities.tools && (
                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] bg-accent border border-border text-foreground/80">
                                  <Wrench className="h-2.5 w-2.5 text-blue-400" /> Outils SQL
                                </span>
                              )}
                              {record.capabilities.thinking && (
                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] bg-accent border border-border text-foreground/80">
                                  <Cpu className="h-2.5 w-2.5 text-violet-400" /> Raisonnement
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex-none">
                            {isActive ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                                <Check className="h-3 w-3" />
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground hover:text-foreground font-medium">
                                Sélectionner
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-4 w-4" /> Aucun modèle local installé
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      L'application fonctionne actuellement avec le moteur heuristique par règles.
                      Téléchargez un modèle ci-dessous pour activer le traitement en langage
                      naturel.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 2: Downloadable Models */}
              {downloadableRecords.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1 mb-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Modèles Disponibles
                    </span>
                    <span className="text-[10px] text-muted-foreground">Téléchargement unique</span>
                  </div>

                  <div className="space-y-1.5">
                    {downloadableRecords.map((record) => {
                      const dl = status.downloads[record.key];
                      const isDownloading = dl?.active ?? false;
                      const pct = dl ? dl.percent : 0;

                      return (
                        <div
                          key={record.key}
                          className="rounded-xl border border-border/70 bg-card/60 p-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground truncate">
                                {record.label}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>~{Math.round(record.downloadMb)} Mo</span>
                              {record.sizeLabel && <span>· {record.sizeLabel}</span>}
                            </div>

                            {isDownloading && (
                              <div className="mt-2 space-y-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>Téléchargement…</span>
                                  <span className="font-mono">{pct}%</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex-none">
                            {isDownloading ? (
                              <button
                                type="button"
                                onClick={() => status.cancel(record.key)}
                                className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
                              >
                                Annuler
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => status.download(record.key)}
                                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
                              >
                                <Download className="h-3 w-3" />
                                Installer
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 bg-muted/20 text-xs">
              <button
                type="button"
                onClick={() => status.refresh()}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title="Vérifier le disque"
              >
                <RefreshCw className={cn("h-3 w-3", status.loading && "animate-spin")} />
                Actualiser
              </button>

              <Link
                href="/dashboard/settings?tab=ai"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Settings className="h-3 w-3" />
                Paramètres IA avancés
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
