"use client";

import { type ZodType, z } from "zod";
import type * as Types from "@/features/telecom/types";

interface TelecomDeckInsight {
  title: string;
  summary: string;
  bullets: string[];
  risk: "low" | "medium" | "high";
}

export interface TelecomDeckBrief {
  executiveSummary: string;
  keyFindings: TelecomDeckInsight[];
  recommendedActions: string[];
  speakerNotes: string[];
}

/**
 * Zod schema for the deck brief. Passed to the provider's
 * `generateStructured(req, schema)` so the LLM output is valid JSON *by
 * construction* (GBNF grammar from the schema in the llamacpp lane) — no
 * regex/parseJSON repair loop is needed any more.
 */
export const TelecomDeckBriefSchema: ZodType<TelecomDeckBrief> = z.object({
  executiveSummary: z.string(),
  keyFindings: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        bullets: z.array(z.string()),
        risk: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(8),
  recommendedActions: z.array(z.string()).max(8),
  speakerNotes: z.array(z.string()).max(8),
});

/**
 * Dependency-injected structured generator. Components bind this to
 * `useAI().generateStructured` (the offline provider registry) and pass it in,
 * so this lib stays hook-free while still routing through the unified provider.
 */
export type GenerateStructured = <T>(
  req: {
    system?: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  },
  schema: ZodType<T>,
) => Promise<T>;

/**
 * Exact system prompt sent to the offline LLM for the deck brief. Exported so
 * tests can assert prompt-wording identity instead of a substring keyword
 * check — a substring check could only ever catch removal of one word and
 * would miss the instructions being rewritten to ask for something else
 * entirely while accidentally keeping one matching keyword (e.g. "analyste").
 */
export const DECK_BRIEF_SYSTEM_PROMPT =
  "Tu es un analyste de reporting télécom qui tourne 100% hors-ligne. Produis une narration de slides exécutives de qualité NotebookLM en français. Sois spécifique, opérationnel, et fonde-toi UNIQUEMENT sur les métriques fournies — n'invente jamais de chiffre.";

/**
 * Static French instruction prefix prepended to the JSON metrics payload in
 * the deck-brief user prompt (the payload itself is runtime data, appended
 * after this prefix). Exported so tests can assert this wording exactly
 * instead of a loose "contains a keyword" check.
 */
export const DECK_BRIEF_PROMPT_PREFIX =
  "Génère un brief de deck pour un dashboard de recharges télécom à partir de ce JSON de métriques (toutes les valeurs sont exactes) :\n\n";

export interface TelecomDeckBriefInput {
  reportDate: string;
  fileName: string;
  kpi: Types.KPISummary;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  revenueGroups: Array<{
    group: string;
    total: number;
    success: number;
    amount: number;
    successRate: number;
  }>;
  selectedKpis: Array<{ label: string; value: string | number }>;
}

