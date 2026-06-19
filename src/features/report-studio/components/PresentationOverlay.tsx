"use client";

/**
 * Full-screen presentation overlay (kiosk mode). 5 data-driven slides, all fed
 * from the SAME real `ReportData` used by exports — no separate sample.
 *
 * The keydown listener uses a ref for the current slide so it subscribes ONCE
 * (not on every slide change), and autoplay is a single interval.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReportData } from "../lib/types";

const TOTAL = 5;

function fmtNum(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}
function fmtAmount(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
}

export function PresentationOverlay({ data, onClose }: { data: ReportData; onClose: () => void }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  const goTo = useCallback((idx: number) => {
    setCurrentSlide(((idx % TOTAL) + TOTAL) % TOTAL);
  }, []);

  // Autoplay — single interval, toggled by autoPlay.
  useEffect(() => {
    if (!autoPlay) return;
    const id = setInterval(() => setCurrentSlide((s) => (s + 1) % TOTAL), 8000);
    return () => clearInterval(id);
  }, [autoPlay]);

  // Keyboard nav — subscribe ONCE; read current slide via ref.
  const slideRef = useRef(currentSlide);
  slideRef.current = currentSlide;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goTo(slideRef.current + 1);
      else if (e.key === "ArrowLeft") goTo(slideRef.current - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goTo]);

  return (
    <div className="fixed inset-0 z-[200] bg-[#03071e] flex flex-col select-none">
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <Button
          size="sm"
          variant="ghost"
          className="text-white/60 hover:text-white hover:bg-white/10"
          onClick={() => setAutoPlay((a) => !a)}
        >
          {autoPlay ? "⏸ Pause" : "▶ Auto"}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-white/60 hover:text-white hover:bg-white/10"
          onClick={onClose}
        >
          ✕
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center px-8">
        {currentSlide === 0 && (
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-full text-sm font-medium border border-blue-500/30">
              {data.companyName || "Telecom Analytics"}
            </div>
            <h1 className="text-6xl font-bold text-white leading-tight">
              Daily Transaction
              <br />
              Report
            </h1>
            <p className="text-2xl text-slate-400">{data.date}</p>
            <div className="flex items-center justify-center gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">
                  {fmtNum(data.totalTransactions)}
                </div>
                <div className="text-slate-500 text-sm">Transactions</div>
              </div>
              <div className="w-px h-12 bg-slate-700" />
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{fmtPct(data.successRate)}</div>
                <div className="text-slate-500 text-sm">Success Rate</div>
              </div>
            </div>
          </div>
        )}

        {currentSlide === 1 && (
          <div className="w-full max-w-5xl">
            <h2 className="text-3xl font-bold text-white mb-8 text-center">
              Key Performance Indicators
            </h2>
            <div className="grid grid-cols-2 gap-6">
              {[
                {
                  label: "Total Transactions",
                  value: fmtNum(data.totalTransactions),
                  color: "blue",
                  sub: "processed today",
                },
                {
                  label: "Success Rate",
                  value: fmtPct(data.successRate),
                  color: "green",
                  sub: "of all transactions",
                },
                {
                  label: "Total Revenue",
                  value: fmtAmount(data.totalRevenue),
                  color: "amber",
                  sub: "revenue generated",
                },
                {
                  label: "Failed Transactions",
                  value: fmtNum(data.failedTransactions),
                  color: "red",
                  sub: "require attention",
                },
              ].map((kpi) => {
                const colorMap: Record<string, string> = {
                  blue: "border-blue-500 text-blue-400",
                  green: "border-green-500 text-green-400",
                  amber: "border-amber-500 text-amber-400",
                  red: "border-red-500 text-red-400",
                };
                return (
                  <div
                    key={kpi.label}
                    className={`bg-white/5 border-2 rounded-2xl p-8 text-center ${colorMap[kpi.color]}`}
                  >
                    <div className={`text-5xl font-bold ${colorMap[kpi.color].split(" ")[1]}`}>
                      {kpi.value}
                    </div>
                    <div className="text-white text-xl font-semibold mt-3">{kpi.label}</div>
                    <div className="text-slate-500 text-sm mt-1">{kpi.sub}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentSlide === 2 && (
          <div className="w-full max-w-5xl">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Channel Performance</h2>
            <div className="space-y-3">
              {data.topChannels.slice(0, 5).map((ch, i) => {
                const barColor =
                  ch.successRate >= 95
                    ? "bg-green-500"
                    : ch.successRate >= 85
                      ? "bg-blue-500"
                      : ch.successRate >= 70
                        ? "bg-amber-500"
                        : "bg-red-500";
                return (
                  <div key={ch.name} className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 text-sm w-4">{i + 1}</span>
                        <span className="text-white font-medium">{ch.name}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-slate-400 text-sm">{fmtNum(ch.volume)} txns</span>
                        <span
                          className={`font-bold text-lg ${ch.successRate >= 95 ? "text-green-400" : ch.successRate >= 85 ? "text-blue-400" : ch.successRate >= 70 ? "text-amber-400" : "text-red-400"}`}
                        >
                          {fmtPct(ch.successRate)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-1000`}
                        style={{ width: `${ch.successRate}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentSlide === 3 && (
          <div className="w-full max-w-4xl text-center">
            <h2 className="text-3xl font-bold text-white mb-8">Overall Success Rate</h2>
            <div className="relative inline-flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-64 h-64">
                <circle
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="16"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  stroke={
                    data.successRate >= 95
                      ? "#22c55e"
                      : data.successRate >= 80
                        ? "#3b82f6"
                        : "#ef4444"
                  }
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${(data.successRate / 100) * 502} 502`}
                  strokeDashoffset="125"
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <div className="absolute text-center">
                <div
                  className={`text-5xl font-bold ${data.successRate >= 95 ? "text-green-400" : data.successRate >= 80 ? "text-blue-400" : "text-red-400"}`}
                >
                  {fmtPct(data.successRate)}
                </div>
                <div className="text-slate-400 text-sm mt-1">success rate</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6 mt-8">
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <div className="text-green-400 text-2xl font-bold">
                  {fmtNum(data.totalTransactions - data.failedTransactions)}
                </div>
                <div className="text-slate-400 text-sm mt-1">Successful</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="text-red-400 text-2xl font-bold">
                  {fmtNum(data.failedTransactions)}
                </div>
                <div className="text-slate-400 text-sm mt-1">Failed</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <div className="text-blue-400 text-2xl font-bold">
                  {data.topChannels.filter((c) => c.successRate >= 95).length}
                </div>
                <div className="text-slate-400 text-sm mt-1">Channels ≥95%</div>
              </div>
            </div>
          </div>
        )}

        {currentSlide === 4 && (
          <div className="w-full max-w-4xl">
            <h2 className="text-3xl font-bold text-white mb-8 text-center">System Alerts</h2>
            {data.topChannels.filter((c) => c.successRate < 90).length === 0 &&
            data.successRate >= 90 &&
            !data.anomalies?.length ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-10 text-center">
                <div className="text-6xl mb-4">✓</div>
                <div className="text-green-400 text-2xl font-bold">All Systems Nominal</div>
                <div className="text-slate-400 mt-2">
                  No critical alerts detected during this period
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {data.successRate < 90 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex items-start gap-4">
                    <span className="text-red-400 text-2xl">⚠</span>
                    <div>
                      <div className="text-red-400 font-bold text-lg">
                        Critical: Low Overall Success Rate
                      </div>
                      <div className="text-slate-400 mt-1">
                        Overall rate {fmtPct(data.successRate)} is below 90% threshold
                      </div>
                    </div>
                  </div>
                )}
                {data.topChannels
                  .filter((c) => c.successRate < 90)
                  .map((ch) => (
                    <div
                      key={ch.name}
                      className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 flex items-start gap-4"
                    >
                      <span className="text-amber-400 text-2xl">⚑</span>
                      <div>
                        <div className="text-amber-400 font-bold text-lg">Warning: {ch.name}</div>
                        <div className="text-slate-400 mt-1">
                          Success rate {fmtPct(ch.successRate)} requires investigation
                        </div>
                      </div>
                    </div>
                  ))}
                {(data.anomalies ?? []).map((a) => (
                  <div
                    key={`anom-${a.hour}`}
                    className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-6 flex items-start gap-4"
                  >
                    <span className="text-purple-400 text-2xl">◈</span>
                    <div>
                      <div className="text-purple-400 font-bold text-lg">Anomaly: {a.hour}:00</div>
                      <div className="text-slate-400 mt-1">
                        Volume {fmtNum(a.count)} flagged by GESD (score {a.score.toFixed(2)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 pb-8">
        <Button
          size="icon"
          variant="ghost"
          className="text-white/60 hover:text-white hover:bg-white/10 w-12 h-12 text-xl"
          onClick={() => goTo(currentSlide - 1)}
        >
          ←
        </Button>
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <button
              type="button"
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all ${i === currentSlide ? "w-6 h-2.5 bg-blue-400" : "w-2.5 h-2.5 bg-white/20 hover:bg-white/40"}`}
            />
          ))}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="text-white/60 hover:text-white hover:bg-white/10 w-12 h-12 text-xl"
          onClick={() => goTo(currentSlide + 1)}
        >
          →
        </Button>
      </div>
    </div>
  );
}
