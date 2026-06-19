import { AlertCircle, Calendar, Hash, Sigma, ToggleLeft, Type } from "lucide-react";
import type { ColProfile } from "./types";
// ─── Utility ───────────────────────────────────────────────────────────────

export function qualityColor(score: number): string {
  if (score >= 0.9) return "#22c55e";
  if (score >= 0.7) return "#f59e0b";
  if (score >= 0.5) return "#f97316";
  return "#ef4444";
}

export function qualityLabel(score: number): string {
  if (score >= 0.9) return "Excellent";
  if (score >= 0.7) return "Good";
  if (score >= 0.5) return "Fair";
  return "Poor";
}

export function typeIcon(type: ColProfile["type"]) {
  switch (type) {
    case "integer":
      return Hash;
    case "float":
      return Sigma;
    case "string":
      return Type;
    case "boolean":
      return ToggleLeft;
    case "date":
      return Calendar;
    default:
      return AlertCircle;
  }
}

export function typeColor(type: ColProfile["type"]): string {
  switch (type) {
    case "integer":
      return "bg-blue-500/20 text-blue-300";
    case "float":
      return "bg-indigo-500/20 text-indigo-300";
    case "string":
      return "bg-purple-500/20 text-purple-300";
    case "boolean":
      return "bg-green-500/20 text-green-300";
    case "date":
      return "bg-orange-500/20 text-orange-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}
