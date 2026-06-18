# Feature Plan — geo-analysis

**Maturity:** partial

## Performance issues

- Module-load side effects: generateNetworkData() and generateChannelMatrix() run at import time (lines 174, 189), executing Math.random() loops during the JS evaluation of the chunk and re-running on every HMR; data is non-deterministic across reloads.
- react-leaflet CircleMarker renders one React component per region (24 now, but unbounded for real data) — each marker is a DOM/SVG-ish overlay; Leaflet vector markers do not scale past a few thousand points and block the main thread; no clustering, no canvas renderer, no virtualization.
- No Web Worker / OffscreenCanvas anywhere in the feature. ForceGraph2D force simulation, ECharts heatmap render, and any future point projection all run on the renderer main thread.
- ForceGraph2D (react-force-graph-2d) ships a full d3-force + canvas bundle (~150-200kB) loaded for a sample of 35 nodes; the force layout tick loop runs unthrottled on the main thread.
- echarts-for-react is imported via a useEffect setState dance (lines 751-755) instead of next/dynamic, causing an extra render pass and a flash of 'Loading chart...'; ECharts core (~1MB) is pulled in for a single heatmap + pie, with no tree-shaken/custom build.
- heatmapOption builds inline label/tooltip formatter closures inside useMemo but the whole option object is recreated and the ECharts instance is not using progressive/large mode; fine at 10x8 but no path to scale.
- Leaflet CSS is loaded with a dynamic import().then(setState) (lines 220-224) gating the entire map behind a second async tick; combined with 4 separate dynamic() wrappers for react-leaflet submodules, first paint is delayed and the map double-mounts.
- Selected-region rank is recomputed by sorting the full array on every render inside JSX (lines 407-411) rather than memoized.
- No SQL pushdown: all aggregates (totals, averages, dominant channel, channel spread) are computed in JS over in-memory arrays instead of in DuckDB; will not scale to real datasets and re-runs on the main thread.
- No virtualization on the 'Dominant Channel per Region' list (lines 910-927) — fine at 10 rows, but the pattern is a full .map() with max-h + overflow, which will jank for hundreds of regions.

## Offline gaps

