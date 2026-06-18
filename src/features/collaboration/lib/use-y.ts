/**
 * Selector-based external-store hooks for Yjs shared types.
 *
 * These replace the coarse `useYMap` snapshot+forceUpdate pattern: a component
 * subscribes to exactly one Y.Array projection and re-renders only when the
 * cached projection identity actually changes, via useSyncExternalStore.
 */

"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type * as Y from "yjs";

/**
 * Subscribe to a Y.Array and project it into a derived value.
 * The projection is recomputed on each Yjs `observe`/`observeDeep` event and
 * cached; React only re-renders when `isEqual(prev, next)` is false.
 */
export function useYArray<T, S>(
  yarr: Y.Array<T>,
  select: (items: T[]) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
  deep = false,
): S {
  // Stable refs so subscribe/getSnapshot identities don't churn between renders.
  const selectRef = useRef(select);
  selectRef.current = select;
  const equalRef = useRef(isEqual);
  equalRef.current = isEqual;
  const cacheRef = useRef<{ value: S } | null>(null);

  if (cacheRef.current === null) {
    cacheRef.current = { value: selectRef.current(yarr.toArray()) };
  }

  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = () => {
        const next = selectRef.current(yarr.toArray());
        const cache = cacheRef.current;
        if (!cache || !equalRef.current(cache.value, next)) {
          cacheRef.current = { value: next };
          onChange();
        }
      };
      if (deep) {
        yarr.observeDeep(handler);
        return () => yarr.unobserveDeep(handler);
      }
      yarr.observe(handler);
      return () => yarr.unobserve(handler);
    },
    [yarr, deep],
  );

  const getSnapshot = useCallback(() => {
    // cacheRef is always populated above.
    return (cacheRef.current as { value: S }).value;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Shallow array equality by reference of each element. */
export function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
