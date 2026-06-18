"use client";

/**
 * Offline theater export: PPTX / PDF, one slide/section per scene, with a real
 * chart image per scene (rasterized off the main thread via the chart worker —
 * NEVER a DOM screenshot) and the scene narration as the section body.
 *
 * Flow: for each scene we run its DuckDB SQL once (read-only), build the same
 * pure ECharts option the live scene uses, render it to an SVG string in the
 * chart worker, then hand the assembled `ReportDocument` to the shared export
 * worker (`getExportProxy().pptx/pdf`) and save through `saveBytes`. All heavy
 * work (DuckDB, chart raster, document build) is off the React render path.
 */

import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { getChartProxy, getExportProxy, saveBytes } from "@/platform/viz";
import type { ChartImage, ReportDocument, TableSection } from "@/workers/export-types";
import type { ColumnRoles } from "./columns";
import {
  buildCalendarOption,
  buildGanttOption,
  buildRaceFinalOption,
  buildSankeyOption,
  buildSunburstOption,
} from "./option-builders";
import {
  buildCalendarSql,
  buildGanttSql,
  buildRaceSql,
  buildSankeySql,
  buildSunburstSql,
  buildWordCloudSql,
  asNum,
  asStr,
} from "./queries";
import type { TheaterScene } from "../model/scene";

const CHART_W = 1280;
const CHART_H = 720;

type Rows = Record<string, unknown>[];

async function runSql(sql: string | null): Promise<Rows> {
  if (!sql) return [];
  try {
    return (await runReadOnlyQuery(sql)) as Rows;
  } catch {
    return [];
  }
}

/** Render an ECharts option to a crisp SVG string in the chart worker. */
async function optionToSvg(option: Record<string, unknown>): Promise<string | null> {
  const proxy = getChartProxy();
  if (!proxy) return null;
  try {
    return await proxy.renderToSVGString(
      option as Parameters<typeof proxy.renderToSVGString>[0],
      CHART_W,
      CHART_H,
    );
  } catch {
    return null;
  }
}

/** Build one report section (chart + narration) for a single scene. */
async function buildSceneSection(
  scene: TheaterScene,
  view: string,
  roles: ColumnRoles,
): Promise<{ section: TableSection; chart: ChartImage | null }> {
  const narrationRow: TableSection = {
    title: scene.title,
    headers: ["Narration"],
    rows: [[scene.narration || "—"]],
  };

  let option: Record<string, unknown> | null = null;
  let extraRows: (string | number)[][] = [];

  switch (scene.kind) {
    case "calendar": {
      const built = buildCalendarSql(view, roles);
      const rows = await runSql(built?.sql ?? null);
      const year = Number(asStr(rows.at(-1)?.d).slice(0, 4)) || new Date().getFullYear();
      option = buildCalendarOption(rows, year).option;
      break;
    }
    case "race": {
      const built = buildRaceSql(view, roles);
      const rows = await runSql(built?.sql ?? null);
      option = buildRaceFinalOption(rows);
      break;
    }
    case "sankey": {
      const built = buildSankeySql(view, roles);
      const rows = await runSql(built?.sql ?? null);
      option = buildSankeyOption(rows).option;
      break;
    }
    case "gantt": {
      const built = buildGanttSql(view, roles);
      const rows = await runSql(built?.sql ?? null);
      option = buildGanttOption(rows).option;
      break;
    }
    case "sunburst": {
      const built = buildSunburstSql(view, roles);
      const rows = await runSql(built?.sql ?? null);
      option = buildSunburstOption(rows);
      break;
    }
    case "wordcloud": {
      // No pure echarts-core word-cloud series — surface the top tokens as a
      // table instead of a rasterized chart.
      const built = buildWordCloudSql(view, roles);
      const rows = await runSql(built?.sql ?? null);
      extraRows = rows
        .slice(0, 20)
        .map((r) => [asStr(r.word), asNum(r.count)]);
      break;
    }
  }

  const svg = option ? await optionToSvg(option) : null;
  const chart: ChartImage | null = svg
    ? { svg, width: CHART_W, height: CHART_H }
    : null;

  const section: TableSection =
    extraRows.length > 0
      ? {
          title: scene.title,
          headers: ["Token", "Count"],
          rows: [...extraRows],
        }
      : narrationRow;

  // Keep narration on its own line even for the wordcloud table section.
  if (extraRows.length > 0 && scene.narration) {
    section.rows.unshift([scene.narration, ""]);
  }

  return { section, chart };
}

export interface ExportTheaterArgs {
  name: string;
  scenes: TheaterScene[];
  view: string;
  roles: ColumnRoles;
  kind: "pptx" | "pdf";
}

/**
 * Build and save the theater as a PPTX deck or PDF report. Returns the save
 * result (or throws on a hard failure the caller can surface).
 */
export async function exportTheater(args: ExportTheaterArgs): Promise<{ saved: boolean; path?: string }> {
  const sections: TableSection[] = [];
  const charts: ChartImage[] = [];

  for (const scene of args.scenes) {
    const { section, chart } = await buildSceneSection(scene, args.view, args.roles);
    sections.push(section);
    if (chart) charts.push(chart);
  }

  const doc: ReportDocument = {
    title: args.name || "Analytics Theater",
    subtitle: `${args.scenes.length} scenes · generated offline`,
    sections,
    charts,
    includeCharts: charts.length > 0,
    paperSize: "a4",
  };

  const proxy = getExportProxy();
  if (!proxy) {
    throw new Error("Export worker is unavailable in this environment.");
  }

  const bytes =
    args.kind === "pptx" ? await proxy.pptx(doc) : await proxy.pdf(doc);
  const fileName = `${(args.name || "analytics-theater").replace(/[^\w.-]+/g, "_")}.${args.kind}`;
  return saveBytes(bytes, fileName, args.kind);
}
