import { describe, expect, it, vi } from "vitest";
import type { Dataset } from "@/core/stores/data-store";
import type { CatalogFolder } from "@/core/stores/folders-store";
import {
  analyzeTemporalDatasets,
  applyTemporalOrganization,
  buildProposedPath,
  extractTemporalInfo,
} from "@/features/folders/lib/date-organizer";

describe("date-organizer", () => {
  describe("extractTemporalInfo", () => {
    it("extracts ISO dates from filename", () => {
      const info = extractTemporalInfo({
        id: "ds-1",
        name: "telecom_churn_2024-03-15.csv",
      });
      expect(info.year).toBe(2024);
      expect(info.month).toBe(3);
      expect(info.monthName).toBe("03 - Mars");
      expect(info.day).toBe(15);
      expect(info.confidence).toBe("high");
    });

    it("extracts European dates from filename", () => {
      const info = extractTemporalInfo({
        id: "ds-2",
        name: "relevé_15_11_2023.parquet",
      });
      expect(info.year).toBe(2023);
      expect(info.month).toBe(11);
      expect(info.monthName).toBe("11 - Novembre");
      expect(info.day).toBe(15);
    });

    it("extracts compact dates YYYYMMDD", () => {
      const info = extractTemporalInfo({
        id: "ds-3",
        name: "snapshot_20240820_final.csv",
      });
      expect(info.year).toBe(2024);
      expect(info.month).toBe(8);
      expect(info.day).toBe(20);
    });

    it("extracts French textual months", () => {
      const info = extractTemporalInfo({
        id: "ds-4",
        name: "facturation_mars_2024.xlsx",
      });
      expect(info.year).toBe(2024);
      expect(info.month).toBe(3);
      expect(info.monthName).toBe("03 - Mars");
    });

    it("extracts quarters (e.g. Q3 or T1)", () => {
      const info1 = extractTemporalInfo({
        id: "ds-5",
        name: "resultats_2024-Q2.csv",
      });
      expect(info1.year).toBe(2024);
      expect(info1.quarter).toBe(2);

      const info2 = extractTemporalInfo({
        id: "ds-6",
        name: "bilan_T4_2023.parquet",
      });
      expect(info2.year).toBe(2023);
      expect(info2.quarter).toBe(4);
    });

    it("detects frequency keywords like daily transactions", () => {
      const info = extractTemporalInfo({
        id: "ds-7",
        name: "dailytransactions_synthetic_1m.csv",
      });
      expect(info.frequency).toBe("daily");
      expect(info.confidence).toBe("high");
    });

    it("detects standalone year", () => {
      const info = extractTemporalInfo({
        id: "ds-8",
        name: "clients_actifs_2022.csv",
      });
      expect(info.year).toBe(2022);
      expect(info.month).toBeNull();
    });
  });

  describe("buildProposedPath", () => {
    const sampleExtraction = {
      datasetId: "1",
      datasetName: "test.csv",
      year: 2024,
      month: 5,
      monthName: "05 - Mai",
      day: 12,
      quarter: 2,
      frequency: "daily" as const,
      confidence: "high" as const,
      sourceExplanation: "test",
    };

    it("builds year-month path", () => {
      const path = buildProposedPath(sampleExtraction, "year-month");
      expect(path).toEqual(["2024", "05 - Mai"]);
    });

    it("builds year-quarter path", () => {
      const path = buildProposedPath(sampleExtraction, "year-quarter");
      expect(path).toEqual(["2024", "T2 (Avr - Jun)"]);
    });

    it("builds year-month-day path", () => {
      const path = buildProposedPath(sampleExtraction, "year-month-day");
      expect(path).toEqual(["2024", "05 - Mai", "Jour 12"]);
    });

    it("builds frequency-year path", () => {
      const path = buildProposedPath(sampleExtraction, "frequency-year");
      expect(path).toEqual(["Transactions quotidiennes", "2024"]);
    });
  });

  describe("applyTemporalOrganization", () => {
    it("creates hierarchical folders with parentId links and reuses existing ones", () => {
      const addFolder = vi.fn();
      const moveDataset = vi.fn();

      const existingFolders: CatalogFolder[] = [
        {
          id: "folder-2024",
          name: "2024",
          parentId: null,
          starred: false,
          createdAt: "2024-01-01T00:00:00Z",
        },
      ];

      const datasets: Dataset[] = [
        {
          id: "ds-1",
          name: "sales_2024-03-01.csv",
          tableName: "sales",
          viewName: "v_sales",
          source: "upload",
          format: "csv",
          rowCount: 100,
          colCount: 5,
          sizeBytes: 1024,
          columns: [],
          updatedAt: "2024-03-01",
          tags: [],
        },
        {
          id: "ds-2",
          name: "sales_2024-03-15.csv",
          tableName: "sales_2",
          viewName: "v_sales_2",
          source: "upload",
          format: "csv",
          rowCount: 100,
          colCount: 5,
          sizeBytes: 1024,
          columns: [],
          updatedAt: "2024-03-15",
          tags: [],
        },
      ];

      const extractions = analyzeTemporalDatasets(datasets, "year-month");
      const res = applyTemporalOrganization({
        extractions,
        existingFolders,
        addFolder,
        moveDataset,
      });

      // '2024' folder already exists, so only '03 - Mars' subfolder should be created once!
      expect(res.foldersCreated).toBe(1);
      expect(res.datasetsMoved).toBe(2);

      expect(addFolder).toHaveBeenCalledTimes(1);
      const createdFolder = addFolder.mock.calls[0][0];
      expect(createdFolder.name).toBe("03 - Mars");
      expect(createdFolder.parentId).toBe("folder-2024");

      expect(moveDataset).toHaveBeenCalledWith("ds-1", createdFolder.id);
      expect(moveDataset).toHaveBeenCalledWith("ds-2", createdFolder.id);
    });
  });
});


