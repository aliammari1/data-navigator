import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock external / IO dependencies ─────────────────────────────────────────
//
// We mock the three callsites that scene-export.ts reaches across module
// boundaries so that no real DuckDB, worker, or filesystem I/O runs.
// The target module's own logic (switch, narration wiring, doc construction,
// chart branching) stays real and therefore counts toward coverage.

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: vi.fn(),
}));

vi.mock("@/platform/viz", () => ({
  getChartProxy: vi.fn(),
  getExportProxy: vi.fn(),
  saveBytes: vi.fn(),
}));

// The option-builders and query-builders are pure functions — keep them real.

import { exportTheater } from "@/features/analytics-theater/lib/scene-export";
import type { ExportTheaterArgs } from "@/features/analytics-theater/lib/scene-export";
import type { TheaterScene } from "@/features/analytics-theater/model/scene";
import type { ColumnRoles } from "@/features/analytics-theater/lib/columns";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { getChartProxy, getExportProxy, saveBytes } from "@/platform/viz";

// ─── Typed mock accessors ─────────────────────────────────────────────────────

const mockRunReadOnlyQuery = vi.mocked(runReadOnlyQuery);
const mockGetChartProxy = vi.mocked(getChartProxy);
const mockGetExportProxy = vi.mocked(getExportProxy);
const mockSaveBytes = vi.mocked(saveBytes);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal ColumnRoles that satisfies every scene's SQL builder. */
const FULL_ROLES: ColumnRoles = {
  date: { name: "txn_date", type: "date", distinctCount: 100, nullable: false },
  measure: { name: "amount", type: "number", distinctCount: 500, nullable: false },
  category: { name: "channel", type: "string", distinctCount: 5, nullable: false },
  category2: { name: "region", type: "string", distinctCount: 3, nullable: false },
  text: { name: "remarks", type: "string", distinctCount: 999, nullable: false },
  numeric: [],
  strings: [],
};

/** Roles that make every SQL builder return null (no columns at all). */
const EMPTY_ROLES: ColumnRoles = {
  date: null,
  measure: null,
  category: null,
  category2: null,
  text: null,
  numeric: [],
  strings: [],
};

function makeScene(kind: TheaterScene["kind"], overrides: Partial<TheaterScene> = {}): TheaterScene {
  return {
    id: `id-${kind}`,
    kind,
    title: `${kind} Title`,
    narration: `${kind} narration text`,
    ...overrides,
  };
}

function makeArgs(
  scenes: TheaterScene[],
  kind: "pptx" | "pdf" = "pptx",
  roles: ColumnRoles = FULL_ROLES,
): ExportTheaterArgs {
  return { name: "Test Theater", scenes, view: "my_view", roles, kind };
}

/** A chart proxy that returns a fake SVG string. */
function makeChartProxy(svg = "<svg/>") {
  return { renderToSVGString: vi.fn().mockResolvedValue(svg) };
}

/** An export proxy that returns a fake byte array. */
function makeExportProxy(bytes = new Uint8Array([1, 2, 3])) {
  return {
    pptx: vi.fn().mockResolvedValue(bytes),
    pdf: vi.fn().mockResolvedValue(bytes),
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: DB returns empty rows, proxies return minimal usable stubs.
  mockRunReadOnlyQuery.mockResolvedValue([]);
  mockGetChartProxy.mockReturnValue(makeChartProxy() as never);
  mockGetExportProxy.mockReturnValue(makeExportProxy() as never);
  mockSaveBytes.mockResolvedValue({ saved: true, path: "/tmp/out.pptx" });
});

// ─── exportTheater — proxy unavailability ─────────────────────────────────────

describe("exportTheater — proxy unavailability", () => {
  it("throws when the export proxy is null (worker unavailable)", async () => {
    // Arrange
    mockGetExportProxy.mockReturnValue(null as never);

    // Act / Assert
    await expect(exportTheater(makeArgs([makeScene("race")]))).rejects.toThrow(
      "Export worker is unavailable",
    );
  });
});

