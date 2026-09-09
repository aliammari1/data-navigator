/**
 * Zustand `persist` discipline helpers (architecture §4).
 *
 * Every persisted store MUST set `version` + `migrate` + `partialize` so:
 *  - schema changes migrate cleanly across app upgrades (no leaked stale keys),
 *  - only durable state is written (never action fns / volatile/derived fields),
 *  - nested objects deep-merge onto current defaults (zustand only shallow-merges
 *    the top level — missing nested keys would otherwise stay undefined).
 *
 * These are thin, dependency-free utilities; they do not import zustand types to
 * avoid coupling, matching the `drizzle-storage.ts` convention in this dir.
 */

// ─── Deep-merge persist migrate ───────────────────────────────────────────────

type Plain = Record<string, unknown>;

function isPlainObject(v: unknown): v is Plain {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Deep-merge `persisted` over `defaults`: persisted scalars/arrays win, nested
 * objects merge recursively, and keys absent from `defaults` are dropped
 * (forward/back-compat — a renamed/removed field never lingers). Use this as the
 * body of a `persist` `migrate`.
 *
 *   migrate: makeDeepMergeMigrate(() => DEFAULT_STATE),
 */
export function deepMergeDefaults<T extends Plain>(defaults: T, persisted: unknown): T {
  if (!isPlainObject(persisted)) return { ...defaults };
  const out: Plain = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const d = (defaults as Plain)[key];
    const p = persisted[key];
    if (p === undefined) continue;
    out[key] = isPlainObject(d) ? deepMergeDefaults(d as Plain, p) : p;
  }
  return out as T;
}

/**
 * Build a `migrate` function for `persist`. `getDefaults` returns the current
 * default state; persisted state is deep-merged onto it so missing nested keys
 * backfill and unknown keys are dropped. An optional `transforms` map lets you
 * run per-version upgrade steps before the merge.
 */
export function makeDeepMergeMigrate<T extends Plain>(
  getDefaults: () => T,
  transforms?: Record<number, (state: Plain) => Plain>,
): (persisted: unknown, version: number) => T {
  return (persisted, version) => {
    let state = isPlainObject(persisted) ? { ...persisted } : {};
    if (transforms) {
      for (const v of Object.keys(transforms)
        .map(Number)
        .sort((a, b) => a - b)) {
        if (v > version) state = transforms[v](state);
      }
    }
    return deepMergeDefaults(getDefaults(), state);
  };
}

/**
 * Build a `partialize` that writes ONLY the listed keys — the safe way to keep
 * action functions and volatile/derived fields out of durable storage.
 *
 *   partialize: pickKeys(["theme", "data", "performance"]),
 */
export function pickKeys<T extends Plain, K extends keyof T>(
  keys: readonly K[],
): (state: T) => Pick<T, K> {
  return (state) => {
    const out = {} as Pick<T, K>;
    for (const key of keys) out[key] = state[key];
    return out;
  };
}

// ─── Standard persist option block ────────────────────────────────────────────

export interface DurablePersistOptions<T extends Plain> {
  /** persist `name` (also the drizzle/IndexedDB key). */
  name: string;
  /** Schema version; bump when the persisted shape changes. */
  version: number;
  /** Returns the current default state for deep-merge backfill. */
  getDefaults: () => T;
  /** Keys to persist (everything else, incl. actions, is dropped). */
  persistKeys: readonly (keyof T)[];
  /** Optional per-version upgrade transforms applied before the merge. */
  transforms?: Record<number, (state: Plain) => Plain>;
}

/**
 * Compose the `version` + `migrate` + `partialize` trio for a zustand `persist`
 * config in one call, so every durable store gets the discipline by default:
 *
 *   persist(creator, {
 *     ...durablePersist({ name, version, getDefaults, persistKeys }),
 *     storage: createJSONStorage(() => createDrizzleStorage({ namespace })),
 *   })
 */
export function durablePersist<T extends Plain>(
  opts: DurablePersistOptions<T>,
): {
  name: string;
  version: number;
  migrate: (persisted: unknown, version: number) => T;
  partialize: (state: T) => Partial<T>;
} {
  return {
    name: opts.name,
    version: opts.version,
    migrate: makeDeepMergeMigrate(opts.getDefaults, opts.transforms),
    partialize: pickKeys(opts.persistKeys),
  };
}
