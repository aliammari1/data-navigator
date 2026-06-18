"use client";

import {
  BarChart3,
  Box,
  ChevronRight,
  Columns3,
  FileText,
  FolderClosed,
  Gauge,
  Layers,
  Loader2,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type DesktopSelectionKind, useSelection } from "@/features/desktop/core/context-bus";
import { useDesktopActions } from "@/features/desktop/store/desktop-store";
import { useAI } from "@/platform/ai/provider/use-ai";

/**
 * <Inspector/> — the desktop's right-docked, collapsible glass panel.
 *
 * It is a passive observer of the cross-window context bus: whatever is selected
 * anywhere on the desktop (a dataset, folder, chart, KPI, column or window) is
 * mirrored here, along with its metadata and a row of quick actions:
 *
 *  - Analyser  → opens Moudir and dispatches `moudir:ask` with a short prompt
 *  - Rapport   → opens the Telecom report
 *  - Prévision → opens the Forecast app
 *  - Profiler  → opens the Parsed-data profiler
 *
 * Plus "Expliquer avec l'IA" which runs a short `useAI().generate` over the
 * selection and shows the reply inline. When nothing is selected it shows a calm
 * empty state. Visibility is fully controlled by the host via `open` / `onClose`.
 */

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
      return <Box className={className} />;
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

/** Format a meta value for read-only display, keeping it compact. */
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

export interface InspectorProps {
  /** Whether the panel is expanded. When false, it collapses off-canvas. */
  open: boolean;
  /** Called when the user collapses the panel via the header close button. */
  onClose: () => void;
}

