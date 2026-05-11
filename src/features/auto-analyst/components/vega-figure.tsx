"use client";

import { VegaEmbed } from "react-vega";
import type { TopLevelSpec } from "vega-lite";

interface Props {
  spec: TopLevelSpec;
  className?: string;
  height?: number;
}

export function VegaFigure({ spec, className, height = 280 }: Props) {
  return (
    <div className={className} style={{ height }}>
      <VegaEmbed
        spec={spec as unknown as Record<string, unknown>}
        options={{ actions: false, renderer: "canvas" }}
      />
    </div>
  );
}
