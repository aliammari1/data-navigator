"use client";

import { Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useAI } from "@/platform/ai/provider/use-ai";

/**
 * Module-level cache of AI micro-explanations, keyed by the value+label pair.
 *
 * Cached across every <Explainable/> instance for the whole desktop session so
 * re-hovering a KPI (or hovering the same metric in a different window) is
 * instant and never re-pays for inference. Offline-only: the answer is produced
 * by the local model via `useAI().generate`.
 */
const explanationCache = new Map<string, string>();

function cacheKey(value: string, label: string): string {
  return `${label}\u0000${value}`;
}

export interface ExplainableProps {
  /** The metric value being shown (e.g. "98,4 %", "1 204 312"). */
  value: string;
  /** Human label of the metric (e.g. "Taux de succès"). Drives the prompt + cache key. */
  label: string;
  /** The visible metric node the tooltip is anchored to. */
  children: ReactNode;
  /** Optional extra context handed to the model to ground the explanation. */
  context?: string;
  /** Hover dwell (ms) before inference fires. Default 400ms. */
  delay?: number;
  /** Optional className forwarded to the inline wrapper. */
  className?: string;
}

type ExplainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error" };

/**
 * <Explainable value label>{metric}</Explainable>
 *
 * Wraps a metric. On hover, after a dwell of `delay` ms (default 400), it asks
 * the local model for a one-sentence "Pourquoi ?" micro-explanation and shows it
 * in a small glass tooltip above the metric. Inference is lazy (only on a
 * sustained hover) and cached per value+label, so it runs at most once per
 * distinct metric per session. Fully offline — uses `useAI().generate`.
 */
export function Explainable({
  value,
  label,
  children,
  context,
  delay = 400,
  className,
}: ExplainableProps) {
  const ai = useAI();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ExplainState>({ status: "idle" });

  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (dwellRef.current) clearTimeout(dwellRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const explain = useCallback(async () => {
    const key = cacheKey(value, label);
    const cached = explanationCache.get(key);
    if (cached) {
      setState({ status: "ready", text: cached });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });

    try {
      const result = await ai.generate({
        system:
          "Tu es un analyste télécom. Explique brièvement, en une seule phrase claire en français, " +
          "pourquoi cet indicateur a cette valeur ou ce qu'il signifie pour l'activité. " +
          "Pas de préambule, pas de liste, pas de chiffres inventés.",
        prompt: `Indicateur : « ${label} »\nValeur : ${value}${
          context ? `\nContexte : ${context}` : ""
        }\n\nPourquoi ?`,
        maxTokens: 96,
        temperature: 0.3,
        signal: controller.signal,
      });
      const text = result.text.trim();
      if (!text) {
        if (mountedRef.current) setState({ status: "error" });
        return;
      }
      explanationCache.set(key, text);
      if (mountedRef.current) setState({ status: "ready", text });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (mountedRef.current) setState({ status: "error" });
    }
  }, [ai, value, label, context]);

  const handleEnter = useCallback(() => {
    setOpen(true);
    if (dwellRef.current) clearTimeout(dwellRef.current);
    // Lazy: only pay for inference after a sustained hover.
    dwellRef.current = setTimeout(() => {
      void explain();
    }, delay);
  }, [delay, explain]);

  const handleLeave = useCallback(() => {
    setOpen(false);
    if (dwellRef.current) {
      clearTimeout(dwellRef.current);
      dwellRef.current = null;
    }
    // Abort an in-flight request the user no longer waits for.
    if (state.status === "loading") {
      abortRef.current?.abort();
      setState({ status: "idle" });
    }
  }, [state.status]);

  return (
    <span
      className={`relative inline-flex ${className ?? ""}`}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="pointer-events-none absolute bottom-full left-1/2 z-[var(--z-modal)] mb-2 w-60 max-w-[80vw] -translate-x-1/2 rounded-xl border p-2.5 shadow-2xl"
            style={{
              background: "var(--glass-bg-strong)",
              borderColor: "var(--glass-border)",
              color: "var(--glass-text)",
              backdropFilter: "blur(20px) saturate(1.5)",
              WebkitBackdropFilter: "blur(20px) saturate(1.5)",
              boxShadow: "var(--glass-shadow)",
            }}
          >
            <span className="mb-1 flex items-center gap-1.5">
              <Sparkles className="size-3" style={{ color: "hsl(var(--glass-accent))" }} />
              <span
                className="text-[11px] font-medium tracking-wide"
                style={{ color: "var(--glass-text-dim)" }}
              >
                Pourquoi ?
              </span>
            </span>
            {state.status === "loading" && (
              <span className="flex items-center gap-1.5 py-0.5">
                <DwellDots />
              </span>
            )}
            {state.status === "ready" && (
              <span
                className="block text-[12px] leading-snug"
                style={{ color: "var(--glass-text)" }}
              >
                {state.text}
              </span>
            )}
            {state.status === "error" && (
              <span
                className="block text-[12px] leading-snug"
                style={{ color: "var(--glass-text-dim)" }}
              >
                Explication indisponible hors ligne.
              </span>
            )}
            {state.status === "idle" && (
              <span
                className="block text-[12px] leading-snug"
                style={{ color: "var(--glass-text-dim)" }}
              >
                Maintenez pour une explication…
              </span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Three pulsing dots while the local model is thinking. */
function DwellDots() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full"
          style={{ background: "hsl(var(--glass-accent))" }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
          transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: i * 0.18 }}
        />
      ))}
    </>
  );
}
