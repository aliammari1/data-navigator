"use client";

/**
 * Nexus Agent Orchestration Engine
 * A custom graph-based multi-agent system inspired by 2026 agentic AI patterns.
 * NOT a LangGraph clone — built from scratch with typed state machines,
 * observable execution traces, and agent-to-agent critique loops.
 *
 * Architecture:
 * - AgentNode: executable unit with typed input/output schemas
 * - AgentGraph: directed graph of nodes with conditional edges
 * - AgentTrace: observable execution record
 * - AgentOrchestrator: runtime engine with supervisor pattern
 */

import { safeJsonStringify } from "./json";
import { EDGE_AI_HOST, streamOllamaChat } from "./ollama-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentRole =
  | "supervisor"
  | "dataAnalyst"
  | "chartArchitect"
  | "insightEngineer"
  | "queryOptimizer"
  | "critic"
  | "mcpToolUser";

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  result: unknown;
  error?: string;
}

export interface AgentContext {
  tableName: string;
  columns: Array<{ name: string; type: string; sample?: unknown[] }>;
  schema: string;
  rowSample: Record<string, unknown>[];
  userGoal: string;
  previousOutputs: Record<string, unknown>;
  threadId: string;
}

export interface AgentNodeConfig {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  // Routing: after this node completes, which node next?
  // Can be static string, or a function that returns next node id based on output
  next?: string | ((output: AgentOutput, ctx: AgentContext) => string | null);
  // Parallel execution: run these nodes concurrently after this one
  parallel?: string[];
  // Requires approval before proceeding?
  requiresApproval?: boolean;
  // Max retries on failure
  maxRetries?: number;
}

export interface AgentInput {
  messages: AgentMessage[];
  context: AgentContext;
  previousNodeOutputs?: Record<string, AgentOutput>;
}

export interface AgentOutput {
  nodeId: string;
  role: AgentRole;
  content: string;
  structured?: Record<string, unknown>;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  approved: boolean;
  retryCount: number;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
}

export interface AgentTrace {
  traceId: string;
  threadId: string;
  startedAt: number;
  endedAt?: number;
  status: "running" | "paused" | "completed" | "failed" | "awaiting_approval";
  nodes: AgentTraceNode[];
  currentNodeId?: string;
  finalOutput?: AgentOutput;
  metadata: {
    totalTokens: number;
    totalLatencyMs: number;
    model: string;
  };
}

export interface AgentTraceNode {
  nodeId: string;
  role: AgentRole;
  startedAt: number;
  endedAt?: number;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
  input: AgentInput;
  output?: AgentOutput;
  error?: string;
  childTraces?: AgentTrace[]; // for parallel branches
}

export type TraceUpdateHandler = (trace: AgentTrace) => void;

// ─── System Prompts ───────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<AgentRole, string> = {
  supervisor: `You are the Supervisor agent in a multi-agent data analytics system.
Your job is to understand the user's goal, decompose it into sub-tasks,
and delegate to specialized agents: DataAnalyst, ChartArchitect, InsightEngineer, QueryOptimizer, and Critic.

You MUST output a structured plan in JSON format:
{
  "plan": [
    { "agent": "dataAnalyst", "task": "describe what to analyze" },
    { "agent": "chartArchitect", "task": "describe what charts to build" }
  ],
  "reasoning": "why this plan"
}

Be concise. Focus on decomposition quality.`,

  dataAnalyst: `You are a Data Analyst agent. Given a dataset schema and user goal,
your job is to:
1. Analyze field distributions and relationships
2. Identify key metrics, dimensions, and segments
3. Suggest aggregations and transformations
4. Write DuckDB SQL queries

Output structured JSON:
{
  "analysis": { "keyMetrics": [...], "dimensions": [...], "segments": [...] },
  "sqlQueries": [{ "purpose": "...", "query": "SELECT ..." }],
  "recommendations": [...]
}`,

  chartArchitect: `You are a Chart Architect agent. Given analysis results and user goals,
design visualizations using our semantic chart engine.

Output structured JSON:
{
  "charts": [
    {
      "type": "bar|line|scatter|heatmap|treemap|...",
      "title": "...",
      "encodings": { "x": "field", "y": "field", "color": "field" },
      "rationale": "why this chart type"
    }
  ],
  "dashboardLayout": { "suggestedGrid": "2x2|3x2|...", "priorityOrder": [...] }
}`,

  insightEngineer: `You are an Insight Engineer agent. Given data analysis and charts,
generate actionable insights, anomalies, and narrative summaries.

Output structured JSON:
{
  "insights": [
    { "type": "trend|anomaly|correlation|segment", "title": "...", "description": "...", "severity": "high|medium|low" }
  ],
  "narrative": "Executive summary paragraph",
  "recommendations": [...]
}`,

  queryOptimizer: `You are a Query Optimizer agent. Review SQL queries for performance,
correctness, and optimization opportunities for DuckDB execution.

Output structured JSON:
{
  "optimizedQueries": [{ "original": "...", "optimized": "...", "rationale": "..." }],
  "indexSuggestions": [...],
  "estimatedPerformance": "fast|medium|slow"
}`,

  critic: `You are a Critic agent. Review the work of other agents for quality,
correctness, and completeness. Be constructive but rigorous.

Output structured JSON:
{
  "scores": { "dataAnalyst": 0-10, "chartArchitect": 0-10, "insightEngineer": 0-10 },
  "issues": [{ "agent": "...", "severity": "high|medium|low", "description": "..." }],
  "improvements": [{ "agent": "...", "suggestion": "..." }],
  "shouldIterate": true|false
}`,

  mcpToolUser: `You are an MCP Tool User agent. You can invoke external tools via the Model Context Protocol.
Use tools when needed to fetch external data, query APIs, or access files.

Available tools will be provided in the context.
Output structured JSON with tool calls and reasoning.`,
};

