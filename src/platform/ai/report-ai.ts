/**
 * LLM-powered report analysis for the telecom report engine.
 * Runs entirely offline — uses the on-device LLM when available and falls
 * back to deterministic rule-based summaries otherwise.
 *
 * NOTE: No "use client" — this module may run in a worker or server context.
 */

/**
 * Injected LLM text-generation callback. Callers bind this to
 * `useAI().generate` (extracting `.text` from the `AIResult`); omitting it
 * keeps this module's public functions fully rule-based.
 */
import { extractJsonBlock, repairJson } from "./provider/structured";

type LLMGenerate = (
  prompt: string,
  opts: { systemPrompt: string; maxTokens: number; temperature: number },
) => Promise<string>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportSummary {
  /** 2-3 sentence human-readable narrative. */
  narrative: string;
  /** Top 3 channels by volume. */
  topChannels: string[];
  /** Warnings / anomalies (up to 3). */
  flags: string[];
  /** One actionable suggestion for the operator. */
  recommendation: string;
}

export interface StatusSummary {
  reussie: number;
  annulation: number;
  instance: number;
  echec: number;
  total: number;
}

export interface ChannelStat {
  canal: string;
  nombre: number;
  montant: number;
}

// ─── Rule-based fallback ──────────────────────────────────────────────────────

