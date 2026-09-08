"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { publishPresence } from "@/platform/lan/lan-collab";

const PUBLISH_INTERVAL_MS = 1000;

export function useCurrentPage(tab?: string, sectionId?: string): void {
  const pathname = usePathname();
  const lastPublishedAt = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname) return;

    const elapsed = Date.now() - lastPublishedAt.current;
    const delay = Math.max(0, PUBLISH_INTERVAL_MS - elapsed);

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastPublishedAt.current = Date.now();
      timerRef.current = null;
      publishPresence({ page: pathname, tab, sectionId });
    }, delay);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pathname, tab, sectionId]);
}
