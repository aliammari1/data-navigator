"use client";

/**
 * Moudir chat composer — the one place the analyst talks to Moudir.
 *
 * Wires four things over the chat store and the data store:
 *   - an auto-growing textarea (1–6 rows) with Enter-to-send / Shift+Enter for a
 *     newline, and Esc-to-stop while a turn streams;
 *   - a primary action button that MORPHS between Send (idle) and a Stop square
 *     (streaming), reading `store.status` so it is always honest about state;
 *   - "@" mentions of datasets/columns (see mention-popover) so prompts can name
 *     real fields, and follow-up chips that re-ask suggested next questions.
 *
 * Every turn carries the active dataset id into `send(text, { datasetId })` so the
 * runtime scopes tools to what the user is looking at (model stays undefined — the
 * runtime resolves the default).
 */

import { Send, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useActiveDatasetId, useDatasets } from "@/core/stores/data-store";
import { useMoudirChatStore } from "../../store/moudir-chat-store";
import {
  applyMention,
  detectMention,
  type MentionItem,
  MentionPopover,
  type MentionQuery,
} from "./mention-popover";

const MAX_MENTION_ITEMS = 50;
const FOCUS_EVENT = "moudir-chat:focus-composer";

export function ChatComposer() {
  const status = useMoudirChatStore((s) => s.status);
  const followUps = useMoudirChatStore((s) => s.followUps);
  const send = useMoudirChatStore((s) => s.send);
  const cancel = useMoudirChatStore((s) => s.cancel);
  const streaming = status === "streaming";

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

  // ─── Mention data ───────────────────────────────────────────────────────

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

  const mentionOpen = mention !== null && mentionItems.length > 0;

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

  // ─── Sending ────────────────────────────────────────────────────────────

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue("");
    setMention(null);
    void send(text, { datasetId: activeDatasetId });
  }, [value, streaming, send, activeDatasetId]);

  const sendChip = useCallback(
    (text: string) => {
      if (streaming) return;
      void send(text, { datasetId: activeDatasetId });
    },
    [streaming, send, activeDatasetId],
  );

  // ─── Textarea events ────────────────────────────────────────────────────

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

      if (event.key === "Escape") {
        if (streaming) {
          event.preventDefault();
          cancel();
        }
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
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
      submit,
    ],
  );

  // Open a mention from the "@" affordance button.
  const openMention = useCallback(() => {
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
  }, [value]);

  // ─── Focus bridge ───────────────────────────────────────────────────────

  useEffect(() => {
    const focus = () => textareaRef.current?.focus();
    window.addEventListener(FOCUS_EVENT, focus);
    return () => window.removeEventListener(FOCUS_EVENT, focus);
  }, []);

  const canSend = value.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      <MentionPopover
        open={mentionOpen}
        items={filtered}
        activeId={activeMentionId}
        onActiveIdChange={setActiveMentionId}
        onSelect={insertMention}
        onOpenChange={(open) => {
          if (!open) closeMention();
        }}
      >
        <div className="rounded-2xl border border-border bg-card shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
          <Textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={(event) => syncMention(event.currentTarget)}
            onClick={(event) => syncMention(event.currentTarget)}
            placeholder="Posez une question sur vos données…  @ pour citer un jeu ou une colonne"
            aria-label="Message pour Moudir"
            className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />

          <div className="flex items-center gap-1 px-2 pt-0 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={openMention}
              aria-label="Citer un jeu de données ou une colonne"
              title="Citer un jeu de données ou une colonne"
              className="font-mono text-sm text-muted-foreground"
            >
              @
            </Button>

            <div className="ml-auto" />

            <Button
              type="button"
              size="icon"
              onClick={streaming ? cancel : submit}
              disabled={!streaming && !canSend}
              aria-label={streaming ? "Arrêter la génération" : "Envoyer"}
              title={streaming ? "Arrêter" : "Envoyer"}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/80"
            >
              {streaming ? <Square className="fill-current" /> : <Send />}
            </Button>
          </div>
        </div>
      </MentionPopover>

      {followUps.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {followUps.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => sendChip(chip)}
              disabled={streaming}
              className="rounded-full border border-ai/30 bg-ai/10 px-3 py-1 text-left text-xs text-ai transition-colors hover:bg-ai/20 disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
