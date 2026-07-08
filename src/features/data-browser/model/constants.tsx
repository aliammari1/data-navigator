import { Calendar, CircleDot, ExternalLink, Hash, ToggleLeft, Type } from "lucide-react";
import type React from "react";
import type { ColType, FilterRule } from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

export const PAGE_SIZES = [25, 50, 100, 250, 500];
export const OPERATOR_LABELS: Record<FilterRule["operator"], string> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  gte: "≥",
  lt: "less than",
  lte: "≤",
  contains: "contains",
  not_contains: "not contains",
  starts_with: "starts with",
  ends_with: "ends with",
  is_null: "is null",
  is_not_null: "is not null",
  in: "in list",
  between: "between",
};

export const TYPE_ICON: Record<ColType, React.ReactNode> = {
  string: <Type className="h-3 w-3" />,
  number: <Hash className="h-3 w-3" />,
  date: <Calendar className="h-3 w-3" />,
  boolean: <ToggleLeft className="h-3 w-3" />,
  email: <CircleDot className="h-3 w-3" />,
  url: <ExternalLink className="h-3 w-3" />,
};

export const TYPE_COLORS: Record<ColType, string> = {
  string: "text-blue-400",
  number: "text-emerald-400",
  date: "text-purple-400",
  boolean: "text-amber-400",
  email: "text-pink-400",
  url: "text-cyan-400",
};
