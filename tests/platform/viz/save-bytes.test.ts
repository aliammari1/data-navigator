/**
 * Unit tests for src/platform/viz/save-bytes.ts
 *
 * Strategy: mock the electron-fs bridge functions (hasElectronFS, saveFileDialog,
 * writeLocalFile) and relevant DOM APIs (URL.createObjectURL, URL.revokeObjectURL,
 * document.createElement). Exercise both the Electron path and the browser
 * fallback path, and all four ExportKind values.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock electron-fs before importing the target module ─────────────────────

vi.mock("@/platform/electron/electron-fs", () => ({
  hasElectronFS: vi.fn(),
  saveFileDialog: vi.fn(),
  writeLocalFile: vi.fn(),
}));

import * as electronFs from "@/platform/electron/electron-fs";
import { saveBytes } from "@/platform/viz/save-bytes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBytes(): ArrayBuffer {
  return new ArrayBuffer(16);
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();

  // DOM stubs — browser fallback path needs these
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-url");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Electron path ────────────────────────────────────────────────────────────

describe("saveBytes — Electron path (hasElectronFS = true)", () => {
  beforeEach(() => {
    vi.mocked(electronFs.hasElectronFS).mockReturnValue(true);
  });

  it("returns { saved: false } when the user cancels the save dialog", async () => {
    // Arrange
    vi.mocked(electronFs.saveFileDialog).mockResolvedValue(null);
    vi.mocked(electronFs.writeLocalFile).mockResolvedValue(undefined);

    // Act
    const result = await saveBytes(makeBytes(), "report.pdf", "pdf");

    // Assert
    expect(result).toEqual({ saved: false });
    expect(electronFs.saveFileDialog).toHaveBeenCalledOnce();
    expect(electronFs.writeLocalFile).not.toHaveBeenCalled();
  });

  it("returns { saved: true, path } and writes the file when dialog succeeds", async () => {
    // Arrange
    const filePath = "/home/user/report.pdf";
    vi.mocked(electronFs.saveFileDialog).mockResolvedValue(filePath);
    vi.mocked(electronFs.writeLocalFile).mockResolvedValue(undefined);
    const bytes = makeBytes();

    // Act
    const result = await saveBytes(bytes, "report.pdf", "pdf");

    // Assert
    expect(result).toEqual({ saved: true, path: filePath });
    expect(electronFs.writeLocalFile).toHaveBeenCalledWith(filePath, bytes);
  });

  it("passes the correct defaultPath and pdf filter to saveFileDialog", async () => {
    // Arrange
    vi.mocked(electronFs.saveFileDialog).mockResolvedValue("/out/export.pdf");
    vi.mocked(electronFs.writeLocalFile).mockResolvedValue(undefined);

    // Act
    await saveBytes(makeBytes(), "export.pdf", "pdf");

    // Assert
    expect(electronFs.saveFileDialog).toHaveBeenCalledWith({
      defaultPath: "export.pdf",
      filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    });
  });

  it("uses the correct xlsx filter for kind=xlsx", async () => {
    // Arrange
    vi.mocked(electronFs.saveFileDialog).mockResolvedValue("/out/data.xlsx");
    vi.mocked(electronFs.writeLocalFile).mockResolvedValue(undefined);

    // Act
    await saveBytes(makeBytes(), "data.xlsx", "xlsx");

    // Assert
    expect(electronFs.saveFileDialog).toHaveBeenCalledWith({
      defaultPath: "data.xlsx",
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });
  });

  it("uses the correct docx filter for kind=docx", async () => {
    // Arrange
    vi.mocked(electronFs.saveFileDialog).mockResolvedValue("/out/document.docx");
    vi.mocked(electronFs.writeLocalFile).mockResolvedValue(undefined);

    // Act
    await saveBytes(makeBytes(), "document.docx", "docx");

    // Assert
    expect(electronFs.saveFileDialog).toHaveBeenCalledWith({
      defaultPath: "document.docx",
      filters: [{ name: "Word Document", extensions: ["docx"] }],
    });
  });

  it("uses the correct pptx filter for kind=pptx", async () => {
    // Arrange
    vi.mocked(electronFs.saveFileDialog).mockResolvedValue("/out/slides.pptx");
    vi.mocked(electronFs.writeLocalFile).mockResolvedValue(undefined);

    // Act
    await saveBytes(makeBytes(), "slides.pptx", "pptx");

    // Assert
    expect(electronFs.saveFileDialog).toHaveBeenCalledWith({
      defaultPath: "slides.pptx",
      filters: [{ name: "PowerPoint Presentation", extensions: ["pptx"] }],
    });
  });
});

// ─── Browser fallback path ────────────────────────────────────────────────────

describe("saveBytes — Browser fallback path (hasElectronFS = false)", () => {
  beforeEach(() => {
    vi.mocked(electronFs.hasElectronFS).mockReturnValue(false);
  });

  it("returns { saved: true } without a path when falling back to browser download", async () => {
    // Arrange
    const anchorMock = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);

    // Act
    const result = await saveBytes(makeBytes(), "report.pdf", "pdf");

    // Assert
    expect(result).toEqual({ saved: true });
    expect(result).not.toHaveProperty("path");
  });

  it("creates a blob URL, sets href and download, clicks the anchor, then revokes the URL", async () => {
    // Arrange
    const anchorMock = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);

    // Act
    const bytes = makeBytes();
    await saveBytes(bytes, "output.xlsx", "xlsx");

    // Assert
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(anchorMock.href).toBe("blob:test-url");
    expect(anchorMock.download).toBe("output.xlsx");
    expect(anchorMock.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });

  it("creates a blob with the correct MIME type for pdf", async () => {
    // Arrange
    const anchorMock = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);
    const bytes = makeBytes();
    const BlobSpy = vi.spyOn(globalThis, "Blob");

    // Act
    await saveBytes(bytes, "report.pdf", "pdf");

    // Assert
    expect(BlobSpy).toHaveBeenCalledWith([bytes], { type: "application/pdf" });
  });

  it("creates a blob with the correct MIME type for xlsx", async () => {
    // Arrange
    const anchorMock = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);
    const bytes = makeBytes();
    const BlobSpy = vi.spyOn(globalThis, "Blob");

    // Act
    await saveBytes(bytes, "data.xlsx", "xlsx");

    // Assert
    expect(BlobSpy).toHaveBeenCalledWith([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("creates a blob with the correct MIME type for docx", async () => {
    // Arrange
    const anchorMock = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);
    const bytes = makeBytes();
    const BlobSpy = vi.spyOn(globalThis, "Blob");

    // Act
    await saveBytes(bytes, "document.docx", "docx");

    // Assert
    expect(BlobSpy).toHaveBeenCalledWith([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("creates a blob with the correct MIME type for pptx", async () => {
    // Arrange
    const anchorMock = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);
    const bytes = makeBytes();
    const BlobSpy = vi.spyOn(globalThis, "Blob");

    // Act
    await saveBytes(bytes, "slides.pptx", "pptx");

    // Assert
    expect(BlobSpy).toHaveBeenCalledWith([bytes], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  });

  it("does not call saveFileDialog or writeLocalFile in browser fallback path", async () => {
    // Arrange
    const anchorMock = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);

    // Act
    await saveBytes(makeBytes(), "report.pdf", "pdf");

    // Assert
    expect(electronFs.saveFileDialog).not.toHaveBeenCalled();
    expect(electronFs.writeLocalFile).not.toHaveBeenCalled();
  });
});
