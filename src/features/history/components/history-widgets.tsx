import {
  type DiffLine,
  type VersionEntry,
} from "@/features/history/model/types";
import { typeColor, typeIcon } from "@/features/history/model/format";
// ─── Sub-components ────────────────────────────────────────────────────────

export function VersionBadge({ type }: { type: VersionEntry["type"] }) {
  const Icon = typeIcon(type);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${typeColor(type)}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {type}
    </span>
  );
}

export function AuthorAvatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const colors = [
    "bg-indigo-600",
    "bg-purple-600",
    "bg-blue-600",
    "bg-emerald-600",
    "bg-rose-600",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  const sz = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";
  return (
    <span
      className={`${sz} ${colors[idx]} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
    >
      {initials}
    </span>
  );
}

export function DiffViewer({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="font-mono text-xs overflow-x-auto">
      {lines.map((line, i) => {
        const lineKey = `${line.type}-${line.oldLine ?? ""}-${line.newLine ?? ""}-${i}`;
        if (line.type === "hunk") {
          return (
            <div
              key={lineKey}
              className="bg-blue-900/30 text-blue-300 px-3 py-1 select-none"
            >
              {line.content}
            </div>
          );
        }
        const cls =
          line.type === "added"
            ? "bg-green-500/10 text-green-300"
            : line.type === "removed"
              ? "bg-red-500/10 text-red-300"
              : "text-muted-foreground";
        const prefix =
          line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";
        const lineNumOld = line.type !== "added" ? (line.oldLine ?? "") : "";
        const lineNumNew = line.type !== "removed" ? (line.newLine ?? "") : "";
        return (
          <div key={lineKey} className={`flex ${cls} leading-5`}>
            <span className="w-8 text-right pr-2 text-muted-foreground select-none border-r border-border flex-shrink-0">
              {lineNumOld}
            </span>
            <span className="w-8 text-right pr-2 text-muted-foreground select-none border-r border-border flex-shrink-0">
              {lineNumNew}
            </span>
            <span className="px-1 select-none text-muted-foreground flex-shrink-0 w-4">
              {prefix}
            </span>
            <span className="flex-1 px-1 whitespace-pre">{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}
