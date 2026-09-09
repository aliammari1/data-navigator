"use client";

import {
  BarChart3,
  Check,
  Copy,
  Database,
  HelpCircle,
  Layers,
  Presentation,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Artifact,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { ChatChartArtifact } from "@/features/data-formulator/components/moudir-chat/chat-chart-artifact";
import { ChatFilterBreadcrumbs } from "@/features/data-formulator/components/moudir-chat/chat-filter-breadcrumbs";
import { generateExecutivePresentation } from "@/features/data-formulator/core/presentation/deck-generator";
import {
  type MoudirArtifact,
  useMoudirChatStore,
} from "@/features/data-formulator/store/moudir-chat-store";

export function MoudirCanvas({
  artifact,
  onClose,
}: {
  artifact: MoudirArtifact;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const messages = useMoudirChatStore((s) => s.messages);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const datasets = useDataStore((s) => s.datasets);
  const activeDataset = datasets.find((d) => d.id === activeDatasetId);

  const handleExportPresentation = async () => {
    try {
      setIsExporting(true);
      toast("Génération de la présentation en cours…", {
        description: "Deck exécutif 16:9 au standard McKinsey / BCG avec KPIs et graphiques.",
      });
      await generateExecutivePresentation(messages, {
        title: artifact.title || "Analyse Décisionnelle Moudir",
        datasetName: activeDataset?.name || activeDataset?.tableName,
        rowCount: activeDataset?.rowCount,
      });
      toast.success("Présentation exportée avec succès (.html)");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la génération de la présentation");
    } finally {
      setIsExporting(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getArtifactIcon = () => {
    switch (artifact.kind) {
      case "chart":
        return <BarChart3 className="size-4 text-primary" />;
      case "table":
        return <TableIcon className="size-4 text-primary" />;
      case "sql":
        return <Database className="size-4 text-primary" />;
      case "metric":
        return <Sparkles className="size-4 text-primary" />;
      case "clarification":
        return <HelpCircle className="size-4 text-primary" />;
      default:
        return <Layers className="size-4 text-primary" />;
    }
  };

  const getSubtitle = () => {
    switch (artifact.kind) {
      case "chart":
        return `${artifact.chartType} · ${artifact.x} → ${artifact.aggregate}(${artifact.y})`;
      case "sql":
        return artifact.dataset ? `Dataset: ${artifact.dataset}` : "Requête analytique DuckDB";
      case "table":
        return `${artifact.rows.length} lignes · ${artifact.columns.length} colonnes`;
      case "metric":
        return artifact.basis;
      case "clarification":
        return "Demande de clarification";
      default:
        return "";
    }
  };

  return (
    <Artifact className="h-full min-h-0 flex flex-col rounded-none border-0 bg-background shadow-none">
      <ArtifactHeader className="h-13 shrink-0 items-center justify-between border-b border-border bg-card/60 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 border border-primary/20">
            {getArtifactIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <ArtifactTitle className="truncate font-semibold text-sm leading-tight text-foreground">
              {artifact.title}
            </ArtifactTitle>
            <ArtifactDescription className="truncate text-xs text-muted-foreground font-mono">
              {getSubtitle()}
            </ArtifactDescription>
          </div>
        </div>
        <ArtifactActions className="gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-6 gap-1 text-[11px] font-medium text-foreground hover:bg-muted"
            disabled={isExporting}
            onClick={handleExportPresentation}
            title="Exporter un rapport de présentation exécutif (16:9 Marp HTML)"
          >
            <Presentation className="size-3 text-primary" />
            <span>{isExporting ? "Génération…" : "Export Présentation"}</span>
          </Button>
          <Badge variant="outline" className="text-[10px] capitalize font-medium px-2 py-0.5">
            {artifact.kind}
          </Badge>
          <ArtifactClose onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>

      <ChatFilterBreadcrumbs />

      <ArtifactContent className="flex-1 overflow-auto p-4 space-y-4">
        {artifact.kind === "chart" ? (
          <div className="rounded-xl border border-border/60 bg-card p-2 shadow-xs">
            <ChatChartArtifact
              part={{
                kind: "chart",
                chartType: artifact.chartType,
                x: artifact.x,
                y: artifact.y,
                aggregate: artifact.aggregate,
                title: artifact.title,
                datasetId: artifact.datasetId,
                rows: artifact.rows,
              }}
            />
          </div>
        ) : artifact.kind === "metric" ? (
          <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-card to-card/50 p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Indicateur Clé
              </span>
              <Badge variant="secondary" className="text-[11px]">
                Synthèse
              </Badge>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <p className="text-4xl font-extrabold tracking-tight text-foreground tabular-nums">
                {artifact.value}
              </p>
              {artifact.delta ? (
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {artifact.delta}
                </span>
              ) : null}
            </div>
            <div className="mt-4 border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Base de calcul : </span>
                {artifact.basis}
              </p>
            </div>
          </div>
        ) : artifact.kind === "sql" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-mono font-medium text-muted-foreground">
                SQL DuckDB
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => copyText(artifact.query)}
              >
                {copied ? (
                  <Check className="size-3.5 text-primary" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copied ? "Copié" : "Copier"}</span>
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/70">
              <CodeBlock code={artifact.query} language="sql" showLineNumbers />
            </div>
          </div>
        ) : artifact.kind === "table" ? (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Aperçu des résultats ({artifact.rows.length} lignes)
              </span>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-xs">
                  <tr className="border-b border-border text-muted-foreground font-medium">
                    {artifact.columns.map((col, idx) => (
                      <th key={idx} className="px-3 py-2 font-mono whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {artifact.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 truncate max-w-[220px]">
                          {String(cell ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : artifact.kind === "clarification" ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
            <div className="flex items-start gap-2.5">
              <HelpCircle className="size-4.5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-foreground">{artifact.question}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sélectionnez une option pour orienter l'analyse
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {artifact.options.map((opt) => (
                <Badge
                  key={opt}
                  variant="secondary"
                  className="cursor-pointer px-3 py-1.5 hover:bg-primary/20 transition-colors text-xs"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("moudir-chat:prefill-composer", {
                        detail: { text: opt, autoSend: true },
                      }),
                    );
                    onClose();
                  }}
                >
                  {opt}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </ArtifactContent>
    </Artifact>
  );
}
