import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReportData } from "@/features/report-studio/lib/types";

/**
 * Unit tests for src/features/report-studio/lib/charts.ts
 *
 * The module uses echarts in SSR mode (init(null, ..., { ssr: true })).
 * We mock echarts so the tests run in jsdom without needing a real ECharts
 * renderer, while keeping the target module logic real.
 *
 * Branches to cover:
 *   renderHourlyChartSvg:
 *     1. data.hourlyData is empty → returns null
 *     2. data.hourlyData is non-empty → returns SVG string (try/finally disposes chart)
 *     3. primaryColor default parameter (#0066cc) vs explicit
 *
 *   renderHourlyChartSvgBytes:
 *     1. svg is null (hourlyData empty) → returns null
 *     2. svg is a string → returns Uint8Array
 *
 *   utf8Bytes (internal, exercised via renderHourlyChartSvgBytes):
 *     1. encodes text to Uint8Array via TextEncoder
 *
 *   hourlyOption (internal, exercised via renderHourlyChartSvg):
 *     1. maps hourly data to ECharts option structure
 */

// ─── Mock echarts ────────────────────────────────────────────────────────────

/** Track dispose calls to verify the finally block always runs. */
const disposeSpy = vi.fn();
const setOptionSpy = vi.fn();
const renderToSVGStringSpy = vi.fn();

