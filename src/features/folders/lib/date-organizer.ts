/**
 * Intelligent date and temporal classification engine for datasets.
 *
 * Extracts dates (ISO, EU, compact, quarterly, textual French/English) and
 * temporal frequencies (daily, weekly, monthly, annual) from dataset filenames,
 * column metadata, and timestamps, then generates structured hierarchical folder
 * structures (Year > Month, Year > Quarter, Year > Month > Day, Frequency > Year).
 */

import type { Dataset } from "@/core/stores/data-store";
import type { CatalogFolder } from "@/core/stores/folders-store";

export type TemporalGranularity =
  | "year-month"
  | "year-quarter"
  | "year-month-day"
  | "frequency-year";

export type TemporalFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "hourly";

export interface TemporalExtraction {
  datasetId: string;
  datasetName: string;
  year: number | null;
  month: number | null; // 1-12
  monthName: string | null;
  day: number | null; // 1-31
  quarter: number | null; // 1-4
  frequency: TemporalFrequency | null;
  confidence: "high" | "medium" | "low" | "none";
  sourceExplanation: string;
  proposedPath: string[];
}

export const MONTH_NAMES_FR: Record<number, string> = {
  1: "01 - Janvier",
  2: "02 - Février",
  3: "03 - Mars",
  4: "04 - Avril",
  5: "05 - Mai",
  6: "06 - Juin",
  7: "07 - Juillet",
  8: "08 - Août",
  9: "09 - Septembre",
  10: "10 - Octobre",
  11: "11 - Novembre",
  12: "12 - Décembre",
};

export const QUARTER_NAMES: Record<number, string> = {
  1: "T1 (Jan - Mar)",
  2: "T2 (Avr - Jun)",
  3: "T3 (Juil - Sep)",
  4: "T4 (Oct - Déc)",
};

export const FREQUENCY_LABELS: Record<TemporalFrequency, string> = {
  daily: "Transactions quotidiennes",
  weekly: "Données hebdomadaires",
  monthly: "Rapports mensuels",
  quarterly: "Analyses trimestrielles",
  annual: "Bilans annuels",
  hourly: "Relevés horaires",
};