- CRITICAL: TileLayer fetches raster basemap tiles from the public internet — url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" (line 280). With no network the map renders blank gray tiles. This is a hard violation of the offline-only constraint and the single most important fix.
- No local basemap asset is bundled or cached: no .pmtiles archive in public/, no self-hosted glyphs (.pbf fontstacks) or sprites; nothing in OPFS/IndexedDB. Confirmed via find: public/ has no *.pmtiles / *.mbtiles / *tiles* / *.geojson.
- All data is hardcoded sample constants (TUNISIA_REGIONS, generateNetworkData, generateChannelMatrix) — the feature is not wired to the project's real DuckDB datasets at all, so it shows fake numbers regardless of imported data; no offline persistence of geo results.
- No region geometry/boundary source: only point lat/lon are present. A real choropleth needs polygon boundaries (governorate GeoJSON), which must be bundled locally, not fetched.
- Leaflet's default marker icon URLs (the well-known _getIconUrl bug) point at CDN/relative asset paths; even though CircleMarker avoids it here, any future Marker use would attempt network/asset fetches that fail offline.
- No geocoding/reverse-geocoding fallback: if real data has place names but no coordinates, there is no bundled local gazetteer to resolve them offline.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `maplibre-gl` | map-renderer | 10.8k | Very active; v5.18/5.19 Feb 2026, v6 prerelease in progress | BSD-3-Clause | yes | leaflet + react-leaflet + remote OSM TileLayer | Only mature token-free, fully-offline WebGL2 vector map renderer; replaces leaflet+OSM raster tiles. BYO local tiles/style. WebGL2 baseline matches the no-WebGPU constraint. | https://github.com/maplibre/maplibre-gl-js |
| `pmtiles` | tiles | 2.9k | Active; spec v3 | BSD-3-Clause (spec CC0) | yes | remote tile server / tile.openstreetmap.org | Single-file tile archive read via maplibregl.addProtocol; range reads from a bundled/OPFS file = zero tile server. The mechanism that makes the map work offline. | https://github.com/protomaps/PMTiles |
| `@protomaps/basemaps` | basemap-style | 678 | Active | BSD-3 / CC0 / ODbL (data) | yes | Mapbox/MapTiler hosted styles | Downloadable token-free basemap PMTiles + MapLibre style themes (light/dark/etc). Build the Tunisia/area extract once, self-host glyphs+sprites from basemaps-assets. | https://github.com/protomaps/basemaps |
| `deck.gl (@deck.gl/core,@deck.gl/layers,@deck.gl/mapbox)` | gpu-overlay | 14.2k | Very active; v9.3, MapLibre v5 globe support 2026 | MIT | yes | react-force-graph-2d (for geo arcs) + per-marker rendering | GPU overlay via MapboxOverlay({interleaved:true}) over MapLibre's WebGL2 context for 100k-1M+ point/arc/polygon layers with graceful fallback; ScatterplotLayer/ArcLayer/H3HexagonLayer cover all three current tabs. | https://github.com/visgl/deck.gl |
| `@geoarrow/deck.gl-layers` | gpu-overlay | 162 | Active; v0.4 | MIT | yes | JS-array deck.gl accessors | Zero-copy Arrow→GPU layers; feed DuckDB Arrow output straight into deck.gl for 3M-10M points without converting to JS arrays (biggest memory/perf win at scale). | https://github.com/geoarrow/deck.gl-layers |
| `supercluster` | clustering | 2.3k | Stable; v8.0.1 | ISC | yes | per-region CircleMarker rendering at scale | Zoom-reactive point clustering (millions of points in ms); run inside a Comlink Web Worker so projection/clustering never blocks the renderer. The correct UX for dense markers. | https://github.com/mapbox/supercluster |
| `h3-js` | spatial-index | 1.1k | Active; v4.4 | Apache-2.0 | yes | hand-rolled binning | Hexagonal spatial index for fixed-resolution density hexbins + spatial joins done in DuckDB/worker; pairs with deck.gl H3HexagonLayer for analytical density (complementary to clustering UX). | https://github.com/uber/h3-js |
| `tippecanoe (felt fork)` | build-time-cli | 1.5k | Active (Felt) | BSD-2-Clause | yes | cloud tiling services | Build-time CLI: GeoJSON/CSV/FlatGeobuf → MBTiles/PMTiles. Run in Electron main (or a build script) to tile user-imported geo data locally; never a runtime/cloud step. | https://github.com/felt/tippecanoe |
| `react-map-gl` | react-wrapper | 8.4k | Active (vis.gl) | MIT | yes | manual MapLibre lifecycle in useEffect | OPTIONAL declarative React wrapper for MapLibre + deck.gl useControl; keeps the map in React idioms (controlled viewState) without manual map.on() lifecycle. Use the maplibre entrypoint. | https://github.com/visgl/react-map-gl |
| `comlink` | worker-rpc | 12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | raw postMessage plumbing | ~1.1kB Proxy worker RPC to push supercluster/h3/projection into a Web Worker; already the project's worker-boundary standard. | https://github.com/GoogleChromeLabs/comlink |
| `apache-arrow` | data-interchange | 15k | Very active | Apache-2.0 | yes | manual JSON serialization of point arrays | Zero-copy columnar transport DuckDB→worker→deck.gl; the type backbone for GeoArrow layers and Arrow-native point streaming. | https://github.com/apache/arrow |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `tippecanoe` | cli | yes | Tile user/area GeoJSON→PMTiles at build time or in Electron main, fully offline. | https://github.com/felt/tippecanoe |
| `pmtiles CLI (go-pmtiles)` | cli | yes | Extract a bbox/region from a planet PMTiles, inspect, verify, and convert MBTiles↔PMTiles locally. | https://github.com/protomaps/go-pmtiles |
| `protomaps basemaps-assets` | service-local | yes | Downloadable glyphs (.pbf fontstacks) + sprites ZIP to self-host for MapLibre text/icons offline. | https://github.com/protomaps/basemaps |
| `DuckDB spatial extension` | library | yes | ST_* functions, GeoJSON/Shapefile/FlatGeobuf read, H3, and Arrow output — do geo aggregation in SQL in Electron main; bundle the extension for offline INSTALL. | https://github.com/duckdb/duckdb_spatial |
| `@next/bundle-analyzer + sonda` | cli | yes | Verify maplibre/deck.gl land in a lazy route chunk and not the shared bundle; treemap offline. | https://github.com/filipsobol/sonda |
| `size-limit (@size-limit/preset-app + time)` | cli | yes | Per-route byte+parse-time budget for the geo route and the geo worker; gate in CI offline. | https://github.com/ai/size-limit |
| `wasm-opt (binaryen)` | cli | yes | Shrink/SIMD-optimize any vendored .wasm (e.g. h3 wasm path) at build time. | https://github.com/WebAssembly/binaryen |

