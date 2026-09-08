/**
 * Storage / model-cache stats for the Settings → Storage panel.
 *
 * Surfaces the real on-device footprint an offline app accumulates:
 *  - overall quota via `navigator.storage.estimate()` (platform `getStorageInfo`),
 *  - per-namespace OPFS usage (cached models, Parquet, PMTiles, Pyodide) so the
 *    user can see what the offline model/tile caches actually cost and clear them.
 *
 * Everything routes through the platform `@/platform/storage` exports — no
 * direct `navigator.storage`/OPFS poking from the feature, no network.
 */

import {
  deleteDir,
  dirSize,
  getStorageInfo,
  isOpfsAvailable,
  OPFS_NS,
  type StorageInfo,
} from "@/platform/storage";

export interface CacheNamespaceStat {
  /** OPFS_NS key (parquetCache | modelWeights | pmtiles | pyodide). */
  id: keyof typeof OPFS_NS;
  /** OPFS directory name. */
  dir: string;
  label: string;
  description: string;
  bytes: number;
}

const NAMESPACES: {
  id: keyof typeof OPFS_NS;
  label: string;
  description: string;
}[] = [
  {
    id: "modelWeights",
    label: "AI models",
    description: "Local LLM / embedding model weights",
  },
  {
    id: "parquetCache",
    label: "Dataset cache",
    description: "Parquet copies of imported datasets",
  },
  {
    id: "pmtiles",
    label: "Map tiles",
    description: "Self-hosted PMTiles for offline maps",
  },
  {
    id: "pyodide",
    label: "Python runtime",
    description: "Pyodide wheels for in-browser stats/ML",
  },
];

export interface StorageStats {
  overall: StorageInfo;
  caches: CacheNamespaceStat[];
  opfsAvailable: boolean;
}

/** Read overall quota + per-namespace OPFS sizes. Safe everywhere (returns zeros offline/SSR). */
export async function readStorageStats(): Promise<StorageStats> {
  const overall = await getStorageInfo();
  const opfsAvailable = isOpfsAvailable();

  if (!opfsAvailable) {
    return {
      overall,
      opfsAvailable,
      caches: NAMESPACES.map((ns) => ({
        ...ns,
        dir: OPFS_NS[ns.id],
        bytes: 0,
      })),
    };
  }

  const caches = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const dir = OPFS_NS[ns.id];
      let bytes = 0;
      try {
        bytes = await dirSize(dir);
      } catch {
        bytes = 0;
      }
      return { ...ns, dir, bytes };
    }),
  );

  return { overall, caches, opfsAvailable };
}

/** Delete one OPFS cache namespace (e.g. clear cached models). Returns bytes-freed best-effort. */
export async function clearCacheNamespace(id: keyof typeof OPFS_NS): Promise<void> {
  if (!isOpfsAvailable()) return;
  await deleteDir(OPFS_NS[id]);
}