export function Inspector({ open, onClose }: InspectorProps) {
  const selection = useSelection();
  const { openApp } = useDesktopActions();
  const ai = useAI();

  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasSelection = selection.kind !== null;
  const title = selection.label ?? selection.id ?? "Sélection";
  const kindLabel = selection.kind ? KIND_LABEL[selection.kind] : "";

  const metaEntries = useMemo(() => {
    if (!selection.meta) return [];
    return Object.entries(selection.meta).filter(([, value]) => value !== undefined);
  }, [selection.meta]);

  // A compact natural-language description of the current selection, reused for
  // both the Moudir hand-off prompt and the inline "Expliquer avec l'IA" call.
  const selectionPrompt = useMemo(() => {
    const parts = [`${kindLabel} « ${title} »`.trim()];
    if (selection.id && selection.id !== title) parts.push(`(id: ${selection.id})`);
    for (const [key, value] of metaEntries.slice(0, 8)) {
      parts.push(`${key}: ${formatMetaValue(value)}`);
    }
    return parts.join(", ");
  }, [kindLabel, title, selection.id, metaEntries]);

  const askMoudir = useCallback(() => {
    openApp("moudir");
    window.dispatchEvent(
      new CustomEvent("moudir:ask", {
        detail: { prompt: `Analyse ${selectionPrompt}.` },
      }),
    );
  }, [openApp, selectionPrompt]);

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
          "Tu es un analyste télécom. Réponds en français, en 2 à 3 phrases claires, sans jargon inutile.",
        prompt: `Explique brièvement à un responsable ce que représente ${selectionPrompt} et pourquoi cela peut mériter attention.`,
        maxTokens: 220,
        temperature: 0.3,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setExplanation(result.text.trim());
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setExplainError(err instanceof Error ? err.message : "L'explication a échoué.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setExplaining(false);
    }
  }, [ai, selectionPrompt]);

  return (
    <motion.aside
      aria-hidden={!open}
      initial={false}
      animate={{ x: open ? 0 : "calc(100% + 16px)" }}
      transition={{ type: "spring", stiffness: 360, damping: 36 }}
      style={{
        background: "var(--glass-bg-strong)",
        borderColor: "var(--glass-border)",
        color: "var(--glass-text)",
        boxShadow: "var(--glass-shadow)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
      }}
      className="absolute top-3 right-3 bottom-3 z-[var(--z-modal)] flex w-[300px] flex-col overflow-hidden rounded-2xl border"
    >
      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--glass-hairline)" }}
      >
        <Sparkles className="size-4 text-[hsl(var(--glass-accent))]" />
        <span
          className="flex-1 truncate text-[13px] font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-nerd)" }}
        >
          Inspecteur
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l'inspecteur"
          className="grid size-7 place-items-center rounded-md transition-colors hover:bg-foreground/10"
          style={{ color: "var(--glass-text-dim)" }}
        >
          <X className="size-4" />
        </button>
      </header>

      {hasSelection ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-4 py-4">
            {/* Selection identity */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl border"
                  style={{
                    background: "var(--glass-bg)",
                    borderColor: "var(--glass-hairline)",
                  }}
                >
                  <KindIcon kind={selection.kind} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" title={title}>
                    {title}
                  </div>
                  {kindLabel ? (
                    <div className="text-[11px]" style={{ color: "var(--glass-text-dim)" }}>
                      {kindLabel}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Metadata */}
            {metaEntries.length > 0 ? (
              <section className="flex flex-col gap-1.5">
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--glass-text-dim)" }}
                >
                  Détails
                </h3>
                <dl className="flex flex-col gap-1">
                  {metaEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1"
                      style={{ background: "var(--glass-bg)" }}
                    >
                      <dt
                        className="shrink-0 text-[11px]"
                        style={{ color: "var(--glass-text-dim)" }}
                      >
                        {key}
                      </dt>
                      <dd
                        className="truncate text-right text-[11px] font-medium"
                        title={formatMetaValue(value)}
                      >
                        {formatMetaValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {/* Quick actions */}
            <section className="flex flex-col gap-1.5">
              <h3
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--glass-text-dim)" }}
              >
                Actions
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                <ActionButton
                  icon={<Sparkles className="size-3.5" />}
                  label="Analyser"
                  onClick={askMoudir}
                />
                <ActionButton
                  icon={<FileText className="size-3.5" />}
                  label="Rapport"
                  onClick={() => openApp("telecom")}
                />
                <ActionButton
                  icon={<TrendingUp className="size-3.5" />}
                  label="Prévision"
                  onClick={() => openApp("forecast")}
                />
                <ActionButton
                  icon={<Columns3 className="size-3.5" />}
                  label="Profiler"
                  onClick={() => openApp("parsed")}
                />
              </div>
            </section>

            {/* Explain with AI */}
            <section className="flex flex-col gap-2">
              <button
                type="button"
                onClick={explain}
                disabled={explaining}
                className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors hover:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "var(--glass-border)",
                  background: "var(--glass-bg)",
                }}
              >
                {explaining ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 text-[hsl(var(--glass-accent))]" />
                )}
                {explaining ? "Analyse en cours…" : "Expliquer avec l'IA"}
              </button>

              {explainError ? (
                <p
                  className="rounded-md px-2 py-1.5 text-[11px] text-[#d13438]"
                  style={{ background: "var(--glass-bg)" }}
                >
                  {explainError}
                </p>
              ) : null}

              {explanation ? (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed"
                  style={{
                    borderColor: "var(--glass-hairline)",
                    background: "var(--glass-bg)",
                    color: "var(--glass-text)",
                  }}
                >
                  {explanation}
                </motion.p>
              ) : null}
            </section>
          </div>
        </ScrollArea>
      ) : (
        <EmptyState />
      )}
    </motion.aside>
  );
}

/** A compact quick-action tile used in the Inspector's action grid. */
function ActionButton({
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
      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[12px] font-medium transition-colors hover:bg-foreground/10"
      style={{
        borderColor: "var(--glass-hairline)",
        background: "var(--glass-bg)",
        color: "var(--glass-text)",
      }}
    >
      <span className="text-[hsl(var(--glass-accent))]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <ChevronRight className="size-3 shrink-0" style={{ color: "var(--glass-text-dim)" }} />
    </button>
  );
}

/** Calm placeholder shown when nothing is selected anywhere on the desktop. */
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
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold">Rien de sélectionné</p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--glass-text-dim)" }}>
          Sélectionnez un jeu de données, un dossier, un graphique ou un indicateur pour voir ses
          détails et les actions disponibles ici.
        </p>
      </div>
    </div>
  );
}