---

# Geo-Analysis — Deep Improvement Plan

> Feature: **Geospatial analysis / maps** for `data-navigator` (Next.js 16 + Electron, fully on-device).
> Scope files: `src/features/geo-analysis/screens/GeoAnalysisScreen.tsx` (the entire feature, ~990 lines) and `src/app/dashboard/geo-analysis/page.tsx` (thin 7-line wrapper).
>
> **Headline finding:** the map is *not offline*. `TileLayer` at `GeoAnalysisScreen.tsx:280` fetches raster basemap tiles from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. With no runtime internet the basemap renders blank. Everything else (data, network graph, heatmap) is hardcoded sample data disconnected from the project's real DuckDB datasets. This plan fixes the offline gap first, then re-platforms the map onto MapLibre GL + PMTiles + deck.gl so it scales to real point counts on a medium-end PC with no WebGPU.

---

## 1. Current implementation

The feature is a single client component file with three tabs, all driven by **module-level hardcoded sample data**.

### 1.1 File map

| Path | Role |
|---|---|
| `src/app/dashboard/geo-analysis/page.tsx` | `"use client"` wrapper; renders `<GeoAnalysisScreen/>`. |
| `src/features/geo-analysis/screens/GeoAnalysisScreen.tsx` | All logic. 3 tabs: `TunisiaMapTab`, `NetworkGraphTab`, `ChannelDistributionTab`. |

### 1.2 Tab 1 — `TunisiaMapTab` (lines 215–431)

- **Map engine:** Leaflet via `react-leaflet`, all dynamically imported with `ssr:false` (`MapContainer`, `TileLayer`, `CircleMarker`, `Popup`, lines 15–30).
- **Basemap:** remote OSM raster (`tile.openstreetmap.org`) — **the offline break**.
- **Data:** `TUNISIA_REGIONS` — 24 hardcoded governorate points with `transactions/revenue/successRate` (lines 68–93).
- **Markers:** one `<CircleMarker>` per region (lines 282–325); radius `= sqrt(transactions)/3`; color from `successRateToColor`.
- **Interaction:** click → `setSelectedRegion`; a 256px side panel shows stats + a JS-sorted "Region Rank" computed inline in JSX (lines 407–411).
- **CSS load:** `import("leaflet/dist/leaflet.css").then(() => setLeafletLoaded(true))` (lines 220–224) — gates the whole map behind a second async tick.

### 1.3 Tab 2 — `NetworkGraphTab` (lines 438–743)

- **Engine:** `react-force-graph-2d` (canvas + d3-force), dynamic `ssr:false` (line 12).
- **Data:** `NETWORK_DATA = generateNetworkData()` executed **at module load** (line 174) using `Math.random()` — non-deterministic, regenerated on every reload/HMR.
- 35 nodes (10 channels, 5 brands, 20 accounts) + random links. Filter (all/channels/accounts), size mode (volume/successRate), click-to-highlight neighbors.
- This is a *network* graph, not geospatial — it shares the route but is conceptually a separate feature.

### 1.4 Tab 3 — `ChannelDistributionTab` (lines 747–955)

- **Engine:** `echarts-for-react`, loaded via `useEffect` + `setState` (lines 751–755) instead of `next/dynamic`.
- **Data:** `CHANNEL_MATRIX = generateChannelMatrix()` at module load (line 189) — 10 regions × 8 channels of random %.
- Heatmap (lines 776–827) + per-region donut pie (lines 830–848) + dominant-channel list (lines 910–927).

### 1.5 Infra context (how the rest of the app works)

