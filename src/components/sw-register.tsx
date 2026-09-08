"use client";

import { useEffect } from "react";

/**
 * Registers the PWA Service Worker after hydration.
 *
 * Next.js 16 note:
 * - This must be a Client Component because it uses navigator.serviceWorker.
 * - `/sw.js` must live in `/public/sw.js`.
 * - Registration should normally be disabled in dev to avoid stale caches.
 */
export function SWRegister() {
  useEffect(() => {
    const isElectron =
      typeof navigator !== "undefined" &&
      (/electron/i.test(navigator.userAgent) || Boolean((window as any).electronAPI || (window as any).electronSettings));

    if (isElectron) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
      }
      return;
    }

    const shouldRegister =
      "serviceWorker" in navigator &&
      (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "true");

    if (!shouldRegister) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("[PWA] Service Worker registration failed:", error);
    });
  }, []);

  return null;
}
