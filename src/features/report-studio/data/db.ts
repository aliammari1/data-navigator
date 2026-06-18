'use client'

/**
 * Report-studio local persistence (IndexedDB via Dexie).
 *
 * Replaces the single `localStorage` key `report-studio-branding` and its
 * synchronous-on-every-keystroke writes. Dexie stores the branding profile
 * (including the local logo bytes) and saved report definitions as many small
 * structured records — fully on-device, no network.
 *
 * Mirrors the Dexie conventions already used by
 * `@/features/help/lib/onboarding-db` and `@/platform/storage/app-db`.
 */

import Dexie, { type Table } from 'dexie'
import type { BrandingProfile } from '../lib/types'

export const ACTIVE_BRANDING_ID = 'active'

export interface SavedReport {
  id: string
  name: string
  format: 'pptx' | 'docx' | 'pdf' | 'xlsx'
  templateId?: string
  /** Opaque per-format config (sections, paper size, selected channels, etc.). */
  config: Record<string, unknown>
  updatedAt: number
}

class ReportStudioDatabase extends Dexie {
  brandingProfiles!: Table<BrandingProfile, string>
  savedReports!: Table<SavedReport, string>

  constructor() {
    super('data-navigator-report-studio-v1')

    this.version(1).stores({
      brandingProfiles: 'id',
      savedReports: 'id, updatedAt',
    })
  }
}

export const reportStudioDb = new ReportStudioDatabase()

export const DEFAULT_BRANDING: BrandingProfile = {
  id: ACTIVE_BRANDING_ID,
  companyName: 'Telecom Analytics',
  primaryColor: '#003087',
  footerText: 'Confidential — For internal use only',
  applyToAll: true,
}

/** Read the active branding profile, or the default if none persisted yet. */
export async function getActiveBranding(): Promise<BrandingProfile> {
  const stored = await reportStudioDb.brandingProfiles.get(ACTIVE_BRANDING_ID)
  return stored ?? DEFAULT_BRANDING
}

/** Upsert the active branding profile (always id `'active'`). */
export async function putActiveBranding(profile: BrandingProfile): Promise<void> {
  await reportStudioDb.brandingProfiles.put({ ...profile, id: ACTIVE_BRANDING_ID })
}
