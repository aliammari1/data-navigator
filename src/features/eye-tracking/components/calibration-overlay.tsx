"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { eyeTracker } from "../core/eyetracker";
import { useEyeTrackingActions } from "../store/eye-tracking-store";

/**
 * Full-window calibration flow.
 *
 * webgazer learns its gaze→screen regression from real clicks, so we walk the
 * user through a 3×3 grid of 9 dots, asking for 5 clicks on each. Every click
 * is fed to `eyeTracker.recordCalibrationPoint`. Once all dots are trained we
 * run a short accuracy probe: the user stares at a centre target while we sample
 * predictions and convert mean pixel error into a rough 0–100 score.
 *
 * Rendered by the screen via a portal to `document.body` so it covers the whole
 * desktop (all floating windows), not just the feature's own window.
 */

const CLICKS_PER_POINT = 5;
const ACCURACY_SAMPLES = 30;
const ACCURACY_DURATION_MS = 3000;

// 3×3 grid expressed as viewport fractions.
const GRID_POINTS = [
  { x: 0.1, y: 0.1 },
  { x: 0.5, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 },
  { x: 0.5, y: 0.9 },
  { x: 0.9, y: 0.9 },
] as const;

type Phase = "calibrating" | "measuring" | "done";

export interface CalibrationOverlayProps {
  onClose: () => void;
}

