/* ════════════════════════════════════════════════════════════════════════════
 *  §11 — L'ALMANACH · forecasting as the weather page
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The forecast rubrique is typeset like the météo page of a regional daily:
 *  a row of five day-cards with hand-inked sky glyphs, a large "planche météo"
 *  plate where ninety days of relevés hand over to a dashed projection inside
 *  a halftone confidence band, an éphémérides sidebar that parodies sunrise /
 *  sunset tables with the operator's real daily rhythm, and a seven-day
 *  échéancier whose ink literally pales past J+5 — the almanac admits doubt
 *  in print. Everything is computed on the device (augurs/ETS); the joke and
 *  the security promise are the same sentence.
 *
 *  Design intent
 *  ─────────────
 *  • The hero plate is ONE composed SVG (640×240): solid ink history (18 pts),
 *    vermilion dashed continuation (7 pts) anchored to the last relevé, and a
 *    press-blue halftone polygon for the 90 % band that fans out from "today".
 *    The band is drawn zero-width at the divider so uncertainty visibly GROWS —
 *    that is the editorial point of the whole page.
 *  • Day glyphs are margin doodles, not icon-font weather: wobbly InkPath
 *    suns, clouds and wind strokes. Failed-transaction "showers" fall in
 *    vermilion because red ink is the editor's, and failures are his beat.
 *  • Interactivity is one honest toggle (volume ⇄ taux de réussite) — real
 *    buttons, aria-pressed, the plate re-inks itself on swap.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.0 — TYPES
 * ──────────────────────────────────────────────────────────────────────────── */

type AlmanacTrend = "up" | "down";

type AlmanacGlyphId = "sun" | "cloudsun" | "cloud" | "rain" | "wind";

type AlmanacMoonPhase = "new" | "first" | "full" | "last";

type AlmanacSeriesId = "volume" | "reussite";

type AlmanacSeries = {
  id: AlmanacSeriesId;
  /** label on the plate toggle button */
  toggleLabel: string;
  /** unit line printed in the plate legend */
  unit: string;
  /** figure caption under the plate — newspaper convention, numbered */
  caption: string;
  /** fixed y-domain so the printed tick labels stay honest */
  yMin: number;
  yMax: number;
  ticks: ReadonlyArray<{ v: number; label: string }>;
  /** 18 daily relevés, Lun 26 mai → Jeu 12 juin (today, provisional) */
  history: ReadonlyArray<number>;
  /** 7 projected values, Ven 13 → Jeu 19 */
  forecast: ReadonlyArray<number>;
  lower: ReadonlyArray<number>;
  upper: ReadonlyArray<number>;
  /** annotation inked beside the last projected point */
  endNote: string;
};

type AlmanacDayForecast = {
  id: string;
  label: string;
  date: string;
  j: string;
  /** the parody saint's day — the almanac's oldest joke, kept alive */
  saint: string;
  glyph: AlmanacGlyphId;
  sky: string;
  volume: number;
  trend: AlmanacTrend;
  delta: string;
  band: string;
  /** last card spans two columns on the 360px grid so no orphan cell */
  wide: boolean;
};

type AlmanacEphemeride = {
  icon: typeof Sunrise;
  label: string;
  time: string;
  note: string;
};

type AlmanacMoonEntry = {
  phase: AlmanacMoonPhase;
  label: string;
  note: string;
  date: string;
};

type AlmanacHorizonEntry = {
  day: string;
  j: string;
  value: number;
  valueStr: string;
  lo: number;
  loStr: string;
  hi: number;
  hiStr: string;
  trend: AlmanacTrend;
  delta: string;
  /** rows past J+5 print in paled ink — the almanac's humility, typographic */
  faded: boolean;
};

type AlmanacModelEntry = {
  name: string;
  family: string;
  mape: string;
  verdict: string;
  retained: boolean;
  /** 12 residual points — the sparkline shows temperament, not triumph */
  residuals: ReadonlyArray<number>;
};

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.1 — DATA · relevés, projections, éphémérides
 *  Every figure is deterministic and cross-checked: day-card deltas are the
 *  true day-over-day percentages of the printed volumes, the Sunday dip in
 *  the corrections note matches the history series, and Mer 11 = 2 147 380
 *  is the same row count the masthead announces for DailyTransactions.csv.
 * ──────────────────────────────────────────────────────────────────────────── */

const ALMANAC_SERIES: Record<AlmanacSeriesId, AlmanacSeries> = {
  volume: {
    id: "volume",
    toggleLabel: "Volume",
    unit: "transactions / jour",
    caption: "Fig. 3 — Volume attendu, bande de confiance à 90 %",
    yMin: 1880000,
    yMax: 2320000,
    ticks: [
      { v: 1900000, label: "1,90 M" },
      { v: 2000000, label: "2,00 M" },
      { v: 2100000, label: "2,10 M" },
      { v: 2200000, label: "2,20 M" },
      { v: 2300000, label: "2,30 M" },
    ],
    // Lun 26 mai → Jeu 12 juin. Two weekend troughs, a steady drift upward,
    // and yesterday's CSV (2 147 380) sitting exactly where the masthead says.
    history: [
      2041930, 2068410, 2079260, 2102580, 2126340, 1968270, 1934580, 2057110, 2083640, 2096720,
      2121480, 2149860, 1989450, 1951210, 2088170, 2116090, 2147380, 2152840,
    ],
    forecast: [2184300, 2009800, 1973600, 2114500, 2138900, 2161200, 2187400],
    lower: [2146100, 1962600, 1917300, 2048400, 2061800, 2072100, 2085300],
    upper: [2222500, 2057000, 2029900, 2180600, 2216000, 2250300, 2289500],
    endNote: "≈ 2 187 k au 19 juin",
  },
  reussite: {
    id: "reussite",
    toggleLabel: "Taux de réussite",
    unit: "% de transactions réussies",
    caption: "Fig. 3 bis — Taux de réussite attendu, bande de confiance à 90 %",
    yMin: 95.4,
    yMax: 98.8,
    ticks: [
      { v: 96, label: "96 %" },
      { v: 97, label: "97 %" },
      { v: 98, label: "98 %" },
    ],
    // Success breathes against load: quiet Sundays clear the sky, busy
    // Fridays bring a little haze. Mer 11 = 97,4 % — the masthead figure.
    history: [
      97.1, 97.3, 97.2, 96.9, 96.6, 97.8, 97.9, 97.2, 97.0, 96.8, 96.7, 96.5, 97.7, 97.8, 97.1,
      96.9, 97.4, 97.3,
    ],
    forecast: [96.8, 97.9, 98.0, 97.2, 97.0, 96.9, 96.8],
    lower: [96.2, 97.4, 97.5, 96.5, 96.2, 96.0, 95.8],
    upper: [97.4, 98.4, 98.5, 97.9, 97.8, 97.8, 97.8],
    endNote: "≈ 96,8 % au 19 juin",
  },
};

