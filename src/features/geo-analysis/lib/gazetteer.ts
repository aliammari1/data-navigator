/**
 * Offline Tunisia gazetteer.
 *
 * Maps governorate / region names to their geographic centroids so region
 * aggregates coming out of DuckDB can be plotted on the map without any network
 * geocoding. Coordinates are static reference data (governorate centroids), NOT
 * fabricated metrics — every transaction/revenue/success number is computed from
 * the real dataset in SQL. The gazetteer only answers "where is this region?".
 *
 * Matching is fuzzy (via fuse.js) and accent/case-insensitive so that values
 * such as "TUNIS", "Grand Tunis", "tunis-ville" or "Béja"/"Beja" all resolve to
 * the right centroid. Unmatched regions still surface in every list/heatmap;
 * they are simply omitted from the spatial layer.
 */

import Fuse from "fuse.js";

export interface GazetteerEntry {
  /** Canonical governorate name. */
  name: string;
  lat: number;
  lon: number;
  /** Alternative spellings / French + Arabic transliterations used for matching. */
  aliases: string[];
}

/** Geographic centre of Tunisia, used as the default map view. */
export const TUNISIA_CENTER = { lat: 33.8869, lon: 9.5375, zoom: 7 } as const;

/**
 * 24 Tunisian governorate centroids. Static reference geometry only.
 */
export const TUNISIA_GAZETTEER: GazetteerEntry[] = [
  {
    name: "Tunis",
    lat: 36.8065,
    lon: 10.1815,
    aliases: ["grand tunis", "tunis ville", "tunis-ville", "تونس"],
  },
  { name: "Ariana", lat: 36.8665, lon: 10.1647, aliases: ["aryanah", "أريانة"] },
  { name: "Ben Arous", lat: 36.7444, lon: 10.2336, aliases: ["ben-arous", "bin arus", "بن عروس"] },
  { name: "Manouba", lat: 36.8095, lon: 10.0968, aliases: ["la manouba", "manuba", "منوبة"] },
  { name: "Nabeul", lat: 36.4516, lon: 10.7378, aliases: ["nabul", "cap bon", "نابل"] },
  { name: "Zaghouan", lat: 36.4029, lon: 10.1429, aliases: ["zaghwan", "زغوان"] },
  { name: "Bizerte", lat: 37.2746, lon: 9.8739, aliases: ["banzart", "بنزرت"] },
  { name: "Béja", lat: 36.7256, lon: 9.1817, aliases: ["beja", "bajah", "باجة"] },
  { name: "Jendouba", lat: 36.5011, lon: 8.7757, aliases: ["jundubah", "جندوبة"] },
  { name: "Le Kef", lat: 36.1826, lon: 8.7149, aliases: ["kef", "el kef", "al kaf", "الكاف"] },
  { name: "Siliana", lat: 36.0844, lon: 9.3708, aliases: ["silyanah", "سليانة"] },
  { name: "Kairouan", lat: 35.6781, lon: 10.0969, aliases: ["qayrawan", "القيروان"] },
  { name: "Kasserine", lat: 35.1676, lon: 8.8365, aliases: ["al qasrayn", "القصرين"] },
  {
    name: "Sidi Bouzid",
    lat: 35.0382,
    lon: 9.4849,
    aliases: ["sidi-bouzid", "sidi bu zayd", "سيدي بوزيد"],
  },
  { name: "Sousse", lat: 35.8245, lon: 10.6346, aliases: ["susah", "سوسة"] },
  { name: "Monastir", lat: 35.7643, lon: 10.8113, aliases: ["al munastir", "المنستير"] },
  { name: "Mahdia", lat: 35.5047, lon: 11.0622, aliases: ["al mahdiyah", "المهدية"] },
  { name: "Sfax", lat: 34.7406, lon: 10.7603, aliases: ["safaqis", "صفاقس"] },
  { name: "Gafsa", lat: 34.425, lon: 8.7842, aliases: ["qafsah", "قفصة"] },
  { name: "Tozeur", lat: 33.9197, lon: 8.1335, aliases: ["tawzar", "توزر"] },
  { name: "Kebili", lat: 33.7058, lon: 8.9702, aliases: ["kbili", "qibili", "قبلي"] },
  { name: "Gabès", lat: 33.8833, lon: 10.1167, aliases: ["gabes", "qabis", "قابس"] },
  { name: "Medenine", lat: 33.3549, lon: 10.5055, aliases: ["madanin", "مدنين"] },
  { name: "Tataouine", lat: 32.9302, lon: 10.4517, aliases: ["tatawin", "تطاوين"] },
];

interface SearchRecord {
  entry: GazetteerEntry;
  term: string;
}

/** Strip accents and lowercase for stable fuzzy matching. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Build one searchable record per name + alias so Fuse can match either.
const searchRecords: SearchRecord[] = TUNISIA_GAZETTEER.flatMap((entry) => [
  { entry, term: normalize(entry.name) },
  ...entry.aliases.map((alias) => ({ entry, term: normalize(alias) })),
]);

const fuse = new Fuse(searchRecords, {
  keys: ["term"],
  threshold: 0.34,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

// Exact-match fast path keyed on the normalized term.
const exactIndex = new Map<string, GazetteerEntry>();
for (const record of searchRecords) {
  if (!exactIndex.has(record.term)) exactIndex.set(record.term, record.entry);
}

export interface GeocodeHit {
  lat: number;
  lon: number;
  /** Canonical gazetteer name that matched. */
  matched: string;
}

/**
 * Resolve a raw region label to a centroid. Returns null when no governorate
 * matches confidently — callers keep the region in tabular views and only skip
 * it on the spatial layer.
 */
export function geocodeRegion(raw: string): GeocodeHit | null {
  const term = normalize(raw);
  if (!term) return null;

  const exact = exactIndex.get(term);
  if (exact) return { lat: exact.lat, lon: exact.lon, matched: exact.name };

  // Try a contained-token match before fuzzy search (e.g. "Agence Tunis Centre").
  for (const record of searchRecords) {
    if (term.includes(record.term) && record.term.length >= 4) {
      return { lat: record.entry.lat, lon: record.entry.lon, matched: record.entry.name };
    }
  }

  const [best] = fuse.search(term, { limit: 1 });
  if (best && (best.score ?? 1) <= 0.34) {
    return {
      lat: best.item.entry.lat,
      lon: best.item.entry.lon,
      matched: best.item.entry.name,
    };
  }

  return null;
}
