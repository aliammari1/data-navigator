"use client";

/**
 * ShelfWorkspace — the self-contained drag-and-drop surface pairing the
 * concepts panel with the encoding shelf (DF's signature interaction).
 *
 * Owns the single DndContext: PointerSensor + KeyboardSensor
 * (sortableKeyboardCoordinates), closestCenter collision, and a DragOverlay
 * rendering a pill clone while dragging (per the dnd-kit guidance: NO motion
 * layout animation on the pills themselves — the overlay's default drop
 * animation is the only settle).
 *
 * Drop contract: draggable id = concept NAME, droppable id = channel;
 * a drop calls `bindField(channel, name)` on the formulator store.
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState } from "react";
import { cn } from "@/shared/utils";
import {
  type ShelfChannel,
  useFormConcepts,
  useFormulatorV2Store,
} from "../../store/formulator-store";
import { ConceptsPanel } from "./concepts-panel";
import { EncodingShelf } from "./encoding-shelf";
import { FieldPill } from "./field-pill";

/** Droppable ids — the five shelf channels rendered by EncodingShelf. */
const DROPPABLE_CHANNELS: ReadonlySet<string> = new Set(["x", "y", "color", "size", "facet"]);

export function ShelfWorkspace({ className }: Readonly<{ className?: string }>) {
  const concepts = useFormConcepts();
  const bindField = useFormulatorV2Store((s) => s.bindField);
  const [activeName, setActiveName] = useState<string | null>(null);

  const activeConcept = activeName ? (concepts.find((c) => c.name === activeName) ?? null) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveName(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveName(null);
    const target = event.over?.id;
    if (typeof target === "string" && DROPPABLE_CHANNELS.has(target)) {
      bindField(target as ShelfChannel, String(event.active.id));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveName(null)}
    >
      <div className={cn("flex min-h-0 items-stretch gap-4", className)}>
        <ConceptsPanel className="w-60 shrink-0" />
        <EncodingShelf className="min-w-0 flex-1" />
      </div>
      <DragOverlay>
        {activeConcept ? (
          <FieldPill
            name={activeConcept.name}
            dtype={activeConcept.dtype}
            source={activeConcept.source}
            className="shadow-md"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
