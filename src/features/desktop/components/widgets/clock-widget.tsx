"use client";

import { useEffect, useState } from "react";

/**
 * Clock widget — a live local-time clock with the French long date underneath.
 * Self-contained: ticks once per second via a local interval, no data deps.
 */
interface ClockWidgetProps {
  config: Record<string, unknown>;
}

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function ClockWidget({ config }: ClockWidgetProps) {
  const showSeconds = config.showSeconds === true;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const time = showSeconds ? now.toLocaleTimeString("fr-FR") : TIME_FMT.format(now);
  const date = DATE_FMT.format(now);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-1">
      <div
        className="font-semibold tabular-nums"
        style={{ color: "var(--glass-text)", fontSize: "30px", lineHeight: 1 }}
      >
        {time}
      </div>
      <div
        className="text-center text-[11px] capitalize"
        style={{ color: "var(--glass-text-dim)" }}
      >
        {date}
      </div>
    </div>
  );
}
