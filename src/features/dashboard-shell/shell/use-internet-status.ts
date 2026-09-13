"use client";

import { useEffect, useState } from "react";

/**
 * Hook to detect whether the machine has active internet access (not just LAN / loopback).
 * Uses the `is-online` package to run real probe checks with an AbortController timeout.
 */
export function useInternetStatus(checkIntervalMs = 30000): boolean | null {
  const [isOnlineState, setIsOnlineState] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const runCheck = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!cancelled) setIsOnlineState(false);
        return;
      }

      try {
        const isOnlineModule = await import("is-online");
        const check = isOnlineModule.default;
        const result = await check({ timeout: 3000 });
        if (!cancelled) setIsOnlineState(result);
      } catch {
        if (!cancelled) {
          setIsOnlineState(typeof navigator !== "undefined" ? navigator.onLine : true);
        }
      }
    };

    runCheck();

    const handleOnline = () => {
      runCheck();
    };
    const handleOffline = () => {
      if (!cancelled) setIsOnlineState(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const timer = setInterval(runCheck, checkIntervalMs);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(timer);
    };
  }, [checkIntervalMs]);

  return isOnlineState;
}
