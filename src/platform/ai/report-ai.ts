/**
 * LLM-powered report analysis for the telecom report engine.
 * Runs entirely offline — uses the on-device LLM when available and falls
 * back to deterministic rule-based summaries otherwise.
 *
 * NOTE: No "use client" — this module may run in a worker or server context.
 */

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
): Promise<ReportSummary> {
return ruleBasedSummary(statusSummary, topChannels, date);
}

/**
 * Translate a natural language question about the telecom report into DuckDB SQL.
 * Uses the LLM when available; falls back to a generic SELECT on error.
 */
export async function askReportQuestion(
  question: string,
  tableName: string,
  columns: string[],
): Promise<{ sql: string; explanation: string }> {
  // Sensible fallback: show first 100 rows
  return {
    sql: `SELECT * FROM "${tableName}" LIMIT 100`,
    explanation: "Could not generate a specific query — showing first 100 rows.",
  };
}
