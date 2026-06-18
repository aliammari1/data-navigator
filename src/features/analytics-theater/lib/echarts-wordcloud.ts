"use client";

/**
 * echarts-wordcloud registration — the ONLY reliable pattern with a tree-shaken
 * core elsewhere in the app.
 *
 * `echarts-wordcloud@2.1.0` registers its `wordCloud` series via global
 * side-effects against the FULL echarts build (`echarts.registerLayout(...)`).
 * If we import it alongside the tree-shaken `echarts/core` instance, the series
 * lands on a DIFFERENT echarts object and the chart renders blank. So here — and
 * ONLY here — we import the full `echarts` namespace, then the extension, and
 * export that instance for the word-cloud chart to initialize against.
 *
 * This module is dynamically imported by `WordCloudScene` so the full-echarts
 * cost lands only in the word-cloud chunk, never the route's initial bundle.
 *
 * Offline: pure JS, no runtime assets, no CDN. `maskImage` is not used.
 */

import * as echarts from "echarts";
import "echarts-wordcloud";

export { echarts as echartsWordCloud };
