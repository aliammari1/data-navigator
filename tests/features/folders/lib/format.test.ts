import { describe, it, expect } from "vitest";
import {
  formatBytes,
  formatAge,
  fileTypeStyle,
  qualityColor,
  FOLDER_COLORS,
} from "@/features/folders/lib/format";
import { Database, File, FileSpreadsheet, Folder, Hash } from "lucide-react";

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------
describe("formatBytes", () => {
  it("returns an em dash for exactly 0 bytes", () => {
    expect(formatBytes(0)).toBe("—");
  });

  it("returns bytes when under 1 KB", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("returns kilobytes when 1 KB ≤ size < 1 MB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 - 1)).toMatch(/KB$/);
  });

  it("returns megabytes when 1 MB ≤ size < 1 GB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(1024 * 1024 * 1024 - 1)).toMatch(/MB$/);
  });

  it("returns gigabytes for sizes ≥ 1 GB", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });
});

// ---------------------------------------------------------------------------
// formatAge
// ---------------------------------------------------------------------------
describe("formatAge", () => {
  it("returns 'just now' when under 60 seconds ago", () => {
    const d = new Date(Date.now() - 30_000);
    expect(formatAge(d)).toBe("just now");
  });

  it("returns minutes ago when under 1 hour ago", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatAge(d)).toBe("5m ago");
  });

  it("returns hours ago when under 1 day ago", () => {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    expect(formatAge(d)).toBe("3h ago");
  });

  it("returns days ago when under 7 days ago", () => {
    const d = new Date(Date.now() - 3 * 86400 * 1000);
    expect(formatAge(d)).toBe("3d ago");
  });

  it("returns locale date string when 7 or more days ago", () => {
    const d = new Date(Date.now() - 8 * 86400 * 1000);
    expect(formatAge(d)).toBe(d.toLocaleDateString());
  });

  it("returns 'just now' at exactly 0 seconds ago", () => {
    // 0 seconds < 60 → "just now"
    const d = new Date(Date.now());
    expect(formatAge(d)).toBe("just now");
  });

  it("returns 'just now' at 59 seconds ago (boundary)", () => {
    const d = new Date(Date.now() - 59_000);
    expect(formatAge(d)).toBe("just now");
  });

  it("returns minutes at exactly 60 seconds ago", () => {
    const d = new Date(Date.now() - 60_000);
    expect(formatAge(d)).toBe("1m ago");
  });

  it("returns hours at exactly 3600 seconds ago", () => {
    const d = new Date(Date.now() - 3600_000);
    expect(formatAge(d)).toBe("1h ago");
  });

  it("returns days at exactly 86400 seconds ago", () => {
    const d = new Date(Date.now() - 86400_000);
    expect(formatAge(d)).toBe("1d ago");
  });

  it("returns locale date at exactly 7 days ago", () => {
    const d = new Date(Date.now() - 7 * 86400_000);
    expect(formatAge(d)).toBe(d.toLocaleDateString());
  });
});

// ---------------------------------------------------------------------------
// fileTypeStyle
// ---------------------------------------------------------------------------
describe("fileTypeStyle", () => {
  it("returns folder style for 'folder'", () => {
    const style = fileTypeStyle("folder");
    expect(style.icon).toBe(Folder);
    expect(style.color).toBe("text-yellow-400");
    expect(style.bg).toBe("bg-yellow-500/15");
  });

  it("returns spreadsheet/green style for 'csv'", () => {
    const style = fileTypeStyle("csv");
    expect(style.icon).toBe(FileSpreadsheet);
    expect(style.color).toBe("text-green-400");
    expect(style.bg).toBe("bg-green-500/15");
  });

  it("returns spreadsheet/green style for 'tsv'", () => {
    const style = fileTypeStyle("tsv");
    expect(style.icon).toBe(FileSpreadsheet);
    expect(style.color).toBe("text-green-400");
    expect(style.bg).toBe("bg-green-500/15");
  });

  it("returns spreadsheet/green style for 'txt'", () => {
    const style = fileTypeStyle("txt");
    expect(style.icon).toBe(FileSpreadsheet);
    expect(style.color).toBe("text-green-400");
    expect(style.bg).toBe("bg-green-500/15");
  });

  it("returns spreadsheet/emerald style for 'excel'", () => {
    const style = fileTypeStyle("excel");
    expect(style.icon).toBe(FileSpreadsheet);
    expect(style.color).toBe("text-emerald-400");
    expect(style.bg).toBe("bg-emerald-500/15");
  });

  it("returns database/indigo style for 'parquet'", () => {
    const style = fileTypeStyle("parquet");
    expect(style.icon).toBe(Database);
    expect(style.color).toBe("text-indigo-400");
    expect(style.bg).toBe("bg-indigo-500/15");
  });

  it("returns database/indigo style for 'pq'", () => {
    const style = fileTypeStyle("pq");
    expect(style.icon).toBe(Database);
    expect(style.color).toBe("text-indigo-400");
    expect(style.bg).toBe("bg-indigo-500/15");
  });

  it("returns database/purple style for 'duckdb'", () => {
    const style = fileTypeStyle("duckdb");
    expect(style.icon).toBe(Database);
    expect(style.color).toBe("text-purple-400");
    expect(style.bg).toBe("bg-purple-500/15");
  });

  it("returns hash/orange style for 'sql'", () => {
    const style = fileTypeStyle("sql");
    expect(style.icon).toBe(Hash);
    expect(style.color).toBe("text-orange-400");
    expect(style.bg).toBe("bg-orange-500/15");
  });

  it("returns generic file style for unknown type (default case)", () => {
    // 'json' is in NodeType but not handled explicitly → falls to default
    const style = fileTypeStyle("json");
    expect(style.icon).toBe(File);
    expect(style.color).toBe("text-muted-foreground");
    expect(style.bg).toBe("bg-muted");
  });
});

// ---------------------------------------------------------------------------
// qualityColor
// ---------------------------------------------------------------------------
describe("qualityColor", () => {
  it("returns green for quality >= 0.9", () => {
    expect(qualityColor(0.9)).toBe("#22c55e");
    expect(qualityColor(1.0)).toBe("#22c55e");
    expect(qualityColor(0.99)).toBe("#22c55e");
  });

  it("returns amber for quality >= 0.7 but < 0.9", () => {
    expect(qualityColor(0.7)).toBe("#f59e0b");
    expect(qualityColor(0.8)).toBe("#f59e0b");
    expect(qualityColor(0.89)).toBe("#f59e0b");
  });

  it("returns red for quality < 0.7", () => {
    expect(qualityColor(0)).toBe("#ef4444");
    expect(qualityColor(0.5)).toBe("#ef4444");
    expect(qualityColor(0.69)).toBe("#ef4444");
  });
});

// ---------------------------------------------------------------------------
// FOLDER_COLORS constant
// ---------------------------------------------------------------------------
describe("FOLDER_COLORS", () => {
  it("is an array of 8 color entries", () => {
    expect(Array.isArray(FOLDER_COLORS)).toBe(true);
    expect(FOLDER_COLORS).toHaveLength(8);
  });

  it("every entry has a non-empty name and hex-format value", () => {
    for (const entry of FOLDER_COLORS) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("contains the expected color names", () => {
    const names = FOLDER_COLORS.map((c) => c.name);
    expect(names).toContain("Bleu");
    expect(names).toContain("Indigo");
    expect(names).toContain("Vert");
    expect(names).toContain("Ambre");
    expect(names).toContain("Rouge");
    expect(names).toContain("Violet");
    expect(names).toContain("Cyan");
    expect(names).toContain("Rose");
  });
});
