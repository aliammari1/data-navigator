/**
 * Edge / offline AI agent for telecom analytics.
 *
 * Inference routes through the unified offline provider registry
 * (`@/platform/ai/provider`) — llamacpp grammar-constrained JSON in Electron,
 * transformers.js WASM in the browser. Zero network calls at inference.
 *
 * Two layers:
 *   - Heuristic rules (fast, always available) compute insights from KPIs.
 *   - LLM layer (optional) generates natural-language commentary and translates
 *     user questions into one of a fixed action set the UI already supports —
 *     never executes raw SQL from the model. The intent is returned as a
 *     schema-validated field (no regex parsing).
 *
 * The LLM functions take dependency-injected `generate` / `generateStructured`
 * callbacks so this stays a hook-free lib; components bind them from `useAI()`.
 */

"use client";

import * as ss from "simple-statistics";
import { type ZodType, z } from "zod";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import type {
  PeriodKPI,
  RowAnomaly,
  SubStatusRow,
  TopAccountRow,
} from "@/features/telecom/lib/period-queries";

export interface AgentInsight {
  id: string;
  severity: "critical" | "warning" | "info" | "positive";
  title: string;
  body: string;
  source: "rule" | "llm";
}

export interface AgentContext {
  dateFrom: string;
  dateTo: string;
  kpi: PeriodKPI | null;
  subStatus: SubStatusRow[];
  topAccounts: TopAccountRow[];
  anomalies: RowAnomaly[];
}

/** `useAI().generate` — bound to the active offline provider. */
export type AgentGenerate = (req: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}) => Promise<{ text: string }>;

/** `useAI().generateStructured` — bound to the active offline provider. */
export type AgentGenerateStructured = <T>(
  req: {
    system?: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  },
  schema: ZodType<T>,
) => Promise<T>;

// ─── Rule-based insights (always offline, no model needed) ────────────────────

export function computeRuleInsights(ctx: AgentContext): AgentInsight[] {
  const out: AgentInsight[] = [];
  const { kpi, subStatus, topAccounts, anomalies } = ctx;
  if (!kpi || kpi.total === 0) return out;

  if (kpi.successRate < 80) {
    out.push({
      id: "low-success",
      severity: "critical",
      title: `Taux de réussite bas (${fmtPct(kpi.successRate)})`,
      body: `${fmtN(kpi.declined)} échecs sur ${fmtN(kpi.total)} transactions. Investiguer les codes DCL/DCT/DCA dominants.`,
      source: "rule",
    });
  } else if (kpi.successRate >= 95) {
    out.push({
      id: "high-success",
      severity: "positive",
      title: `Excellent taux (${fmtPct(kpi.successRate)})`,
      body: `Pipeline stable : ${fmtN(kpi.success)} réussites, montant ${fmtAmount(kpi.amount)} TND.`,
      source: "rule",
    });
  }

  const instanceShare = kpi.total > 0 ? (kpi.instance / kpi.total) * 100 : 0;
  if (instanceShare > 5) {
    out.push({
      id: "stuck-instance",
      severity: "warning",
      title: `${fmtPct(instanceShare)} en Instance (Hold/Doubt)`,
      body: `${fmtN(kpi.instance)} transactions bloquées. Voir le détail HLD/TPP/DBT pour relance.`,
      source: "rule",
    });
  }

  const refundShare = kpi.total > 0 ? (kpi.refund / kpi.total) * 100 : 0;
  if (refundShare > 2) {
    out.push({
      id: "high-refund",
      severity: "warning",
      title: `${fmtPct(refundShare)} d'annulations`,
      body: `${fmtN(kpi.refund)} remboursements — vérifier les canaux exposés.`,
      source: "rule",
    });
  }

  // Sub-status concentration
  if (subStatus.length > 0) {
    const declined = subStatus
      .filter((s) => s.parent === "DECLINED")
      .sort((a, b) => b.count - a.count);
    if (declined[0] && declined[0].count > 0) {
      out.push({
        id: "top-decline-code",
        severity: "info",
        title: `Code échec dominant : ${declined[0].code}`,
        body: `${fmtN(declined[0].count)} occurrences (${fmtPct(declined[0].share)} du total).`,
        source: "rule",
      });
    }
  }

  // Anomaly detector summary
  if (anomalies.length > 0) {
    const worst = anomalies[0];
    out.push({
      id: "anomaly-top",
      severity: anomalies.length > 5 ? "critical" : "warning",
      title: `${anomalies.length} anomalie(s) détectées`,
      body: `Pire cas : ${worst.canal} à ${String(worst.hour).padStart(2, "0")}h — ${worst.reason}.`,
      source: "rule",
    });
  }

  // Top account concentration (fraud / power-user signal)
  if (topAccounts.length >= 5) {
    const top5 = topAccounts.slice(0, 5);
    const top5Total = top5.reduce((a, t) => a + t.amount, 0);
    if (kpi.amount > 0 && top5Total / kpi.amount > 0.5) {
      out.push({
        id: "concentration",
        severity: "warning",
        title: "Forte concentration : top 5 = >50% du montant",
        body: `Top abonnés cumulent ${fmtAmount(top5Total)} TND sur ${fmtAmount(kpi.amount)}. Risque de dépendance / contrôle.`,
        source: "rule",
      });
    }
  }

  // Outlier amounts via simple stats
  if (topAccounts.length >= 4) {
    const amounts = topAccounts.map((t) => t.amount).filter((v) => v > 0);
    if (amounts.length >= 4) {
      const m = ss.mean(amounts);
      const sd = ss.sampleStandardDeviation(amounts);
      if (sd > 0) {
        const tops = topAccounts.filter((t) => (t.amount - m) / sd > 3);
        if (tops[0]) {
          out.push({
            id: "outlier-amount",
            severity: "info",
            title: `Outlier : ${tops[0].msisdn}`,
            body: `Montant z=${((tops[0].amount - m) / sd).toFixed(1)} — ${fmtAmount(tops[0].amount)} TND vs moyenne ${fmtAmount(m)}.`,
            source: "rule",
          });
        }
      }
    }
  }

  return out;
}

