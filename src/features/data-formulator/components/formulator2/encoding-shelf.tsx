"use client";

/**
 * EncodingShelf — DF's chart builder: one drop row per encoding channel
 * (X / Y / Couleur / Taille / Facette), the NL instruction input and the
 * Formuler button, plus the derive status line.
 *
 * Dropping a concept pill on a row binds it (`bindField`); the bound pill
 * carries a remove control, an aggregate caret on the y channel
 * (`updateEncoding`), and the dashed --ai « à dériver » treatment when the
 * field doesn't exist on the focused table (the AI will have to derive it).
 *
 * The button reads « Tracer » when both x/y are bound and no derivation is
 * needed — a pure local chart compile, no AI call (formulate() no-ops).
 */

import { useDroppable } from "@dnd-kit/core";
import { Check, ChevronDown, Copy, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/shared/utils";
import { AGGREGATES } from "../../core/constants";
import type { ConceptItem } from "../../core/formulator/model";
import type { ColType, Encoding } from "../../core/types";
import {
  type ShelfChannel,
  useFormFocusedTable,
  useFormShelf,
  useFormStatus,
  useFormulatorV2Store,
} from "../../store/formulator-store";
import { ChartTypeGallery } from "./chart-type-gallery";
import { FieldPill, type PillSource } from "./field-pill";

const COPY_FEEDBACK_MS = 1500;

const CHANNEL_ROWS: ReadonlyArray<{ channel: ShelfChannel; label: string }> = [
  { channel: "x", label: "X" },
  { channel: "y", label: "Y" },
  { channel: "color", label: "Couleur" },
  { channel: "size", label: "Taille" },
  { channel: "facet", label: "Facette" },
];

export function EncodingShelf({ className }: Readonly<{ className?: string }>) {
  const shelf = useFormShelf();
  const focused = useFormFocusedTable();
  const concepts = useFormulatorV2Store((s) => s.concepts);
  const { status } = useFormStatus();
  const setInstruction = useFormulatorV2Store((s) => s.setInstruction);
  const formulate = useFormulatorV2Store((s) => s.formulate);
  const needsDerivation = useFormulatorV2Store((s) => s.needsDerivation);

  const conceptByName = useMemo(() => {
    const map = new Map<string, ConceptItem>();
    for (const concept of concepts) {
      if (!map.has(concept.name)) map.set(concept.name, concept);
    }
    return map;
  }, [concepts]);

  const focusedCols = useMemo(
    () => new Map((focused?.columns ?? []).map((c) => [c.name, c.type])),
    [focused],
  );

  const byChannel = new Map(shelf.encodings.map((e) => [e.channel, e]));
  const xBound = Boolean(byChannel.get("x")?.field);
  const yBound = Boolean(byChannel.get("y")?.field);
  const isPureChart = !needsDerivation() && xBound && yBound;

  return (
    <section
      aria-label="Encodage visuel"
      className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-4", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground text-sm">Encodage visuel</h3>
        <ChartTypeGallery />
      </div>

      <div className="flex flex-col gap-2">
        {CHANNEL_ROWS.map((row) => {
          const encoding = byChannel.get(row.channel);
          const isUnknown = Boolean(encoding && !focusedCols.has(encoding.field));
          const concept = encoding ? conceptByName.get(encoding.field) : undefined;
          const dtype: ColType | undefined = encoding
            ? (focusedCols.get(encoding.field) ?? concept?.dtype)
            : undefined;
          const source: PillSource = isUnknown ? "custom" : (concept?.source ?? "original");
          return (
            <ChannelRow
              key={row.channel}
              channel={row.channel}
              label={row.label}
              encoding={encoding}
              dtype={dtype}
              source={source}
              isUnknown={isUnknown}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-border border-t pt-3">
        <Textarea
          rows={2}
          value={shelf.instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Décrivez la transformation ou le champ à dériver…"
          className="resize-none text-sm"
        />
        <Button
          className="self-start"
          onClick={() => void formulate()}
          disabled={status === "deriving"}
        >
          {isPureChart ? "Tracer" : "Formuler"}
        </Button>
        <StatusLine />
      </div>
    </section>
  );
}

/** One channel row: label + droppable zone (id = channel). */
function ChannelRow({
  channel,
  label,
  encoding,
  dtype,
  source,
  isUnknown,
}: Readonly<{
  channel: ShelfChannel;
  label: string;
  encoding: Encoding | undefined;
  dtype: ColType | undefined;
  source: PillSource;
  isUnknown: boolean;
}>) {
  const { isOver, setNodeRef } = useDroppable({ id: channel });
  const unbindChannel = useFormulatorV2Store((s) => s.unbindChannel);

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-right font-medium text-muted-foreground text-xs">
        {label}
      </span>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-9 min-w-0 flex-1 items-center rounded-md border border-border border-dashed bg-muted/40 px-1.5 py-1 transition-colors",
          isOver && "border-solid bg-muted/70 ring-2 ring-ring",
        )}
      >
        {encoding ? (
          <BoundPill
            channel={channel}
            encoding={encoding}
            dtype={dtype}
            source={source}
            isUnknown={isUnknown}
            onRemove={() => unbindChannel(channel)}
          />
        ) : (
          <span className="px-1.5 text-muted-foreground/70 text-xs">Déposer un champ ici</span>
        )}
      </div>
    </div>
  );
}

/**
 * A bound field pill: dtype icon + name (+ « à dériver » badge when unknown),
 * an aggregate caret on the y channel, and a remove control. No drag listeners
 * anywhere here — the dropdown trigger must stay freely clickable.
 */
function BoundPill({
  channel,
  encoding,
  dtype,
  source,
  isUnknown,
  onRemove,
}: Readonly<{
  channel: ShelfChannel;
  encoding: Encoding;
  dtype: ColType | undefined;
  source: PillSource;
  isUnknown: boolean;
  onRemove: () => void;
}>) {
  const updateEncoding = useFormulatorV2Store((s) => s.updateEncoding);
  const aggregate = encoding.aggregate ?? "none";
  const aggregateLabel = AGGREGATES.find((a) => a.value === aggregate)?.label ?? aggregate;

  return (
    <FieldPill name={encoding.field} dtype={dtype} source={source} className="max-w-full">
      {isUnknown && (
        <Badge
          variant="outline"
          className="ml-0.5 h-4 shrink-0 border-ai/30 bg-ai/10 px-1.5 text-[10px] text-ai"
        >
          à dériver
        </Badge>
      )}
      {channel === "y" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Agrégat : ${aggregateLabel}`}
              className="ml-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground uppercase outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {aggregateLabel}
              <ChevronDown className="size-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {AGGREGATES.map((agg) => (
              <DropdownMenuItem
                key={agg.value}
                onSelect={() => updateEncoding(channel, { aggregate: agg.value })}
              >
                <span className="flex-1">{agg.label}</span>
                {agg.value === aggregate && (
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer ${encoding.field}`}
        className="ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </FieldPill>
  );
}

/**
 * Derive lifecycle readout: a quietly pulsing dot + statusText while deriving
 * (no spinner theatre), and the last error as a destructive-tinted card with
 * the generated code shown verbatim (copy + dismiss).
 */
function StatusLine() {
  const { status, statusText, lastError } = useFormStatus();
  const clearError = useFormulatorV2Store((s) => s.clearError);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!lastError?.code) return;
    try {
      await navigator.clipboard.writeText(lastError.code);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Presse-papiers indisponible (permissions) — pas de feedback.
    }
  };

  if (status !== "deriving" && !lastError) return null;

  return (
    <div className="flex flex-col gap-2">
      {status === "deriving" && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="size-1.5 animate-pulse rounded-full bg-ai" aria-hidden="true" />
          <span>{statusText || "Dérivation en cours…"}</span>
        </div>
      )}
      {lastError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-destructive text-sm">{lastError.message}</p>
            <button
              type="button"
              onClick={clearError}
              aria-label="Fermer l'erreur"
              className="shrink-0 rounded-md p-0.5 text-destructive/70 outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {lastError.code && (
            <div className="relative mt-2">
              <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 pr-9 font-mono text-foreground text-xs">
                {lastError.code}
              </pre>
              <button
                type="button"
                onClick={() => void copyCode()}
                aria-label="Copier le code"
                className="absolute top-1.5 right-1.5 rounded-md border border-border bg-card p-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copied ? (
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
