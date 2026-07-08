"use client";

/**
 * Self-hosted MapLibre style builder.
 *
 * Every asset URL is relative / same-origin (served from `public/maps`), so the
 * basemap renders fully offline: tiles via the bundled `pmtiles://` archive,
 * glyphs from self-hosted `.pbf` fontstacks, sprites from self-hosted PNG/JSON.
 * NOTHING points at protomaps.github.io or any CDN — that would both break
 * offline and be blocked by the renderer's COEP policy.
 */

import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";
import { BASEMAP_PMTILES_URL } from "./pmtiles-protocol";

const SOURCE = "protomaps";

export function buildLocalStyle(theme: "light" | "dark" = "light"): StyleSpecification {
  return {
    version: 8,
    // Self-hosted, same-origin. Never a CDN.
    glyphs: "/maps/fonts/{fontstack}/{range}.pbf",
    sprite: `/maps/sprites/${theme}`,
    sources: {
      [SOURCE]: {
        type: "vector",
        url: `pmtiles://${BASEMAP_PMTILES_URL}`,
      },
    },
    layers: layers(SOURCE, namedFlavor(theme), { lang: "en" }),
  };
}
