# Tech Radar Brief — Offline geospatial mapping for data-navigator (MapLibre + PMTiles + deck.gl + clustering) on medium-end PCs

## Key findings

- MapLibre GL JS (10.8k stars, BSD-3, v5.24 Apr 2026) is the only mature, token-free, fully offline WebGL vector renderer. It is the correct base map engine: bring your own tiles, no provider lock-in, runs in Electron with zero network. WebGPU is on the roadmap but the stable WebGL2 path is what you ship today, which is exactly right for integrated-GPU medium-end PCs.
- PMTiles (protomaps/PMTiles, 2.9k stars, BSD-3 + CC0 spec, v3) is the offline-tile cornerstone: one static file, any tile fetched in at most two range reads, no tile server. The `pmtiles` npm package registers a MapLibre `addProtocol('pmtiles', ...)` handler. For Electron you serve the .pmtiles via a custom `protocol.handle` / file Range reads, or use OPFS in the renderer.
- Protomaps Basemaps (protomaps/basemaps, 678 stars, BSD-3 code / CC0 styles / ODbL tiles) gives you a downloadable planet.pmtiles (~110-130GB planet, or tiny region extracts like monaco.pmtiles a few MB) plus a `@protomaps/basemaps` styles npm package producing token-free MapLibre styles in multiple themes. This is the no-token offline basemap. You MUST self-host glyphs (fonts .pbf) and sprites locally - the style references them and MapLibre fetches them at runtime.
- deck.gl (visgl/deck.gl, 14.2k stars, MIT, v9.3 Jun 2026) is the right GPU overlay for large point sets. ScatterplotLayer renders ~1M points at 60fps and up to ~10M with small radii on a decent GPU; on integrated GPUs budget ~100k-500k for smooth interaction and aggregate beyond that. Critically deck.gl v9 is WebGL2-first with WebGPU still not production-ready, matching your no-WebGPU constraint. Integrate via `MapboxOverlay({interleaved:true})` sharing MapLibre's WebGL2 context.
- For million-plus points, do NOT pass plain JS arrays. Use binary attributes or @geoarrow/deck.gl-layers (162 stars, MIT, v0.4 May 2026) to copy Apache Arrow buffers zero-copy to the GPU. This pairs perfectly with an Arrow/columnar/OPFS pipeline (DuckDB-WASM, which this repo already uses) and is the single biggest perf and memory win on medium-end hardware. 3.2M-10M points demonstrated.
- Clustering: supercluster (mapbox/supercluster, 2.3k stars, ISC, v8.0.1 from 2023 - stable but quiet) clusters millions of points in milliseconds and is the proven choice for marker/aggregate clustering; run it in a Web Worker to keep the main thread free. h3-js (uber/h3-js, 1.1k stars, Apache-2.0, v4.4 Dec 2025, WASM/emscripten) is for fixed hexbin aggregation/joins, not zoom-reactive clustering. Use supercluster for clustering UX, h3 for analytical hexbin density. They are complementary, not competitors.
- Tile generation is an offline build step (not runtime): felt/tippecanoe (1.5k stars, BSD-2, actively maintained by Felt, releases through Jul 2025) turns your GeoJSON/CSV/FlatGeobuf into MBTiles/PMTiles. Ship it as a dev/Electron-main CLI so users can tile their own uploaded datasets locally with no cloud. Combine with `pmtiles convert` to get the single-file PMTiles.
- Recommended offline stack: MapLibre GL JS (renderer) + Protomaps basemap PMTiles + self-hosted glyphs/sprites (token-free basemap) + deck.gl MapboxOverlay interleaved for points + @geoarrow/deck.gl-layers fed from DuckDB-WASM Arrow + supercluster-in-worker for clustering + h3-js for hexbin analytics + tippecanoe (build-time) for user-data tiling. Every piece is permissive-licensed, mature/trending, and runs with zero internet.

## Dependencies evaluated

