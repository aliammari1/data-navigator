import type { ColMeta, Dataset } from "@/core/stores/data-store";

export const TELECOM_REQUIRED_COLUMNS = [
  "ACCOUNT_ID",
  "BRAND_D",
  "TRANSACTION_ID",
  "TRANSACTION_DATE",
  "ORIGINAL_AMOUNT",
  "TRANSACTION_STATUS",
  "CHANNEL",
  "ACCOUNT_MSISDN",
];

export function normalizeColumnName(value: string) {
  return value.trim().toUpperCase();
}

export function hasTelecomRequiredColumns(columns: Array<{ name: string }>) {
  const available = new Set(columns.map((column) => normalizeColumnName(column.name)));

  return TELECOM_REQUIRED_COLUMNS.every((column) => available.has(normalizeColumnName(column)));
}

export function getMissingTelecomColumns(columns: Array<{ name: string }>) {
  const available = new Set(columns.map((column) => normalizeColumnName(column.name)));

  return TELECOM_REQUIRED_COLUMNS.filter((column) => !available.has(normalizeColumnName(column)));
}

export function extractReportDateFromName(fileName: string) {
  const match = fileName.match(/(\d{8})/);
  const value = match?.[1];

  if (!value) return "";

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function buildDatasetTags({
  columns,
  fileName,
  telecomMode,
}: {
  columns: Array<{ name: string }>;
  fileName: string;
  telecomMode: boolean;
}) {
  const telecomCompatible = hasTelecomRequiredColumns(columns);
  const reportDate = extractReportDateFromName(fileName);

  if (!telecomMode && !telecomCompatible) return [];

  return [
    ...(telecomCompatible ? ["telecom", "daily-transactions"] : []),
    ...(reportDate ? [`report-date:${reportDate}`] : []),
  ];
}

export function getTelecomDatasetProfile({
  columns,
  fileName,
  telecomMode,
}: {
  columns: ColMeta[];
  fileName: string;
  telecomMode: boolean;
}) {
  const compatible = hasTelecomRequiredColumns(columns);
  const reportDate = extractReportDateFromName(fileName);

  return {
    compatible,
    reportDate,
    missingColumns: getMissingTelecomColumns(columns),
    tags: buildDatasetTags({ columns, fileName, telecomMode }),
    description: compatible ? "Telecom daily transactions report" : "",
  };
}

export function isTelecomDataset(dataset: Dataset) {
  return dataset.tags.includes("telecom") || hasTelecomRequiredColumns(dataset.columns);
}

export function getDatasetReportDate(dataset: Dataset | null | undefined) {
  if (!dataset) return "";

  const tagDate = dataset.tags
    .find((tag) => tag.startsWith("report-date:"))
    ?.replace("report-date:", "");

  return tagDate || extractReportDateFromName(dataset.name);
}
