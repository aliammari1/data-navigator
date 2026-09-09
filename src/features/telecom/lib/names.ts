export const TELECOM_TABLE_BASE = "telecom_transactions";

export const TELECOM_ANALYTICS_DB = "data-navigator-telecom-cache";
export const TELECOM_ANALYTICS_STORE = "telecom_analytics";
export const TELECOM_SOURCE_STORE = "telecom_source_files";
export const TELECOM_SOURCE_META_STORE = "telecom_source_file_meta";
export const TELECOM_ANALYTICS_DB_VERSION = 4;

export const TELECOM_META_VFS = "data-navigator-telecom-meta-idb";

export function telecomTableName(index = 0): string {
  return index === 0 ? TELECOM_TABLE_BASE : `${TELECOM_TABLE_BASE}_${index}`;
}
