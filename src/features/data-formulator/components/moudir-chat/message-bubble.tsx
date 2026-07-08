"use client";

/**
 * MoudirMessageBubble — one turn in the thread.
 *
 * User turns: a compact right-aligned bubble (bg-primary/10), plain text, with
 * hover actions to Copy or Éditer. Editing swaps the bubble for a textarea;
 * Enter re-sends from that message (an implicit fork via editAndResend).
 *
 * Assistant turns: full-width, left-aligned, led by the م mark. The prose is
 * streamed markdown (Streamdown, which auto-closes incomplete fences), and the
 * message's structured parts render in order — tool chips (collapsed) and inline
 * chart artifacts. An honest shimmer status shows before prose starts; a caret
 * trails the prose while streaming; a destructive note surfaces a failed turn.
 * Hover actions: Copy, and Regénérer on the latest assistant turn.
 */

import { Check, Copy, Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/shared/utils";
import { type ChatMessage, useMoudirChatStore } from "../../store/moudir-chat-store";
import { MoudirMark } from "../moudir/moudir-kit";
import { ChatChartArtifact } from "./chat-chart-artifact";
import { ReasoningStatus } from "./reasoning-status";
import { MoudirToolChip } from "./tool-chip";

const COPY_FEEDBACK_MS = 2000;

/** Tailwind-only prose styling for Streamdown (its stylesheet isn't imported). */
const PROSE_CLASS = cn(
  "space-y-2 text-sm leading-relaxed text-foreground",
  "[&_p]:my-0 [&_p]:break-words",
  "[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_a]:text-ai [&_a]:underline [&_a]:underline-offset-2",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-1 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
  "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-ai/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
);

/** Ghost icon button used in the hover action rows. */
function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:text-foreground"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon />
    </Button>
  );
}

/** Copy-to-clipboard action with a brief confirmation swap. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? "Copié" : "Copier"}
      title={copied ? "Copié" : "Copier"}
      className="text-muted-foreground hover:text-foreground"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
          })
          .catch(() => {});
      }}
    >
      {copied ? <Check className="text-primary" /> : <Copy />}
    </Button>
  );
}

/** Reveal-on-hover action row wrapper. */
function ActionRow({ children, align }: { children: React.ReactNode; align: "start" | "end" }) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 opacity-0 transition-opacity",
        "group-hover:opacity-100 focus-within:opacity-100",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {children}
    </div>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  const status = useMoudirChatStore((s) => s.status);
  const editAndResend = useMoudirChatStore((s) => s.editAndResend);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setEditing(false);
    void editAndResend(message.id, trimmed);
  };

  const cancel = () => {
    setDraft(message.content);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="group flex w-full justify-end">
        <div className="w-[min(34rem,85%)]">
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className="min-h-16 bg-card text-sm"
            aria-label="Modifier le message"
          />
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-muted-foreground">
              Entrée pour renvoyer · Échap pour annuler
            </span>
            <Button type="button" variant="ghost" size="xs" onClick={cancel}>
              Annuler
            </Button>
            <Button
              type="button"
              size="xs"
              onClick={submit}
              disabled={status === "streaming" || draft.trim().length === 0}
            >
              Renvoyer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex w-full justify-end">
      <div className="flex max-w-[85%] flex-col items-end gap-1">
        <div className="rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-foreground">
          {message.content}
        </div>
        <ActionRow align="end">
          <CopyButton text={message.content} />
          <ActionButton
            icon={Pencil}
            label="Éditer"
            disabled={status === "streaming"}
            onClick={() => {
              setDraft(message.content);
              setEditing(true);
            }}
          />
        </ActionRow>
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  isLastAssistant,
}: {
  message: ChatMessage;
  isLastAssistant: boolean;
}) {
  const status = useMoudirChatStore((s) => s.status);
  const regenerateLast = useMoudirChatStore((s) => s.regenerateLast);
  const streaming = message.status === "streaming";
  const hasContent = message.content.trim().length > 0;

  return (
    <div className="group flex w-full gap-3">
      <MoudirMark size={30} thinking={streaming} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-2">
        <ReasoningStatus message={message} />

        {message.parts.length > 0 ? (
          <div className="space-y-1.5">
            {message.parts.map((part, i) =>
              part.kind === "chart" ? (
                <ChatChartArtifact key={`chart-${i}`} part={part} />
              ) : (
                <MoudirToolChip key={`tool-${i}`} part={part} />
              ),
            )}
          </div>
        ) : null}

        {hasContent ? (
          <div>
            <Streamdown className={PROSE_CLASS}>{message.content}</Streamdown>
            {streaming ? (
              <span
                className="ml-0.5 inline-block h-3.5 w-[3px] animate-pulse rounded-full bg-ai align-middle"
                aria-hidden="true"
              />
            ) : null}
          </div>
        ) : null}

        {message.status === "error" ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{message.error ?? "Une erreur est survenue."}</span>
          </div>
        ) : null}

        {!streaming ? (
          <ActionRow align="start">
            <CopyButton text={message.content} />
            {isLastAssistant ? (
              <ActionButton
                icon={RotateCcw}
                label="Regénérer"
                disabled={status === "streaming"}
                onClick={() => void regenerateLast()}
              />
            ) : null}
          </ActionRow>
        ) : null}
      </div>
    </div>
  );
}

export function MoudirMessageBubble({
  message,
  isLastAssistant = false,
}: {
  message: ChatMessage;
  isLastAssistant?: boolean;
}) {
  if (message.role === "user") return <UserBubble message={message} />;
  return <AssistantBubble message={message} isLastAssistant={isLastAssistant} />;
}
