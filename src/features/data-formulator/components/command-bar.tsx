"use client";

/**
 * Command Bar
 *
 * Bottom workspace input bar:
 * - Natural language agent command
 * - Semantic search toggle
 * - Voice command entry
 * - Voice settings panel
 * - Voice debug panel
 *
 * Voice UX:
 * - VoiceButton owns microphone / VAD / STT / routing / TTS journey.
 * - CommandBar receives the final routed voice text.
 * - If voice auto-submit is enabled, it submits immediately.
 * - Otherwise, the transcript becomes an editable draft in the input.
 */

import {
  CheckCircle2,
  Languages,
  Loader2,
  MessageSquareText,
  Play,
  Settings2,
  SlidersHorizontal,
  TerminalSquare,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getVoiceOutputMode,
  loadVoiceSettings,
  subscribeVoiceSettings,
  updateVoiceSettings,
  type VoiceLanguageHint,
  type VoiceSettings,
} from "@/features/data-formulator/core/voice/voice-settings";
import { cn } from "@/shared/utils";
import {
  useWorkbenchStore,
  type WorkbenchState,
} from "../store/workbench-store";
import { VoiceButton } from "./voice-button";
import { VoiceDebugPanel } from "./voice-debug-panel";
import { VoiceSettingsPanel } from "./voice-settings-panel";

interface CommandBarProps {
  onSubmit: (query: string, mode: "agent" | "semantic") => void;
  onAutoDashboard: () => void;
  disabled?: boolean;
}

type LanguageMode = WorkbenchState["languageMode"];
type VoicePanelTab = "settings" | "debug";

interface VoiceDraft {
  text: string;
  receivedAt: number;
  autoSubmitted: boolean;
}

const LANGUAGE_OPTIONS: Array<{
  mode: LanguageMode;
  label: string;
  speechLang: string;
  voiceHint: VoiceLanguageHint;
  title: string;
}> = [
  {
    mode: "auto",
    label: "Auto",
    speechLang: "ar-TN",
    voiceHint: "auto",
    title: "Auto voice mode, tuned first for mixed Tunisian / French / English",
  },
  {
    mode: "tounsi",
    label: "Tounsi",
    speechLang: "ar-TN",
    voiceHint: "ar-TN",
    title: "Tunisian Arabic voice commands",
  },
  {
    mode: "fr",
    label: "FR",
    speechLang: "fr-FR",
    voiceHint: "fr",
    title: "French voice commands",
  },
  {
    mode: "en",
    label: "EN",
    speechLang: "en-US",
    voiceHint: "en",
    title: "English voice commands",
  },
  {
    mode: "ar",
    label: "AR",
    speechLang: "ar-SA",
    voiceHint: "ar",
    title: "Arabic voice commands",
  },
];

function languageOptionFor(mode: LanguageMode) {
  return (
    LANGUAGE_OPTIONS.find((option) => option.mode === mode) ??
    LANGUAGE_OPTIONS[0]
  );
}

