"use client";

// FACTS (GateGuard): imported by MoudirSwarmScreen / formulator screens | exports FieldsPanel, FieldsPanelProps | reads/writes NO data files

import { Calendar, Hash, Search, Type } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  Kicker,
  MOUDIR,
  Rule,
  rise,
  stagger,
  useMotionOn,
} from "@/features/data-formulator/components/moudir/moudir-kit";
import type { ColType, ColumnInfo } from "@/features/data-formulator/core/types";
import { cn } from "@/shared/utils";

const MOUDIR_FIELD_MIME = "application/x-moudir-field";

type FieldKind = "quantitative" | "temporal" | "nominal";

const QUANTITATIVE_TYPES: ReadonlySet<ColType> = new Set<ColType>(["number"]);
const TEMPORAL_TYPES: ReadonlySet<ColType> = new Set<ColType>(["date"]);

export interface FieldsPanelProps {
  columns: ColumnInfo[];
  datasetName: string;
  rowCount: number;
  activeFields?: string[];
  className?: string;
}

interface FieldGroup {
  key: "mesures" | "dimensions";
  label: string;
  columns: ColumnInfo[];
}

function classifyColumn(column: ColumnInfo): FieldKind {
  if (QUANTITATIVE_TYPES.has(column.type)) return "quantitative";
  if (TEMPORAL_TYPES.has(column.type)) return "temporal";
  return "nominal";
}

function glyphFor(kind: FieldKind) {
  if (kind === "quantitative") return Hash;
  if (kind === "temporal") return Calendar;
  return Type;
}

function formatRowCount(rowCount: number): string {
  if (!Number.isFinite(rowCount) || rowCount < 0) return "0";
  return new Intl.NumberFormat("fr-FR").format(Math.trunc(rowCount));
}

function FieldChip({
  column,
  active,
  motionOn,
}: {
  column: ColumnInfo;
  active: boolean;
  motionOn: boolean;
}) {
  const kind = classifyColumn(column);
  const Glyph = glyphFor(kind);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(MOUDIR_FIELD_MIME, column.name);
    event.dataTransfer.setData("text/plain", column.name);
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <motion.div
      variants={motionOn ? rise : undefined}
      draggable
      // native HTML5 drag on a motion element — cast past framer-motion's gesture typing
      onDragStart={handleDragStart as unknown as React.ComponentProps<typeof motion.div>["onDragStart"]}
      title={`${column.name} · ${column.dbType}`}
      className={cn(
        "group flex h-8 items-center gap-2 rounded-md px-2",
        "cursor-grab select-none transition-all duration-200",
        "hover:-translate-y-px active:cursor-grabbing active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#17a2c9]/50",
      )}
      style={{
        backgroundColor: active
          ? "color-mix(in srgb, #17a2c9 14%, transparent)"
          : "var(--glass-bg)",
        boxShadow: active
          ? `inset 0 0 0 1px ${MOUDIR.coral}`
          : "inset 0 0 0 1px var(--glass-border)",
      }}
    >
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] tabular-nums transition-colors duration-200 group-hover:text-[#17a2c9]"
        style={{
          color: active ? MOUDIR.coral : MOUDIR.muted,
          backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
        }}
      >
        {kind === "nominal" ? (
          <span className="text-[9px] font-bold leading-none">Aa</span>
        ) : (
          <Glyph className="h-3 w-3" strokeWidth={2.25} />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13px] leading-tight",
          active ? "text-foreground" : "text-foreground/85",
        )}
      >
        {column.name}
      </span>
      {column.derived ? (
        <span
          className="shrink-0 text-[10px] font-semibold uppercase leading-none"
          style={{ color: MOUDIR.coral }}
          title="Champ dérivé"
        >
          ƒ
        </span>
      ) : null}
    </motion.div>
  );
}