| Package | Stars | Maintenance | License | Offline | Role / replaces | URL |
|---|---|---|---|---|---|---|
| `maplibre-gl` | 10.8k | Very active; v5.24.0 Apr 2026, 159 releases, ~14k commits, multi-maintainer org | BSD-3-Clause | yes | Core WebGL2 vector-tile map renderer; token-free, bring-your-own-tiles. The base map engine. | https://github.com/maplibre/maplibre-gl-js |
| `pmtiles` | 2.9k (protomaps/PMTiles) | Active; spec v3, BSD-3 reference impls, multi-language | BSD-3-Clause (spec CC0) | yes | Single-file tile archive + MapLibre addProtocol handler; serves tiles via range reads, no tile server. | https://github.com/protomaps/PMTiles |
| `@protomaps/basemaps` | 678 (protomaps/basemaps) | Active; planet + region PMTiles builds, themed style package | BSD-3 code / CC0 styles / ODbL tiles | yes | Token-free downloadable offline basemap PMTiles + MapLibre GL style themes (replaces Mapbox/MapTiler hosted basemaps). | https://github.com/protomaps/basemaps |
| `deck.gl` | 14.2k | Very active; v9.3.3 Jun 2026, MIT, vis.gl/OpenJS, multi-maintainer | MIT | yes | GPU layer framework for large point/line/polygon sets; overlays MapLibre via MapboxOverlay interleaved. WebGL2-first (WebGPU not yet prod). | https://github.com/visgl/deck.gl |
| `@geoarrow/deck.gl-layers` | 162 | Active; v0.4.1 May 2026, single-focus but current | MIT | yes | Zero-copy Apache Arrow -> GPU deck.gl layers for 3M-10M points; pairs with DuckDB-WASM Arrow output. | https://github.com/geoarrow/deck.gl-layers |
| `supercluster` | 2.3k | Stable/quiet; v8.0.1 (2023), ISC, battle-tested (powers Mapbox GL clustering) | ISC | yes | Zoom-reactive geospatial point clustering (millions of points in ms); run in a Web Worker. | https://github.com/mapbox/supercluster |
| `h3-js` | 1.1k | Active; v4.4.0 Dec 2025, Apache-2.0, Uber-maintained, WASM/emscripten | Apache-2.0 | yes | Hexagonal hierarchical spatial index for fixed-resolution hexbin density/aggregation and spatial joins (analytics, not clustering UX). | https://github.com/uber/h3-js |
| `tippecanoe (felt)` | 1.5k | Actively maintained by Felt; releases through Jul 2025 | BSD-2-Clause | yes | Build-time CLI: GeoJSON/CSV/FlatGeobuf -> MBTiles/PMTiles vector tiles. Run in Electron main / dev to tile user data locally. | https://github.com/felt/tippecanoe |
| `react-map-gl` | 8.4k (approx) | Active; vis.gl-maintained React wrapper, supports maplibre-gl | MIT | yes | Optional React/Next.js wrapper for MapLibre + deck.gl useControl integration. Use only if you want declarative React maps. | https://github.com/visgl/react-map-gl |

## Brief

# Offline Geospatial Mapping Tech-Radar Brief — data-navigator

**Scope:** A fully offline (no internet at runtime, no tokens, no SaaS) geospatial mapping + large-point-set visualization stack for a Next.js 16 + Electron desktop app, targeting medium-end PCs (4–8 cores, 8–16GB RAM, integrated/modest GPU, **WebGPU often unavailable**).

**Verdict up front:** The ecosystem has converged on a clean, permissive, offline-capable stack:

> **MapLibre GL JS** (renderer) + **PMTiles / Protomaps** (token-free offline basemap) + **deck.gl** (GPU point overlay, WebGL2) + **@geoarrow/deck.gl-layers** (Arrow zero-copy for million-point sets) + **supercluster** (clustering, in a worker) + **h3-js** (hexbin analytics) + **tippecanoe** (build-time tiling).

Every component is MIT/BSD/ISC/Apache-2.0, mature or strongly trending, and runs with zero network. This is not a speculative stack — it is what HOT (Humanitarian OpenStreetMap), Felt, and the Protomaps community ship in production offline today.

---

## 1. Base map renderer — MapLibre GL JS

