"use client";

/**
 * Moudir chat composer — built on the AI Elements PromptInput family.
 *
 * FACTS
 *  - Rendered by MoudirChatScreen under <MoudirMessageList/>.
 *  - PromptInput is a <form>. PromptInputTextarea carries name="message" and
 *    owns Enter-to-submit / Shift+Enter internally, but it calls our onKeyDown
 *    FIRST and bails when defaultPrevented — so the "@" mention popover keeps
 *    Enter/Tab/Arrows/Escape by calling preventDefault().
 *  - The store's ChatStatus (idle | loading-model | streaming | error) is NOT
 *    the AI SDK ChatStatus PromptInputSubmit expects (ready | submitted |
 *    streaming | error); toChatStatus() maps it so the button shows the right
 *    Spinner / Square / X and stops instead of sending mid-turn.
 *  - Model picker uses PromptInputActionMenu (a DropdownMenu) rather than
 *    PromptInputSelect: non-installed GGUFs must stay visible but disabled,
 *    which a Select cannot express.
 *  - Follow-ups use AI Elements Suggestions.
 *  - Attachments (PromptInputActionAddAttachments) are for SMALL reference
 *    files only — PromptInput's submit handler base64-encodes every file
 *    (blob: URL -> data: URL) before onSubmit fires. That's fine for a
 *    screenshot or a short text snippet, but wrong for real dataset import:
 *    a 50MB CSV becomes a ~67MB base64 string in memory and in state. Real
 *    dataset import (CSV/XLSX/Parquet -> DuckDB) should go through the
 *    existing native import dialog (see TODO below), not this pipeline.
 *  - There is no built-in @mention/slash-command system in AI Elements
 *    (see open issue vercel/ai-elements#179) — MentionPopover below is
 *    intentionally custom, not a stopgap.
 *  - No voice dictation: the SpeechInput path was removed with the rest
 *    of the voice features (mic/STT/TTS). The composer is text-only.
 */

import type { ChatStatus } from "ai";
import { Check, ChevronDown, Cpu, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Attachment,
  type AttachmentData,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useActiveDatasetId, useDatasets } from "@/core/stores/data-store";
import { useModelStatus } from "@/platform/ai/models";
import { useModelRequiredDialogStore } from "@/platform/ai/models/model-required-dialog-store";
import { useAIRuntimeStore } from "@/platform/ai/provider";
import { cn } from "@/shared/utils";
import {
  CHAT_CONTEXT_MAX_TOKENS,
  estimateUsedTokens,
  type ChatStatus as MoudirChatStatus,
  useMoudirChatStore,
} from "../../store/moudir-chat-store";
import { ChatClarificationDock } from "./chat-clarification-dock";
import {
  applyMention,
  detectMention,
  type MentionItem,
  MentionPopover,
  type MentionQuery,
} from "./mention-popover";

const MAX_MENTION_ITEMS = 50;
const FOCUS_EVENT = "moudir-chat:focus-composer";
export const PREFILL_EVENT = "moudir-chat:prefill-composer";

const ATTACHMENT_ACCEPT = "image/*,text/*,application/json,.csv,.xlsx,.xls,.parquet,.txt,.pdf";
// Kept small on purpose: attachments are base64-encoded in memory before submit.
// Real large dataset files must go through the native import dialog instead.
const ATTACHMENT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ATTACHMENT_MAX_FILES = 5;

/** Store status -> the AI SDK ChatStatus that PromptInputSubmit renders from. */
function toChatStatus(status: MoudirChatStatus): ChatStatus {
  switch (status) {
    case "streaming":
      return "streaming";
    case "loading-model":
      return "submitted";
    case "error":
      return "error";
    default:
      return "ready";
  }
}

// Attachment strip, rendered inside PromptInputHeader (appears above the textarea).
const ChatComposerAttachments = () => {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <Attachments variant="inline" className="px-2 pt-2">
      {attachments.files.map((attachment) => (
        <AttachmentHoverCard key={attachment.id}>
          <AttachmentHoverCardTrigger asChild>
            <div className="inline-flex">
              <Attachment data={attachment} onRemove={() => attachments.remove(attachment.id)}>
                <AttachmentPreview />
                <AttachmentInfo showMediaType />
                <AttachmentRemove label="Supprimer" />
              </Attachment>
            </div>
          </AttachmentHoverCardTrigger>
          <AttachmentHoverCardContent>
            <div className="flex max-w-xs flex-col gap-1.5 p-1 text-xs">
              {attachment.mediaType?.startsWith("image/") && attachment.url && (
                <img
                  src={attachment.url}
                  alt={attachment.filename || "Aperçu"}
                  className="max-h-48 max-w-full rounded border object-contain"
                />
              )}
              <span className="font-semibold truncate text-foreground">
                {attachment.filename || "Pièce jointe"}
              </span>
              {attachment.mediaType && (
                <span className="text-[11px] text-muted-foreground">{attachment.mediaType}</span>
              )}
            </div>
          </AttachmentHoverCardContent>
        </AttachmentHoverCard>
      ))}
    </Attachments>
  );
};