function languageModeForVoiceHint(hint: VoiceLanguageHint): LanguageMode {
  if (hint === "fr") return "fr";
  if (hint === "en") return "en";
  if (hint === "ar") return "ar";
  if (hint === "ar-TN") return "tounsi";
  return "auto";
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getSubmitMode(
  query: string,
  semanticMode: boolean,
): "agent" | "semantic" {
  return semanticMode || query.startsWith("@semantic") ? "semantic" : "agent";
}

function cleanSemanticPrefix(query: string): string {
  return query.replace(/^@semantic\s*/i, "").trim();
}

function formatTime(value: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function CommandBar({
  onSubmit,
  onAutoDashboard,
  disabled,
}: CommandBarProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voicePanelTab, setVoicePanelTab] = useState<VoicePanelTab>("settings");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() =>
    loadVoiceSettings(),
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const voiceSettingsRef = useRef<VoiceSettings>(voiceSettings);

  const semanticMode = useWorkbenchStore((s) => s.semanticMode);
  const setSemanticMode = useWorkbenchStore((s) => s.setSemanticMode);
  const languageMode = useWorkbenchStore((s) => s.languageMode);
  const setLanguageMode = useWorkbenchStore((s) => s.setLanguageMode);
  const agentRunning = useWorkbenchStore((s) => s.agentRunning);
  const setShowMcpModal = useWorkbenchStore((s) => s.setShowMcpModal);

  const voiceLanguage = languageOptionFor(languageMode);

  const voiceOutputMode = useMemo(
    () => getVoiceOutputMode(voiceSettings),
    [voiceSettings],
  );

  const submitMode = getSubmitMode(query.trim(), semanticMode);

  const canRun = Boolean(query.trim()) && !disabled && !agentRunning;

  const commitVoiceSettings = useCallback((patch: Partial<VoiceSettings>) => {
    const next = updateVoiceSettings(patch);
    setVoiceSettings(next);
    voiceSettingsRef.current = next;
    return next;
  }, []);

  const submitQuery = useCallback(
    (rawQuery: string) => {
      const trimmed = normalizeQuery(rawQuery);

      if (!trimmed) return;
      if (disabled) return;
      if (agentRunning) return;

      const mode = getSubmitMode(trimmed, semanticMode);
      const cleanQuery = cleanSemanticPrefix(trimmed);

      if (!cleanQuery) return;

      onSubmit(cleanQuery, mode);
      setQuery("");
      setVoiceDraft(null);
    },
    [agentRunning, disabled, semanticMode, onSubmit],
  );

  const handleSubmit = useCallback(() => {
    submitQuery(query);
  }, [query, submitQuery]);

  const handleVoice = useCallback(
    (text: string) => {
      const cleanText = normalizeQuery(text);

      if (!cleanText || disabled || agentRunning) return;

      const shouldSubmitImmediately =
        voiceSettingsRef.current.autoSubmit &&
        !voiceSettingsRef.current.showTranscript;

      if (shouldSubmitImmediately) {
        setVoiceDraft({
          text: cleanText,
          receivedAt: Date.now(),
          autoSubmitted: true,
        });
        submitQuery(cleanText);
        return;
      }

      setQuery(cleanText);
      setVoiceDraft({
        text: cleanText,
        receivedAt: Date.now(),
        autoSubmitted: false,
      });

      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(cleanText.length, cleanText.length);
      });
    },
    [agentRunning, disabled, submitQuery],
  );

  const clearVoiceDraft = useCallback(() => {
    setVoiceDraft(null);
  }, []);

  const replaceWithVoiceDraft = useCallback(() => {
    if (!voiceDraft) return;

    setQuery(voiceDraft.text);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(
        voiceDraft.text.length,
        voiceDraft.text.length,
      );
    });
  }, [voiceDraft]);

  const handleLanguageClick = useCallback(
    (option: (typeof LANGUAGE_OPTIONS)[number]) => {
      setLanguageMode(option.mode);
      commitVoiceSettings({
        languageHint: option.voiceHint,
      });
    },
    [commitVoiceSettings, setLanguageMode],
  );

  const openVoiceSettings = useCallback(() => {
    setVoicePanelTab("settings");
    setVoicePanelOpen((open) => !(open && voicePanelTab === "settings"));
  }, [voicePanelTab]);

  const openVoiceDebug = useCallback(() => {
    setVoicePanelTab("debug");
    setVoicePanelOpen((open) => !(open && voicePanelTab === "debug"));
  }, [voicePanelTab]);

  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  useEffect(() => {
    const unsubscribe = subscribeVoiceSettings((event) => {
      setVoiceSettings(event.settings);
      voiceSettingsRef.current = event.settings;

      const nextLanguageMode = languageModeForVoiceHint(
        event.settings.languageHint,
      );

      if (nextLanguageMode !== languageMode) {
        setLanguageMode(nextLanguageMode);
      }
    });

    return unsubscribe;
  }, [languageMode, setLanguageMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const target = event.target as HTMLElement;

        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        event.preventDefault();
        inputRef.current?.focus();
      }

      if (
        event.key === "Enter" &&
        document.activeElement === inputRef.current
      ) {
        handleSubmit();
      }

      if (
        event.key === "Escape" &&
        document.activeElement === inputRef.current &&
        voiceDraft
      ) {
        clearVoiceDraft();
      }
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, [clearVoiceDraft, handleSubmit, voiceDraft]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-linear-to-t from-background via-background to-transparent px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn(
          "mx-auto max-w-5xl overflow-hidden rounded-2xl border bg-background/95 shadow-2xl backdrop-blur-xl transition-all",
          focused || voiceDraft || voicePanelOpen
            ? "border-emerald-500/40 shadow-emerald-500/10"
            : "border-white/10",
        )}
      >
        <div className="flex min-w-0 items-center gap-2 px-3 py-3 sm:px-4">
          <button
            type="button"
            onClick={() => setSemanticMode(!semanticMode)}
            className={cn(
              "hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all sm:flex",
              semanticMode
                ? "border-cyan-500/30 bg-cyan-500/15 text-cyan-400"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
            )}
            title="Toggle semantic vector search"
          >
            <Zap className="h-3 w-3" />
            {semanticMode ? "Semantic" : "Agent"}
          </button>

          <div className="hidden h-5 w-px bg-white/10 sm:block" />

          <VoiceButton
            onResult={handleVoice}
            disabled={disabled || agentRunning}
            language={voiceLanguage.speechLang}
            languageLabel={voiceLanguage.label}
            className="h-9 w-9"
          />

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);

              if (voiceDraft && event.target.value !== voiceDraft.text) {
                setVoiceDraft(null);
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSubmit();
              }
            }}
            placeholder={
              voiceDraft
                ? "Review or edit your voice command, then press Enter..."
                : semanticMode
                  ? "Describe the rows or records you are looking for..."
                  : "Ask for a KPI, dashboard, investigation, signal, scenario..."
            }
            disabled={disabled || agentRunning}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canRun}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              agentRunning
                ? "cursor-not-allowed bg-white/5 text-muted-foreground"
                : canRun
                  ? "border border-emerald-500/20 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                  : "cursor-not-allowed border border-white/10 bg-white/5 text-muted-foreground",
            )}
            title={
              submitMode === "semantic"
                ? "Run semantic vector search"
                : "Run agent command"
            }
          >
            {agentRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}

            <span className="hidden sm:inline">
              {agentRunning
                ? "Running..."
                : submitMode === "semantic"
                  ? "Search"
                  : "Run"}
            </span>
          </button>
        </div>

        {voiceDraft && !agentRunning && (
          <div className="border-t border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-start gap-2">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-300">
                    Voice command captured
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {voiceLanguage.label}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {voiceSettings.sttEngine}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {voiceOutputMode}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {formatTime(voiceDraft.receivedAt)}
                  </span>
                </div>

                <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground">
                  “{voiceDraft.text}”
                </div>

                <div className="mt-1 text-[10px] text-muted-foreground">
                  The command is editable in the input before running. Voice
                  routing and tool preview already happened inside the voice
                  journey.
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={replaceWithVoiceDraft}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => submitQuery(voiceDraft.text)}
                  className="rounded-md border border-emerald-500/25 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
                >
                  Run
                </button>

                <button
                  type="button"
                  onClick={clearVoiceDraft}
                  aria-label="Clear voice command"
                  className="rounded-md border border-white/10 bg-white/5 p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {voicePanelOpen && (
          <div className="border-t border-white/10 bg-white/[0.03] px-3 py-3 sm:px-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  {voicePanelTab === "settings" ? (
                    <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-300" />
                  ) : (
                    <TerminalSquare className="h-3.5 w-3.5 text-emerald-300" />
                  )}
                  {voicePanelTab === "settings"
                    ? "Voice settings"
                    : "Voice debug"}
                </div>

                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {voicePanelTab === "settings"
                    ? "Configure voice input, STT, TTS, transcript review, and debug behavior."
                    : "Inspect workers, timeline, latency, models, and errors."}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setVoicePanelTab("settings")}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[10px] transition-colors",
                    voicePanelTab === "settings"
                      ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                  )}
                >
                  Settings
                </button>

                <button
                  type="button"
                  onClick={() => setVoicePanelTab("debug")}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[10px] transition-colors",
                    voicePanelTab === "debug"
                      ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                  )}
                >
                  Debug
                </button>

                <button
                  type="button"
                  onClick={() => setVoicePanelOpen(false)}
                  aria-label="Close voice panel"
                  className="rounded-lg border border-white/10 bg-white/5 p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {voicePanelTab === "settings" ? (
              <VoiceSettingsPanel
                compact
                onClose={() => setVoicePanelOpen(false)}
              />
            ) : (
              <VoiceDebugPanel
                compact
                onClose={() => setVoicePanelOpen(false)}
              />
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 pb-2.5 sm:px-4">
          <button
            type="button"
            onClick={onAutoDashboard}
            disabled={disabled || agentRunning}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-400 transition-all hover:bg-amber-500/15 disabled:pointer-events-none disabled:opacity-50"
          >
            <Wand2 className="h-3 w-3" />
            AI Dashboard
          </button>

          <button
            type="button"
            onClick={() => setShowMcpModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:bg-white/10"
          >
            <Settings2 className="h-3 w-3" />
            Connections
          </button>

          <button
            type="button"
            onClick={openVoiceSettings}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-all",
              voicePanelOpen && voicePanelTab === "settings"
                ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Voice
          </button>

          <button
            type="button"
            onClick={openVoiceDebug}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-all",
              voicePanelOpen && voicePanelTab === "debug"
                ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
            )}
          >
            <TerminalSquare className="h-3 w-3" />
            Debug
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/4 px-1 py-0.5">
            <Languages className="ml-1 h-3 w-3 text-muted-foreground" />

            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => handleLanguageClick(option)}
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

          {voiceDraft && (
            <div className="hidden items-center gap-1 rounded-lg border border-emerald-500/15 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 sm:flex">
              <MessageSquareText className="h-3 w-3" />
              Voice ready
            </div>
          )}

          <div className="hidden items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground md:flex">
            <span>{voiceSettings.mode}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{voiceSettings.sttEngine}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{voiceOutputMode}</span>
          </div>

          <div className="flex-1" />

          <span className="hidden text-[10px] text-muted-foreground/60 sm:inline">
            Press{" "}
            <kbd className="rounded bg-white/10 px-1 py-0.5 text-[9px]">/</kbd>{" "}
            to focus
          </span>
        </div>
      </motion.div>
    </div>
  );
}