const ALMANAC_SERIES_ORDER: ReadonlyArray<AlmanacSeriesId> = ["volume", "reussite"];

/** Dates printed along the plate's x-axis. Index 17 is today's divider. */
const ALMANAC_X_TICKS: ReadonlyArray<{ i: number; label: string }> = [
  { i: 0, label: "26 mai" },
  { i: 6, label: "1 juin" },
  { i: 12, label: "7 juin" },
  { i: 17, label: "12 juin" },
  { i: 21, label: "16 juin" },
  { i: 24, label: "19 juin" },
];

/** The five-day outlook row — Ven 13 → Mar 17, each with its parody saint. */
const ALMANAC_DAYS: ReadonlyArray<AlmanacDayForecast> = [
  {
    id: "ven13",
    label: "Ven",
    date: "13 juin",
    j: "J+1",
    saint: "St-Backup",
    glyph: "sun",
    sky: "Grand beau sur les canaux. Trafic dégagé toute la journée.",
    volume: 2184300,
    trend: "up",
    delta: "+1,5 %",
    band: "± 38 k",
    wide: false,
  },
  {
    id: "sam14",
    label: "Sam",
    date: "14 juin",
    j: "J+2",
    saint: "Ste-Réplique",
    glyph: "cloudsun",
    sky: "Voile de latence en matinée, dissipation vers midi.",
    volume: 2009800,
    trend: "down",
    delta: "−8,0 %",
    band: "± 47 k",
    wide: false,
  },
  {
    id: "dim15",
    label: "Dim",
    date: "15 juin",
    j: "J+3",
    saint: "St-Checksum",
    glyph: "cloud",
    sky: "Couvert — trafic au repos dominical, rien d'inquiétant.",
    volume: 1973600,
    trend: "down",
    delta: "−1,8 %",
    band: "± 56 k",
    wide: false,
  },
  {
    id: "lun16",
    label: "Lun",
    date: "16 juin",
    j: "J+4",
    saint: "Ste-Requête",
    glyph: "rain",
    sky: "Averses d'échecs isolées avant 9 h, à l'allumage des terminaux.",
    volume: 2114500,
    trend: "up",
    delta: "+7,1 %",
    band: "± 66 k",
    wide: false,
  },
  {
    id: "mar17",
    label: "Mar",
    date: "17 juin",
    j: "J+5",
    saint: "St-Rollback",
    glyph: "wind",
    sky: "Vent porteur sur les canaux mobiles, mer belle côté USSD.",
    volume: 2138900,
    trend: "up",
    delta: "+1,2 %",
    band: "± 77 k",
    wide: true,
  },
];

/** Sunrise/sunset, rewritten for a machine that never leaves the office. */
const ALMANAC_EPHEMERIDES: ReadonlyArray<AlmanacEphemeride> = [
  {
    icon: Database,
    label: "Compaction de la base",
    time: "00 h 05",
    note: "pendant que la ville dort, DuckDB range ses colonnes",
  },
  {
    icon: Sunrise,
    label: "Lever du flux",
    time: "06 h 12",
    note: "premiers paiements mobiles, cafés compris",
  },
  {
    icon: Store,
    label: "Ouverture des marchés",
    time: "08 h 00",
    note: "guichets, kiosques et distributeurs",
  },
  {
    icon: Coffee,
    label: "Creux méridien",
    time: "12 h 31",
    note: "le réseau déjeune aussi, −18 % sur tous les canaux",
  },
  {
    icon: Gauge,
    label: "Pic du trafic",
    time: "18 h 04",
    note: "heure de pointe — +34 % sur la moyenne du jour",
  },
  {
    icon: HardDrive,
    label: "Sauvegarde locale",
    time: "23 h 30",
    note: "coffre chiffré, aucun octet en voyage",
  },
  {
    icon: Sunset,
    label: "Coucher du flux",
    time: "23 h 47",
    note: "derniers SMS facturés, rideau",
  },
];

/** The data moon — the base waxes toward month-end, then someone purges. */
const ALMANAC_MOONS: ReadonlyArray<AlmanacMoonEntry> = [
  { phase: "full", label: "Pleine lune", note: "clôture mensuelle, la base déborde", date: "30 juin" },
  { phase: "last", label: "Dernier quartier", note: "audit des écarts", date: "7 juil." },
  { phase: "new", label: "Nouvelle lune", note: "purge des journaux", date: "14 juil." },
  { phase: "first", label: "Premier quartier", note: "revue de capacité", date: "21 juil." },
];

/** Seven days of ink — the échéancier behind the day-cards, bounds included. */
const ALMANAC_HORIZON: ReadonlyArray<AlmanacHorizonEntry> = [
  {
    day: "Ven 13",
    j: "J+1",
    value: 2184300,
    valueStr: "2 184 300",
    lo: 2146100,
    loStr: "2 146 100",
    hi: 2222500,
    hiStr: "2 222 500",
    trend: "up",
    delta: "+1,5 %",
    faded: false,
  },
  {
    day: "Sam 14",
    j: "J+2",
    value: 2009800,
    valueStr: "2 009 800",
    lo: 1962600,
    loStr: "1 962 600",
    hi: 2057000,
    hiStr: "2 057 000",
    trend: "down",
    delta: "−8,0 %",
    faded: false,
  },
  {
    day: "Dim 15",
    j: "J+3",
    value: 1973600,
    valueStr: "1 973 600",
    lo: 1917300,
    loStr: "1 917 300",
    hi: 2029900,
    hiStr: "2 029 900",
    trend: "down",
    delta: "−1,8 %",
    faded: false,
  },
  {
    day: "Lun 16",
    j: "J+4",
    value: 2114500,
    valueStr: "2 114 500",
    lo: 2048400,
    loStr: "2 048 400",
    hi: 2180600,
    hiStr: "2 180 600",
    trend: "up",
    delta: "+7,1 %",
    faded: false,
  },
  {
    day: "Mar 17",
    j: "J+5",
    value: 2138900,
    valueStr: "2 138 900",
    lo: 2061800,
    loStr: "2 061 800",
    hi: 2216000,
    hiStr: "2 216 000",
    trend: "up",
    delta: "+1,2 %",
    faded: false,
  },
  {
    day: "Mer 18",
    j: "J+6",
    value: 2161200,
    valueStr: "2 161 200",
    lo: 2072100,
    loStr: "2 072 100",
    hi: 2250300,
    hiStr: "2 250 300",
    trend: "up",
    delta: "+1,0 %",
    faded: true,
  },
  {
    day: "Jeu 19",
    j: "J+7",
    value: 2187400,
    valueStr: "2 187 400",
    lo: 2085300,
    loStr: "2 085 300",
    hi: 2289500,
    hiStr: "2 289 500",
    trend: "up",
    delta: "+1,2 %",
    faded: true,
  },
];

