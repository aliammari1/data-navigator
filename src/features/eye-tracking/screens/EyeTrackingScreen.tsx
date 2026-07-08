"use client";

import {
  AlertTriangle,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  RotateCcw,
  ScanEye,
  ShieldCheck,
  Target,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { AttentionHeatmap } from "../components/attention-heatmap";
import { CalibrationOverlay } from "../components/calibration-overlay";
import { GazeDot } from "../components/gaze-dot";
import { EyeTrackerError, eyeTracker } from "../core/eyetracker";
import {
  useEyeAccuracy,
  useEyeActive,
  useEyeCalibrated,
  useEyeError,
  useEyeTrackingActions,
  useShowGazeDot,
  useShowHeatmap,
} from "../store/eye-tracking-store";

/**
 * Eye-tracking control panel — the desktop "app" hosted inside a floating window.
 *
 * Owns the tracker lifecycle and renders all live status. The three global
 * overlays (live gaze dot, attention heatmap, calibration flow) are portalled to
 * `document.body` so they cover the whole desktop rather than being clipped to
 * this window's bounds.
 *
 * This is the registry's expected default export.
 */
export default function EyeTrackingScreen() {
  const active = useEyeActive();
  const calibrated = useEyeCalibrated();
  const accuracy = useEyeAccuracy();
  const showGazeDot = useShowGazeDot();
  const showHeatmap = useShowHeatmap();
  const error = useEyeError();
  const { setActive, setGaze, setError, toggleGazeDot, toggleHeatmap, resetRuntime } =
    useEyeTrackingActions();

  const [busy, setBusy] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [mounted, setMounted] = useState(false);

  // FPS / coord sampling state (refs to avoid per-frame re-renders).
  const frameCount = useRef(0);
  const lastFpsTs = useRef(Date.now());

  // Portals require document.body, which is unavailable during SSR.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Subscribe to gaze for the live readout + FPS while active.
  useEffect(() => {
    if (!active) {
      setCoords(null);
      setFps(0);
      return;
    }
    const unsubscribe = eyeTracker.onGaze((x, y) => {
      setGaze({ x, y });
      setCoords({ x: Math.round(x), y: Math.round(y) });
      frameCount.current += 1;
      const now = Date.now();
      const dt = now - lastFpsTs.current;
      if (dt >= 1000) {
        setFps(Math.round((frameCount.current * 1000) / dt));
        frameCount.current = 0;
        lastFpsTs.current = now;
      }
    });
    return unsubscribe;
  }, [active, setGaze]);

  // Stop the tracker and release the camera when the window unmounts.
  useEffect(() => {
    return () => {
      eyeTracker.stop();
      resetRuntime();
    };
  }, [resetRuntime]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await eyeTracker.start();
      setActive(true);
    } catch (err) {
      const message =
        err instanceof EyeTrackerError ? err.message : "Échec du démarrage du suivi oculaire.";
      setError(message);
      setActive(false);
    } finally {
      setBusy(false);
    }
  }, [setActive, setError]);

  const handleStop = useCallback(() => {
    eyeTracker.stop();
    resetRuntime();
  }, [resetRuntime]);

  const handleToggle = useCallback(() => {
    if (active) handleStop();
    else void handleStart();
  }, [active, handleStart, handleStop]);

  const handleCalibrate = useCallback(async () => {
    if (!active) {
      // Calibration needs the camera + prediction loop running.
      await handleStart();
    }
    setError(null);
    setCalibrating(true);
  }, [active, handleStart, setError]);

  // Bridge the desktop menu bar ("Suivi") to the existing handlers above.
  useAppCommands("eye-tracking", {
    "toggle-tracking": () => handleToggle(),
    calibrate: () => void handleCalibrate(),
    "toggle-gaze-dot": () => toggleGazeDot(),
    "toggle-heatmap": () => toggleHeatmap(),
  });

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto bg-background p-6 text-foreground">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ScanEye className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="font-semibold text-foreground text-lg tracking-tight">Suivi oculaire</h1>
            <p className="text-muted-foreground text-sm">
              Estimation du regard par webcam, entièrement hors ligne.
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-xs ${
            active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/50"}`}
            aria-hidden
          />
          {active ? "Actif" : "Inactif"}
        </span>
      </header>

      {/* Error card */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="flex-1">
            <p className="font-medium text-foreground text-sm">Caméra indisponible</p>
            <p className="mt-0.5 text-muted-foreground text-sm">{error}</p>
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 font-medium text-foreground text-sm shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Réessayer
            </button>
          </div>
        </div>
      )}

      {/* Primary start/stop control */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy}
        className={`group flex w-full items-center justify-center gap-3 rounded-xl px-6 py-4 font-semibold text-base shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
          active
            ? "bg-card text-foreground ring-1 ring-border hover:bg-muted"
            : "bg-primary text-primary-foreground hover:opacity-95"
        }`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : active ? (
          <EyeOff className="h-5 w-5" aria-hidden />
        ) : (
          <Eye className="h-5 w-5" aria-hidden />
        )}
        {busy ? "Démarrage de la caméra…" : active ? "Arrêter le suivi" : "Démarrer le suivi"}
      </button>

      {/* Calibration */}
      <button
        type="button"
        onClick={() => void handleCalibrate()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-medium text-foreground text-sm shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
      >
        <Target className="h-4 w-4 text-primary" aria-hidden />
        {calibrated ? "Recalibrer" : "Calibrer"}
      </button>

      {/* Overlay toggles */}
      <div className="grid grid-cols-2 gap-3">
        <ToggleCard
          icon={<Eye className="h-4 w-4" aria-hidden />}
          label="Point de regard"
          enabled={showGazeDot}
          onClick={toggleGazeDot}
        />
        <ToggleCard
          icon={<Flame className="h-4 w-4" aria-hidden />}
          label="Carte de chaleur"
          enabled={showHeatmap}
          onClick={toggleHeatmap}
        />
      </div>

      {/* Live status */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Calibré" value={calibrated ? "Oui" : "Non"} />
        <StatCard label="Précision" value={accuracy != null ? `${accuracy}%` : "—"} />
        <StatCard label="Regard (x, y)" value={coords ? `${coords.x}, ${coords.y}` : "—"} />
        <StatCard label="Fréquence" value={active ? `${fps} img/s` : "—"} />
      </div>

      {/* Privacy reassurance */}
      <div className="mt-auto flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="font-medium text-foreground text-sm">Confidentialité garantie</p>
          <p className="mt-0.5 text-muted-foreground text-sm">
            La caméra est traitée localement. Aucune image ne quitte votre appareil.
          </p>
        </div>
      </div>

      {/* ── Global overlays, portalled to document.body so they cover the whole
          desktop and not just this window. ── */}
      {mounted &&
        createPortal(
          <>
            {active && showGazeDot && <GazeDot />}
            {active && showHeatmap && <AttentionHeatmap />}
            <AnimatePresence>
              {calibrating && <CalibrationOverlay onClose={() => setCalibrating(false)} />}
            </AnimatePresence>
          </>,
          document.body,
        )}
    </div>
  );
}

// ─── Small presentational helpers ────────────────────────────────────────────

function ToggleCard({
  icon,
  label,
  enabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={enabled}
      className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm shadow-sm transition-colors ${
        enabled
          ? "border-primary/40 bg-primary/5 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={enabled ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className="font-medium">{label}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          enabled ? "bg-primary" : "bg-muted-foreground/30"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-all ${
            enabled ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 font-semibold text-foreground text-lg tabular-nums">{value}</p>
    </div>
  );
}