describe("date-organizer edge-case coverage", () => {
  it.each([
    ["weekly_report.csv", "weekly"],
    ["monthly_report.csv", "monthly"],
    ["quarterly_report.csv", "quarterly"],
    ["annual_report.csv", "annual"],
    ["hourly_report.csv", "hourly"],
  ] as const)("detects %s as %s frequency", (name, expected) => {
    const info = extractTemporalInfo({ id: name, name });
    expect(info.frequency).toBe(expected);
    expect(info.confidence).toBe("high");
  });

  it("extracts year-month and reverse textual month formats", () => {
    const numeric = extractTemporalInfo({ id: "ym", name: "report_2024-07.csv" });
    expect(numeric).toMatchObject({
      year: 2024,
      month: 7,
      monthName: "07 - Juillet",
      quarter: 3,
      confidence: "high",
    });

    const textual = extractTemporalInfo({ id: "txt", name: "report_2024_septembre.csv" });
    expect(textual).toMatchObject({
      year: 2024,
      month: 9,
      monthName: "09 - Septembre",
      quarter: 3,
      confidence: "high",
    });
  });

  it("keeps a detected frequency while adding a standalone year", () => {
    const info = extractTemporalInfo({ id: "weekly", name: "weekly_report_2024.csv" });
    expect(info).toMatchObject({
      year: 2024,
      frequency: "weekly",
      confidence: "high",
    });
    expect(info.sourceExplanation).toContain("Année 2024");
  });

  it("falls back to temporal column metadata when the filename has no date", () => {
    const byName = extractTemporalInfo({
      id: "meta-name",
      name: "transactions.csv",
      columns: [{ name: "transaction_date", type: "string" }],
    });
    expect(byName).toMatchObject({
      year: null,
      confidence: "low",
      sourceExplanation: 'Colonne temporelle trouvée: "transaction_date"',
    });

    const byType = extractTemporalInfo({
      id: "meta-type",
      name: "transactions.csv",
      columns: [
        { name: "amount", type: "number" },
        { name: "created", type: "date" },
      ],
    });
    expect(byType.sourceExplanation).toBe('Colonne temporelle trouvée: "created"');
  });

  it("covers the fallback path for every temporal granularity", () => {
    const base = {
      datasetId: "1",
      datasetName: "test.csv",
      year: 2024,
      month: 5,
      monthName: "05 - Mai",
      day: 12,
      quarter: 2,
      frequency: "daily" as const,
      confidence: "high" as const,
      sourceExplanation: "test",
    };

    const yearOnly = {
      ...base,
      month: null,
      monthName: null,
      day: null,
      quarter: null,
      frequency: null,
    };
    const frequencyOnly = {
      ...base,
      year: null,
      month: null,
      monthName: null,
      day: null,
      quarter: null,
      frequency: "weekly" as const,
    };
    const yearMonthNoDay = { ...base, day: null, frequency: null };
    const noTemporal = {
      ...base,
      year: null,
      month: null,
      monthName: null,
      day: null,
      quarter: null,
      frequency: null,
    };

    expect(buildProposedPath(yearOnly, "year-month")).toEqual(["2024"]);
    expect(buildProposedPath(frequencyOnly, "year-month")).toEqual(["Données hebdomadaires"]);

    expect(buildProposedPath(yearOnly, "year-quarter")).toEqual(["2024"]);
    expect(buildProposedPath(frequencyOnly, "year-quarter")).toEqual(["Données hebdomadaires"]);

    expect(buildProposedPath(yearMonthNoDay, "year-month-day")).toEqual(["2024", "05 - Mai"]);
    expect(buildProposedPath(yearOnly, "year-month-day")).toEqual(["2024"]);
    expect(buildProposedPath(frequencyOnly, "year-month-day")).toEqual(["Données hebdomadaires"]);

    expect(buildProposedPath(frequencyOnly, "frequency-year")).toEqual(["Données hebdomadaires"]);
    expect(buildProposedPath({ ...base, frequency: null }, "frequency-year")).toEqual([
      "Périodique",
      "2024",
      "05 - Mai",
    ]);
    expect(buildProposedPath(yearOnly, "frequency-year")).toEqual(["Périodique", "2024"]);

    expect(buildProposedPath(noTemporal, "year-month", true)).toEqual(["Autres (Sans date)"]);
    expect(buildProposedPath(noTemporal, "year-month", false)).toEqual([]);
  });

  it("skips undated datasets and creates a year folder when no hierarchy exists", () => {
    const addFolder = vi.fn();
    const moveDataset = vi.fn();
    const undated = {
      id: "undated",
      name: "notes.csv",
      tableName: "notes",
      viewName: "v_notes",
      source: "upload",
      format: "csv",
      rowCount: 1,
      colCount: 1,
      sizeBytes: 16,
      columns: [],
      updatedAt: "2024-01-01",
      tags: [],
    } as Dataset;

    const skipped = applyTemporalOrganization({
      extractions: analyzeTemporalDatasets([undated], "year-month"),
      existingFolders: [],
      addFolder,
      moveDataset,
    });
    expect(skipped).toEqual({ foldersCreated: 0, datasetsMoved: 0 });
    expect(moveDataset).not.toHaveBeenCalled();

    const dated = { ...undated, id: "dated", name: "sales_2025-01-15.csv" };
    const organized = applyTemporalOrganization({
      extractions: analyzeTemporalDatasets([dated], "year-month"),
      existingFolders: [],
      addFolder,
      moveDataset,
    });
    expect(organized).toEqual({ foldersCreated: 2, datasetsMoved: 1 });
    expect(addFolder).toHaveBeenCalledWith(
      expect.objectContaining({ name: "2025", parentId: null, color: "#3b82f6" }),
    );
  });
});