function buildFallbackBrief(input: TelecomDeckBriefInput): TelecomDeckBrief {
  const topCanal = [...input.canals].sort((a, b) => b.total - a.total)[0];
  const weakestCanal = [...input.canals]
    .filter((canal) => canal.total > 0)
    .sort((a, b) => a.successRate - b.successRate)[0];
  const peakHour = [...input.hourly].sort((a, b) => b.total - a.total)[0];
  const failed = input.statusData.find((row) => row.status.toLowerCase().includes("échec"));

  const keyFindings: TelecomDeckInsight[] = [
    {
      title: "Volume et réussite",
      summary: `${input.kpi.totalTransactions.toLocaleString("fr-TN")} transactions analysées avec ${input.kpi.successRate.toFixed(1)}% de réussite.`,
      bullets: [
        `Réussies: ${input.kpi.successCount.toLocaleString("fr-TN")}`,
        `Échecs: ${input.kpi.declinedCount.toLocaleString("fr-TN")}`,
        `Montant réussi: ${input.kpi.totalAmount.toFixed(3)} DT`,
      ],
      risk: input.kpi.successRate >= 90 ? "low" : input.kpi.successRate >= 75 ? "medium" : "high",
    },
    {
      title: "Canal dominant",
      summary: topCanal
        ? `${topCanal.label} porte le plus grand volume (${topCanal.total.toLocaleString("fr-TN")} transactions).`
        : "Aucun canal dominant détecté.",
      bullets: topCanal
        ? [
            `Part: ${topCanal.share.toFixed(1)}%`,
            `Taux de réussite: ${topCanal.successRate.toFixed(1)}%`,
            `Montant: ${topCanal.amount.toFixed(3)} DT`,
          ]
        : ["Importer un rapport pour enrichir cette analyse."],
      risk: topCanal && topCanal.successRate < 80 ? "high" : "low",
    },
    {
      title: "Point de fragilité",
      summary: weakestCanal
        ? `${weakestCanal.label} a le taux de réussite le plus faible parmi les canaux actifs.`
        : "Aucun point de fragilité canal détecté.",
      bullets: weakestCanal
        ? [
            `Taux: ${weakestCanal.successRate.toFixed(1)}%`,
            `Échecs: ${weakestCanal.declined.toLocaleString("fr-TN")}`,
            `Instances: ${weakestCanal.instance.toLocaleString("fr-TN")}`,
          ]
        : ["Surveiller les canaux avec faible volume avant d'interpréter les taux."],
      risk: weakestCanal && weakestCanal.successRate < 80 ? "high" : "medium",
    },
    {
      title: "Charge horaire",
      summary: peakHour
        ? `Le pic est observé à ${String(peakHour.hour).padStart(2, "0")}:00.`
        : "Aucun pic horaire disponible.",
      bullets: peakHour
        ? [
            `Transactions: ${peakHour.total.toLocaleString("fr-TN")}`,
            `Réussies: ${peakHour.success.toLocaleString("fr-TN")}`,
            `Montant: ${peakHour.amount.toFixed(3)} DT`,
          ]
        : ["Activer le mapping de date/heure pour obtenir cette vue."],
      risk: "medium",
    },
  ];

  return {
    executiveSummary: `Synthèse locale du rapport ${input.reportDate || ""}: le dashboard montre la performance des recharges, paiements, vouchers et transferts selon les statuts métier de la spécification. Les priorités sont la stabilité des canaux à fort volume, la réduction des échecs et le suivi des instances.`,
    keyFindings,
    recommendedActions: [
      weakestCanal
        ? `Prioriser l'analyse opérationnelle du canal ${weakestCanal.label}.`
        : "Identifier les canaux actifs avec faible taux de réussite.",
      failed
        ? `Revoir les causes des ${failed.count.toLocaleString("fr-TN")} transactions en échec.`
        : "Contrôler les statuts échoués dès qu'ils apparaissent.",
      "Conserver les exports journaliers et utiliser les statistiques pré-calculées pour accélérer les périodes longues.",
      "Comparer les tendances J-1 vs période courante avant décision commerciale.",
    ],
    speakerNotes: [
      "Commencer par expliquer que les montants sont basés sur les transactions réussies.",
      "Insister sur les écarts par canal avant de présenter les recommandations.",
      "Utiliser la slide offline/confidentialité pour rassurer sur la non-transmission des fichiers.",
    ],
  };
}

/**
 * Generate a NotebookLM-style executive deck brief.
 *
 * Pass `generateStructured` from `useAI()` to route through the offline provider
 * registry (llamacpp grammar-constrained JSON by default). When no generator is
 * supplied — or the provider is unavailable / throws — we fall back to a
 * fully-deterministic, in-house brief computed from the already-aggregated KPIs.
 */
export async function generateTelecomDeckBrief(
  input: TelecomDeckBriefInput,
  generateStructured?: GenerateStructured,
): Promise<{ brief: TelecomDeckBrief; source: "ai" | "local" }> {
  const payload = {
    reportDate: input.reportDate,
    fileName: input.fileName,
    kpi: input.kpi,
    selectedKpis: input.selectedKpis,
    statusData: input.statusData,
    revenueGroups: input.revenueGroups,
    canals: input.canals.slice(0, 12).map((canal) => ({
      label: canal.label,
      total: canal.total,
      success: canal.success,
      declined: canal.declined,
      instance: canal.instance,
      refund: canal.refund,
      amount: canal.amount,
      successRate: canal.successRate,
      share: canal.share,
    })),
    hourly: input.hourly,
  };

  if (generateStructured) {
    try {
      const brief = await generateStructured(
        {
          system: DECK_BRIEF_SYSTEM_PROMPT,
          prompt: `${DECK_BRIEF_PROMPT_PREFIX}${JSON.stringify(payload)}`,
          maxTokens: 1600,
          temperature: 0.15,
        },
        TelecomDeckBriefSchema,
      );
      return { brief, source: "ai" };
    } catch (err) {
      console.warn("[telecom deck] offline AI brief failed, using local brief", err);
    }
  }

  return { brief: buildFallbackBrief(input), source: "local" };
}
