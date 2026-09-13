"use client";

import {
  Activity,
  AlertCircle,
  BarChart3,
  Box,
  Calendar,
  Check,
  ChevronRight,
  Columns3,
  Copy,
  Database,
  FileText,
  FolderClosed,
  Gauge,
  Layers,
  Lightbulb,
  Loader2,
  Sparkles,
  Table,
  TrendingUp,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDataStore } from "@/core/stores/data-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import { type DesktopSelectionKind, useSelection } from "@/features/desktop/core/context-bus";
import { askMoudir } from "@/features/desktop/core/moudir-bridge";
import { useDesktopActions } from "@/features/desktop/store/desktop-store";
import { extractTemporalInfo } from "@/features/folders/lib/date-organizer";
import { useAI } from "@/platform/ai/provider/use-ai";
import { formatBytes } from "@/shared/format";

const KIND_LABEL: Record<Exclude<DesktopSelectionKind, null>, string> = {
  dataset: "Jeu de données",
  folder: "Dossier",
  chart: "Graphique",
  kpi: "Indicateur",
  column: "Colonne",
  window: "Fenêtre",
};

function KindIcon({ kind }: { kind: DesktopSelectionKind }) {
  const className = "size-4 text-[hsl(var(--glass-accent))]";
  switch (kind) {
    case "dataset":
      return <Database className={className} />;
    case "folder":
      return <FolderClosed className={className} />;
    case "chart":
      return <BarChart3 className={className} />;
    case "kpi":
      return <Gauge className={className} />;
    case "column":
      return <Columns3 className={className} />;
    case "window":
      return <Layers className={className} />;
    default:
      return <Sparkles className={className} />;
  }
}

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") return value.toLocaleString("fr-FR");
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `${value.length} élément(s)`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getQualityStatus(score: number): { label: string; color: string; bg: string } {
  if (score >= 90) return { label: "Excellent", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" };
  if (score >= 70) return { label: "Bon", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" };
  if (score >= 50) return { label: "Moyen", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" };
  return { label: "À vérifier", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" };
}

export interface InspectorProps {
  open: boolean;
  onClose: () => void;
}

export function Inspector({ open, onClose }: InspectorProps) {
  const selection = useSelection();
  const { openApp } = useDesktopActions();
  const ai = useAI();

  const datasets = useDataStore((s) => s.datasets);
  const folders = useFoldersStore((s) => s.folders);
  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);

  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasSelection = selection.kind !== null;
  const title = selection.label ?? selection.id ?? "Sélection";
  const kindLabel = selection.kind ? KIND_LABEL[selection.kind] : "";

  // Look up dataset entity when selection is a dataset
  const datasetEntity = useMemo(() => {
    if (selection.kind !== "dataset" || !selection.id) return null;
    return datasets.find((d) => d.id === selection.id || d.name === selection.label) ?? null;
  }, [selection, datasets]);

  // Look up folder entity and contained items when selection is a folder
  const folderData = useMemo(() => {
    if (selection.kind !== "folder" || !selection.id) return null;
    const folder = folders.find((f) => f.id === selection.id) ?? null;
    const containedDatasets = datasets.filter((d) => datasetFolderMap[d.id] === selection.id);
    const totalSize = containedDatasets.reduce((acc, d) => acc + (d.sizeBytes || 0), 0);
    const totalRows = containedDatasets.reduce((acc, d) => acc + (d.rowCount || 0), 0);
    return { folder, count: containedDatasets.length, totalSize, totalRows };
  }, [selection, folders, datasets, datasetFolderMap]);

  // Temporal analysis for datasets
  const temporal = useMemo(() => {
    if (!datasetEntity) return null;
    try {
      const info = extractTemporalInfo(datasetEntity);
      if (info.confidence !== "none") return info;
      return null;
    } catch {
      return null;
    }
  }, [datasetEntity]);

  const metaEntries = useMemo(() => {
    if (!selection.meta) return [];
    return Object.entries(selection.meta).filter(([, value]) => value !== undefined);
  }, [selection.meta]);

  const selectionPrompt = useMemo(() => {
    const parts = [`${kindLabel} « ${title} »`.trim()];
    if (selection.id && selection.id !== title) parts.push(`(id: ${selection.id})`);
    for (const [key, value] of metaEntries.slice(0, 8)) {
      parts.push(`${key}: ${formatMetaValue(value)}`);
    }
    return parts.join(", ");
  }, [kindLabel, title, selection.id, metaEntries]);

  // Column types breakdown
  const colTypesSummary = useMemo(() => {
    if (!datasetEntity?.columns?.length) return null;
    const counts: Record<string, number> = {};
    for (const col of datasetEntity.columns) {
      counts[col.type] = (counts[col.type] || 0) + 1;
    }
    return counts;
  }, [datasetEntity]);

  const handleAskMoudir = useCallback(
    (customPrompt?: string) => {
      const prompt =
        customPrompt ??
        (datasetEntity
          ? `Analyse le jeu de données « ${datasetEntity.name} » et présente une synthèse complète de ses données.`
          : `Analyse ${selectionPrompt}.`);

      askMoudir(prompt, {
        datasetId: datasetEntity?.id ?? (selection.kind === "dataset" ? selection.id : undefined),
        openApp,
      });
    },
    [datasetEntity, selectionPrompt, selection.kind, selection.id, openApp],
  );

  const explain = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setExplaining(true);
    setExplainError(null);
    setExplanation(null);

    try {
      const result = await ai.generate({
        system:
          "Tu es un analyste télécom expert. Réponds en français, en 2 ou 3 phrases percutantes, précises et sans jargon.",
        prompt: `Explique la portée métier de ${selectionPrompt} et quels indicateurs méritent une attention immédiate.`,
        maxTokens: 250,
        temperature: 0.3,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setExplanation(result.text.trim());
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setExplainError(err instanceof Error ? err.message : "L'analyse a échoué.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setExplaining(false);
    }
  }, [ai, selectionPrompt]);

  const copyExplanation = useCallback(() => {
    if (!explanation) return;
    navigator.clipboard.writeText(explanation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [explanation]);

  const qualityInfo = datasetEntity ? getQualityStatus(datasetEntity.qualityScore ?? 100) : null;

  return (
    <motion.aside
      aria-hidden={!open}
      initial={false}
      animate={{ x: open ? 0 : "calc(100% + 24px)" }}
      transition={{ type: "spring", stiffness: 360, damping: 36 }}
      style={{
        background: "var(--glass-bg-strong)",
        borderColor: "var(--glass-border)",
        color: "var(--glass-text)",
        boxShadow: "var(--glass-shadow)",
        backdropFilter: "blur(32px) saturate(170%)",
        WebkitBackdropFilter: "blur(32px) saturate(170%)",
      }}
      className="absolute top-3 right-3 bottom-3 z-[var(--z-modal)] flex w-[360px] md:w-[380px] flex-col overflow-hidden rounded-2xl border"
    >
      {/* Header */}
      <header
        className="flex shrink-0 items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--glass-hairline)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <span
            className="text-[13px] font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-nerd)" }}
          >
            Inspecteur Moudir
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l'inspecteur"
          className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-foreground/10"
          style={{ color: "var(--glass-text-dim)" }}
        >
          <X className="size-4" />
        </button>
      </header>

      {hasSelection ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-4 py-4">
            {/* Identity Card */}
            <div
              className="rounded-xl border p-3.5"
              style={{
                background: "var(--glass-bg)",
                borderColor: "var(--glass-hairline)",
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl border"
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    borderColor: "var(--glass-hairline)",
                  }}
                >
                  <KindIcon kind={selection.kind} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-foreground" title={title}>
                    {title}
                  </h2>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: "rgba(255, 255, 255, 0.08)",
                        color: "var(--glass-text-dim)",
                      }}
                    >
                      {kindLabel}
                    </span>
                    {datasetEntity && (
                      <span className="text-[11px] text-muted-foreground">
                        {datasetEntity.format.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Temporal Intelligence Badge */}
              {temporal && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] text-primary">
                  <Calendar className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {temporal.monthName ? `${temporal.monthName} ` : ""}
                    {temporal.year ? `${temporal.year} ` : ""}
                    {temporal.frequency ? `· ${temporal.frequency}` : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Dataset Real Metrics */}
            {datasetEntity && (
              <div className="flex flex-col gap-2">
                <h3
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ color: "var(--glass-text-dim)" }}
                >
                  Métriques du jeu de données
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="flex flex-col rounded-lg border p-2.5"
                    style={{
                      background: "var(--glass-bg)",
                      borderColor: "var(--glass-hairline)",
                    }}
                  >
                    <span className="text-[10px] text-muted-foreground">Lignes</span>
                    <span className="text-sm font-bold">
                      {datasetEntity.rowCount.toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <div
                    className="flex flex-col rounded-lg border p-2.5"
                    style={{
                      background: "var(--glass-bg)",
                      borderColor: "var(--glass-hairline)",
                    }}
                  >
                    <span className="text-[10px] text-muted-foreground">Colonnes</span>
                    <span className="text-sm font-bold">{datasetEntity.colCount}</span>
                  </div>
                  <div
                    className="flex flex-col rounded-lg border p-2.5"
                    style={{
                      background: "var(--glass-bg)",
                      borderColor: "var(--glass-hairline)",
                    }}
                  >
                    <span className="text-[10px] text-muted-foreground">Taille</span>
                    <span className="text-sm font-bold">
                      {formatBytes(datasetEntity.sizeBytes)}
                    </span>
                  </div>
                  <div
                    className="flex flex-col rounded-lg border p-2.5"
                    style={{
                      background: "var(--glass-bg)",
                      borderColor: "var(--glass-hairline)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Qualité</span>
                      {qualityInfo && (
                        <span
                          className="rounded px-1.5 py-0.2 text-[9px] font-semibold"
                          style={{ color: qualityInfo.color, background: qualityInfo.bg }}
                        >
                          {qualityInfo.label}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold">{datasetEntity.qualityScore ?? 100}%</span>
                  </div>
                </div>

                {/* Column Types Breakdown */}
                {colTypesSummary && (
                  <div
                    className="flex flex-wrap items-center gap-1.5 rounded-lg border p-2"
                    style={{
                      background: "var(--glass-bg)",
                      borderColor: "var(--glass-hairline)",
                    }}
                  >
                    <Table className="size-3 text-muted-foreground" />
                    {Object.entries(colTypesSummary).map(([type, count]) => (
                      <span
                        key={type}
                        className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {count} {type}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Folder Real Metrics */}
            {folderData && (
              <div className="flex flex-col gap-2">
                <h3
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ color: "var(--glass-text-dim)" }}
                >
                  Contenu du dossier
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="flex flex-col rounded-lg border p-2.5"
                    style={{
                      background: "var(--glass-bg)",
                      borderColor: "var(--glass-hairline)",
                    }}
                  >
                    <span className="text-[10px] text-muted-foreground">Fichiers inclus</span>
                    <span className="text-sm font-bold">{folderData.count}</span>
                  </div>
                  <div
                    className="flex flex-col rounded-lg border p-2.5"
                    style={{
                      background: "var(--glass-bg)",
                      borderColor: "var(--glass-hairline)",
                    }}
                  >
                    <span className="text-[10px] text-muted-foreground">Volume total</span>
                    <span className="text-sm font-bold">{formatBytes(folderData.totalSize)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* General Metadata if no dataset entity */}
            {!datasetEntity && !folderData && metaEntries.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ color: "var(--glass-text-dim)" }}
                >
                  Détails techniques
                </h3>
                <dl className="flex flex-col gap-1">
                  {metaEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-3 rounded-md px-2.5 py-1.5"
                      style={{ background: "var(--glass-bg)" }}
                    >
                      <dt className="shrink-0 text-[11px] text-muted-foreground">{key}</dt>
                      <dd
                        className="truncate text-right text-[11px] font-medium"
                        title={formatMetaValue(value)}
                      >
                        {formatMetaValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Moudir AI Intelligence Suite */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    Actions Moudir IA
                  </h3>
                </div>
                <span className="text-[10px] text-muted-foreground">1-clic direct</span>
              </div>

              {/* Hero Action Button */}
              <button
                type="button"
                onClick={() => handleAskMoudir()}
                className="group flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-md transition-all hover:opacity-95 active:scale-[0.98]"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4" />
                  <span>Analyser avec Moudir IA</span>
                </div>
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              {/* Prompt Pills */}
              <div className="grid grid-cols-1 gap-1.5">
                <PromptPill
                  icon={<Lightbulb className="size-3.5 text-amber-500" />}
                  label="Résumer les points clés"
                  onClick={() =>
                    handleAskMoudir(
                      `Fais une synthèse claire et exécutive du jeu de données « ${title} ».`,
                    )
                  }
                />
                <PromptPill
                  icon={<AlertCircle className="size-3.5 text-rose-500" />}
                  label="Détecter les anomalies"
                  onClick={() =>
                    handleAskMoudir(
                      `Quelles sont les anomalies, valeurs manquantes ou valeurs atypiques dans « ${title} » ?`,
                    )
                  }
                />
                <PromptPill
                  icon={<TrendingUp className="size-3.5 text-emerald-500" />}
                  label="Tendances & corrélations"
                  onClick={() =>
                    handleAskMoudir(
                      `Identifie les corrélations et tendances majeures dans les données de « ${title} ».`,
                    )
                  }
                />
                <PromptPill
                  icon={<BarChart3 className="size-3.5 text-sky-500" />}
                  label="Proposer des visualisations"
                  onClick={() =>
                    handleAskMoudir(
                      `Quels graphiques pertinents recommandes-tu de construire à partir de « ${title} » ?`,
                    )
                  }
                />
              </div>
            </div>

            {/* Inline Quick Explanation */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={explain}
                disabled={explaining}
                className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "var(--glass-border)",
                  background: "var(--glass-bg)",
                }}
              >
                {explaining ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Activity className="size-3.5 text-primary" />
                )}
                {explaining ? "Synthèse en cours…" : "Générer un aperçu instantané"}
              </button>

              {explainError && (
                <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                  {explainError}
                </p>
              )}

              {explanation && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative rounded-lg border p-3 text-[12px] leading-relaxed"
                  style={{
                    borderColor: "var(--glass-hairline)",
                    background: "var(--glass-bg)",
                    color: "var(--glass-text)",
                  }}
                >
                  <p>{explanation}</p>
                  <button
                    type="button"
                    onClick={copyExplanation}
                    className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {copied ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    {copied ? "Copié" : "Copier le texte"}
                  </button>
                </motion.div>
              )}
            </div>

            {/* Navigation Shortcuts */}
            <div
              className="flex flex-col gap-1.5 border-t pt-3"
              style={{ borderColor: "var(--glass-hairline)" }}
            >
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Outils associés
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => openApp("telecom")}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-colors hover:bg-foreground/10"
                  style={{
                    borderColor: "var(--glass-hairline)",
                    background: "var(--glass-bg)",
                  }}
                >
                  <FileText className="size-3.5 text-primary" />
                  <span className="truncate">Rapport Télécom</span>
                </button>
                <button
                  type="button"
                  onClick={() => openApp("folders")}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-colors hover:bg-foreground/10"
                  style={{
                    borderColor: "var(--glass-hairline)",
                    background: "var(--glass-bg)",
                  }}
                >
                  <FolderClosed className="size-3.5 text-primary" />
                  <span className="truncate">Catalogue</span>
                </button>
              </div>
            </div>
          </div>
        </ScrollArea>
      ) : (
        <EmptyState />
      )}
    </motion.aside>
  );
}

function PromptPill({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
      style={{
        borderColor: "var(--glass-hairline)",
        background: "var(--glass-bg)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-foreground">{label}</span>
      </div>
      <ChevronRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span
        className="grid size-12 place-items-center rounded-2xl border"
        style={{
          background: "var(--glass-bg)",
          borderColor: "var(--glass-hairline)",
        }}
      >
        <Box className="size-5" style={{ color: "var(--glass-text-dim)" }} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-foreground">Aucune sélection active</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Cliquez sur un jeu de données, un dossier ou un graphique pour faire apparaître ses
          métriques et lancer les analyses Moudir IA en un clic.
        </p>
      </div>
    </div>
  );
}
