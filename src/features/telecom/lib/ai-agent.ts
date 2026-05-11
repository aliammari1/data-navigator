/**
 * Edge / offline AI agent for telecom analytics.
 * Uses @huggingface/transformers (WebGPU/WASM) — zero network calls at inference.
 *
 * Two layers:
 *   - Heuristic rules (fast, always available) compute insights from KPIs.
 *   - LLM layer (optional, lazy-loaded) generates natural language commentary
 *     and translates user questions into one of a fixed action set the UI
 *     already supports — never executes raw SQL from the model.
 */

"use client";

import * as ss from "simple-statistics";
import { chat, isLoaded, loadLLM } from "@/features/agent-canvas/core/llm";
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

const DEFAULT_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";

let _modelReady = false;

export async function ensureModel(
  onProgress?: (p: number, t: string) => void,
  modelId: string = DEFAULT_MODEL,
): Promise<void> {
  if (isLoaded()) {
    _modelReady = true;
    return;
  }
  await loadLLM(modelId, onProgress);
  _modelReady = true;
}

export function modelReady(): boolean {
  return _modelReady;
}

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

const SYSTEM = `Tu es l'agent télécom d'un dashboard de recharges. Tu as accès aux KPI agrégés.
- Réponds en français, court (<= 4 phrases).
- N'invente jamais de chiffres. Cite uniquement ceux fournis.
- Si l'utilisateur demande une action UI possible (anomalies, top abonnés, sous-statuts, comparaison, brands), termine par "INTENT: <action>".
Actions valides: show_anomalies, show_top_accounts:amount, show_top_accounts:count, show_sub_status, compare_periods, show_brands, explain_kpi.`;

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

function parseIntent(raw: string): AgentIntent | null {
  const m = raw.match(/INTENT:\s*([a-z_]+)(?::([a-z_]+))?/i);
  if (!m) return null;
  const k = m[1].toLowerCase();
  const arg = m[2]?.toLowerCase();
  switch (k) {
    case "show_anomalies":
      return { kind: "show_anomalies" };
    case "show_top_accounts":
      return {
        kind: "show_top_accounts",
        by: arg === "count" ? "count" : "amount",
      };
    case "show_sub_status":
      return { kind: "show_sub_status", parent: arg };
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

export async function askAgent(
  question: string,
  ctx: AgentContext,
): Promise<AgentAnswer> {
  if (!_modelReady && !isLoaded()) {
    return {
      text: "Modèle local non chargé. Cliquez 'Charger l'IA' pour activer le mode IA. Sans modèle, l'analyse heuristique reste disponible.",
      intent: null,
    };
  }
  const summary = summarizeContext(ctx);
  const raw = await chat(
    SYSTEM,
    `Données :\n${summary}\n\nQuestion : ${question}`,
    { maxTokens: 220, temperature: 0.05 },
  );
  return {
    text: raw.replace(/INTENT:\s*[a-z_]+(?::[a-z_]+)?/i, "").trim(),
    intent: parseIntent(raw),
  };
}

export async function generateNarrative(ctx: AgentContext): Promise<string> {
  if (!_modelReady && !isLoaded()) {
    const ins = computeRuleInsights(ctx);
    return ins.map((i) => `• ${i.title} — ${i.body}`).join("\n");
  }
  const summary = summarizeContext(ctx);
  return chat(
    "Tu es l'analyste télécom. Rédige un résumé exécutif (4 phrases max) en français.",
    `Données :\n${summary}\n\nRédige.`,
    { maxTokens: 200, temperature: 0.1 },
  );
}