const FRENCH_MONTHS_MAP: Record<string, number> = {
  janvier: 1,
  janv: 1,
  jan: 1,
  fevrier: 2,
  février: 2,
  fevr: 2,
  févr: 2,
  fev: 2,
  mars: 3,
  mar: 3,
  avril: 4,
  avr: 4,
  apr: 4,
  mai: 5,
  may: 5,
  juin: 6,
  jun: 6,
  juillet: 7,
  juil: 7,
  jul: 7,
  aout: 8,
  août: 8,
  aou: 8,
  aug: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  décembre: 12,
  dec: 12,
  déc: 12,
  // English common variants
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * Parses dates, quarters, and frequency keywords from a dataset name and metadata.
 */
export function extractTemporalInfo(dataset: {
  id: string;
  name: string;
  sourcePath?: string;
  createdAt?: string;
  columns?: Array<{ name: string; type: string }>;
}): Omit<TemporalExtraction, "proposedPath"> {
  const name = dataset.name.toLowerCase();
  const rawText = `${dataset.name} ${dataset.sourcePath ?? ""}`.toLowerCase();

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let quarter: number | null = null;
  let frequency: TemporalFrequency | null = null;
  let confidence: "high" | "medium" | "low" | "none" = "none";
  let sourceExplanation = "Aucune date détectée";

  // 1. Detect Frequency keywords
  if (
    /(?:^|[^a-z0-9])(daily|quotidien|journalier|day)(?:$|[^a-z0-9])/.test(rawText) ||
    name.includes("dailytransaction")
  ) {
    frequency = "daily";
    confidence = "high";
    sourceExplanation = "Mot-clé de fréquence: Quotidien";
  } else if (
    /(?:^|[^a-z0-9])(weekly|hebdomadaire|hebdo|semaine|w[0-5][0-9])(?:$|[^a-z0-9])/.test(rawText)
  ) {
    frequency = "weekly";
    confidence = "high";
    sourceExplanation = "Mot-clé de fréquence: Hebdomadaire";
  } else if (/(?:^|[^a-z0-9])(monthly|mensuel|mois|month)(?:$|[^a-z0-9])/.test(rawText)) {
    frequency = "monthly";
    confidence = "high";
    sourceExplanation = "Mot-clé de fréquence: Mensuel";
  } else if (/(?:^|[^a-z0-9])(quarterly|trimestriel|trimestre)(?:$|[^a-z0-9])/.test(rawText)) {
    frequency = "quarterly";
    confidence = "high";
    sourceExplanation = "Mot-clé de fréquence: Trimestriel";
  } else if (/(?:^|[^a-z0-9])(annual|yearly|annuel|annee|année)(?:$|[^a-z0-9])/.test(rawText)) {
    frequency = "annual";
    confidence = "high";
    sourceExplanation = "Mot-clé de fréquence: Annuel";
  } else if (/(?:^|[^a-z0-9])(hourly|horaire)(?:$|[^a-z0-9])/.test(rawText)) {
    frequency = "hourly";
    confidence = "high";
    sourceExplanation = "Mot-clé de fréquence: Horaire";
  }

  // 2. Full ISO date in name: YYYY-MM-DD or YYYY_MM_DD or YYYY.MM.DD
  const isoFull = rawText.match(
    /(?:^|[^0-9a-z])(20[0-3][0-9]|199[0-9])[-_./](0?[1-9]|1[0-2])[-_./](0?[1-9]|[12][0-9]|3[01])(?:$|[^0-9a-z])/,
  );
  if (isoFull) {
    year = Number.parseInt(isoFull[1], 10);
    month = Number.parseInt(isoFull[2], 10);
    day = Number.parseInt(isoFull[3], 10);
    confidence = "high";
    sourceExplanation = `Date complète ISO: ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // 3. Full EU date in name: DD-MM-YYYY or DD_MM_YYYY
  if (!year) {
    const euFull = rawText.match(
      /(?:^|[^0-9a-z])(0?[1-9]|[12][0-9]|3[01])[-_./](0?[1-9]|1[0-2])[-_./](20[0-3][0-9]|199[0-9])(?:$|[^0-9a-z])/,
    );
    if (euFull) {
      day = Number.parseInt(euFull[1], 10);
      month = Number.parseInt(euFull[2], 10);
      year = Number.parseInt(euFull[3], 10);
      confidence = "high";
      sourceExplanation = `Date complète: ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
    }
  }

  // 4. Compact 8-digit date: YYYYMMDD (e.g. 20240315)
  if (!year) {
    const compactMatch = rawText.match(
      /(?<!\d)(20[0-3][0-9]|199[0-9])(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])(?!\d)/,
    );
    if (compactMatch) {
      year = Number.parseInt(compactMatch[1], 10);
      month = Number.parseInt(compactMatch[2], 10);
      day = Number.parseInt(compactMatch[3], 10);
      confidence = "high";
      sourceExplanation = `Date compacte: ${year}-${compactMatch[2]}-${compactMatch[3]}`;
    }
  }

  // 5. Quarter and Year: e.g. 2024-Q1, 2024_Q3, Q2-2023, T1_2024
  if (!year) {
    const qYear1 = rawText.match(
      /(?:^|[^0-9a-z])(20[0-3][0-9]|199[0-9])[-_.\s]?[qt]([1-4])(?:$|[^0-9a-z])/,
    );
    const qYear2 = rawText.match(
      /(?:^|[^0-9a-z])[qt]([1-4])[-_.\s]?(20[0-3][0-9]|199[0-9])(?:$|[^0-9a-z])/,
    );
    if (qYear1) {
      year = Number.parseInt(qYear1[1], 10);
      quarter = Number.parseInt(qYear1[2], 10);
      confidence = "high";
      sourceExplanation = `Trimestre T${quarter} ${year}`;
    } else if (qYear2) {
      quarter = Number.parseInt(qYear2[1], 10);
      year = Number.parseInt(qYear2[2], 10);
      confidence = "high";
      sourceExplanation = `Trimestre T${quarter} ${year}`;
    }
  }

  // 6. Year and Month: YYYY-MM or YYYY_MM
  if (!year) {
    const ymMatch = rawText.match(
      /(?:^|[^0-9a-z])(20[0-3][0-9]|199[0-9])[-_./](0?[1-9]|1[0-2])(?:$|[^0-9a-z])/,
    );
    if (ymMatch) {
      year = Number.parseInt(ymMatch[1], 10);
      month = Number.parseInt(ymMatch[2], 10);
      confidence = "high";
      sourceExplanation = `Année et mois: ${year}-${String(month).padStart(2, "0")}`;
    }
  }

  // 7. Textual month and Year: e.g. "mars_2024", "2024_septembre", "november 2023"
  if (!year || !month) {
    for (const [monthKey, monthNum] of Object.entries(FRENCH_MONTHS_MAP)) {
      const p1 = new RegExp(
        `(?:^|[^0-9a-z])${monthKey}[-_\\s]*(20[0-3][0-9]|199[0-9])(?:$|[^0-9a-z])`,
      );
      const p2 = new RegExp(
        `(?:^|[^0-9a-z])(20[0-3][0-9]|199[0-9])[-_\\s]*${monthKey}(?:$|[^0-9a-z])`,
      );
      const m1 = rawText.match(p1);
      const m2 = rawText.match(p2);
      if (m1) {
        year = Number.parseInt(m1[1], 10);
        month = monthNum;
        confidence = "high";
        sourceExplanation = `Mois textuel: ${monthKey} ${year}`;
        break;
      }
      if (m2) {
        year = Number.parseInt(m2[1], 10);
        month = monthNum;
        confidence = "high";
        sourceExplanation = `Mois textuel: ${monthKey} ${year}`;
        break;
      }
    }
  }

  // 8. Standalone Year: e.g. 2024, 2023 in filename
  if (!year) {
    const standYear = rawText.match(/(?<!\d)(20[0-3][0-9]|199[0-9])(?!\d)/);
    if (standYear) {
      year = Number.parseInt(standYear[1], 10);
      confidence = confidence === "none" ? "medium" : confidence;
      sourceExplanation =
        sourceExplanation === "Aucune date détectée"
          ? `Année détectée: ${year}`
          : `${sourceExplanation} (Année ${year})`;
    }
  }

  // 9. Derive quarter from month if month is present
  if (month && !quarter) {
    quarter = Math.ceil(month / 3);
  }

  // 10. Fallback: Column metadata
  if (!year && dataset.columns) {
    const dateCol = dataset.columns.find(
      (c) => c.type === "date" || c.name.toLowerCase().includes("date"),
    );
    if (dateCol) {
      confidence = "low";
      sourceExplanation = `Colonne temporelle trouvée: "${dateCol.name}"`;
    }
  }

  const monthName = month ? (MONTH_NAMES_FR[month] ?? null) : null;

  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    year,
    month,
    monthName,
    day,
    quarter,
    frequency,
    confidence,
    sourceExplanation,
  };
}