// ─── LLM layer (optional) ─────────────────────────────────────────────────────

export interface AgentAnswer {
  text: string;
  intent: AgentIntent | null;
}

export type AgentIntent =
  | { kind: "show_anomalies" }
  | { kind: "show_top_accounts"; by: "amount" | "count" }
  | { kind: "show_sub_status"; parent?: string }
  | { kind: "compare_periods" }
  | { kind: "show_brands" }
  | { kind: "explain_kpi" };

/**
 * Schema-validated agent answer: the model returns a short text reply plus an
 * optional UI action drawn from a fixed enum. Because the provider produces this
 * via grammar-constrained decoding, no regex parsing of an "INTENT:" suffix is
 * needed — the action is a real, validated field.
 */
const AgentAnswerSchema = z.object({
  reply: z.string(),
  action: z
    .enum([
      "none",
      "show_anomalies",
      "show_top_accounts_amount",
      "show_top_accounts_count",
      "show_sub_status",
      "compare_periods",
      "show_brands",
      "explain_kpi",
    ])
    .default("none"),
});
type AgentAnswerJson = z.infer<typeof AgentAnswerSchema>;

function actionToIntent(action: AgentAnswerJson["action"]): AgentIntent | null {
  switch (action) {
    case "show_anomalies":
      return { kind: "show_anomalies" };
    case "show_top_accounts_amount":
      return { kind: "show_top_accounts", by: "amount" };
    case "show_top_accounts_count":
      return { kind: "show_top_accounts", by: "count" };
    case "show_sub_status":
      return { kind: "show_sub_status" };
    case "compare_periods":
      return { kind: "compare_periods" };
    case "show_brands":
      return { kind: "show_brands" };
    case "explain_kpi":
      return { kind: "explain_kpi" };
    default:
      return null;
  }
}