// ─── exportTheater — empty scene list ────────────────────────────────────────

describe("exportTheater — empty scenes array", () => {
  it("builds a doc with zero sections and calls pptx on the proxy", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    const result = await exportTheater(makeArgs([]));

    // Assert
    expect(proxy.pptx).toHaveBeenCalledOnce();
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.sections).toHaveLength(0);
    expect(doc.charts).toHaveLength(0);
    expect(doc.includeCharts).toBe(false);
    expect(result).toEqual({ saved: true, path: "/tmp/out.pptx" });
  });

  it("falls back to 'Analytics Theater' when name is empty", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);
    const args: ExportTheaterArgs = { ...makeArgs([]), name: "" };

    // Act
    await exportTheater(args);

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.title).toBe("Analytics Theater");
  });

  it("calls pdf when kind is pdf", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([], "pdf"));

    // Assert
    expect(proxy.pdf).toHaveBeenCalledOnce();
    expect(proxy.pptx).not.toHaveBeenCalled();
  });
});

// ─── exportTheater — calendar scene ──────────────────────────────────────────

describe("exportTheater — calendar scene", () => {
  it("runs a DuckDB query, rasterizes the option, and produces a chart entry", async () => {
    // Arrange
    const rows = [{ d: "2024-01-15", v: 42 }];
    mockRunReadOnlyQuery.mockResolvedValue(rows);
    const chartProxy = makeChartProxy("<svg>calendar</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const exportProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(exportProxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("calendar")]));

    // Assert — SQL was executed, chart was rendered, section narration is set.
    expect(mockRunReadOnlyQuery).toHaveBeenCalledOnce();
    expect(chartProxy.renderToSVGString).toHaveBeenCalledOnce();

    const doc = (exportProxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0].svg).toBe("<svg>calendar</svg>");
    expect(doc.charts[0].width).toBe(1280);
    expect(doc.charts[0].height).toBe(720);
    expect(doc.includeCharts).toBe(true);
    // Section falls back to narrationRow because extraRows is empty.
    expect(doc.sections[0].headers).toEqual(["Narration"]);
    expect(doc.sections[0].rows[0][0]).toBe("calendar narration text");
  });

  it("handles null roles.date gracefully (SQL builder returns null → empty rows, option still built)", async () => {
    // Arrange — no date column → buildCalendarSql returns null → runSql returns [].
    // The calendar option builder still produces a valid option from empty rows.
    // The chart proxy still rasterizes it → chart IS produced.
    const chartProxy = makeChartProxy("<svg>empty-cal</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);
    const noDateRoles: ColumnRoles = { ...FULL_ROLES, date: null };

    // Act
    await exportTheater(makeArgs([makeScene("calendar")], "pptx", noDateRoles));

    // Assert — DB never called; but the option builder still runs on empty rows
    // and the chart proxy still renders an SVG.
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Chart is produced from the empty-rows option.
    expect(doc.charts).toHaveLength(1);
    expect(doc.sections[0].headers).toEqual(["Narration"]);
  });

  it("produces no chart when chart proxy is null", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ d: "2024-03-03", v: 10 }]);
    mockGetChartProxy.mockReturnValue(null as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("calendar")]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(0);
    expect(doc.includeCharts).toBe(false);
  });

  it("produces no chart when renderToSVGString throws", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ d: "2024-03-03", v: 5 }]);
    const chartProxy = { renderToSVGString: vi.fn().mockRejectedValue(new Error("render fail")) };
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("calendar")]));

    // Assert — error swallowed; no chart.
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(0);
  });

  it("produces no chart when renderToSVGString returns null", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ d: "2024-05-05", v: 7 }]);
    const chartProxy = { renderToSVGString: vi.fn().mockResolvedValue(null) };
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("calendar")]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(0);
  });
});

// ─── exportTheater — calendar scene year fallback ────────────────────────────

