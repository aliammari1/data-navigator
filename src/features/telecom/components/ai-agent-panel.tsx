"use client";

import { AlertTriangle, Brain, Cpu, MessageSquare, Send, Sparkles, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type AgentContext,
  type AgentInsight,
  type AgentIntent,
  askAgent,
  computeRuleInsights,
  generateNarrative,
} from "@/features/telecom/lib/ai-agent";
import {
  fetchAnomalies,
  fetchPeriodKPI,
  fetchSubStatusBreakdown,
  fetchTopAccounts,
} from "@/features/telecom/lib/period-queries";
import type { ColumnMapping } from "@/features/telecom/types";
import { useAI } from "@/platform/ai/provider";

export function AiAgentPanel({
  table,
  mapping,
  dateFrom,
  dateTo,
  onIntent,
}: Readonly<{
  table: string;
  mapping: ColumnMapping;
  dateFrom: string;
  dateTo: string;
  onIntent?: (intent: AgentIntent) => void;
}>) {
  const ai = useAI();
  const [ctx, setCtx] = useState<AgentContext | null>(null);
  const [insights, setInsights] = useState<AgentInsight[]>([]);
  const [narrative, setNarrative] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // Derived model state from the unified provider runtime (warms on first use).
  const model = {
    loading: ai.progress.status === "loading",
    progress: ai.progress.status === "loading" ? (ai.progress.progress ?? 0) / 100 : 1,
    text: ai.progress.message ?? "",
    ready: ai.progress.status === "ready" || ai.progress.status === "inferring",
  };
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{
    text: string;
    intent: AgentIntent | null;
  } | null>(null);
  const [chatBusy, setChatBusy] = useState(false);

  const buildContext = async (): Promise<AgentContext | null> => {
    if (!table || !dateFrom || !dateTo) return null;
    setBusy(true);
    try {
      const [kpi, sub, top, anom] = await Promise.all([
        fetchPeriodKPI(table, mapping, dateFrom, dateTo),
        fetchSubStatusBreakdown(table, mapping, dateFrom, dateTo),
        fetchTopAccounts(table, mapping, dateFrom, dateTo, 10, "amount"),
        fetchAnomalies(table, mapping, dateFrom, dateTo),
      ]);
      const next: AgentContext = {
        dateFrom,
        dateTo,
        kpi,
        subStatus: sub,
        topAccounts: top,
        anomalies: anom,
      };
      setCtx(next);
      setInsights(computeRuleInsights(next));
      return next;
    } finally {
      setBusy(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset generated agent context when the selected table/date window changes
  useEffect(() => {
    setCtx(null);
    setInsights([]);
    setNarrative("");
    setAnswer(null);
  }, [table, dateFrom, dateTo]);

  const loadModel = async () => {
    try {
      // Warm the selected offline model; progress flows through ai.progress.
      await ai.ensureReady();
    } catch (e) {
      console.error("[TelecomAgent] model warm failed", e);
    }
  };

  const runNarrative = async () => {
    const final = ctx ?? (await buildContext());
    if (!final) {
      return;
    }
    setBusy(true);
    try {
      const txt = await generateNarrative(final, model.ready ? ai.generate : undefined);
      setNarrative(txt);
    } finally {
      setBusy(false);
    }
  };

  const submitQuestion = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const c = ctx ?? (await buildContext());
    if (!c) return;
    setChatBusy(true);
    const ans = await askAgent(q.trim(), c, model.ready ? ai.generateStructured : undefined);
    setAnswer(ans);
    if (ans.intent) onIntent?.(ans.intent);
    setChatBusy(false);
  };

  const sevColor = (s: AgentInsight["severity"]) =>
    s === "critical"
      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
      : s === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
        : s === "positive"
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Brain className="w-3.5 h-3.5 text-violet-500" />
        <span className="text-xs font-semibold">Agent IA · 100% offline</span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-2">
          <WifiOff className="w-3 h-3" /> aucune requête réseau à l'inférence
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${
              model.ready
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-border text-muted-foreground"
            }`}
          >
            <Cpu className="w-3 h-3" />
            {model.ready ? "modèle prêt" : "rules-only"}
          </span>
          {!model.ready && (
            <button
              type="button"
              onClick={loadModel}
              disabled={model.loading}
              className="h-6 px-2 rounded text-[10px] font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
            >
              {model.loading ? "Chargement…" : "Charger l'IA"}
            </button>
          )}
        </div>
      </div>

      {model.loading && (
        <div className="px-4 py-2 border-b border-border bg-violet-50/40 dark:bg-violet-500/5">
          <div className="text-[10px] text-violet-700 dark:text-violet-300 mb-1">{model.text}</div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all"
              style={{ width: `${Math.max(2, model.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={buildContext}
            disabled={busy}
            className="h-7 px-2 rounded-md text-[11px] font-medium border border-border hover:bg-muted disabled:opacity-50 flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" /> Analyser maintenant
          </button>
          <button
            type="button"
            onClick={runNarrative}
            disabled={busy}
            className="h-7 px-2 rounded-md text-[11px] font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 flex items-center gap-1"
          >
            <MessageSquare className="w-3 h-3" /> Résumé exécutif
          </button>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {ctx
              ? `Contexte: ${dateFrom} → ${dateTo}`
              : "Cliquez analyser pour charger le contexte"}
          </span>
        </div>

        {insights.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {insights.map((ins) => (
              <div key={ins.id} className={`rounded-xl border px-3 py-2 ${sevColor(ins.severity)}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  <div className="text-[11px] font-semibold leading-tight">{ins.title}</div>
                </div>
                <div className="text-[10px] opacity-80 leading-relaxed">{ins.body}</div>
              </div>
            ))}
          </div>
        )}

        {narrative && (
          <div className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-500/5 px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3 h-3 text-violet-500" />
              <span className="text-[10px] uppercase font-bold text-violet-700 dark:text-violet-300">
                Résumé exécutif IA
              </span>
            </div>
            <div className="text-xs text-foreground leading-relaxed whitespace-pre-line">
              {narrative}
            </div>
          </div>
        )}

        <form onSubmit={submitQuestion} className="flex items-center gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Posez une question (ex: pourquoi le taux baisse ?)"
            className="flex-1 h-8 px-2 rounded-md border border-border bg-background text-xs"
          />
          <button
            type="submit"
            disabled={chatBusy || !q.trim()}
            className="h-8 px-3 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            {chatBusy ? "…" : "Demander"}
          </button>
        </form>

        {answer && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="text-xs text-foreground leading-relaxed whitespace-pre-line">
              {answer.text}
            </div>
            {answer.intent && (
              <div className="text-[10px] text-primary mt-1">
                Action suggérée → {answer.intent.kind}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
