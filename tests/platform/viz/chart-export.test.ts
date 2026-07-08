/**
 * Unit tests for src/platform/viz/chart-export.ts.
 *
 * The pure `encodeRowsToCsv` is exercised first (quoting rules, embedded
 * quotes/commas/newlines, empty input, heterogeneous rows). The remaining
 * suites cover the PNG/clipboard/CSV-download DOM+Electron side-effect
 * wrappers, mirroring the mocking approach used in
 * tests/platform/viz/save-bytes.test.ts (spy on document.createElement / URL /
 * Blob rather than reimplementing jsdom).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildChartPngDataUrl,
  copyChartPng,
  encodeRowsToCsv,
  exportChartPng,
  exportRowsCsv,
  type EChartsInstance,
} from "@/platform/viz/chart-export";

describe("encodeRowsToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(encodeRowsToCsv([])).toBe("");
  });

  it("emits a header row plus one CRLF-terminated line per row", () => {
    const csv = encodeRowsToCsv([
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("quotes fields that contain a comma", () => {
    const csv = encodeRowsToCsv([{ name: "Doe, John", city: "Tunis" }]);
    expect(csv).toBe('name,city\r\n"Doe, John",Tunis');
  });

  it("quotes and doubles embedded double-quotes", () => {
    const csv = encodeRowsToCsv([{ note: 'she said "hi"' }]);
    expect(csv).toBe('note\r\n"she said ""hi"""');
  });

  it("quotes fields containing newlines (LF and CRLF)", () => {
    const csv = encodeRowsToCsv([{ text: "line1\nline2" }, { text: "a\r\nb" }]);
    expect(csv).toBe('text\r\n"line1\nline2"\r\n"a\r\nb"');
  });

  it("quotes a header key that itself needs escaping", () => {
    const csv = encodeRowsToCsv([{ "a,b": 1 }]);
    expect(csv).toBe('"a,b"\r\n1');
  });

  it("renders null and undefined as empty fields", () => {
    const csv = encodeRowsToCsv([{ a: null, b: undefined, c: 0 }]);
    expect(csv).toBe("a,b,c\r\n,,0");
  });

  it("keeps the boolean and number string forms", () => {
    const csv = encodeRowsToCsv([{ ok: true, n: 3.5, z: false }]);
    expect(csv).toBe("ok,n,z\r\ntrue,3.5,false");
  });

  it("unions keys across heterogeneous rows in first-seen order, filling gaps", () => {
    const csv = encodeRowsToCsv([
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    ]);
    expect(csv).toBe("a,b,c\r\n1,2,\r\n,3,4");
  });

  it("JSON-encodes nested object values (which then get quoted)", () => {
    const csv = encodeRowsToCsv([{ meta: { x: 1 } }]);
    // JSON.stringify → {"x":1}; the embedded quotes force field quoting.
    expect(csv).toBe('meta\r\n"{""x"":1}"');
  });

  it("serialises Date values as ISO strings", () => {
    const csv = encodeRowsToCsv([{ at: new Date("2026-07-05T00:00:00.000Z") }]);
    expect(csv).toBe("at\r\n2026-07-05T00:00:00.000Z");
  });

  it("preserves a leading UTF-8 field without mangling accented text", () => {
    const csv = encodeRowsToCsv([{ canal: "Réseau", valeur: "1 234" }]);
    expect(csv).toBe("canal,valeur\r\nRéseau,1 234");
  });

  it("falls back to String() when a value can't be JSON.stringify'd (circular reference)", () => {
    // Arrange — a self-referencing object throws inside JSON.stringify, forcing
    // formatCell's catch branch to stringify via String() instead.
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    // Act
    const csv = encodeRowsToCsv([{ obj: circular }]);

    // Assert — String(object) yields "[object Object]" (no throw escapes the encoder).
    expect(csv).toBe("obj\r\n[object Object]");
  });
});

// ─── PNG data URL / download / clipboard ─────────────────────────────────────

/** Fake ECharts fallback instance exposing only what these helpers call. */
function makeChartInstance(dataUrl = "data:image/png;base64,AAAA"): EChartsInstance {
  return { getDataURL: vi.fn().mockReturnValue(dataUrl) } as unknown as EChartsInstance;
}

