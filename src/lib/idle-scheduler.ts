/**
 * F22 + F26 — Idle Scheduler
 * Uses scheduler.postTask() (Chrome/Edge/Firefox) with requestIdleCallback fallback.
 * Three priority tiers: user-blocking → user-visible → background.
 */

type Priority = "user-blocking" | "user-visible" | "background";

type SchedulerTask<T> = () => Promise<T>;

declare global {
  interface Scheduler {
    postTask<T>(
      callback: () => T | Promise<T>,
      options?: { priority?: Priority; signal?: AbortSignal; delay?: number },
    ): Promise<T>;
    yield(options?: { priority?: Priority }): Promise<void>;
  }
  interface Window {
    scheduler?: Scheduler;
  }
}

/**
 * Run task with priority. Falls back to:
 * background → requestIdleCallback → setTimeout
 */
export function scheduleTask<T>(
  task: SchedulerTask<T>,
  priority: Priority = "user-visible",
  signal?: AbortSignal,
): Promise<T> {
  if (typeof window !== "undefined" && window.scheduler?.postTask) {
    return window.scheduler.postTask(task, { priority, signal });
  }

  // requestIdleCallback fallback for "background" tasks
  if (priority === "background" && typeof requestIdleCallback !== "undefined") {
    return new Promise<T>((resolve, reject) => {
      requestIdleCallback(
        async (deadline) => {
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          if (deadline.timeRemaining() > 5 || deadline.didTimeout) {
            try {
              resolve(await task());
            } catch (e) {
              reject(e);
            }
          } else {
            // Yield to next idle window
            scheduleTask(task, priority, signal).then(resolve, reject);
          }
        },
        { timeout: 3000 },
      );
    });
  }

  // Direct execution for user-blocking / no rIC available
  return task();
}

/**
 * Yield back to browser between heavy loops.
 * Lets React paint + handle user events mid-computation.
 */
export async function yieldToBrowser(): Promise<void> {
  if (typeof window !== "undefined" && window.scheduler?.yield) {
    return window.scheduler.yield({ priority: "user-visible" });
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
