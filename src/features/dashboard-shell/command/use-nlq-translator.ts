"use client";

import { useCallback } from "react";
import { z } from "zod";
import type { ColMeta } from "@/core/stores/data-store";
import { useAI } from "@/platform/ai/provider";
import { type NLQResult, translateNLQ } from "@/platform/ai/nlq";

/**
 * Grammar-valid structured NL→SQL schema.
 *
 * Fed to `provider.generateStructured(req, schema)` so the JSON comes back valid
 * BY CONSTRUCTION (GBNF grammar derived from this Zod schema) — there is no
 * regex extraction or `JSON.parse` repair loop here. Mirrors `NLQResult` so the
 * rest of the AI panel consumes one shape regardless of which lane produced it.
 */
export const NLQSchema = z.object({
  sql: z.string().describe("A single read-only DuckDB SELECT statement."),
  explanation: z.string().describe("One sentence describing what the query does."),
  confidence: z.enum(["high", "medium", "low"]),
  chartSuggestion: z.enum(["bar", "line", "pie", "scatter", "table", "number"]),
});

export type NLQTranslation = NLQResult & { source: "llm" | "rules" };

function ensureLimit(sql: string, limit = 1000): string {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (/\blimit\s+\d+\s*$/i.test(trimmed)) return trimmed;
  return `${trimmed} LIMIT ${limit}`;
}

function looksReadOnly(sql: string): boolean {
  return (
    /^\s*(?:select|with)\b/i.test(sql) &&
    !/\b(?:insert|update|delete|drop|alter|create|attach|copy|pragma|call)\b/i.test(sql)
  );
}

/**
 * Returns a `translate(question, ctx)` that prefers the grammar-constrained
 * provider lane and falls back to the deterministic pattern matcher.
 *
 * The deterministic matcher (`translateNLQ`) is tried first because it is
 * instant and offline-safe; only genuinely ambiguous ("low" confidence)
 * questions are escalated to the local model, and any model failure degrades
 * gracefully back to the rule-based result rather than surfacing an error.
 */
export function useNlqTranslator() {
  const ai = useAI();

  return useCallback(
    async (
      question: string,
      ctx: { tableName: string; columns: ColMeta[] },
    ): Promise<NLQTranslation> => {
      const ruleBased = translateNLQ(question, ctx);

      // Confident deterministic answers need no model — keep them instant/offline.
      if (ruleBased.confidence !== "low") {
        return { ...ruleBased, source: "rules" };
      }

      try {
        const columnList = ctx.columns
          .map((column) => `${column.name} (${column.type})`)
          .join(", ");

        const structured = await ai.generateStructured(
          {
            system:
              "You translate questions into a single safe read-only DuckDB SELECT. " +
              "Never modify data. Use only the provided columns and table name.",
            prompt:
              `Table: "${ctx.tableName}"\nColumns: ${columnList}\n` +
              `Question: ${question}\n` +
              "Return a read-only SELECT (or WITH ... SELECT) for DuckDB.",
            temperature: 0.1,
            maxTokens: 400,
          },
          NLQSchema,
        );

        if (!structured.sql || !looksReadOnly(structured.sql)) {
          return { ...ruleBased, source: "rules" };
        }

        return {
          sql: ensureLimit(structured.sql),
          explanation: structured.explanation || ruleBased.explanation,
          confidence: structured.confidence,
          chartSuggestion: structured.chartSuggestion,
          source: "llm",
        };
      } catch {
        // Model unavailable / aborted — degrade to the deterministic result.
        return { ...ruleBased, source: "rules" };
      }
    },
    [ai],
  );
}
