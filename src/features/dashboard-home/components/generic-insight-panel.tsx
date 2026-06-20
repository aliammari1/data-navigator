"use client";

/**
 * GenericInsightPanel — an offline, AI-narrated summary of the active dataset.
 *
 * The narrative is produced by `useAI().generateStructured(prompt, schema)` from
 * the platform provider registry. In Electron that resolves to the grammar-
 * constrained llamacpp adapter, so the JSON is valid by construction — there is
 * no regex/parseJSON repair loop and no direct web-llm dependency. The model is
 * grounded strictly in the DuckDB `SUMMARIZE` profile (real numbers only) and is
 * warmed on demand (explicit button) so it never blocks first paint.
 */

import { Lightbulb, ListChecks, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildDatasetInsightPrompt,
  type DatasetInsight,
  DatasetInsightSchema,
} from "@/features/dashboard-home/lib/insight-prompt";
import type { GenericOverview } from "@/features/dashboard-home/lib/generic-overview";
import { useAI } from "@/platform/ai/provider";

type PanelState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; insight: DatasetInsight }
  | { phase: "error"; message: string };

export function GenericInsightPanel({
  overview,
  datasetName,
}: {
  overview: GenericOverview;
  datasetName: string;
}) {
  const ai = useAI();
  const [state, setState] = useState<PanelState>({ phase: "idle" });

  const aiReady = ai.availability.some((p) => p.available);

  async function run() {
    setState({ phase: "running" });
    try {
      const { system, prompt } = buildDatasetInsightPrompt(overview, datasetName);
      const insight = await ai.generateStructured(
        { system, prompt, temperature: 0.2, maxTokens: 640 },
        DatasetInsightSchema,
      );
      setState({ phase: "done", insight });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "La génération a échoué.",
      });
    }
  }

  const running = state.phase === "running";
  const progress = ai.progress;
  const loadingLabel =
    progress.status === "loading"
      ? `Chargement du modèle… ${Math.round(progress.progress)}%`
      : "Analyse en cours…";

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-amber-500 to-orange-500 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Analyse IA du dataset</h3>
            <p className="text-[11px] text-muted-foreground">
              Résumé local généré à partir du profil DuckDB
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant={state.phase === "done" ? "outline" : "default"}
          onClick={run}
          disabled={running || !aiReady}
          className="h-8 rounded-xl text-xs"
        >
          {running ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          {state.phase === "done" ? "Régénérer" : "Générer l'analyse"}
        </Button>
      </div>

      <div className="px-4 py-4">
        {!aiReady && state.phase === "idle" && (
          <p className="text-xs text-muted-foreground">
            {ai.detecting
              ? "Détection des moteurs d'IA hors-ligne…"
              : "Aucun moteur d'IA hors-ligne disponible. Le reste du tableau de bord reste pleinement fonctionnel."}
          </p>
        )}

        {aiReady && state.phase === "idle" && (
          <p className="text-xs text-muted-foreground">
            Générez un résumé en langage naturel des {overview.columnCount} colonnes et de la
            qualité des données — entièrement hors-ligne, fondé uniquement sur les statistiques
            réelles.
          </p>
        )}

        {state.phase === "running" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {loadingLabel}
          </div>
        )}

        {state.phase === "error" && <p className="text-xs text-destructive">{state.message}</p>}

        {state.phase === "done" && <InsightBody insight={state.insight} />}
      </div>
    </section>
  );
}

function InsightBody({ insight }: { insight: DatasetInsight }) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium leading-snug text-foreground">{insight.headline}</p>

      <InsightList
        icon={<Lightbulb className="h-3.5 w-3.5 text-amber-500" />}
        title="Observations"
        items={insight.observations}
      />

      {insight.dataQualityFlags.length > 0 && (
        <InsightList
          icon={<ShieldAlert className="h-3.5 w-3.5 text-rose-500" />}
          title="Qualité des données"
          items={insight.dataQualityFlags}
        />
      )}

      <InsightList
        icon={<ListChecks className="h-3.5 w-3.5 text-emerald-500" />}
        title="Étapes suivantes"
        items={insight.suggestedNextSteps}
      />
    </div>
  );
}

function InsightList({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={`${title}-${i}`} className="flex gap-2 text-xs leading-relaxed text-foreground">
            <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-muted-foreground/50" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
