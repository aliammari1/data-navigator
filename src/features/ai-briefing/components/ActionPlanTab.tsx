"use client";

import { CheckSquare, Download, Flag, RefreshCw, Sparkles, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAI } from "@/platform/ai/provider";
import { getExportProxy, saveBytes } from "@/platform/viz";
import { cn } from "@/shared/utils";
import type { TableSection } from "@/workers/export-types";
import type { BriefingContext } from "../core/briefing-context";
import { buildActionPlanPrompt } from "../core/briefing-prompts";
import { ActionPlanSchema } from "../core/briefing-schemas";
import { type ActionPlanItem, useBriefingStore } from "../store/briefing-store";

function priorityStyle(p: number): { badge: string; label: string } {
  const map: Record<number, { badge: string; label: string }> = {
    1: { badge: "bg-red-500/20 text-red-300 border-red-500/30", label: "CRITICAL" },
    2: { badge: "bg-orange-500/20 text-orange-300 border-orange-500/30", label: "HIGH" },
    3: { badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", label: "MEDIUM" },
    4: { badge: "bg-blue-500/20 text-blue-300 border-blue-500/30", label: "LOW" },
    5: { badge: "bg-muted text-muted-foreground border-border", label: "INFO" },
  };
  return map[p] ?? map[5];
}

const ActionRow = memo(function ActionRow({
  item,
  index,
  animate,
  onToggle,
}: {
  item: ActionPlanItem;
  index: number;
  animate: boolean;
  onToggle: (id: string) => void;
}) {
  const style = priorityStyle(item.priority);
  return (
    <motion.div
      initial={animate ? { opacity: 0, x: -8 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={animate ? { delay: Math.min(index, 8) * 0.05 } : undefined}
      className={cn(
        "flex gap-3 rounded-lg border bg-card/60 p-4 transition-opacity",
        item.completed && "opacity-50",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary"
        aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
      >
        {item.completed ? (
          <CheckSquare className="size-5 text-emerald-400" />
        ) : (
          <Square className="size-5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-2">
          <Badge className={cn("shrink-0 text-xs", style.badge)}>
            P{item.priority} — {style.label}
          </Badge>
          <span className={cn("text-sm font-medium", item.completed && "line-through")}>
            {item.action}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{item.rationale}</p>
        {item.estimatedImpact && (
          <div className="mt-2">
            <Badge variant="outline" className="text-xs">
              {item.estimatedImpact}
            </Badge>
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default function ActionPlanTab({ context }: { context: BriefingContext }) {
  const { actionPlanItems, addActionItems, toggleActionItem, clearActionPlan, saveBriefing } =
    useBriefingStore();
  const ai = useAI();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<null | "pdf" | "docx">(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const generatePlan = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const { system, prompt } = buildActionPlanPrompt(context);
      const plan = await ai.generateStructured(
        { system, prompt, maxTokens: 700, temperature: 0.3 },
        ActionPlanSchema,
      );
      const items = plan.items.map((item) => ({
        priority: item.priority as ActionPlanItem["priority"],
        category: item.category,
        action: item.action,
        rationale: item.rationale,
        estimatedImpact: item.estimatedImpact,
      }));
      addActionItems(items);
      const textVersion = items
        .map(
          (item) =>
            `[Priority ${item.priority}] ${item.action}\nRationale: ${item.rationale}\nImpact: ${item.estimatedImpact}`,
        )
        .join("\n\n");
      saveBriefing(textVersion, "action");
    } catch (err) {
      setError(
        err instanceof Error
          ? "The model did not return a valid action plan. Please try again."
          : "Action plan generation failed.",
      );
    } finally {
      setGenerating(false);
    }
  }, [context, ai, addActionItems, saveBriefing]);

  // Sort without mutating store state during render.
  const sortedItems = useMemo(
    () => [...actionPlanItems].sort((a, b) => a.priority - b.priority),
    [actionPlanItems],
  );

  const completedCount = useMemo(
    () => actionPlanItems.filter((i) => i.completed).length,
    [actionPlanItems],
  );

  // Branded export: the action plan rendered as a real table (PDF / DOCX),
  // generated off the main thread in the export worker and saved via saveBytes.
  const exportPlan = useCallback(
    async (kind: "pdf" | "docx") => {
      if (sortedItems.length === 0) return;
      setExporting(kind);
      setExportError(null);
      try {
        const exp = getExportProxy();
        if (!exp) throw new Error("Export worker is unavailable in this environment.");
        const section: TableSection = {
          title: "Prioritized actions",
          headers: ["#", "Priority", "Action", "Rationale", "Estimated impact", "Status"],
          rows: sortedItems.map((item, i) => [
            i + 1,
            `P${item.priority} ${item.category.toUpperCase()}`,
            item.action,
            item.rationale,
            item.estimatedImpact,
            item.completed ? "Done" : "Open",
          ]),
        };
        const doc = {
          title: "Action Plan",
          subtitle: `${context.datasetName} · ${new Date().toLocaleString("en-GB")}`,
          sections: [section],
          paperSize: "a4" as const,
        };
        const bytes = kind === "pdf" ? await exp.pdf(doc) : await exp.docx(doc);
        const fileName = `action-plan-${context.datasetName}`.replace(/[^\w.-]+/g, "_");
        await saveBytes(bytes, `${fileName}.${kind}`, kind);
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Export failed.");
      } finally {
        setExporting(null);
      }
    },
    [sortedItems, context.datasetName],
  );

  return (
    <div className="space-y-6">
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="size-5 text-violet-400" />
            Prioritized Action Plan
            {actionPlanItems.length > 0 && (
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {completedCount}/{actionPlanItems.length} completed
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={generatePlan} disabled={generating}>
              {generating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate Action Plan
                </>
              )}
            </Button>
            {actionPlanItems.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => exportPlan("pdf")}
                  disabled={exporting !== null}
                >
                  {exporting === "pdf" ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => exportPlan("docx")}
                  disabled={exporting !== null}
                >
                  {exporting === "docx" ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export DOCX
                </Button>
                <Button variant="ghost" size="sm" onClick={clearActionPlan}>
                  Clear
                </Button>
              </>
            )}
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}
          {exportError && <p className="text-sm text-red-300">{exportError}</p>}

          {actionPlanItems.length > 0 && (
            <>
              <Progress value={(completedCount / actionPlanItems.length) * 100} className="h-1.5" />
              <div className="space-y-3">
                <AnimatePresence>
                  {sortedItems.map((item, idx) => (
                    <ActionRow
                      key={item.id}
                      item={item}
                      index={idx}
                      animate={idx < 8}
                      onToggle={toggleActionItem}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
