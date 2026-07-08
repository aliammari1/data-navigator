export interface BrandingProfile {
  /** Fixed singleton id, currently always `'active'`. */
  id: string;
  companyName: string;
  primaryColor: string;
  footerText: string;
  applyToAll: boolean;
  /** Local logo bytes (offline). Replaces the old remote `logoUrl`. */
  logoBytes?: ArrayBuffer;
  logoMime?: string;
  logoName?: string;
}
