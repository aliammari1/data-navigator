"use client";

// FACTS: the Moudir chat transcript, scrolled by AI Elements' Conversation
// (use-stick-to-bottom): stick-to-bottom while streaming, self-rendering
// jump-to-latest button.
//
// Jump-to-message has ONE owner: the screen writes store.pendingScrollToMessageId,
// this component reacts and calls consumePendingScroll() so the jump fires
// exactly once per request. Conversation exposes no imperative scroll API, so
// targets are tracked in a ref map and jumped to with scrollIntoView.
//
// Empty/loading states live OUTSIDE Conversation so an empty thread does not
// mount a viewport that immediately auto-scrolls.

import { ArrowDown, BarChart3, Brain, Database, FileSpreadsheet, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { basenameModel, humanizeModel } from "@/components/moudir-chat/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import { useMoudirChatStore } from "../../store/moudir-chat-store";
import { MoudirMessageBubble } from "./message-bubble";

/** How long a jumped-to message stays highlighted. */
const HIGHLIGHT_MS = 1600;

const EXAMPLE_QUESTIONS = [
  "Résume les colonnes de ce jeu de données",
  "Quelles lignes ont des valeurs manquantes ?",
  "Trace l'évolution mensuelle du total",
] as const;

function LoadingSkeleton() {
  return (
    <div
      aria-label="Chargement de la conversation"
      aria-busy="true"
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6"
      role="status"
    >
      {[0, 1, 2].map((row) => (
        <div className="flex gap-3" key={row}>
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

const CAPABILITY_CARDS = [
  {
    icon: Database,
    title: "SQL et requêtes DuckDB",
    desc: "Agrégations, filtres et jointures en lecture seule sans écrire de code.",
    prompt: "Résume les colonnes et types de ce jeu de données",
  },
  {
    icon: Brain,
    title: "Raisonnement et analyse",
    desc: "Analyse approfondie des causes, corrélations et tendances cachées.",
    prompt: "Quels sont les facteurs principaux influençant les résultats ?",
  },
  {
    icon: BarChart3,
    title: "Graphiques interactifs",
    desc: "Création de courbes, histogrammes et diagrammes ECharts.",
    prompt: "Génère un graphique montrant la répartition des valeurs",
  },
  {
    icon: FileSpreadsheet,
    title: "Qualité et profilage",
    desc: "Détection des anomalies, doublons et valeurs manquantes.",
    prompt: "Quelles colonnes ont des valeurs nulles ou des valeurs aberrantes ?",
  },
] as const;

function EmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-7 px-6 py-8 text-center animate-in fade-in duration-300">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl font-display">
          Que souhaitez-vous explorer ?
        </h2>
        <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
          Posez une question sur vos données, explorez des tendances ou effectuez des analyses SQL
          DuckDB en langage naturel.
        </p>
      </div>

      {/* Claude-style prompt suggestion cards */}
      <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {CAPABILITY_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.title}
              type="button"
              onClick={() => onAsk(card.prompt)}
              className="group flex flex-col justify-between gap-2.5 rounded-2xl border border-border/70 bg-card/60 p-4 text-left transition-all hover:border-primary/40 hover:bg-card hover:shadow-md"
            >
              <div className="flex items-start justify-between w-full">
                <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                  {card.title}
                </span>
                <div className="rounded-lg bg-primary/10 p-1.5 text-primary/80 group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                  <Icon className="size-4" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Quick suggested prompt pills */}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {EXAMPLE_QUESTIONS.map((question) => (
          <Button
            className="h-7 rounded-full text-xs font-normal border-border/70 bg-background/50 hover:bg-muted/80 hover:border-border transition-colors text-muted-foreground hover:text-foreground"
            key={question}
            onClick={() => onAsk(question)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Sparkles className="mr-1.5 size-3 text-primary" />
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}

function MessageThread() {
  const messages = useMoudirChatStore((s) => s.messages);
  const pendingScrollToMessageId = useMoudirChatStore((s) => s.pendingScrollToMessageId);
  const consumePendingScroll = useMoudirChatStore((s) => s.consumePendingScroll);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const registerItem = useCallback(
    (id: string) =>
      (el: HTMLDivElement | null): void => {
        if (el) itemRefs.current.set(id, el);
        else itemRefs.current.delete(id);
      },
    [],
  );

  // Single owner of "jump to this message": the store flag set by the screen.
  useEffect(() => {
    if (pendingScrollToMessageId == null) return;

    const targetId = String(pendingScrollToMessageId);
    // Wait one frame so a freshly opened conversation has its items mounted.
    const frame = requestAnimationFrame(() => {
      itemRefs.current.get(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    setHighlightedId(targetId);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => {
      setHighlightedId((current) => (current === targetId ? null : current));
    }, HIGHLIGHT_MS);

    consumePendingScroll();
    return () => cancelAnimationFrame(frame);
  }, [pendingScrollToMessageId, consumePendingScroll]);

  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === "assistant") return message.id;
    }
    return null;
  }, [messages]);

  return (
    <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
      {messages.map((message, index) => {
        const id = String(message.id);
        // Divider when the answering model changed mid-thread.
        let modelSeparator: string | null = null;
        if (message.role === "assistant" && message.model) {
          const current = basenameModel(message.model);
          for (let i = index - 1; i >= 0; i -= 1) {
            const prev = messages[i];
            if (prev?.role === "assistant" && prev.model) {
              const prevName = basenameModel(prev.model);
              if (prevName !== current) modelSeparator = message.model;
              break;
            }
          }
        }
        return (
          <div
            className={cn(
              "rounded-lg transition-colors",
              highlightedId === id && "bg-ai/10 ring-1 ring-ai/30",
            )}
            key={message.id}
            ref={registerItem(id)}
          >
            {modelSeparator ? (
              <div
                className="mb-4 flex items-center gap-3"
                role="separator"
                aria-label={`Modèle : ${humanizeModel(modelSeparator)}`}
              >
                <span aria-hidden className="h-px flex-1 bg-border/60" />
                <span className="text-[11px] text-muted-foreground">
                  Modèle : {humanizeModel(modelSeparator)}
                </span>
                <span aria-hidden className="h-px flex-1 bg-border/60" />
              </div>
            ) : null}
            <MoudirMessageBubble
              isLastAssistant={message.id === lastAssistantId}
              message={message}
            />
          </div>
        );
      })}
    </ConversationContent>
  );
}

export function MoudirMessageList() {
  const activeId = useMoudirChatStore((s) => s.activeId);
  const loadingConversation = useMoudirChatStore((s) => s.loadingConversation);
  const messageCount = useMoudirChatStore((s) => s.messages.length);
  const send = useMoudirChatStore((s) => s.send);

  if (loadingConversation) return <LoadingSkeleton />;
  if (messageCount === 0) {
    return <EmptyState onAsk={(question) => void send(question)} />;
  }

  return (
    // Remount per conversation so scroll state never leaks across threads.
    <Conversation key={activeId ?? "new"} aria-label="Conversation" className="h-full">
      <MessageThread />
      {/* Renders itself only while the viewport is not at the bottom. */}
      <ConversationScrollButton
        aria-label="Aller au dernier message"
        className="bottom-3 left-auto right-4 translate-x-0 rounded-full shadow-sm backdrop-blur"
        title="Aller au dernier message"
      >
        <ArrowDown className="size-4" />
      </ConversationScrollButton>
    </Conversation>
  );
}
