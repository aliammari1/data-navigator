"use client";

import { Brain, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AtlasButton } from "@/design/primitives/button";
import { AtlasProgress } from "@/design/primitives/progress";
import { useLLMOrchestrator } from "@/features/auto-analyst/core/llm-orchestrator";

export function LLMConsentModal() {
  const status = useLLMOrchestrator((s) => s.status);
  const progress = useLLMOrchestrator((s) => s.progress);
  const text = useLLMOrchestrator((s) => s.text);
  const error = useLLMOrchestrator((s) => s.error);
  const decline = useLLMOrchestrator((s) => s.decline);
  const load = useLLMOrchestrator((s) => s.load);

  const open =
    status === "consent-pending" || status === "loading" || status === "error";
  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={decline}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="w-full max-w-md rounded-[var(--atlas-radius-4)] border border-[var(--atlas-border)] bg-[var(--atlas-surface-raised)] shadow-[var(--atlas-shadow-5)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--atlas-accent-soft)] border border-[var(--atlas-accent-border)] flex items-center justify-center text-[var(--atlas-accent-fg)]">
                <Brain className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-[var(--atlas-text)]">
                  Enable offline AI?
                </h2>
                <p className="text-xs text-[var(--atlas-text-subtle)] mt-1 leading-relaxed">
                  Downloads SmolLM2 360M (~400 MB) once, then runs locally for
                  free-form questions and chart refinement. The deterministic
                  rule engine continues to work without it.
                </p>
              </div>
              <button
                type="button"
                onClick={decline}
                className="text-[var(--atlas-text-subtle)] hover:text-[var(--atlas-text)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {status === "loading" && (
              <div className="mt-4 space-y-2">
                <AtlasProgress value={progress * 100} tone="accent" />
                <div className="flex items-center gap-2 text-xs text-[var(--atlas-text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {text || "Preparing…"}
                </div>
              </div>
            )}

            {status === "error" && (
              <p className="mt-4 text-xs text-[var(--atlas-danger-fg)] leading-snug">
                {error}
              </p>
            )}

            <div className="mt-5 flex items-center gap-2 justify-end">
              <AtlasButton variant="ghost" size="sm" onClick={decline}>
                Not now
              </AtlasButton>
              <AtlasButton
                variant="solid"
                size="sm"
                onClick={() => load()}
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading
                  </>
                ) : status === "error" ? (
                  "Retry"
                ) : (
                  "Enable AI"
                )}
              </AtlasButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
