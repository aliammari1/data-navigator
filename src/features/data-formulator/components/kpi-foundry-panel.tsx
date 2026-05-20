"use client";

import { AlertTriangle, BarChart3, Loader2, Plus, Search, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/utils";
import { KpiContractCard } from "./kpi-contract-card";
import { createKpiContract, type KpiContract } from "@/features/data-formulator/core/kpi/kpi-contract";
import { useKpiCatalogStore } from "@/features/data-formulator/core/kpi/kpi-catalog-store";
import { validateKpiSql } from "@/features/data-formulator/core/kpi/kpi-validator";
import type { ColumnInfo } from "@/features/data-formulator/core/types";
import { generateWithOllamaStructured } from "@/features/data-formulator/core/ollama-provider";
import { KpiDraftJsonSchema, validateSchema } from "@/features/data-formulator/core/ai-schemas";
import { safeJsonStringify } from "@/features/data-formulator/core/json";
import { checkAiGate, isAiReady } from "@/features/data-formulator/core/ai-gate";
import type { AiGateResult } from "@/features/data-formulator/core/ai-gate";
import { useFormulatorStore } from "@/features/data-formulator/store";

interface KpiFoundryPanelProps {
  tableName: string;
  columns: ColumnInfo[];
  aiGate: AiGateResult | null;
}

export function KpiFoundryPanel({ tableName, columns, aiGate }: KpiFoundryPanelProps) {
  const kpis = useKpiCatalogStore((s) => s.kpis);
  const filterStatus = useKpiCatalogStore((s) => s.filterStatus);
  const setFilterStatus = useKpiCatalogStore((s) => s.setFilterStatus);
  const searchQuery = useKpiCatalogStore((s) => s.searchQuery);
  const setSearchQuery = useKpiCatalogStore((s) => s.setSearchQuery);
  const addKpi = useKpiCatalogStore((s) => s.addKpi);
  const selectedModel = useFormulatorStore((s) => s.selectedModel);
  const ollamaHost = useFormulatorStore((s) => s.settings.ollamaHost);

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiReady =
    isAiReady(aiGate) &&
    aiGate.selectedModel === selectedModel &&
    aiGate.host === (ollamaHost.trim() || "http://localhost:11434");

  const filtered = kpis.filter((k) => {
    const matchesStatus = filterStatus === "all" || k.reviewStatus === filterStatus;
    const matchesSearch = !searchQuery || k.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  async function handleGenerate() {
    if (!prompt.trim()) return;
    const freshGate = await checkAiGate({
      host: ollamaHost,
      selectedModel,
    });

    if (!isAiReady(freshGate)) {
      setError(freshGate.message);
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const columnPreview = columns
        .slice(0, 40)
        .map((c) => `${c.name}:${c.dbType ?? c.type}`)
        .join(", ");

      const result = await generateWithOllamaStructured(
        freshGate.selectedModel,
        [
          "You are Moudir AI KPI Foundry. Extract a KPI definition from the user's request.",
          "You understand Tunisian Arabic, French, English, and Arabizi.",
          "Return valid JSON matching the KPI schema exactly.",
          "Do not invent numbers. Use only the provided columns.",
        ].join("\n"),
        safeJsonStringify({
          userPrompt: prompt,
          tableName,
          columns: columnPreview,
        }),
        KpiDraftJsonSchema,
        { host: freshGate.host, temperature: 0 },
      );

      const validated = validateSchema<{
        name: string;
        goal: string;
        numerator: string;
        denominator: string;
        exclusions: string[];
        timeGrain: string;
        segments: string[];
        owner: string;
        sql: string;
        confidence: "high" | "medium" | "low";
        assumptions: string[];
        edgeCases: string[];
      }>(result, ["name", "goal", "numerator", "timeGrain", "sql", "confidence", "assumptions"]);

      if (!validated.valid) {
        setError(`AI returned invalid KPI schema: ${validated.error}`);
        return;
      }

      const draft = validated.data;

      // Validate SQL
      const sqlValidation = await validateKpiSql(draft.sql, tableName, columns);
      if (!sqlValidation.valid) {
        setError(
          `KPI SQL validation failed: ${sqlValidation.error ?? "Unknown SQL error"}`,
        );
        return;
      }

      const contract = createKpiContract({
        name: draft.name,
        goal: draft.goal,
        numerator: draft.numerator,
        denominator: draft.denominator || "1",
        exclusions: draft.exclusions || [],
        timeGrain: (draft.timeGrain as KpiContract["timeGrain"]) || "day",
        segments: draft.segments || [],
        owner: draft.owner || "",
        reviewStatus: "draft",
        sql: draft.sql,
        confidence: draft.confidence || "medium",
        assumptions: draft.assumptions || [],
        edgeCases: draft.edgeCases || [],
        fieldsUsed: sqlValidation.fieldsDetected,
        sampleResult: sqlValidation.sampleResult
          ? {
              value: Number(Object.values(sqlValidation.sampleResult)[0]) || 0,
              label: Object.keys(sqlValidation.sampleResult)[0] || "value",
            }
          : undefined,
      });

      addKpi(contract);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
          <BarChart3 className="h-4 w-4 text-amber-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">KPI Foundry</h2>
          <p className="text-xs text-muted-foreground">Define and approve custom metrics</p>
        </div>
      </div>

      {/* Generate */}
      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="Describe a KPI in any language..."
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-amber-500/30 focus:outline-none"
        />
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim() || !aiReady}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium",
            generating || !prompt.trim() || !aiReady
              ? "border border-white/5 bg-white/5 text-muted-foreground"
              : "border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
          )}
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          Generate
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search KPIs..."
            className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-white/20 focus:outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-foreground focus:outline-none"
        >
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* List */}
      <div className="flex-1 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-xs text-muted-foreground">No KPIs yet. Generate one above.</p>
          </div>
        ) : (
          filtered.map((kpi) => <KpiContractCard key={kpi.id} kpi={kpi} />)
        )}
      </div>
    </div>
  );
}
