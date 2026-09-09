/**
 * Zustand selector discipline helpers (architecture §4 / §0 invariant 6).
 *
 * The systemic perf defect across dashboard-shell, collab-hub,
 * and achievements is bare `useStore()` subscriptions that
 * re-render the whole tree on every state change. The remedy is *narrow
 * selectors + `useShallow`* everywhere. These helpers make the correct path the
 * easy path:
 *
 *   const useStore = createSelectors(create<Bear>()(...))
 *   const bears = useStore.use.bears()           // auto-generated single-field selector
 *
 *   const { a, b } = useStore(useShallowSelector(s => ({ a: s.a, b: s.b })))
 *
 * No new dependency: `useShallow` ships with zustand (`zustand/react/shallow`).
 */

import type { StoreApi, UseBoundStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

type WithSelectors<S> = S extends { getState: () => infer T }
  ? S & { use: { [K in keyof T]: () => T[K] } }
  : never;

/**
 * Attach a `.use.<field>()` auto-selector for every top-level store field, so
 * consumers subscribe to exactly one field and re-render only when it changes.
 * Wrap a `create(...)` result once and export the wrapped hook.
 *
 * For derived/object slices, keep using the raw hook with `useShallowSelector`
 * (below) instead of a `.use.*` field selector.
 */
export function createSelectors<S extends UseBoundStore<StoreApi<object>>>(
  store: S,
): WithSelectors<S> {
  const withSelectors = store as WithSelectors<S>;
  withSelectors.use = {} as WithSelectors<S>["use"];
  const state = store.getState();
  for (const key of Object.keys(state) as Array<keyof typeof state>) {
    // Stable per-field selector — referential identity preserved across renders.
    (withSelectors.use as Record<string, () => unknown>)[key as string] = () =>
      store((s) => (s as Record<string, unknown>)[key as string]);
  }
  return withSelectors;
}

/**
 * Thin re-export of zustand's `useShallow` for object/array slice selectors, so
 * features import selector tooling from ONE platform module:
 *
 *   const slice = useStore(useShallowSelector(s => ({ x: s.x, y: s.y })))
 *
 * Without `useShallow`, returning a fresh object from a selector re-renders on
 * every store change (new reference each call) — the exact storm we are killing.
 */
export const useShallowSelector = useShallow;

/**
 * Guidance (documented, not enforced) for feature stores adopting selector
 * slices — kept next to the helper so the rule travels with the tool:
 *
 *  1. NEVER call the bare `useStore()` in a component (subscribes to everything).
 *  2. Single field            → `useStore.use.field()`.
 *  3. Object/array slice      → `useStore(useShallowSelector(s => ({...})))`.
 *  4. Actions are stable       → group them in one `useStore(useShallow(s => ({
 *     a: s.a, b: s.b })))` actions selector; actions never change identity, so
 *     this never re-renders.
 *  5. Co-locate selector hooks next to the store (see settings-store.ts) so the
 *     component layer imports `useXSettings()`, not the store object.
 */
export const SELECTOR_GUIDANCE =
  "Use useStore.use.field() for single fields and useStore(useShallowSelector(...)) for slices; never bare useStore().";
