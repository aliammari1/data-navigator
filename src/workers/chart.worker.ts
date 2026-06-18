/// <reference lib="webworker" />

/**
 * chart.worker — ECharts rendering OFF the renderer main thread.
 *
 * Charts are initialized into an OffscreenCanvas transferred from the renderer
 * (`canvas.transferControlToOffscreen()`); after transfer the main thread MUST
 * NOT touch that canvas. Pointer events fire on the main thread and are
 * forwarded here via `showTip`/`hideTip`.
 *
 * Export paths (offline, never DOM-screenshot a chart):
 *  - getDataURL(id) → PNG data URI from the live OffscreenCanvas instance.
 *  - renderToSVGString(option) → crisp vector SVG via a throwaway SSR instance.
 *
 * Comlink proxy name (renderer): `chart` (see chart-client.ts / OffscreenChart).
 *
 * Offline: pure JS via the tree-shaken `echarts-core` registry. No CDN/web-font
 * symbols, no URL-loaded map GeoJSON.
 */

import * as Comlink from "comlink";
import { echarts } from "@/platform/viz/echarts-core";
import type { EChartsOption } from "@/platform/viz/echarts-core";

type ChartInstance = ReturnType<typeof echarts.init>;

const charts = new Map<number, ChartInstance>();

const api = {
  /** Initialize a chart bound to a transferred OffscreenCanvas. */
  init(
    id: number,
    canvas: OffscreenCanvas,
    dpr: number,
    width: number,
    height: number,
    theme?: string,
  ): void {
    const chart = echarts.init(canvas as unknown as HTMLElement, theme ?? null, {
      renderer: "canvas",
      devicePixelRatio: dpr,
      width,
      height,
    });
    charts.set(id, chart);
  },

  /** Set/replace the option. `notMerge:true` fully replaces (removes stale series). */
  setOption(id: number, option: EChartsOption, notMerge = true): void {
    charts.get(id)?.setOption(option, { notMerge, lazyUpdate: true });
  },

  /** Convenience: init+setOption is the common `render` call. */
  render(
    id: number,
    canvas: OffscreenCanvas,
    option: EChartsOption,
    dpr: number,
    width: number,
    height: number,
    theme?: string,
  ): void {
    this.init(id, canvas, dpr, width, height, theme);
    this.setOption(id, option, true);
  },

  resize(id: number, width: number, height: number): void {
    charts.get(id)?.resize({ width, height });
  },

  // ── Pointer proxy (events fire on the main thread; forward coords) ──
  showTip(id: number, x: number, y: number): void {
    charts.get(id)?.dispatchAction({ type: "showTip", x, y });
  },
  hideTip(id: number): void {
    charts.get(id)?.dispatchAction({ type: "hideTip" });
  },

  /** PNG data URI from the live OffscreenCanvas instance (for export). */
  getDataURL(id: number, pixelRatio = 2, backgroundColor = "#ffffff"): string | undefined {
    return charts.get(id)?.getDataURL({ type: "png", pixelRatio, backgroundColor });
  },

  /**
   * Crisp vector SVG from a throwaway SSR instance (cannot getDataURL-as-svg
   * from a live canvas chart). Runs entirely in the worker — no DOM needed.
   */
  renderToSVGString(option: EChartsOption, width: number, height: number): string {
    const ssr = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
    try {
      ssr.setOption(option);
      return ssr.renderToSVGString();
    } finally {
      ssr.dispose();
    }
  },

  /** Off-screen PNG for a one-shot render (no persistent canvas), for export. */
  renderToPNGDataURL(
    option: EChartsOption,
    width: number,
    height: number,
    pixelRatio = 2,
    backgroundColor = "#ffffff",
  ): string {
    // ECharts canvas SSR needs a canvas factory; OffscreenCanvas is available
    // in the worker, so create one and init against it.
    const canvas = new OffscreenCanvas(width, height);
    const chart = echarts.init(canvas as unknown as HTMLElement, null, {
      renderer: "canvas",
      devicePixelRatio: pixelRatio,
      width,
      height,
    });
    try {
      chart.setOption(option);
      return chart.getDataURL({ type: "png", pixelRatio, backgroundColor });
    } finally {
      chart.dispose();
    }
  },

  dispose(id: number): void {
    charts.get(id)?.dispose();
    charts.delete(id);
  },
};

export type ChartWorkerApi = typeof api;

Comlink.expose(api);