/** Shared scale bounds for the interval glyphs in the échéancier rows. */
const ALMANAC_HORIZON_MIN = 1917300;
const ALMANAC_HORIZON_MAX = 2289500;

/** Three augurs auditioned on 14 days of held-out relevés. One got the page. */
const ALMANAC_MODELS: ReadonlyArray<AlmanacModelEntry> = [
  {
    name: "Lissage exponentiel — ETS",
    family: "augurs · calculé sur l'appareil",
    mape: "2,8 %",
    verdict: "Retenu pour l'édition. Calme, ponctuel, n'invente rien.",
    retained: true,
    residuals: [0.4, -0.2, 0.3, -0.5, 0.1, 0.6, -0.3, 0.2, -0.1, 0.4, -0.4, 0.2],
  },
  {
    name: "Auto-régressif — AR(7)",
    family: "augurs · calculé sur l'appareil",
    mape: "3,4 %",
    verdict: "Solide en semaine, nerveux les lundis matin.",
    retained: false,
    residuals: [0.6, -0.8, 0.9, -0.4, 1.1, -0.6, 0.5, -1.0, 0.7, -0.3, 0.8, -0.5],
  },
  {
    name: "Naïve saisonnière",
    family: "témoin · même jour, semaine passée",
    mape: "5,1 %",
    verdict: "Recopie la semaine dernière et l'assume sans rougir.",
    retained: false,
    residuals: [1.2, -1.5, 0.8, -1.8, 1.4, -0.9, 1.6, -1.2, 0.9, -1.7, 1.3, -1.1],
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.2 — SKY GLYPHS · margin doodles, one stroke each
 *  Hand-wobbled paths, never icon-font geometry. The vermilion drops on the
 *  rain glyph are failed transactions — red ink belongs to the editor and to
 *  errors, and the météo page knows the difference is small.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Clear sky: a wobbly disc and eight quick rays, doodled in two strokes. */
function AlmanacGlyphSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath
        d="M24 13 C 30 12, 35 17, 35 23 C 35 30, 30 35, 24 35 C 17 35, 13 30, 13 24 C 13 17, 18 13, 26 13"
        strokeWidth={2.2}
        duration={0.7}
      />
      <InkPath
        d="M24 3 L24 8 M24 40 L24 45 M3 24 L8 24 M40 24 L45 24 M9 9 L12.5 12.5 M35.5 35.5 L39 39 M39 9 L35.5 12.5 M12.5 35.5 L9 39"
        strokeWidth={2}
        delay={0.45}
        duration={0.6}
      />
    </svg>
  );
}

/** Latency haze: a sliver of sun ducking behind a low cumulus. */
function AlmanacGlyphCloudSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath
        d="M29 7 C 34 7, 38 11, 38 16 M30 2 L30 5 M44 16 L41 16 M40 6 L37.5 8.5"
        strokeWidth={2}
        duration={0.5}
      />
      <InkPath
        d="M11 35 C 5 35, 4 27, 10 25 C 10 18, 20 16, 23 22 C 26 17, 35 19, 35 25 C 41 25, 42 34, 36 35 L11 35"
        strokeWidth={2.2}
        delay={0.35}
        duration={0.7}
      />
    </svg>
  );
}

/** Overcast: the Sunday cloud, drawn slow because nothing is happening. */
function AlmanacGlyphCloud({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath
        d="M11 31 C 5 31, 4 23, 10 21 C 10 14, 20 12, 23 18 C 26 13, 36 15, 36 21 C 42 21, 43 30, 37 31 L11 31"
        strokeWidth={2.2}
        duration={0.8}
      />
      <InkPath d="M15 37 L33 37" stroke={INK_FADED} strokeWidth={1.8} delay={0.6} duration={0.3} />
    </svg>
  );
}

/** Failure showers: ink cloud, vermilion drops. Brief, local, survivable. */
function AlmanacGlyphRain({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath
        d="M11 29 C 5 29, 4 21, 10 19 C 10 12, 20 10, 23 16 C 26 11, 36 13, 36 19 C 42 19, 43 28, 37 29 L11 29"
        strokeWidth={2.2}
        duration={0.7}
      />
      <InkPath
        d="M16 34 L13 41 M24 34 L21 41 M32 34 L29 41"
        stroke={VERMILION}
        strokeWidth={2.2}
        delay={0.55}
        duration={0.45}
      />
    </svg>
  );
}

/** Tailwind, the meteorological kind: three gusts with quick arrowheads. */
function AlmanacGlyphWind({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath d="M5 15 Q 22 11, 38 15 M38 15 L33 11 M38 15 L33 19" strokeWidth={2.1} duration={0.5} />
      <InkPath
        d="M5 25 Q 24 21, 43 25 M43 25 L38 21 M43 25 L38 29"
        strokeWidth={2.1}
        delay={0.2}
        duration={0.5}
      />
      <InkPath
        d="M8 35 Q 22 32, 33 35 M33 35 L29 32 M33 35 L29 38"
        strokeWidth={2.1}
        delay={0.4}
        duration={0.45}
      />
    </svg>
  );
}

const ALMANAC_GLYPHS = {
  sun: AlmanacGlyphSun,
  cloudsun: AlmanacGlyphCloudSun,
  cloud: AlmanacGlyphCloud,
  rain: AlmanacGlyphRain,
  wind: AlmanacGlyphWind,
} as const;

/** Moon phases set in plain print geometry — fill says it all. */
function AlmanacMoon({ phase, className }: { phase: AlmanacMoonPhase; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill={phase === "new" ? INK : "none"}
        stroke={INK}
        strokeWidth="1.6"
      />
      {phase === "first" && <path d="M12 3 A 9 9 0 0 1 12 21 Z" fill={INK} />}
      {phase === "last" && <path d="M12 3 A 9 9 0 0 0 12 21 Z" fill={INK} />}
      {phase === "full" && (
        <g fill={INK} fillOpacity="0.3">
          <circle cx="9" cy="9" r="1.3" />
          <circle cx="14.5" cy="13.5" r="1" />
          <circle cx="10.5" cy="15.5" r="0.8" />
        </g>
      )}
    </svg>
  );
}

