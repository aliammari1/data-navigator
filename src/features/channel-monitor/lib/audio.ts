/**
 * Singleton, gesture-unlocked Web Audio alert tones.
 *
 * The previous implementation constructed a brand-new `AudioContext` for every
 * beep. Browsers throttle/deny `AudioContext` creation without a user gesture,
 * so alarms could silently fail, and the contexts leaked. Here we keep ONE
 * module-level context, unlock it on the first user gesture, and reuse it.
 */

import type { AlertSeverity } from "../store/monitor-store";

let ctx: AudioContext | null = null;

type WindowWithWebkitAudio = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithWebkitAudio;
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Create (lazily) and resume the shared AudioContext. Must be called from a
 * user gesture handler at least once so the browser permits playback.
 */
export function unlockAudio(): void {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return;
  try {
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // Web Audio not available — alarms degrade silently.
  }
}

/** True once the shared context exists and is running. */
export function isAudioUnlocked(): boolean {
  return ctx !== null && ctx.state === "running";
}

function beep(frequency: number, duration: number, volume: number): void {
  if (ctx?.state !== "running") return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // Ignore transient Web Audio failures.
  }
}

/**
 * Play the severity-appropriate alert pattern using the shared context.
 * No-ops cleanly if audio has not been unlocked yet.
 */
export function playSoundAlert(severity: AlertSeverity, volume: number): void {
  if (ctx?.state !== "running") {
    // Attempt a late unlock in case a gesture already happened elsewhere.
    unlockAudio();
    // `unlockAudio()` may have (re)created/resumed the module-level `ctx`; cast to
    // re-widen the state union that the outer guard narrowed away.
    if ((ctx as AudioContext | null)?.state !== "running") return;
  }

  if (severity === "info") {
    beep(880, 0.15, volume * 0.5);
  } else if (severity === "warning") {
    beep(660, 0.18, volume * 0.7);
    window.setTimeout(() => beep(660, 0.18, volume * 0.7), 250);
  } else {
    // Critical — repeating alarm.
    for (let i = 0; i < 4; i++) {
      window.setTimeout(() => beep(440, 0.22, volume), i * 300);
    }
  }
}
