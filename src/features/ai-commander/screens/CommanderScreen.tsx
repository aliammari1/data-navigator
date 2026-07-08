"use client";

import {
  ImageIcon,
  LayoutDashboard,
  PanelTopClose,
  Plus,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCommanderSystemPrompt,
  COMMANDER_CAPABILITIES,
  CommanderResultSchema,
  resolveAppId,
  WALLPAPER_LABELS,
} from "@/features/ai-commander/core/commander";
import { useMoudirVoice } from "@/features/data-formulator/components/moudir/use-moudir-voice";
import { getApp } from "@/features/desktop/core/app-registry";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { useDesktopActions } from "@/features/desktop/store/desktop-store";
import { useAI } from "@/platform/ai/provider/use-ai";
import { cn } from "@/shared/utils";
import { CommanderComposer } from "../components/commander-composer";
import { CommanderEmptyState, type StatusTone } from "../components/commander-empty-state";
import {
  CMD_ACCENT,
  CommanderBackdrop,
  CommanderGlyph,
  ThinkingDots,
} from "../components/commander-kit";
import {
  type CommanderAction,
  CommanderTurn,
  type CommanderTurnData,
} from "../components/commander-turn";

/**
 * The Commander window — the agentic-OS surface. Type or speak an instruction;
 * the local LLM picks one structured action and the desktop executes it. The
 * window frame already supplies the titlebar (icon + "Commandant IA"), so this
 * screen owns only a slim status strip, the conversation, and the composer.
 * Replies are spoken back when voice is available, so the app can be driven
 * hands-free.
 */

const SUGGESTIONS = [
  "Ouvre le rapport télécom",
  "Quels canaux ont le plus d'erreurs aujourd'hui ?",
  "Montre les prévisions",
  "Mets le fond sur crépuscule",
];

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour. Par quoi commençons-nous ?";
  if (h < 18) return "Bon après-midi. Que faisons-nous ?";
  return "Bonsoir. Que puis-je piloter ?";
}