const SYSTEM = `Tu es l'agent télécom d'un dashboard de recharges. Tu as accès aux KPI agrégés.
- Réponds en français, court (<= 4 phrases) dans le champ "reply".
- N'invente jamais de chiffres. Cite uniquement ceux fournis.
- Si l'utilisateur demande une action UI possible, renseigne le champ "action"
  avec l'une des valeurs: show_anomalies, show_top_accounts_amount,
  show_top_accounts_count, show_sub_status, compare_periods, show_brands,
  explain_kpi. Sinon, mets "none".`;

function summarizeContext(ctx: AgentContext): string {
  const k = ctx.kpi;
  if (!k) return "Aucune donnée chargée.";
  const lines = [
    `Période: ${ctx.dateFrom} → ${ctx.dateTo}`,
    `Total: ${fmtN(k.total)} | Réussite: ${fmtPct(k.successRate)} (${fmtN(k.success)})`,
    `Échec: ${fmtN(k.declined)} | Annulation: ${fmtN(k.refund)} | Instance: ${fmtN(k.instance)}`,
    `Montant: ${fmtAmount(k.amount)} TND | Moyen: ${fmtAmount(k.avgAmount)} TND`,
    `Abonnés uniques: ${fmtN(k.uniqueCustomers)} | Brands actifs: ${fmtN(k.uniqueBrands)}`,
    `Anomalies détectées: ${ctx.anomalies.length}`,
  ];
  if (ctx.subStatus.length > 0) {
    const top3 = ctx.subStatus.slice(0, 3).map((s) => `${s.code}=${s.count}`);
    lines.push(`Top sous-statuts: ${top3.join(", ")}`);
  }
  if (ctx.topAccounts.length > 0) {
    lines.push(
      `Top abonné: ${ctx.topAccounts[0].msisdn} (${fmtAmount(ctx.topAccounts[0].amount)} TND)`,
    );
  }
  return lines.join("\n");
}

/**
 * Translate a user question into a short reply + UI intent, grounded in the
 * aggregated context. Routes through the offline provider via the injected
 * `generateStructured`. When no generator is supplied (provider not ready),
 * returns a heuristic prompt so the rule-based panel stays useful.
 */
export async function askAgent(
  question: string,
  ctx: AgentContext,
  generateStructured?: AgentGenerateStructured,
): Promise<AgentAnswer> {
  if (!generateStructured) {
    return {
      text: "Modèle IA non disponible. L'analyse heuristique (règles) reste active ci-dessus.",
      intent: null,
    };
  }

  const summary = summarizeContext(ctx);
  try {
    const json = await generateStructured(
      {
        system: SYSTEM,
        prompt: `Données :\n${summary}\n\nQuestion : ${question}`,
        maxTokens: 260,
        temperature: 0.05,
      },
      AgentAnswerSchema,
    );
    return { text: json.reply.trim(), intent: actionToIntent(json.action) };
  } catch (err) {
    console.warn("[TelecomAgent] askAgent failed, heuristic fallback", err);
    return {
      text: "L'IA n'a pas pu répondre. Consultez les insights heuristiques ci-dessus.",
      intent: null,
    };
  }
}

/**
 * Executive narrative. Uses the offline provider via injected `generate`; falls
 * back to a deterministic rule-insight digest when no generator is available.
 */
export async function generateNarrative(
  ctx: AgentContext,
  generate?: AgentGenerate,
): Promise<string> {
  if (!generate) {
    const ins = computeRuleInsights(ctx);
    return ins.map((i) => `• ${i.title} — ${i.body}`).join("\n");
  }
  const summary = summarizeContext(ctx);
  try {
    const { text } = await generate({
      system:
        "Tu es l'analyste télécom. Rédige un résumé exécutif (4 phrases max) en français, fondé uniquement sur les chiffres fournis.",
      prompt: `Données :\n${summary}\n\nRédige.`,
      maxTokens: 220,
      temperature: 0.1,
    });
    return text.trim();
  } catch (err) {
    console.warn("[TelecomAgent] generateNarrative failed, rule digest", err);
    const ins = computeRuleInsights(ctx);
    return ins.map((i) => `• ${i.title} — ${i.body}`).join("\n");
  }
}