function ruleBasedSummary(
  status: StatusSummary,
  topChannels: ChannelStat[],
  date?: string,
): ReportSummary {
  const successRate = status.total > 0 ? ((status.reussie / status.total) * 100).toFixed(1) : "0.0";
  const failRate = status.total > 0 ? ((status.echec / status.total) * 100).toFixed(1) : "0.0";

  const dateLabel = date ? ` on ${date}` : "";
  const narrative =
    `${status.total.toLocaleString()} transactions were processed${dateLabel}, ` +
    `with a success rate of ${successRate}% (${status.reussie.toLocaleString()} successful). ` +
    `${status.echec.toLocaleString()} transactions failed (${failRate}% failure rate).`;

  const channels = topChannels.slice(0, 3).map((c) => c.canal);

  const flags: string[] = [];
  if (status.total > 0 && status.echec / status.total > 0.1) {
    flags.push(`High failure rate: ${failRate}% of transactions failed.`);
  }
  if (status.total > 0 && status.instance / status.total > 0.05) {
    const instancePct = ((status.instance / status.total) * 100).toFixed(1);
    flags.push(`${instancePct}% of transactions are still in-progress (instance state).`);
  }
  if (topChannels.length > 0) {
    const top = topChannels[0];
    const topPct = status.total > 0 ? ((top.nombre / status.total) * 100).toFixed(0) : "0";
    if (parseInt(topPct, 10) > 60) {
      flags.push(
        `Channel "${top.canal}" accounts for ${topPct}% of all transactions — high concentration.`,
      );
    }
  }

  let recommendation =
    "Review declined transactions and investigate root causes to improve the success rate.";
  if (status.echec / (status.total || 1) > 0.15) {
    recommendation =
      "Failure rate exceeds 15%. Escalate to the technical team for urgent investigation.";
  } else if (status.instance / (status.total || 1) > 0.05) {
    recommendation =
      "Several transactions are still pending. Trigger a reconciliation job to clear the backlog.";
  }

  return {
    narrative,
    topChannels: channels,
    flags,
    recommendation,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a narrative report summary from channel stats and status breakdown.
 * Uses the LLM when available; falls back to rule-based summary on error.
 */
export async function generateReportSummary(
  statusSummary: StatusSummary,
  topChannels: ChannelStat[],
  date?: string,
  generateText?: LLMGenerate,
): Promise<ReportSummary> {
  const fallback = ruleBasedSummary(statusSummary, topChannels, date);

  if (!generateText) {
    return fallback;
  }

  try {
    const successRate =
      statusSummary.total > 0
        ? ((statusSummary.reussie / statusSummary.total) * 100).toFixed(1)
        : "0";

    const channelList = topChannels
      .slice(0, 5)
      .map((c) => `${c.canal}: ${c.nombre} txns, ${c.montant.toLocaleString()} amount`)
      .join("; ");

    const userPrompt =
      `Date: ${date ?? "today"}. ` +
      `Total: ${statusSummary.total}, ` +
      `Success: ${statusSummary.reussie} (${successRate}%), ` +
      `Cancellations: ${statusSummary.annulation}, ` +
      `In-progress: ${statusSummary.instance}, ` +
      `Failed: ${statusSummary.echec}. ` +
      `Top channels: ${channelList}.`;

    const raw = await generateText(userPrompt, {
      systemPrompt:
        "You are a telecom analyst. Analyze this daily transaction report and return JSON only — no prose, no markdown fences. Schema: {narrative, topChannels: string[], flags: string[], recommendation}. narrative: 2-3 sentences. topChannels: top 3 channel names. flags: up to 3 warning strings. recommendation: one actionable sentence.",
      maxTokens: 500,
      temperature: 0.3,
    });

    const block = extractJsonBlock(raw);
    let parsed: ReportSummary;
    try {
      parsed = JSON.parse(block ?? raw) as ReportSummary;
    } catch {
      parsed = JSON.parse(repairJson(raw)) as ReportSummary;
    }
    if (!parsed || !parsed.narrative) throw new Error("Missing narrative field");

    return {
      narrative: parsed.narrative,
      topChannels: Array.isArray(parsed.topChannels)
        ? parsed.topChannels.slice(0, 3)
        : fallback.topChannels,
      flags: Array.isArray(parsed.flags) ? parsed.flags.slice(0, 3) : fallback.flags,
      recommendation: parsed.recommendation ?? fallback.recommendation,
    };
  } catch {
    return fallback;
  }
}

/**
 * Translate a natural language question about the telecom report into DuckDB SQL.
 * Uses the LLM when available; falls back to a generic SELECT on error.
 */
export async function askReportQuestion(
  question: string,
  tableName: string,
  columns: string[],
  generateText?: LLMGenerate,
): Promise<{ sql: string; explanation: string }> {
  // Sensible fallback: show first 100 rows
  const fallback = {
    sql: `SELECT * FROM "${tableName}" LIMIT 100`,
    explanation: "Could not generate a specific query — showing first 100 rows.",
  };

  if (!generateText) {
    return fallback;
  }

  try {
    const colList = columns.join(", ");

    const userPrompt =
      `Table: ${tableName}\n` +
      `Columns: ${colList}\n` +
      `Key columns: TRANSACTION_ID, TRANSACTION_DATE, ORIGINAL_AMOUNT, TRANSACTION_STATUS, BRAND_NAME, ACCOUNT_NAME, CHANNEL, NET_DEBIT_AMOUNT_SOURCE, SALES_PERSON\n` +
      `Question: ${question}`;

    const raw = await generateText(userPrompt, {
      systemPrompt:
        "You are a DuckDB SQL expert. Generate a DuckDB-compatible SQL query for the telecom transaction table. Return JSON only — no prose, no markdown fences. Schema: {sql, explanation}. Always include LIMIT 1000 if the query returns rows. Use double quotes for column and table names.",
      maxTokens: 400,
      temperature: 0.2,
    });

    const block = extractJsonBlock(raw);
    let parsed: {
      sql: string;
      explanation: string;
    };
    try {
      parsed = JSON.parse(block ?? raw) as { sql: string; explanation: string };
    } catch {
      parsed = JSON.parse(repairJson(raw)) as { sql: string; explanation: string };
    }
    if (!parsed || !parsed.sql) throw new Error("Missing sql field");

    // Ensure LIMIT 1000 is present
    const trimmed = parsed.sql.trim().replace(/;$/, "");
    const sql = /\bLIMIT\s+\d+/i.test(trimmed) ? trimmed : `${trimmed} LIMIT 1000`;

    return {
      sql,
      explanation: parsed.explanation ?? "",
    };
  } catch {
    return fallback;
  }
}
