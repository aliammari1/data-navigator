"use client";

/**
 * MoudirMessageBubble — one turn in the thread, composed from AI Elements.
 *
 * FACTS
 *  - Imported by ./message-list.tsx only.
 *  - Built on src/components/ai-elements/*: Message / MessageContent /
 *    MessageActions / MessageAction (message.tsx), Tool* (tool.tsx), Sources*
 *    (sources.tsx), Reasoning* (reasoning.tsx), Suggestions (suggestion.tsx).
 *  - Prose still routes through ./message-content (MoudirProse): Moudir emits
 *    js-run / python-run fences that must become executable cards, and a bare
 *    MessageResponse would print them as dead code blocks.
 *  - Reads store: status, editAndResend, regenerateLast, answerClarification.
 *  - French-first copy. Replaces tool-chip.tsx, message-citations.tsx and
 *    reasoning-status.tsx as render paths.
 */

import type { ToolUIPart } from "ai";
import {
  Brain,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Cpu,
  Hash,
  Maximize2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Type,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  getAttachmentLabel,
} from "@/components/ai-elements/attachments";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { humanizeModel } from "@/components/moudir-chat/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDataStore } from "@/core/stores/data-store";
import { useEnableMoudirSandbox } from "@/core/stores/settings-store";
import { cn } from "@/shared/utils";
import {
  type ChatMessage,
  type CitationPart,
  type ClarificationPart,
  type ToolPart,
  useMoudirChatStore,
} from "../../store/moudir-chat-store";
import { MoudirMark } from "../moudir/moudir-kit";
import { ChatChartArtifact } from "./chat-chart-artifact";
import { MessageContent as MoudirProse } from "./message-content";
import { parseCitations } from "./parse-citations";
import { parseThinking } from "./parse-thinking";
import { WordDiff } from "./word-diff";

const COPY_FEEDBACK_MS = 2000;

const TOOL_LABELS: Record<string, string> = {
  run_sql: "Requête SQL",
  get_schema: "Schéma",
  profile_column: "Profil colonne",
};

function toolLabel(name: string): string {
  const known = TOOL_LABELS[name];
  if (known) return known;
  const spaced = name.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Outil";
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/** Compact clock label: "14:32" today, "Hier 14:32", else "12 juin, 14:32". */
export function formatMessageTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const clock = timeFmt.format(d);
  if (diffDays <= 0) return clock;
  if (diffDays === 1) return `Hier ${clock}`;
  return `${dayFmt.format(d)}, ${clock}`;
}

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

/** Store ToolPart -> the AI Elements tool lifecycle state. */
function toolState(part: ToolPart): ToolUIPart["state"] {
  if (part.failed) return "output-error";
  return part.resultSummary.trim().length > 0 ? "output-available" : "input-available";
}

/** "340 ms" / "1.2 s" — empty when there's no meaningful duration. */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Copy-to-clipboard, as an AI Elements MessageAction. */
function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const label = copied ? "Copié" : "Copier";
  return (
    <MessageAction
      tooltip={label}
      label={label}
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
    </MessageAction>
  );
}

/** French label per citation kind. */
const SOURCE_LABEL: Record<CitationPart["sourceKind"], string> = {
  column: "Colonne",
  dataset: "Jeu de données",
  query: "Requête",
  table: "Table",
};

/**
 * The trailing "Sources" block as an AI Elements Sources collapsible. These
 * citations point at local tables/columns/queries rather than URLs, so each
 * Source renders French children instead of a link target.
 */
function MessageSources({ citations }: { citations: CitationPart[] }) {
  return (
    <Sources>
      <SourcesTrigger count={citations.length}>
        <p className="font-medium">
          {citations.length === 1 ? "1 source" : `${citations.length} sources`}
        </p>
        <ChevronDown className="size-4" />
      </SourcesTrigger>
      <SourcesContent>
        {citations.map((citation) => (
          <Source key={`${citation.sourceKind}-${citation.label}-${citation.query ?? ""}`}>
            <Badge variant="secondary" className="shrink-0 font-normal">
              {SOURCE_LABEL[citation.sourceKind]}
            </Badge>
            <span className="min-w-0 font-medium break-words">{citation.label}</span>
            {citation.detail ? (
              <span className="text-muted-foreground">({citation.detail})</span>
            ) : null}
          </Source>
        ))}
      </SourcesContent>
    </Sources>
  );
}