- DuckDB is the data engine. `src/core/queries/duckdb.ts` exposes `useDuckDBQuery(sql)` → `runReadOnlyQuery` from `src/platform/duckdb/duckdb`. Datasets are registered as views (`listRegisteredDatasets`).
- Workers exist in the codebase (`src/workers/ml.worker.ts`) and Comlink is already a dependency — but **geo-analysis uses none of this**. It bypasses DuckDB entirely and computes everything in JS over hardcoded arrays.
- `find public -iname '*.pmtiles' …` → **nothing**. No bundled tiles, glyphs, sprites, or boundary GeoJSON.

---

## 2. Performance bottlenecks & exact fixes

### 2.1 Module-load side effects (correctness + perf)

`generateNetworkData()` (line 174) and `generateChannelMatrix()` (line 189) run during module evaluation. Every route visit / HMR re-randomizes the data, and the work happens synchronously while the chunk parses.

**Fix:** move generation behind `useMemo`/a query, seed deterministically, or (better) source from DuckDB. Minimal interim fix:

```ts
// deterministic seed so reloads are stable and demos are reproducible
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// inside the component:
const rng = useMemo(() => mulberry32(42), []);
const networkData = useMemo(() => generateNetworkData(rng), [rng]);
```

### 2.2 Leaflet markers do not scale; no clustering / canvas

`react-leaflet` renders one React+SVG `CircleMarker` per point. Fine at 24, catastrophic at real telecom point counts (10k–1M). There is no canvas renderer, no clustering, no virtualization.

**Fix (architecture):** replace Leaflet with **MapLibre GL (WebGL2) + deck.gl overlay**. Render points as a single GPU `ScatterplotLayer`/`H3HexagonLayer`. For dense raw points, cluster in a **Web Worker via supercluster** and only hand the visible, clustered set to the GPU. See §4.

### 2.3 Everything on the main thread

Force simulation, ECharts render, and any future point projection all run on the renderer main thread. There is no `OffscreenCanvas`/Worker usage in the feature.

**Fix:** (a) clustering/projection → Comlink worker (§4.4); (b) ECharts heatmap → `OffscreenCanvas` worker rendering (ECharts supports it) when the matrix grows; (c) keep deck.gl on GPU.

### 2.4 ForceGraph2D weight for 35 nodes

`react-force-graph-2d` pulls d3-force + a canvas renderer (~150–200kB) for a 35-node sample, and ticks the layout unthrottled.

**Fix:** if the network graph stays, cap `cooldownTicks`/`warmupTicks` and `d3VelocityDecay`, freeze after stabilization (`onEngineStop` → `pauseAnimation()`), and lazy-load only when the tab is active. If the relationships are geographic (account→region flows), prefer a deck.gl `ArcLayer` on the map instead of a separate force graph.

```tsx
<ForceGraph2D
  cooldownTicks={80}
  warmupTicks={20}
  d3VelocityDecay={0.4}
  onEngineStop={() => graphRef.current?.pauseAnimation?.()}
  /* ...existing props... */
/>
```

### 2.5 ECharts loaded via useEffect+setState (lines 751–755)

This causes an extra render and a "Loading chart..." flash, and ships full ECharts (~1MB) for one heatmap + pie.

**Fix:** use `next/dynamic` and a tree-shaken custom ECharts build:

```tsx
const ReactECharts = dynamic(() => import("echarts-for-react/lib/core"), { ssr: false });
// echarts-core.ts
import * as echarts from "echarts/core";
import { HeatmapChart, PieChart } from "echarts/charts";
import { TooltipComponent, VisualMapComponent, GridComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([HeatmapChart, PieChart, TooltipComponent, VisualMapComponent, GridComponent, LegendComponent, CanvasRenderer]);
export default echarts;
```

This drops ECharts from ~1MB to ~250–350kB for this route.

### 2.6 SQL pushdown — stop computing aggregates in JS

Totals (lines 226–233), dominant channel (lines 758–765), channel spread (lines 768–774), and rank (lines 407–411) are JS reductions over arrays. They re-run on the main thread and will not scale.

**Fix:** push all aggregation into DuckDB and let the component consume tidy result rows.

```sql
-- per-region rollup, computed in DuckDB (native, off main thread)
SELECT region, lat, lon,
       count(*)                         AS transactions,
       sum(amount)                      AS revenue,
       avg(CASE WHEN status='OK' THEN 1.0 ELSE 0 END)*100 AS success_rate
FROM   txns
GROUP  BY region, lat, lon
ORDER  BY transactions DESC;
```