// ─── Agent Graph Builder ──────────────────────────────────────────────────────

export class AgentGraph {
  private nodes = new Map<string, AgentNodeConfig>();
  private entryNodeId: string | null = null;

  addNode(config: AgentNodeConfig): this {
    this.nodes.set(config.id, config);
    if (!this.entryNodeId) this.entryNodeId = config.id;
    return this;
  }

  setEntry(nodeId: string): this {
    this.entryNodeId = nodeId;
    return this;
  }

  getNode(id: string): AgentNodeConfig | undefined {
    return this.nodes.get(id);
  }

  getEntryNode(): AgentNodeConfig | null {
    return this.entryNodeId ? (this.nodes.get(this.entryNodeId) ?? null) : null;
  }

  getAllNodes(): AgentNodeConfig[] {
    return Array.from(this.nodes.values());
  }

  static createDefaultAnalyticsGraph(): AgentGraph {
    return new AgentGraph()
      .addNode({
        id: "supervisor",
        role: "supervisor",
        name: "Supervisor",
        description: "Decomposes user goals and delegates to specialists",
        systemPrompt: SYSTEM_PROMPTS.supervisor,
        temperature: 0.3,
        next: "dataAnalyst",
      })
      .addNode({
        id: "dataAnalyst",
        role: "dataAnalyst",
        name: "Data Analyst",
        description: "Analyzes schema, writes SQL, identifies metrics",
        systemPrompt: SYSTEM_PROMPTS.dataAnalyst,
        temperature: 0.2,
        next: (_output, ctx) => {
          // If user asked for charts, go to chartArchitect
          if (
            ctx.userGoal.toLowerCase().includes("chart") ||
            ctx.userGoal.toLowerCase().includes("visual") ||
            ctx.userGoal.toLowerCase().includes("graph")
          ) {
            return "chartArchitect";
          }
          // If user asked for insights, go to insightEngineer
          if (
            ctx.userGoal.toLowerCase().includes("insight") ||
            ctx.userGoal.toLowerCase().includes("summary") ||
            ctx.userGoal.toLowerCase().includes("explain")
          ) {
            return "insightEngineer";
          }
          // Default: chart then insight
          return "chartArchitect";
        },
      })
      .addNode({
        id: "chartArchitect",
        role: "chartArchitect",
        name: "Chart Architect",
        description: "Designs visualizations from analysis results",
        systemPrompt: SYSTEM_PROMPTS.chartArchitect,
        temperature: 0.4,
        next: "critic",
      })
      .addNode({
        id: "insightEngineer",
        role: "insightEngineer",
        name: "Insight Engineer",
        description: "Generates insights and narrative summaries",
        systemPrompt: SYSTEM_PROMPTS.insightEngineer,
        temperature: 0.5,
        next: "critic",
      })
      .addNode({
        id: "critic",
        role: "critic",
        name: "Critic",
        description: "Reviews agent outputs for quality and correctness",
        systemPrompt: SYSTEM_PROMPTS.critic,
        temperature: 0.3,
        next: (output) => {
          const structured = output.structured as
            | { shouldIterate?: boolean }
            | undefined;
          return structured?.shouldIterate ? "dataAnalyst" : null; // null = end
        },
      });
  }