describe("exportTheater — calendar scene with year fallback", () => {
  it("falls back to current year when the last row has no date value", async () => {
    // Arrange — row with empty date string; year parsing falls back to new Date().getFullYear()
    mockRunReadOnlyQuery.mockResolvedValue([{ d: "", v: 5 }]);
    const chartProxy = makeChartProxy("<svg/>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act — should not throw; the option builder handles this gracefully.
    await expect(exportTheater(makeArgs([makeScene("calendar")]))).resolves.toBeDefined();
  });
});

// ─── exportTheater — race scene ──────────────────────────────────────────────

describe("exportTheater — race scene", () => {
  it("runs query and produces a chart", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ cat: "A", v: 10 }, { cat: "B", v: 5 }]);
    const chartProxy = makeChartProxy("<svg>race</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("race")]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0].svg).toBe("<svg>race</svg>");
  });

  it("skips DB when required roles are missing (but option still built from empty rows)", async () => {
    // Arrange — no category → buildRaceSql returns null → runSql returns [].
    // buildRaceFinalOption([]) still produces a valid ECharts option → chart IS rendered.
    const chartProxy = makeChartProxy("<svg>empty-race</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const noCatRoles: ColumnRoles = { ...FULL_ROLES, category: null };
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("race")], "pptx", noCatRoles));

    // Assert — DB never called; chart IS produced from the empty-rows option.
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
  });
});

// ─── exportTheater — sankey scene ────────────────────────────────────────────

describe("exportTheater — sankey scene", () => {
  it("runs query and produces a chart", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ src: "A", tgt: "X", v: 20 }]);
    const chartProxy = makeChartProxy("<svg>sankey</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("sankey")]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
  });

  it("skips DB when category or category2 is missing (option still built from empty rows)", async () => {
    // Arrange — no category2 → buildSankeySql returns null → runSql returns [].
    // buildSankeyOption([]) still produces a valid option → chart IS rendered.
    const chartProxy = makeChartProxy("<svg>empty-sankey</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const noCat2Roles: ColumnRoles = { ...FULL_ROLES, category2: null };
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("sankey")], "pptx", noCat2Roles));

    // Assert — DB never called; chart IS produced.
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
  });
});

// ─── exportTheater — gantt scene ─────────────────────────────────────────────

describe("exportTheater — gantt scene", () => {
  it("runs query and produces a chart", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ cat: "Alpha", hour: 9, v: 4 }]);
    const chartProxy = makeChartProxy("<svg>gantt</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("gantt")]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
  });

  it("skips DB when date or category is missing (option still built from empty rows)", async () => {
    // Arrange — no date → buildGanttSql returns null → runSql returns [].
    // buildGanttOption([]) still produces a valid option → chart IS rendered.
    const chartProxy = makeChartProxy("<svg>empty-gantt</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const noDateRoles: ColumnRoles = { ...FULL_ROLES, date: null };
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("gantt")], "pptx", noDateRoles));

    // Assert — DB never called; chart IS produced.
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
  });
});

// ─── exportTheater — sunburst scene ──────────────────────────────────────────

describe("exportTheater — sunburst scene", () => {
  it("runs query and produces a chart", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ l1: "Cat", l2: "Sub", v: 15 }]);
    const chartProxy = makeChartProxy("<svg>sunburst</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("sunburst")]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
  });

  it("skips DB when category is missing (option still built from empty rows)", async () => {
    // Arrange — no category → buildSunburstSql returns null → runSql returns [].
    // buildSunburstOption([]) still produces a valid option → chart IS rendered.
    const chartProxy = makeChartProxy("<svg>empty-sunburst</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const noCatRoles: ColumnRoles = { ...FULL_ROLES, category: null };
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("sunburst")], "pptx", noCatRoles));

    // Assert — DB never called; chart IS produced.
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(1);
  });
});

// ─── exportTheater — wordcloud scene ─────────────────────────────────────────