export function CalibrationOverlay({ onClose }: CalibrationOverlayProps) {
  const { setCalibrated, setCalibrationPoints, setAccuracy } = useEyeTrackingActions();

  const [clicks, setClicks] = useState<number[]>(() => GRID_POINTS.map(() => 0));
  const [phase, setPhase] = useState<Phase>("calibrating");
  const [measureProgress, setMeasureProgress] = useState(0);
  const [finalAccuracy, setFinalAccuracy] = useState<number | null>(null);

  // The header and footer overlap the viewport edges; measure them so the dot
  // grid can be laid out inside a safe region that never collides with either.
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [safeZone, setSafeZone] = useState({ top: 208, bottom: 160 });

  useEffect(() => {
    const measure = () => {
      const headerH = headerRef.current?.offsetHeight ?? 0;
      const footerH = footerRef.current?.offsetHeight ?? 0;
      // Header starts at top-8 (2rem); footer sits at bottom-10 (2.5rem).
      // Add breathing room so dots clear the text/button comfortably.
      setSafeZone({
        top: Math.max(160, headerH + 32 + 40),
        bottom: Math.max(120, footerH + 40 + 40),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    if (footerRef.current) ro.observe(footerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const totalClicks = useMemo(() => clicks.reduce((a, b) => a + b, 0), [clicks]);
  const completedDots = useMemo(() => clicks.filter((c) => c >= CLICKS_PER_POINT).length, [clicks]);
  const allTrained = completedDots === GRID_POINTS.length;

  const handleDotClick = useCallback((index: number, clientX: number, clientY: number) => {
    eyeTracker.recordCalibrationPoint(clientX, clientY);
    setClicks((prev) => {
      if (prev[index] >= CLICKS_PER_POINT) return prev;
      const next = [...prev];
      next[index] += 1;
      return next;
    });
  }, []);

  // Accuracy probe: sample predicted vs. known centre point for a few seconds.
  const runMeasurement = useCallback(() => {
    setPhase("measuring");
    const targetX = window.innerWidth / 2;
    const targetY = window.innerHeight / 2;
    const errors: number[] = [];
    const start = Date.now();

    const interval = window.setInterval(() => {
      const pred = eyeTracker.getCurrentPrediction();
      if (pred) {
        const dx = pred.x - targetX;
        const dy = pred.y - targetY;
        errors.push(Math.hypot(dx, dy));
      }
      const elapsed = Date.now() - start;
      setMeasureProgress(Math.min(1, elapsed / ACCURACY_DURATION_MS));

      if (elapsed >= ACCURACY_DURATION_MS || errors.length >= ACCURACY_SAMPLES) {
        window.clearInterval(interval);
        // Convert mean pixel error to a 0–100 score. The screen diagonal is the
        // worst-case error; closer to the target ⇒ higher score.
        const meanError =
          errors.length > 0
            ? errors.reduce((a, b) => a + b, 0) / errors.length
            : Number.POSITIVE_INFINITY;
        const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
        const score = Number.isFinite(meanError)
          ? Math.max(0, Math.round(100 - (meanError / (diagonal / 2)) * 100))
          : 0;
        setFinalAccuracy(score);
        setAccuracy(score);
        setCalibrated(true);
        setPhase("done");
      }
    }, ACCURACY_DURATION_MS / ACCURACY_SAMPLES);
  }, [setAccuracy, setCalibrated]);

  // Keep the store's calibration-point counter in sync.
  useEffect(() => {
    setCalibrationPoints(totalClicks);
  }, [totalClicks, setCalibrationPoints]);

  // Allow Escape to bail out of calibration.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9998] bg-background/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Calibration du suivi oculaire"
    >
      {/* Header / instructions */}
      <div
        ref={headerRef}
        className="-translate-x-1/2 absolute top-8 left-1/2 z-10 w-[min(90vw,640px)] text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-muted-foreground text-sm shadow-sm">
          <Eye className="h-4 w-4 text-primary" aria-hidden />
          <span>Calibration du regard</span>
        </div>
        <h2 className="mt-4 font-semibold text-2xl text-foreground tracking-tight">
          {phase === "calibrating" && "Fixez chaque point puis cliquez dessus"}
          {phase === "measuring" && "Fixez le point central…"}
          {phase === "done" && "Calibration terminée"}
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          {phase === "calibrating" &&
            `Cliquez ${CLICKS_PER_POINT} fois sur chaque point en le regardant. ${completedDots} / ${GRID_POINTS.length} points calibrés.`}
          {phase === "measuring" &&
            "Gardez les yeux sur le point central pendant la mesure de précision."}
          {phase === "done" && "Vous pouvez fermer cette fenêtre et activer le point de regard."}
        </p>
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-8 right-8 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        aria-label="Fermer la calibration"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>

      {/* Calibration dots — laid out inside a safe region that clears the
          header (top) and footer (bottom) so dots never overlap the UI. */}
      {phase === "calibrating" && (
        <div
          className="absolute"
          style={{
            top: safeZone.top,
            bottom: safeZone.bottom,
            left: "max(2.5rem, 8vw)",
            right: "max(2.5rem, 8vw)",
          }}
        >
          {GRID_POINTS.map((point, index) => {
            const count = clicks[index];
            const done = count >= CLICKS_PER_POINT;
            const progress = count / CLICKS_PER_POINT;
            return (
              <button
                type="button"
                key={`cal-${point.x}-${point.y}`}
                onClick={(e) => handleDotClick(index, e.clientX, e.clientY)}
                className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center rounded-full outline-none"
                style={{
                  left: `${((point.x - 0.1) / 0.8) * 100}%`,
                  top: `${((point.y - 0.1) / 0.8) * 100}%`,
                  width: 56,
                  height: 56,
                }}
                aria-label={`Point de calibration ${index + 1}, ${count} sur ${CLICKS_PER_POINT}`}
              >
                <motion.span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: done
                      ? "color-mix(in oklab, var(--color-primary) 20%, transparent)"
                      : "color-mix(in oklab, var(--color-primary) 12%, transparent)",
                  }}
                  animate={done ? { scale: 1 } : { scale: [1, 1.18, 1] }}
                  transition={
                    done ? undefined : { duration: 1.6, repeat: Number.POSITIVE_INFINITY }
                  }
                />
                <span
                  className="relative flex items-center justify-center rounded-full font-semibold text-xs shadow-md transition-colors"
                  style={{
                    width: 28,
                    height: 28,
                    background: done ? "var(--color-primary)" : "var(--color-card)",
                    color: done ? "var(--color-primary-foreground)" : "var(--color-foreground)",
                    border: "2px solid var(--color-primary)",
                    opacity: 0.5 + progress * 0.5,
                  }}
                >
                  {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : CLICKS_PER_POINT - count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Centre measurement target */}
      {phase === "measuring" && (
        <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2">
          <motion.div
            className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary"
            animate={{ scale: [1, 0.85, 1] }}
            transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY }}
          >
            <span className="h-3 w-3 rounded-full bg-primary" />
            <svg
              className="-rotate-90 absolute inset-0 h-full w-full"
              viewBox="0 0 64 64"
              aria-hidden
            >
              <circle
                cx="32"
                cy="32"
                r="30"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="2"
                strokeDasharray={2 * Math.PI * 30}
                strokeDashoffset={2 * Math.PI * 30 * (1 - measureProgress)}
                opacity={0.35}
              />
            </svg>
          </motion.div>
        </div>
      )}

      {/* Footer actions */}
      <div
        ref={footerRef}
        className="-translate-x-1/2 absolute bottom-10 left-1/2 flex flex-col items-center gap-3"
      >
        <AnimatePresence mode="wait">
          {phase === "calibrating" && (
            <motion.button
              key="measure"
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              disabled={!allTrained}
              onClick={runMeasurement}
              className="rounded-xl bg-primary px-6 py-2.5 font-medium text-primary-foreground text-sm shadow-md transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mesurer la précision
            </motion.button>
          )}
          {phase === "done" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="rounded-xl border border-border bg-card px-6 py-4 text-center shadow-sm">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Précision estimée
                </p>
                <p className="mt-1 font-semibold text-3xl text-foreground">{finalAccuracy ?? 0}%</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-primary px-6 py-2.5 font-medium text-primary-foreground text-sm shadow-md"
              >
                Terminer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
