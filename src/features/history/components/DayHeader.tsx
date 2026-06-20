import { memo } from "react";
import { CalendarDays } from "lucide-react";

interface DayHeaderProps {
  label: string;
  count: number;
}

function DayHeaderInner({ label, count }: DayHeaderProps) {
  return (
    <div className="flex items-center gap-2 pt-2 text-xs font-semibold text-muted-foreground">
      <CalendarDays className="h-3.5 w-3.5" />
      {label}
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{count}</span>
    </div>
  );
}

export const DayHeader = memo(DayHeaderInner);
