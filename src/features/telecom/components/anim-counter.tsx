"use client";

import { useEffect, useRef } from "react";
import { fmtN } from "@/features/telecom/lib/format";

export function AnimCounter({ value, dec = 0 }: { value: number; dec?: number }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const t0 = performance.now();
    const dur = 800;

    const tick = (t: number) => {
      const p = Math.min((t - t0) / dur, 1);
      const e = 1 - (1 - p) ** 3;
      const disp = from + (value - from) * e;
      if (spanRef.current) {
        spanRef.current.textContent = fmtN(disp, dec);
      }
      if (p < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, dec]);

  return <span ref={spanRef}>{fmtN(value, dec)}</span>;
}
