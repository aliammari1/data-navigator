"use client";

import { Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { AtlasButton } from "@/design/primitives/button";
import { AtlasInput } from "@/design/primitives/input";

interface Props {
  onAsk: (question: string) => void;
  loading?: boolean;
  suggestions?: string[];
  placeholder?: string;
}

export function QABar({
  onAsk,
  loading,
  suggestions = [
    "top 10 services by amount",
    "trend over time",
    "distribution of duration",
    "compare amount vs duration",
    "outliers in amount",
  ],
  placeholder = 'Ask the analyst — "why did revenue drop on 2025-12-04?"',
}: Props) {
  const [q, setQ] = useState("");
  const submit = () => {
    if (!q.trim()) return;
    onAsk(q.trim());
    setQ("");
  };
  return (
    <div className="rounded-(--atlas-radius-3) border border-(--atlas-border) bg-(--atlas-surface-raised) shadow-(--atlas-shadow-2) p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-(--atlas-accent-fg) flex-none" />
        <AtlasInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={placeholder}
        />
        <AtlasButton
          variant="solid"
          size="md"
          onClick={submit}
          disabled={loading}
        >
          <Wand2 className="w-3.5 h-3.5" /> Ask
        </AtlasButton>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAsk(s)}
              className="atlas-focus-ring text-[11px] px-2 py-0.5 rounded-(--atlas-radius-pill) bg-(--atlas-surface) border border-(--atlas-border) text-(--atlas-text-muted) hover:border-(--atlas-accent-border) hover:text-(--atlas-accent-fg) transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