/**
 * The bureau's weather vane — a hand-inked compass rose that drifts on
 * parallax beside the headline. Pure ornament, openly admitted: every
 * almanac keeps one instrument it no longer reads.
 */
function AlmanacVane({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <InkPath
        d="M60 14 C 86 15, 105 35, 104 60 C 103 87, 84 105, 59 104 C 34 103, 15 84, 16 59 C 17 33, 36 14, 62 14"
        strokeWidth={2}
        duration={1}
      />
      <InkPath d="M60 22 L60 38 M60 82 L60 98 M22 60 L38 60 M82 60 L98 60" strokeWidth={1.6} delay={0.5} duration={0.5} />
      {/* the needle settles north-north-east — toward Friday's peak */}
      <InkPath d="M48 76 L72 40 L66 70 Z" stroke={VERMILION} strokeWidth={2.2} delay={0.8} duration={0.6} />
      <text x="60" y="11" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
        N
      </text>
      <text x="60" y="117" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK_FADED}>
        S
      </text>
      <text x="113" y="64" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK_FADED}>
        E
      </text>
      <text x="7" y="64" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK_FADED}>
        O
      </text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.3 — THE PLANCHE MÉTÉO · one composed forecast plate
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * History (solid ink) hands over to projection (dashed vermilion) at a
 * dashed "AUJOURD'HUI" divider; the 90 % band fans out from that exact point
 * in press-blue halftone — InkArea's dot-screen, repurposed for uncertainty.
 * One SVG, fixed 640×240 viewBox, mono labels, hairline axes.
 */
function AlmanacChart({ series }: { series: AlmanacSeries }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[:]/g, "");
  const w = 640;
  const h = 240;
  const padL = 48;
  const padR = 18;
  const padT = 22;
  const padB = 30;
  const slots = series.history.length + series.forecast.length;

  const geom = useMemo(() => {
    const xAt = (i: number) => padL + (i * (w - padL - padR)) / (slots - 1);
    const yAt = (v: number) =>
      padT + (1 - (v - series.yMin) / (series.yMax - series.yMin)) * (h - padT - padB);
    const hPts = series.history.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const anchor = hPts[hPts.length - 1];
    const hIdx = series.history.length - 1;
    const fPts = series.forecast.map((v, i) => ({ x: xAt(hIdx + 1 + i), y: yAt(v) }));
    const upPts = series.upper.map((v, i) => ({ x: xAt(hIdx + 1 + i), y: yAt(v) }));
    const loPts = series.lower.map((v, i) => ({ x: xAt(hIdx + 1 + i), y: yAt(v) }));
    const seg = (pts: ReadonlyArray<{ x: number; y: number }>) =>
      pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const at = (p: { x: number; y: number }) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    const histD = inkPathFrom(hPts);
    const projD = `M${at(anchor)} ${seg(fPts)}`;
    // Band: out along the upper bound, back along the lower, closed at the
    // anchor — zero-width at today, widest at J+7. Uncertainty, drawn.
    const bandD = `M${at(anchor)} ${seg(upPts)} ${seg([...loPts].reverse())} Z`;
    const upperD = `M${at(anchor)} ${seg(upPts)}`;
    const lowerD = `M${at(anchor)} ${seg(loPts)}`;
    return { xAt, yAt, hPts, anchor, fPts, histD, projD, bandD, upperD, lowerD };
  }, [series, slots]);

  const fLast = geom.fPts[geom.fPts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" aria-hidden>
      <defs>
        {/* InkArea's halftone screen, re-cut in press blue for the band */}
        <pattern id={`alm-ht-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.15" fill={PRESS_BLUE} fillOpacity="0.32" />
        </pattern>
      </defs>

      {/* y gridlines + tick labels — fixed domain, honest ticks */}
      {series.ticks.map((t) => (
        <g key={`yt-${t.v}`}>
          <line
            x1={padL}
            y1={geom.yAt(t.v)}
            x2={w - padR}
            y2={geom.yAt(t.v)}
            stroke={RULE}
            strokeWidth="1"
          />
          <text
            x={padL - 7}
            y={geom.yAt(t.v) + 3}
            textAnchor="end"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill={INK_FADED}
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* baseline + x tick labels */}
      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke={INK} strokeWidth="1.5" />
      <line x1={padL} y1={padT - 4} x2={padL} y2={h - padB} stroke={RULE} strokeWidth="1" />
      {ALMANAC_X_TICKS.map((t) => (
        <g key={`xt-${t.i}`}>
          <line
            x1={geom.xAt(t.i)}
            y1={h - padB}
            x2={geom.xAt(t.i)}
            y2={h - padB + 4}
            stroke={INK_SOFT}
            strokeWidth="1.2"
          />
          <text
            x={geom.xAt(t.i)}
            y={h - padB + 15}
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill={INK_FADED}
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* the 90 % band — fades in after the projection has been inked */}
      <motion.path
        d={geom.bandD}
        fill={`url(#alm-ht-${uid})`}
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, delay: 1.5 }}
      />
      <InkPath d={geom.upperD} stroke={PRESS_BLUE} strokeWidth={1.1} dashed delay={1.35} duration={0.7} />
      <InkPath d={geom.lowerD} stroke={PRESS_BLUE} strokeWidth={1.1} dashed delay={1.45} duration={0.7} />

      {/* history — solid ink, 18 relevés */}
      <InkPath d={geom.histD} strokeWidth={2.2} duration={1.2} />

      {/* projection — dashed vermilion continuation from the last relevé */}
      <InkPath d={geom.projD} stroke={VERMILION} strokeWidth={2.2} dashed delay={1.05} duration={0.9} />

      {/* today's divider — where the typesetting stops and the augury starts */}
      <line
        x1={geom.anchor.x}
        y1={padT - 4}
        x2={geom.anchor.x}
        y2={h - padB}
        stroke={VERMILION}
        strokeWidth="1.2"
        strokeDasharray="3 5"
        opacity="0.75"
      />
      <text
        x={geom.anchor.x}
        y={padT - 10}
        textAnchor="middle"
        fontSize="8"
        letterSpacing="1.6"
        fontFamily="var(--font-grotesk)"
        fontWeight="700"
        fill={VERMILION}
      >
        AUJOURD&rsquo;HUI
      </text>
      {/* the provisional relevé — open circle: counted, not yet closed */}
      <circle cx={geom.anchor.x} cy={geom.anchor.y} r="3.2" fill={PAPER} stroke={INK} strokeWidth="2" />

      {/* projected points settle in one by one once the line is drawn */}
      {geom.fPts.map((p, i) => (
        <motion.circle
          key={`fp-${p.x.toFixed(1)}`}
          cx={p.x}
          cy={p.y}
          r="2.4"
          fill={VERMILION}
          initial={reduce ? false : { opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ delay: 1.25 + i * 0.09, duration: 0.3, ease: EASE_INK }}
          style={{ transformOrigin: `${p.x}px ${p.y}px` }}
        />
      ))}

      {/* terminal annotation — the editor rings where the week should land */}
      <motion.circle
        cx={fLast.x}
        cy={fLast.y}
        r="8"
        fill="none"
        stroke={VERMILION}
        strokeWidth="1.8"
        initial={reduce ? false : { opacity: 0, scale: 1.7 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ delay: 2, duration: 0.4, ease: EASE_INK }}
        style={{ transformOrigin: `${fLast.x}px ${fLast.y}px` }}
      />
      <text
        x={fLast.x - 12}
        y={fLast.y - 12}
        textAnchor="end"
        fontSize="9.5"
        fontFamily="var(--font-mono)"
        fontWeight="600"
        fill={INK}
      >
        {series.endNote}
      </text>
    </svg>
  );
}

