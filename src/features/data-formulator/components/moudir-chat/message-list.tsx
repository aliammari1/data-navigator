"use client";

/**
 * MoudirMessageList — the scrolling thread.
 *
 * Auto-sticks to the bottom while a turn streams, but respects the user: if
 * they've scrolled up to read, incoming tokens don't yank them back down. A new
 * message (their own send, or a fresh assistant turn) always scrolls into view.
 *
 * Empty thread → a warm Moudir intro (the م mark + a one-line invitation + three
 * example questions that send on click). While a saved conversation loads →
 * quiet skeleton rows (no spinner).
 */

import { useEffect, useRef } from "react";
import { cn } from "@/shared/utils";
import { useMoudirChatStore } from "../../store/moudir-chat-store";
import { MoudirMark } from "../moudir/moudir-kit";
import { MoudirMessageBubble } from "./message-bubble";

/** Distance from the bottom (px) within which streaming keeps auto-scrolling. */
const NEAR_BOTTOM_PX = 96;

const EXAMPLE_QUESTIONS = [
  "Quelles sont les tendances des transactions ce mois-ci ?",
  "Montre-moi le top 5 des canaux par revenu.",
  "Y a-t-il des anomalies récentes dans les données ?",
] as const;

function EmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="grid min-h-full place-items-center px-4 py-10 text-center">
      <div className="flex max-w-md flex-col items-center">
        <MoudirMark size={52} />
        <p className="mt-4 text-lg font-medium text-foreground">
          Posez une question sur vos données…
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Moudir interroge, profile et visualise vos données — en français, hors ligne.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {EXAMPLE_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onAsk(question)}
              className={cn(
                "rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground",
                "transition-colors hover:border-ai/40 hover:bg-ai/5 hover:text-foreground",
                "focus-visible:border-ai/60 focus-visible:ring-2 focus-visible:ring-ai/30 focus-visible:outline-none",
              )}
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Quiet placeholder rows while a saved conversation rehydrates. */
function LoadingSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6"
      role="status"
      aria-busy="true"
      aria-label="Chargement de la conversation"
    >
      <div className="flex justify-end">
        <div className="h-10 w-48 animate-pulse rounded-2xl rounded-br-md bg-muted" />
      </div>
      <div className="flex gap-3">
        <div className="size-8 shrink-0 animate-pulse rounded-2xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-36 animate-pulse rounded-2xl rounded-br-md bg-muted" />
      </div>
    </div>
  );
}

export function MoudirMessageList() {
  const messages = useMoudirChatStore((s) => s.messages);
  const loadingConversation = useMoudirChatStore((s) => s.loadingConversation);
  const send = useMoudirChatStore((s) => s.send);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  // Stick to bottom on a new message; while streaming, only if already near it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;
    if (grew || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;

  return (
    <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
      {loadingConversation ? (
        <LoadingSkeleton />
      ) : messages.length === 0 ? (
        <EmptyState onAsk={(question) => void send(question)} />
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
          {messages.map((message) => (
            <MoudirMessageBubble
              key={message.id}
              message={message}
              isLastAssistant={message.id === lastAssistantId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