describe("exportTheater — wordcloud scene", () => {
  it("surfaces top 20 tokens as a table section, no chart", async () => {
    // Arrange — wordcloud uses no chart proxy; only table rows.
    const rows = Array.from({ length: 25 }, (_, i) => ({ word: `word${i}`, count: 25 - i }));
    mockRunReadOnlyQuery.mockResolvedValue(rows);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("wordcloud")]));

    // Assert — no chart, section has Token/Count headers, max 20 rows.
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.charts).toHaveLength(0);
    const section = doc.sections[0];
    expect(section.headers).toEqual(["Token", "Count"]);
    // 20 token rows + 1 narration unshifted at position 0 = 21 rows.
    expect(section.rows.length).toBe(21);
    // The narration row is prepended at index 0.
    expect(section.rows[0][0]).toBe("wordcloud narration text");
    expect(section.rows[0][1]).toBe("");
  });

  it("omits narration unshift when narration is empty string", async () => {
    // Arrange
    const rows = [{ word: "hello", count: 5 }];
    mockRunReadOnlyQuery.mockResolvedValue(rows);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);
    const scene = makeScene("wordcloud", { narration: "" });

    // Act
    await exportTheater(makeArgs([scene]));

    // Assert — only the single data row; no prepended narration.
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.sections[0].rows).toHaveLength(1);
    expect(doc.sections[0].rows[0][0]).toBe("hello");
  });

  it("uses narrationRow when query returns no rows (empty extraRows)", async () => {
    // Arrange — empty DB result → extraRows is [], falls back to narrationRow.
    mockRunReadOnlyQuery.mockResolvedValue([]);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("wordcloud")]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.sections[0].headers).toEqual(["Narration"]);
    expect(doc.sections[0].rows[0][0]).toBe("wordcloud narration text");
  });

  it("skips DB when text role is missing", async () => {
    // Arrange — no text column → buildWordCloudSql returns null.
    const noTextRoles: ColumnRoles = { ...FULL_ROLES, text: null };
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("wordcloud")], "pptx", noTextRoles));

    // Assert
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.sections[0].headers).toEqual(["Narration"]);
  });
});

// ─── exportTheater — narration fallback ──────────────────────────────────────

describe("exportTheater — narration fallback", () => {
  it("uses '—' when scene narration is empty", async () => {
    // Arrange
    const scene = makeScene("race", { narration: "" });
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([scene]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Section should be the narrationRow with fallback "—".
    expect(doc.sections[0].rows[0][0]).toBe("—");
  });
});

// ─── exportTheater — DuckDB error recovery ───────────────────────────────────

describe("exportTheater — DuckDB error recovery", () => {
  it("returns empty rows (no crash) when runReadOnlyQuery rejects", async () => {
    // Arrange — DB throws; runSql catches and returns [].
    // The option builder still runs on empty rows and produces a valid option.
    // The chart proxy renders it → chart IS produced.
    mockRunReadOnlyQuery.mockRejectedValue(new Error("DuckDB crash"));
    const chartProxy = makeChartProxy("<svg>error-recovery</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act — should resolve without throwing.
    await expect(exportTheater(makeArgs([makeScene("calendar")]))).resolves.toBeDefined();

    // Assert — chart is still produced from empty-rows option; no exception thrown.
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].headers).toEqual(["Narration"]);
  });
});

// ─── exportTheater — multi-scene document ────────────────────────────────────

describe("exportTheater — multi-scene document", () => {
  it("accumulates all sections and charts from multiple scenes", async () => {
    // Arrange — two scenes that both produce charts.
    mockRunReadOnlyQuery.mockResolvedValue([{ d: "2024-01-01", v: 5 }]);
    const chartProxy = makeChartProxy("<svg/>");
    mockGetChartProxy.mockReturnValue(chartProxy as never);
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    const scenes = [makeScene("calendar"), makeScene("race", { narration: "Race narration" })];

    // Act
    await exportTheater(makeArgs(scenes));

    // Assert — two sections, two charts, two DB calls.
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.sections).toHaveLength(2);
    expect(doc.charts).toHaveLength(2);
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(2);
  });

  it("sets correct subtitle with scene count", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);
    const scenes = [makeScene("calendar"), makeScene("gantt")];

    // Act
    await exportTheater(makeArgs(scenes));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.subtitle).toContain("2 scenes");
    expect(doc.subtitle).toContain("offline");
  });

  it("uses paperSize a4", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([]));

    // Assert
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.paperSize).toBe("a4");
  });
});

