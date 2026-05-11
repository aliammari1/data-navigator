"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useRef } from "react";

interface Props {
  options: Plot.PlotOptions;
  className?: string;
}

export function PlotFigure({ options, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = Plot.plot(options);
    ref.current.appendChild(el);
    return () => {
      el.remove();
    };
  }, [options]);
  return <div ref={ref} className={className} />;
}
