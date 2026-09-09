"use client";

import { Loader2, MessageCircleQuestion, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDesktopActions } from "@/features/desktop/store/desktop-store";
import { useAI } from "@/platform/ai/provider/use-ai";

/**
 * SelectToAsk — a global "select text → ask Moudir" affordance.
 *
 * Mounted once at the desktop shell level. It listens for text selections
 * anywhere on the desktop (numbers in a table, an error label, a KPI value…)
 * and floats a small glass bubble just above the selection offering two
 * actions:
 *   - « Demander à Moudir » : opens the Moudir agent and hands off the selected
 *     text via the `moudir:ask` custom event (same handoff Spotlight / Commander
 *     use).
 *   - « Expliquer » : runs a quick local `useAI().generate` and shows the answer
 *     inline in a small popover — no window spawn, fully offline.
 *
 * Behaviour:
 *   - Debounced after `selectionchange` / `mouseup` so the bubble only appears
 *     once the selection settles.
 *   - Dismisses on empty selection, scroll, Escape, resize, or outside click.
 *   - Ignores selections inside editable fields (inputs / textareas /
 *     contentEditable) so it doesn't fight normal text editing.
 */

const MIN_SELECTION = 2;
const MAX_PROMPT = 4000;
const DEBOUNCE_MS = 220;
/** Approx. bubble width — used to clamp it inside the viewport. */
const BUBBLE_W = 260;
/** Gap between the selection rect and the bubble. */
const GAP = 10;

interface BubbleState {
  text: string;
  /** Viewport-relative anchor (top-center of the bubble). */
  x: number;
  y: number;
}

type ExplainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; answer: string }
  | { status: "error"; message: string };

