"use client";

import { AnimatePresence, motion } from "motion/react";
import { Database, Plus, X } from "lucide-react";
import { safeJsonStringify } from "../core/json";
import { useWorkbenchStore, type CanvasCard } from "../store/workbench-store";

const typeLabel: Record<CanvasCard["type"], string> = {
  chart: "Chart",
  insight: "Insight",
  table: "Table",
  reasoning: "Reasoning",
  kpi: "KPI",
  toolResult: "Tool Result",
  operation: "Operation",
};

function CardDetails({
  card,
  onAttachChart,
}: {
  card: CanvasCard;
  onAttachChart?: (cardId: string) => void;
}) {
  const rowCount = card.tableData?.length ?? card.queryResult?.data.length ?? 0;
  const hasOperationPlan = card.operationPlan !== undefined && card.operationPlan !== null;
  const hasOperationArtifact =
    card.operationArtifact !== undefined && card.operationArtifact !== null;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</div>
        <div className="text-sm text-foreground">{typeLabel[card.type]}</div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Title</div>
        <div className="text-sm text-foreground break-words">{card.title}</div>
      </div>

      {card.sourceQuery && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Source Query</div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-muted-foreground">
            {card.sourceQuery}
          </div>
        </div>
      )}

      {card.agentRole && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent</div>
          <div className="text-sm text-foreground">{card.agentRole}</div>
        </div>
      )}

      {rowCount > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Rows</div>
          <div className="text-sm text-foreground">{rowCount.toLocaleString()}</div>
        </div>
      )}

      {card.chartSpec && (
        <div>
          {onAttachChart && (
            <button
              type="button"
              onClick={() => onAttachChart(card.id)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Attach to telecom page
            </button>
          )}
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Chart Spec</div>
          <pre className="max-h-48 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[10px] text-muted-foreground">
            {safeJsonStringify(card.chartSpec, 2)}
          </pre>
        </div>
      )}

      {card.queryResult?.sql && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">SQL</div>
          <pre className="max-h-32 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[10px] text-emerald-300/80">
            {card.queryResult.sql}
          </pre>
        </div>
      )}

      {hasOperationPlan && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Operation Plan</div>
          <pre className="max-h-48 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[10px] text-muted-foreground">
            {safeJsonStringify(card.operationPlan, 2)}
          </pre>
        </div>
      )}

      {hasOperationArtifact && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Execution</div>
          <pre className="max-h-48 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[10px] text-muted-foreground">
            {safeJsonStringify(card.operationArtifact, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function InspectorPanel({
  onAttachChart,
}: {
  onAttachChart?: (cardId: string) => void;
}) {
  const selectedCardId = useWorkbenchStore((s) => s.selectedCardId);
  const showInspector = useWorkbenchStore((s) => s.showInspector);
  const setShowInspector = useWorkbenchStore((s) => s.setShowInspector);
  const selectCard = useWorkbenchStore((s) => s.selectCard);
  const card = useWorkbenchStore((s) => s.cards.find((c) => c.id === selectedCardId));

  const visible = showInspector && !!card;

  return (
    <AnimatePresence>
      {visible && card && (
        <motion.aside
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          className="fixed right-4 top-16 bottom-24 z-40 w-80 overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f12]/95 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-foreground">Inspector</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowInspector(false);
                selectCard(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="h-full overflow-auto p-4 pb-20">
            <CardDetails card={card} onAttachChart={onAttachChart} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