function GroupSection({
  group,
  activeSet,
  motionOn,
}: {
  group: FieldGroup;
  activeSet: Set<string>;
  motionOn: boolean;
}) {
  if (group.columns.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between px-1">
        <Kicker tone="muted">{group.label}</Kicker>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {group.columns.length}
        </span>
      </div>
      <motion.div
        variants={motionOn ? stagger : undefined}
        initial={motionOn ? "hidden" : undefined}
        animate={motionOn ? "show" : undefined}
        className="space-y-0.5"
      >
        {group.columns.map((column) => (
          <FieldChip
            key={column.name}
            column={column}
            active={activeSet.has(column.name)}
            motionOn={motionOn}
          />
        ))}
      </motion.div>
    </section>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{
          color: MOUDIR.muted,
          boxShadow: "inset 0 0 0 1px var(--glass-border)",
        }}
      >
        {filtered ? (
          <Search className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <Hash className="h-4 w-4" strokeWidth={1.75} />
        )}
      </div>
      <p className="text-sm font-medium text-foreground">
        {filtered ? "Aucun résultat" : "Aucun champ"}
      </p>
      <p className="max-w-[200px] text-xs leading-relaxed text-muted-foreground">
        {filtered
          ? "Aucun champ ne correspond à ce filtre."
          : "Chargez un jeu de données pour voir ses mesures et dimensions."}
      </p>
    </div>
  );
}

export function FieldsPanel({
  columns,
  datasetName,
  rowCount,
  activeFields,
  className,
}: FieldsPanelProps) {
  const motionOn = useMotionOn();
  const [query, setQuery] = useState("");
  const activeSet = useMemo(() => new Set(activeFields ?? []), [activeFields]);

  const groups = useMemo<FieldGroup[]>(() => {
    const needle = query.trim().toLowerCase();
    const mesures: ColumnInfo[] = [];
    const dimensions: ColumnInfo[] = [];
    for (const column of columns) {
      if (needle && !column.name.toLowerCase().includes(needle)) continue;
      if (classifyColumn(column) === "quantitative") mesures.push(column);
      else dimensions.push(column);
    }
    return [
      { key: "mesures", label: "Mesures", columns: mesures },
      { key: "dimensions", label: "Dimensions", columns: dimensions },
    ];
  }, [columns, query]);

  const hasColumns = columns.length > 0;
  const isFiltering = query.trim().length > 0;
  const matchCount = groups[0].columns.length + groups[1].columns.length;
  const hasMatches = matchCount > 0;

  return (
    <div
      className={cn("flex h-full flex-col overflow-hidden rounded-xl", className)}
      style={{
        backgroundColor: "var(--glass-bg-strong)",
        boxShadow: "inset 0 0 0 1px var(--glass-border)",
      }}
    >
      <header className="space-y-2 px-3 pb-2.5 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <Kicker tone="coral">Champs</Kicker>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {formatRowCount(rowCount)} lignes
          </span>
        </div>
        <h2
          className="truncate text-sm font-semibold leading-tight text-foreground"
          title={datasetName || "Sans titre"}
        >
          {datasetName || "Sans titre"}
        </h2>
        {hasColumns ? (
          <label className="relative block">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrer les champs…"
              aria-label="Filtrer les champs"
              className={cn(
                "h-8 w-full rounded-md bg-[var(--glass-bg)] pl-8 pr-2 text-[13px] text-foreground",
                "placeholder:text-muted-foreground transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#17a2c9]/50",
              )}
              style={{ boxShadow: "inset 0 0 0 1px var(--glass-border)" }}
            />
          </label>
        ) : null}
      </header>

      <Rule />

      {hasColumns ? (
        hasMatches ? (
          <div className="flex-1 space-y-3 overflow-y-auto px-2 py-2.5">
            {groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                activeSet={activeSet}
                motionOn={motionOn}
              />
            ))}
          </div>
        ) : (
          <EmptyState filtered={isFiltering} />
        )
      ) : (
        <EmptyState filtered={false} />
      )}
    </div>
  );
}
