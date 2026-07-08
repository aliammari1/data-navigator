"use client";

/**
 * Global branding profile persistence (IndexedDB via Dexie).
 *
 * Centralized here (not in a feature) because it's an app-wide default applied
 * to every generated export, edited from Settings > Branding and read by
 * Report Studio. Stores the profile as one small structured record — fully
 * on-device, no network. The company logo is local bytes, not a remote URL, so
 * exports embed it fully offline.
 *
 * Mirrors the Dexie conventions already used by
 * `@/features/help/lib/onboarding-db` and `@/platform/storage/app-db`.
 */

import Dexie, { type Table } from "dexie";
import type { BrandingProfile } from "./types";

export const ACTIVE_BRANDING_ID = "active";

class BrandingDatabase extends Dexie {
  profiles!: Table<BrandingProfile, string>;

  constructor() {
    super("data-navigator-branding-v1");

    this.version(1).stores({
      profiles: "id",
    });
  }
}

const brandingDb = new BrandingDatabase();

export const DEFAULT_BRANDING: BrandingProfile = {
  id: ACTIVE_BRANDING_ID,
  companyName: "Telecom Analytics",
  primaryColor: "#003087",
  footerText: "Confidential — For internal use only",
  applyToAll: true,
};

/** Read the active branding profile, or the default if none persisted yet. */
export async function getActiveBranding(): Promise<BrandingProfile> {
  const stored = await brandingDb.profiles.get(ACTIVE_BRANDING_ID);
  return stored ?? DEFAULT_BRANDING;
}

/** Upsert the active branding profile (always id `'active'`). */
export async function putActiveBranding(profile: BrandingProfile): Promise<void> {
  await brandingDb.profiles.put({ ...profile, id: ACTIVE_BRANDING_ID });
}
