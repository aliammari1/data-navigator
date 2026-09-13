"use client";

/**
 * ModelDownloadPanel — Panneau de gestion et de sélection des modèles d'IA locale.
 *
 * Principes UX :
 *  1. Navigation par onglets (Installés vs Catalogue) pour aérer l'interface et éviter le défilement inutile.
 *  2. Cartes de sélection interactives au clic (radio style) avec mise en valeur immédiate du modèle actif.
 *  3. Formatage lisible des tailles (ex: "529 Mo", "1.1 Go") sans chiffres à virgule bruts.
 *  4. Détails système discrets (node-llama-cpp et embeddings) sans encombrer la vue principale.
 *  5. Aucune barre de défilement horizontale, largeurs maîtrisées et badges lisibles.
 */

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CloudDownload,
  Cpu,
  Download,
  Layers,
  Loader2,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useModelStatus } from "@/platform/ai/models";
import { useModelRequiredDialogStore } from "@/platform/ai/models/model-required-dialog-store";
import { useAIRuntimeStore } from "@/platform/ai/provider";
import { isElectron } from "@/platform/electron/electron-fs";
import { cn } from "@/shared/utils";

function humanBytes(n: number): string {
  if (!n) return "";
  const units = ["o", "Ko", "Mo", "Go"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatMb(mb: number): string {
  if (!mb || Number.isNaN(mb)) return "";
  if (mb >= 1000) {
    const val = mb / 1000;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)} Go`;
  }
  return `${Math.round(mb)} Mo`;
}

export function ModelDownloadPanel() {
  const { records, loading, downloads, download, cancel, ready } = useModelStatus();
  const electron = isElectron();
  const activeModel = useAIRuntimeStore((s) => s.model);
  const setModel = useAIRuntimeStore((s) => s.setModel);
  const hideDialog = useModelRequiredDialogStore((s) => s.hide);

  const installedChatModels = useMemo(
    () => records.filter((r) => r.lane === "llm" && r.state === "present"),
    [records],
  );

  const downloadableChatModels = useMemo(
    () => records.filter((r) => r.lane === "llm" && r.state !== "present"),
    [records],
  );

  const embedModels = useMemo(() => records.filter((r) => r.lane === "embed"), [records]);

  const [tab, setTab] = useState<"installed" | "catalog">(
    installedChatModels.length > 0 ? "installed" : "catalog",
  );

  // Sync default tab when installed models load if currently on installed with 0 models
  useMemo(() => {
    if (
      installedChatModels.length === 0 &&
      downloadableChatModels.length > 0 &&
      tab === "installed"
    ) {
      setTab("catalog");
    }
  }, [installedChatModels.length, downloadableChatModels.length, tab]);

  const activeModelRecord = useMemo(() => {
    return records.find((r) => r.lane === "llm" && `${r.key}.gguf` === activeModel);
  }, [records, activeModel]);

  const pickModel = (ggufFile: string | undefined, label: string) => {
    if (!ggufFile) return;
    setModel(ggufFile);
    toast.success(`Modèle actif : ${label}`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ─── Navigation par onglets ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-border/60">
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl">
          <button
            type="button"
            onClick={() => setTab("installed")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
              tab === "installed"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Modèles installés</span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium",
                tab === "installed"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {installedChatModels.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("catalog")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
              tab === "catalog"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CloudDownload className="h-3.5 w-3.5" />
            <span>Catalogue de modèles</span>
            {downloadableChatModels.length > 0 && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium",
                  tab === "catalog"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {downloadableChatModels.length}
              </span>
            )}
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span>Exécution 100% locale & privée</span>
        </div>
      </div>

      {/* ─── Contenu dynamique ────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Analyse des modèles installés…
        </div>
      ) : tab === "installed" ? (
        /* ── Onglet 1 : Modèles installés ───────────────────────────────── */
        <div className="space-y-3">
          {installedChatModels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm font-semibold text-foreground">Aucun modèle installé</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Téléchargez un modèle depuis le catalogue pour activer l'analyse et la discussion
                dans Moudir.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-4 text-xs"
                onClick={() => setTab("catalog")}
              >
                <CloudDownload className="mr-1.5 h-3.5 w-3.5" /> Voir le catalogue
              </Button>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {installedChatModels.map((record) => {
                const ggufFile = `${record.key}.gguf`;
                const isActive = ggufFile === activeModel;

                return (
                  <div
                    key={record.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => pickModel(ggufFile, record.label)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pickModel(ggufFile, record.label);
                      }
                    }}
                    className={cn(
                      "group relative flex items-center justify-between gap-4 rounded-xl border p-4 transition-all cursor-pointer",
                      isActive
                        ? "border-primary/80 bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                        : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {/* Indicateur radio de sélection */}
                      <div
                        className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "border-2 border-muted-foreground/30 group-hover:border-primary/60",
                        )}
                      >
                        {isActive && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-foreground">
                            {record.label}
                          </span>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                            {record.sizeLabel}
                          </Badge>
                          {record.capabilities.vision && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 px-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                            >
                              Vision
                            </Badge>
                          )}
                          {record.capabilities.tools && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            >
                              Outils
                            </Badge>
                          )}
                          {record.capabilities.thinking && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 px-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                            >
                              Raisonnement
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Installé sur le disque (
                          {record.sizeBytes ? humanBytes(record.sizeBytes) : "Local"})
                          {record.capabilityNote ? ` · ${record.capabilityNote}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {isActive ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium py-1 px-2.5 text-xs gap-1.5">
                          <Check className="h-3.5 w-3.5" /> Modèle actif
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 px-3 opacity-80 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            pickModel(ggufFile, record.label);
                          }}
                        >
                          Choisir
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Onglet 2 : Catalogue de téléchargement ──────────────────────── */
        <div className="space-y-3">
          {downloadableChatModels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-xs text-muted-foreground">
              Tous les modèles du catalogue sont déjà installés sur votre poste.
            </div>
          ) : (
            <div className="grid gap-2.5">
              {downloadableChatModels.map((record) => {
                const dl = downloads[record.key];
                const inProgress = dl?.active ?? false;
                const pct = dl ? dl.percent : 0;
                const sizeStr = formatMb(record.downloadMb);

                return (
                  <div
                    key={record.key}
                    className="rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-border/90"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-foreground">
                            {record.label}
                          </span>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                            {record.sizeLabel}
                          </Badge>
                          <span className="text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                            {sizeStr}
                          </span>
                          {record.capabilities.vision && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 px-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                            >
                              Vision
                            </Badge>
                          )}
                          {record.capabilities.tools && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            >
                              Outils
                            </Badge>
                          )}
                          {record.capabilities.thinking && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 px-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                            >
                              Raisonnement
                            </Badge>
                          )}
                        </div>
                        {record.capabilityNote ? (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {record.capabilityNote}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Modèle optimisé pour l'exécution locale hors-ligne sans clé API.
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center">
                        {record.downloadable ? (
                          inProgress ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => cancel(record.key)}
                              className="text-xs h-8 text-destructive hover:bg-destructive/10"
                            >
                              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Annuler
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => download(record.key)}
                              className="text-xs h-8 px-3.5 shadow-xs"
                            >
                              <Download className="mr-1.5 h-3.5 w-3.5" /> Télécharger ({sizeStr})
                            </Button>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {electron ? "Pré-packagé" : "Mode bureau requis"}
                          </span>
                        )}
                      </div>
                    </div>

                    {inProgress && (
                      <div className="mt-3.5 pt-3 border-t border-border/40">
                        <div className="mb-1.5 flex justify-between text-[11px]">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            Téléchargement en cours…
                          </span>
                          <span className="font-mono font-semibold text-foreground">
                            {pct >= 0 ? `${pct}%` : humanBytes(dl?.receivedBytes ?? 0)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full rounded-full bg-primary"
                            animate={{ width: pct >= 0 ? `${pct}%` : "100%" }}
                            transition={{ duration: 0.2 }}
                          />
                        </div>
                      </div>
                    )}

                    {dl?.error && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 flex-none" />
                        {dl.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Informations système discrètes ──────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Cpu className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>Moteur on-device node-llama-cpp (accélération matérielle active)</span>
        </div>

        {embedModels.length > 0 && (
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground">Recherche sémantique :</span>
            {embedModels[0]?.state === "present" ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] py-0 px-1.5"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" /> Opérationnelle
              </Badge>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => download(embedModels[0]?.key)}
                className="text-[11px] h-6 px-2"
              >
                Télécharger (25 Mo)
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ─── Pied de page d'action (User Journey) ────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground min-w-0 flex-1 truncate">
          {activeModelRecord ? (
            <span>
              Modèle actif : <strong className="text-foreground">{activeModelRecord.label}</strong>
            </span>
          ) : (
            <span>Sélectionnez un modèle pour commencer</span>
          )}
        </div>

        <Button
          type="button"
          onClick={hideDialog}
          className="text-xs font-semibold px-5 h-8.5 shrink-0"
        >
          {ready ? "Continuer" : "Fermer"}
        </Button>
      </div>
    </div>
  );
}
