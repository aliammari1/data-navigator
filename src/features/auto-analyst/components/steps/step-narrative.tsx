"use client";

import { AtlasCallout } from "@/design/blocks/severity-callout";
import type { NarrativeBullet } from "@/features/auto-analyst/core/types";

export function StepNarrative({ bullets }: { bullets: NarrativeBullet[] }) {
  if (!bullets.length)
    return (
      <p className="text-sm text-[var(--atlas-text-subtle)]">
        Run the analysis steps first — narrative will summarise the findings.
      </p>
    );
  return (
    <div className="space-y-2.5">
      {bullets.map((b) => (
        <AtlasCallout key={b.id} severity={b.severity} title={b.title}>
          {b.detail}
        </AtlasCallout>
      ))}
    </div>
  );
}
