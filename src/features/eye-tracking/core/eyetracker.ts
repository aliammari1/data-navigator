/**
 * Thin singleton wrapper around the `webgazer` in-browser gaze estimator.
 *
 * webgazer is a pure client-side TensorFlow.js library: it reads the webcam,
 * runs face/eye landmark detection locally, and regresses gaze coordinates from
 * user clicks. Nothing leaves the device — there is no network call at runtime,
 * which is exactly what this offline-first app requires.
 *
 * This module owns the lifecycle (start/stop/pause/resume) and a tiny gaze
 * listener fan-out so multiple UI surfaces (gaze dot, heatmap, calibration)
 * can subscribe without each touching webgazer directly. webgazer itself is a
 * process-global singleton, so we mirror that with a module-level instance.
 */

// ─── Minimal webgazer typing ─────────────────────────────────────────────────
// webgazer ships no `.d.ts`. We type only the surface we use. Methods are
// chainable in the real lib (they return the webgazer object); we model the
// few we chain and treat the rest as fire-and-forget.

export interface WebgazerPrediction {
  x: number;
  y: number;
}

type GazeCallback = (data: WebgazerPrediction | null, elapsedTime: number) => void;

interface WebgazerApi {
  begin: () => Promise<WebgazerApi> | WebgazerApi;
  end: () => WebgazerApi;
  pause: () => WebgazerApi;
  resume: () => WebgazerApi;
  isReady: () => boolean;
  setRegression: (name: "ridge" | "weightedRidge" | "threadedRidge") => WebgazerApi;
  setTracker: (name: "TFFacemesh") => WebgazerApi;
  setGazeListener: (listener: GazeCallback) => WebgazerApi;
  clearGazeListener: () => WebgazerApi;
  showVideo: (show: boolean) => WebgazerApi;
  showFaceOverlay: (show: boolean) => WebgazerApi;
  showFaceFeedbackBox: (show: boolean) => WebgazerApi;
  showPredictionPoints: (show: boolean) => WebgazerApi;
  saveDataAcrossSessions: (save: boolean) => WebgazerApi;
  recordScreenPosition: (x: number, y: number, eventType?: string) => void;
  getCurrentPrediction: () => WebgazerPrediction | null;
  stopVideo?: () => WebgazerApi;
}

// ─── Typed error the UI can branch on ────────────────────────────────────────

export type EyeTrackerErrorCode =
  | "unsupported" // no navigator.mediaDevices / not a browser
  | "permission" // user denied camera access
  | "no-camera" // no video input device found
  | "init-failed"; // webgazer failed to initialise for another reason

export class EyeTrackerError extends Error {
  readonly code: EyeTrackerErrorCode;

  constructor(code: EyeTrackerErrorCode, message: string) {
    super(message);
    this.name = "EyeTrackerError";
    this.code = code;
  }
}

/** Listener signature exposed to UI surfaces. */
export type GazeListener = (x: number, y: number, ts: number) => void;

// ─── Singleton state ─────────────────────────────────────────────────────────

let webgazer: WebgazerApi | null = null;
let running = false;
let starting: Promise<void> | null = null;
let scriptLoading: Promise<WebgazerApi> | null = null;
const listeners = new Set<GazeListener>();

/**
 * Load webgazer's prebuilt UMD bundle from /public at runtime.
 *
 * webgazer's transitive dep `@mediapipe/face_mesh` ships no ESM exports, which
 * the bundler (Turbopack) cannot compile — importing webgazer through the module
 * graph breaks the whole build. Loading the self-contained UMD bundle via a
 * <script> tag sidesteps the bundler entirely and keeps everything offline (the
 * script + facemesh assets are served locally from /vendor/webgazer/).
 */
function loadWebgazerScript(): Promise<WebgazerApi> {
  if (webgazer) return Promise.resolve(webgazer);
  const existing = (window as unknown as { webgazer?: WebgazerApi }).webgazer;
  if (existing) {
    webgazer = existing;
    return Promise.resolve(existing);
  }
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise<WebgazerApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/webgazer/webgazer.js";
    script.async = true;
    script.onload = () => {
      const wg = (window as unknown as { webgazer?: WebgazerApi }).webgazer;
      if (wg) resolve(wg);
      else reject(new EyeTrackerError("init-failed", "webgazer.js chargé mais introuvable sur window."));
    };
    script.onerror = () =>
      reject(new EyeTrackerError("init-failed", "Impossible de charger /vendor/webgazer/webgazer.js."));
    document.head.appendChild(script);
  });
  return scriptLoading;
}

function assertSupported(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new EyeTrackerError("unsupported", "Le suivi oculaire n'est disponible que dans le navigateur.");
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new EyeTrackerError(
      "unsupported",
      "Aucune API caméra détectée sur cet appareil (navigator.mediaDevices indisponible).",
    );
  }
}

