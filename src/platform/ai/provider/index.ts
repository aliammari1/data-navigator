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

export { pickDefaultProvider } from "./registry";
export { useAIRuntimeStore } from "./store";

export * from "./types";
export { useAI } from "./use-ai";
