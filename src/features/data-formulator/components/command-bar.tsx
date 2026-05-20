"use client";

/**
 * Command Bar
 * Bottom input bar: NL query, voice, semantic toggle, run buttons.
 * Parses @semantic prefix for vector search.
 */

import {
  Languages,
  Loader2,
  Play,
  Settings2,
  Wand2,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils";
import {
  useWorkbenchStore,
  type WorkbenchState,
} from "../store/workbench-store";
import { VoiceButton } from "./voice-button";

interface CommandBarProps {
  onSubmit: (query: string, mode: "agent" | "semantic") => void;
  onAutoDashboard: () => void;
  disabled?: boolean;
}

type LanguageMode = WorkbenchState["languageMode"];

const LANGUAGE_OPTIONS: Array<{
  mode: LanguageMode;
  label: string;
  speechLang: string;
  title: string;
}> = [
  {
    mode: "auto",
    label: "Auto",
    speechLang: "ar-TN",
    title: "Auto voice mode, tuned first for Tunisian Arabic",
  },
  {
    mode: "tounsi",
    label: "Tounsi",
    speechLang: "ar-TN",
    title: "Tunisian Arabic voice commands",
  },
  {
    mode: "fr",
    label: "FR",
    speechLang: "fr-FR",
    title: "French voice commands",
  },
  {
    mode: "en",
    label: "EN",
    speechLang: "en-US",
    title: "English voice commands",
  },
  {
    mode: "ar",
    label: "AR",
    speechLang: "ar-SA",
    title: "Arabic voice commands",
  },
];

function languageOptionFor(mode: LanguageMode) {
  return (
    LANGUAGE_OPTIONS.find((option) => option.mode === mode) ??
    LANGUAGE_OPTIONS[0]
  );
}

export function CommandBar({
  onSubmit,
  onAutoDashboard,
  disabled,
}: CommandBarProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const semanticMode = useWorkbenchStore((s) => s.semanticMode);
  const setSemanticMode = useWorkbenchStore((s) => s.setSemanticMode);
  const languageMode = useWorkbenchStore((s) => s.languageMode);
  const setLanguageMode = useWorkbenchStore((s) => s.setLanguageMode);
  const agentRunning = useWorkbenchStore((s) => s.agentRunning);
  const setShowMcpModal = useWorkbenchStore((s) => s.setShowMcpModal);
  const voiceLanguage = languageOptionFor(languageMode);

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    if (disabled) {
      return;
    }
    if (agentRunning) {
      return;
    }

    const mode: "agent" | "semantic" =
      semanticMode || trimmed.startsWith("@semantic") ? "semantic" : "agent";

    const cleanQuery = trimmed.replace(/^@semantic\s*/, "");
    onSubmit(cleanQuery, mode);
    setQuery("");
  }, [query, disabled, agentRunning, semanticMode, onSubmit]);

  const handleVoice = useCallback(
    (text: string) => {
      const cleanText = text.trim();
      if (!cleanText || disabled || agentRunning) return;
      setQuery(cleanText);
      // Auto-submit after short delay
      setTimeout(() => {
        const mode = semanticMode ? "semantic" : "agent";
        onSubmit(cleanText, mode);
        setQuery("");
      }, 400);
    },
    [agentRunning, disabled, semanticMode, onSubmit],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Enter" && document.activeElement === inputRef.current) {
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pt-2 bg-gradient-to-t from-background via-background to-transparent sm:px-4 sm:pb-4">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn(
          "mx-auto max-w-3xl rounded-2xl border bg-background/95 backdrop-blur-xl shadow-2xl transition-all",
          focused
            ? "border-emerald-500/40 shadow-emerald-500/10"
            : "border-white/10",
        )}
      >
        {/* Input row */}
        <div className="flex min-w-0 items-center gap-2 px-3 py-3 sm:px-4">
          {/* Semantic toggle */}
          <button
            type="button"
            onClick={() => setSemanticMode(!semanticMode)}
            className={cn(
              "hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all sm:flex",
              semanticMode
                ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground",
            )}
            title="Toggle semantic vector search"
          >
            <Zap className="w-3 h-3" />
            {semanticMode ? "Semantic" : "Agent"}
          </button>

          <div className="hidden h-5 w-px bg-white/10 sm:block" />

          {/* Voice */}
          <VoiceButton
            onResult={handleVoice}
            disabled={disabled || agentRunning}
            language={voiceLanguage.speechLang}
            className="h-9 w-9"
          />

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder={
              semanticMode
                ? "Describe what rows you're looking for..."
                : "Ask for a KPI, dashboard, investigation, signal, scenario..."
            }
            disabled={disabled || agentRunning}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />

          {/* Run button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!query.trim() || disabled || agentRunning}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              agentRunning
                ? "bg-white/5 text-muted-foreground cursor-not-allowed"
                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20",
            )}
          >
            {agentRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{agentRunning ? "Running..." : "Run"}</span>
          </button>
        </div>

        {/* Toolbar row */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 pb-2.5 sm:px-4">
          <button
            type="button"
            onClick={onAutoDashboard}
            disabled={disabled || agentRunning}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-400 transition-all hover:bg-amber-500/15 disabled:pointer-events-none disabled:opacity-50"
          >
            <Wand2 className="w-3 h-3" />
            AI Dashboard
          </button>

          <button
            type="button"
            onClick={() => setShowMcpModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            <Settings2 className="w-3 h-3" />
            Connections
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-1 py-0.5">
            <Languages className="ml-1 h-3 w-3 text-muted-foreground" />
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => setLanguageMode(option.mode)}
                title={option.title}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  languageMode === option.mode
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <span className="hidden text-[10px] text-muted-foreground/60 sm:inline">
            Press{" "}
            <kbd className="px-1 py-0.5 rounded bg-white/10 text-[9px]">/</kbd>{" "}
            to focus
          </span>
        </div>
      </motion.div>
    </div>
  );
}