/**
 * One tool call, as an AI Elements Tool collapsible. The store's ToolPart is
 * adapted to the AI SDK shape: `tool-<name>` as the type, a lifecycle state
 * derived from failed/resultSummary, and the French label as the title.
 * resultSummary is prose, so it is handed over as an element — ToolOutput
 * renders a bare string inside a JSON CodeBlock, which would be unreadable.
 */
function extractSqlQuery(params: unknown): string | null {
  if (
    params &&
    typeof params === "object" &&
    "query" in params &&
    typeof (params as { query: unknown }).query === "string"
  ) {
    return (params as { query: string }).query;
  }
  return null;
}

function MessageTool({ part }: { part: ToolPart }) {
  const label = toolLabel(part.name);
  const duration = formatDuration(part.durationMs);
  const summary = part.resultSummary.trim();
  const isRunning = !part.failed && !summary;
  const openCanvas = useMoudirChatStore((s) => s.openCanvas);
  const sqlQuery = part.name === "run_sql" ? extractSqlQuery(part.params) : null;

  return (
    <Tool defaultOpen={part.failed}>
      <ToolHeader
        state={isRunning ? "input-available" : toolState(part)}
        title={label}
        type={`tool-${part.name}`}
      />
      <ToolContent>
        <ToolInput input={part.params} />
        <ToolOutput
          errorText={part.failed ? summary || "Échec de l'outil." : undefined}
          output={
            !part.failed && summary ? (
              <div className="space-y-2">
                <div className="max-h-60 overflow-y-auto rounded border border-border/40 bg-muted/20 p-2 font-mono text-xs break-words whitespace-pre-wrap">
                  {summary}
                </div>
                {duration ? (
                  <div className="text-right font-mono text-[10px] text-muted-foreground/70">
                    {duration}
                  </div>
                ) : null}
                {sqlQuery ? (
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 text-[11px] px-2"
                      onClick={() =>
                        openCanvas({
                          kind: "sql",
                          title: "Requête SQL",
                          query: sqlQuery,
                          dataset: null,
                        })
                      }
                    >
                      <Maximize2 className="size-3" />
                      <span>Canevas</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : undefined
          }
        />
      </ToolContent>
    </Tool>
  );
}

/**
 * A clarification request, answered with AI Elements Suggestion pills. Once
 * answered the choice is frozen into a Badge so a reopened conversation shows
 * what was decided instead of re-prompting.
 */
/**
 * Models sometimes inline the options into the question
 * ("… Options: (1) a, (2) b"). The pills below already carry them, so the
 * inline enumeration is cut for display — Claude-style: one short question,
 * then chips. Falls back to the raw text when nothing survives the cut.
 */
function cleanQuestionText(question: string): string {
  const optionsAt = question.search(/\s*Options?\s*:/i);
  const head = optionsAt >= 0 ? question.slice(0, optionsAt) : question;
  const stripped = head.replace(/\s*\(\d+\)[^()]*?(?=\s*\(\d+\)|\s*$)/g, "").trim();
  const collapsed = stripped
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.?!;:])/g, "$1")
    .trim();
  return collapsed.length > 0 ? collapsed : question;
}

function detectMultiSelect(question: string): boolean {
  return /quelles|lesquelles|plusieurs|sélectionne(z)?\s+(les|tous|toutes)|cocher|choisir\s+(les|plusieurs)/i.test(
    question,
  );
}

