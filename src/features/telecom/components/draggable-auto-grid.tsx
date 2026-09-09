// src/features/telecom/components/draggable-auto-grid.tsx

"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/shared/utils";

export type DashboardCardSize = "sm" | "md" | "lg" | "wide" | "full";

export interface DashboardCardItem {
  id: string;
  size: DashboardCardSize;
  node: React.ReactNode;
}

function getCardClass(size: DashboardCardSize) {
  switch (size) {
    case "sm":
      return "lg:col-span-4";
    case "md":
      return "lg:col-span-6";
    case "lg":
      return "lg:col-span-8";
    case "wide":
      return "lg:col-span-8";
    case "full":
      return "lg:col-span-12";
    default:
      return "lg:col-span-6";
  }
}

function SortableCard({ item }: { item: DashboardCardItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "col-span-1 min-w-0",
        getCardClass(item.size),
        isDragging && "z-50 opacity-80 scale-[0.99]",
      )}
    >
      <div className="relative group">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute right-4 top-4 z-20 rounded-xl bg-muted/70 border border-border px-1.5 py-1 text-muted-foreground/60 opacity-70 hover:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {item.node}
      </div>
    </div>
  );
}

export function DraggableAutoGrid({
  items,
  onChange,
}: {
  items: DashboardCardItem[];
  onChange: (items: DashboardCardItem[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    onChange(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {items.map((item) => (
            <SortableCard key={item.id} item={item} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
