import type { ZodType } from "zod";
import { buildJsonInstruction, parseStructured } from "../structured";
import type { AIGenerateRequest, AIProvider } from "../types";

/**
 * Prompt-based structured-output fallback for providers without native JSON
 * schema constraints (web-LLM, Transformers.js). We append a strict
 * "JSON only" instruction, lower the temperature for determinism, then
 * validate the result against the Zod schema with repair.
 */
export async function generateStructuredByPrompt<T>(
  provider: Pick<AIProvider, "generate">,
  req: AIGenerateRequest,
  schema: ZodType<T>,
): Promise<T> {
  const system = [req.system, buildJsonInstruction()].filter(Boolean).join("\n\n");
  const result = await provider.generate({
    ...req,
    system,
    temperature: req.temperature ?? 0,
  });
  return parseStructured(result.text, schema, { label: "structured-output" });
}

/** Flatten a request into an ordered system+messages array. */
export function toMessages(req: AIGenerateRequest): { role: string; content: string }[] {
  const out: { role: string; content: string }[] = [];
  if (req.system) out.push({ role: "system", content: req.system });
  if (req.messages) out.push(...req.messages);
  if (req.prompt) out.push({ role: "user", content: req.prompt });
  return out;
}

/** Extract a single system+user pair (for providers that take exactly that). */
export function toSystemUser(req: AIGenerateRequest): { system: string; user: string } {
  const system = req.system ?? req.messages?.find((m) => m.role === "system")?.content ?? "";
  const user =
    req.prompt ??
    req.messages
      ?.filter((m) => m.role !== "system")
      .map((m) => m.content)
      .join("\n\n") ??
    "";
  return { system, user };
}