  static createAutoDashboardGraph(): AgentGraph {
    return new AgentGraph()
      .addNode({
        id: "supervisor",
        role: "supervisor",
        name: "Supervisor",
        description: "Plans dashboard generation",
        systemPrompt: SYSTEM_PROMPTS.supervisor,
        temperature: 0.3,
        next: "dataAnalyst",
      })
      .addNode({
        id: "dataAnalyst",
        role: "dataAnalyst",
        name: "Data Analyst",
        description: "Deep schema analysis for dashboard",
        systemPrompt: SYSTEM_PROMPTS.dataAnalyst,
        temperature: 0.2,
        next: "chartArchitect",
      })
      .addNode({
        id: "chartArchitect",
        role: "chartArchitect",
        name: "Chart Architect",
        description: "Designs multiple charts for dashboard",
        systemPrompt: SYSTEM_PROMPTS.chartArchitect,
        temperature: 0.4,
        next: "insightEngineer",
      })
      .addNode({
        id: "insightEngineer",
        role: "insightEngineer",
        name: "Insight Engineer",
        description: "Generates KPIs and summaries",
        systemPrompt: SYSTEM_PROMPTS.insightEngineer,
        temperature: 0.5,
        next: "queryOptimizer",
      })
      .addNode({
        id: "queryOptimizer",
        role: "queryOptimizer",
        name: "Query Optimizer",
        description: "Optimizes all dashboard queries",
        systemPrompt: SYSTEM_PROMPTS.queryOptimizer,
        temperature: 0.1,
        next: undefined,
      });
  }
}

// ─── Agent Orchestrator ───────────────────────────────────────────────────────

export class AgentOrchestrator {
  private graph: AgentGraph;
  private model: string;
  private host: string;
  private onTraceUpdate?: TraceUpdateHandler;
  private abortController = new AbortController();

  constructor(options: {
    graph: AgentGraph;
    model: string;
    host?: string;
    onTraceUpdate?: TraceUpdateHandler;
  }) {
    this.graph = options.graph;
    this.model = options.model;
    this.host = options.host ?? EDGE_AI_HOST;
    this.onTraceUpdate = options.onTraceUpdate;
  }

  abort() {
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  async execute(input: AgentInput): Promise<AgentTrace> {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const trace: AgentTrace = {
      traceId,
      threadId: input.context.threadId,
      startedAt: Date.now(),
      status: "running",
      nodes: [],
      metadata: { totalTokens: 0, totalLatencyMs: 0, model: this.model },
    };

    const nodeOutputs: Record<string, AgentOutput> = {};
    const visitedNodes = new Set<string>();

    try {
      const entry = this.graph.getEntryNode();
      if (!entry) throw new Error("No entry node configured");

      let currentNode: AgentNodeConfig | null = entry;

      while (currentNode && !this.abortController.signal.aborted) {
        if (visitedNodes.has(currentNode.id)) {
          // Prevent infinite loops
          break;
        }
        visitedNodes.add(currentNode.id);
        trace.currentNodeId = currentNode.id;

        const traceNode: AgentTraceNode = {
          nodeId: currentNode.id,
          role: currentNode.role,
          startedAt: Date.now(),
          status: "running",
          input: {
            ...input,
            previousNodeOutputs: { ...nodeOutputs },
          },
        };
        trace.nodes.push(traceNode);
        this.emitUpdate(trace);

        // Build messages for this agent
        const messages = this.buildMessages(currentNode, input, nodeOutputs);

        // Execute LLM call
        const startTime = Date.now();
        let outputContent = "";
        let structured: Record<string, unknown> | undefined;

        try {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("Agent timeout")),
              120000,
            );

            streamOllamaChat(
              this.model,
              messages,
              (token) => {
                outputContent += token;
              },
              () => {
                clearTimeout(timeout);
                resolve();
              },
              (err) => {
                clearTimeout(timeout);
                reject(err);
              },
              { temperature: currentNode?.temperature ?? 0.3, host: this.host },
            );
          });

          // Try to extract structured JSON from output
          structured = this.extractJson(outputContent);
        } catch (err) {
          traceNode.status = "failed";
          traceNode.error = err instanceof Error ? err.message : String(err);
          traceNode.endedAt = Date.now();
          trace.status = "failed";
          this.emitUpdate(trace);
          break;
        }

        const latencyMs = Date.now() - startTime;
        traceNode.endedAt = Date.now();
        traceNode.status = "completed";

