"use client";

import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { persistQueryClient, restoreQueryClient } from "@/platform/storage";

/**
 * Create a QueryClient with performance-optimized defaults.
 *
 * Best practices applied:
 * - staleTime: 5 minutes (avoid redundant refetches for stable data)
 * - gcTime: 30 minutes (keep inactive data in cache)
 * - refetchOnWindowFocus: false (disable automatic refetch on focus for offline-first app)
 * - retry: 1 (minimal retry for local DuckDB operations)
 * - refetchOnReconnect: true (refetch when coming back online)
 * - structuralSharing: true (default, prevents unnecessary re-renders)
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // For offline-first: don't throw errors to error boundaries for queries
        throwOnError: false,
      },
      mutations: {
        retry: 1,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: make a new query client if we don't already have one
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

/**
 * Override focus manager so React Query doesn't refetch when the window
 * regains focus in Electron or when the tab is backgrounded.
 * This is important for an offline-first desktop app.
 */
focusManager.setEventListener((handleFocus) => {
  if (typeof window !== "undefined" && "addEventListener" in window) {
    const handler = () => handleFocus();
    globalThis.window.addEventListener("visibilitychange", handler, false);
    return () => {
      globalThis.window.removeEventListener("visibilitychange", handler);
    };
  }
  return undefined;
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient);
  const persistedRef = useRef(false);

  // Disable refetch on window focus for Electron environments
  useEffect(() => {
    const isElectron =
      typeof window !== "undefined" &&
      // @ts-expect-error electron exposes this on window
      (window.electron !== undefined || window.process?.type === "renderer");

    if (isElectron) {
      focusManager.setFocused(false);
    }
  }, []);

  // Offline-first cold-load: hydrate the last cache snapshot from IndexedDB so
  // the last KPI/analytics paint appears instantly, then start the debounced
  // write subscription so subsequent results survive reloads. Guarded so the
  // persist subscription is only ever started once.
  useEffect(() => {
    if (persistedRef.current) return;
    persistedRef.current = true;

    let stop: (() => void) | undefined;
    let cancelled = false;

    void restoreQueryClient(queryClient).finally(() => {
      if (!cancelled) stop = persistQueryClient(queryClient);
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
