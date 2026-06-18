"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { createDrizzleStorage } from "@/platform/storage";

/**
 * Eye-tracking feature state.
 *
 * Split into ephemeral runtime state (live gaze, active flag, error) and durable
 * preferences. Only the lightweight prefs — overlay toggles and whether the user
 * has calibrated before — are persisted, through the same `createDrizzleStorage`
 * write-through adapter used by the shell store. Live `gaze` is deliberately
 * NOT persisted: it changes ~30×/s and is meaningless across reloads.
 */

export type Gaze = { x: number; y: number } | null;

export interface EyeTrackingState {
  /** Tracker is running (camera on, prediction loop active). */
  active: boolean;
  /** User has completed calibration at least once this session/install. */
  calibrated: boolean;
  /** Total calibration clicks recorded (rough training-confidence signal). */
  calibrationPoints: number;
  /** Estimated accuracy as a 0–100 score, or null if never measured. */
  accuracy: number | null;
  /** Show the translucent live gaze dot overlay. */
  showGazeDot: boolean;
  /** Show the accumulated attention heatmap overlay. */
  showHeatmap: boolean;
  /** Latest gaze sample in viewport pixels, or null. */
  gaze: Gaze;
  /** Last error message for the UI, or null. */
  error: string | null;

  setActive: (active: boolean) => void;
  setCalibrated: (calibrated: boolean) => void;
  setCalibrationPoints: (points: number) => void;
  setAccuracy: (accuracy: number | null) => void;
  setShowGazeDot: (show: boolean) => void;
  toggleGazeDot: () => void;
  setShowHeatmap: (show: boolean) => void;
  toggleHeatmap: () => void;
  setGaze: (gaze: Gaze) => void;
  setError: (error: string | null) => void;
  /** Reset transient runtime state (used on stop/unmount). */
  resetRuntime: () => void;
}

export const useEyeTrackingStore = create<EyeTrackingState>()(
  persist(
    (set) => ({
      active: false,
      calibrated: false,
      calibrationPoints: 0,
      accuracy: null,
      showGazeDot: true,
      showHeatmap: false,
      gaze: null,
      error: null,

      setActive: (active) => set({ active }),
      setCalibrated: (calibrated) => set({ calibrated }),
      setCalibrationPoints: (calibrationPoints) => set({ calibrationPoints }),
      setAccuracy: (accuracy) => set({ accuracy }),
      setShowGazeDot: (showGazeDot) => set({ showGazeDot }),
      toggleGazeDot: () => set((s) => ({ showGazeDot: !s.showGazeDot })),
      setShowHeatmap: (showHeatmap) => set({ showHeatmap }),
      toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),
      setGaze: (gaze) => set({ gaze }),
      setError: (error) => set({ error }),
      resetRuntime: () => set({ active: false, gaze: null, error: null }),
    }),
    {
      name: "data-navigator-eye-tracking",
      version: 1,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "eye-tracking" })),
      // Persist only lightweight prefs. Never persist live gaze or transient flags.
      partialize: (s) => ({
        showGazeDot: s.showGazeDot,
        showHeatmap: s.showHeatmap,
        calibrated: s.calibrated,
      }),
    },
  ),
);

// ─── Narrow selector hooks (avoid whole-store subscriptions) ──────────────────

export const useEyeActive = () => useEyeTrackingStore((s) => s.active);
export const useEyeCalibrated = () => useEyeTrackingStore((s) => s.calibrated);
export const useEyeAccuracy = () => useEyeTrackingStore((s) => s.accuracy);
export const useShowGazeDot = () => useEyeTrackingStore((s) => s.showGazeDot);
export const useShowHeatmap = () => useEyeTrackingStore((s) => s.showHeatmap);
export const useEyeGaze = () => useEyeTrackingStore((s) => s.gaze);
export const useEyeError = () => useEyeTrackingStore((s) => s.error);

export const useEyeTrackingActions = () =>
  useEyeTrackingStore(
    useShallow((s) => ({
      setActive: s.setActive,
      setCalibrated: s.setCalibrated,
      setCalibrationPoints: s.setCalibrationPoints,
      setAccuracy: s.setAccuracy,
      setShowGazeDot: s.setShowGazeDot,
      toggleGazeDot: s.toggleGazeDot,
      setShowHeatmap: s.setShowHeatmap,
      toggleHeatmap: s.toggleHeatmap,
      setGaze: s.setGaze,
      setError: s.setError,
      resetRuntime: s.resetRuntime,
    })),
  );