        const output: AgentOutput = {
          nodeId: currentNode.id,
          role: currentNode.role,
          content: outputContent,
          structured,
          approved: !currentNode.requiresApproval,
          retryCount: 0,
          latencyMs,
        };

        traceNode.output = output;
        nodeOutputs[currentNode.id] = output;
        trace.metadata.totalLatencyMs += latencyMs;
        this.emitUpdate(trace);

        // Determine next node
        if (!currentNode) {
          currentNode = null;
          break;
        }
        const nextRef: AgentNodeConfig["next"] = currentNode.next;
        if (nextRef === undefined || nextRef === null) {
          currentNode = null;
        } else if (typeof nextRef === "string") {
          currentNode = this.graph.getNode(nextRef) ?? null;
        } else {
          const nextId = nextRef(output, input.context);
          currentNode = nextId ? (this.graph.getNode(nextId) ?? null) : null;
        }
      }

      trace.status = this.abortController.signal.aborted
        ? "failed"
        : "completed";
      trace.endedAt = Date.now();
      trace.finalOutput = Object.values(nodeOutputs).pop();
      this.emitUpdate(trace);

      return trace;
    } catch (err) {
      trace.status = "failed";
      trace.endedAt = Date.now();
      trace.nodes.push({
        nodeId: "orchestrator",
        role: "supervisor",
        startedAt: Date.now(),
        endedAt: Date.now(),
        status: "failed",
        input,
        error: err instanceof Error ? err.message : String(err),
      });
      this.emitUpdate(trace);
      return trace;
    }
  }

  private buildMessages(
    node: AgentNodeConfig,
    input: AgentInput,
    previousOutputs: Record<string, AgentOutput>,
  ): AgentMessage[] {
    const messages: AgentMessage[] = [
      { role: "system", content: node.systemPrompt },
      {
        role: "user",
        content: this.buildContextPrompt(input.context, previousOutputs),
      },
    ];

    // Add previous outputs as context
    for (const [nodeId, output] of Object.entries(previousOutputs)) {
      messages.push({
        role: "assistant",
        content: `[Output from ${nodeId} (${output.role})]:\n${output.content.slice(0, 4000)}`,
        name: output.role,
      });
    }

    // Add the actual user goal
    messages.push({
      role: "user",
      content: `Current task for ${node.name}: ${input.context.userGoal}\n\nPlease provide your output in the requested JSON format.`,
    });

    return messages;
  }

  private buildContextPrompt(
    ctx: AgentContext,
    previousOutputs: Record<string, AgentOutput>,
  ): string {
    const parts = [
      `Table: ${ctx.tableName}`,
      `Columns: ${ctx.columns.map((c) => `${c.name}(${c.type})`).join(", ")}`,
      `Schema:\n${ctx.schema}`,
      `Row Sample (first 5 rows):\n${safeJsonStringify(ctx.rowSample.slice(0, 5), 2)}`,
      `User Goal: ${ctx.userGoal}`,
    ];

    if (Object.keys(previousOutputs).length > 0) {
      parts.push(`\nPrevious agent outputs available for context.`);
    }

    return parts.join("\n\n");
  }

  private extractJson(content: string): Record<string, unknown> | undefined {
    // Try to find JSON block
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        return JSON.parse(jsonBlockMatch[1]) as Record<string, unknown>;
      } catch {
        // fall through
      }
    }

    // Try to find raw JSON object
    const rawMatch = content.match(/\{[\s\S]*\}/);
    if (rawMatch) {
      try {
        return JSON.parse(rawMatch[0]) as Record<string, unknown>;
      } catch {
        // fall through
      }
    }

    return undefined;
  }

  private emitUpdate(trace: AgentTrace) {
    try {
      this.onTraceUpdate?.({ ...trace });
    } catch {
      // ignore callback errors
    }
  }
}

// ─── React Hook ───────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from "react";

export function useAgentOrchestrator(model: string, host?: string) {
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const orchestratorRef = useRef<AgentOrchestrator | null>(null);

  const run = useCallback(
    async (graph: AgentGraph, input: AgentInput) => {
      setIsRunning(true);
      setTrace(null);

      const orch = new AgentOrchestrator({
        graph,
        model,
        host,
        onTraceUpdate: (t) => setTrace({ ...t }),
      });
      orchestratorRef.current = orch;

      try {
        const result = await orch.execute(input);
        setTrace(result);
        return result;
      } finally {
        setIsRunning(false);
      }
    },
    [model, host],
  );

  const abort = useCallback(() => {
    orchestratorRef.current?.abort();
  }, []);

  return { trace, isRunning, run, abort };
}