```ts
const { data: regions = [] } = useDuckDBQuery(REGION_ROLLUP_SQL);
```

Rank becomes `index` in the already-sorted result; no per-render sort.

### 2.7 Memoization / inline closures

- Region rank sort in JSX (lines 407–411) → derive once from sorted query result.
- `heatmapEvents`/formatters are memoized already; keep that pattern but move the `data` flattening (lines 777–782) to a worker or SQL `PIVOT` if the matrix grows large.

### 2.8 List virtualization

The dominant-channel list (lines 910–927) is a plain `.map()` with `max-h + overflow`. At 24 regions for Tunisia data, fine. For arbitrary datasets (hundreds of regions), wrap in `@tanstack/react-virtual` (already a project dep).

---

## 3. Offline gaps & how to close them

| Gap | Where | Fix |
|---|---|---|
| Remote raster basemap | `:280` `tile.openstreetmap.org` | Replace with MapLibre + **local PMTiles** via `addProtocol('pmtiles', …)`. §4.1–4.2. |
| No bundled tiles | `public/` empty of `*.pmtiles` | Build a Tunisia (or world-low-zoom) PMTiles extract once with `go-pmtiles`/`tippecanoe`, ship in `public/maps/` or stream from OPFS. §6. |
| No glyphs/sprites | none | Download Protomaps `basemaps-assets` (fonts `.pbf` + sprites) into `public/maps/{fonts,sprites}` and point the style at relative URLs. §4.3. |
| No boundary geometry | only points | Bundle governorate polygons GeoJSON for choropleth; convert to PMTiles for large geographies. |
| Fake data | hardcoded constants | Wire to DuckDB datasets via `useDuckDBQuery`. §2.6. |
| Leaflet default icon CDN fetch | latent | N/A after Leaflet removal; if kept, set `L.Icon.Default` paths to bundled assets. |
| No offline result persistence | none | Cache rollups in React Query (already configured) + optionally OPFS for tiled user data. |

**Cross-origin isolation note:** Electron can set `COOP: same-origin` + `COEP: require-corp` on its custom protocol unconditionally (`electron/main.ts`), enabling SharedArrayBuffer for any threaded WASM (h3/duckdb-wasm fallback). MapLibre + deck.gl do **not** require COI, so the map works regardless; only threaded worker paths benefit.

---

## 4. Better architecture & implementation (step-by-step, code-heavy)

Target stack (all offline, WebGL2 baseline, no WebGPU required):

```
MapLibre GL JS (renderer, WebGL2)
  └─ pmtiles addProtocol  →  /maps/basemap.pmtiles      (bundled or OPFS)
  └─ style.json           →  glyphs:/maps/fonts/{fontstack}/{range}.pbf
                             sprite:/maps/sprites/light
  └─ MapboxOverlay({interleaved:true})  →  deck.gl layers
        ├─ ScatterplotLayer / GeoArrow ScatterplotLayer  (points, from DuckDB Arrow)
        ├─ H3HexagonLayer                                 (density hexbins)
        └─ ArcLayer                                       (flows, replaces force graph for geo)
Web Worker (Comlink)
  └─ supercluster (zoom-reactive clustering)
  └─ h3-js binning (analytical)
DuckDB (Electron main, native + spatial ext)
  └─ ST_* aggregation, GeoJSON/FGB read, Arrow output
```

### 4.1 Install MapLibre protocol once (module singleton)

```ts
// src/features/geo-analysis/lib/pmtiles-protocol.ts
import maplibregl from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";

let installed = false;
export function ensurePmtilesProtocol() {
  if (installed) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  // basemap bundled under public/maps; in Electron served from the app protocol
  const p = new PMTiles("pmtiles:///maps/basemap.pmtiles");
  protocol.add(p);
  installed = true;
}
```

For very large basemaps, read the PMTiles from **OPFS** instead of `public/` so it isn't part of the app bundle (range reads via a `FileSystemFileHandle`-backed source).

### 4.2 The map component (react-map-gl/maplibre wrapper)

