"use client";

// FACTS (GateGuard): imported by chart-canvas / MoudirSwarmScreen formulator panels | exports ChartMark, Encoding, EncodingShelfProps, EncodingShelf | reads/writes NO data files

import { Plus, Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils";
import { Kicker, MOUDIR, rise, stagger, useMotionOn } from "../moudir-kit";

export type ChartMark = "bar" | "line" | "point" | "area";

export interface Encoding {
  x?: string;
  y?: string;
  color?: string;
  mark: ChartMark;
}

export interface EncodingShelfProps {
  encoding: Encoding;
  onChange(next: Encoding): void;
  onFormulate(prompt: string): void;
  running?: boolean;
  className?: string;
  /** Known dataset field names — used to detect "to-derive" fields the AI must invent. */
  fields?: string[];
}

const FIELD_MIME = "application/x-moudir-field";

type ChannelKey = "x" | "y" | "color";

interface ChannelDef {
  key: ChannelKey;
  label: string;
  hint: string;
}

const CHANNELS: readonly ChannelDef[] = [
  { key: "x", label: "X", hint: "axe X" },
  { key: "y", label: "Y", hint: "axe Y" },
  { key: "color", label: "Couleur", hint: "champ de couleur" },
] as const;

interface MarkDef {
  value: ChartMark;
  label: string;
  word: string; // word that reads naturally in "en {word}"
}

const MARKS: readonly MarkDef[] = [
  { value: "bar", label: "Barres", word: "barres" },
  { value: "line", label: "Ligne", word: "ligne" },
  { value: "point", label: "Points", word: "nuage de points" },
  { value: "area", label: "Aire", word: "aire" },
] as const;

function markWord(mark: ChartMark): string {
  return MARKS.find((m) => m.value === mark)?.word ?? "barres";
}

/** Build a precise, analytic French instruction from the current encoding. */
function composePrompt(encoding: Encoding, fields: readonly string[]): string {
  const known = new Set(fields.map((f) => f.toLowerCase()));
  const isDerived = (name: string): boolean =>
    name.trim().length > 0 && !known.has(name.trim().toLowerCase());

  const phraseField = (name: string, role: string): string =>
    isDerived(name) ? `un champ à dériver « ${name} » (${role})` : `${name} (${role})`;

  const { x, y, color, mark } = encoding;
  const parts: string[] = [`Crée un graphique en ${markWord(mark)}`];

  if (y && x) {
    parts.push(`de ${phraseField(y, "axe Y")} par ${phraseField(x, "axe X")}`);
  } else if (y) {
    parts.push(`de ${phraseField(y, "axe Y")}`);
  } else if (x) {
    parts.push(`organisé par ${phraseField(x, "axe X")}`);
  }

  if (color) {
    parts.push(`, coloré par ${phraseField(color, "couleur")}`);
  }

  // Join so the comma-led color clause attaches cleanly, then close with a period.
  const sentence = parts
    .reduce((acc, part) => (part.startsWith(",") ? acc + part : `${acc} ${part}`))
    .trim();

  return `${sentence}.`;
}

interface ChannelZoneProps {
  def: ChannelDef;
  value: string | undefined;
  isDerived: boolean;
  onSet(value: string | undefined): void;
}

function ChannelZone({ def, value, isDerived, onSet }: ChannelZoneProps) {
  const [over, setOver] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Move focus into the inline editor when it opens (replaces autoFocus).
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const filled = Boolean(value && value.length > 0);

  const commitDraft = (): void => {
    const next = draft.trim();
    setEditing(false);
    setDraft("");
    if (next.length > 0) onSet(next);
  };

  // Idle empty zones read as dashed drop-targets; a field-bearing drag lights
  // the whole cell with a solid accent ring + tinted fill (clear affordance).
  const idleShadow = filled
    ? "inset 0 0 0 1px var(--glass-border)"
    : "inset 0 0 0 1px var(--glass-border), inset 0 0 0 1.5px transparent";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {def.label}
      </span>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only drag-drop target; keyboard users set the value via the focusable button/input rendered inside. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!over) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const dropped = e.dataTransfer.getData(FIELD_MIME).trim();
          if (dropped.length > 0) onSet(dropped);
        }}
        className={cn(
          "group relative flex h-10 min-w-0 items-center rounded-lg px-2.5 transition-all duration-200",
          filled ? "bg-[var(--glass-bg-strong)]" : "bg-[var(--glass-bg)]",
          // Dashed hint outline only while idle + empty; suppressed when filled or dragging over.
          !filled && !over && "outline-dashed outline-1 outline-offset-[-3px] outline-border",
        )}
        style={{
          boxShadow: over ? `inset 0 0 0 1.5px ${MOUDIR.coral}` : idleShadow,
          backgroundColor: over ? `${MOUDIR.coral}14` : undefined,
        }}
      >
        {filled ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "truncate text-sm",
                isDerived ? "italic text-foreground" : "text-foreground",
              )}
              title={isDerived ? `${value} — champ à dériver` : value}
            >
              {value}
            </span>
            {isDerived && (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ color: MOUDIR.gold, boxShadow: `inset 0 0 0 1px ${MOUDIR.gold}55` }}
              >
                à dériver
              </span>
            )}
            <button
              type="button"
              aria-label={`Effacer ${def.label}`}
              onClick={() => onSet(undefined)}
              className={cn(
                "ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                "transition-all duration-200 hover:text-foreground active:scale-[0.92]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring,#17a2c9)]",
              )}
              style={{ boxShadow: "inset 0 0 0 1px var(--glass-border)" }}
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
        ) : editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft("");
              }
            }}
            placeholder="Champ ou nom…"
            className={cn(
              "min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none",
              "placeholder:text-muted-foreground/60",
            )}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Déposez un champ ici ou saisissez un nom"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground",
              "transition-colors duration-200 hover:text-foreground",
              "focus-visible:outline-none focus-visible:text-foreground",
            )}
          >
            <Plus
              size={13}
              strokeWidth={2.2}
              className="shrink-0 opacity-60 transition-opacity duration-200 group-hover:opacity-100"
            />
            <span className="truncate">Champ ou nom…</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface MarkControlProps {
  mark: ChartMark;
  onPick(mark: ChartMark): void;
}

