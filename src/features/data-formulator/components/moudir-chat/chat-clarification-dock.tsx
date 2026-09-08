"use client";

import {
  Calendar,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Hash,
  HelpCircle,
  Plus,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDataStore } from "@/core/stores/data-store";
import { cn } from "@/shared/utils";
import {
  type ChatMessage,
  type ClarificationPart,
  useMoudirChatStore,
} from "../../store/moudir-chat-store";

function cleanQuestionText(question: string): string {
  const optionsAt = question.search(/\s*Options?\s*:/i);
  const head = optionsAt >= 0 ? question.slice(0, optionsAt) : question;
  const stripped = head.replace(/\s*\(\d+\)[^()]*?(?=\s*\(\d+\)|\s*$)/g, "").trim();
  const collapsed = stripped.replace(/\s{2,}/g, " ").replace(/\s+([,.?!;:])/g, "$1").trim();
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

interface PendingQuestion {
  messageId: string;
  part: ClarificationPart;
  partIndex: number;
}

export function ChatClarificationDock() {
  const messages = useMoudirChatStore((s) => s.messages);
  const answerClarification = useMoudirChatStore((s) => s.answerClarification);
  const busy = useMoudirChatStore((s) => s.status !== "idle");

  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const datasets = useDataStore((s) => s.datasets);
  const activeDataset = datasets.find((d) => d.id === activeDatasetId);

  // Collect all unanswered clarification questions across messages
  const pendingQuestions: PendingQuestion[] = useMemo(() => {
    const list: PendingQuestion[] = [];
    for (const m of messages) {
      if (m.role === "assistant") {
        m.parts.forEach((p, idx) => {
          if (p.kind === "clarification" && !p.answer) {
            list.push({ messageId: m.id, part: p, partIndex: idx });
          }
        });
      }
    }
    return list;
  }, [messages]);

  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedMap, setSelectedMap] = useState<Record<string, Set<string>>>({});
  const [multiMap, setMultiMap] = useState<Record<string, boolean>>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [customAnswer, setCustomAnswer] = useState("");
  const [focusedOptionIdx, setFocusedOptionIdx] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep questionIdx in valid bounds
  const currentIdx = Math.min(Math.max(0, questionIdx), Math.max(0, pendingQuestions.length - 1));
  const current = pendingQuestions[currentIdx];

  const currentKey = current ? `${current.messageId}-${current.partIndex}` : "";
  const isMulti = current
    ? multiMap[currentKey] ??
      Boolean(current.part.multiSelect || detectMultiSelect(current.part.question))
    : false;

  const currentSelected = useMemo(() => {
    return selectedMap[currentKey] ?? new Set<string>();
  }, [selectedMap, currentKey]);

  useEffect(() => {
    if (customOpen) {
      inputRef.current?.focus();
    }
  }, [customOpen]);

  // Keyboard navigation & number shortcuts
  useEffect(() => {
    if (!current || busy) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (e.key === "Escape") {
        if (customOpen) {
          e.preventDefault();
          setCustomOpen(false);
          setCustomAnswer("");
          return;
        }
        if (isMulti && currentSelected.size > 0) {
          e.preventDefault();
          setSelectedMap((prev) => ({ ...prev, [currentKey]: new Set() }));
          return;
        }
      }

      if (isTyping) return;

      // Question navigation with PageUp / PageDown or Alt+Arrows
      if (pendingQuestions.length > 1) {
        if (e.key === "PageDown" || (e.altKey && e.key === "ArrowRight")) {
          e.preventDefault();
          setQuestionIdx((i) => Math.min(i + 1, pendingQuestions.length - 1));
          setFocusedOptionIdx(-1);
          return;
        }
        if (e.key === "PageUp" || (e.altKey && e.key === "ArrowLeft")) {
          e.preventDefault();
          setQuestionIdx((i) => Math.max(i - 1, 0));
          setFocusedOptionIdx(-1);
          return;
        }
      }

      // Arrow navigation between options
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedOptionIdx((prev) => (prev + 1) % current.part.options.length);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedOptionIdx((prev) =>
          prev <= 0 ? current.part.options.length - 1 : prev - 1,
        );
        return;
      }

      // Space / Enter on focused option
      if ((e.key === " " || e.key === "Enter") && focusedOptionIdx >= 0) {
        e.preventDefault();
        const opt = current.part.options[focusedOptionIdx];
        if (isMulti) {
          toggleOption(opt);
        } else {
          void submitAnswer(opt);
        }
        return;
      }

      // Direct number shortcuts 1..8
      const num = Number.parseInt(e.key, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= current.part.options.length) {
        e.preventDefault();
        const opt = current.part.options[num - 1];
        if (isMulti) {
          toggleOption(opt);
        } else {
          void submitAnswer(opt);
        }
        return;
      }

      // Enter to confirm multi-selection
      if (e.key === "Enter" && isMulti && currentSelected.size > 0) {
        e.preventDefault();
        confirmMulti();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    current,
    busy,
    isMulti,
    currentSelected,
    currentKey,
    customOpen,
    focusedOptionIdx,
    pendingQuestions.length,
  ]);

  if (!current) {
    return null;
  }

  const toggleOption = (option: string) => {
    setSelectedMap((prev) => {
      const existing = prev[currentKey] ? new Set(prev[currentKey]) : new Set<string>();
      if (existing.has(option)) {
        existing.delete(option);
      } else {
        existing.add(option);
      }
      return { ...prev, [currentKey]: existing };
    });
  };

  const handleSelectAll = () => {
    const allOptions = current.part.options;
    const isAllSelected = currentSelected.size === allOptions.length;
    setSelectedMap((prev) => ({
      ...prev,
      [currentKey]: isAllSelected ? new Set() : new Set(allOptions),
    }));
  };

  const submitAnswer = async (answer: string) => {
    await answerClarification(current.messageId, current.part.question, answer);
    setCustomOpen(false);
    setCustomAnswer("");
    // If there are more questions, move to next
    if (currentIdx < pendingQuestions.length - 1) {
      setQuestionIdx(currentIdx);
    }
  };

  const confirmMulti = () => {
    if (currentSelected.size === 0) return;
    const answer = Array.from(currentSelected).join(", ");
    void submitAnswer(answer);
  };

  const getColMeta = (opt: string) => {
    if (!activeDataset?.columns) return null;
    const clean = opt.toLowerCase().trim();
    return activeDataset.columns.find(
      (c) => c.name.toLowerCase() === clean || c.name.toLowerCase().replaceAll("_", " ") === clean,
    );
  };

  const allSelected = currentSelected.size === current.part.options.length;

  return (
    <TooltipProvider>
      <div
        role="region"
        aria-label="Question de clarification"
        className="rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-md p-3.5 shadow-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
      >
        {/* Top Header: Question count, pagination, and multi-mode switch */}
        <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
              <HelpCircle className="size-3.5" />
            </div>
            <span className="text-xs font-semibold text-foreground">
              Question de Moudir
            </span>
            {pendingQuestions.length > 1 && (
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-5">
                {currentIdx + 1} / {pendingQuestions.length}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Multi-select toggle */}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={cn(
                "h-6 text-[11px] px-2 rounded-md font-medium transition-colors",
                isMulti
                  ? "bg-primary/20 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setMultiMap((prev) => ({ ...prev, [currentKey]: !isMulti }));
              }}
              title="Basculer entre choix unique et sélection multiple"
            >
              {isMulti ? "Sélection multiple ✓" : "Choix multiple"}
            </Button>

            {/* Select all / Tout sélectionner in multi mode */}
            {isMulti && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleSelectAll}
                className="h-6 text-[11px] px-2 gap-1 bg-background/80 hover:bg-muted font-medium"
                title={allSelected ? "Tout désélectionner" : "Tout sélectionner"}
              >
                <CheckSquare className="size-3 text-primary" />
                <span>{allSelected ? "Tout désélectionner" : "Tout sélectionner"}</span>
              </Button>
            )}

            {/* Question pagination stepper when multiple questions exist */}
            {pendingQuestions.length > 1 && (
              <div className="flex items-center gap-0.5 ml-1 border-l border-border/60 pl-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={currentIdx === 0}
                  onClick={() => {
                    setQuestionIdx((i) => Math.max(0, i - 1));
                    setFocusedOptionIdx(-1);
                  }}
                  className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Question précédente"
                  title="Question précédente"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <div className="flex gap-1 px-1">
                  {pendingQuestions.map((_, dotIdx) => (
                    <button
                      key={dotIdx}
                      type="button"
                      onClick={() => setQuestionIdx(dotIdx)}
                      className={cn(
                        "size-1.5 rounded-full transition-all cursor-pointer",
                        dotIdx === currentIdx
                          ? "bg-primary w-3.5"
                          : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                      )}
                      aria-label={`Aller à la question ${dotIdx + 1}`}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={currentIdx >= pendingQuestions.length - 1}
                  onClick={() => {
                    setQuestionIdx((i) => Math.min(pendingQuestions.length - 1, i + 1));
                    setFocusedOptionIdx(-1);
                  }}
                  className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Question suivante"
                  title="Question suivante"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Question title */}
        <div className="mb-2.5">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {cleanQuestionText(current.part.question)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isMulti
              ? "Cochez une ou plusieurs options ci-dessous, ou sélectionnez tout :"
              : "Cliquez sur une option ou utilisez les touches 1 à " +
                current.part.options.length +
                " / flèches :"}
          </p>
        </div>

        {/* Options grid / chips */}
        <div className="flex flex-wrap gap-2 pt-0.5">
          {current.part.options.map((option, idx) => {
            const isSelected = currentSelected.has(option);
            const isFocused = focusedOptionIdx === idx;
            const colMeta = getColMeta(option);
            const shortcutNum = idx + 1;

            const chipButton = (
              <button
                type="button"
                disabled={busy}
                key={option}
                onClick={() => {
                  if (isMulti) {
                    toggleOption(option);
                  } else {
                    void submitAnswer(option);
                  }
                }}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer select-none",
                  isMulti
                    ? isSelected
                      ? "border-primary bg-primary/20 text-primary shadow-xs ring-1 ring-primary/40 font-semibold"
                      : "border-border/80 bg-background/80 text-foreground hover:bg-muted hover:border-border"
                    : "border-border/80 bg-background/80 text-foreground hover:bg-primary/10 hover:border-primary/50 hover:text-primary shadow-xs",
                  isFocused && "ring-2 ring-primary ring-offset-1",
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
                  <TooltipTrigger asChild>{chipButton}</TooltipTrigger>
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

            return chipButton;
          })}

          {!customOpen && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={busy}
              onClick={() => setCustomOpen(true)}
              className="h-8 gap-1 border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-solid hover:bg-muted/60"
            >
              <Plus className="size-3" />
              <span>Autre réponse…</span>
            </Button>
          )}
        </div>

        {/* Custom write-in input form */}
        {customOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = customAnswer.trim();
              if (trimmed) void submitAnswer(trimmed);
            }}
            className="flex items-center gap-2 mt-3 pt-2 border-t border-border/40 animate-in fade-in slide-in-from-top-1 duration-150"
          >
            <Input
              ref={inputRef}
              type="text"
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              placeholder="Précisez votre propre réponse personnalisée…"
              className="h-8 text-xs flex-1 bg-background"
              disabled={busy}
            />
            <Button
              type="submit"
              size="xs"
              disabled={busy || !customAnswer.trim()}
              className="h-8 text-xs px-3 gap-1 shadow-xs"
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
              className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground"
            >
              Annuler
            </Button>
          </form>
        )}

        {/* Multi-select confirmation bar */}
        {isMulti && currentSelected.size > 0 && (
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50 animate-in fade-in duration-150">
            <span className="text-xs font-medium text-foreground">
              {currentSelected.size} option{currentSelected.size > 1 ? "s" : ""} sélectionnée
              {currentSelected.size > 1 ? "s" : ""}
            </span>
            <Button
              type="button"
              size="xs"
              onClick={confirmMulti}
              disabled={busy}
              className="h-7 text-xs px-3.5 gap-1.5 font-medium shadow-xs"
            >
              <Check className="size-3.5" />
              <span>Confirmer la sélection ({currentSelected.size})</span>
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
