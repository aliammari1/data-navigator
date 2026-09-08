/**
 * Unified, pluggable, offline-first AI provider layer.
 *
 * Public surface — import from "@/platform/ai/provider":
 *   import { useAI } from "@/platform/ai/provider";
 *   import { getProvider, detectAvailability } from "@/platform/ai/provider";
 *   import { parseStructured } from "@/platform/ai/provider";
 *
 * See docs/AI-PROVIDER.md for the architecture and migration guide.
 */

export { llamacppProvider } from "./adapters/llamacpp";
export {
  detectAvailability,
  getProvider,
  listProviders,
  PROVIDERS,
  type ProviderAvailability,
  pickDefaultProvider,
} from "./registry";
export { useAIRuntimeStore } from "./store";
export {
  buildJsonInstruction,
  extractJsonBlock,
  parsePartialJson,
  parseStructured,
  repairJson,
  schemaToGrammarJson,
  type DeepPartial,
} from "./structured";
export * from "./types";
export { useAI } from "./use-ai";
export { useStreamingJson } from "./use-streaming-json";
export { zodToInlineJsonSchema } from "./zod-json-schema";
