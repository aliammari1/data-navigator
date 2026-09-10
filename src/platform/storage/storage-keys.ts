/**
 * Canonical persistence key registry.
 *
 * Scheme for NEW keys: `dn:<domain>:<name>:v<n>` (colon-separated, explicit
 * version suffix so the next rename is a migration, not a silent orphan).
 *
 * The values below are FROZEN — several predate the scheme
 * (`telecom-lan-*`, `collab:username`, `data-navigator-*`, bare `theme`).
 * Renaming a value orphans real user data (settings, datasets, folders,
 * sessions) on existing installs; a rename is a data migration and needs its
 * own versioned plan, not a drive-by edit. Related frozen contracts that must
 * also never be renamed casually: the `dn_guest_session` cookie, the
 * `dn-room-<id>` IndexedDB prefix, and the `dn-session` / `dn-invite` JWT
 * `typ` values.
 */

export const STORAGE_KEYS = {
  lanPeer: "telecom-lan-peer-v2",
  lanWsUrl: "telecom-lan-ws-url-v2",
  lanRoom: "telecom-lan-room-v2",
  lanPairingCode: "telecom-lan-pairing-code-v1",
  collabUsername: "collab:username",
  collabHubStore: "collab-hub-store",
  legacyAuditEvents: "audit:events",
  theme: "theme",
  workspaceActivity: "workspace-activity-v1",
  appContext: "app-context-v1",
  telecomSessionContext: "telecom-session-context-v1",
  dashboardHistory: "data-navigator-dashboard-history",
  datasets: "data-navigator-datasets",
  folders: "data-navigator-folders",
  settings: "data-navigator-settings",
  settingsBackup: "data-navigator-settings-backup",
  desktop: "data-navigator-desktop",
  shell: "data-navigator-shell",
  legacyDashboardAccess: "data-navigator-dashboard-access-v1",
} as const;