vi.mock("echarts", () => {
  return {
    init: vi.fn((_canvas: null, _theme: undefined, _opts: object) => ({
      setOption: setOptionSpy,
      renderToSVGString: renderToSVGStringSpy,
      dispose: disposeSpy,
    })),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeData(partial: Partial<ReportData> = {}): ReportData {
  return {
    date: "2026-06-25",
    totalTransactions: 10_000,
    successRate: 97.0,
    totalRevenue: 1000.0,
    failedTransactions: 300,
    topChannels: [
      { name: "USSD", volume: 5000, successRate: 98.2, revenue: 800.0 },
    ],
    hourlyData: [
      { hour: 9, count: 100, successRate: 97.12 },
      { hour: 10, count: 250, successRate: 95.0 },
    ],
    ...partial,
  };
}

beforeEach(() => {
  disposeSpy.mockClear();
  setOptionSpy.mockClear();
  renderToSVGStringSpy.mockClear();
  renderToSVGStringSpy.mockReturnValue("<svg>chart</svg>");
});

// ─── Import after mock setup ─────────────────────────────────────────────────

const { renderHourlyChartSvg, renderHourlyChartSvgBytes } = await import(
  "@/features/report-studio/lib/charts"
);

// ─── renderHourlyChartSvg ────────────────────────────────────────────────────

describe("renderHourlyChartSvg", () => {
  it("returns null when hourlyData is empty", () => {
    const result = renderHourlyChartSvg(makeData({ hourlyData: [] }));
    expect(result).toBeNull();
  });

  it("does not initialise an ECharts instance when hourlyData is empty", async () => {
    const { init } = await import("echarts");
    renderHourlyChartSvg(makeData({ hourlyData: [] }));
    expect(init).not.toHaveBeenCalled();
  });

  it("returns the SVG string produced by renderToSVGString when hourlyData is non-empty", () => {
    const result = renderHourlyChartSvg(makeData());
    expect(result).toBe("<svg>chart</svg>");
  });

  it("calls setOption and renderToSVGString on the echarts instance", () => {
    renderHourlyChartSvg(makeData());
    expect(setOptionSpy).toHaveBeenCalledOnce();
    expect(renderToSVGStringSpy).toHaveBeenCalledOnce();
  });

  it("always calls dispose in the finally block even when rendering succeeds", () => {
    renderHourlyChartSvg(makeData());
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it("always calls dispose even when renderToSVGString throws", () => {
    renderToSVGStringSpy.mockImplementationOnce(() => {
      throw new Error("render failed");
    });
    expect(() => renderHourlyChartSvg(makeData())).toThrow("render failed");
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it("uses the default primaryColor (#0066cc) when no second argument is supplied", async () => {
    const { init } = await import("echarts");
    renderHourlyChartSvg(makeData());
    // The option passed to setOption should contain the default primary color.
    const optionArg = setOptionSpy.mock.calls[0][0];
    // hourlyOption builds series with areaStyle.color = primary
    expect(optionArg.series[0].areaStyle.color).toBe("#0066cc");
    // init is called with SSR / svg renderer flags
    expect(init).toHaveBeenCalledWith(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 900,
      height: 360,
    });
  });

  it("uses an explicit primaryColor when supplied", () => {
    renderHourlyChartSvg(makeData(), "#ff0000");
    const optionArg = setOptionSpy.mock.calls[0][0];
    expect(optionArg.series[0].areaStyle.color).toBe("#ff0000");
    expect(optionArg.series[0].lineStyle.color).toBe("#ff0000");
    expect(optionArg.series[0].itemStyle.color).toBe("#ff0000");
  });

  it("passes hourly data labels formatted as 'HH:00' on xAxis", () => {
    renderHourlyChartSvg(
      makeData({
        hourlyData: [
          { hour: 0, count: 10, successRate: 90 },
          { hour: 23, count: 20, successRate: 80 },
        ],
      }),
    );
    const optionArg = setOptionSpy.mock.calls[0][0];
    expect(optionArg.xAxis.data).toEqual(["0:00", "23:00"]);
  });

  it("passes rounded counts and toFixed(1) successRate values in series data", () => {
    renderHourlyChartSvg(
      makeData({
        hourlyData: [
          { hour: 8, count: 99.7, successRate: 95.12345 },
          { hour: 9, count: 200.2, successRate: 88.777 },
        ],
      }),
    );
    const optionArg = setOptionSpy.mock.calls[0][0];
    // series[0] = Transactions (Math.round of count)
    expect(optionArg.series[0].data).toEqual([100, 200]);
    // series[1] = Success Rate % (Number(x.toFixed(1)))
    expect(optionArg.series[1].data).toEqual([95.1, 88.8]);
  });

  it("includes title, legend, grid, and dual yAxis in the option", () => {
    renderHourlyChartSvg(makeData());
    const optionArg = setOptionSpy.mock.calls[0][0];
    expect(optionArg.title.text).toBe("Hourly Transaction Distribution");
    expect(optionArg.legend.data).toEqual(["Transactions", "Success Rate %"]);
    expect(optionArg.grid).toBeDefined();
    expect(optionArg.yAxis).toHaveLength(2);
  });

  it("sets second yAxis (Success Rate %) to right position with 0-100 range", () => {
    renderHourlyChartSvg(makeData());
    const optionArg = setOptionSpy.mock.calls[0][0];
    const rightAxis = optionArg.yAxis[1];
    expect(rightAxis.position).toBe("right");
    expect(rightAxis.min).toBe(0);
    expect(rightAxis.max).toBe(100);
  });

  it("sets the success rate series to use yAxisIndex 1", () => {
    renderHourlyChartSvg(makeData());
    const optionArg = setOptionSpy.mock.calls[0][0];
    expect(optionArg.series[1].yAxisIndex).toBe(1);
  });

  it("sets backgroundColor to white in the option", () => {
    renderHourlyChartSvg(makeData());
    const optionArg = setOptionSpy.mock.calls[0][0];
    expect(optionArg.backgroundColor).toBe("#ffffff");
  });
});

// ─── renderHourlyChartSvgBytes ───────────────────────────────────────────────

describe("renderHourlyChartSvgBytes", () => {
  it("returns null when hourlyData is empty (svg is null)", () => {
    const result = renderHourlyChartSvgBytes(makeData({ hourlyData: [] }));
    expect(result).toBeNull();
  });

  it("returns a non-null typed array when hourlyData is non-empty", () => {
    const result = renderHourlyChartSvgBytes(makeData());
    expect(result).not.toBeNull();
    // Uint8Array may come from a different realm in jsdom; check via constructor name.
    expect(Object.prototype.toString.call(result)).toBe("[object Uint8Array]");
  });

  it("encodes the SVG string as UTF-8 bytes correctly", () => {
    renderToSVGStringSpy.mockReturnValueOnce("<svg>hello</svg>");
    const result = renderHourlyChartSvgBytes(makeData());
    // TextEncoder encodes <svg>hello</svg> to the expected bytes
    const expected = new TextEncoder().encode("<svg>hello</svg>");
    expect(result).toEqual(expected);
  });

  it("passes the primaryColor argument through to renderHourlyChartSvg", () => {
    renderHourlyChartSvgBytes(makeData(), "#123456");
    const optionArg = setOptionSpy.mock.calls[0][0];
    expect(optionArg.series[0].areaStyle.color).toBe("#123456");
  });

  it("uses default primaryColor when primaryColor arg is undefined", () => {
    renderHourlyChartSvgBytes(makeData(), undefined);
    const optionArg = setOptionSpy.mock.calls[0][0];
    expect(optionArg.series[0].areaStyle.color).toBe("#0066cc");
  });

  it("encodes multi-byte (non-ASCII) SVG content correctly", () => {
    const svgWithUnicode = "<svg>こんにちは</svg>";
    renderToSVGStringSpy.mockReturnValueOnce(svgWithUnicode);
    const result = renderHourlyChartSvgBytes(makeData());
    const expected = new TextEncoder().encode(svgWithUnicode);
    expect(result).toEqual(expected);
  });

  it("disposes the echarts chart instance exactly once per call", () => {
    renderHourlyChartSvgBytes(makeData());
    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});