export default function CommanderScreen() {
  const ai = useAI();
  const voice = useMoudirVoice();
  const { openApp, setWallpaper, cascadeArrange, closeAll } = useDesktopActions();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<CommanderTurnData[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const greeting = useMemo(() => greetingForNow(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the latest turn whenever the conversation grows or a reply starts.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const run = useCallback(
    async (instruction: string) => {
      const text = instruction.trim();
      if (!text || busy) return;
      setValue("");
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const result = await ai.generateStructured(
          {
            prompt: text,
            system: buildCommanderSystemPrompt(),
            maxTokens: 220,
            temperature: 0.2,
            signal: controller.signal,
          },
          CommanderResultSchema,
        );

        let action: CommanderAction | undefined;
        const a = result.action;
        switch (a.kind) {
          case "open_app": {
            const appId = resolveAppId(a.appId);
            const app = appId ? getApp(appId) : undefined;
            if (app) {
              openApp(app.id);
              action = {
                label: `Ouvert · ${app.title}`,
                icon: app.icon,
                hue: app.hue,
                appId: app.id,
              };
            }
            break;
          }
          case "ask_data": {
            const q = a.query?.trim() || text;
            openApp("moudir-chat");
            // Decoupled handoff — the Moudir assistant listens and runs the swarm.
            window.dispatchEvent(new CustomEvent("moudir:ask", { detail: { prompt: q } }));
            const moud = getApp("moudir-chat");
            action = {
              label: "Analyse confiée à Moudir",
              icon: moud?.icon ?? Sparkles,
              hue: moud?.hue ?? 268,
              appId: "moudir-chat",
            };
            break;
          }
          case "set_wallpaper": {
            if (a.wallpaper) {
              setWallpaper(a.wallpaper);
              action = {
                label: `Ambiance · ${WALLPAPER_LABELS[a.wallpaper]}`,
                icon: ImageIcon,
                hue: 36,
              };
            }
            break;
          }
          case "arrange": {
            cascadeArrange({ w: window.innerWidth, h: window.innerHeight });
            action = { label: "Fenêtres rangées", icon: LayoutDashboard, hue: 200 };
            break;
          }
          case "close_all": {
            closeAll();
            action = { label: "Toutes les fenêtres fermées", icon: PanelTopClose, hue: 8 };
            break;
          }
          default:
            break;
        }

        setTurns((t) => [...t, { id: `${Date.now()}`, user: text, reply: result.reply, action }]);
        if (result.reply) voice.speak(result.reply);
      } catch {
        // Silent on user-initiated cancel; surface a friendly error otherwise.
        if (!controller.signal.aborted) {
          setTurns((t) => [
            ...t,
            {
              id: `${Date.now()}`,
              user: text,
              reply:
                "Je n'ai pas pu exécuter cette commande. Vérifiez que le modèle IA est bien chargé.",
              error: true,
            },
          ]);
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      }
    },
    [ai, busy, openApp, setWallpaper, cascadeArrange, closeAll, voice],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    voice.stopSpeak();
    setTurns([]);
    setValue("");
  }, [voice]);

  const toggleVoice = useCallback(() => {
    if (voice.listening) void voice.stop();
    else void voice.start();
  }, [voice]);

  // Menu-bar commands → existing screen handlers (handlers read live).
  useAppCommands("commander", {
    reset: () => reset(),
    cancel: () => cancel(),
    toggleVoice: () => toggleVoice(),
    stopVoice: () => voice.stopSpeak(),
  });

  // Voice transcript → auto-run.
  useEffect(() => {
    voice.onTranscript?.((t) => {
      if (t.trim()) void run(t);
    });
  }, [voice, run]);

  // Map the AI provider lifecycle to a compact OS-native status line.
  const { statusLabel, statusTone } = useMemo<{
    statusLabel: string;
    statusTone: StatusTone;
  }>(() => {
    const p = ai.progress;
    // Model download takes precedence — it's the slow, explainable wait.
    if (p.status === "loading") {
      const pct = Math.round((p.progress <= 1 ? p.progress * 100 : p.progress) || 0);
      return {
        statusLabel: pct > 0 ? `Chargement du modèle… ${pct}%` : "Chargement du modèle…",
        statusTone: "loading",
      };
    }
    if (busy || p.status === "inferring")
      return { statusLabel: "Réflexion…", statusTone: "loading" };
    switch (p.status) {
      case "error":
        return { statusLabel: "Modèle indisponible", statusTone: "error" };
      case "ready":
        return { statusLabel: "Modèle prêt", statusTone: "ready" };
      default:
        return { statusLabel: "Prêt à exécuter", statusTone: "ready" };
    }
  }, [ai.progress, busy]);

  const motionOn = !useReducedMotion();
  const statusDot =
    statusTone === "ready"
      ? "var(--color-success)"
      : statusTone === "loading"
        ? "var(--color-warning)"
        : "var(--color-destructive)";

  return (
    <div className="relative flex h-full flex-col bg-background">
      <CommanderBackdrop lit={busy || voice.listening} />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {/* Slim status strip — the assistant's live presence (not a title dup). */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                statusTone !== "ready" && motionOn && "animate-pulse",
              )}
              style={{ background: statusDot }}
            />
            <span className="truncate">{statusLabel}</span>
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {voice.speaking && (
              <button
                type="button"
                onClick={() => voice.stopSpeak()}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ color: CMD_ACCENT }}
                title="Couper la voix"
              >
                <Volume2 className={cn("size-3.5", motionOn && "animate-pulse")} />
                <span>parle…</span>
                <Square className="size-2.5 fill-current" />
              </button>
            )}
            {turns.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Nouvelle conversation"
              >
                <Plus className="size-3.5" />
                <span>Nouveau</span>
              </button>
            )}
          </div>
        </div>

        {/* Conversation / empty state */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {turns.length === 0 ? (
            <CommanderEmptyState
              greeting={greeting}
              statusLabel={statusLabel}
              statusTone={statusTone}
              capabilities={COMMANDER_CAPABILITIES}
              onRun={(t) => void run(t)}
            />
          ) : (
            <div className="space-y-3.5 px-4 py-4">
              {turns.map((turn) => (
                <CommanderTurn key={turn.id} turn={turn} onOpen={(appId) => openApp(appId)} />
              ))}
              {busy && (
                <div className="flex items-center gap-2.5">
                  <CommanderGlyph size={28} thinking />
                  <div
                    className="rounded-2xl rounded-tl-md px-3.5 py-3"
                    style={{
                      background: "var(--glass-bg-strong)",
                      boxShadow: "inset 0 0 0 1px var(--glass-border)",
                    }}
                  >
                    <ThinkingDots />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="relative z-10 border-t border-border/60 bg-background/60 p-3 backdrop-blur-sm">
          <CommanderComposer
            value={value}
            onChange={setValue}
            onSubmit={() => void run(value)}
            onPick={(t) => void run(t)}
            onCancel={cancel}
            busy={busy}
            suggestions={SUGGESTIONS}
            voice={{
              supported: voice.supported,
              listening: voice.listening,
              transcribing: voice.transcribing,
              error: voice.error,
              onToggle: toggleVoice,
              onRetry: voice.retry,
            }}
          />
        </div>
      </div>
    </div>
  );
}
