"use client";

import { memo } from "react";

export const SuccessGauge = memo(function SuccessGauge({
  rate,
  size = 80,
}: {
  rate: number;
  size?: number;
}) {
  const r = size * 0.35;
  const circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ * 0.75;
  const col = rate >= 95 ? "#10b981" : rate >= 80 ? "#f59e0b" : "#ef4444";
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Success rate ${rate.toFixed(1)}%`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#ffffff0a"
        strokeWidth="5"
        strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
        strokeLinecap="round"
        transform={`rotate(135 ${cx} ${cy})`}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={col}
        strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(135 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
      <text
        x={cx}
        y={cy + 2}
        textAnchor="middle"
        fill={col}
        fontSize={size * 0.165}
        fontWeight="700"
      >
        {rate.toFixed(0)}%
      </text>
      <text x={cx} y={cy + size * 0.195} textAnchor="middle" fill="#6c7086" fontSize={size * 0.1}>
        Rate
      </text>
    </svg>
  );
});