/** Legend swatches drawn at print scale — solid, dashed, halftone block. */
function AlmanacLegendSwatch({ kind }: { kind: "solid" | "dashed" | "band" }) {
  return (
    <svg viewBox="0 0 26 10" className="h-2.5 w-[26px] shrink-0" aria-hidden>
      {kind === "solid" && <line x1="1" y1="5" x2="25" y2="5" stroke={INK} strokeWidth="2.2" />}
      {kind === "dashed" && (
        <line x1="1" y1="5" x2="25" y2="5" stroke={VERMILION} strokeWidth="2.2" strokeDasharray="5 4" />
      )}
      {kind === "band" && (
        <g>
          <rect x="1" y="1" width="24" height="8" fill="none" stroke={PRESS_BLUE} strokeWidth="0.8" strokeOpacity="0.6" />
          <circle cx="6" cy="4" r="1.1" fill={PRESS_BLUE} fillOpacity="0.4" />
          <circle cx="12" cy="7" r="1.1" fill={PRESS_BLUE} fillOpacity="0.4" />
          <circle cx="18" cy="4" r="1.1" fill={PRESS_BLUE} fillOpacity="0.4" />
        </g>
      )}
    </svg>
  );
}

/** Volume ⇄ réussite. Real buttons, pressed state inked solid. */
function AlmanacSeriesToggle({
  active,
  onSelect,
}: {
  active: AlmanacSeriesId;
  onSelect: (id: AlmanacSeriesId) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Choisir la série prévisionnelle"
      className="flex divide-x-2 divide-[#1c1914] border-2 border-[#1c1914]"
    >
      {ALMANAC_SERIES_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={active === id}
          onClick={() => onSelect(id)}
          className={`h-9 px-3 font-grotesk text-[11px] font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415] sm:px-4 ${
            active === id
              ? "bg-[#1c1914] text-[#f6f1e7]"
              : "bg-transparent text-[#4a4438] hover:bg-[#1c1914]/5"
          }`}
        >
          {ALMANAC_SERIES[id].toggleLabel}
        </button>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.4 — THE FIVE-DAY ROW · weather cards for transaction skies
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacDayCard({ day, index }: { day: AlmanacDayForecast; index: number }) {
  const Glyph = ALMANAC_GLYPHS[day.glyph];
  const rising = day.trend === "up";
  return (
    <SettleIn
      delay={index * 0.08}
      className={`h-full bg-[#f6f1e7] ${day.wide ? "col-span-2 sm:col-span-1" : ""}`}
    >
      <article className="flex h-full flex-col px-4 py-4 sm:px-5 sm:py-5">
        <header className="flex items-baseline justify-between gap-2">
          <h4 className="font-grotesk text-[13px] font-bold uppercase tracking-[0.14em] text-[#1c1914]">
            {day.label} <span className="font-semibold text-[#857c69]">{day.date}</span>
          </h4>
          <span className={T.folio}>{day.j}</span>
        </header>
        <p className="mt-0.5 font-serif text-[11.5px] italic leading-tight text-[#857c69]">
          {day.saint}
        </p>
        <div className="mt-3 flex items-start gap-3">
          <Glyph className="h-11 w-11 shrink-0" />
          <p className="font-serif text-[13px] italic leading-snug text-[#4a4438]">{day.sky}</p>
        </div>
        <div className="mt-auto pt-4">
          <div className="flex items-baseline gap-1.5">
            <CountUpInk end={day.volume} className="text-[17px] font-bold text-[#1c1914]" />
            <span className={T.folio}>tx</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className={`font-mono text-[12px] font-bold tabular-nums ${
                rising ? "text-[#2f6b3f]" : "text-[#bf3415]"
              }`}
            >
              {rising ? "▲" : "▼"} {day.delta}
            </span>
            <span className={T.folio}>I.C. 90 % {day.band}</span>
          </div>
        </div>
      </article>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.5 — ÉPHÉMÉRIDES · the operator's day, set like sunrise tables
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacEphemerideRow({ row }: { row: AlmanacEphemeride }) {
  const Icon = row.icon;
  return (
    <li className="px-4 py-2.5 sm:px-5">
      <div className="flex items-baseline gap-2.5">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-[#4a4438]" strokeWidth={1.8} />
        <span className="font-grotesk text-[12px] font-semibold uppercase tracking-[0.1em] text-[#1c1914]">
          {row.label}
        </span>
        {/* the dotted leader — the almanac's oldest piece of typography */}
        <span aria-hidden className="mx-1 flex-1 border-b border-dotted border-[#a89e8a]" />
        <span className="font-mono text-[13px] font-bold tabular-nums text-[#1c1914]">{row.time}</span>
      </div>
      <p className={`mt-0.5 pl-6 ${T.folio} normal-case tracking-normal`}>{row.note}</p>
    </li>
  );
}

function AlmanacEphemerides() {
  return (
    <SettleIn>
      <div className="border-2 border-[#1c1914] bg-[#eee6d6] shadow-[4px_4px_0_#1c1914]">
        <header className="border-b-2 border-[#1c1914] px-4 py-3 sm:px-5">
          <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.24em] text-[#1c1914]">
            Éphémérides des données
          </h3>
          <p className={`mt-1 ${T.folio} normal-case tracking-normal`}>
            heures locales — le PC ne change jamais de fuseau
          </p>
        </header>
        <ul className="divide-y divide-[#d6ccb6] py-1">
          {ALMANAC_EPHEMERIDES.map((row) => (
            <AlmanacEphemerideRow key={row.time} row={row} />
          ))}
        </ul>
        <footer className="border-t border-[#d6ccb6] px-4 py-3 sm:px-5">
          <p className="font-serif text-[12.5px] italic leading-snug text-[#4a4438]">
            Indice de fraîcheur du CSV&nbsp;: 9/10 — pressé ce matin, encore tiède à l&rsquo;ouverture.
          </p>
        </footer>
      </div>
    </SettleIn>
  );
}

/** The bureau's barometer — model confidence read like air pressure. */
function AlmanacBarometer() {
  return (
    <SettleIn delay={0.08}>
      <div className="border border-[#d6ccb6] bg-[#f6f1e7] px-4 py-4 sm:px-5">
        <h3 className={T.kicker}>Baromètre du modèle</h3>
        <div className="mt-2 flex items-center justify-center">
          <InkGauge value={90} label="confiance — 90 %" w={180} className="w-[180px] max-w-full" />
        </div>
        <dl className="mt-3 space-y-1.5 border-t border-[#d6ccb6] pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className={`${T.folio} normal-case tracking-[0.08em]`}>Pression réseau</dt>
            <dd className="font-mono text-[12px] font-semibold tabular-nums text-[#1c1914]">
              1 013 hPa — stable
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className={`${T.folio} normal-case tracking-[0.08em]`}>Visibilité</dt>
            <dd className="font-mono text-[12px] font-semibold tabular-nums text-[#1c1914]">
              7 jours, puis brume
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className={`${T.folio} normal-case tracking-[0.08em]`}>Houle des échecs</dt>
            <dd className="font-mono text-[12px] font-semibold tabular-nums text-[#1c1914]">
              2,6 % — mer belle
            </dd>
          </div>
        </dl>
      </div>
    </SettleIn>
  );
}

/** Lune des données — the base waxes and wanes with month-end. */
function AlmanacMoonStrip() {
  return (
    <SettleIn delay={0.14}>
      <div className="border border-[#d6ccb6] bg-[#f6f1e7] px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <Moon aria-hidden className="h-3.5 w-3.5 text-[#4a4438]" strokeWidth={1.8} />
          <h3 className={T.kicker}>Lune des données</h3>
        </div>
        <ul className="mt-3 space-y-2.5">
          {ALMANAC_MOONS.map((m) => (
            <li key={m.date} className="flex items-center gap-3">
              <AlmanacMoon phase={m.phase} className="h-6 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-grotesk text-[12px] font-semibold text-[#1c1914]">{m.label}</p>
                <p className={`${T.folio} normal-case tracking-normal`}>{m.note}</p>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[#857c69]">{m.date}</span>
            </li>
          ))}
        </ul>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.6 — L'ÉCHÉANCIER · seven days, bounds printed, ink that pales
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacHorizonRow({ row }: { row: AlmanacHorizonEntry }) {
  const rising = row.trend === "up";
  const span = ALMANAC_HORIZON_MAX - ALMANAC_HORIZON_MIN;
  const at = (v: number) => 4 + ((v - ALMANAC_HORIZON_MIN) / span) * 56;
  return (
    <tr className={`border-b border-[#d6ccb6] ${row.faded ? "text-[#857c69]" : "text-[#1c1914]"}`}>
      <th scope="row" className="py-2.5 pr-3 text-left font-grotesk text-[12.5px] font-bold uppercase tracking-[0.1em]">
        {row.day}{" "}
        <span className="font-mono text-[10px] font-normal tracking-[0.08em] text-[#857c69]">
          {row.j}
          {row.faded ? " *" : ""}
        </span>
      </th>
      <td className="py-2.5 pr-3 text-right font-mono text-[13px] font-bold tabular-nums">
        {row.valueStr}
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-[12px] tabular-nums md:table-cell">
        {row.loStr}
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-[12px] tabular-nums md:table-cell">
        {row.hiStr}
      </td>
      <td
        className={`py-2.5 pr-3 text-right font-mono text-[12px] font-bold tabular-nums ${
          row.faded ? "" : rising ? "text-[#2f6b3f]" : "text-[#bf3415]"
        }`}
      >
        {rising ? "▲" : "▼"} {row.delta}
      </td>
      <td className="py-2.5 text-right">
        {/* the interval, drawn: hairline track, blue band, vermilion point */}
        <svg viewBox="0 0 64 10" className="ml-auto h-2.5 w-16" aria-hidden>
          <line x1="4" y1="5" x2="60" y2="5" stroke={RULE} strokeWidth="1" />
          <line
            x1={at(row.lo)}
            y1="5"
            x2={at(row.hi)}
            y2="5"
            stroke={row.faded ? INK_FADED : PRESS_BLUE}
            strokeWidth="3"
            strokeOpacity={row.faded ? 0.55 : 0.8}
          />
          <circle cx={at(row.value)} cy="5" r="2.2" fill={row.faded ? INK_FADED : VERMILION} />
        </svg>
      </td>
    </tr>
  );
}

function AlmanacHorizonTable() {
  return (
    <SettleIn>
      <div className="border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <CalendarDays aria-hidden className="h-4 w-4 text-[#4a4438]" strokeWidth={1.8} />
            <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.24em] text-[#1c1914]">
              L&rsquo;échéancier — sept jours d&rsquo;encre
            </h3>
          </div>
          <span className={T.folio}>volume — transactions / jour</span>
        </header>
        <div className="overflow-x-auto px-4 sm:px-6">
          <table className="w-full min-w-[520px] border-collapse">
            <caption className="sr-only">
              Prévision de volume à sept jours avec bornes de confiance à 90 %
            </caption>
            <thead>
              <tr className="border-b-2 border-[#1c1914]">
                <th scope="col" className={`py-2.5 pr-3 text-left ${T.folio}`}>
                  Jour
                </th>
                <th scope="col" className={`py-2.5 pr-3 text-right ${T.folio}`}>
                  Prévu
                </th>
                <th scope="col" className={`hidden py-2.5 pr-3 text-right md:table-cell ${T.folio}`}>
                  Borne basse
                </th>
                <th scope="col" className={`hidden py-2.5 pr-3 text-right md:table-cell ${T.folio}`}>
                  Borne haute
                </th>
                <th scope="col" className={`py-2.5 pr-3 text-right ${T.folio}`}>
                  Tendance
                </th>
                <th scope="col" className={`py-2.5 text-right ${T.folio}`}>
                  Intervalle
                </th>
              </tr>
            </thead>
            <tbody>
              {ALMANAC_HORIZON.map((row) => (
                <AlmanacHorizonRow key={row.j} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <footer className="px-4 py-3 sm:px-6">
          <p className={`${T.folio} normal-case tracking-normal`}>
            * au-delà de J+5, l&rsquo;encre pâlit volontairement&nbsp;: la bande s&rsquo;élargit, la
            certitude se retire sur la pointe des pieds.
          </p>
        </footer>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.7 — LES AUGURES · three models auditioned, one printed
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacModelCard({ model, index }: { model: AlmanacModelEntry; index: number }) {
  return (
    <SettleIn delay={index * 0.1} className="h-full">
      <article
        className={`relative flex h-full flex-col border-2 bg-[#f6f1e7] px-5 py-5 ${
          model.retained
            ? "border-[#1c1914] shadow-[4px_4px_0_#1c1914]"
            : "border-[#d6ccb6]"
        }`}
      >
        {model.retained && (
          <div className="absolute -top-3 right-4">
            <Stamp color={STAMP_GREEN} tilt={6}>
              Retenu
            </Stamp>
          </div>
        )}
        <h4 className="font-serif text-[19px] font-semibold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
          {model.name}
        </h4>
        <p className={`mt-1 ${T.folio} normal-case tracking-[0.06em]`}>{model.family}</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[26px] font-bold tabular-nums leading-none text-[#1c1914]">
              {model.mape}
            </span>
            <span className={`mt-1 block ${T.folio}`}>MAPE — 14 jours témoins</span>
          </div>
          {/* residual temperament: flat is virtue, jitter is gossip */}
          <div className="h-10 w-28 shrink-0">
            <InkLine
              data={model.residuals}
              w={112}
              h={40}
              stroke={model.retained ? INK : INK_FADED}
              duration={0.9}
            />
          </div>
        </div>
        <p className="mt-4 border-t border-[#d6ccb6] pt-3 font-serif text-[13.5px] italic leading-snug text-[#4a4438]">
          {model.verdict}
        </p>
      </article>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.8 — NOTICES · the gale warning and the note de méthode
 * ──────────────────────────────────────────────────────────────────────────── */

/** Storm notice — the only box on the page allowed to raise its voice. */
function AlmanacNotice() {
  return (
    <SettleIn>
      <aside className="border-2 border-[#bf3415] bg-[#f6f1e7] px-5 py-4 shadow-[4px_4px_0_#bf3415]">
        <div className="flex flex-wrap items-center gap-3">
          <Stamp tilt={-5}>Avis</Stamp>
          <p className="font-serif text-[14.5px] leading-snug text-[#1c1914]">
            <strong className="font-semibold">Avis au lectorat —</strong> grains d&rsquo;échecs
            probables lundi 16 entre 8 h et 9 h sur le canal USSD, à l&rsquo;allumage des terminaux.
            L&rsquo;éditeur recommande un café avant d&rsquo;ouvrir le tableau de bord.
          </p>
        </div>
      </aside>
    </SettleIn>
  );
}

/** Note de méthode — the security promise, filed as a weather footnote. */
function AlmanacMethodNote() {
  return (
    <SettleIn>
      <aside className="border-l-[3px] border-[#bf3415] bg-[#eee6d6] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Sigma aria-hidden className="h-3.5 w-3.5 text-[#4a4438]" strokeWidth={1.8} />
          <h3 className={T.kicker}>Note de méthode — n° 12</h3>
        </div>
        <p className="mt-2 font-serif text-[15px] leading-relaxed text-[#1c1914]">
          Prévisions calculées sur l&rsquo;appareil (augurs/ETS) — la météo, elle, vient toujours du
          ciel.
        </p>
        <p className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${T.folio} normal-case`}>
          <Cpu aria-hidden className="h-3 w-3" strokeWidth={1.8} />
          <span>
            fenêtre 90 jours · saisonnalité hebdomadaire · MAPE 14 j&nbsp;: 2,8 % · 0 octet transmis
            · 0 antenne consultée
          </span>
        </p>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.9 — THE SECTION · l'almanach, page 9 of The Daily Edition
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacSection() {
  const [seriesId, setSeriesId] = useState<AlmanacSeriesId>("volume");
  const reduce = useReducedMotion();
  const series = ALMANAC_SERIES[seriesId];

  return (
    <section
      id="almanac"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3500px" }}
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
        <SectionMast rubrique="L'Almanach — Prévisions" no="P. 9" />

        {/* ── headline block — the bureau introduces tomorrow ─────────────── */}
        <div className="relative mt-12 sm:mt-16">
          {/* the vane drifts in the wide margin; hidden where there is none */}
          <Parallax
            speed={34}
            rotate={5}
            className="pointer-events-none absolute -top-6 right-0 hidden w-36 opacity-80 xl:block"
          >
            <AlmanacVane className="h-auto w-full" />
          </Parallax>

          <div className="max-w-3xl">
            <SettleIn>
              <p className={`${T.kicker} flex items-center gap-2 text-[#bf3415]`}>
                <CloudSun aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                Rubrique météo — bulletin émis hier à 23 h 41, valable sept jours
              </p>
            </SettleIn>
            <DeckReveal
              className="mt-4"
              lines={[
                <span
                  key="l1"
                  className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  Tomorrow&rsquo;s traffic,
                </span>,
                <span
                  key="l2"
                  className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  set in <PenUnderline delay={0.7}>ink tonight</PenUnderline>
                </span>,
              ]}
            />
            <SettleIn delay={0.2}>
              <p className={`mt-6 max-w-2xl ${T.body}`}>
                A five-day outlook for the transaction sky, drawn from ninety days of relevés by a
                model that lives on your machine. The almanac works in airplane mode; the weather
                does not.
              </p>
            </SettleIn>
            <SettleIn delay={0.3} className="mt-5">
              <Byline name="Le Prévisionniste" desk="Bureau des modèles · colonne météo" />
              <p className="mt-1.5 font-mono text-[11px] tracking-[0.06em] text-[#857c69]">
                <TypeOn text="bulletin composé hors ligne — antenne facultative, encre obligatoire" speed={22} />
              </p>
            </SettleIn>
          </div>
        </div>

        {/* ── the five-day row ─────────────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16">
          <DoubleRule />
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className={T.kicker}>Prévisions — cinq prochains jours</h3>
            <span className={T.folio}>volume attendu par jour · intervalle à 90 %</span>
          </div>
          {/* hairline-grid: gap-px over a rule-coloured ground reads as
              column rules, exactly how a météo strip is ruled in print */}
          <div className="mt-4 grid grid-cols-2 gap-px border-2 border-[#1c1914] bg-[#d6ccb6] sm:grid-cols-5">
            {ALMANAC_DAYS.map((day, i) => (
              <AlmanacDayCard key={day.id} day={day} index={i} />
            ))}
          </div>
        </div>

        {/* ── plate + sidebar ──────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-10 sm:mt-16 lg:grid-cols-[1fr_320px] lg:gap-12">
          <div className="min-w-0">
            <SettleIn>
              <figure className="relative border-2 border-[#1c1914] bg-[#eee6d6] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
                {/* registration marks — the plate was proofed before printing */}
                <span aria-hidden className="pointer-events-none absolute -left-2 -top-2 h-4 w-4 border-l-2 border-t-2 border-[#1c1914]" />
                <span aria-hidden className="pointer-events-none absolute -right-2 -top-2 h-4 w-4 border-r-2 border-t-2 border-[#1c1914]" />
                <span aria-hidden className="pointer-events-none absolute -bottom-2 -left-2 h-4 w-4 border-b-2 border-l-2 border-[#1c1914]" />
                <span aria-hidden className="pointer-events-none absolute -bottom-2 -right-2 h-4 w-4 border-b-2 border-r-2 border-[#1c1914]" />

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b-2 border-[#1c1914] px-4 py-3 sm:px-6">
                  <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.24em] text-[#1c1914]">
                    Planche météo — prévision à 7 jours
                  </h3>
                  <AlmanacSeriesToggle active={seriesId} onSelect={setSeriesId} />
                </div>

                <div className="px-3 pb-2 pt-4 sm:px-5">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={series.id}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.35, ease: EASE_INK }}
                    >
                      <AlmanacChart series={series} />
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#d6ccb6] px-4 py-3 sm:px-6">
                  <span className="flex items-center gap-2">
                    <AlmanacLegendSwatch kind="solid" />
                    <span className={`${T.folio} normal-case tracking-[0.05em]`}>
                      relevé — 18 derniers jours
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <AlmanacLegendSwatch kind="dashed" />
                    <span className={`${T.folio} normal-case tracking-[0.05em]`}>
                      prévision ETS — 7 jours
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <AlmanacLegendSwatch kind="band" />
                    <span className={`${T.folio} normal-case tracking-[0.05em]`}>
                      bande de confiance à 90 %
                    </span>
                  </span>
                  <span className={`ml-auto ${T.folio}`}>{series.unit}</span>
                </div>

                <figcaption className="border-t-2 border-[#1c1914] px-4 py-3 sm:px-6">
                  <span className="font-serif text-[13.5px] italic text-[#4a4438]">
                    {series.caption}.
                  </span>{" "}
                  <span className="font-serif text-[13.5px] italic text-[#857c69]">
                    Le creux du dimanche n&rsquo;est pas une erreur&nbsp;; c&rsquo;est un dimanche.
                  </span>
                </figcaption>
              </figure>
            </SettleIn>

            {/* the editor's pencil hangs in the margin beside the band */}
            <div className="relative">
              <MarginNote className="mt-5 lg:absolute lg:-right-2 lg:top-4 lg:mt-0 xl:-right-8">
                past day five the ink admits doubt — the band widens on purpose.
              </MarginNote>
            </div>

            {/* ── the almanac column proper ──────────────────────────────── */}
            <div className="mt-10 max-w-2xl lg:pr-40 xl:pr-32">
              <SettleIn>
                <DropCapParagraph>
                  The almanac does not guess; it extrapolates with manners. Each evening the model
                  rereads ninety days of relevés, shakes them through an exponential smoother, and
                  prints Friday before Friday has formed an opinion. Saints du jour&nbsp;:
                  Saint-Backup et Sainte-Réplique. Expect clear traffic into the weekend, the usual
                  Sunday lull — observed forty-three times now, no longer considered dramatic — and
                  a Monday rebound brisk enough to deserve its own column. Plan the coffee
                  accordingly.
                </DropCapParagraph>
              </SettleIn>
              <PullQuote className="mt-8" cite="Dicton du bureau des prévisions, vérifié sur 90 jours">
                Rouge le soir, tableau plein d&rsquo;espoir&nbsp;; rouge le matin, incident en
                chemin.
              </PullQuote>
            </div>
          </div>

          {/* ── sidebar — éphémérides, baromètre, lune ─────────────────────── */}
          <aside className="space-y-6">
            <AlmanacEphemerides />
            <AlmanacBarometer />
            <AlmanacMoonStrip />
          </aside>
        </div>

        {/* ── échéancier + gale warning ────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16">
          <AlmanacHorizonTable />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
            <SettleIn delay={0.1}>
              <p className="max-w-xl font-serif text-[13px] italic leading-relaxed text-[#857c69]">
                Correction — l&rsquo;almanach du 5 juin annonçait 1 952 000 relevés pour le dimanche
                8&nbsp;; il en est tombé 1 951 210. L&rsquo;écart (0,04 %) a été archivé sans
                commentaire.
              </p>
            </SettleIn>
            <AlmanacNotice />
          </div>
        </div>

        {/* ── the audition of the augurs ───────────────────────────────────── */}
        <div className="mt-12 sm:mt-16">
          <Rule />
          <SettleIn className="mt-8">
            <h3 className="max-w-2xl font-serif text-[clamp(1.5rem,3vw,2.1rem)] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Three augurs auditioned. One made the page.
            </h3>
            <p className={`mt-3 max-w-2xl ${T.ui}`}>
              Every candidate trains on the same ninety days and answers for fourteen held-out
              mornings. Lowest mean error gets the column; the others wait politely in the
              margins, recomputed nightly in case the winner grows complacent.
            </p>
          </SettleIn>
          <div className="mt-8 grid gap-6 md:grid-cols-3 md:gap-5">
            {ALMANAC_MODELS.map((model, i) => (
              <AlmanacModelCard key={model.name} model={model} index={i} />
            ))}
          </div>
        </div>

        {/* ── note de méthode + folio ──────────────────────────────────────── */}
        <div className="mt-12 sm:mt-14">
          <AlmanacMethodNote />
        </div>

        <Rule className="mt-12" />
        <FolioLine className="mt-4" page="P. 9" note="Rubrique météo — aucune antenne consultée" />
      </div>
    </section>
  );
}
