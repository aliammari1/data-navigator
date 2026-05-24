"use client";

/**
 * Agent Loop
 * Bounded tool-calling loop with edge AI structured outputs.
 * Max 5 steps. Never suppresses errors. Always validates JSON.
 */

import { validateSchema } from "./ai-schemas";
import { safeJsonStringify } from "./json";
import { generateWithOllamaStructured } from "./ollama-provider";
import {
  executeTool,
  getToolDefinitions,
  type ToolContext,
  type ToolResult,
} from "./tool-registry";

export interface AgentLoopStep {
  step: number;
  tool: string;
  arguments: Record<string, unknown>;
  reasoning: string;
  result?: ToolResult;
  error?: string;
}

export interface AgentLoopResult {
  success: boolean;
  steps: AgentLoopStep[];
  finalAnswer?: string;
  error?: string;
}

const MAX_STEPS = 5;

export async function runAgentLoop(
  model: string,
  host: string,
  systemPrompt: string,
  userPrompt: string,
  ctx: ToolContext,
  onStep?: (step: AgentLoopStep) => void,
): Promise<AgentLoopResult> {
  const steps: AgentLoopStep[] = [];
  const toolDefs = getToolDefinitions();

  for (let i = 0; i < MAX_STEPS; i++) {
    try {
      const result = await generateWithOllamaStructured<{
        tool: string;
        arguments: Record<string, unknown>;
        reasoning: string;
        finalAnswer?: string;
      }>(
        model,
        systemPrompt,
        `${userPrompt}\n\n---\n\nYou have access to these tools:\n${safeJsonStringify(toolDefs)}\n\n${
          steps.length > 0
            ? `Previous tool results:\n${safeJsonStringify(steps.map((s) => ({ tool: s.tool, result: s.result?.data ?? s.error })))}\n\n`
            : ""
        }Decide whether to call a tool or provide a finalAnswer. If you have enough information, set finalAnswer instead of calling a tool.`,
        {
          type: "object",
          properties: {
            tool: { type: "string" },
            arguments: { type: "object" },
            reasoning: { type: "string" },
            finalAnswer: { type: "string" },
          },
          required: ["reasoning"],
        },
        { host, temperature: 0 },
      );

      // If AI provides a final answer, we're done
      if (result.finalAnswer) {
        return {
          success: true,
          steps,
          finalAnswer: result.finalAnswer,
        };
      }

      // Validate tool call
      const validated = validateSchema<{
        tool: string;
        arguments: Record<string, unknown>;
        reasoning: string;
      }>(result, ["tool", "arguments", "reasoning"]);

      if (!validated.valid) {
        const errorStep: AgentLoopStep = {
          step: i + 1,
          tool: "validation",
          arguments: {},
          reasoning: "Schema validation failed",
          error: validated.error,
        };
        steps.push(errorStep);
        onStep?.(errorStep);
        return {
          success: false,
          steps,
          error: `Invalid tool call: ${validated.error}`,
        };
      }

      const { tool, arguments: args, reasoning } = validated.data;

      // Execute tool
      const toolResult = await executeTool(tool, args, ctx);

      const step: AgentLoopStep = {
        step: i + 1,
        tool,
        arguments: args,
        reasoning,
        result: toolResult.success ? toolResult : undefined,
        error: toolResult.success ? undefined : toolResult.error,
      };

      steps.push(step);
      onStep?.(step);

      if (!toolResult.success) {
      }
    } catch (err) {
      const errorStep: AgentLoopStep = {
        step: i + 1,
        tool: "system",
        arguments: {},
        reasoning: "System error during agent loop",
        error: err instanceof Error ? err.message : String(err),
      };
      steps.push(errorStep);
      onStep?.(errorStep);
      return {
        success: false,
        steps,
        error: errorStep.error,
      };
    }
  }

  // Reached max steps without final answer
  return {
    success: false,
    steps,
    error: `Agent loop reached maximum ${MAX_STEPS} steps without producing a final answer.`,
  };
}
