/**
 * Offline-durable profile cache (Dexie / IndexedDB).
 *
 * The Data Profile screen previously held computed `ColProfile[]` only in
 * component state, so every mount and every Refresh re-ran the whole-dataset
 * scan from scratch — wasting the local CPU budget that an offline desktop app
 * should never spend twice.
 *
 * Profiles are cached keyed by `datasetId + dataset.updatedAt`, so:
 * - revisiting the route is instant and zero-scan while the dataset is unchanged,
 * - a dataset edit (new `updatedAt`) misses the cache and recomputes once,
 * - Refresh explicitly busts the key and recomputes.
 *
 * Mirrors the Dexie conventions in `@/platform/storage/app-db` and
 * `@/features/help/lib/onboarding-db` (local-first, no network).
 */

import Dexie, { type Table } from "dexie";
import type { ColProfile, QualityDimension } from "../model/types";

export interface ProfileRecord {
  /** `${datasetId}:${updatedAt}` */
  key: string;
  datasetId: string;
  updatedAt: string;
  profiles: ColProfile[];
  dimensions: QualityDimension[];
  computedAt: number;
}

class ProfileDatabase extends Dexie {
  records!: Table<ProfileRecord, string>;

  constructor() {
    super("data-navigator-parsed-profiles-v1");

    this.version(1).stores({
      // `key` primary key, `datasetId` secondary index for pruning stale versions.
      records: "key, datasetId",
    });
  }
}

export const profileDb = new ProfileDatabase();

export function profileCacheKey(datasetId: string, updatedAt: string): string {
  return `${datasetId}:${updatedAt}`;
}

/** Returns the cached record for this dataset version, or `undefined` on a miss. */
export async function loadCachedProfile(
  datasetId: string,
  updatedAt: string,
): Promise<ProfileRecord | undefined> {
  try {
    return await profileDb.records.get(profileCacheKey(datasetId, updatedAt));
  } catch {
    // IndexedDB unavailable (private mode / quota) — treat as a cache miss.
    return undefined;
  }
}

/**
 * Persist a freshly computed profile and prune stale versions of the same
 * dataset so the store keeps only the latest snapshot per dataset.
 */
export async function saveProfile(record: ProfileRecord): Promise<void> {
  try {
    await profileDb.records.put(record);
    await profileDb.records
      .where("datasetId")
      .equals(record.datasetId)
      .and((existing) => existing.key !== record.key)
      .delete();
  } catch {
    // Persistence is best-effort; a failure here must not break profiling.
  }
}

/** Drop every cached version of a dataset (used by an explicit Refresh). */
export async function invalidateProfile(datasetId: string): Promise<void> {
  try {
    await profileDb.records.where("datasetId").equals(datasetId).delete();
  } catch {
    // Best-effort.
  }
}