function MarkControl({ mark, onPick }: MarkControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Type de graphique"
      className="flex h-10 shrink-0 items-center gap-0.5 rounded-lg p-0.5"
      style={{ boxShadow: "inset 0 0 0 1px var(--glass-border)" }}
    >
      {MARKS.map((m) => {
        const active = m.value === mark;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(m.value)}
            className={cn(
              "relative h-full rounded-md px-2.5 text-xs font-medium transition-all duration-200",
              "active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring,#17a2c9)]",
              active ? "text-white" : "text-muted-foreground hover:text-foreground",
            )}
            style={active ? { backgroundColor: MOUDIR.coral } : undefined}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function EncodingShelf({
  encoding,
  onChange,
  onFormulate,
  running = false,
  className,
  fields = [],
}: EncodingShelfProps) {
  const motionOn = useMotionOn();
  const known = new Set(fields.map((f) => f.toLowerCase()));
  const isDerived = (name?: string): boolean =>
    Boolean(name && name.trim().length > 0 && !known.has(name.trim().toLowerCase()));

  const setChannel = (key: ChannelKey, value: string | undefined): void => {
    onChange({ ...encoding, [key]: value });
  };

  const hasAny = Boolean(encoding.x || encoding.y || encoding.color);

  return (
    <motion.section
      variants={motionOn ? stagger : undefined}
      initial={motionOn ? "hidden" : false}
      animate={motionOn ? "show" : false}
      className={cn("rounded-2xl p-4", "bg-[var(--glass-bg-strong)]", className)}
      style={{ boxShadow: "inset 0 0 0 1px var(--glass-border)" }}
    >
      <motion.div variants={motionOn ? rise : undefined} className="mb-3">
        <Kicker tone="coral">Encodage</Kicker>
      </motion.div>

      {/* Three equal-width channels share the row evenly so no zone looks empty. */}
      <motion.div
        variants={motionOn ? rise : undefined}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {CHANNELS.map((def) => (
          <ChannelZone
            key={def.key}
            def={def}
            value={encoding[def.key]}
            isDerived={isDerived(encoding[def.key])}
            onSet={(value) => setChannel(def.key, value)}
          />
        ))}
      </motion.div>

      {/* Single tidy action row: mark-type segmented control on the left, */}
      {/* Formuler anchored hard-right — no floating button in an empty band. */}
      <motion.div
        variants={motionOn ? rise : undefined}
        className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Type
          </span>
          <MarkControl mark={encoding.mark} onPick={(m) => onChange({ ...encoding, mark: m })} />
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          {!hasAny && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Renseignez au moins un axe
            </span>
          )}
          <button
            type="button"
            disabled={running || !hasAny}
            onClick={() => onFormulate(composePrompt(encoding, fields))}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white",
              "transition-all duration-200 active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring,#17a2c9)] focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
            style={{ backgroundColor: MOUDIR.coral }}
          >
            <Sparkles
              size={15}
              strokeWidth={2.2}
              className={running ? "animate-pulse" : undefined}
            />
            {running ? "Formulation…" : "Formuler"}
          </button>
        </div>
      </motion.div>
    </motion.section>
  );
}
