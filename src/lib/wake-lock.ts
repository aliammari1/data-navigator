/**
 * F17 — Screen Wake Lock API
 *
 * Prevents screen sleep during long DuckDB analysis runs.
 * Releases automatically when analysis finishes.
 * Re-acquires only while wake lock is still explicitly requested.
 */

type WakeLockType = "screen";

type WakeLockSentinelLike = EventTarget & {
  released: boolean;
  type: WakeLockType;
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: WakeLockType) => Promise<WakeLockSentinelLike>;
  };
};

let lock: WakeLockSentinelLike | null = null;
let requested = false;
let acquiring: Promise<void> | null = null;
let visibilityAbortController: AbortController | null = null;

function getWakeLockNavigator(): NavigatorWithWakeLock | null {
  if (typeof navigator === "undefined") return null;

  const nav = navigator as NavigatorWithWakeLock;

  if (!nav.wakeLock?.request) return null;

  return nav;
}

function canUseDocument(): boolean {
  return typeof document !== "undefined";
}

async function requestWakeLock(): Promise<void> {
  const nav = getWakeLockNavigator();

  if (!nav || !canUseDocument()) return;
  if (!requested) return;
  if (lock && !lock.released) return;

  lock = await nav.wakeLock.request("screen");

  lock.addEventListener(
    "release",
    () => {
      lock = null;
    },
    { once: true },
  );
}

function ensureVisibilityListener(): void {
  if (!canUseDocument()) return;
  if (visibilityAbortController) return;

  visibilityAbortController = new AbortController();

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!requested) return;
      if (document.visibilityState !== "visible") return;
      if (lock && !lock.released) return;

      acquiring ??= requestWakeLock()
        .catch(() => {
          // Wake lock can be denied by browser/device policy, low battery, etc.
        })
        .finally(() => {
          acquiring = null;
        });
    },
    { signal: visibilityAbortController.signal },
  );
}

export async function acquireWakeLock(): Promise<void> {
  requested = true;
  ensureVisibilityListener();

  if (acquiring) return acquiring;

  acquiring = requestWakeLock()
    .catch(() => {
      // Wake lock is best-effort. Failure should not break analysis.
    })
    .finally(() => {
      acquiring = null;
    });

  return acquiring;
}

export async function releaseWakeLock(): Promise<void> {
  requested = false;

  visibilityAbortController?.abort();
  visibilityAbortController = null;

  const currentLock = lock;
  lock = null;

  if (!currentLock || currentLock.released) return;

  try {
    await currentLock.release();
  } catch {
    // Already released by browser.
  }
}

export function isWakeLockActive(): boolean {
  return Boolean(lock && !lock.released);
}

export function isWakeLockRequested(): boolean {
  return requested;
}