"use client";

/**
 * Back-compat barrel.
 *
 * The 1566-line monolith that used to live here has been decomposed by
 * responsibility into `nav/`, `topbar/`, `command/`, and `shell/` (see the
 * dashboard-shell feature plan §2.1 / §4.1). This module now only re-exports the
 * stable public surface so existing importers (and the Storybook story) keep
 * working unchanged.
 */

export { DashboardLayout } from "@/features/dashboard-shell/shell/dashboard-layout";
export {
  type DashboardUser,
  type NavItem,
  NAV_SECTIONS,
  FOOTER_ITEMS,
  ALL_ITEMS,
  type TelecomDashboardTab,
  TELECOM_NAV_ITEMS,
} from "@/features/dashboard-shell/nav/nav-config";