function getColTypeIcon(type: string) {
  switch (type) {
    case "date":
      return <Calendar className="size-3 text-sky-500 shrink-0" />;
    case "number":
      return <Hash className="size-3 text-emerald-500 shrink-0" />;
    case "boolean":
      return <CheckSquare className="size-3 text-amber-500 shrink-0" />;
    default:
      return <Type className="size-3 text-violet-500 shrink-0" />;
  }
}

function ChatClarification({
  messageId,
  part,
}: Readonly<{ messageId: string; part: ClarificationPart }>) {
  const answerClarification = useMoudirChatStore((s) => s.answerClarification);
  const busy = useMoudirChatStore((s) => s.status !== "idle");
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const datasets = useDataStore((s) => s.datasets);
  const activeDataset = datasets.find((d) => d.id === activeDatasetId);

  const initialMulti = Boolean(part.multiSelect || detectMultiSelect(part.question));
  const [isMulti, setIsMulti] = useState(initialMulti);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [customOpen, setCustomOpen] = useState(false);
  const [customAnswer, setCustomAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus custom input when opened
  useEffect(() => {
    if (customOpen) {
      inputRef.current?.focus();
    }
  }, [customOpen]);

  // Keyboard number shortcuts (1..8, Escape, Enter)
  useEffect(() => {
    if (part.answer || busy) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (e.key === "Escape") {
        if (customOpen) {
          e.preventDefault();
          setCustomOpen(false);
          setCustomAnswer("");
        } else if (isMulti && selectedOptions.size > 0) {
          e.preventDefault();
          setSelectedOptions(new Set());
        }
        return;
      }

      if (isTyping) return;

      // Check number keys 1..8
      const keyNum = Number.parseInt(e.key, 10);
      if (!Number.isNaN(keyNum) && keyNum >= 1 && keyNum <= part.options.length) {
        e.preventDefault();
        const option = part.options[keyNum - 1];
        if (isMulti) {
          setSelectedOptions((prev) => {
            const next = new Set(prev);
            if (next.has(option)) next.delete(option);
            else next.add(option);
            return next;
          });
        } else {
          void answerClarification(messageId, part.question, option);
        }
        return;
      }

      if (e.key === "Enter" && isMulti && selectedOptions.size > 0) {
        e.preventDefault();
        const answer = Array.from(selectedOptions).join(", ");
        void answerClarification(messageId, part.question, answer);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    part.answer,
    busy,
    part.options,
    part.question,
    messageId,
    isMulti,
    selectedOptions,
    customOpen,
    answerClarification,
  ]);

  const handleToggleOption = (option: string) => {
    if (isMulti) {
      setSelectedOptions((prev) => {
        const next = new Set(prev);
        if (next.has(option)) next.delete(option);
        else next.add(option);
        return next;
      });
    } else {
      void answerClarification(messageId, part.question, option);
    }
  };

  const handleConfirmMulti = () => {
    if (selectedOptions.size === 0) return;
    const answer = Array.from(selectedOptions).join(", ");
    void answerClarification(messageId, part.question, answer);
  };

  const handleCustomSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = customAnswer.trim();
    if (!trimmed) return;
    void answerClarification(messageId, part.question, trimmed);
    setCustomOpen(false);
  };

  // Helper to find data column metadata
  const getColMeta = (opt: string) => {
    if (!activeDataset?.columns) return null;
    const clean = opt.toLowerCase().trim();
    return activeDataset.columns.find(
      (c) => c.name.toLowerCase() === clean || c.name.toLowerCase().replaceAll("_", " ") === clean,
    );
  };

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-ai/30 bg-ai/5 p-3.5 shadow-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary shrink-0" />
            <p className="text-sm font-semibold text-foreground">
              {cleanQuestionText(part.question)}
            </p>
          </div>
          {!part.answer && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  "h-5 text-[10px] px-1.5 rounded-md font-mono transition-colors",
                  isMulti
                    ? "bg-primary/20 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setIsMulti(!isMulti)}
                title="Basculer entre sélection simple et multiple"
              >
                {isMulti ? "Mode multi-sélection ✓" : "Multi-choix"}
              </Button>
              {isMulti && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    if (selectedOptions.size === part.options.length) {
                      setSelectedOptions(new Set());
                    } else {
                      setSelectedOptions(new Set(part.options));
                    }
                  }}
                  className="h-5 text-[10px] px-1.5 gap-1 bg-background/80 hover:bg-muted"
                  title={
                    selectedOptions.size === part.options.length
                      ? "Tout désélectionner"
                      : "Tout sélectionner"
                  }
                >
                  <CheckSquare className="size-2.5 text-primary" />
                  <span>
                    {selectedOptions.size === part.options.length
                      ? "Tout désélectionner"
                      : "Tout sélectionner"}
                  </span>
                </Button>
              )}
            </div>
          )}
        </div>

        {part.answer ? (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Réponse enregistrée :</span>
            <Badge className="font-mono text-xs px-2.5 py-0.5" variant="secondary">
              {part.answer}
            </Badge>
          </div>
        ) : (
          <div className="mt-2 space-y-2.5">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span>
                {isMulti
                  ? "Cochez une ou plusieurs options ci-dessous, puis confirmez :"
                  : "Choisissez une option ou utilisez les touches 1 à " +
                    part.options.length +
                    " :"}
              </span>
            </p>

            <div className="flex flex-wrap gap-2 pt-0.5">
              {part.options.map((option, idx) => {
                const isSelected = selectedOptions.has(option);
                const colMeta = getColMeta(option);
                const shortcutNum = idx + 1;

                const chipContent = (
                  <button
                    type="button"
                    disabled={busy}
                    key={option}
                    onClick={() => handleToggleOption(option)}
                    className={cn(
                      "group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none",
                      isMulti
                        ? isSelected
                          ? "border-primary bg-primary/20 text-primary shadow-xs"
                          : "border-border/80 bg-background/80 text-foreground hover:bg-muted/80 hover:border-border"
                        : "border-border/80 bg-background/80 text-foreground hover:bg-primary/10 hover:border-primary/40 hover:text-primary shadow-xs",
                      busy && "opacity-50 pointer-events-none",
                    )}
                  >
                    {isMulti && (
                      <Checkbox
                        checked={isSelected}
                        className="size-3.5 pointer-events-none data-checked:bg-primary data-checked:border-primary"
                      />
                    )}
                    <kbd className="flex size-4 items-center justify-center rounded bg-muted text-[10px] font-mono text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                      {shortcutNum}
                    </kbd>
                    {colMeta && getColTypeIcon(colMeta.type)}
                    <span>{option}</span>
                  </button>
                );

                if (colMeta) {
                  return (
                    <Tooltip key={option}>
                      <TooltipTrigger asChild>{chipContent}</TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs p-2 text-xs space-y-1 bg-popover text-popover-foreground border border-border shadow-md"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1">
                          <span className="font-semibold font-mono text-primary">
                            {colMeta.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-mono px-1 py-0"
                          >
                            {colMeta.type}
                          </Badge>
                        </div>
                        {colMeta.sample && colMeta.sample.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            <span className="text-foreground font-medium">Exemples : </span>
                            {colMeta.sample.slice(0, 3).map(String).join(", ")}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {colMeta.distinctCount} valeurs uniques · {colMeta.nullCount} null(s)
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return chipContent;
              })}

              {!customOpen && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={() => setCustomOpen(true)}
                  className="h-7 gap-1 border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-solid hover:bg-muted/60"
                >
                  <Plus className="size-3" />
                  <span>Autre réponse…</span>
                </Button>
              )}
            </div>

            {/* Custom Write-In Option Input */}
            {customOpen && (
              <form
                onSubmit={handleCustomSubmit}
                className="flex items-center gap-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-150"
              >
                <Input
                  ref={inputRef}
                  type="text"
                  value={customAnswer}
                  onChange={(e) => setCustomAnswer(e.target.value)}
                  placeholder="Précisez votre réponse personnalisée…"
                  className="h-7 text-xs flex-1 bg-background"
                  disabled={busy}
                />
                <Button
                  type="submit"
                  size="xs"
                  disabled={busy || !customAnswer.trim()}
                  className="h-7 text-xs px-2.5 gap-1"
                >
                  <CornerDownLeft className="size-3" />
                  <span>Valider</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setCustomOpen(false);
                    setCustomAnswer("");
                  }}
                  className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                >
                  Annuler
                </Button>
              </form>
            )}

            {/* Multi-Select confirmation button */}
            {isMulti && selectedOptions.size > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-border/40 animate-in fade-in duration-150">
                <span className="text-xs text-muted-foreground">
                  {selectedOptions.size} option{selectedOptions.size > 1 ? "s" : ""} sélectionnée
                  {selectedOptions.size > 1 ? "s" : ""}
                </span>
                <Button
                  type="button"
                  size="xs"
                  onClick={handleConfirmMulti}
                  disabled={busy}
                  className="h-7 text-xs px-3 gap-1.5 shadow-xs"
                >
                  <Check className="size-3" />
                  <span>Confirmer la sélection ({selectedOptions.size})</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function UserBubble({ message }: Readonly<{ message: ChatMessage }>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const status = useMoudirChatStore((s) => s.status);
  const editAndResend = useMoudirChatStore((s) => s.editAndResend);
  const streaming = status === "streaming";

  const cancel = () => {
    setDraft(message.content);
    setEditing(false);
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || text === message.content) {
      cancel();
      return;
    }
    setEditing(false);
    void editAndResend(message.id, text);
  };

  if (editing) {
    return (
      <Message from="user">
        <MessageContent className="w-full max-w-full">
          <Textarea
            aria-label="Modifier le message"
            autoFocus
            className="min-h-16 bg-card text-sm"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
            value={draft}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-muted-foreground">
              Entrée pour renvoyer · Échap pour annuler
            </span>
            <Button onClick={cancel} size="sm" variant="ghost">
              Annuler
            </Button>
            <Button disabled={streaming} onClick={submit} size="sm">
              Renvoyer
            </Button>
          </div>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from="user">
      {message.attachments && message.attachments.length > 0 && (
        <div className="mb-2 flex w-full flex-col items-end">
          <Attachments
            variant={message.attachments.length > 2 ? "grid" : "inline"}
            className="justify-end"
          >
            {message.attachments.map((att) => {
              const url = att.type === "file" ? att.url : undefined;
              const mediaType = att.type === "file" ? att.mediaType : undefined;
              const label = getAttachmentLabel(att);
              return (
                <AttachmentHoverCard key={att.id}>
                  <AttachmentHoverCardTrigger asChild>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block cursor-pointer"
                      >
                        <Attachment data={att}>
                          <AttachmentPreview />
                          {message.attachments && message.attachments.length <= 2 && (
                            <AttachmentInfo showMediaType />
                          )}
                        </Attachment>
                      </a>
                    ) : (
                      <div className="block cursor-pointer">
                        <Attachment data={att}>
                          <AttachmentPreview />
                          {message.attachments && message.attachments.length <= 2 && (
                            <AttachmentInfo showMediaType />
                          )}
                        </Attachment>
                      </div>
                    )}
                  </AttachmentHoverCardTrigger>
                  <AttachmentHoverCardContent>
                    <div className="flex max-w-xs flex-col gap-1.5 p-1 text-xs">
                      {mediaType?.startsWith("image/") && url && (
                        <img
                          src={url}
                          alt={label}
                          className="max-h-60 max-w-full rounded border object-contain"
                        />
                      )}
                      <span className="font-semibold truncate text-foreground">{label}</span>
                      {mediaType && (
                        <span className="text-[11px] text-muted-foreground">{mediaType}</span>
                      )}
                    </div>
                  </AttachmentHoverCardContent>
                </AttachmentHoverCard>
              );
            })}
          </Attachments>
        </div>
      )}
      <MessageContent className="break-words whitespace-pre-wrap">{message.content}</MessageContent>
      <div className="mt-1 flex justify-end">
        <time
          dateTime={new Date(message.createdAt).toISOString()}
          className="text-[10px] text-muted-foreground/70"
        >
          {formatMessageTime(message.createdAt)}
        </time>
      </div>
      <MessageActions className="justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <CopyAction text={message.content} />
        <MessageAction
          disabled={streaming}
          label="Éditer"
          onClick={() => {
            setDraft(message.content);
            setEditing(true);
          }}
          tooltip="Éditer"
        >
          <Pencil />
        </MessageAction>
      </MessageActions>
    </Message>
  );
}

function AssistantBubble({
  isLastAssistant,
  message,
}: Readonly<{ isLastAssistant: boolean; message: ChatMessage }>) {
  const status = useMoudirChatStore((s) => s.status);
  const regenerateLast = useMoudirChatStore((s) => s.regenerateLast);
  const sandboxEnabled = useEnableMoudirSandbox();
  const streaming = message.status === "streaming";

  // Parse chain-of-thought thinking tags (<think>...</think>)
  const {
    thinking,
    isThinking,
    cleanContent: contentWithoutThinking,
  } = parseThinking(message.content);
  const { citations, cleanContent } = parseCitations(contentWithoutThinking);
  const hasContent = cleanContent.trim().length > 0;
  const hasThinking = thinking.trim().length > 0;

  // The tail part drives the status line: while a tool is in flight we name it
  const lastPart = message.parts.at(-1);
  const activeTool = streaming && lastPart?.kind === "tool" ? lastPart : undefined;
  const thinkingLabel = activeTool
    ? `Exécution : ${toolLabel(activeTool.name)}`
    : "Réflexion en cours…";

  return (
    <Message className="max-w-full flex-row gap-3" from="assistant">
      <div className="mt-0.5 shrink-0">
        <MoudirMark size={30} thinking={streaming} />
      </div>
      <MessageContent className="min-w-0 flex-1">
        {/* Thinking / Reasoning block: visible when model is thinking or has thought */}
        {hasThinking || (streaming && isThinking) ? (
          <Reasoning
            className="mb-3"
            defaultOpen={isThinking || (streaming && !hasContent)}
            isStreaming={streaming && isThinking}
          >
            <ReasoningTrigger
              getThinkingMessage={(streamingState, duration) =>
                streamingState ? (
                  <Shimmer duration={1}>{thinkingLabel}</Shimmer>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-xs text-muted-foreground">
                    <Brain className="size-3.5 text-primary" />
                    <span>{duration ? `Réflexion (${duration}s)` : "Processus de réflexion"}</span>
                  </span>
                )
              }
            />
            {hasThinking ? (
              <ReasoningContent className="mt-2 rounded-lg border border-border/50 bg-muted/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground/90 whitespace-pre-wrap">
                {thinking}
              </ReasoningContent>
            ) : null}
          </Reasoning>
        ) : streaming && !hasContent ? (
          /* Initial loading state before first token or tool */
          <Reasoning className="mb-3" defaultOpen isStreaming>
            <ReasoningTrigger
              getThinkingMessage={() => <Shimmer duration={1}>{thinkingLabel}</Shimmer>}
            />
          </Reasoning>
        ) : null}

        {/* Tool execution steps: always inside the chain of thought, even a
            lone call — a single step outside the chain reads as an error. */}
        {(() => {
          const toolParts = message.parts.filter((p): p is ToolPart => p.kind === "tool");
          if (toolParts.length === 0) return null;
          return (
            <ChainOfThought
              className="my-3 rounded-lg border border-border/60 bg-muted/20 p-2.5"
              defaultOpen={toolParts.some((p) => p.failed) || streaming}
            >
              <ChainOfThoughtHeader className="text-xs font-medium">
                {toolParts.length > 1
                  ? `${toolParts.length} étapes d'analyse exécutées`
                  : "1 étape d'analyse exécutée"}
              </ChainOfThoughtHeader>
              <ChainOfThoughtContent className="mt-3 space-y-2">
                {toolParts.map((t, idx) => (
                  <ChainOfThoughtStep
                    key={`step-${idx}`}
                    status={t.failed ? "complete" : t.resultSummary.trim() ? "complete" : "active"}
                    label={<span className="font-medium text-xs">{toolLabel(t.name)}</span>}
                    description={t.durationMs ? formatDuration(t.durationMs) : undefined}
                  >
                    <MessageTool part={t} />
                  </ChainOfThoughtStep>
                ))}
              </ChainOfThoughtContent>
            </ChainOfThought>
          );
        })()}

        {message.parts.map((part, index) => {
          switch (part.kind) {
            case "tool":
              // Handled above in ChainOfThought / single tool block.
              return null;
            case "chart":
              return <ChatChartArtifact key={`chart-${index}`} part={part} />;
            case "clarification":
              return (
                <ChatClarification
                  key={`clarification-${index}`}
                  messageId={message.id}
                  part={part}
                />
              );
            case "citation":
              // Collected into the Sources block below, never rendered inline.
              return null;
            default: {
              const _exhaustive: never = part;
              return _exhaustive;
            }
          }
        })}

        {cleanContent ? (
          <MoudirProse
            content={cleanContent}
            enabled={sandboxEnabled}
            proseClassName={PROSE_CLASS}
            streaming={streaming}
          />
        ) : null}

        {citations.length > 0 ? <MessageSources citations={citations} /> : null}

        {message.error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-destructive"
            />
            <p className="text-xs text-destructive">{message.error}</p>
          </div>
        ) : null}

        {message.previousContent ? (
          <WordDiff
            after={message.content}
            ariaLabel="Changements depuis la version précédente"
            before={message.previousContent}
          />
        ) : null}

        {/* AI Engine & Local Inference Telemetry Bar */}
        {!streaming && (hasContent || message.model || message.metrics) ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
            <Badge
              variant="outline"
              className="gap-1 bg-muted/25 px-2 py-0.5 font-mono text-[10px] font-normal text-muted-foreground border-border/50"
            >
              <Cpu className="size-3 text-primary" />
              <span>{message.model ? humanizeModel(message.model) : "IA Locale"}</span>
            </Badge>

            {message.metrics ? (
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/80">
                <span title="Durée totale d'inférence">
                  {formatDuration(message.metrics.durationMs)}
                </span>
                <span>·</span>
                <span title="Débit estimé">~{message.metrics.tokensPerSecond} tok/s</span>
                {message.metrics.firstTokenMs > 0 ? (
                  <>
                    <span>·</span>
                    <span title="Délai jusqu'au 1er token">
                      TTFT {formatDuration(message.metrics.firstTokenMs)}
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}

            {message.datasetId ? (
              <Badge variant="secondary" className="ml-auto px-2 py-0.5 text-[10px] font-normal">
                {message.datasetId}
              </Badge>
            ) : null}
            <time
              dateTime={new Date(message.createdAt).toISOString()}
              title={new Date(message.createdAt).toLocaleString("fr-FR")}
              className="font-mono text-[10px] text-muted-foreground/70"
            >
              {formatMessageTime(message.createdAt)}
            </time>
          </div>
        ) : null}

        {!streaming && hasContent ? (
          <MessageActions className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <CopyAction text={cleanContent} />
            {isLastAssistant ? (
              <MessageAction
                disabled={status !== "idle"}
                label="Regénérer"
                onClick={() => void regenerateLast()}
                tooltip="Regénérer"
              >
                <RotateCcw />
              </MessageAction>
            ) : null}
          </MessageActions>
        ) : null}
      </MessageContent>
    </Message>
  );
}

export function MoudirMessageBubble({
  isLastAssistant = false,
  message,
}: Readonly<{ isLastAssistant?: boolean; message: ChatMessage }>) {
  if (message.role === "user") return <UserBubble message={message} />;
  return <AssistantBubble isLastAssistant={isLastAssistant} message={message} />;
}
