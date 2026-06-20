"use client";

/**
 * Branding profile state — durable in IndexedDB (Dexie), NOT localStorage.
 *
 * React state is immediate (no typing lag); persistence is debounced (300ms) so
 * keystrokes never trigger a synchronous storage write on the hot path. The
 * company logo is picked from a LOCAL FILE and stored as raw bytes in Dexie —
 * no remote URL, so exports embed it fully offline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BRANDING, getActiveBranding, putActiveBranding } from "../data/db";
import type { BrandingProfile } from "../lib/types";

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args: A) => {
    if (timer) clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

export interface UseBrandingResult {
  branding: BrandingProfile;
  loaded: boolean;
  update: (patch: Partial<BrandingProfile>) => void;
  setLogoFromFile: (file: File) => Promise<void>;
  clearLogo: () => void;
}

export function useBranding(): UseBrandingResult {
  const [branding, setBranding] = useState<BrandingProfile>(DEFAULT_BRANDING);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from Dexie once.
  useEffect(() => {
    let cancelled = false;
    void getActiveBranding().then((profile) => {
      if (!cancelled) {
        setBranding(profile);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced async persist (IndexedDB). Stable across renders.
  const persist = useMemo(
    () => debounce((b: BrandingProfile) => void putActiveBranding(b), 300),
    [],
  );

  // Flush any pending write on unmount so nothing is lost.
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => () => persistRef.current.flush(branding), [branding]);

  const update = useCallback(
    (patch: Partial<BrandingProfile>) => {
      setBranding((prev) => {
        const next = { ...prev, ...patch, id: DEFAULT_BRANDING.id };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setLogoFromFile = useCallback(
    async (file: File) => {
      const buf = await file.arrayBuffer();
      update({ logoBytes: buf, logoMime: file.type || "image/png", logoName: file.name });
    },
    [update],
  );

  const clearLogo = useCallback(() => {
    update({ logoBytes: undefined, logoMime: undefined, logoName: undefined });
  }, [update]);

  return { branding, loaded, update, setLogoFromFile, clearLogo };
}
