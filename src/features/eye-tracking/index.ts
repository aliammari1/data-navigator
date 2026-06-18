/**
 * Eye-tracking feature — public surface.
 *
 * Offline webcam gaze estimation (webgazer / TensorFlow.js) packaged as a
 * desktop app. The webcam feed is processed entirely on-device.
 */

export { default as EyeTrackingScreen } from "./screens/EyeTrackingScreen";

export {
  type EyeTrackingState,
  type Gaze,
  useEyeAccuracy,
  useEyeActive,
  useEyeCalibrated,
  useEyeError,
  useEyeGaze,
  useEyeTrackingActions,
  useEyeTrackingStore,
  useShowGazeDot,
  useShowHeatmap,
} from "./store/eye-tracking-store";

export {
  type EyeTracker,
  type EyeTrackerErrorCode,
  EyeTrackerError,
  eyeTracker,
  type GazeListener,
  type WebgazerPrediction,
} from "./core/eyetracker";