describe("buildChartPngDataUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when the getter reports no reachable instance", () => {
    // Arrange — OffscreenChart is active, no fallback ref mounted.
    const getInstance = () => null;

    // Act
    const result = buildChartPngDataUrl(getInstance);

    // Assert
    expect(result).toBeNull();
  });

  it("requests a retina PNG with an opaque background and returns the data URL", () => {
    // Arrange
    const chart = makeChartInstance("data:image/png;base64,XYZ");
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      backgroundColor: "rgb(12, 34, 56)",
    } as CSSStyleDeclaration);

    // Act
    const result = buildChartPngDataUrl(() => chart);

    // Assert
    expect(result).toBe("data:image/png;base64,XYZ");
    expect(chart.getDataURL).toHaveBeenCalledWith({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "rgb(12, 34, 56)",
    });
  });

  it("falls back to an opaque white background when the resolved color is transparent", () => {
    // Arrange
    const chart = makeChartInstance();
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      backgroundColor: "rgba(0, 0, 0, 0)",
    } as CSSStyleDeclaration);

    // Act
    buildChartPngDataUrl(() => chart);

    // Assert
    expect(chart.getDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: "#ffffff" }),
    );
  });

  it("falls back to an opaque white background when the resolved color is empty", () => {
    // Arrange
    const chart = makeChartInstance();
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      backgroundColor: "",
    } as CSSStyleDeclaration);

    // Act
    buildChartPngDataUrl(() => chart);

    // Assert
    expect(chart.getDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: "#ffffff" }),
    );
  });

  it("appends and removes a hidden probe element from the document body", () => {
    // Arrange
    const chart = makeChartInstance();
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      backgroundColor: "rgb(1, 2, 3)",
    } as CSSStyleDeclaration);
    const appendSpy = vi.spyOn(document.body, "appendChild");

    // Act
    buildChartPngDataUrl(() => chart);

    // Assert — the probe was appended then removed; nothing leaks into the DOM.
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(document.body.childElementCount).toBe(0);
  });
});

describe("exportChartPng", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false and does not touch the DOM when no instance is reachable", () => {
    // Act
    const result = exportChartPng(() => null, "chart");

    // Assert
    expect(result).toBe(false);
  });

  it("triggers a download with a .png extension appended and returns true", () => {
    // Arrange — createElement("div") still needs to build a real probe element
    // for resolveCardBackground(), so only intercept the "a" anchor tag.
    const chart = makeChartInstance("data:image/png;base64,ABC");
    const anchorMock = { href: "", download: "", rel: "", click: vi.fn() };
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "a" ? (anchorMock as unknown as HTMLElement) : realCreateElement(tag),
    );

    // Act
    const result = exportChartPng(() => chart, "my-chart");

    // Assert
    expect(result).toBe(true);
    expect(anchorMock.href).toBe("data:image/png;base64,ABC");
    expect(anchorMock.download).toBe("my-chart.png");
    expect(anchorMock.rel).toBe("noopener");
    expect(anchorMock.click).toHaveBeenCalledOnce();
  });

  it("does not duplicate the extension when the filename already ends in .png", () => {
    // Arrange
    const chart = makeChartInstance();
    const anchorMock = { href: "", download: "", rel: "", click: vi.fn() };
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "a" ? (anchorMock as unknown as HTMLElement) : realCreateElement(tag),
    );

    // Act
    exportChartPng(() => chart, "already-named.PNG");

    // Assert — case-insensitive match against the existing extension.
    expect(anchorMock.download).toBe("already-named.PNG");
  });
});