function classifyStartError(err: unknown): EyeTrackerError {
  if (err instanceof EyeTrackerError) return err;
  const name = (err as { name?: string } | null)?.name ?? "";
  const message = (err as { message?: string } | null)?.message ?? String(err);
  if (name === "NotAllowedError" || name === "SecurityError" || /permission|denied/i.test(message)) {
    return new EyeTrackerError("permission", "Accès à la caméra refusé. Autorisez la caméra puis réessayez.");
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || /no camera|notfound/i.test(message)) {
    return new EyeTrackerError("no-camera", "Aucune caméra disponible n'a été trouvée sur cet appareil.");
  }
  return new EyeTrackerError("init-failed", `Échec de l'initialisation du suivi oculaire : ${message}`);
}

/** Internal fan-out registered once with webgazer. */
function dispatch(data: WebgazerPrediction | null, elapsedTime: number): void {
  if (!data) return;
  const ts = Date.now();
  for (const fn of listeners) {
    try {
      fn(data.x, data.y, ts);
    } catch {
      // A faulty UI listener must never break the prediction loop.
    }
  }
  void elapsedTime;
}

export const eyeTracker = {
  /** True while the prediction loop is active (not paused, not stopped). */
  isRunning(): boolean {
    return running;
  },

  /**
   * Request the camera and begin the prediction loop.
   *
   * Idempotent: if already running (webgazer is a process singleton) this
   * resolves immediately. Hides webgazer's default video/overlay chrome — we
   * render our own minimal warm UI instead.
   */
  async start(): Promise<void> {
    assertSupported();
    if (running) return;
    if (starting) return starting;

    starting = (async () => {
      try {
        if (!webgazer) {
          // Load the self-contained UMD bundle from /public on demand (not via
          // the module bundler — see loadWebgazerScript for why).
          webgazer = await loadWebgazerScript();
        }

        // Pin webgazer's bundled TensorFlow.js to the CPU/WASM backend so the
        // gaze model NEVER touches the GPU. node-llama-cpp already owns the GPU
        // (Vulkan) for inference; running webgazer's WebGL/MediaPipe path at the
        // same time caused a native GPU-contention crash (STATUS_STACK_BUFFER_
        // OVERRUN / 0xC0000409). Gaze is a touch choppier on CPU but stable, and
        // the LLM stays fast on the GPU. Best-effort: skips quietly if the
        // bundled tf isn't exposed.
        try {
          const tf = (webgazer as unknown as { tf?: { setBackend?: (b: string) => Promise<boolean>; ready?: () => Promise<void> } }).tf;
          if (tf?.setBackend) {
            const ok = await tf.setBackend("wasm").catch(() => false);
            if (!ok) await tf.setBackend("cpu").catch(() => {});
            await tf.ready?.().catch(() => {});
          }
        } catch {
          /* tf not exposed on this build — continue (still works, may use GPU) */
        }

        // Never persist gaze training data to disk — keep it ephemeral/offline.
        webgazer.saveDataAcrossSessions(false);
        webgazer.setRegression("ridge");
        webgazer.setTracker("TFFacemesh");
        webgazer.setGazeListener(dispatch);

        await webgazer.begin();

        // Suppress webgazer's built-in video preview and debug overlays; our UI
        // owns all on-screen feedback.
        webgazer.showVideo(false);
        webgazer.showFaceOverlay(false);
        webgazer.showFaceFeedbackBox(false);
        webgazer.showPredictionPoints(false);

        running = true;
      } catch (err) {
        // Best-effort teardown so a failed start leaves no half-open camera.
        try {
          webgazer?.end();
        } catch {
          /* ignore */
        }
        throw classifyStartError(err);
      } finally {
        starting = null;
      }
    })();

    return starting;
  },

  /** Pause the prediction loop while keeping the camera/model warm. */
  pause(): void {
    if (webgazer && running) {
      try {
        webgazer.pause();
      } catch {
        /* ignore */
      }
    }
  },

  /** Resume a paused prediction loop. */
  resume(): void {
    if (webgazer && running) {
      try {
        webgazer.resume();
      } catch {
        /* ignore */
      }
    }
  },

  /**
   * Stop tracking, release the camera, and clear listeners. Safe to call when
   * already stopped.
   */
  stop(): void {
    if (webgazer) {
      try {
        webgazer.clearGazeListener();
      } catch {
        /* ignore */
      }
      try {
        webgazer.stopVideo?.();
      } catch {
        /* ignore */
      }
      try {
        webgazer.end();
      } catch {
        /* ignore */
      }
    }
    running = false;
    starting = null;
    listeners.clear();
  },

  /**
   * Subscribe to gaze samples. Returns an unsubscribe function. Coordinates are
   * viewport pixels (top-left origin), matching `position: fixed` overlays.
   */
  onGaze(listener: GazeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Feed webgazer a known screen point to train the regression model. Called by
   * the calibration overlay on every click.
   */
  recordCalibrationPoint(x: number, y: number): void {
    try {
      webgazer?.recordScreenPosition(x, y, "click");
    } catch {
      /* ignore — calibration is best-effort */
    }
  },

  /** Synchronously read the latest prediction (used for accuracy sampling). */
  getCurrentPrediction(): WebgazerPrediction | null {
    try {
      return webgazer?.getCurrentPrediction() ?? null;
    } catch {
      return null;
    }
  },
};

export type EyeTracker = typeof eyeTracker;