function isEditableTarget(node: Node | null): boolean {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  while (el) {
    if (
      el.isContentEditable ||
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT"
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Read the current text selection + its bounding rect, or null if unusable. */
function readSelection(): BubbleState | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const text = sel.toString().trim();
  if (text.length < MIN_SELECTION) return null;

  // Don't hijack selections made while editing form fields.
  if (isEditableTarget(sel.anchorNode) || isEditableTarget(sel.focusNode)) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const vw = window.innerWidth;
  const centerX = rect.left + rect.width / 2;
  const x = Math.max(BUBBLE_W / 2 + 8, Math.min(centerX, vw - BUBBLE_W / 2 - 8));
  const y = Math.max(GAP, rect.top - GAP);

  return { text: text.slice(0, MAX_PROMPT), x, y };
}

export function SelectToAsk() {
  const { openApp } = useDesktopActions();
  const ai = useAI();

  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [explain, setExplain] = useState<ExplainState>({ status: "idle" });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const dismiss = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    abortRef.current = null;
    setBubble(null);
    setExplain({ status: "idle" });
  }, []);

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = readSelection();
      if (!next) {
        setBubble(null);
        setExplain({ status: "idle" });
        return;
      }
      // A fresh selection cancels any in-flight explanation.
      setExplain((prev) => (prev.status === "idle" ? prev : { status: "idle" }));
      abortRef.current?.abort();
      abortRef.current = null;
      setBubble(next);
    }, DEBOUNCE_MS);
  }, []);

  // Global selection listeners.
  useEffect(() => {
    const onSelectionChange = () => {
      // If the selection was wiped, dismiss immediately (no debounce wait).
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (!sel || sel.isCollapsed) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setBubble(null);
        setExplain({ status: "idle" });
        return;
      }
      refresh();
    };
    const onMouseUp = () => refresh();

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [refresh]);

  // Dismiss on scroll / resize / Escape / outside pointer.
  useEffect(() => {
    if (!bubble) return;
    const onScroll = () => dismiss();
    const onResize = () => dismiss();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) {
        return; // interaction inside the bubble — keep it open
      }
      dismiss();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [bubble, dismiss]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const askMoudir = useCallback(() => {
    if (!bubble) return;
    const prompt = bubble.text;
    openApp("moudir-chat");
    window.dispatchEvent(new CustomEvent("moudir:ask", { detail: { prompt } }));
    dismiss();
  }, [bubble, openApp, dismiss]);

  const runExplain = useCallback(async () => {
    if (!bubble) return;
    const selected = bubble.text;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setExplain({ status: "loading" });
    try {
      const res = await ai.generate({
        system:
          "Tu es un analyste télécom francophone. Explique brièvement et clairement la sélection de l'utilisateur (chiffre, terme, message d'erreur ou libellé) en 2 à 3 phrases simples. Réponds uniquement en français.",
        prompt: `Explique ceci : « ${selected} »`,
        maxTokens: 256,
        temperature: 0.3,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const answer = res.text.trim();
      setExplain({
        status: "done",
        answer: answer || "Aucune explication disponible.",
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setExplain({
        status: "error",
        message: err instanceof Error ? err.message : "Échec de l'explication.",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [bubble, ai]);

  if (!bubble) return null;

  const showPopover = explain.status !== "idle";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: positioned wrapper intercepts mousedown only to preserve the native text selection; it is not an interactive control.
    <div
      ref={rootRef}
      className="fixed z-[var(--z-modal)]"
      style={{
        left: bubble.x,
        top: bubble.y,
        transform: "translate(-50%, -100%)",
      }}
      // Keep the native selection alive while interacting with the bubble.
      onMouseDown={(e) => e.preventDefault()}
    >
      <AnimatePresence>
        <motion.div
          key="stb"
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="flex w-max max-w-[260px] flex-col gap-2"
        >
          {/* Action bar */}
          <div
            className="flex items-center gap-1 rounded-full border px-1 py-1 shadow-[var(--glass-shadow)]"
            style={{
              background: "var(--glass-bg-strong)",
              borderColor: "var(--glass-border)",
              color: "var(--glass-text)",
              backdropFilter: "blur(18px) saturate(160%)",
              WebkitBackdropFilter: "blur(18px) saturate(160%)",
            }}
          >
            <button
              type="button"
              onClick={askMoudir}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[hsl(var(--glass-accent)/0.18)]"
              style={{ color: "var(--glass-text)" }}
            >
              <Sparkles size={14} style={{ color: "hsl(var(--glass-accent))" }} />
              Demander à Moudir
            </button>
            <div className="h-4 w-px" style={{ background: "var(--glass-hairline)" }} />
            <button
              type="button"
              onClick={() => void runExplain()}
              disabled={explain.status === "loading"}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[hsl(var(--glass-accent)/0.18)] disabled:opacity-60"
              style={{ color: "var(--glass-text)" }}
            >
              {explain.status === "loading" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <MessageCircleQuestion size={14} />
              )}
              Expliquer
            </button>
          </div>

          {/* Inline explanation popover */}
          <AnimatePresence>
            {showPopover && (
              <motion.div
                key="explain"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="rounded-xl border p-3 shadow-[var(--glass-shadow)]"
                style={{
                  background: "var(--glass-bg)",
                  borderColor: "var(--glass-border)",
                  color: "var(--glass-text)",
                  backdropFilter: "blur(20px) saturate(160%)",
                  WebkitBackdropFilter: "blur(20px) saturate(160%)",
                }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span
                    className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--glass-text-dim)" }}
                  >
                    <Sparkles size={12} style={{ color: "hsl(var(--glass-accent))" }} />
                    Explication
                  </span>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-md p-0.5 transition-colors hover:bg-[hsl(var(--glass-accent)/0.18)]"
                    style={{ color: "var(--glass-text-dim)" }}
                    aria-label="Fermer"
                  >
                    <X size={13} />
                  </button>
                </div>
                {explain.status === "loading" && (
                  <p
                    className="flex items-center gap-2 text-[12.5px]"
                    style={{ color: "var(--glass-text-dim)" }}
                  >
                    <Loader2 size={13} className="animate-spin" />
                    Réflexion en cours…
                  </p>
                )}
                {explain.status === "done" && (
                  <p
                    className="text-[12.5px] leading-relaxed"
                    style={{ color: "var(--glass-text)" }}
                  >
                    {explain.answer}
                  </p>
                )}
                {explain.status === "error" && (
                  <p className="text-[12.5px] leading-relaxed" style={{ color: "#d13438" }}>
                    {explain.message}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