**`maplibre-gl` — 10.8k★, BSD-3-Clause, v5.24.0 (Apr 2026), ~14k commits, 159 releases.** [repo](https://github.com/maplibre/maplibre-gl-js)

MapLibre is the open fork of Mapbox GL JS v1 (post-license-change) and is the only mature, **token-free**, fully client-side WebGL vector renderer. It is explicitly "bring your own tiles" — MapLibre hosts nothing, phones home to nothing. This is precisely the property you need.

**Why it fits the constraints:**
- **Offline:** No telemetry, no required network. Styles, tiles, glyphs, sprites can all be local files / `pmtiles://` / `file://` / a custom Electron protocol.
- **Medium-end GPU:** Renders via **WebGL2** at 60fps. WebGPU is on the roadmap but *not required* — the stable path is exactly the CPU/integrated-GPU-friendly one. Do **not** wait for or depend on WebGPU.
- **Bundle:** ~230kB gzip. Acceptable for a desktop app.

**Electron note:** MapLibre runs in the renderer (Chromium) without issue. The one gotcha is asset loading — see §3 (glyphs/sprites) and §2 (tile protocol).

**Optional React wrapper:** `react-map-gl` (vis.gl, 8.4k★, MIT) gives declarative `<Map>` + the `useControl` hook used to mount deck.gl. Optional — you can use plain `maplibre-gl` imperatively inside a React `useEffect` and skip the wrapper to cut a dependency. Given Next.js 16, if you already use imperative refs elsewhere, raw maplibre-gl is leaner.

---

## 2. Offline tiles — PMTiles (the cornerstone)

**`pmtiles` (protomaps/PMTiles) — 2.9k★, BSD-3 (spec CC0), v3, ~12–15kB gzip client.** [repo](https://github.com/protomaps/PMTiles)

PMTiles is a **single static file** containing an entire tile pyramid plus an embedded index. Any tile is located in **at most two range reads**, regardless of file size. There is **no tile server** — this is the key offline enabler. One `world.pmtiles` (or a region extract) sits on disk and MapLibre reads byte ranges from it.

### Wiring it into MapLibre

```ts
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile); // call ONCE per app lifecycle

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    glyphs: '/fonts/{fontstack}/{range}.pbf',   // LOCAL — see §3
    sprite: '/sprites/basemap',                  // LOCAL — see §3
    sources: {
      basemap: {
        type: 'vector',
        url: 'pmtiles:///tiles/world.pmtiles',   // local file in Electron
      },
    },
    layers: [/* protomaps style layers, see §3 */],
  },
});
```

### Offline storage choices (medium-end-friendly)

| Strategy | Where | Notes |
|---|---|---|
| **Electron custom protocol** | main process | `protocol.handle('app-tiles', …)` reads the .pmtiles from disk and serves HTTP-Range responses. Best for desktop: no copy into browser storage, near-native disk I/O, handles multi-GB files. **Recommended for data-navigator.** |
| **OPFS** (Origin Private File System) | renderer | `@makina-corpus/maplibre-offline-pmtiles` downloads + stores PMTiles in OPFS with near-native parse perf, far better than IndexedDB for large files. Good if you want a pure-renderer path. |
| **IndexedDB** | renderer | Works but worse for large files (memory churn). Avoid for multi-GB. |

For an Electron app, prefer the **custom protocol from main process** — it keeps multi-GB tile files off the renderer heap (critical on 8GB machines) and gives true random-access Range reads.

### Build-time: making PMTiles from user data

PMTiles are produced from MBTiles via `pmtiles convert`, and MBTiles from raw GeoJSON via **tippecanoe** (§6). This is a local build/Electron-main step — users tile their own uploaded CSV/GeoJSON with no cloud.

---

## 3. Token-free offline basemap — Protomaps Basemaps

**`protomaps/basemaps` — 678★, BSD-3 (code) / CC0 (styles) / ODbL (tiles).** [repo](https://github.com/protomaps/basemaps)

This is the **no-token basemap**. It provides:
1. **Downloadable PMTiles builds** — `planet.pmtiles` (~110–130GB) built from OSM + Natural Earth via Planetiler in ~2–3h, **or** tiny region extracts (e.g. `monaco.pmtiles` = a few MB) from [maps.protomaps.com](https://maps.protomaps.com). For data-navigator, ship region extracts the user selects, or let them build their own.
2. **`@protomaps/basemaps` npm styles package** — generates MapLibre GL style JSON in multiple themes (light/dark/white/grayscale/black), token-free, no Mapbox/MapTiler account.

```ts
import { layers, namedFlavor } from '@protomaps/basemaps';

const styleLayers = layers('basemap', namedFlavor('light'), { lang: 'en' });
// drop styleLayers into the `layers` array of the style object in §2
```

### CRITICAL offline gotcha — glyphs & sprites

The style JSON references **glyphs** (font `.pbf` ranges) and **sprites** (icon atlas) by URL, and MapLibre fetches them **at runtime**. The PMTiles/OPFS plugins do **not** intercept these. If you only handle tiles, your offline map will silently lose all text labels and POI icons.

**Fix:** bundle them locally and point the style at relative/protocol paths:
- Glyphs: vendor a font stack (e.g. Noto Sans) as `.pbf` ranges into `public/fonts/{fontstack}/{range}.pbf`. Protomaps publishes downloadable font bundles.
- Sprites: copy the Protomaps sprite `.json` + `.png` (and @2x) into `public/sprites/`.
- In Electron, serve these via the same custom protocol or `public/` so they resolve with no network.

This is the #1 thing teams forget when going offline. Verify by toggling devtools "Offline" and confirming labels still render.

---

## 4. Large point sets — deck.gl (GPU overlay, WebGL2)

**`deck.gl` — 14.2k★, MIT, v9.3.3 (Jun 2026), vis.gl/OpenJS.** [repo](https://github.com/visgl/deck.gl)

deck.gl is the GPU framework for big data viz. For data-navigator's "large point sets on medium-end PCs" requirement it is the right tool, with caveats.

### Performance reality on medium-end hardware
- `ScatterplotLayer` renders **~1M points at 60fps** on a decent GPU; **up to ~10M** with *small* radii.
- On **integrated GPUs**, budget conservatively: **~100k–500k points** for smooth pan/zoom; aggregate (clustering/hexbins) above that.
- **WebGL2-first.** deck.gl v9's WebGPU support is *explicitly not production-ready* and added layer-by-layer. This **matches your constraint perfectly** — ship the WebGL2 path, treat WebGPU as a future bonus. Some aggregation layers are WebGL2-only with WebGL1 fallback TBD, but WebGL2 is universally available in Electron's Chromium, so this is a non-issue for you.

### Integrating with MapLibre — interleaved MapboxOverlay

Use `MapboxOverlay({ interleaved: true })`. Interleaved mode renders deck.gl layers **into MapLibre's own WebGL2 context** (one canvas, correct depth ordering with map layers via `beforeId`). Requires `maplibre-gl@>=3` — you're on v5.

```ts
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from '@deck.gl/layers';

const overlay = new MapboxOverlay({
  interleaved: true,
  layers: [
    new ScatterplotLayer({
      id: 'points',
      data: points,            // prefer binary/Arrow — see §5
      getPosition: d => d.position,
      getRadius: 3,
      radiusUnits: 'pixels',
      getFillColor: [255, 100, 0, 180],
      // perf knobs for medium-end:
      parameters: { depthTest: false },
    }),
  ],
});
map.addControl(overlay);
```

**Overlaid vs interleaved:** overlaid (separate canvas on top) is slightly simpler and avoids depth/ordering surprises but can't interleave with map layers. For pure points-on-top, overlaid is fine and a hair lighter; use interleaved when points must sit between basemap layers (e.g. under labels).

---

## 5. The million-point unlock — Arrow / binary attributes

**`@geoarrow/deck.gl-layers` — 162★, MIT, v0.4.1 (May 2026).** [repo](https://github.com/geoarrow/deck.gl-layers)

The single biggest perf/memory win on medium-end hardware: **never feed deck.gl plain JS object arrays for big data.** Each `{lng, lat, …}` object is GC pressure and per-point accessor calls.

Instead pass **binary attributes** (typed arrays) or use `@geoarrow/deck.gl-layers`, which copies **Apache Arrow** column buffers **zero-copy** straight to the GPU — no intermediate JS representation, no GC overhead. Demonstrated at **3.2M points** (`GeoArrowScatterplotLayer`) and up to ~10M with small radii.

**Why this is perfect for data-navigator:** the repo already uses **DuckDB-WASM** (`src/core/queries/duckdb.ts`). DuckDB-WASM returns **Arrow** result batches natively. So the pipeline is:

```
CSV/Parquet/uploaded data
  → DuckDB-WASM (filter/aggregate in WASM, columnar)
  → Arrow Table (zero-copy)
  → @geoarrow/deck.gl-layers (zero-copy to GPU)
```

No row-materialization, no giant JS arrays, minimal heap — exactly what an 8GB machine needs. Do the heavy filtering/aggregation in DuckDB (SQL, WASM-SIMD), keep only what's on-screen in GPU buffers.

Alternatively, hand-build binary attributes:
```ts
new ScatterplotLayer({
  data: { length: n },
  getPosition: { value: positionsFloat32, size: 2 }, // Float32Array, zero-copy
  getFillColor: { value: colorsUint8, size: 4 },
});
```

---

## 6. Clustering & aggregation — supercluster + h3-js (complementary)

These solve **different** problems; use both.

### supercluster — zoom-reactive clustering UX
**`mapbox/supercluster` — 2.3k★, ISC, v8.0.1 (2023).** [repo](https://github.com/mapbox/supercluster)

Clusters **millions of points in milliseconds**, smooth cluster/uncluster on zoom. Stable and battle-tested (it powers Mapbox GL's clustering). The 2023 release is "done/quiet," not abandoned — the algorithm is mature and the API is frozen; this is acceptable for a mature dep.

**Medium-end rule: run it in a Web Worker.** Building the index and per-zoom `getClusters()` are CPU work that will jank the main thread on 4-core machines. Put supercluster in a worker, post cluster GeoJSON back, render clusters via a deck.gl `ScatterplotLayer`/`TextLayer` or a MapLibre symbol layer.

```ts
// worker.ts
import Supercluster from 'supercluster';
let index;
onmessage = (e) => {
  if (e.data.type === 'load') {
    index = new Supercluster({ radius: 60, maxZoom: 16 }).load(e.data.points);
  } else if (e.data.type === 'view') {
    postMessage(index.getClusters(e.data.bbox, e.data.zoom));
  }
};
```

### h3-js — hexbin density & spatial joins (analytics)
**`uber/h3-js` — 1.1k★, Apache-2.0, v4.4.0 (Dec 2025), WASM/emscripten.** [repo](https://github.com/uber/h3-js)

H3 is a hierarchical hexagonal index. Use it for **fixed-resolution aggregation**: bin millions of points into hex cells, count/sum per cell, render as `H3HexagonLayer` (deck.gl) or polygons. This is for **analytical density maps and spatial joins**, *not* zoom-reactive marker clustering.

Even better on medium-end: **do the hex binning in DuckDB**, not JS — DuckDB has H3 support (or compute cell IDs in SQL), so you aggregate to a few thousand hex cells columnar/in-WASM, then render those. h3-js is then only needed for cell→boundary geometry on the few visible cells.

```
points → DuckDB GROUP BY h3_cell → ~1000s of cells with counts → H3HexagonLayer
```

**Bottom line:** supercluster = interactive clustering UX; h3-js = analytical hexbin layer. They are not competitors. Pick supercluster when users expect "markers collapse into numbered bubbles"; pick h3 when users want a density heatmap-style choropleth.

---

## 7. Build-time tiling — tippecanoe

**`felt/tippecanoe` — 1.5k★, BSD-2-Clause, actively maintained by Felt (releases through Jul 2025).** [repo](https://github.com/felt/tippecanoe)

Tippecanoe converts large GeoJSON/CSV/FlatGeobuf into MBTiles/PMTiles vector tiles, producing a scale-independent view (it preserves density rather than dropping features). This is a **build/Electron-main CLI**, not a runtime dep — it doesn't get bundled.

For data-navigator: when a user uploads a large geospatial dataset, run tippecanoe in the **Electron main process** (it's a native binary) to tile it locally, then `pmtiles convert` to a single file the renderer can stream. Fully offline, no cloud tiling service.

```bash
tippecanoe -o data.mbtiles -zg --drop-densest-as-needed user-points.geojson
pmtiles convert data.mbtiles data.pmtiles
```

The original `mapbox/tippecanoe` is **deprecated** — use the **felt** fork (the actively maintained home, Erica Fischer / Felt).

---

## 8. Recommended architecture for data-navigator

```
┌─────────────────────────── Electron main (node) ───────────────────────────┐
│  • Custom protocol -> Range reads of *.pmtiles from disk (multi-GB safe)     │
│  • tippecanoe + pmtiles convert  (tile user-uploaded data, build-time)      │
│  • Vendored glyphs (.pbf) + sprites served locally                          │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                    │ Range / file responses
┌──────────────────────────── Renderer (Chromium) ───────────────────────────┐
│  MapLibre GL JS (WebGL2)                                                     │
│    └─ source: pmtiles:// Protomaps basemap  + @protomaps/basemaps style      │
│    └─ MapboxOverlay({interleaved:true})  ── deck.gl layers                   │
│         • @geoarrow/deck.gl-layers  ← Arrow from DuckDB-WASM (zero-copy)     │
│         • H3HexagonLayer            ← DuckDB GROUP BY h3 cell                 │
│  Web Worker: supercluster (cluster index + getClusters per zoom)            │
│  DuckDB-WASM: filter/aggregate (already in repo) → Arrow batches            │
│  OPFS: optional cache for downloaded region PMTiles                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Decision rules (what to render when)
| Point count (visible) | Strategy |
|---|---|
| < ~50k | deck.gl ScatterplotLayer, plain or binary — trivial |
| ~50k–500k | deck.gl + **binary/Arrow attributes** (mandatory on integrated GPU) |
| 500k–5M | deck.gl + **@geoarrow/deck.gl-layers** from DuckDB Arrow; small pixel radii |
| > 5M, or "show me density" | **supercluster** (worker) for marker UX, or **h3 hexbins via DuckDB** for density |
| any, "regions/heatmap" | DuckDB `GROUP BY h3_cell` → H3HexagonLayer (few thousand polys) |

### Memory & main-thread discipline (8GB target)
- Keep raw data in **DuckDB-WASM / OPFS / Arrow**, never in big JS arrays.
- Push filtering/aggregation into **DuckDB SQL** (WASM-SIMD), return only on-screen rows.
- **supercluster in a worker**, always.
- Stream PMTiles from **disk via Electron protocol**, not into the renderer heap.
- Prefer **overlaid** deck.gl unless layer interleaving is needed (marginally lighter).
- Cap deck.gl `getRadius` small; disable `pickable` on giant layers unless needed (picking allocates per-point id buffers).

---

## 9. Migration / adoption notes

1. **Add deps:** `maplibre-gl`, `pmtiles`, `@protomaps/basemaps`, `deck.gl` (or scoped `@deck.gl/core @deck.gl/layers @deck.gl/mapbox @deck.gl/geo-layers`), `@geoarrow/deck.gl-layers`, `supercluster`, `h3-js`. Dev/main-only: tippecanoe binary.
2. **Tree-shake deck.gl:** import scoped packages, not the umbrella `deck.gl`, to keep the bundle near ~250kB instead of ~400kB+.
3. **Vendor basemap assets first** (glyphs + sprites + a region PMTiles) and wire the local style — this is the offline-correctness gate. Test with devtools Offline.
4. **One `addProtocol('pmtiles', …)` call** at app init; never per-map.
5. **Bridge DuckDB → deck.gl via Arrow** — this is where the repo's existing DuckDB-WASM investment pays off; avoid `toArray()` row materialization.
6. **Workerize supercluster** before you have a perf problem; retrofitting later is painful.
7. **WebGPU:** do nothing. The WebGL2 path is the shipping path; revisit deck.gl WebGPU only when it's marked production-ready *and* you measure a need.

---

## 10. Risks / honest caveats
- **supercluster** v8.0.1 dates to 2023 — mature/frozen, not abandoned, but don't expect new features. Acceptable.
- **@geoarrow/deck.gl-layers** is the smallest dep (162★) and pre-1.0 (v0.4). It's the right tool and actively maintained (May 2026), but pin versions and keep a binary-attributes fallback (§5) that uses core deck.gl directly, so you're never blocked if it stalls.
- **Protomaps glyphs/sprites** are the classic offline failure mode — budget explicit QA for offline label/icon rendering.
- **Planet PMTiles is huge** (~110–130GB). For a desktop app, ship/region-extract on demand rather than the planet, or let users build their own with the Protomaps + Planetiler pipeline.
- **deck.gl on weak integrated GPUs**: 10M-point claims assume a real GPU. Validate your point-count tiers on a representative low-end machine (Intel UHD-class) before promising them.

## Sources
- https://github.com/maplibre/maplibre-gl-js
- https://github.com/protomaps/PMTiles
- https://github.com/protomaps/basemaps
- https://docs.protomaps.com/pmtiles/maplibre
- https://github.com/visgl/deck.gl • https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre • https://deck.gl/docs/developer-guide/performance
- https://github.com/geoarrow/deck.gl-layers
- https://github.com/mapbox/supercluster
- https://github.com/uber/h3-js
- https://github.com/felt/tippecanoe
- https://github.com/makinacorpus/maplibre-offline-pmtiles