// ─── exportTheater — fileName sanitization ───────────────────────────────────

describe("exportTheater — file name sanitization", () => {
  it("sanitizes special characters in the theater name for the file name", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);
    const args: ExportTheaterArgs = { ...makeArgs([]), name: "Hello World! (v2)", kind: "pptx" };

    // Act
    await exportTheater(args);

    // Assert — saveBytes receives a cleaned file name.
    const [, fileName, kind] = mockSaveBytes.mock.calls[0];
    // The regex /[^\w.-]+/g collapses consecutive non-word chars into one "_".
    // "Hello World! (v2)" → "Hello_World_v2_"
    expect(fileName).toMatch(/^Hello_World_v2_\.pptx$/);
    expect(kind).toBe("pptx");
  });

  it("falls back to 'analytics-theater' when name is empty for the file name", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);
    const args: ExportTheaterArgs = { ...makeArgs([]), name: "", kind: "pdf" };

    // Act
    await exportTheater(args);

    // Assert
    const [, fileName] = mockSaveBytes.mock.calls[0];
    expect(fileName).toBe("analytics-theater.pdf");
  });

  it("passes pdf kind to saveBytes for pdf exports", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([], "pdf"));

    // Assert
    const [, , kind] = mockSaveBytes.mock.calls[0];
    expect(kind).toBe("pdf");
  });
});

// ─── exportTheater — saveBytes result propagated ──────────────────────────────

describe("exportTheater — saveBytes result propagation", () => {
  it("returns whatever saveBytes resolves to", async () => {
    // Arrange
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);
    mockSaveBytes.mockResolvedValue({ saved: false });

    // Act
    const result = await exportTheater(makeArgs([]));

    // Assert
    expect(result).toEqual({ saved: false });
  });
});

// ─── exportTheater — all scene kinds with null SQL (empty roles) ──────────────

describe("exportTheater — all scene kinds with null SQL (empty roles)", () => {
  // Chart scene kinds: SQL builder returns null → runSql returns [] → option
  // builder still runs on empty rows and produces a valid ECharts option →
  // chart IS rendered by the proxy. DB is never called.
  const chartKinds: TheaterScene["kind"][] = ["calendar", "race", "sankey", "gantt", "sunburst"];

  for (const kind of chartKinds) {
    it(`scene kind "${kind}" with empty roles: no DB call, section present, chart rendered from empty-rows option`, async () => {
      // Arrange
      const chartProxy = makeChartProxy("<svg/>");
      mockGetChartProxy.mockReturnValue(chartProxy as never);
      const proxy = makeExportProxy();
      mockGetExportProxy.mockReturnValue(proxy as never);

      // Act
      await exportTheater(makeArgs([makeScene(kind)], "pptx", EMPTY_ROLES));

      // Assert — DB never called; section exists; chart produced from empty option.
      expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
      const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(doc.sections).toHaveLength(1);
      expect(doc.charts).toHaveLength(1);
    });
  }

  it("scene kind 'wordcloud' with empty roles: no DB call, narration section, no chart", async () => {
    // Arrange — buildWordCloudSql returns null when text=null; extraRows stays
    // empty; wordcloud never builds an option so no chart is produced.
    const proxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(proxy as never);

    // Act
    await exportTheater(makeArgs([makeScene("wordcloud")], "pptx", EMPTY_ROLES));

    // Assert
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
    const doc = (proxy.pptx as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].headers).toEqual(["Narration"]);
    expect(doc.charts).toHaveLength(0);
  });
});