```tsx
// src/features/geo-analysis/components/GeoMap.tsx
"use client";
import { useMemo, useRef } from "react";
import Map, { useControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import { ensurePmtilesProtocol } from "../lib/pmtiles-protocol";
import baseStyle from "../lib/local-style.json"; // self-hosted glyphs+sprites

ensurePmtilesProtocol();

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

export interface RegionPoint { name: string; lon: number; lat: number; transactions: number; successRate: number; }

export function GeoMap({ regions, onSelect }: { regions: RegionPoint[]; onSelect: (r: RegionPoint) => void }) {
  const layers = useMemo(() => [
    new ScatterplotLayer<RegionPoint>({
      id: "regions",
      data: regions,
      pickable: true,
      radiusUnits: "pixels",
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => Math.max(4, Math.sqrt(d.transactions) / 6),
      getFillColor: (d) => successColorRGBA(d.successRate),
      onClick: ({ object }) => object && onSelect(object),
      updateTriggers: { getFillColor: regions, getRadius: regions },
    }),
  ], [regions, onSelect]);

  return (
    <Map
      initialViewState={{ longitude: 9.5375, latitude: 33.8869, zoom: 6.2 }}
      mapStyle={baseStyle as maplibregl.StyleSpecification}
      style={{ height: 500, width: "100%" }}
      RTLTextPlugin={false}
    >
      <DeckOverlay interleaved layers={layers} />
    </Map>
  );
}

function successColorRGBA(rate: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, (rate - 70) / 30));
  // red→green via HSL→RGB (hue 0..120)
  const [r, g, b] = hslToRgb(t * 120, 0.7, 0.5);
  return [r, g, b, 200];
}
```

`local-style.json` must use **relative** asset URLs so nothing hits the network:

```json
{
  "version": 8,
  "glyphs": "/maps/fonts/{fontstack}/{range}.pbf",
  "sprite": "/maps/sprites/light",
  "sources": { "protomaps": { "type": "vector", "url": "pmtiles:///maps/basemap.pmtiles" } },
  "layers": [ /* protomaps style layers, themed */ ]
}
```

### 4.3 Self-host glyphs & sprites (the easily-missed offline trap)

MapLibre fetches `glyphs` and `sprite` at runtime. Download Protomaps `basemaps-assets` (fonts `.pbf` fontstacks + sprite `.png`/`.json`) into:

```
public/maps/fonts/<FontStack>/<range>.pbf
public/maps/sprites/light.json
public/maps/sprites/light.png
public/maps/basemap.pmtiles
```

Verify zero network with DevTools "Offline" + check that no request leaves `app://`/`localhost`.

### 4.4 Clustering in a Web Worker (Comlink)

```ts
// src/features/geo-analysis/workers/cluster.worker.ts
import { expose } from "comlink";
import Supercluster from "supercluster";

let index: Supercluster | null = null;

const api = {
  load(points: GeoJSON.Feature[]) {
    index = new Supercluster({ radius: 60, maxZoom: 14 }).load(points as any);
  },
  getClusters(bbox: [number, number, number, number], zoom: number) {
    return index!.getClusters(bbox, Math.round(zoom));
  },
};
export type ClusterApi = typeof api;
expose(api);
```

```ts
// hook
import { wrap } from "comlink";
const worker = new Worker(new URL("../workers/cluster.worker.ts", import.meta.url), { type: "module" });
const cluster = wrap<ClusterApi>(worker);
// on viewport change (debounced via map 'moveend'):
const clusters = await cluster.getClusters(map.getBounds().toArray().flat() as any, map.getZoom());
// feed clusters to a deck.gl ScatterplotLayer (small N → GPU-cheap)
```

### 4.5 Density via H3 (analytical) + GeoArrow at scale

```ts
// build hexbins in DuckDB (spatial+h3) then feed H3HexagonLayer
// SELECT h3_latlng_to_cell(lat, lon, 6) AS h3, count(*) AS n FROM txns GROUP BY 1;
import { H3HexagonLayer } from "@deck.gl/geo-layers";
new H3HexagonLayer({ id: "density", data: hexRows, getHexagon: d => d.h3,
  getFillColor: d => rampColor(d.n), extruded: false, pickable: true });
```

For **1M+ raw points**, never pass JS arrays. Stream DuckDB Arrow into `@geoarrow/deck.gl-layers`:

```ts
import { GeoArrowScatterplotLayer } from "@geoarrow/deck.gl-layers";
import * as arrow from "apache-arrow";
const table = arrow.tableFromIPC(arrowBytesFromDuckDB); // geometry as GeoArrow point column
new GeoArrowScatterplotLayer({ id: "pts", data: table,
  getPosition: table.getChild("geometry")!, getRadius: 2, radiusUnits: "pixels" });
```

### 4.6 Wiring real data (replace hardcoded constants)

```ts
// src/features/geo-analysis/hooks/use-geo-rollup.ts
import { useDuckDBQuery } from "@/core/queries/duckdb";

const SQL = /* sql */`
  SELECT region AS name, any_value(lat) AS lat, any_value(lon) AS lon,
         count(*) AS transactions, sum(amount) AS revenue,
         avg(CASE WHEN status='OK' THEN 1.0 ELSE 0 END)*100 AS "successRate"
  FROM   txns
  GROUP  BY region
  ORDER  BY transactions DESC`;

export function useGeoRollup(enabled: boolean) {
  return useDuckDBQuery(SQL, undefined, { enabled, staleTime: 60_000 });
}
```

The Tunisia sample stays as a **fallback** when no dataset has lat/lon columns (graceful demo), gated behind a "no geo columns detected" empty state.

### 4.7 deck.gl ArcLayer replaces the force graph for *geographic* flows

If account→region or channel→region relationships are the point, draw them as arcs on the map (origin/dest lon-lat) instead of a placeless force graph — fewer deps, GPU-rendered, and spatially meaningful:

```ts
new ArcLayer({ id: "flows", data: flows,
  getSourcePosition: d => d.from, getTargetPosition: d => d.to,
  getSourceColor: [59,130,246], getTargetColor: [168,85,247],
  getWidth: d => Math.max(1, Math.sqrt(d.count)/8) });
```

Keep the force graph only if the network is genuinely non-geographic; if so, lazy-load it per-tab and consider moving it out of "geo-analysis" into its own route.

---

## 5. Recommended dependencies

(See structured `dependencies` for the full table with stars/maintenance/license/URLs.) Summary of the Adopt set for this feature, all offline + WebGL2 baseline:

- **maplibre-gl** (10.8k, BSD-3, v5.18/5.19 Feb 2026) — token-free offline WebGL2 vector renderer; replaces leaflet + remote OSM raster.
- **pmtiles** (2.9k, BSD-3) — single-file tile archive via `addProtocol`; the offline mechanism.
- **@protomaps/basemaps** (678, BSD-3/CC0/ODbL) — downloadable basemap PMTiles + styles; self-host glyphs/sprites.
- **deck.gl** + **@deck.gl/mapbox** (14.2k, MIT, v9.3) — `MapboxOverlay({interleaved:true})` GPU layers over MapLibre WebGL2; ScatterplotLayer/H3HexagonLayer/ArcLayer.
- **@geoarrow/deck.gl-layers** (162, MIT) — zero-copy Arrow→GPU for 1M+ points from DuckDB.
- **supercluster** (2.3k, ISC) — worker-side zoom-reactive clustering.
- **h3-js** (1.1k, Apache-2.0) — analytical hexbin density / spatial joins.
- **comlink** (12.6k, Apache-2.0) — already present; worker RPC for clustering/binning.
- **apache-arrow** (15k, Apache-2.0) — columnar transport; consider **flechette** (~14kB) for a lighter renderer reader.
- **react-map-gl** (8.4k, MIT) — optional declarative React wrapper.

**Removed:** `leaflet`, `react-leaflet`, `@types/leaflet` (replaced by MapLibre). `react-force-graph-2d` retained only if a true non-geo network view survives.

**Why not WebGPU / @mlc-style GPU-required libs:** deck.gl runs on WebGL2 with auto fallback to compat mode on iGPU/Linux — exactly the medium-end target. No WebGPU dependency anywhere in this stack.

---

## 6. CLIs & tools (offline build/verify)