describe("copyChartPng", () => {
  const ORIGINAL_ELECTRON_CLIPBOARD = (window as unknown as Record<string, unknown>)
    .electronClipboard;

  afterEach(() => {
    vi.restoreAllMocks();
    (window as unknown as Record<string, unknown>).electronClipboard = ORIGINAL_ELECTRON_CLIPBOARD;
  });

  it("throws a descriptive error when no fallback instance is reachable", async () => {
    // Act / Assert
    await expect(copyChartPng(() => null)).rejects.toThrow(
      "Aucun graphique à copier — rendu hors-écran actif.",
    );
  });

  it("writes through the Electron clipboard bridge when available", async () => {
    // Arrange
    const chart = makeChartInstance("data:image/png;base64,BRIDGE");
    const writeImage = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Record<string, unknown>).electronClipboard = { writeImage };

    // Act
    await copyChartPng(() => chart);

    // Assert
    expect(writeImage).toHaveBeenCalledWith("data:image/png;base64,BRIDGE");
  });

  it("falls back to navigator.clipboard.write with a decoded Blob when no bridge exists", async () => {
    // Arrange
    delete (window as unknown as Record<string, unknown>).electronClipboard;
    const chart = makeChartInstance(`data:image/png;base64,${Buffer.from("hi").toString("base64")}`);
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    );

    // Act
    await copyChartPng(() => chart);

    // Assert
    expect(write).toHaveBeenCalledTimes(1);
    const [item] = write.mock.calls[0][0] as Array<{ items: Record<string, Blob> }>;
    expect(item.items["image/png"]).toBeInstanceOf(Blob);
  });

  it("defaults the decoded Blob's MIME type to image/png when the data URL has no matching prefix", async () => {
    // Arrange — a data URL missing the "data:<mime>;" segment the regex expects,
    // exercising the `?? IMAGE_MIME` fallback in dataUrlToBlob.
    delete (window as unknown as Record<string, unknown>).electronClipboard;
    const chart = makeChartInstance(`nobreakdown,${Buffer.from("hi").toString("base64")}`);
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    );

    // Act
    await copyChartPng(() => chart);

    // Assert
    const [item] = write.mock.calls[0][0] as Array<{ items: Record<string, Blob> }>;
    expect(item.items["image/png"]).toBeInstanceOf(Blob);
  });

  it("throws a descriptive error when neither the bridge nor navigator.clipboard is available", async () => {
    // Arrange
    delete (window as unknown as Record<string, unknown>).electronClipboard;
    vi.stubGlobal("navigator", {});
    const chart = makeChartInstance();

    // Act / Assert
    await expect(copyChartPng(() => chart)).rejects.toThrow(
      "Copie d'image disponible uniquement dans l'application de bureau.",
    );
  });
});

describe("exportRowsCsv", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads a BOM-prefixed CSV blob with a .csv extension and revokes the object URL", () => {
    // Arrange
    const anchorMock = { href: "", download: "", rel: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);
    const createObjectURL = vi.fn().mockReturnValue("blob:csv-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const BlobSpy = vi.spyOn(globalThis, "Blob");

    // Act
    exportRowsCsv([{ a: 1, b: 2 }], "export");

    // Assert
    expect(BlobSpy).toHaveBeenCalledWith(["﻿a,b\r\n1,2"], {
      type: "text/csv;charset=utf-8",
    });
    expect(anchorMock.href).toBe("blob:csv-url");
    expect(anchorMock.download).toBe("export.csv");
    expect(anchorMock.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv-url");
  });

  it("does not duplicate the extension when the filename already ends in .csv", () => {
    // Arrange
    const anchorMock = { href: "", download: "", rel: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchorMock as unknown as HTMLElement);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:csv-url"),
      revokeObjectURL: vi.fn(),
    });

    // Act
    exportRowsCsv([{ a: 1 }], "data.csv");

    // Assert
    expect(anchorMock.download).toBe("data.csv");
  });
});
