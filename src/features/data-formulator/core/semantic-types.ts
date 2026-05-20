"use client";

/**
 * Semantic Chart Engine — Auto-detect field semantics and recommend charts.
 * Inspired by Microsoft Data Formulator v0.7 semantic engine.
 */

import type { ColType, ColumnInfo } from "./types";

export type SemanticType = "temporal" | "categorical" | "quantitative" | "geographic" | "ordinal" | "identifier" | "text";

export interface SemanticField {
  name: string;
  colType: ColType;
  semanticType: SemanticType;
  cardinality?: number;
  uniqueRatio?: number;
  sampleValues?: unknown[];
}

export interface ChartTemplate {
  type: string;
  label: string;
  icon: string;
  category: "comparison" | "distribution" | "composition" | "relationship" | "trend" | "geographic" | "statistical";
  requiredChannels: Array<{ channel: string; semanticTypes: SemanticType[]; minCount: number; maxCount?: number }>;
  optionalChannels?: Array<{ channel: string; semanticTypes: SemanticType[] }>;
  score: number;
}

const CHART_TEMPLATES: ChartTemplate[] = [
  // Comparison
  { type: "bar", label: "Bar Chart", icon: "BarChart3", category: "comparison", requiredChannels: [{ channel: "x", semanticTypes: ["categorical", "ordinal", "temporal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 1.0 },
  { type: "groupedBar", label: "Grouped Bar", icon: "BarChart3", category: "comparison", requiredChannels: [{ channel: "x", semanticTypes: ["categorical", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }, { channel: "color", semanticTypes: ["categorical"], minCount: 1, maxCount: 1 }], score: 0.9 },
  { type: "stackedBar", label: "Stacked Bar", icon: "BarChart3", category: "composition", requiredChannels: [{ channel: "x", semanticTypes: ["categorical", "ordinal", "temporal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }, { channel: "color", semanticTypes: ["categorical"], minCount: 1, maxCount: 1 }], score: 0.85 },
  { type: "lollipop", label: "Lollipop Chart", icon: "Activity", category: "comparison", requiredChannels: [{ channel: "x", semanticTypes: ["categorical", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.7 },

  // Trend
  { type: "line", label: "Line Chart", icon: "TrendingUp", category: "trend", requiredChannels: [{ channel: "x", semanticTypes: ["temporal", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 1.0 },
  { type: "area", label: "Area Chart", icon: "TrendingUp", category: "trend", requiredChannels: [{ channel: "x", semanticTypes: ["temporal", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.85 },
  { type: "streamgraph", label: "Streamgraph", icon: "TrendingUp", category: "trend", requiredChannels: [{ channel: "x", semanticTypes: ["temporal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }, { channel: "color", semanticTypes: ["categorical"], minCount: 1, maxCount: 1 }], score: 0.7 },
  { type: "bump", label: "Bump Chart", icon: "TrendingUp", category: "trend", requiredChannels: [{ channel: "x", semanticTypes: ["temporal", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "color", semanticTypes: ["categorical"], minCount: 1, maxCount: 1 }], score: 0.6 },

  // Distribution
  { type: "histogram", label: "Histogram", icon: "BarChart3", category: "distribution", requiredChannels: [{ channel: "x", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.9 },
  { type: "boxplot", label: "Box Plot", icon: "BoxSelect", category: "distribution", requiredChannels: [{ channel: "x", semanticTypes: ["categorical"], minCount: 0, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.75 },
  { type: "density", label: "Density Plot", icon: "Activity", category: "distribution", requiredChannels: [{ channel: "x", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.7 },
  { type: "violin", label: "Violin Plot", icon: "Activity", category: "distribution", requiredChannels: [{ channel: "x", semanticTypes: ["categorical"], minCount: 0, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.65 },
  { type: "strip", label: "Strip Plot", icon: "Dot", category: "distribution", requiredChannels: [{ channel: "x", semanticTypes: ["categorical"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.6 },

  // Composition
  { type: "pie", label: "Pie Chart", icon: "PieChart", category: "composition", requiredChannels: [{ channel: "color", semanticTypes: ["categorical"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.8 },
  { type: "donut", label: "Donut Chart", icon: "Donut", category: "composition", requiredChannels: [{ channel: "color", semanticTypes: ["categorical"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.8 },
  { type: "treemap", label: "Treemap", icon: "LayoutGrid", category: "composition", requiredChannels: [{ channel: "color", semanticTypes: ["categorical"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.7 },
  { type: "sunburst", label: "Sunburst", icon: "Sun", category: "composition", requiredChannels: [{ channel: "color", semanticTypes: ["categorical"], minCount: 1, maxCount: 2 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.6 },

  // Relationship
  { type: "scatter", label: "Scatter Plot", icon: "ScatterChart", category: "relationship", requiredChannels: [{ channel: "x", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 1.0 },
  { type: "bubble", label: "Bubble Chart", icon: "ScatterChart", category: "relationship", requiredChannels: [{ channel: "x", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }, { channel: "size", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.85 },
  { type: "heatmap", label: "Heatmap", icon: "Grid3x3", category: "relationship", requiredChannels: [{ channel: "x", semanticTypes: ["categorical", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["categorical", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "color", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.85 },
  { type: "correlation", label: "Correlation Matrix", icon: "Grid3x3", category: "relationship", requiredChannels: [{ channel: "x", semanticTypes: ["quantitative"], minCount: 2, maxCount: 10 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 2, maxCount: 10 }], score: 0.7 },

  // Statistical
  { type: "radar", label: "Radar Chart", icon: "Radar", category: "statistical", requiredChannels: [{ channel: "x", semanticTypes: ["categorical"], minCount: 3, maxCount: 10 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.7 },
  { type: "candlestick", label: "Candlestick", icon: "CandlestickChart", category: "statistical", requiredChannels: [{ channel: "x", semanticTypes: ["temporal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 4, maxCount: 4 }], score: 0.6 },
  { type: "waterfall", label: "Waterfall", icon: "WaterfallChart", category: "statistical", requiredChannels: [{ channel: "x", semanticTypes: ["categorical", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.6 },
  { type: "funnel", label: "Funnel Chart", icon: "Filter", category: "statistical", requiredChannels: [{ channel: "x", semanticTypes: ["categorical", "ordinal"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.6 },

  // Geographic
  { type: "choropleth", label: "Choropleth Map", icon: "Map", category: "geographic", requiredChannels: [{ channel: "x", semanticTypes: ["geographic"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }], score: 0.8 },
  { type: "bubbleMap", label: "Bubble Map", icon: "Map", category: "geographic", requiredChannels: [{ channel: "x", semanticTypes: ["geographic"], minCount: 1, maxCount: 1 }, { channel: "y", semanticTypes: ["quantitative"], minCount: 1, maxCount: 1 }, { channel: "size", semanticTypes: ["quantitative"], minCount: 0, maxCount: 1 }], score: 0.7 },
];

export function inferSemanticType(col: ColumnInfo, sampleValues?: unknown[]): SemanticType {
  const name = col.name.toLowerCase();
  const type = col.type;

  // Geographic detection
  const geoPatterns = /^(lat|lng|lon|longitude|latitude|country|city|state|region|zip|postal|address|location|geo)$/;
  if (geoPatterns.test(name)) return "geographic";

  // Temporal detection
  const timePatterns = /^(date|time|year|month|day|hour|minute|second|timestamp|created|updated|at|on)$/;
  if (timePatterns.test(name) || type === "date") return "temporal";

  // Identifier detection
  const idPatterns = /^(id|uuid|guid|key|code|sku|ref|serial|index|_id)$/;
  if (idPatterns.test(name)) return "identifier";

  // Text detection
  if (type === "string") {
    if (sampleValues) {
      const avgLength = sampleValues.reduce((sum: number, v: unknown) => sum + String(v).length, 0) / sampleValues.length;
      if (avgLength > 50) return "text";
    }
    return "categorical";
  }

  // Quantitative
  if (type === "number") return "quantitative";
  if (type === "boolean") return "categorical";

  return "categorical";
}

export function analyzeFields(columns: ColumnInfo[], sampleData?: Record<string, unknown>[]): SemanticField[] {
  return columns.map((col) => {
    const sampleValues = sampleData?.map((row) => row[col.name]).filter((v) => v != null);
    const uniqueValues = new Set(sampleValues);
    const cardinality = uniqueValues.size;
    const uniqueRatio = sampleValues && sampleValues.length > 0 ? cardinality / sampleValues.length : 0;

    return {
      name: col.name,
      colType: col.type,
      semanticType: inferSemanticType(col, sampleValues),
      cardinality,
      uniqueRatio,
      sampleValues: sampleValues?.slice(0, 10),
    };
  });
}

export function recommendChartsSemantic(
  fields: SemanticField[],
  limit = 6,
): Array<{ template: ChartTemplate; score: number; matchedFields: Record<string, string[]> }> {
  const results: Array<{ template: ChartTemplate; score: number; matchedFields: Record<string, string[]> }> = [];

  for (const template of CHART_TEMPLATES) {
    let score = template.score;
    const matchedFields: Record<string, string[]> = {};
    let allRequiredMet = true;

    for (const req of template.requiredChannels) {
      const matches = fields
        .filter((f) => req.semanticTypes.includes(f.semanticType))
        .map((f) => f.name);

      matchedFields[req.channel] = matches;

      if (matches.length < req.minCount) {
        allRequiredMet = false;
        break;
      }
      if (req.maxCount && matches.length > req.maxCount) {
        score *= 0.9; // slight penalty for over-matching
      }
    }

    if (allRequiredMet) {
      // Boost score based on field quality
      for (const req of template.requiredChannels) {
        const matchNames = matchedFields[req.channel] ?? [];
        for (const name of matchNames) {
          const field = fields.find((f) => f.name === name);
          if (field?.uniqueRatio && field.uniqueRatio > 0.8 && req.channel !== "x") {
            score *= 0.7; // penalize high-cardinality fields on non-x channels
          }
        }
      }
      results.push({ template, score, matchedFields });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getCompatibleChannels(
  chartType: string,
  field: SemanticField,
): Array<{ channel: string; priority: number }> {
  const template = CHART_TEMPLATES.find((t) => t.type === chartType);
  if (!template) return [];

  const compatible: Array<{ channel: string; priority: number }> = [];

  for (const req of template.requiredChannels) {
    if (req.semanticTypes.includes(field.semanticType)) {
      compatible.push({ channel: req.channel, priority: 1 });
    }
  }

  for (const opt of template.optionalChannels ?? []) {
    if (opt.semanticTypes.includes(field.semanticType)) {
      compatible.push({ channel: opt.channel, priority: 2 });
    }
  }

  return compatible;
}

export { CHART_TEMPLATES };