export function ChatComposer() {
  const status = useMoudirChatStore((s) => s.status);
  const followUps = useMoudirChatStore((s) => s.followUps);
  const send = useMoudirChatStore((s) => s.send);
  const cancel = useMoudirChatStore((s) => s.cancel);
  const messages = useMoudirChatStore((s) => s.messages);
  const compactConversation = useMoudirChatStore((s) => s.compactConversation);
  const activeModel = useAIRuntimeStore((s) => s.model);
  const setModel = useAIRuntimeStore((s) => s.setModel);
  const streaming = status === "streaming";

  const usedTokens = useMemo(() => estimateUsedTokens(messages), [messages]);
  const isHighContext = usedTokens / CHAT_CONTEXT_MAX_TOKENS > 0.75;
  const canCompact = messages.length >= 3 && status === "idle";
  // "loading-model" must block input too: the weights are still staging, so a
  // second send would silently queue a turn the user cannot see. Only "idle"
  // accepts a new prompt; "streaming" still allows the Stop action.
  const busy = status !== "idle";
  const { records } = useModelStatus();
  const showDialog = useModelRequiredDialogStore((s) => s.show);

  const datasets = useDatasets();
  const activeDatasetId = useActiveDatasetId();
  const activeDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === activeDatasetId),
    [datasets, activeDatasetId],
  );

  const [value, setValue] = useState("");
  const [mention, setMention] = useState<MentionQuery | null>(null);

  const [activeMentionId, setActiveMentionId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeRecord = useMemo(
    () => records.find((r) => r.lane === "llm" && `${r.key}.gguf` === activeModel),
    [records, activeModel],
  );

  const chatRecords = useMemo(() => records.filter((r) => r.lane === "llm"), [records]);

  // ─── Mention data ───────────────────────────────────────────────

  const mentionItems = useMemo<MentionItem[]>(() => {
    const datasetItems: MentionItem[] = datasets.map((dataset) => ({
      id: `ds:${dataset.id}`,
      label: dataset.name,
      insertText: dataset.name,
      kind: "dataset",
      detail: `${dataset.rowCount.toLocaleString("fr-FR")} lignes`,
    }));
    const columnItems: MentionItem[] = (activeDataset?.columns ?? []).map((column) => ({
      id: `col:${column.name}`,
      label: column.name,
      insertText: column.name,
      kind: "column",
      detail: column.type,
    }));
    return [...datasetItems, ...columnItems];
  }, [datasets, activeDataset]);

  const filtered = useMemo<MentionItem[]>(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    const matches = query
      ? mentionItems.filter((item) => item.label.toLowerCase().includes(query))
      : mentionItems;
    return matches.slice(0, MAX_MENTION_ITEMS);
  }, [mention, mentionItems]);

  const mentionOpen = mention !== null;

  // Keep the highlight on a still-visible row as the filter narrows.
  useEffect(() => {
    if (filtered.length === 0) {
      setActiveMentionId(null);
      return;
    }
    setActiveMentionId((current) =>
      current && filtered.some((item) => item.id === current) ? current : filtered[0].id,
    );
  }, [filtered]);

  const closeMention = useCallback(() => setMention(null), []);

  const insertMention = useCallback(
    (item: MentionItem) => {
      const el = textareaRef.current;
      if (!el || !mention) return;
      const caret = el.selectionStart ?? value.length;
      const next = applyMention(value, mention.start, caret, item.insertText);
      setValue(next.value);
      setMention(null);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      });
    },
    [mention, value],
  );

  const moveHighlight = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      const index = Math.max(
        0,
        filtered.findIndex((item) => item.id === activeMentionId),
      );
      const next = (index + delta + filtered.length) % filtered.length;
      setActiveMentionId(filtered[next].id);
    },
    [filtered, activeMentionId],
  );

  // ─── Sending ───────────────────────────────────────────────────

  const resolveModelForChat = useCallback((): string | undefined => {
    if (activeModel) {
      const installed = records.some(
        (r) => r.lane === "llm" && `${r.key}.gguf` === activeModel && r.state === "present",
      );
      if (installed) return activeModel;
    }
    const firstInstalled = records.find((r) => r.lane === "llm" && r.state === "present");
    if (firstInstalled) {
      const ggufFile = `${firstInstalled.key}.gguf`;
      setModel(ggufFile);
      return ggufFile;
    }
    return undefined;
  }, [activeModel, records, setModel]);

  const submitText = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setValue("");
      setMention(null);
      void send(text, { datasetId: activeDatasetId, model: resolveModelForChat() });
    },
    [busy, send, activeDatasetId, resolveModelForChat],
  );

  // PromptInput hands us the parsed message; `text` comes from the form field,
  // which mirrors our controlled `value`. Falling back to `value` keeps sends
  // working even if the form resets before FormData is read.
  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const rawText = (message.text || value).trim();
      const rawFiles = message.files || [];
      const attachments: AttachmentData[] = rawFiles.map((file, i) => ({
        ...file,
        id: `att-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      }));

      if (busy) return;
      if (!rawText && attachments.length === 0) return;

      setValue("");
      setMention(null);

      const promptToSend = rawText || (attachments.length > 0 ? "Voici les pièces jointes." : "");
      void send(promptToSend, {
        datasetId: activeDatasetId,
        model: resolveModelForChat(),
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    },
    [busy, value, send, activeDatasetId, resolveModelForChat],
  );

  const sendChip = useCallback(
    (text: string) => {
      if (busy) return;
      void send(text, { datasetId: activeDatasetId, model: resolveModelForChat() });
    },
    [busy, send, activeDatasetId, resolveModelForChat],
  );

  // ─── Textarea events ────────────────────────────────────────────

  const syncMention = useCallback((el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length;
    setMention(detectMention(el.value, caret));
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(event.target.value);
      syncMention(event.target);
    },
    [syncMention],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Every branch below calls preventDefault(), which is exactly how we take
      // Enter/Tab/Arrows away from PromptInputTextarea's built-in submit: it
      // returns early when the event is already defaultPrevented.
      if (mentionOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveHighlight(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveHighlight(-1);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const item =
            filtered.find((candidate) => candidate.id === activeMentionId) ?? filtered[0];
          if (item) insertMention(item);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeMention();
          return;
        }
      }

      if (event.key === "Escape" && streaming) {
        // The screen also binds Escape (close canvas / drawer). Without this the
        // same keypress would stop the turn AND collapse the canvas.
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    },
    [
      mentionOpen,
      filtered,
      activeMentionId,
      moveHighlight,
      insertMention,
      closeMention,
      streaming,
      cancel,
    ],
  );

  // Open a mention from the "@" affordance button.
  const openMention = useCallback(() => {
    if (mentionOpen) {
      closeMention();
      return;
    }
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const head = value.slice(0, caret);
    const tail = value.slice(caret);
    const insert = head && !/\s$/.test(head) ? " @" : "@";
    const nextValue = head + insert + tail;
    const nextCaret = head.length + insert.length;
    setValue(nextValue);
    setMention({ query: "", start: nextCaret - 1 });
    setActiveMentionId(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCaret, nextCaret);
    });
  }, [mentionOpen, closeMention, value]);

  // ─── Focus bridge ───────────────────────────────────────────────

  useEffect(() => {
    const focus = () => textareaRef.current?.focus();
    const handlePrefill = (e: Event) => {
      const custom = e as CustomEvent<{ text: string; autoSend?: boolean }>;
      if (!custom.detail?.text) return;
      const { text, autoSend } = custom.detail;
      if (autoSend && !busy) {
        void send(text, { datasetId: activeDatasetId, model: resolveModelForChat() });
      } else {
        setValue(text);
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      }
    };

    window.addEventListener(FOCUS_EVENT, focus);
    window.addEventListener(PREFILL_EVENT, handlePrefill as EventListener);
    return () => {
      window.removeEventListener(FOCUS_EVENT, focus);
      window.removeEventListener(PREFILL_EVENT, handlePrefill as EventListener);
    };
  }, [busy, send, activeDatasetId, resolveModelForChat]);

  const canSend = value.trim().length > 0;
  const stoppable = streaming || status === "loading-model";

  return (
    <div className="flex flex-col gap-2">
      <ChatClarificationDock />
      <MentionPopover
        activeId={activeMentionId}
        items={filtered}
        onActiveIdChange={setActiveMentionId}
        onOpenChange={(open) => {
          if (!open) closeMention();
        }}
        onSelect={insertMention}
        open={mentionOpen}
      >
        <PromptInput
          className="[&>*]:rounded-2xl [&>*]:flex-col [&>*]:h-auto [&>*]:items-stretch"
          onSubmit={handleSubmit}
          globalDrop
          multiple
          accept={ATTACHMENT_ACCEPT}
          maxFiles={ATTACHMENT_MAX_FILES}
          maxFileSize={ATTACHMENT_MAX_FILE_SIZE}
          onError={(err) => {
            // TODO: route to the app's real toast/notification system.
            console.error("[ChatComposer] Attachment error:", err.code, err.message);
          }}
        >
          <PromptInputHeader>
            <ChatComposerAttachments />
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea
              aria-label="Message pour Moudir"
              onChange={handleChange}
              onClick={(event) => syncMention(event.currentTarget)}
              onKeyDown={handleKeyDown}
              onKeyUp={(event) => syncMention(event.currentTarget)}
              placeholder="Posez une question sur vos données…  @ pour citer un jeu ou une colonne"
              ref={textareaRef}
              value={value}
            />

            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputButton
                  aria-label="Citer un jeu de données ou une colonne"
                  className="font-mono text-sm text-muted-foreground"
                  onClick={openMention}
                  tooltip="Citer un jeu de données ou une colonne"
                >
                  @
                </PromptInputButton>

                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger
                    aria-label="Changer le modèle actif"
                    className={cn(
                      "gap-1 rounded-full border px-2 text-[10px]",
                      activeRecord?.state === "present"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400",
                    )}
                  >
                    <Cpu className="size-3" />
                    <span className="max-w-[14ch] truncate" title={activeRecord?.label}>
                      {activeRecord?.label ?? "Aucun modèle"}
                    </span>
                    <ChevronDown className="size-3" />
                  </PromptInputActionMenuTrigger>
                  <PromptInputActionMenuContent className="min-w-[20rem]">
                    <PromptInputActionAddAttachments label="Joindre un fichier de référence" />
                    <PromptInputActionAddScreenshot label="Capturer l'écran" />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Choisir un modèle</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      onValueChange={(next) => {
                        if (next) setModel(next);
                      }}
                      value={activeModel ?? ""}
                    >
                      {chatRecords.map((record) => {
                        const ggufFile = `${record.key}.gguf`;
                        const installed = record.state === "present";
                        return (
                          <DropdownMenuRadioItem
                            className="flex items-start gap-2 py-2"
                            disabled={!installed}
                            key={record.key}
                            value={ggufFile}
                          >
                            <div className="flex min-w-0 flex-col">
                              <span className="font-medium text-xs">{record.label}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {record.sizeLabel}
                                {record.optional ? " · optionnel" : ""}
                                {installed ? " · installé" : " · non téléchargé"}
                                {!record.capabilities.tools ? " · sans outils" : ""}
                              </span>
                              {record.capabilityNote ? (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                  {record.capabilityNote}
                                </span>
                              ) : null}
                            </div>
                            {installed && activeModel === ggufFile ? (
                              <Check className="mt-0.5 ml-auto size-3.5 text-primary" />
                            ) : null}
                          </DropdownMenuRadioItem>
                        );
                      })}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-[11px] text-muted-foreground"
                      onSelect={() => showDialog("Choisissez un modèle pour Moudir.")}
                    >
                      <Download className="mr-2 size-3.5" />
                      Ouvrir le Setup de téléchargement…
                    </DropdownMenuItem>
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>

                <Context
                  maxTokens={CHAT_CONTEXT_MAX_TOKENS}
                  usedTokens={usedTokens}
                  modelId={activeModel ?? undefined}
                >
                  <ContextTrigger />
                  <ContextContent>
                    <ContextContentHeader />
                    <ContextContentBody className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Mémoire locale</span>
                        <span
                          className={cn(
                            "font-medium text-[11px]",
                            isHighContext
                              ? "text-amber-500 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {isHighContext ? "Saturation proche (>75%)" : "Mémoire optimale"}
                        </span>
                      </div>
                      {canCompact ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full text-xs h-7 mt-1.5 gap-1.5"
                          onClick={() => void compactConversation()}
                        >
                          <span>🧹 Compacter l'historique</span>
                        </Button>
                      ) : null}
                    </ContextContentBody>
                    <ContextContentFooter />
                  </ContextContent>
                </Context>
              </PromptInputTools>

              <PromptInputSubmit
                aria-label={
                  streaming
                    ? "Arrêter la génération"
                    : status === "loading-model"
                      ? "Chargement du modèle… (Échap pour annuler)"
                      : "Envoyer"
                }
                disabled={stoppable ? false : busy || !canSend}
                onStop={cancel}
                status={toChatStatus(status)}
              />
            </PromptInputFooter>
          </PromptInputBody>
        </PromptInput>
      </MentionPopover>

      {activeRecord && activeRecord.state === "present" && !activeRecord.capabilities.tools ? (
        <p className="px-1 text-[11px] text-muted-foreground" role="note">
          {activeRecord.capabilityNote ??
            "Ce modèle ne gère pas les outils : conversation seule, sans données ni graphiques."}{" "}
          Choisissez un modèle compatible pour l'analyse.
        </p>
      ) : null}

      {followUps.length > 0 ? (
        <Suggestions>
          {followUps.map((chip) => (
            <Suggestion
              className="border-ai/30 bg-ai/10 text-ai hover:bg-ai/20"
              disabled={busy}
              key={chip}
              onClick={sendChip}
              suggestion={chip}
            />
          ))}
        </Suggestions>
      ) : null}
    </div>
  );
}