| Tool | Use |
|---|---|
| **go-pmtiles** (`pmtiles extract`) | Carve a Tunisia/region bbox out of a planet PMTiles into a small bundled archive: `pmtiles extract planet.pmtiles tunisia.pmtiles --bbox=7.5,30.2,11.6,37.5`. |
| **tippecanoe** (Felt) | Tile user-imported GeoJSON/CSV/FGB → PMTiles at build time or in Electron main: `tippecanoe -o user.pmtiles -zg --drop-densest-as-needed input.geojson`. |
| **Protomaps basemaps-assets** | Download glyphs (`.pbf` fontstacks) + sprites ZIP; unzip into `public/maps/{fonts,sprites}`. |
| **DuckDB spatial extension** | `INSTALL spatial; LOAD spatial;` (bundle the extension for offline). ST_* aggregation, GeoJSON/Shapefile/FGB read, H3, Arrow output in Electron main. |
| **@next/bundle-analyzer + sonda** | Confirm maplibre/deck.gl land in the lazy geo-route chunk, not the shared bundle. |
| **size-limit (preset-app + time)** | Per-route + per-worker byte/parse budgets; CI-gate the geo route and `cluster.worker`. |
| **wasm-opt (binaryen)** | Shrink/SIMD any vendored wasm (h3 wasm path) at build. |
| **Playwright + DevTools offline** | Automated verification that the map renders with the network forced offline (assert zero non-`app://` requests). |

---

## 7. Phased task list

### P1 — Make it actually offline + correct (must-ship)
1. **Replace remote OSM TileLayer.** Remove leaflet/react-leaflet; add maplibre-gl + pmtiles. Implement `ensurePmtilesProtocol()` (§4.1) and `GeoMap.tsx` (§4.2).
2. **Bundle local assets.** Build `tunisia.pmtiles` (go-pmtiles), download Protomaps glyphs+sprites, place under `public/maps/`, author `local-style.json` with relative URLs (§4.3).
3. **Verify offline.** DevTools/Playwright offline run: map paints, labels render, zero external requests.
4. **Kill module-load randomness.** Move `generateNetworkData`/`generateChannelMatrix` behind `useMemo` with a seeded RNG (§2.1) so the demo is deterministic until real data lands.
5. **Lazy-load ECharts via `next/dynamic` + tree-shaken core** (§2.5); remove the useEffect+setState loader.

### P2 — Wire real data + scale points
6. **DuckDB rollups** (`useGeoRollup`, §4.6); render real region aggregates; keep Tunisia sample as a fallback empty-state.
7. **deck.gl ScatterplotLayer** for points (already in `GeoMap`); add **H3HexagonLayer** density toggle backed by a DuckDB H3 group-by (§4.5).
8. **Worker clustering** with supercluster + Comlink for raw-point datasets (§4.4); debounce on `moveend`.
9. **ArcLayer flows** option to represent account/channel→region relationships on the map (§4.7); decide whether the force graph stays or moves to its own route.
10. **Memoize rank/aggregates**; virtualize the dominant-channel list with `@tanstack/react-virtual`.

### P3 — Scale + polish
11. **GeoArrow zero-copy path** for 1M+ points (`@geoarrow/deck.gl-layers`, DuckDB Arrow IPC) (§4.5).
12. **OPFS-hosted PMTiles** for large basemaps + user-tiled data via in-Electron tippecanoe; range-read from OPFS instead of bundling.
13. **OffscreenCanvas ECharts** worker rendering for large heatmaps; progressive/large mode.
14. **Choropleth** layer from bundled governorate polygons (PMTiles) with `getFillColor` by metric.
15. **Perf budgets** wired into CI (size-limit per-route + per-worker); bundle-analyzer/sonda check; wasm-opt on any vendored wasm.

---

## 8. Risks & notes

- **leaflet→maplibre is a real rewrite** of Tab 1, not a swap; isolate behind `GeoMap.tsx` so the surrounding panel/stats UI is reused unchanged.
- **PMTiles size budget:** a country extract is small (single-digit MB); a world basemap at low zoom is tens of MB — host in OPFS, not the JS bundle, to keep route chunks lean.
- **@geoarrow/deck.gl-layers (162★)** is the only niche dep; justified because it's the sole zero-copy Arrow→GPU path and is maintained by the GeoArrow org alongside deck.gl v9. Gate it behind the P3 large-data flag; the plain `ScatterplotLayer` path covers P1/P2.
- **deck.gl bundle:** import only `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/geo-layers`, `@deck.gl/mapbox` (scoped) to avoid pulling the whole monorepo aggregate.
- Keep the **Network graph** decision explicit: it is not geospatial and inflates this route's bundle; strongly consider relocating it.