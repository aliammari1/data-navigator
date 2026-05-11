import type { AgentMeshLLMClient } from "@/features/agent-mesh/core/llm-client";
import type {
  BlackboardState,
  DecisionLane,
} from "@/features/agent-mesh/core/types";

// ── Prompt builder ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a concise telecom business analyst. Given query results, produce insights in EXACTLY this format — no other text:

HEADLINE: <one sentence executive summary of the most important finding>
FINDING1: <key finding 1, under 20 words>
FINDING2: <key finding 2, under 20 words>
FINDING3: <key finding 3, under 20 words>
ACTION1: <recommended action 1, under 15 words>
ACTION2: <recommended action 2, under 15 words>`;

function buildUserPrompt(state: BlackboardState, objective: string): string {
  const kpi = state.telecom.kpi;
  const items = state.evidence.items.slice(0, 8);

  const kpiBlock = kpi
    ? `Success rate: ${kpi.successRate.toFixed(2)}%
Total transactions: ${kpi.totalTransactions.toLocaleString()}
Declined: ${kpi.declinedCount.toLocaleString()}
Unique customers: ${kpi.uniqueCustomers.toLocaleString()}`
    : "No KPI data available.";

  const findingsBlock =
    items.length > 0
      ? items
          .map(
            (e, i) =>
              `${i + 1}. [${e.severity.toUpperCase()}] ${e.title}: ${e.claim}`,
          )
          .join("\n")
      : "No findings yet.";

  return `QUESTION: ${objective}
${state.dataset.activeTable ? `TABLE: ${state.dataset.activeTable}` : ""}

METRICS:
${kpiBlock}

FINDINGS:
${findingsBlock}

Respond with HEADLINE, FINDING1, FINDING2, FINDING3, ACTION1, ACTION2 only.`;
}

// ── Output parser ─────────────────────────────────────────────────────────────

function parseOutput(text: string): Partial<DecisionLane> {
  const get = (key: string): string => {
    const match = text.match(
      new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Z]+:|$)`, "s"),
    );
    return match ? match[1].trim().replace(/\n/g, " ") : "";
  };

  const headline = get("HEADLINE");
  const findings = [get("FINDING1"), get("FINDING2"), get("FINDING3")].filter(
    Boolean,
  );
  const actions = [get("ACTION1"), get("ACTION2")].filter(Boolean);

  return { headline: headline || undefined, findings, actions };
}

// ── Main synthesis entry ──────────────────────────────────────────────────────

export async function synthesizeWithLLM(
  state: BlackboardState,
  objective: string,
  llm: AgentMeshLLMClient,
  onStream?: (partial: string) => void,
): Promise<Partial<DecisionLane>> {
  if (!llm.isReady()) return {};

  const systemPrompt = SYSTEM_PROMPT;
  const userPrompt = buildUserPrompt(state, objective);

  let fullText = "";

  await llm.infer(
    systemPrompt,
    userPrompt,
    (chunk) => {
      fullText += chunk;
      onStream?.(fullText);
    },
    400,
  );

  return parseOutput(fullText);
}