/**
 * Computes the hierarchical folder path based on extraction and chosen granularity.
 */
export function buildProposedPath(
  extraction: Omit<TemporalExtraction, "proposedPath">,
  granularity: TemporalGranularity,
  includeUncategorized = false,
): string[] {
  const { year, monthName, day, quarter, frequency } = extraction;

  if (granularity === "year-month") {
    if (year && monthName) return [String(year), monthName];
    if (year) return [String(year)];
    if (frequency) return [FREQUENCY_LABELS[frequency]];
  } else if (granularity === "year-quarter") {
    if (year && quarter) return [String(year), QUARTER_NAMES[quarter] ?? `T${quarter}`];
    if (year) return [String(year)];
    if (frequency) return [FREQUENCY_LABELS[frequency]];
  } else if (granularity === "year-month-day") {
    if (year && monthName && day) {
      return [String(year), monthName, `Jour ${String(day).padStart(2, "0")}`];
    }
    if (year && monthName) return [String(year), monthName];
    if (year) return [String(year)];
    if (frequency) return [FREQUENCY_LABELS[frequency]];
  } else if (granularity === "frequency-year") {
    if (frequency && year) return [FREQUENCY_LABELS[frequency], String(year)];
    if (frequency) return [FREQUENCY_LABELS[frequency]];
    if (year && monthName) return ["Périodique", String(year), monthName];
    if (year) return ["Périodique", String(year)];
  }

  return includeUncategorized ? ["Autres (Sans date)"] : [];
}

/**
 * Analyzes an array of datasets and produces full temporal plans with paths.
 */
export function analyzeTemporalDatasets(
  datasets: Dataset[],
  granularity: TemporalGranularity,
  includeUncategorized = false,
): TemporalExtraction[] {
  return datasets.map((ds) => {
    const raw = extractTemporalInfo(ds);
    const proposedPath = buildProposedPath(raw, granularity, includeUncategorized);
    return {
      ...raw,
      proposedPath,
    };
  });
}

/**
 * Executes batch creation of nested folders and dataset re-assignment.
 * Reuses existing folders at each depth to prevent duplicate trees.
 */
export function applyTemporalOrganization(params: {
  extractions: TemporalExtraction[];
  existingFolders: CatalogFolder[];
  addFolder: (folder: Omit<CatalogFolder, "createdAt">) => void;
  moveDataset: (datasetId: string, folderId: string | null) => void;
}): { foldersCreated: number; datasetsMoved: number } {
  const { extractions, existingFolders, addFolder, moveDataset } = params;

  // Clone local folder catalog to track newly created parents across the loop
  const workingFolders = [...existingFolders];
  let foldersCreated = 0;
  let datasetsMoved = 0;

  for (const item of extractions) {
    if (item.proposedPath.length === 0) continue;

    let parentId: string | null = null;

    // Traverse each segment in the path hierarchy (e.g. ["2024", "03 - Mars"])
    for (const segment of item.proposedPath) {
      let matchingFolder = workingFolders.find(
        (f) => f.name.toLowerCase() === segment.toLowerCase() && f.parentId === parentId,
      );

      if (!matchingFolder) {
        const newFolderId = `folder-temporal-${Date.now()}-${Math.round(performance.now())}-${foldersCreated}`;
        const newFolder: CatalogFolder = {
          id: newFolderId,
          name: segment,
          parentId,
          starred: false,
          color: segment.match(/^20\d\d$/) ? "#3b82f6" : "#6366f1",
          createdAt: new Date().toISOString(),
        };
        addFolder(newFolder);
        workingFolders.push(newFolder);
        matchingFolder = newFolder;
        foldersCreated++;
      }

      parentId = matchingFolder.id;
    }

    if (parentId) {
      moveDataset(item.datasetId, parentId);
      datasetsMoved++;
    }
  }

  return { foldersCreated, datasetsMoved };
}
